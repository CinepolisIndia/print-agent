export type PrinterMode = "ip" | "usb";

export interface VenuePrinterConfig {
  interface: string;
  width: number;
  type: PrinterMode;
}

export interface VenueConfig {
  external_id?: number | string;
  externalId?: number | string;
  cinemaId?: number | string;
  printer: VenuePrinterConfig;
}