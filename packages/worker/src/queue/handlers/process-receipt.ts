import { WorkerEnv } from "../../types";
import { ProcessReceiptQueueMessage } from "../index";
import { db as instantiateDb } from "shared/src/db";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { eq } from "drizzle-orm";
import { getFromR2 } from "../../email/storage";
import {
  ReceiptExtractor,
  calculateOverallConfidence,
  mapToReceiptCategory,
  parseExtractedDate,
  lookupByImageHash,
  calculateImageHash,
} from "../../extraction";

/**
 * Handle a process receipt queue message
 *
 * This handler:
 * 1. Retrieves the receipt image from R2
 * 2. Sends it to Mistral OCR for extraction
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

    console.log(`Retrieved image from R2: ${imageKey}`);

    // Get image data for extraction and hash calculation
    const imageArrayBuffer = await imageObject.arrayBuffer();
    const imageBase64 = btoa(
      String.fromCharCode(...new Uint8Array(imageArrayBuffer))
    );

    // Determine media type from the R2 object
    const contentType = imageObject.httpMetadata?.contentType || "image/jpeg";
    const mediaType = contentType as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    // Calculate image hash for caching/deduplication
    let imageHash = receipt.imageHash;
    if (!imageHash) {
      imageHash = await calculateImageHash(imageArrayBuffer);
      await db
        .update(receipts)
        .set({ imageHash })
        .where(eq(receipts.id, receiptId));
    }

    // Check if we have a cached extraction for this image hash
    const cacheResult = await lookupByImageHash(
      db,
      imageHash,
      orgId,
      receiptId
    );

    if (cacheResult.found && cacheResult.extractionResult) {
      console.log(
        `Found cached extraction for image hash ${imageHash}, using existing result`
      );

      const extractionResult = cacheResult.extractionResult;
      const category = mapToReceiptCategory(extractionResult.category);
      const receiptDate = parseExtractedDate(extractionResult.date);

      await db
        .update(receipts)
        .set({
          status: ReceiptStatus.Extracted,
          vendor: extractionResult.vendor,
          amount: extractionResult.amount,
          currency: extractionResult.currency,
          date: receiptDate,
          category: category,
          taxAmount: extractionResult.taxAmount ?? null,
          subtotal: extractionResult.subtotal ?? null,
          paymentMethod: extractionResult.paymentMethod ?? null,
          receiptNumber: extractionResult.receiptNumber ?? null,
          confidenceScore: cacheResult.confidenceScore ?? null,
          extractionResult: extractionResult,
          extractionError: null,
        })
        .where(eq(receipts.id, receiptId));

      console.log(`Receipt ${receiptId} updated from cache`);
      return;
    }

    // Perform extraction using Mistral OCR
    const extractor = new ReceiptExtractor(env.MISTRAL_API_KEY);
    const extractionResponse = await extractor.extract({
      imageBase64,
      mediaType,
    });

    if (!extractionResponse.success || !extractionResponse.data) {
      throw new Error(
        extractionResponse.error || "Extraction failed with no error message"
      );
    }

    const extractionResult = extractionResponse.data;

    // Calculate overall confidence score
    const confidenceScore = calculateOverallConfidence(extractionResult);

    // Map category to enum
    const category = mapToReceiptCategory(extractionResult.category);

    // Parse the date
    const receiptDate = parseExtractedDate(extractionResult.date);

    // Update receipt with extraction results
    await db
      .update(receipts)
      .set({
        status: ReceiptStatus.Extracted,
        vendor: extractionResult.vendor,
        amount: extractionResult.amount,
        currency: extractionResult.currency,
        date: receiptDate,
        category: category,
        taxAmount: extractionResult.taxAmount ?? null,
        subtotal: extractionResult.subtotal ?? null,
        paymentMethod: extractionResult.paymentMethod ?? null,
        receiptNumber: extractionResult.receiptNumber ?? null,
        confidenceScore: confidenceScore,
        extractionResult: extractionResult,
        extractionError: null,
      })
      .where(eq(receipts.id, receiptId));

    console.log(
      `Receipt ${receiptId} extracted successfully: vendor=${extractionResult.vendor}, amount=${extractionResult.amount} ${extractionResult.currency}, confidence=${confidenceScore}`
    );

    // TODO: Queue sync job to send to destinations
    // This would look up active destinations for the org and queue sync messages
  } catch (error) {
    console.error(`Failed to process receipt ${receiptId}:`, error);

    // Update receipt with error status
    await db
      .update(receipts)
      .set({
        status: ReceiptStatus.Failed,
        extractionError:
          error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(receipts.id, receiptId));
  }
}
