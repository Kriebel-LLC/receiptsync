import { eq, and, inArray } from "drizzle-orm";
import { db } from "shared/src/db";
import {
  Receipt,
  ReceiptStatus,
  Destination,
  DestinationStatus,
  SyncedReceiptStatus,
  destinations,
  receipts,
  syncedReceipts,
  ConnectionType,
} from "shared/src/db/schema";
import { DestinationType } from "shared/src/types/destination-type";
import { GoogleSheetsDestinationConfiguration, DestinationErrorType } from "shared/src/types/destination";
import { getDecryptedConnection, DecryptedConnection, recordConnectionFailure, clearConnectionError } from "shared/src/connection";
import { getGoogleAccessToken, RateLimitError, UnauthorizedError } from "shared/src/google-oauth";
import {
  appendValues,
  updateValues,
  getSpreadsheet,
  ValueInputOption,
  hashToMetadataId,
  batchUpdate,
  searchDeveloperMetadata,
} from "shared/src/google-sheets";
import { WorkerEnv } from "../types";
import { nanoid } from "nanoid";

// ============================================================================
// Types
// ============================================================================

export enum ReceiptUpdateType {
  Add = "ADD",
  Modify = "MODIFY",
  Delete = "DELETE",
}

interface SyncResult {
  success: boolean;
  error?: string;
  externalId?: string;
}

// ============================================================================
// Receipt to Row Conversion
// ============================================================================

/**
 * Convert a receipt to a row of values for Google Sheets
 * Uses the default column structure:
 * Date | Vendor | Amount | Currency | Category | Tax | Subtotal | Payment Method | Receipt Number | Notes | Image URL
 */
function receiptToSheetRow(
  receipt: Receipt,
  fieldMapping?: GoogleSheetsDestinationConfiguration["fieldMapping"]
): (string | number | null)[] {
  // If custom field mapping is provided, use it
  // For now, use the default column structure
  return [
    receipt.date ? new Date(receipt.date).toISOString().split("T")[0] : null,
    receipt.vendor ?? null,
    receipt.amount ?? null,
    receipt.currency ?? null,
    receipt.category ?? null,
    receipt.taxAmount ?? null,
    receipt.subtotal ?? null,
    receipt.paymentMethod ?? null,
    receipt.receiptNumber ?? null,
    null, // Notes - not yet implemented in receipt schema
    receipt.originalImageUrl ?? null,
  ];
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Sync a single receipt to a Google Sheets destination
 */
async function syncReceiptToSheet(
  env: WorkerEnv,
  receipt: Receipt,
  destination: Destination,
  connection: DecryptedConnection,
  updateType: ReceiptUpdateType
): Promise<SyncResult> {
  const config = destination.configuration as GoogleSheetsDestinationConfiguration;

  try {
    // Get fresh access token
    const tokenResponse = await getGoogleAccessToken(
      connection.decryptedAccessToken,
      env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    const accessToken = tokenResponse.access_token;

    // Verify spreadsheet exists
    const spreadsheet = await getSpreadsheet(config.spreadsheetId, accessToken);
    if (!spreadsheet) {
      return {
        success: false,
        error: "Spreadsheet not found",
      };
    }

    // Determine which sheet to use
    const sheetId = config.sheetId ?? spreadsheet.sheets[0]?.properties.sheetId;
    const sheet = spreadsheet.sheets.find((s) => s.properties.sheetId === sheetId);
    if (!sheet) {
      return {
        success: false,
        error: "Sheet not found",
      };
    }

    const sheetTitle = sheet.properties.title;

    // Generate a stable metadata ID for this receipt
    const metadataId = await hashToMetadataId(receipt.id, destination.id);

    switch (updateType) {
      case ReceiptUpdateType.Add: {
        // Check if receipt already exists (idempotency)
        const existingMetadata = await searchDeveloperMetadata(
          config.spreadsheetId,
          {
            metadataId,
            locationType: "ROW",
            visibility: "DOCUMENT",
          },
          accessToken
        );

        if (existingMetadata?.matchedDeveloperMetadata?.length) {
          // Already synced
          return {
            success: true,
            externalId: String(metadataId),
          };
        }

        // Convert receipt to row values
        const rowValues = receiptToSheetRow(receipt, config.fieldMapping);

        // Append the row
        const appendResult = await appendValues(
          config.spreadsheetId,
          `${sheetTitle}!A:K`,
          [rowValues],
          accessToken,
          ValueInputOption.UserEntered
        );

        // Parse the updated range to get the row number
        const rangeMatch = appendResult.updates.updatedRange.match(/:(\d+)$/);
        const rowNumber = rangeMatch ? parseInt(rangeMatch[1], 10) : null;

        if (rowNumber) {
          // Add developer metadata to track this row
          await batchUpdate(
            config.spreadsheetId,
            [
              {
                createDeveloperMetadata: {
                  developerMetadata: {
                    metadataId,
                    location: {
                      locationType: "ROW",
                      dimensionRange: {
                        sheetId,
                        dimension: "ROWS",
                        startIndex: rowNumber - 1, // 0-indexed
                        endIndex: rowNumber,
                      },
                    },
                    visibility: "DOCUMENT",
                  },
                },
              },
            ],
            accessToken
          );
        }

        return {
          success: true,
          externalId: String(metadataId),
        };
      }

      case ReceiptUpdateType.Modify: {
        // Find the row by metadata
        const metadata = await searchDeveloperMetadata(
          config.spreadsheetId,
          {
            metadataId,
            locationType: "ROW",
            visibility: "DOCUMENT",
          },
          accessToken
        );

        if (!metadata?.matchedDeveloperMetadata?.length) {
          // Row not found, treat as new
          return syncReceiptToSheet(
            env,
            receipt,
            destination,
            connection,
            ReceiptUpdateType.Add
          );
        }

        const dimRange = metadata.matchedDeveloperMetadata[0].developerMetadata.location.dimensionRange;
        if (!dimRange) {
          return {
            success: false,
            error: "Could not find row location",
          };
        }

        const rowNumber = dimRange.startIndex + 1; // Convert to 1-indexed

        // Update the row
        const rowValues = receiptToSheetRow(receipt, config.fieldMapping);
        await updateValues(
          config.spreadsheetId,
          `${sheetTitle}!A${rowNumber}:K${rowNumber}`,
          [rowValues],
          accessToken,
          ValueInputOption.UserEntered
        );

        return {
          success: true,
          externalId: String(metadataId),
        };
      }

      case ReceiptUpdateType.Delete: {
        // Find and clear the row (we don't delete to preserve row numbers)
        const metadata = await searchDeveloperMetadata(
          config.spreadsheetId,
          {
            metadataId,
            locationType: "ROW",
            visibility: "DOCUMENT",
          },
          accessToken
        );

        if (!metadata?.matchedDeveloperMetadata?.length) {
          // Already deleted or never synced
          return { success: true };
        }

        const dimRange = metadata.matchedDeveloperMetadata[0].developerMetadata.location.dimensionRange;
        if (dimRange) {
          const rowNumber = dimRange.startIndex + 1;

          // Clear the row content but keep the row
          await updateValues(
            config.spreadsheetId,
            `${sheetTitle}!A${rowNumber}:K${rowNumber}`,
            [["", "", "", "", "", "", "", "", "", "", ""]],
            accessToken,
            ValueInputOption.Raw
          );
        }

        // Delete the metadata
        await batchUpdate(
          config.spreadsheetId,
          [
            {
              deleteDeveloperMetadata: {
                dataFilter: {
                  developerMetadataLookup: {
                    metadataId,
                    visibility: "DOCUMENT",
                  },
                },
              },
            },
          ],
          accessToken
        );

        return { success: true };
      }

      default:
        return {
          success: false,
          error: `Unknown update type: ${updateType}`,
        };
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      // Record the auth failure
      await recordConnectionFailure(db(env), connection.id, error.message);
      return {
        success: false,
        error: "Authentication failed - please reconnect Google account",
      };
    }

    if (error instanceof RateLimitError) {
      return {
        success: false,
        error: `Rate limited - retry after ${error.retryAfterSeconds}s`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Main Sync Entry Points
// ============================================================================

/**
 * Sync a single receipt to all active Google Sheets destinations for an org
 */
export async function syncReceiptToAllDestinations(
  env: WorkerEnv,
  receiptId: string,
  updateType: ReceiptUpdateType = ReceiptUpdateType.Add
): Promise<void> {
  const database = db(env);

  // Get the receipt
  const [receipt] = await database
    .select()
    .from(receipts)
    .where(eq(receipts.id, receiptId));

  if (!receipt) {
    console.error(`Receipt not found: ${receiptId}`);
    return;
  }

  // Only sync extracted receipts
  if (receipt.status !== ReceiptStatus.Extracted) {
    console.log(`Receipt ${receiptId} not in extracted status, skipping sync`);
    return;
  }

  // Get all active Google Sheets destinations for this org
  const activeDestinations = await database
    .select()
    .from(destinations)
    .where(
      and(
        eq(destinations.orgId, receipt.orgId),
        eq(destinations.type, DestinationType.GoogleSheets),
        eq(destinations.status, DestinationStatus.Running)
      )
    );

  if (activeDestinations.length === 0) {
    console.log(`No active destinations for org ${receipt.orgId}`);
    return;
  }

  // Sync to each destination
  for (const destination of activeDestinations) {
    await syncReceiptToDestination(
      env,
      receipt,
      destination,
      updateType
    );
  }
}

/**
 * Sync a receipt to a specific destination
 */
export async function syncReceiptToDestination(
  env: WorkerEnv,
  receipt: Receipt,
  destination: Destination,
  updateType: ReceiptUpdateType = ReceiptUpdateType.Add
): Promise<void> {
  const database = db(env);

  if (!destination.connectionId) {
    console.error(`Destination ${destination.id} has no connection`);
    return;
  }

  // Get the connection
  const connection = await getDecryptedConnection(
    database,
    env.ENCRYPTION_SECRET_KEY,
    destination.connectionId
  );

  if (!connection) {
    console.error(`Connection not found for destination ${destination.id}`);
    return;
  }

  if (connection.type !== ConnectionType.Google) {
    console.error(`Connection ${connection.id} is not a Google connection`);
    return;
  }

  // Check if there's an existing synced receipt record
  const [existingSyncedReceipt] = await database
    .select()
    .from(syncedReceipts)
    .where(
      and(
        eq(syncedReceipts.receiptId, receipt.id),
        eq(syncedReceipts.destinationId, destination.id)
      )
    );

  // Create synced receipt record if it doesn't exist
  if (!existingSyncedReceipt) {
    await database.insert(syncedReceipts).values({
      id: nanoid(),
      receiptId: receipt.id,
      destinationId: destination.id,
      status: SyncedReceiptStatus.Pending,
    });
  } else if (existingSyncedReceipt.status === SyncedReceiptStatus.Sent && updateType === ReceiptUpdateType.Add) {
    // Already synced successfully
    console.log(`Receipt ${receipt.id} already synced to destination ${destination.id}`);
    return;
  }

  // Perform the sync
  const result = await syncReceiptToSheet(
    env,
    receipt,
    destination,
    connection,
    updateType
  );

  // Update the synced receipt record
  const now = new Date();
  if (result.success) {
    await database
      .update(syncedReceipts)
      .set({
        status: SyncedReceiptStatus.Sent,
        externalId: result.externalId,
        error: null,
        syncedAt: now,
        lastAttemptAt: now,
      })
      .where(
        and(
          eq(syncedReceipts.receiptId, receipt.id),
          eq(syncedReceipts.destinationId, destination.id)
        )
      );

    // Update destination last synced time
    await database
      .update(destinations)
      .set({
        lastSyncedAt: now,
        error: null,
        firstFailedAt: null,
        lastFailedAt: null,
      })
      .where(eq(destinations.id, destination.id));

    // Clear connection error if sync succeeded
    await clearConnectionError(database, connection.id);

    console.log(`Successfully synced receipt ${receipt.id} to destination ${destination.id}`);
  } else {
    const retryCount = (existingSyncedReceipt?.retryCount ?? 0) + 1;
    const maxRetries = 5;

    const newStatus =
      retryCount >= maxRetries
        ? SyncedReceiptStatus.Failed
        : SyncedReceiptStatus.PendingRetry;

    await database
      .update(syncedReceipts)
      .set({
        status: newStatus,
        error: result.error,
        retryCount,
        lastAttemptAt: now,
      })
      .where(
        and(
          eq(syncedReceipts.receiptId, receipt.id),
          eq(syncedReceipts.destinationId, destination.id)
        )
      );

    // Update destination error tracking
    const [dest] = await database
      .select()
      .from(destinations)
      .where(eq(destinations.id, destination.id));

    await database
      .update(destinations)
      .set({
        lastFailedAt: now,
        firstFailedAt: dest.firstFailedAt ?? now,
        error: {
          errorType: DestinationErrorType.UnknownError,
          errorDisplayMessage: result.error ?? "Unknown error",
        },
      })
      .where(eq(destinations.id, destination.id));

    console.error(`Failed to sync receipt ${receipt.id} to destination ${destination.id}: ${result.error}`);
  }
}

/**
 * Retry all pending receipts for a destination
 */
export async function retryPendingReceipts(
  env: WorkerEnv,
  destinationId: string
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const database = db(env);

  // Get the destination
  const [destination] = await database
    .select()
    .from(destinations)
    .where(eq(destinations.id, destinationId));

  if (!destination || destination.status !== DestinationStatus.Running) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // Get all pending or pending_retry synced receipts
  const pendingReceipts = await database
    .select()
    .from(syncedReceipts)
    .where(
      and(
        eq(syncedReceipts.destinationId, destinationId),
        inArray(syncedReceipts.status, [
          SyncedReceiptStatus.Pending,
          SyncedReceiptStatus.PendingRetry,
        ])
      )
    );

  let succeeded = 0;
  let failed = 0;

  for (const syncedReceipt of pendingReceipts) {
    const [receipt] = await database
      .select()
      .from(receipts)
      .where(eq(receipts.id, syncedReceipt.receiptId));

    if (!receipt) continue;

    await syncReceiptToDestination(env, receipt, destination, ReceiptUpdateType.Add);

    // Check if it succeeded
    const [updated] = await database
      .select()
      .from(syncedReceipts)
      .where(eq(syncedReceipts.id, syncedReceipt.id));

    if (updated.status === SyncedReceiptStatus.Sent) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    processed: pendingReceipts.length,
    succeeded,
    failed,
  };
}
