import { EventSource } from "eventsource";
import { config } from "../config/config";
import { processJob } from "./jobProcessor";
import { logger } from "../utils/logger";
import { PrintJob } from "../types/print.types";

export function startSSE() {
  const url =
    `${config.backendUrl}${config.sseEndpoint}?venue_id=${config.venueId}`;

  logger.info({ url }, "Connecting SSE");

  const es = new EventSource(url);

  es.onmessage = (event: MessageEvent) => {
    try {
      const job: PrintJob = JSON.parse(event.data);
      processJob(job);
    } catch (err) {
      logger.error({ err }, "Invalid job payload");
    }
  };

  es.onerror = (err: Event) => {
    // The 'eventsource' package attaches status/message on error events
    logger.error(
      { err, status: (err as any).status, message: (err as any).message },
      "SSE error — reconnecting"
    );
    es.close();
    setTimeout(startSSE, 5000);
  };

  es.onopen = () => {
    logger.info("SSE connected");
  };
}
