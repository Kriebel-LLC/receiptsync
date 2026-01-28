import { WorkerEnv } from "@/src/types";
import { assertNever } from "shared/src/utils";
import { handleProcessReceipt } from "./process-receipt";

export enum QueueMessageType {
  Default = "DEFAULT",
  ProcessReceipt = "PROCESS_RECEIPT",
}

export type QueueMessage = DefaultQueueMessage | ProcessReceiptMessage;

export type DefaultQueueMessage = {
  type: QueueMessageType.Default;
  foo: string;
};

export type ProcessReceiptMessage = {
  type: QueueMessageType.ProcessReceipt;
  receiptId: string;
  orgId: string;
  priority?: "high" | "normal" | "low";
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
        await handleProcessReceipt(env, body);
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
