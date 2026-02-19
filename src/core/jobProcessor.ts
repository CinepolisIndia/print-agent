import { PrintJob } from "../types/print.types";
import { printText } from "../printer/epsonPrinter";
import { sendAck } from "./ackService";
import { logger } from "../utils/logger";

export async function processJob(job: PrintJob) {
  try {
    logger.info({ jobId: job.job_id }, "Processing print job");
    await printText(job.kot);
    await sendAck(job.job_id);
  } catch (err) {
    logger.error({ err, jobId: job.job_id }, "Print failed");
  }
}
