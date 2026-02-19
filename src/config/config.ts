import { systemConfig } from "./systemConfig";
import { loadVenueConfig } from "./loadVenueConfig";

const venue = loadVenueConfig();

export const config = {
  backendUrl: systemConfig.backendBaseUrl,
  sseEndpoint: systemConfig.sseEndpoint,
  ackEndpoint: systemConfig.ackEndpoint,

  venueId: venue.venueId,
  printer: venue.printer
};
