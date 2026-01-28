import { IRequest } from "itty-router";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "shared/src/db";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { WorkerEnv } from "../types";
import {
  ReceiptExtractor,
  ExtractionInput,
  calculateOverallConfidence,
  mapToReceiptCategory,
  parseExtractedDate,
  calculateBase64Hash,
  calculateUrlHash,
  lookupByImageHash,
} from "../extraction";
import { QueueMessageType } from "../queue";

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Schema for direct extraction request
 * Allows extracting from an image without storing in database
 */
const DirectExtractRequestSchema = z.object({
  /** URL to the receipt image */
  imageUrl: z.string().url().optional(),
  /** Base64 encoded image data */
  imageBase64: z.string().optional(),
  /** Media type for base64 images */
  mediaType: z
    .enum(["image/jpeg", "image/png", "image/gif", "image/webp"])
    .optional(),
  /** Organization ID for cache lookup */
  orgId: z.string().optional(),
  /** Skip cache lookup and force re-extraction */
  skipCache: z.boolean().optional().default(false),
});

/**
 * Schema for extract receipt request (for existing receipt)
 */
const ExtractReceiptRequestSchema = z.object({
  /** Organization ID */
  orgId: z.string(),
  /** Whether to process asynchronously via queue */
  async: z.boolean().optional().default(false),
});

// ============================================================================
// Response Helpers
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ error }, status);
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * POST /api/extract
 * Direct extraction from image URL or base64 data
 * Does not require a receipt record - useful for testing or one-off extractions
 */
export async function handleExtractReceiptDirect(
  request: IRequest,
  env: WorkerEnv
): Promise<Response> {
  try {
    // Parse and validate request body
    const body = await request.json();
    const parseResult = DirectExtractRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(
        `Invalid request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
        422
      );
    }

    const { imageUrl, imageBase64, mediaType, orgId, skipCache } =
      parseResult.data;

    // Validate that either imageUrl or imageBase64 is provided
    if (!imageUrl && !imageBase64) {
      return errorResponse(
        "Either imageUrl or imageBase64 must be provided",
        422
      );
    }

    // If base64 is provided, mediaType is required
    if (imageBase64 && !mediaType) {
      return errorResponse("mediaType is required when using imageBase64", 422);
    }

    const database = db(env);

    // Calculate image hash for caching
    let imageHash: string | undefined;
    try {
      if (imageBase64) {
        imageHash = await calculateBase64Hash(imageBase64);
      } else if (imageUrl) {
        imageHash = await calculateUrlHash(imageUrl);
      }
    } catch (e) {
      console.error("Failed to calculate image hash:", e);
      // Continue without caching if hash calculation fails
    }

    // Check cache if orgId is provided and skipCache is false
    if (imageHash && orgId && !skipCache) {
      const cacheResult = await lookupByImageHash(database, imageHash, orgId);
      if (cacheResult.found && cacheResult.extractionResult) {
        return jsonResponse({
          success: true,
          cached: true,
          existingReceiptId: cacheResult.existingReceiptId,
          data: cacheResult.extractionResult,
          confidenceScore: cacheResult.confidenceScore,
          imageHash,
        });
      }
    }

    // Build extraction input
    const extractionInput: ExtractionInput = {};
    if (imageUrl) {
      extractionInput.imageUrl = imageUrl;
    } else if (imageBase64 && mediaType) {
      extractionInput.imageBase64 = imageBase64;
      extractionInput.mediaType = mediaType;
    }

    // Perform extraction
    const extractor = new ReceiptExtractor(env.ANTHROPIC_API_KEY);
    const extractionResponse = await extractor.extract(extractionInput);

    if (!extractionResponse.success || !extractionResponse.data) {
      return errorResponse(
        extractionResponse.error || "Extraction failed",
        500
      );
    }

    const confidenceScore = calculateOverallConfidence(extractionResponse.data);

    return jsonResponse({
      success: true,
      cached: false,
      data: extractionResponse.data,
      confidenceScore,
      processingTimeMs: extractionResponse.processingTimeMs,
      imageHash,
    });
  } catch (error) {
    console.error("Direct extraction error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}

/**
 * POST /api/receipts/:receiptId/extract
 * Trigger extraction for an existing receipt record
 * Can process synchronously or queue for async processing
 */
export async function handleExtractReceipt(
  request: IRequest,
  env: WorkerEnv
): Promise<Response> {
  try {
    const receiptId = request.params?.receiptId;
    if (!receiptId) {
      return errorResponse("receiptId is required", 422);
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = ExtractReceiptRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(
        `Invalid request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
        422
      );
    }

    const { orgId, async: processAsync } = parseResult.data;
    const database = db(env);

    // Fetch the receipt
    const receiptResults = await database
      .select()
      .from(receipts)
      .where(eq(receipts.id, receiptId))
      .limit(1);

    if (receiptResults.length === 0) {
      return errorResponse("Receipt not found", 404);
    }

    const receipt = receiptResults[0];

    // Verify ownership
    if (receipt.orgId !== orgId) {
      return errorResponse("Receipt not found", 404);
    }

    // Check if already extracted
    if (receipt.status === ReceiptStatus.Extracted) {
      return jsonResponse({
        success: true,
        message: "Receipt already extracted",
        data: receipt.extractionResult,
        confidenceScore: receipt.confidenceScore,
      });
    }

    // Check if no image URL
    if (!receipt.originalImageUrl) {
      return errorResponse("Receipt has no image URL", 422);
    }

    // If async, queue the message and return immediately
    if (processAsync) {
      await env.QUEUE.send({
        type: QueueMessageType.ProcessReceipt,
        receiptId,
        orgId,
      });

      // Update status to pending
      await database
        .update(receipts)
        .set({ status: ReceiptStatus.Pending })
        .where(eq(receipts.id, receiptId));

      return jsonResponse({
        success: true,
        queued: true,
        message: "Receipt queued for extraction",
        receiptId,
      });
    }

    // Synchronous extraction
    // Update status to processing
    await database
      .update(receipts)
      .set({
        status: ReceiptStatus.Processing,
        extractionError: null,
      })
      .where(eq(receipts.id, receiptId));

    try {
      // Calculate image hash if not present
      let imageHash = receipt.imageHash;
      if (!imageHash) {
        imageHash = await calculateUrlHash(receipt.originalImageUrl);
        await database
          .update(receipts)
          .set({ imageHash })
          .where(eq(receipts.id, receiptId));
      }

      // Check cache
      const cacheResult = await lookupByImageHash(
        database,
        imageHash,
        orgId,
        receiptId
      );

      if (cacheResult.found && cacheResult.extractionResult) {
        const extractionResult = cacheResult.extractionResult;
        const category = mapToReceiptCategory(extractionResult.category);
        const receiptDate = parseExtractedDate(extractionResult.date);

        await database
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

        return jsonResponse({
          success: true,
          cached: true,
          existingReceiptId: cacheResult.existingReceiptId,
          data: extractionResult,
          confidenceScore: cacheResult.confidenceScore,
        });
      }

      // Perform extraction
      const extractor = new ReceiptExtractor(env.ANTHROPIC_API_KEY);
      const extractionResponse = await extractor.extract({
        imageUrl: receipt.originalImageUrl,
      });

      if (!extractionResponse.success || !extractionResponse.data) {
        throw new Error(extractionResponse.error || "Extraction failed");
      }

      const extractionResult = extractionResponse.data;
      const confidenceScore = calculateOverallConfidence(extractionResult);
      const category = mapToReceiptCategory(extractionResult.category);
      const receiptDate = parseExtractedDate(extractionResult.date);

      // Update receipt with extracted data
      await database
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

      return jsonResponse({
        success: true,
        cached: false,
        data: extractionResult,
        confidenceScore,
        processingTimeMs: extractionResponse.processingTimeMs,
      });
    } catch (error) {
      // Update status to failed
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await database
        .update(receipts)
        .set({
          status: ReceiptStatus.Failed,
          extractionError: errorMessage,
        })
        .where(eq(receipts.id, receiptId));

      return errorResponse(errorMessage, 500);
    }
  } catch (error) {
    console.error("Extract receipt error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
}
