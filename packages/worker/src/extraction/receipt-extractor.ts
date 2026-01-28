import Anthropic from "@anthropic-ai/sdk";
import {
  ReceiptExtractionResult,
  ReceiptExtractionResultSchema,
} from "shared/src/types/receipt";
import { ReceiptCategory } from "shared/src/db/schema";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for receipt extraction - supports image URL or base64 encoded image
 */
export interface ExtractionInput {
  /** URL to the receipt image */
  imageUrl?: string;
  /** Base64 encoded image data */
  imageBase64?: string;
  /** Media type for base64 images (e.g., "image/jpeg", "image/png") */
  mediaType?: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

/**
 * Result of the extraction process
 */
export interface ExtractionResponse {
  success: boolean;
  data?: ReceiptExtractionResult;
  error?: string;
  /** Time taken for the extraction in milliseconds */
  processingTimeMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const EXTRACTION_MODEL = "claude-sonnet-4-20250514";
const EXTRACTION_VERSION = "1.0.0";

/**
 * System prompt for receipt extraction
 */
const SYSTEM_PROMPT = `You are an expert receipt OCR and data extraction system. Your task is to analyze receipt images and extract structured data with high accuracy.

Guidelines:
1. Extract all visible information from the receipt
2. For amounts, always use decimal numbers (e.g., 12.99 not "12.99" or "$12.99")
3. For dates, use ISO 8601 format (YYYY-MM-DD)
4. For currency, use ISO 4217 3-letter codes (USD, EUR, GBP, etc.)
5. If a field is not visible or unclear, set it to null
6. Provide confidence scores (0.0 to 1.0) for key fields based on readability
7. Handle faded, partial, or non-English receipts by extracting what's visible
8. Detect the receipt category based on merchant type and items

Categories to choose from:
- FOOD: Restaurants, groceries, cafes, food delivery
- TRAVEL: Airlines, hotels, car rentals, gas stations, rideshare
- OFFICE: Office supplies, printing, shipping
- SOFTWARE: Software subscriptions, digital services, SaaS
- UTILITIES: Phone, internet, electricity, water
- ENTERTAINMENT: Movies, concerts, streaming services, games
- HEALTHCARE: Pharmacy, medical services, health products
- SHOPPING: General retail, clothing, electronics
- SERVICES: Professional services, repairs, maintenance
- OTHER: Anything that doesn't fit above categories`;

/**
 * User prompt for receipt extraction
 */
const USER_PROMPT = `Please analyze this receipt image and extract the following information into a JSON object:

{
  "rawText": "optional raw OCR text if helpful",
  "vendor": "merchant/store name or null",
  "vendorAddress": "full address if visible or null",
  "vendorPhone": "phone number if visible or null",
  "amount": total amount as number or null,
  "currency": "3-letter ISO currency code or null",
  "subtotal": subtotal before tax as number or null,
  "taxAmount": tax amount as number or null,
  "tipAmount": tip amount as number or null,
  "discountAmount": discount amount as number or null,
  "date": "YYYY-MM-DD format or null",
  "time": "HH:MM format if visible or null",
  "paymentMethod": "Cash, Credit Card, Debit, etc. or null",
  "cardLastFour": "last 4 digits if visible or null",
  "receiptNumber": "receipt/transaction number or null",
  "transactionId": "transaction ID if different from receipt number or null",
  "lineItems": [
    {
      "description": "item name",
      "quantity": number or null,
      "unitPrice": number or null,
      "totalPrice": number or null
    }
  ],
  "category": "one of: FOOD, TRAVEL, OFFICE, SOFTWARE, UTILITIES, ENTERTAINMENT, HEALTHCARE, SHOPPING, SERVICES, OTHER",
  "categoryConfidence": confidence score 0.0-1.0 for category,
  "fieldConfidences": {
    "vendor": confidence 0.0-1.0,
    "amount": confidence 0.0-1.0,
    "date": confidence 0.0-1.0,
    "currency": confidence 0.0-1.0,
    "category": confidence 0.0-1.0
  }
}

Important:
- Return ONLY the JSON object, no additional text
- Use null for any field that cannot be determined
- Confidence scores should reflect readability and certainty
- If the image is not a receipt, still try to extract any visible information`;

// ============================================================================
// Receipt Extractor Class
// ============================================================================

export class ReceiptExtractor {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
    });
  }

  /**
   * Extract data from a receipt image
   */
  async extract(input: ExtractionInput): Promise<ExtractionResponse> {
    const startTime = Date.now();

    try {
      // Validate input
      if (!input.imageUrl && !input.imageBase64) {
        return {
          success: false,
          error: "Either imageUrl or imageBase64 must be provided",
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Build the image content for Claude
      const imageContent = this.buildImageContent(input);

      // Call Claude Vision API
      const response = await this.client.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              imageContent,
              {
                type: "text",
                text: USER_PROMPT,
              },
            ],
          },
        ],
      });

      // Extract the text response
      const textContent = response.content.find(
        (block) => block.type === "text"
      );
      if (!textContent || textContent.type !== "text") {
        return {
          success: false,
          error: "No text response from Claude",
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Parse the JSON response
      const extractedData = this.parseResponse(textContent.text);
      if (!extractedData) {
        return {
          success: false,
          error: "Failed to parse extraction response as JSON",
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Add extraction metadata
      const processingTimeMs = Date.now() - startTime;
      extractedData.extractionModel = EXTRACTION_MODEL;
      extractedData.extractionVersion = EXTRACTION_VERSION;
      extractedData.processingTimeMs = processingTimeMs;

      // Validate the extracted data against our schema
      const validationResult =
        ReceiptExtractionResultSchema.safeParse(extractedData);
      if (!validationResult.success) {
        console.error(
          "Extraction validation errors:",
          validationResult.error.issues
        );
        // Still return the data but log validation issues
        // The data might be partially valid
      }

      return {
        success: true,
        data: extractedData,
        processingTimeMs,
      };
    } catch (error) {
      console.error("Receipt extraction error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown extraction error",
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build the image content block for the Claude API
   */
  private buildImageContent(
    input: ExtractionInput
  ): Anthropic.Messages.ImageBlockParam {
    if (input.imageBase64 && input.mediaType) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: input.mediaType,
          data: input.imageBase64,
        },
      };
    }

    if (input.imageUrl) {
      return {
        type: "image",
        source: {
          type: "url",
          url: input.imageUrl,
        },
      };
    }

    // This shouldn't happen due to earlier validation, but TypeScript needs it
    throw new Error("No valid image source provided");
  }

  /**
   * Parse the JSON response from Claude
   */
  private parseResponse(text: string): ReceiptExtractionResult | null {
    try {
      // Try to find JSON in the response (in case there's extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize category to uppercase enum value
      if (parsed.category) {
        parsed.category = this.normalizeCategory(parsed.category);
      }

      return parsed as ReceiptExtractionResult;
    } catch (e) {
      console.error("JSON parse error:", e);
      return null;
    }
  }

  /**
   * Normalize category string to our enum values
   */
  private normalizeCategory(category: string): string {
    const normalized = category.toUpperCase().replace(/[^A-Z]/g, "");
    const validCategories = Object.values(ReceiptCategory);
    if (validCategories.includes(normalized as ReceiptCategory)) {
      return normalized;
    }
    return ReceiptCategory.Other;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate an overall confidence score from field confidences
 */
export function calculateOverallConfidence(
  data: ReceiptExtractionResult
): number {
  const confidences = data.fieldConfidences;
  if (!confidences) {
    return 0.5; // Default confidence if no field confidences
  }

  const scores: number[] = [];
  if (confidences.vendor !== undefined) scores.push(confidences.vendor);
  if (confidences.amount !== undefined) scores.push(confidences.amount);
  if (confidences.date !== undefined) scores.push(confidences.date);
  if (confidences.currency !== undefined) scores.push(confidences.currency);

  if (scores.length === 0) {
    return 0.5;
  }

  // Weighted average - amount and vendor are most important
  const weights = { vendor: 0.3, amount: 0.4, date: 0.2, currency: 0.1 };
  let weightedSum = 0;
  let totalWeight = 0;

  if (confidences.vendor !== undefined) {
    weightedSum += confidences.vendor * weights.vendor;
    totalWeight += weights.vendor;
  }
  if (confidences.amount !== undefined) {
    weightedSum += confidences.amount * weights.amount;
    totalWeight += weights.amount;
  }
  if (confidences.date !== undefined) {
    weightedSum += confidences.date * weights.date;
    totalWeight += weights.date;
  }
  if (confidences.currency !== undefined) {
    weightedSum += confidences.currency * weights.currency;
    totalWeight += weights.currency;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

/**
 * Map extracted category to ReceiptCategory enum
 */
export function mapToReceiptCategory(
  category: string | null | undefined
): ReceiptCategory | null {
  if (!category) return null;

  const normalized = category.toUpperCase().replace(/[^A-Z]/g, "");
  const validCategories = Object.values(ReceiptCategory);

  if (validCategories.includes(normalized as ReceiptCategory)) {
    return normalized as ReceiptCategory;
  }

  return ReceiptCategory.Other;
}

/**
 * Parse a date string to a Date object
 */
export function parseExtractedDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
}
