import fs from "fs";
import path from "path";
import { VenueConfig } from "./venueConfig.types";

export function loadVenueConfig(): VenueConfig {
  const file = path.join(path.dirname(process.execPath), "venue.config.json");

  if (!fs.existsSync(file)) {
    throw new Error("venue.config.json missing beside exe");
  }

  return JSON.parse(fs.readFileSync(file, "utf-8")) as VenueConfig;
}
