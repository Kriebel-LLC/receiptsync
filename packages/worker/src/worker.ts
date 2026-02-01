import { Router, IRequest } from "itty-router";
import { handleCron } from "./cron";
import { QueueMessage, handleQueueMessage } from "./queue";
import { WorkerEnv } from "./types";
import { handleEmail } from "./email";
import { getFromR2 } from "./email/storage";
import {
  handleExtractReceipt,
  handleExtractReceiptDirect,
} from "./api/extract";

const router = Router();

// Health check / test endpoint
router.get("/api/test", () => {
  return new Response("test");
});

// Serve receipt images from R2
router.get("/api/receipts/images/:key", async (request, env: WorkerEnv) => {
  const key = decodeURIComponent(request.params?.key || "");
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const object = await getFromR2(env.RECEIPTS_BUCKET, key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream"
  );
  headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

  return new Response(object.body, { headers });
});

// Receipt extraction endpoints
router.post("/api/extract", (request: IRequest, env: WorkerEnv) =>
  handleExtractReceiptDirect(request, env)
);
router.post(
  "/api/receipts/:receiptId/extract",
  (request: IRequest, env: WorkerEnv) => handleExtractReceipt(request, env)
);

// Catch-all 404
router.all("*", () => new Response("Not Found", { status: 404 }));

const handler: ExportedHandler<WorkerEnv, QueueMessage> = {
  // TODO: consider copying env onto process.env https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/#relationship-to-per-request-env-argument-in-fetch-handlers
  fetch: router.handle,
  scheduled: async function scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext
  ) {
    console.log("Starting cron");

    await handleCron(env);

    console.log("Finished cron");
  },
  queue: async function queue(
    batch: MessageBatch<QueueMessage>,
    env: WorkerEnv
  ) {
    const messagePromises = [];
    for (const message of batch.messages) {
      messagePromises.push(handleQueueMessage(env, message));
    }

    await Promise.all(messagePromises);
  },
  /**
   * Handle incoming emails
   * Cloudflare Email Routing sends emails to this handler
   */
  email: async function email(
    message: ForwardableEmailMessage,
    env: WorkerEnv,
    ctx: ExecutionContext
  ) {
    console.log(`Received email from ${message.from} to ${message.to}`);

    try {
      await handleEmail(message, env);
    } catch (error) {
      console.error("Failed to handle email:", error);
      // Don't throw - we don't want to bounce the email
    }
  },
};

export default handler;
