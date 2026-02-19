import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";
import { config } from "../config/config";
import { logger } from "../utils/logger";

import path from "path";


const logoPath = path.join(path.dirname(process.execPath), "assets", "logo.png");

export async function printText(text: string): Promise<void> {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: config.printer.interface,
    width: config.printer.width,
    characterSet: CharacterSet.PC437_USA,
    removeSpecialCharacters: false
  });

  printer.clear();
  printer.alignCenter();
  try {
    await printer.printImage(logoPath);
  } catch(error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ logoPath, error: msg }, "Logo print failed — skipping");
    // throw error;
  }
  printer.alignLeft();
  printer.println(text);
  printer.cut();

  try {
    await printer.execute();
    logger.info("TCP print success");
    
  } catch (err) {
    logger.error({ err }, "TCP print failed");
    throw err;
  }
}
