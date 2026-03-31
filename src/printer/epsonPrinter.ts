import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";
import { config } from "../config/config";
import { PrinterMode } from "../config/venueConfig.types";
import { logger } from "../utils/logger";
import fs from "fs/promises";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

import path from "path";


const logoPath = path.join(path.dirname(process.execPath), "assets", "logo.png");
const execFileAsync = promisify(execFile);

export function normalizePrinterMode(rawMode: unknown): PrinterMode | null {
  const normalized = String(rawMode ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "usb") return "usb";
  if (
    normalized === "ip" ||
    normalized === "epson" ||
    normalized === "network" ||
    normalized === "tcp"
  ) {
    return "ip";
  }
  return null;
}

function getValidatedPrinterMode(): PrinterMode {
  const mode = normalizePrinterMode(config.printer?.type);
  if (mode) return mode;

  throw new Error(
    `Invalid printer.type "${config.printer?.type}". Expected "ip" or "usb" (legacy "epson" is also accepted as IP).`
  );
}

export function createConfiguredPrinter(): {
  printer: ThermalPrinter;
  mode: PrinterMode;
} {
  const mode = getValidatedPrinterMode();
  const printerOptions: any = {
    type: PrinterTypes.EPSON,
    interface: config.printer.interface,
    width: config.printer.width,
    characterSet: CharacterSet.PC437_USA,
    removeSpecialCharacters: false
  };

  if (mode === "usb") {
    const usbDriver = resolveUsbDriver();
    if (!usbDriver) {
      throw new Error(
        "USB driver package is not installed. Install @thiagoelg/node-printer or printer, or use Windows spooler fallback."
      );
    }
    printerOptions.driver = usbDriver;
  }

  const printer = new ThermalPrinter(printerOptions);

  return { printer, mode };
}

function resolveUsbDriver(): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@thiagoelg/node-printer");
  } catch {
    // fallback to legacy package name
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("printer");
  } catch {
    return null;
  }
}

export function canUseNativeUsbDriver(): boolean {
  return resolveUsbDriver() !== null;
}

export function getUsbPrinterNameFromInterface(interfaceValue: string): string {
  if (!interfaceValue.startsWith("printer:")) {
    throw new Error(
      "USB mode requires printer.interface in this format: printer:<WindowsPrinterName>"
    );
  }
  const name = interfaceValue.slice("printer:".length).trim();
  if (!name) {
    throw new Error(
      "USB mode requires a non-empty Windows printer name after 'printer:'"
    );
  }
  return name;
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

export async function checkUsbPrinterAvailableViaWindows(
  printerName: string
): Promise<boolean> {
  const escapedName = escapePowerShellSingleQuoted(printerName);
  const cmd = [
    `$printer = Get-Printer -Name '${escapedName}' -ErrorAction SilentlyContinue`,
    "if ($printer) { Write-Output 'FOUND' } else { Write-Output 'MISSING' }"
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-Command", cmd],
    { windowsHide: true }
  );

  return String(stdout).toUpperCase().includes("FOUND");
}

async function printTextViaWindowsSpooler(
  buffer: Buffer,
  printerName: string
): Promise<void> {
  const filePath = path.join(
    os.tmpdir(),
    `print-agent-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`
  );
  const escapedFilePath = escapePowerShellSingleQuoted(path.resolve(filePath));
  const escapedPrinterName = escapePowerShellSingleQuoted(printerName);
  const psCommand = [
    "$ErrorActionPreference = 'Stop'",
    "$source = @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class RawPrinter {",
    "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
    "  public class DOCINFO {",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;",
    "    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;",
    "  }",
    "  [DllImport(\"winspool.Drv\", EntryPoint = \"OpenPrinterW\", SetLastError = true, CharSet = CharSet.Unicode)]",
    "  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);",
    "  [DllImport(\"winspool.Drv\", SetLastError = true)]",
    "  public static extern bool ClosePrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", EntryPoint = \"StartDocPrinterW\", SetLastError = true, CharSet = CharSet.Unicode)]",
    "  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In] DOCINFO di);",
    "  [DllImport(\"winspool.Drv\", SetLastError = true)]",
    "  public static extern bool EndDocPrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError = true)]",
    "  public static extern bool StartPagePrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError = true)]",
    "  public static extern bool EndPagePrinter(IntPtr hPrinter);",
    "  [DllImport(\"winspool.Drv\", SetLastError = true)]",
    "  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);",
    "  public static void SendRaw(string printerName, byte[] bytes) {",
    "    IntPtr handle;",
    "    if (!OpenPrinter(printerName, out handle, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());",
    "    try {",
    "      DOCINFO doc = new DOCINFO();",
    "      doc.pDocName = \"print-agent\";",
    "      doc.pDataType = \"RAW\";",
    "      if (!StartDocPrinter(handle, 1, doc)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());",
    "      try {",
    "        if (!StartPagePrinter(handle)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());",
    "        try {",
    "          int written;",
    "          if (!WritePrinter(handle, bytes, bytes.Length, out written)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());",
    "          if (written != bytes.Length) throw new Exception(\"Incomplete RAW write to printer\");",
    "        } finally { EndPagePrinter(handle); }",
    "      } finally { EndDocPrinter(handle); }",
    "    } finally { ClosePrinter(handle); }",
    "  }",
    "}",
    "\"@",
    "Add-Type -TypeDefinition $source -Language CSharp",
    `$bytes = [System.IO.File]::ReadAllBytes('${escapedFilePath}')`,
    `[RawPrinter]::SendRaw('${escapedPrinterName}', $bytes)`
  ].join("\n");

  try {
    await fs.writeFile(filePath, buffer);

    await execFileAsync("powershell", ["-NoProfile", "-Command", psCommand], {
      windowsHide: true
    });
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
  }
}

function createReceiptPrinter(interfaceValue: string): ThermalPrinter {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: interfaceValue,
    width: config.printer.width,
    characterSet: CharacterSet.PC437_USA,
    removeSpecialCharacters: false
  });
}

async function composeReceipt(printer: ThermalPrinter, text: string): Promise<void> {
  printer.clear();
  printer.alignCenter();
  try {
    await printer.printImage(logoPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ logoPath, error: msg }, "Logo print failed — skipping");
  }
  printer.alignLeft();
  printer.println(text);
  printer.cut();
}

export async function printText(text: string): Promise<void> {
  const mode = getValidatedPrinterMode();
  if (mode === "usb" && !canUseNativeUsbDriver()) {
    const printerName = getUsbPrinterNameFromInterface(config.printer.interface);
    const spoolerPrinter = createReceiptPrinter("tcp://127.0.0.1:9100");
    await composeReceipt(spoolerPrinter, text);
    const rawBuffer = spoolerPrinter.getBuffer();
    if (!rawBuffer) {
      throw new Error("Unable to generate print buffer for USB RAW fallback");
    }
    await printTextViaWindowsSpooler(rawBuffer, printerName);
    logger.info(
      { mode, interface: config.printer.interface, printerName, transport: "windows-raw" },
      "Print success via USB RAW spooler fallback"
    );
    return;
  }

  const { printer } = createConfiguredPrinter();
  await composeReceipt(printer, text);

  try {
    await printer.execute();
    logger.info({ mode, interface: config.printer.interface }, "Print success");
    
  } catch (err) {
    logger.error({ err, mode, interface: config.printer.interface }, "Print failed");
    throw err;
  }
}
