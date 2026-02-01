/**
 * Handler for SyncReceipt queue messages
 * Syncs a receipt to one or more destinations
 */

import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "shared/src/db";
import {
  receipts,
  destinations,
  syncedReceipts,
  DestinationStatus,
  SyncedReceiptStatus,
  Receipt,
  Destination,
  DestinationType,
} from "shared/src/db/schema";
import { decrypt } from "shared/src/encryption";
import { getDecryptedConnectionById, BackendEnv } from "shared/src/connection";
import { NotionDestinationConfiguration } from "shared/src/types/destination";
import {
  executeNotionSync,
  SyncUpdateType,
  NotionSyncResult,
} from "../syncs/notion-sync";
import { SyncReceiptQueueMessage } from "./index";
import { WorkerEnv } from "../types";

const MAX_RETRIES = 3;

/**
 * Handle a sync receipt message
 */
export async function handleSyncReceiptMessage(
  env: WorkerEnv,
  message: SyncReceiptQueueMessage
): Promise<void> {
  const { receiptId, destinationIds } = message;

  console.log(`Syncing receipt ${receiptId} to destinations: ${destinationIds?.join(", ") ?? "all"}`);

  // Get the receipt
  const receiptResults = await db(env)
    .select()
    .from(receipts)
    .where(eq(receipts.id, receiptId))
    .limit(1);

  if (receiptResults.length === 0) {
    console.error(`Receipt ${receiptId} not found`);
    return;
  }

  const receipt = receiptResults[0];

  // Get destinations to sync to
  let destinationsToSync: Destination[];
  if (destinationIds && destinationIds.length > 0) {
    destinationsToSync = await db(env)
      .select()
      .from(destinations)
      .where(
        and(
          eq(destinations.orgId, receipt.orgId),
          inArray(destinations.id, destinationIds),
          eq(destinations.status, DestinationStatus.Running)
        )
      );
  } else {
    // Sync to all active destinations for the org
    destinationsToSync = await db(env)
      .select()
      .from(destinations)
      .where(
        and(
          eq(destinations.orgId, receipt.orgId),
          eq(destinations.status, DestinationStatus.Running)
        )
      );
  }

  if (destinationsToSync.length === 0) {
    console.log(`No active destinations found for receipt ${receiptId}`);
    return;
  }

  // Sync to each destination
  for (const destination of destinationsToSync) {
    await syncReceiptToDestination(env, receipt, destination);
  }
}

/**
 * Sync a single receipt to a single destination
 */
async function syncReceiptToDestination(
  env: WorkerEnv,
  receipt: Receipt,
  destination: Destination
): Promise<void> {
  console.log(
    `Syncing receipt ${receipt.id} to destination ${destination.id} (${destination.type})`
  );

  // Check for existing sync record
  const existingSyncResults = await db(env)
    .select()
    .from(syncedReceipts)
    .where(
      and(
        eq(syncedReceipts.receiptId, receipt.id),
        eq(syncedReceipts.destinationId, destination.id)
      )
    )
    .limit(1);

  const existingSync = existingSyncResults[0];
  const isUpdate = !!existingSync && existingSync.status === SyncedReceiptStatus.Sent;

  // Determine update type
  const updateType = isUpdate ? SyncUpdateType.Modify : SyncUpdateType.Add;

  // Execute sync based on destination type
  let result: NotionSyncResult;

  switch (destination.type) {
    case DestinationType.Notion:
      result = await syncToNotion(
        env,
        receipt,
        destination,
        updateType,
        existingSync?.externalId ?? undefined
      );
      break;

    case DestinationType.GoogleSheets:
      // TODO: Implement Google Sheets sync
      console.log("Google Sheets sync not yet implemented");
      result = {
        success: false,
        error: "Google Sheets sync not implemented",
        shouldRetry: false,
      };
      break;

    default:
      console.error(`Unknown destination type: ${destination.type}`);
      result = {
        success: false,
        error: `Unknown destination type: ${destination.type}`,
        shouldRetry: false,
      };
  }

  // Update or create sync record
  await updateSyncRecord(env, receipt.id, destination.id, result, existingSync);
}

/**
 * Sync to a Notion destination
 */
async function syncToNotion(
  env: WorkerEnv,
  receipt: Receipt,
  destination: Destination,
  updateType: SyncUpdateType,
  existingExternalId?: string
): Promise<NotionSyncResult> {
  // Get connection with decrypted access token
  if (!destination.connectionId) {
    return {
      success: false,
      error: "No connection configured for destination",
      shouldRetry: false,
    };
  }

  const connection = await getDecryptedConnectionById({
    env: env as BackendEnv,
    connectionId: destination.connectionId,
    orgId: destination.orgId,
  });

  if (!connection) {
    return {
      success: false,
      error: "Connection not found",
      shouldRetry: false,
    };
  }

  const configuration = destination.configuration as NotionDestinationConfiguration;

  return executeNotionSync({
    receipt,
    configuration,
    accessToken: connection.decryptedAccessToken,
    updateType,
    existingExternalId,
  });
}

/**
 * Update or create a sync record based on result
 */
async function updateSyncRecord(
  env: WorkerEnv,
  receiptId: string,
  destinationId: string,
  result: NotionSyncResult,
  existingSync?: typeof syncedReceipts.$inferSelect
): Promise<void> {
  const now = new Date();

  if (existingSync) {
    // Update existing record
    const newRetryCount = result.success ? existingSync.retryCount : existingSync.retryCount + 1;
    const shouldMarkFailed = !result.success && (
      !result.shouldRetry || newRetryCount >= MAX_RETRIES
    );

    await db(env)
      .update(syncedReceipts)
      .set({
        status: result.success
          ? SyncedReceiptStatus.Sent
          : shouldMarkFailed
            ? SyncedReceiptStatus.Failed
            : SyncedReceiptStatus.PendingRetry,
        externalId: result.externalId ?? existingSync.externalId,
        error: result.error ?? null,
        retryCount: newRetryCount,
        lastAttemptAt: now,
        syncedAt: result.success ? now : existingSync.syncedAt,
      })
      .where(eq(syncedReceipts.id, existingSync.id));
  } else {
    // Create new record
    const shouldMarkFailed = !result.success && !result.shouldRetry;

    await db(env)
      .insert(syncedReceipts)
      .values({
        id: nanoid(),
        receiptId,
        destinationId,
        status: result.success
          ? SyncedReceiptStatus.Sent
          : shouldMarkFailed
            ? SyncedReceiptStatus.Failed
            : SyncedReceiptStatus.PendingRetry,
        externalId: result.externalId ?? null,
        error: result.error ?? null,
        retryCount: result.success ? 0 : 1,
        lastAttemptAt: now,
        syncedAt: result.success ? now : null,
      });
  }

  // Update destination last sync time if successful
  if (result.success) {
    await db(env)
      .update(destinations)
      .set({ lastSyncedAt: now })
      .where(eq(destinations.id, destinationId));
  }
}
