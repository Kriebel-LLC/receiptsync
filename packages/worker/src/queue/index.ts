import { WorkerEnv } from "@/src/types";
import { assertNever } from "shared/src/utils";
import { handleProcessReceiptMessage } from "./handlers/process-receipt";
import { syncReceiptToAllDestinations, retryPendingReceipts, ReceiptUpdateType } from "../syncs/sheets-sync";

export enum QueueMessageType {
  Default = "DEFAULT",
  ProcessReceipt = "PROCESS_RECEIPT",
  SyncReceipt = "SYNC_RECEIPT",
  RetryDestination = "RETRY_DESTINATION",
}

export type QueueMessage =
  | DefaultQueueMessage
  | ProcessReceiptQueueMessage
  | SyncReceiptQueueMessage
  | RetryDestinationMessage;

export type DefaultQueueMessage = {
  type: typeof QueueMessageType.Default;
  foo: string;
};

/**
 * Message to trigger receipt processing (OCR/AI extraction)
 */
export type ProcessReceiptQueueMessage = {
  type: QueueMessageType.ProcessReceipt;
  receiptId: string;
  orgId: string;
  priority?: "high" | "normal" | "low";
};

/**
 * Message to sync a receipt to all active destinations
 */
export type SyncReceiptQueueMessage = {
  type: QueueMessageType.SyncReceipt;
  receiptId: string;
  updateType?: ReceiptUpdateType;
};

/**
 * Message to retry all pending receipts for a destination
 */
export type RetryDestinationMessage = {
  type: QueueMessageType.RetryDestination;
  destinationId: string;
};

export async function handleQueueMessage(
  env: WorkerEnv,
  message: Message<QueueMessage>
) {
  try {
    const { body } = message;

    console.log(`Got ${body.type} message with id: ${message.id}`);

    const messageType = body.type;
    switch (messageType) {
      case QueueMessageType.Default:
        return;

      case QueueMessageType.ProcessReceipt:
        await handleProcessReceiptMessage(env, body);
        return;

      case QueueMessageType.SyncReceipt: {
        const { receiptId, updateType } = body;
        await syncReceiptToAllDestinations(
          env,
          receiptId,
          updateType ?? ReceiptUpdateType.Add
        );
        return;
      }

      case QueueMessageType.RetryDestination: {
        const { destinationId } = body;
        const result = await retryPendingReceipts(env, destinationId);
        console.log(`Retry result for destination ${destinationId}:`, result);
        return;
      }

      default:
        assertNever(messageType);
    }
  } catch (error) {
    // retry ONLY the failed message; if uncaught, entire batch will be retried
    console.error(error);
    message.retry();
  }
}
