import { WorkerEnv } from "@/src/types";
import { assertNever } from "shared/src/utils";
import { handleExportReceiptsMessage } from "./export-handler";
import { ExportFormat } from "shared/src/db/schema";

export enum QueueMessageType {
  Default = "DEFAULT",
  ExportReceipts = "EXPORT_RECEIPTS",
}

export type QueueMessage = DefaultQueueMessage | ExportReceiptsQueueMessage;

export type DefaultQueueMessage = {
  type: QueueMessageType.Default;
  foo: string;
};

export type ExportReceiptsQueueMessage = {
  type: QueueMessageType.ExportReceipts;
  jobId: string;
  orgId: string;
  userId: string;
  format: ExportFormat;
  columns: string[];
  filters?: {
    startDate?: string;
    endDate?: string;
    categories?: string[];
    statuses?: string[];
    vendors?: string[];
  };
  includeImages: boolean;
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
      case QueueMessageType.ExportReceipts:
        await handleExportReceiptsMessage(env, body);
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
