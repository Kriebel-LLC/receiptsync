import { DBEnv, Env } from "shared/src/types";
import type { QueueMessage } from "./queue";

export interface WorkerEnv extends Env, DBEnv {
  QUEUE: Queue<QueueMessage>;
  RECEIPTS_BUCKET: R2Bucket;
  // Mistral API key for OCR receipt extraction
  MISTRAL_API_KEY: string;
}
