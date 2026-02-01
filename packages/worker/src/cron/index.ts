/**
 * Cron job handler
 * Runs hourly to retry failed syncs and perform maintenance
 */

import { eq, and, lt, sql } from "drizzle-orm";
import { db } from "shared/src/db";
import {
  syncedReceipts,
  SyncedReceiptStatus,
} from "shared/src/db/schema";
import { WorkerEnv } from "../types";
import { QueueMessageType, SyncReceiptQueueMessage } from "../queue";

const MAX_RETRIES = 3;
const RETRY_BATCH_SIZE = 50;

export async function handleCron(env: WorkerEnv) {
  console.log("Starting cron job");

  // Retry failed syncs
  await retryFailedSyncs(env);

  console.log("Cron job complete");
}

/**
 * Find synced receipts that need retrying and queue them
 */
async function retryFailedSyncs(env: WorkerEnv): Promise<void> {
  // Find pending retry records that haven't been attempted recently
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const pendingRetries = await db(env)
    .select({
      id: syncedReceipts.id,
      receiptId: syncedReceipts.receiptId,
      destinationId: syncedReceipts.destinationId,
      retryCount: syncedReceipts.retryCount,
    })
    .from(syncedReceipts)
    .where(
      and(
        eq(syncedReceipts.status, SyncedReceiptStatus.PendingRetry),
        lt(syncedReceipts.retryCount, MAX_RETRIES),
        lt(syncedReceipts.lastAttemptAt, oneHourAgo)
      )
    )
    .limit(RETRY_BATCH_SIZE);

  if (pendingRetries.length === 0) {
    console.log("No pending retries found");
    return;
  }

  console.log(`Found ${pendingRetries.length} syncs to retry`);

  // Group by receipt to minimize queue messages
  const receiptDestinations = new Map<string, string[]>();
  for (const record of pendingRetries) {
    const destinations = receiptDestinations.get(record.receiptId) ?? [];
    destinations.push(record.destinationId);
    receiptDestinations.set(record.receiptId, destinations);
  }

  // Queue retry messages
  for (const [receiptId, destinationIds] of receiptDestinations) {
    const message: SyncReceiptQueueMessage = {
      type: QueueMessageType.SyncReceipt,
      receiptId,
      destinationIds,
    };

    await env.QUEUE.send(message);
    console.log(`Queued retry for receipt ${receiptId} to ${destinationIds.length} destinations`);
  }
}
