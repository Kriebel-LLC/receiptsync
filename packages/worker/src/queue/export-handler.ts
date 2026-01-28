import { WorkerEnv } from "@/src/types";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db } from "shared/src/db";
import {
  receipts,
  exportJobs,
  ExportJobStatus,
  ExportFormat,
  ReceiptStatus,
  ReceiptCategory,
} from "shared/src/db/schema";
import { ExportReceiptsQueueMessage } from "./index";

/**
 * Handle export receipts queue message
 * This processes large export jobs asynchronously
 */
export async function handleExportReceiptsMessage(
  env: WorkerEnv,
  message: ExportReceiptsQueueMessage
): Promise<void> {
  const { jobId, orgId, format, columns, filters, includeImages } = message;
  const database = db(env);

  console.log(`Processing export job ${jobId} for org ${orgId}`);

  try {
    // Update job status to processing
    await database
      .update(exportJobs)
      .set({ status: ExportJobStatus.Processing })
      .where(eq(exportJobs.id, jobId));

    // Build query conditions
    const conditions = [eq(receipts.orgId, orgId)];

    // Date range filter
    if (filters?.startDate) {
      conditions.push(gte(receipts.date, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(receipts.date, new Date(filters.endDate)));
    }

    // Category filter
    if (filters?.categories && filters.categories.length > 0) {
      conditions.push(
        inArray(receipts.category, filters.categories as ReceiptCategory[])
      );
    }

    // Status filter
    if (filters?.statuses && filters.statuses.length > 0) {
      conditions.push(
        inArray(receipts.status, filters.statuses as ReceiptStatus[])
      );
    } else {
      conditions.push(eq(receipts.status, ReceiptStatus.Extracted));
    }

    // Fetch all receipts
    const receiptData = await database
      .select()
      .from(receipts)
      .where(and(...conditions))
      .orderBy(receipts.date);

    console.log(`Found ${receiptData.length} receipts to export for job ${jobId}`);

    // Generate export content
    let fileContent: string;
    let contentType: string;
    let fileExtension: string;

    if (format === ExportFormat.Csv) {
      fileContent = generateCSV(receiptData, columns);
      contentType = "text/csv";
      fileExtension = "csv";
    } else {
      // For Excel, we need to generate the buffer differently
      // In worker context, we'll use CSV as fallback since ExcelJS may not work
      // TODO: Implement proper Excel generation in worker
      fileContent = generateCSV(receiptData, columns);
      contentType = "text/csv";
      fileExtension = "csv";
      console.warn(`Excel export requested but falling back to CSV for job ${jobId}`);
    }

    // TODO: Upload to R2/S3 storage and get download URL
    // For now, we'll store the file content inline (not recommended for production)
    // This is a placeholder - in production, you'd upload to object storage
    const downloadUrl = `data:${contentType};base64,${btoa(fileContent)}`;

    // Calculate expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update job with results
    await database
      .update(exportJobs)
      .set({
        status: ExportJobStatus.Completed,
        downloadUrl,
        receiptCount: receiptData.length,
        expiresAt,
        completedAt: new Date(),
      })
      .where(eq(exportJobs.id, jobId));

    console.log(`Export job ${jobId} completed successfully`);

    // TODO: Send email notification with download link
    // This would require integrating with an email service
    // await sendExportReadyEmail(job.notificationEmail, downloadUrl);

  } catch (error) {
    console.error(`Export job ${jobId} failed:`, error);

    // Update job with error
    await database
      .update(exportJobs)
      .set({
        status: ExportJobStatus.Failed,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(exportJobs.id, jobId));
  }
}

/**
 * Simple CSV generation for worker context
 */
function generateCSV(receiptData: typeof receipts.$inferSelect[], columns: string[]): string {
  const columnLabels: Record<string, string> = {
    DATE: "Date",
    VENDOR: "Vendor",
    AMOUNT: "Amount",
    CURRENCY: "Currency",
    CATEGORY: "Category",
    PAYMENT_METHOD: "Payment Method",
    NOTES: "Notes",
    RECEIPT_IMAGE_URL: "Receipt Image URL",
    TAX_AMOUNT: "Tax Amount",
    SUBTOTAL: "Subtotal",
    RECEIPT_NUMBER: "Receipt Number",
    STATUS: "Status",
    CREATED_AT: "Created At",
  };

  // Header row
  const headers = columns.map((col) => escapeCSV(columnLabels[col] || col));
  const lines: string[] = [headers.join(",")];

  // Data rows
  for (const receipt of receiptData) {
    const row = columns.map((col) => {
      const value = getReceiptValue(receipt, col);
      return escapeCSV(value);
    });
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

function getReceiptValue(
  receipt: typeof receipts.$inferSelect,
  column: string
): string | null {
  switch (column) {
    case "DATE":
      return receipt.date ? receipt.date.toISOString().split("T")[0] : null;
    case "VENDOR":
      return receipt.vendor;
    case "AMOUNT":
      return receipt.amount?.toFixed(2) ?? null;
    case "CURRENCY":
      return receipt.currency;
    case "CATEGORY":
      return receipt.category;
    case "PAYMENT_METHOD":
      return receipt.paymentMethod;
    case "NOTES":
      return receipt.extractionResult?.rawText?.slice(0, 200) ?? null;
    case "RECEIPT_IMAGE_URL":
      return receipt.originalImageUrl ?? receipt.processedImageUrl;
    case "TAX_AMOUNT":
      return receipt.taxAmount?.toFixed(2) ?? null;
    case "SUBTOTAL":
      return receipt.subtotal?.toFixed(2) ?? null;
    case "RECEIPT_NUMBER":
      return receipt.receiptNumber;
    case "STATUS":
      return receipt.status;
    case "CREATED_AT":
      return receipt.createdAt.toISOString();
    default:
      return null;
  }
}

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
