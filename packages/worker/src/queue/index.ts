import { WorkerEnv } from "@/src/types";
import { assertNever } from "shared/src/utils";
import { handleProcessReceiptMessage } from "./handlers/process-receipt";

export enum QueueMessageType {
  Default = "DEFAULT",
  ProcessReceipt = "PROCESS_RECEIPT",
  SyncReceipt = "SYNC_RECEIPT",
}

export type QueueMessage =
  | DefaultQueueMessage
  | ProcessReceiptQueueMessage
  | SyncReceiptQueueMessage;

export type DefaultQueueMessage = {
  type: QueueMessageType.Default;
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
 * Message to sync a receipt to destinations
 */
export type SyncReceiptQueueMessage = {
  type: QueueMessageType.SyncReceipt;
  receiptId: string;
  destinationIds?: string[]; // If empty, sync to all active destinations
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
      case QueueMessageType.SyncReceipt:
        // TODO: Implement sync receipt handler
        console.log(`Sync receipt ${body.receiptId} to destinations`);
        return;
      default:
        assertNever(messageType);
    }
  } catch (error) {
    // retry ONLY the failed message; if uncaught, entire batch will be retried
    console.error(error);
    message.retry();
  }
}
