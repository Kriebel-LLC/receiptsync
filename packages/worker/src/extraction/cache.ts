import { eq, and, ne } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "shared/src/db/schema";
import { ReceiptStatus } from "shared/src/db/schema";
import { ReceiptExtractionResult } from "shared/src/types/receipt";

// ============================================================================
// Image Hash Utilities
// ============================================================================

/**
 * Calculate SHA-256 hash of image data
 * Works in Cloudflare Workers environment using Web Crypto API
 */
export async function calculateImageHash(
  imageData: ArrayBuffer
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", imageData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Calculate hash from base64 encoded image
 */
export async function calculateBase64Hash(base64Data: string): Promise<string> {
  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Create a proper ArrayBuffer copy from the Uint8Array
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return calculateImageHash(buffer);
}

/**
 * Calculate hash from image URL by fetching the content
 */
export async function calculateUrlHash(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return calculateImageHash(arrayBuffer);
}

// ============================================================================
// Cache Lookup
// ============================================================================

/**
 * Result of a cache lookup
 */
export interface CacheLookupResult {
  /** Whether a cached result was found */
  found: boolean;
  /** The cached extraction result, if found */
  extractionResult?: ReceiptExtractionResult;
  /** The existing receipt ID that has this hash, if found */
  existingReceiptId?: string;
  /** Overall confidence score from the cached result */
  confidenceScore?: number;
}

/**
 * Look up an existing extraction by image hash
 * This allows us to avoid re-processing duplicate images
 */
export async function lookupByImageHash(
  db: DrizzleD1Database<typeof schema>,
  imageHash: string,
  orgId: string,
  excludeReceiptId?: string
): Promise<CacheLookupResult> {
  // Query for an existing receipt with the same hash that was successfully extracted
  const query = db
    .select({
      id: schema.receipts.id,
      extractionResult: schema.receipts.extractionResult,
      confidenceScore: schema.receipts.confidenceScore,
    })
    .from(schema.receipts)
    .where(
      and(
        eq(schema.receipts.imageHash, imageHash),
        eq(schema.receipts.orgId, orgId),
        eq(schema.receipts.status, ReceiptStatus.Extracted),
        // Exclude the current receipt if specified (to avoid self-match)
        excludeReceiptId ? ne(schema.receipts.id, excludeReceiptId) : undefined
      )
    )
    .limit(1);

  const results = await query;

  if (results.length === 0) {
    return { found: false };
  }

  const existing = results[0];
  return {
    found: true,
    extractionResult: existing.extractionResult ?? undefined,
    existingReceiptId: existing.id,
    confidenceScore: existing.confidenceScore ?? undefined,
  };
}

/**
 * Check if an image has already been processed for an organization
 * Returns the existing receipt ID if found
 */
export async function checkDuplicate(
  db: DrizzleD1Database<typeof schema>,
  imageHash: string,
  orgId: string
): Promise<string | null> {
  const results = await db
    .select({ id: schema.receipts.id })
    .from(schema.receipts)
    .where(
      and(
        eq(schema.receipts.imageHash, imageHash),
        eq(schema.receipts.orgId, orgId),
        ne(schema.receipts.status, ReceiptStatus.Archived)
      )
    )
    .limit(1);

  return results.length > 0 ? results[0].id : null;
}
