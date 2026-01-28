import * as z from "zod";

// ============================================================================
// Receipt Source Configuration
// ============================================================================

/**
 * Configuration for email-based receipt ingestion
 */
export const EmailSourceConfigurationSchema = z.strictObject({
  // The email address to monitor/receive receipts
  emailAddress: z.string().email(),
  // Whether to automatically process incoming emails
  autoProcess: z.boolean().default(true),
  // Filter rules for which emails to process
  filters: z
    .object({
      fromAddresses: z.array(z.string().email()).optional(),
      subjectPatterns: z.array(z.string()).optional(),
    })
    .optional(),
});

export type EmailSourceConfiguration = z.infer<
  typeof EmailSourceConfigurationSchema
>;

/**
 * Configuration for manual upload endpoint
 */
export const UploadSourceConfigurationSchema = z.strictObject({
  // Maximum file size in bytes
  maxFileSize: z.number().int().positive().default(10 * 1024 * 1024), // 10MB default
  // Allowed file types
  allowedMimeTypes: z
    .array(z.string())
    .default(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

export type UploadSourceConfiguration = z.infer<
  typeof UploadSourceConfigurationSchema
>;

/**
 * Configuration for API-based receipt ingestion
 */
export const ApiSourceConfigurationSchema = z.strictObject({
  // Webhook URL for receiving receipts
  webhookUrl: z.string().url().optional(),
  // API key for authentication (stored separately, this is just a reference)
  apiKeyId: z.string().optional(),
});

export type ApiSourceConfiguration = z.infer<
  typeof ApiSourceConfigurationSchema
>;

/**
 * Union type for all receipt source configurations
 */
export type ReceiptSourceConfiguration =
  | EmailSourceConfiguration
  | UploadSourceConfiguration
  | ApiSourceConfiguration;

// ============================================================================
// Receipt Extraction Types
// ============================================================================

/**
 * Individual line item extracted from a receipt
 */
export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  totalPrice: z.number().optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * Result of AI/OCR receipt extraction
 */
export const ReceiptExtractionResultSchema = z.object({
  // Raw extracted text from OCR
  rawText: z.string().optional(),

  // Structured extracted data
  vendor: z.string().nullable(),
  vendorAddress: z.string().nullable().optional(),
  vendorPhone: z.string().nullable().optional(),

  // Financial data
  amount: z.number().nullable(),
  currency: z.string().length(3).nullable(), // ISO 4217
  subtotal: z.number().nullable().optional(),
  taxAmount: z.number().nullable().optional(),
  tipAmount: z.number().nullable().optional(),
  discountAmount: z.number().nullable().optional(),

  // Date and time
  date: z.string().nullable(), // ISO 8601 date string
  time: z.string().nullable().optional(), // Time string if available

  // Transaction details
  paymentMethod: z.string().nullable().optional(),
  cardLastFour: z.string().length(4).nullable().optional(),
  receiptNumber: z.string().nullable().optional(),
  transactionId: z.string().nullable().optional(),

  // Line items
  lineItems: z.array(LineItemSchema).optional(),

  // Category prediction
  category: z.string().nullable().optional(),
  categoryConfidence: z.number().min(0).max(1).optional(),

  // Extraction metadata
  extractionModel: z.string().optional(), // Which AI model was used
  extractionVersion: z.string().optional(), // Model version
  processingTimeMs: z.number().optional(), // How long extraction took

  // Field-level confidence scores (0.0 to 1.0)
  fieldConfidences: z
    .object({
      vendor: z.number().min(0).max(1).optional(),
      amount: z.number().min(0).max(1).optional(),
      date: z.number().min(0).max(1).optional(),
      currency: z.number().min(0).max(1).optional(),
      category: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type ReceiptExtractionResult = z.infer<
  typeof ReceiptExtractionResultSchema
>;

// ============================================================================
// Sync Status Types
// ============================================================================

/**
 * Detailed sync status for tracking sync progress
 */
export interface SyncStatus {
  destinationId: string;
  destinationName: string;
  destinationType: string;
  status: "pending" | "syncing" | "synced" | "failed" | "skipped";
  externalId?: string; // ID in the destination system
  syncedAt?: Date;
  error?: string;
  retryCount: number;
}

/**
 * Summary of sync status across all destinations for a receipt
 */
export interface ReceiptSyncSummary {
  receiptId: string;
  totalDestinations: number;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  destinations: SyncStatus[];
}

// ============================================================================
// Receipt Processing Types
// ============================================================================

/**
 * Status of the receipt processing pipeline
 */
export interface ProcessingStatus {
  stage:
    | "uploaded"
    | "queued"
    | "extracting"
    | "extracted"
    | "syncing"
    | "completed"
    | "failed";
  progress: number; // 0-100
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Queue message for processing a receipt
 */
export interface ProcessReceiptMessage {
  type: "PROCESS_RECEIPT";
  receiptId: string;
  orgId: string;
  priority?: "high" | "normal" | "low";
}

/**
 * Queue message for syncing a receipt to destinations
 */
export interface SyncReceiptMessage {
  type: "SYNC_RECEIPT";
  receiptId: string;
  destinationIds?: string[]; // If empty, sync to all active destinations
}
