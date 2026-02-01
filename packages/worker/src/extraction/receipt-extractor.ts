import { Mistral } from "@mistralai/mistralai";
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

const EXTRACTION_MODEL = "mistral-ocr-latest";
const EXTRACTION_VERSION = "1.0.0";

/**
 * Document annotation prompt for structured receipt extraction
 * Using Mistral OCR's document_annotation feature for structured JSON output
 */
const EXTRACTION_PROMPT = `Extract all receipt information into a structured JSON object with the following fields:

{
  "rawText": "The full raw OCR text from the receipt",
  "vendor": "merchant/store name or null",
  "vendorAddress": "full address if visible or null",
  "vendorPhone": "phone number if visible or null",
  "amount": total amount as number or null,
  "currency": "3-letter ISO currency code (USD, EUR, GBP, etc.) or null",
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
  "fieldConfidences": {
    "vendor": confidence 0.0-1.0 based on OCR clarity,
    "amount": confidence 0.0-1.0,
    "date": confidence 0.0-1.0,
    "currency": confidence 0.0-1.0,
    "category": confidence 0.0-1.0
  }
}

Category guidelines:
- FOOD: Restaurants, groceries, cafes, food delivery
- TRAVEL: Airlines, hotels, car rentals, gas stations, rideshare
- OFFICE: Office supplies, printing, shipping
- SOFTWARE: Software subscriptions, digital services, SaaS
- UTILITIES: Phone, internet, electricity, water
- ENTERTAINMENT: Movies, concerts, streaming services, games
- HEALTHCARE: Pharmacy, medical services, health products
- SHOPPING: General retail, clothing, electronics
- SERVICES: Professional services, repairs, maintenance
- OTHER: Anything that doesn't fit above categories

Important:
- For amounts, use decimal numbers (e.g., 12.99 not "$12.99")
- For dates, use ISO 8601 format (YYYY-MM-DD)
- Set fields to null if not visible or unclear
- Handle faded, partial, or non-English receipts by extracting what's visible`;

// ============================================================================
// Receipt Extractor Class
// ============================================================================

export class ReceiptExtractor {
  private client: Mistral;

  constructor(apiKey: string) {
    this.client = new Mistral({
      apiKey,
    });
  }

  /**
   * Extract data from a receipt image using Mistral OCR
   * Mistral OCR is optimized for document understanding at ~$1/1000 pages
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

      // Build the document source for Mistral OCR
      const document = this.buildDocumentSource(input);

      // Call Mistral OCR API with structured extraction
      const response = await this.client.ocr.process({
        model: EXTRACTION_MODEL,
        document,
        // Use document annotation for structured JSON output
        documentAnnotationFormat: { type: "json_object" },
        documentAnnotationPrompt: EXTRACTION_PROMPT,
      });

      // Extract markdown content from pages
      const rawText = response.pages
        ?.map((page) => page.markdown || "")
        .join("\n\n");

      // Parse the structured annotation response
      // The annotation is returned separately from the OCR text
      let extractedData: ReceiptExtractionResult | null = null;

      // Check if we got structured annotation back
      // Mistral returns the annotation in the response
      const annotationText =
        (response as unknown as { annotation?: string }).annotation ||
        this.extractJsonFromPages(response.pages);

      if (annotationText) {
        extractedData = this.parseResponse(annotationText);
      }

      // If structured extraction failed, try to parse from raw OCR text
      if (!extractedData && rawText) {
        extractedData = this.parseFromRawText(rawText);
      }

      if (!extractedData) {
        return {
          success: false,
          error: "Failed to extract structured data from receipt",
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Add raw text if not already present
      if (!extractedData.rawText && rawText) {
        extractedData.rawText = rawText;
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
   * Build the document source for Mistral OCR API
   */
  private buildDocumentSource(
    input: ExtractionInput
  ):
    | { type: "image_url"; imageUrl: string }
    | { type: "document_url"; documentUrl: string } {
    if (input.imageBase64 && input.mediaType) {
      // Mistral accepts base64 as a data URL
      const dataUrl = `data:${input.mediaType};base64,${input.imageBase64}`;
      return {
        type: "image_url",
        imageUrl: dataUrl,
      };
    }

    if (input.imageUrl) {
      // For image URLs, use image_url type
      return {
        type: "image_url",
        imageUrl: input.imageUrl,
      };
    }

    // This shouldn't happen due to earlier validation, but TypeScript needs it
    throw new Error("No valid image source provided");
  }

  /**
   * Try to extract JSON from OCR pages if annotation is not directly available
   */
  private extractJsonFromPages(
    pages?: Array<{ markdown?: string }>
  ): string | null {
    if (!pages) return null;

    for (const page of pages) {
      if (page.markdown) {
        // Look for JSON in the markdown content
        const jsonMatch = page.markdown.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          return jsonMatch[1];
        }
        // Also try to find raw JSON object
        const rawJsonMatch = page.markdown.match(/\{[\s\S]*\}/);
        if (rawJsonMatch) {
          return rawJsonMatch[0];
        }
      }
    }
    return null;
  }

  /**
   * Parse the JSON response from OCR
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
   * Attempt to parse structured data from raw OCR text
   * This is a fallback when structured extraction doesn't work
   */
  private parseFromRawText(rawText: string): ReceiptExtractionResult | null {
    try {
      // Initialize with required nullable fields
      const result: ReceiptExtractionResult = {
        rawText,
        vendor: null,
        amount: null,
        currency: null,
        date: null,
        fieldConfidences: {
          vendor: 0.5,
          amount: 0.5,
          date: 0.5,
          currency: 0.5,
          category: 0.3,
        },
      };

      // Extract vendor (usually at the top, often in larger text)
      const lines = rawText.split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        // First non-empty line is often the vendor name
        result.vendor = lines[0].trim();
        result.fieldConfidences!.vendor = 0.6;
      }

      // Extract total amount (look for "total", "amount due", etc.)
      const totalMatch = rawText.match(
        /(?:total|amount\s*due|grand\s*total|balance\s*due)[:\s]*\$?\s*([\d,]+\.?\d*)/i
      );
      if (totalMatch) {
        result.amount = parseFloat(totalMatch[1].replace(/,/g, ""));
        result.fieldConfidences!.amount = 0.7;
      }

      // Extract date (various formats)
      const dateMatch = rawText.match(
        /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(\d{4}[-/]\d{1,2}[-/]\d{1,2})/
      );
      if (dateMatch) {
        const dateStr = dateMatch[0];
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          result.date = parsedDate.toISOString().split("T")[0];
          result.fieldConfidences!.date = 0.6;
        }
      }

      // Default to USD if we found an amount with $
      if (rawText.includes("$")) {
        result.currency = "USD";
        result.fieldConfidences!.currency = 0.7;
      }

      // Try to detect category from common keywords
      result.category = this.detectCategoryFromText(rawText);

      return result;
    } catch (e) {
      console.error("Failed to parse from raw text:", e);
      return null;
    }
  }

  /**
   * Detect receipt category from text content
   */
  private detectCategoryFromText(text: string): string {
    const lowerText = text.toLowerCase();

    // Food/Restaurant keywords
    if (
      /restaurant|cafe|coffee|pizza|burger|food|grocery|supermarket|deli|bakery/i.test(
        lowerText
      )
    ) {
      return ReceiptCategory.Food;
    }

    // Travel keywords
    if (
      /airline|flight|hotel|motel|car rental|gas station|uber|lyft|taxi|parking/i.test(
        lowerText
      )
    ) {
      return ReceiptCategory.Travel;
    }

    // Office keywords
    if (
      /office|staples|fedex|ups|usps|shipping|printing|copy/i.test(lowerText)
    ) {
      return ReceiptCategory.Office;
    }

    // Software keywords
    if (
      /software|subscription|saas|cloud|digital|app store|google play/i.test(
        lowerText
      )
    ) {
      return ReceiptCategory.Software;
    }

    // Utilities keywords
    if (
      /electric|water|gas|internet|phone|mobile|utility|bill/i.test(lowerText)
    ) {
      return ReceiptCategory.Utilities;
    }

    // Entertainment keywords
    if (/movie|cinema|theater|concert|netflix|spotify|game/i.test(lowerText)) {
      return ReceiptCategory.Entertainment;
    }

    // Healthcare keywords
    if (
      /pharmacy|cvs|walgreens|medical|doctor|hospital|health/i.test(lowerText)
    ) {
      return ReceiptCategory.Healthcare;
    }

    // Shopping keywords
    if (
      /walmart|target|amazon|retail|store|shop|mall|clothing|electronics/i.test(
        lowerText
      )
    ) {
      return ReceiptCategory.Shopping;
    }

    // Services keywords
    if (/repair|service|maintenance|cleaning|salon|barber/i.test(lowerText)) {
      return ReceiptCategory.Services;
    }

    return ReceiptCategory.Other;
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
