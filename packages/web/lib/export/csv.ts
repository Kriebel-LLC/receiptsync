import { Receipt } from "shared/src/db/schema";
import {
  ExportColumn,
  EXPORT_COLUMN_LABELS,
} from "shared/src/types/export";
import { formatReceiptValue } from "./utils";

/**
 * Escape CSV value according to RFC 4180
 */
function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // If the value contains a comma, quote, or newline, wrap in quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    // Escape double quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV content from receipts
 */
export function generateCSV(
  receipts: Receipt[],
  columns: ExportColumn[]
): string {
  // Generate header row
  const headers = columns.map((col) => escapeCSV(EXPORT_COLUMN_LABELS[col]));
  const lines: string[] = [headers.join(",")];

  // Generate data rows
  for (const receipt of receipts) {
    const row = columns.map((col) => {
      const value = formatReceiptValue(receipt, col);
      return escapeCSV(value);
    });
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Generate CSV as a Buffer
 */
export function generateCSVBuffer(
  receipts: Receipt[],
  columns: ExportColumn[]
): Buffer {
  const csvContent = generateCSV(receipts, columns);
  return Buffer.from(csvContent, "utf-8");
}
