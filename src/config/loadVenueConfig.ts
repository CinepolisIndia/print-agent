import fs from "fs";
import path from "path";

export function loadVenueConfig() {
  const file = path.join(path.dirname(process.execPath), "venue.config.json");

  if (!fs.existsSync(file)) {
    throw new Error("venue.config.json missing beside exe");
  }

  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
