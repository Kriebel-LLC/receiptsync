import ExcelJS from "exceljs";
import { Receipt } from "shared/src/db/schema";
import {
  ExportColumn,
  EXPORT_COLUMN_LABELS,
} from "shared/src/types/export";
import { formatReceiptValue } from "./utils";

/**
 * Generate Excel workbook from receipts
 */
export async function generateExcel(
  receipts: Receipt[],
  columns: ExportColumn[],
  includeImages: boolean = false
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ReceiptSync";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Receipts", {
    views: [{ state: "frozen", ySplit: 1 }], // Freeze header row
  });

  // Define columns with appropriate widths
  worksheet.columns = columns.map((col) => ({
    header: EXPORT_COLUMN_LABELS[col],
    key: col,
    width: getColumnWidth(col),
  }));

  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Add data rows
  for (const receipt of receipts) {
    const rowData: Record<string, string | number | null> = {};
    for (const col of columns) {
      const value = formatReceiptValue(receipt, col);
      // For Amount, TaxAmount, and Subtotal, keep as number for Excel
      if (
        (col === ExportColumn.Amount ||
          col === ExportColumn.TaxAmount ||
          col === ExportColumn.Subtotal) &&
        value !== null
      ) {
        rowData[col] = parseFloat(value);
      } else {
        rowData[col] = value;
      }
    }
    worksheet.addRow(rowData);
  }

  // Format currency columns
  const currencyColumns = [
    ExportColumn.Amount,
    ExportColumn.TaxAmount,
    ExportColumn.Subtotal,
  ];
  for (const col of currencyColumns) {
    const colIndex = columns.indexOf(col);
    if (colIndex !== -1) {
      worksheet.getColumn(colIndex + 1).numFmt = "#,##0.00";
    }
  }

  // Apply borders and auto-filter
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: receipts.length + 1, column: columns.length },
  };

  // Add conditional formatting for amounts
  const amountColIndex = columns.indexOf(ExportColumn.Amount);
  if (amountColIndex !== -1) {
    worksheet.addConditionalFormatting({
      ref: `${getColumnLetter(amountColIndex + 1)}2:${getColumnLetter(amountColIndex + 1)}${receipts.length + 1}`,
      rules: [
        {
          type: "cellIs",
          operator: "greaterThan",
          formulae: ["100"],
          style: {
            font: { color: { argb: "FF006600" } },
          },
          priority: 1,
        },
      ],
    });
  }

  // If includeImages is true and we have image URLs, we could fetch and embed them
  // Note: This is a complex operation that would require fetching images
  // For now, we just include URLs. Full image embedding would need async handling.
  if (includeImages) {
    // TODO: Implement image embedding for async export jobs
    // This would require:
    // 1. Fetching each image
    // 2. Adding it to the worksheet with worksheet.addImage()
    // 3. Positioning it in the cell
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Get appropriate column width based on column type
 */
function getColumnWidth(column: ExportColumn): number {
  switch (column) {
    case ExportColumn.Date:
    case ExportColumn.CreatedAt:
      return 12;
    case ExportColumn.Vendor:
      return 25;
    case ExportColumn.Amount:
    case ExportColumn.TaxAmount:
    case ExportColumn.Subtotal:
      return 12;
    case ExportColumn.Currency:
      return 8;
    case ExportColumn.Category:
      return 15;
    case ExportColumn.PaymentMethod:
      return 15;
    case ExportColumn.Notes:
      return 40;
    case ExportColumn.ReceiptImageUrl:
      return 50;
    case ExportColumn.ReceiptNumber:
      return 15;
    case ExportColumn.Status:
      return 12;
    default:
      return 15;
  }
}

/**
 * Convert column number to Excel column letter (1 -> A, 2 -> B, etc.)
 */
function getColumnLetter(colNum: number): string {
  let letter = "";
  let num = colNum;
  while (num > 0) {
    const mod = (num - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    num = Math.floor((num - mod) / 26);
  }
  return letter;
}
