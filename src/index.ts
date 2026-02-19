import { startSSE } from "./core/sseClient";
import { logger } from "./utils/logger";
import { runHealthCheck, startPeriodicHealthCheck } from "./core/healthCheck";
import { runAutoUpdateCheck } from "./utils/updater";
import pkg from "../package.json";

async function boot() {
  logger.info(`Print Agent v${pkg.version} starting...`);

  await runAutoUpdateCheck(logger);

  // Run initial health check before starting SSE
  const health = await runHealthCheck();

  if (health.status === "unhealthy") {
    logger.error("System is unhealthy — will still attempt to start, but printing may fail");
  }



  startSSE();

  // Re-check every 60 seconds in the background
  startPeriodicHealthCheck(60_000);
}

boot();
