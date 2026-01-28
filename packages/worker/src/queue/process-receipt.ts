import { WorkerEnv } from "@/src/types";
import { db } from "shared/src/db";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { eq } from "drizzle-orm";
import type { ProcessReceiptMessage } from "./index";

/**
 * Handle processing a receipt for data extraction.
 *
 * This is a placeholder implementation that marks the receipt as extracted.
 * In a production system, this would:
 * 1. Fetch the image from R2
 * 2. Send it to an OCR/AI service for extraction
 * 3. Parse the extraction results
 * 4. Update the receipt with extracted data
 */
export async function handleProcessReceipt(
  env: WorkerEnv,
  message: ProcessReceiptMessage
) {
  const { receiptId, orgId } = message;

  console.log(`Processing receipt ${receiptId} for org ${orgId}`);

  const database = db(env);

  try {
    // Fetch the receipt
    const [receipt] = await database
      .select()
      .from(receipts)
      .where(eq(receipts.id, receiptId))
      .limit(1);

    if (!receipt) {
      console.error(`Receipt ${receiptId} not found`);
      return;
    }

    if (receipt.status !== ReceiptStatus.Processing) {
      console.log(`Receipt ${receiptId} is not in processing state, skipping`);
      return;
    }

    // TODO: Implement actual extraction logic here
    // For now, we'll just mark it as extracted after a delay
    // In production, this would:
    // 1. Download image from R2 using receipt.originalImageUrl
    // 2. Send to OCR service (e.g., Google Vision, AWS Textract, or Claude)
    // 3. Parse results and extract vendor, amount, date, etc.
    // 4. Update receipt with extraction results

    // Simulate extraction processing
    const extractionResult = {
      rawText: "Sample extracted text from receipt",
      vendor: null,
      amount: null,
      currency: "USD",
      date: null,
      extractionModel: "placeholder",
      extractionVersion: "1.0.0",
      processingTimeMs: 100,
    };

    // Update receipt with extraction results
    await database
      .update(receipts)
      .set({
        status: ReceiptStatus.Extracted,
        extractionResult: extractionResult,
        confidenceScore: 0.0, // Placeholder - actual extraction would provide real confidence
      })
      .where(eq(receipts.id, receiptId));

    console.log(`Successfully processed receipt ${receiptId}`);
  } catch (error) {
    console.error(`Failed to process receipt ${receiptId}:`, error);

    // Mark receipt as failed
    await database
      .update(receipts)
      .set({
        status: ReceiptStatus.Failed,
        extractionError: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(receipts.id, receiptId));

    throw error; // Re-throw to trigger retry
  }
}
