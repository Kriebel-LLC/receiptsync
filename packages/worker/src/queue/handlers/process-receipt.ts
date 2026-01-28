import { WorkerEnv } from "../../types";
import { ProcessReceiptQueueMessage } from "../index";
import { db as instantiateDb } from "shared/src/db";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { eq } from "drizzle-orm";
import { getFromR2 } from "../../email/storage";

/**
 * Handle a process receipt queue message
 *
 * This handler:
 * 1. Retrieves the receipt image from R2
 * 2. Sends it to an OCR/AI service for extraction
 * 3. Updates the receipt record with extracted data
 * 4. Queues sync jobs for active destinations
 */
export async function handleProcessReceiptMessage(
  env: WorkerEnv,
  message: ProcessReceiptQueueMessage
): Promise<void> {
  const { receiptId, orgId } = message;
  console.log(`Processing receipt ${receiptId} for org ${orgId}`);

  const db = instantiateDb(env);

  // Get the receipt record
  const receipt = await db
    .select()
    .from(receipts)
    .where(eq(receipts.id, receiptId))
    .get();

  if (!receipt) {
    console.error(`Receipt ${receiptId} not found`);
    return;
  }

  if (receipt.status !== ReceiptStatus.Pending) {
    console.log(`Receipt ${receiptId} is not pending, skipping`);
    return;
  }

  // Update status to processing
  await db
    .update(receipts)
    .set({ status: ReceiptStatus.Processing })
    .where(eq(receipts.id, receiptId));

  try {
    // Get the image from R2
    const imageKey = receipt.originalImageUrl;
    if (!imageKey) {
      throw new Error("Receipt has no image URL");
    }

    const imageObject = await getFromR2(env.RECEIPTS_BUCKET, imageKey);
    if (!imageObject) {
      throw new Error(`Image not found in R2: ${imageKey}`);
    }

    // TODO: Send to OCR/AI service for extraction
    // For now, we'll just mark it as extracted with placeholder data
    // This would be replaced with actual AI/OCR integration
    //
    // Example integration points:
    // - OpenAI Vision API
    // - Google Cloud Vision
    // - AWS Textract
    // - Custom ML model

    console.log(`Retrieved image from R2: ${imageKey}`);

    // Placeholder extraction result
    // In production, this would come from the AI service
    const extractionResult = {
      vendor: null,
      amount: null,
      currency: "USD",
      date: null,
      extractionModel: "placeholder",
      extractionVersion: "1.0",
      processingTimeMs: 0,
    };

    // Update receipt with extraction results
    await db
      .update(receipts)
      .set({
        status: ReceiptStatus.Extracted,
        extractionResult,
        confidenceScore: 0.0, // Placeholder until actual extraction
      })
      .where(eq(receipts.id, receiptId));

    console.log(`Receipt ${receiptId} marked as extracted (placeholder)`);

    // TODO: Queue sync job to send to destinations
    // This would look up active destinations for the org and queue sync messages

  } catch (error) {
    console.error(`Failed to process receipt ${receiptId}:`, error);

    // Update receipt with error status
    await db
      .update(receipts)
      .set({
        status: ReceiptStatus.Failed,
        extractionError: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(receipts.id, receiptId));
  }
}
