import { format as formatDate } from "date-fns";
import { Receipt, ReceiptCategory, ReceiptStatus } from "shared/src/db/schema";
import { ExportColumn } from "shared/src/types/export";

/**
 * Format a receipt value for the given column
 */
export function formatReceiptValue(
  receipt: Receipt,
  column: ExportColumn
): string | null {
  switch (column) {
    case ExportColumn.Date:
      return receipt.date ? formatDate(receipt.date, "yyyy-MM-dd") : null;
    case ExportColumn.Vendor:
      return receipt.vendor;
    case ExportColumn.Amount:
      return receipt.amount?.toFixed(2) ?? null;
    case ExportColumn.Currency:
      return receipt.currency;
    case ExportColumn.Category:
      return formatCategory(receipt.category);
    case ExportColumn.PaymentMethod:
      return receipt.paymentMethod;
    case ExportColumn.Notes:
      // Notes could come from extraction result
      return receipt.extractionResult?.rawText?.slice(0, 200) ?? null;
    case ExportColumn.ReceiptImageUrl:
      return receipt.originalImageUrl ?? receipt.processedImageUrl;
    case ExportColumn.TaxAmount:
      return receipt.taxAmount?.toFixed(2) ?? null;
    case ExportColumn.Subtotal:
      return receipt.subtotal?.toFixed(2) ?? null;
    case ExportColumn.ReceiptNumber:
      return receipt.receiptNumber;
    case ExportColumn.Status:
      return formatStatus(receipt.status);
    case ExportColumn.CreatedAt:
      return receipt.createdAt
        ? formatDate(receipt.createdAt, "yyyy-MM-dd HH:mm:ss")
        : null;
    default:
      return null;
  }
}

/**
 * Format category enum value to display name
 */
function formatCategory(category: ReceiptCategory | null | undefined): string | null {
  if (!category) return null;

  const categoryMap: Record<ReceiptCategory, string> = {
    [ReceiptCategory.Food]: "Food & Dining",
    [ReceiptCategory.Travel]: "Travel",
    [ReceiptCategory.Office]: "Office Supplies",
    [ReceiptCategory.Software]: "Software",
    [ReceiptCategory.Utilities]: "Utilities",
    [ReceiptCategory.Entertainment]: "Entertainment",
    [ReceiptCategory.Healthcare]: "Healthcare",
    [ReceiptCategory.Shopping]: "Shopping",
    [ReceiptCategory.Services]: "Services",
    [ReceiptCategory.Other]: "Other",
  };

  return categoryMap[category] ?? category;
}

/**
 * Format status enum value to display name
 */
function formatStatus(status: ReceiptStatus): string {
  const statusMap: Record<ReceiptStatus, string> = {
    [ReceiptStatus.Pending]: "Pending",
    [ReceiptStatus.Processing]: "Processing",
    [ReceiptStatus.Extracted]: "Extracted",
    [ReceiptStatus.Failed]: "Failed",
    [ReceiptStatus.Archived]: "Archived",
  };

  return statusMap[status] ?? status;
}

/**
 * Generate a filename for the export
 */
export function generateExportFilename(
  orgName: string,
  fileFormat: "csv" | "xlsx",
  startDate?: string,
  endDate?: string
): string {
  const parts = ["receipts", orgName];

  if (startDate && endDate) {
    const start = startDate.split("T")[0];
    const end = endDate.split("T")[0];
    parts.push(`${start}_to_${end}`);
  } else {
    parts.push(formatDate(new Date(), "yyyy-MM-dd"));
  }

  return `${parts.join("_")}.${fileFormat}`;
}
