import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";
import axios from "axios";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { HealthCheckResult, CheckDetail } from "../types/print.types";

// ─── Individual checks ───────────────────────────────────────────────

async function checkPrinter(): Promise<CheckDetail> {
  const start = Date.now();
  try {
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: config.printer.interface,
      width: config.printer.width,
      characterSet: CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
    });

    const connected = await printer.isPrinterConnected();
    const latencyMs = Date.now() - start;

    return connected
      ? { ok: true, message: `Printer reachable at ${config.printer.interface}`, latencyMs }
      : { ok: false, message: `Printer not responding at ${config.printer.interface}`, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Printer check error: ${msg}`, latencyMs };
  }
}

async function checkBackend(): Promise<CheckDetail> {
  const start = Date.now();
  try {
    const url = `${config.backendUrl}${config.sseEndpoint}?venue_id=${config.venueId}`;
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
    if (!config.venueId) {
      return { ok: false, message: "venueId is missing from venue.config.json" };
    }
    if (!config.printer?.interface) {
      return { ok: false, message: "printer.interface is missing from venue.config.json" };
    }
    if (!config.printer?.width) {
      return { ok: false, message: "printer.width is missing from venue.config.json" };
    }
    return {
      ok: true,
      message: `Venue ${config.venueId} — printer ${config.printer.interface} (width ${config.printer.width})`,
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

