import { WorkerEnv } from "../types";
import { and, eq, gte, lte, inArray, lt } from "drizzle-orm";
import { db } from "shared/src/db";
import {
  receipts,
  exportJobs,
  ExportJobStatus,
  ExportFormat,
  ReceiptStatus,
  ReceiptCategory,
} from "shared/src/db/schema";

// Process up to 5 export jobs per cron run
const MAX_JOBS_PER_RUN = 5;

/**
 * Process pending export jobs
 * Called by cron every hour (or more frequently as needed)
 */
export async function processExportJobs(env: WorkerEnv): Promise<void> {
  const database = db(env);

  // Find pending export jobs
  const pendingJobs = await database
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.status, ExportJobStatus.Pending))
    .orderBy(exportJobs.createdAt)
    .limit(MAX_JOBS_PER_RUN);

  console.log(`Found ${pendingJobs.length} pending export jobs`);

  // Also clean up expired jobs
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await database
    .update(exportJobs)
    .set({ status: ExportJobStatus.Expired })
    .where(
      and(
        eq(exportJobs.status, ExportJobStatus.Completed),
        lt(exportJobs.expiresAt, new Date())
      )
    );

  // Process each pending job
  for (const job of pendingJobs) {
    await processExportJob(database, job);
  }
}

async function processExportJob(
  database: ReturnType<typeof db>,
  job: typeof exportJobs.$inferSelect
): Promise<void> {
  console.log(`Processing export job ${job.id} for org ${job.orgId}`);

  try {
    // Update job status to processing
    await database
      .update(exportJobs)
      .set({ status: ExportJobStatus.Processing })
      .where(eq(exportJobs.id, job.id));

    const config = job.configuration;

    // Build query conditions
    const conditions = [eq(receipts.orgId, job.orgId)];

    // Date range filter
    if (config.filters?.startDate) {
      conditions.push(gte(receipts.date, new Date(config.filters.startDate)));
    }
    if (config.filters?.endDate) {
      conditions.push(lte(receipts.date, new Date(config.filters.endDate)));
    }

    // Category filter
    if (config.filters?.categories && config.filters.categories.length > 0) {
      conditions.push(
        inArray(receipts.category, config.filters.categories as ReceiptCategory[])
      );
    }

    // Status filter
    if (config.filters?.statuses && config.filters.statuses.length > 0) {
      conditions.push(
        inArray(receipts.status, config.filters.statuses as ReceiptStatus[])
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

    console.log(`Found ${receiptData.length} receipts to export for job ${job.id}`);

    // Generate CSV content (Excel generation may not work in worker context)
    const csvContent = generateCSV(receiptData, config.columns);

    // TODO: Upload to R2/S3 storage and get download URL
    // For now, we'll store as base64 data URL (not recommended for production)
    // In production, you'd upload to object storage like R2
    const downloadUrl = `data:text/csv;base64,${btoa(unescape(encodeURIComponent(csvContent)))}`;

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
      .where(eq(exportJobs.id, job.id));

    console.log(`Export job ${job.id} completed successfully with ${receiptData.length} receipts`);

    // TODO: Send email notification with download link
    // This would require integrating with an email service like SendGrid, AWS SES, etc.
    // await sendExportReadyEmail(job.notificationEmail, downloadUrl);

  } catch (error) {
    console.error(`Export job ${job.id} failed:`, error);

    // Update job with error
    await database
      .update(exportJobs)
      .set({
        status: ExportJobStatus.Failed,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(exportJobs.id, job.id));
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
