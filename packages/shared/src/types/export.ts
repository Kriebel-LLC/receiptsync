import * as z from "zod";
import { ReceiptCategory, ReceiptStatus } from "../db/schema";

// ============================================================================
// Export Format Types
// ============================================================================

export enum ExportFormat {
  Csv = "CSV",
  Excel = "XLSX",
}

// ============================================================================
// Export Column Configuration
// ============================================================================

/**
 * Available columns for receipt export
 */
export enum ExportColumn {
  Date = "DATE",
  Vendor = "VENDOR",
  Amount = "AMOUNT",
  Currency = "CURRENCY",
  Category = "CATEGORY",
  PaymentMethod = "PAYMENT_METHOD",
  Notes = "NOTES",
  ReceiptImageUrl = "RECEIPT_IMAGE_URL",
  TaxAmount = "TAX_AMOUNT",
  Subtotal = "SUBTOTAL",
  ReceiptNumber = "RECEIPT_NUMBER",
  Status = "STATUS",
  CreatedAt = "CREATED_AT",
}

/**
 * Default columns for export
 */
export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
  ExportColumn.Date,
  ExportColumn.Vendor,
  ExportColumn.Amount,
  ExportColumn.Currency,
  ExportColumn.Category,
  ExportColumn.PaymentMethod,
  ExportColumn.Notes,
  ExportColumn.ReceiptImageUrl,
];

/**
 * Column display names for headers
 */
export const EXPORT_COLUMN_LABELS: Record<ExportColumn, string> = {
  [ExportColumn.Date]: "Date",
  [ExportColumn.Vendor]: "Vendor",
  [ExportColumn.Amount]: "Amount",
  [ExportColumn.Currency]: "Currency",
  [ExportColumn.Category]: "Category",
  [ExportColumn.PaymentMethod]: "Payment Method",
  [ExportColumn.Notes]: "Notes",
  [ExportColumn.ReceiptImageUrl]: "Receipt Image URL",
  [ExportColumn.TaxAmount]: "Tax Amount",
  [ExportColumn.Subtotal]: "Subtotal",
  [ExportColumn.ReceiptNumber]: "Receipt Number",
  [ExportColumn.Status]: "Status",
  [ExportColumn.CreatedAt]: "Created At",
};

// ============================================================================
// Export Request Schema
// ============================================================================

export const ExportRequestSchema = z.object({
  format: z.nativeEnum(ExportFormat),
  columns: z
    .array(z.nativeEnum(ExportColumn))
    .min(1)
    .default(DEFAULT_EXPORT_COLUMNS),
  filters: z
    .object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      categories: z.array(z.nativeEnum(ReceiptCategory)).optional(),
      statuses: z.array(z.nativeEnum(ReceiptStatus)).optional(),
      vendors: z.array(z.string()).optional(),
    })
    .optional(),
  includeImages: z.boolean().default(false), // For Excel, embed images
});

export type ExportRequest = z.infer<typeof ExportRequestSchema>;

// ============================================================================
// Export Job Types (for async exports)
// ============================================================================

export enum ExportJobStatus {
  Pending = "PENDING",
  Processing = "PROCESSING",
  Completed = "COMPLETED",
  Failed = "FAILED",
  Expired = "EXPIRED",
}

export interface ExportJob {
  id: string;
  orgId: string;
  userId: string;
  format: ExportFormat;
  status: ExportJobStatus;
  columns: ExportColumn[];
  filters?: ExportRequest["filters"];
  includeImages: boolean;
  receiptCount?: number;
  downloadUrl?: string;
  expiresAt?: Date;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// Export Response Types
// ============================================================================

export interface ExportResponse {
  // For synchronous exports (small datasets)
  data?: ArrayBuffer;
  filename?: string;
  contentType?: string;

  // For async exports (large datasets)
  jobId?: string;
  message?: string;
}

// ============================================================================
// Queue Message Types
// ============================================================================

export interface ExportReceiptsMessage {
  type: "EXPORT_RECEIPTS";
  jobId: string;
  orgId: string;
  userId: string;
  format: ExportFormat;
  columns: ExportColumn[];
  filters?: ExportRequest["filters"];
  includeImages: boolean;
}
