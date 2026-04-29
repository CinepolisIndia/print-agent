import axios from "axios";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { HealthCheckResult, CheckDetail } from "../types/print.types";
import {
  canUseNativeUsbDriver,
  checkUsbPrinterAvailableViaWindows,
  createConfiguredPrinter,
  getUsbPrinterNameFromInterface,
  isUsbPrinterConnected,
  normalizePrinterMode
} from "../printer/epsonPrinter";

// ─── Individual checks ───────────────────────────────────────────────

async function checkPrinter(): Promise<CheckDetail> {
  const start = Date.now();
  try {
    const mode = normalizePrinterMode(config.printer?.type);
    if (!mode) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        message: `Invalid printer.type "${config.printer?.type}" (expected "ip" or "usb"; legacy "epson" accepted as IP)`,
        latencyMs
      };
    }
    if (mode === "usb" && !canUseNativeUsbDriver()) {
      const printerName = getUsbPrinterNameFromInterface(config.printer.interface);
      const spoolerAvailable = await checkUsbPrinterAvailableViaWindows(printerName);
      if (!spoolerAvailable) {
        const latencyMs = Date.now() - start;
        return {
          ok: false,
          message: `USB printer "${printerName}" not found in Windows printers`,
          latencyMs
        };
      }

      const usbConnected = await isUsbPrinterConnected(printerName);
      if (!usbConnected) {
        const latencyMs = Date.now() - start;
        return {
          ok: false,
          message: `USB printer "${printerName}" is physically disconnected`,
          latencyMs
        };
      }

      const latencyMs = Date.now() - start;
      return {
        ok: true,
        message: `Printer reachable in USB mode via Windows spooler (${printerName})`,
        latencyMs
      };
    }

    const { printer, mode: printerMode } = createConfiguredPrinter();
    const connected = await printer.isPrinterConnected();
    const latencyMs = Date.now() - start;

    return connected
      ? {
          ok: true,
          message: `Printer reachable in ${printerMode.toUpperCase()} mode at ${config.printer.interface}`,
          latencyMs
        }
      : {
          ok: false,
          message: `Printer not responding in ${printerMode.toUpperCase()} mode at ${config.printer.interface}`,
          latencyMs
        };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Printer check error: ${msg}`, latencyMs };
  }
}

async function checkBackend(): Promise<CheckDetail> {
  const start = Date.now();
  try {
    const url = `${config.backendUrl}${config.sseEndpoint}?external_id=${config.externalId}`;
    // A simple HEAD/GET to confirm the backend is reachable
    await axios.get(url, {
      timeout: 5000,
      // SSE endpoint will stream; we only need the initial response
      responseType: "stream",
      headers: { Accept: "text/event-stream" },
    }).then((res) => {
      // Immediately destroy the stream so we don't hang
      res.data.destroy();
    });

    const latencyMs = Date.now() - start;
    return { ok: true, message: "Backend API reachable", latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;

    // If we got an HTTP response (even non-2xx), the server is at least reachable
    if (err.response) {
      return {
        ok: true,
        message: `Backend reachable (HTTP ${err.response.status})`,
        latencyMs,
      };
    }

    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Backend unreachable: ${msg}`, latencyMs };
  }
}

function checkVenueConfig(): CheckDetail {
  try {
    if (!config.externalId) {
      return { ok: false, message: "externalId is missing from venue.config.json" };
    }
    if (!config.printer?.interface) {
      return { ok: false, message: "printer.interface is missing from venue.config.json" };
    }
    if (!config.printer?.width) {
      return { ok: false, message: "printer.width is missing from venue.config.json" };
    }
    const mode = normalizePrinterMode(config.printer?.type);
    if (!mode) {
      return {
        ok: false,
        message:
          "printer.type is missing/invalid in venue.config.json (expected \"ip\" or \"usb\"; legacy \"epson\" accepted as IP)"
      };
    }
    if (mode === "usb" && !String(config.printer.interface).startsWith("printer:")) {
      return {
        ok: false,
        message: "printer.interface must use Windows printer name format in USB mode: printer:<WindowsPrinterName>"
      };
    }
    return {
      ok: true,
      message: `External ID ${config.externalId} — ${mode.toUpperCase()} printer ${config.printer.interface} (width ${config.printer.width})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Config check error: ${msg}` };
  }
}

// ─── Aggregate health check ─────────────────────────────────────────

export async function runHealthCheck(): Promise<HealthCheckResult> {
  const [printer] = await Promise.all([
    checkPrinter()
    // checkBackend(),
  ]);

  const venueConfig = checkVenueConfig();

  const checks = { printer, venueConfig };

  const allOk = printer.ok  && venueConfig.ok;
  const anyFailed = !printer.ok || !venueConfig.ok;

  let status: HealthCheckResult["status"];
  if (allOk) {
    status = "healthy";
  } else if (!printer.ok) {
    status = "unhealthy";
  } else {
    status = "degraded";
  }

  // Fire-and-forget notification when printer is unhealthy
  if (!printer.ok) {
    const url = `${config.backendUrl}${config.printerDisconnectedEmailEndpoint}/${config.externalId}/printer-disconnected-email`;
    axios
      .post(url, {}, { headers: { "Content-Type": "application/json" } })
      .then(() => {
        logger.info({ url }, "Triggered printer-disconnected email notification");
      })
      .catch((err) => {
        logger.warn({ url, err }, "Failed to trigger printer-disconnected email notification");
      });
  }

  const result: HealthCheckResult = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  // Log summary
  const logMethod = status === "healthy" ? "info" : status === "degraded" ? "warn" : "error";
  logger[logMethod](
    {
      status,
      printer: printer.ok ? "✔" : "✘",
      venueConfig: venueConfig.ok ? "✔" : "✘",
    },
    `Health check: ${status.toUpperCase()}`
  );

  // Log individual failures
  if (!printer.ok) logger.error({ detail: printer.message }, "Printer check FAILED");
  if (!venueConfig.ok) logger.error({ detail: venueConfig.message }, "Venue config check FAILED");

  return result;
}

// ─── Periodic health check ──────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start a recurring health check every `intervalMs` (default 60 s).
 */
export function startPeriodicHealthCheck(intervalMs: number = 180_000) {
  if (intervalHandle) return; // already running
  logger.info({ intervalMs }, "Starting periodic health check");
  intervalHandle = setInterval(() => {
    runHealthCheck().catch((err) =>
      logger.error({ err }, "Periodic health check threw unexpectedly")
    );
  }, intervalMs);
}

export function stopPeriodicHealthCheck() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info("Stopped periodic health check");
  }
}

