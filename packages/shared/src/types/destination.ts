import * as z from "zod";
import { DestinationType } from "./destination-type";

// ============================================================================
// Google Sheets Configuration
// ============================================================================

export const GoogleSheetsDestinationConfigurationSchema = z.strictObject({
  spreadsheetId: z.string().min(1),
  sheetId: z.number().int().nonnegative().optional(),
  // Field mapping: which columns to use for receipt data
  fieldMapping: z
    .object({
      date: z.string().optional(),
      vendor: z.string().optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      category: z.string().optional(),
      taxAmount: z.string().optional(),
      subtotal: z.string().optional(),
      paymentMethod: z.string().optional(),
      receiptNumber: z.string().optional(),
      imageUrl: z.string().optional(),
    })
    .optional(),
});

export type GoogleSheetsDestinationConfiguration = z.infer<
  typeof GoogleSheetsDestinationConfigurationSchema
>;

// ============================================================================
// Notion Configuration
// ============================================================================

export const NotionFieldMappingSchema = z.record(z.string(), z.string());

export type NotionFieldMapping = z.infer<typeof NotionFieldMappingSchema>;

export const NotionDestinationConfigurationSchema = z.strictObject({
  databaseId: z.string().min(1),
  // Maps receipt fields to Notion property names
  fieldMapping: NotionFieldMappingSchema.optional(),
});

export type NotionDestinationConfiguration = z.infer<
  typeof NotionDestinationConfigurationSchema
>;

// ============================================================================
// Unified Configuration Types
// ============================================================================

export type DestinationConfiguration =
  | GoogleSheetsDestinationConfiguration
  | NotionDestinationConfiguration;

export const configurationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(DestinationType.GoogleSheets),
    configuration: GoogleSheetsDestinationConfigurationSchema,
  }),
  z.object({
    type: z.literal(DestinationType.Notion),
    configuration: NotionDestinationConfigurationSchema,
  }),
]);

// ============================================================================
// Destination Metadata
// ============================================================================

/**
 * Optional metadata for destination-specific state tracking
 */
export type DestinationMetadata = {
  // Last successfully synced receipt ID for incremental sync
  lastSyncedReceiptId?: string;
  // Cursor for paginated APIs
  cursor?: string;
  // Any additional type-specific state
  [key: string]: unknown;
};

// ============================================================================
// Destination Error Types
// ============================================================================

export enum DestinationErrorType {
  AuthenticationError = "AUTHENTICATION_ERROR",
  PermissionError = "PERMISSION_ERROR",
  NotFoundError = "NOT_FOUND_ERROR",
  RateLimitError = "RATE_LIMIT_ERROR",
  ValidationError = "VALIDATION_ERROR",
  NetworkError = "NETWORK_ERROR",
  UnknownError = "UNKNOWN_ERROR",
}

export type DestinationErrorDetails = {
  errorType: DestinationErrorType;
  errorDisplayMessage: string;
  details?: string;
};
