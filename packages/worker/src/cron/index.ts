import { WorkerEnv } from "../types";
import { processExportJobs } from "./export-cron";

export async function handleCron(env: WorkerEnv) {
  // Process pending export jobs
  await processExportJobs(env);
}
