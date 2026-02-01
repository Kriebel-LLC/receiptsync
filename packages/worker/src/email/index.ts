import { WorkerEnv } from "../types";
import { db as instantiateDb } from "shared/src/db";
import {
  emailForwardingAddresses,
  receipts,
  receiptSources,
  ReceiptSourceType,
  ReceiptSourceStatus,
  ReceiptStatus,
} from "shared/src/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { QueueMessageType, ProcessReceiptQueueMessage } from "../queue";
import { extractAttachments, Attachment } from "./attachments";
import { storeAttachmentInR2 } from "./storage";

/**
 * Handles incoming emails to the receipts forwarding address
 *
 * Email format: {addressCode}@receipts.receiptsync.com
 * Example: abc123@receipts.receiptsync.com
 */
export async function handleEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv
): Promise<void> {
  console.log(`Processing email from ${message.from} to ${message.to}`);

  const db = instantiateDb(env);

  // Extract the address code from the "to" address
  const addressCode = extractAddressCode(message.to);
  if (!addressCode) {
    console.error(`Invalid forwarding address: ${message.to}`);
    // Reject the email silently - don't bounce
    return;
  }

  // Look up the forwarding address to find the org
  const forwardingAddress = await db
    .select()
    .from(emailForwardingAddresses)
    .where(
      and(
        eq(emailForwardingAddresses.addressCode, addressCode),
        eq(emailForwardingAddresses.isActive, true)
      )
    )
    .get();

  if (!forwardingAddress) {
    console.error(`No active forwarding address found for code: ${addressCode}`);
    return;
  }

  const orgId = forwardingAddress.orgId;
  console.log(`Found org ${orgId} for forwarding address ${addressCode}`);

  // Find or create an email receipt source for this org
  let receiptSource = await db
    .select()
    .from(receiptSources)
    .where(
      and(
        eq(receiptSources.orgId, orgId),
        eq(receiptSources.type, ReceiptSourceType.Email),
        eq(receiptSources.status, ReceiptSourceStatus.Active)
      )
    )
    .get();

  if (!receiptSource) {
    // Create a default email source for this org
    const sourceId = nanoid();
    await db.insert(receiptSources).values({
      id: sourceId,
      orgId,
      name: "Email Forwarding",
      type: ReceiptSourceType.Email,
      status: ReceiptSourceStatus.Active,
      configuration: {
        emailAddress: `${addressCode}@receipts.receiptsync.com`,
        autoProcess: true,
      },
    });
    receiptSource = await db
      .select()
      .from(receiptSources)
      .where(eq(receiptSources.id, sourceId))
      .get();
  }

  // Extract attachments from the email
  const attachments = await extractAttachments(message);

  if (attachments.length === 0) {
    console.log("No attachments found in email, checking for inline images");
    // Even if there are no attachments, we might want to process the email body
    // for inline images or text content in the future
    return;
  }

  console.log(`Found ${attachments.length} attachments`);

  // Process each attachment as a separate receipt
  const queueMessages: ProcessReceiptQueueMessage[] = [];

  for (const attachment of attachments) {
    try {
      const receiptId = nanoid();
      const r2Key = `${orgId}/${receiptId}/${attachment.filename}`;

      // Store attachment in R2
      await storeAttachmentInR2(env.RECEIPTS_BUCKET, r2Key, attachment);

      // Create receipt record
      await db.insert(receipts).values({
        id: receiptId,
        orgId,
        receiptSourceId: receiptSource?.id,
        status: ReceiptStatus.Pending,
        originalImageUrl: r2Key, // Store R2 key as URL
      });

      console.log(`Created receipt ${receiptId} with R2 key: ${r2Key}`);

      // Queue processing job
      queueMessages.push({
        type: QueueMessageType.ProcessReceipt,
        receiptId,
        orgId,
        priority: "normal",
      });
    } catch (error) {
      console.error(`Failed to process attachment ${attachment.filename}:`, error);
    }
  }

  // Send queue messages for processing
  if (queueMessages.length > 0 && env.QUEUE) {
    await env.QUEUE.sendBatch(
      queueMessages.map((body) => ({ body }))
    );
    console.log(`Queued ${queueMessages.length} receipts for processing`);
  }
}

/**
 * Extract the address code from the forwarding email address
 * Supports formats:
 * - {code}@receipts.receiptsync.com
 * - receipts+{code}@receiptsync.com (plus addressing)
 */
function extractAddressCode(toAddress: string): string | null {
  // Normalize the address
  const address = toAddress.toLowerCase().trim();

  // Format 1: {code}@receipts.receiptsync.com
  const subdomainMatch = address.match(/^([a-z0-9]+)@receipts\./);
  if (subdomainMatch) {
    return subdomainMatch[1];
  }

  // Format 2: receipts+{code}@receiptsync.com
  const plusMatch = address.match(/^receipts\+([a-z0-9]+)@/);
  if (plusMatch) {
    return plusMatch[1];
  }

  return null;
}
