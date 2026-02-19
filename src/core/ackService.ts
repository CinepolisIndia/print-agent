import axios from "axios";
import { config } from "../config/config";
import { logger } from "../utils/logger";

export async function sendAck(jobId: string) {
  try {
    await axios.post(
      config.backendUrl + config.ackEndpoint,
      { job_id: jobId },
      { timeout: 5000 }
    );

    logger.info({ jobId }, "ACK sent");
  } catch (err) {
    logger.error({ err }, "ACK failed");
  }
}
