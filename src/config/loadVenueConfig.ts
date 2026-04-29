import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { VenueConfig } from "./venueConfig.types";

export function loadVenueConfig(): VenueConfig {
  const file = path.join(path.dirname(process.execPath), "venue.config.json");

  if (!fs.existsSync(file)) {
    throw new Error("venue.config.json missing beside exe");
  }

  const venueConfig = JSON.parse(fs.readFileSync(file, "utf-8")) as VenueConfig;

  if (!venueConfig.agent_id) {
    venueConfig.agent_id = randomUUID();
    fs.writeFileSync(file, JSON.stringify(venueConfig, null, 2), "utf-8");
  }

  return venueConfig;
}
