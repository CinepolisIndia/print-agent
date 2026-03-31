import { systemConfig } from "./systemConfig";
import { loadVenueConfig } from "./loadVenueConfig";

const venue = loadVenueConfig();
const externalId = venue.cinemaId ?? venue.externalId ?? venue.external_id;

export const config = {
  backendUrl: systemConfig.backendBaseUrl,
  sseEndpoint: systemConfig.sseEndpoint,
  ackEndpoint: systemConfig.ackEndpoint,

  externalId,
  printer: venue.printer
};
