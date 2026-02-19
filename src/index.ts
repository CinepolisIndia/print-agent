import { startSSE } from "./core/sseClient";
import { logger } from "./utils/logger";
import { runHealthCheck, startPeriodicHealthCheck } from "./core/healthCheck";
import { runAutoUpdateCheck } from "./utils/updater";

async function boot() {
  logger.info("Print Agent starting...");

  // Run initial health check before starting SSE
  const health = await runHealthCheck();

  if (health.status === "unhealthy") {
    logger.error("System is unhealthy — will still attempt to start, but printing may fail");
  }

  await runAutoUpdateCheck(logger);

  startSSE();

  // Re-check every 60 seconds in the background
  startPeriodicHealthCheck(60_000);
}

boot();
