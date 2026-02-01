import { RateLimitError } from "./google-oauth";

// ============================================================================
// Types
// ============================================================================

export interface SpreadsheetProperties {
  title: string;
  locale?: string;
  autoRecalc?: string;
  timeZone?: string;
}

export interface GridProperties {
  rowCount: number;
  columnCount: number;
  frozenRowCount?: number;
  frozenColumnCount?: number;
}

export interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
  sheetType?: string;
  hidden?: boolean;
  gridProperties?: GridProperties;
}

export interface Sheet {
  properties: SheetProperties;
}

export interface Spreadsheet {
  spreadsheetId: string;
  properties: SpreadsheetProperties;
  sheets: Sheet[];
}

export interface SpreadsheetListItem {
  id: string;
  name: string;
}

export enum ValueInputOption {
  Raw = "RAW",
  UserEntered = "USER_ENTERED",
}

export enum InsertDataOption {
  Overwrite = "OVERWRITE",
  InsertRows = "INSERT_ROWS",
}

export interface ValueRange {
  range: string;
  majorDimension?: "ROWS" | "COLUMNS";
  values: (string | number | boolean | null)[][];
}

export interface AppendValuesResponse {
  spreadsheetId: string;
  tableRange: string;
  updates: {
    spreadsheetId: string;
    updatedRange: string;
    updatedRows: number;
    updatedColumns: number;
    updatedCells: number;
  };
}

export interface BatchUpdateSpreadsheetRequest {
  requests: SpreadsheetRequest[];
}

export interface SpreadsheetRequest {
  addSheet?: {
    properties: {
      title: string;
      index?: number;
    };
  };
  updateCells?: {
    rows: { values: CellData[] }[];
    fields: string;
    start: {
      sheetId: number;
      rowIndex: number;
      columnIndex: number;
    };
  };
  appendCells?: {
    sheetId: number;
    rows: { values: CellData[] }[];
    fields: string;
  };
  createDeveloperMetadata?: {
    developerMetadata: DeveloperMetadata;
  };
  deleteDeveloperMetadata?: {
    dataFilter: {
      developerMetadataLookup: DeveloperMetadataLookup;
    };
  };
}

export interface CellData {
  userEnteredValue?: ExtendedValue;
  userEnteredFormat?: CellFormat;
}

export interface ExtendedValue {
  stringValue?: string;
  numberValue?: number;
  boolValue?: boolean;
  formulaValue?: string;
}

export interface CellFormat {
  // Add format properties as needed
}

export interface DeveloperMetadata {
  metadataId?: number;
  metadataKey?: string;
  metadataValue?: string;
  location: {
    locationType: "ROW" | "COLUMN" | "SHEET" | "SPREADSHEET";
    dimensionRange?: {
      sheetId: number;
      dimension: "ROWS" | "COLUMNS";
      startIndex: number;
      endIndex: number;
    };
    sheetId?: number;
    spreadsheet?: boolean;
  };
  visibility: "DOCUMENT" | "PROJECT";
}

export interface DeveloperMetadataLookup {
  locationType?: "ROW" | "COLUMN" | "SHEET" | "SPREADSHEET";
  metadataLocation?: {
    sheetId?: number;
    spreadsheet?: boolean;
  };
  locationMatchingStrategy?: "EXACT_LOCATION" | "INTERSECTING_LOCATION";
  metadataId?: number;
  metadataKey?: string;
  metadataValue?: string;
  visibility?: "DOCUMENT" | "PROJECT";
}

// ============================================================================
// API Functions
// ============================================================================

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";

/**
 * Handle rate limit responses from Google API
 * Uses `any` cast to avoid Cloudflare Worker type conflicts
 */
function handleRateLimit(response: unknown): void {
  const r = response as any;
  if (r.status === 429) {
    const retryAfter = r.headers?.get?.("Retry-After");
    const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    throw new RateLimitError("Rate limited by Google Sheets API", seconds);
  }
}

/**
 * Get spreadsheet metadata
 */
export async function getSpreadsheet(
  spreadsheetId: string,
  accessToken: string
): Promise<Spreadsheet | null> {
  const response = await fetch(
    `${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const r = response as any;
  if (r.status === 404) {
    return null;
  }

  handleRateLimit(response);

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(
      `Failed to get spreadsheet: ${r.status} ${errorText}`
    );
  }

  return r.json() as Promise<Spreadsheet>;
}

/**
 * Create a new spreadsheet
 */
export async function createSpreadsheet(
  title: string,
  accessToken: string,
  sheetTitle?: string
): Promise<Spreadsheet> {
  const body: { properties: SpreadsheetProperties; sheets?: { properties: { title: string } }[] } = {
    properties: { title },
  };

  if (sheetTitle) {
    body.sheets = [{ properties: { title: sheetTitle } }];
  }

  const response = await fetch(`${SHEETS_API_BASE}/spreadsheets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const r = response as any;
  handleRateLimit(response);

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(
      `Failed to create spreadsheet: ${r.status} ${errorText}`
    );
  }

  return r.json() as Promise<Spreadsheet>;
}

/**
 * Get values from a range
 */
export async function getValues(
  spreadsheetId: string,
  range: string,
  accessToken: string
): Promise<ValueRange> {
  const response = await fetch(
    `${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const r = response as any;
  handleRateLimit(response);

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(`Failed to get values: ${r.status} ${errorText}`);
  }

  return r.json() as Promise<ValueRange>;
}

/**
 * Append values to a sheet
 */
export async function appendValues(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][],
  accessToken: string,
  valueInputOption: ValueInputOption = ValueInputOption.UserEntered,
  insertDataOption: InsertDataOption = InsertDataOption.InsertRows
): Promise<AppendValuesResponse> {
  const url = new URL(
    `${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`
  );
  url.searchParams.set("valueInputOption", valueInputOption);
  url.searchParams.set("insertDataOption", insertDataOption);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values,
    }),
  });

  const r = response as any;
  handleRateLimit(response);

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(`Failed to append values: ${r.status} ${errorText}`);
  }

  return r.json() as Promise<AppendValuesResponse>;
}

/**
 * Update values in a range
 */
export async function updateValues(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][],
  accessToken: string,
  valueInputOption: ValueInputOption = ValueInputOption.UserEntered
): Promise<void> {
  const url = new URL(
    `${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set("valueInputOption", valueInputOption);

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values,
    }),
  });

  const r = response as any;
  handleRateLimit(response);

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(`Failed to update values: ${r.status} ${errorText}`);
  }
}

/**
 * Batch update spreadsheet (for structural changes, metadata, etc.)
 */
export async function batchUpdate(
  spreadsheetId: string,
  requests: SpreadsheetRequest[],
  accessToken: string
): Promise<void> {
  const response = await fetch(
    `${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );

  const r = response as any;
  handleRateLimit(response);

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(
      `Failed to batch update: ${r.status} ${errorText}`
    );
  }
}

/**
 * Search for developer metadata by key or ID
 */
export async function searchDeveloperMetadata(
  spreadsheetId: string,
  lookup: DeveloperMetadataLookup,
  accessToken: string
): Promise<{ matchedDeveloperMetadata: { developerMetadata: DeveloperMetadata }[] } | null> {
  const response = await fetch(
    `${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}/developerMetadata:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataFilters: [{ developerMetadataLookup: lookup }],
      }),
    }
  );

  const r = response as any;
  handleRateLimit(response);

  if (r.status === 404) {
    return null;
  }

  if (!r.ok) {
    const errorText = await r.text();
    throw new Error(
      `Failed to search developer metadata: ${r.status} ${errorText}`
    );
  }

  return r.json() as Promise<{ matchedDeveloperMetadata: { developerMetadata: DeveloperMetadata }[] }>;
}

/**
 * Get the default header row for receipts
 */
export function getDefaultReceiptHeaders(): string[] {
  return [
    "Date",
    "Vendor",
    "Amount",
    "Currency",
    "Category",
    "Tax",
    "Subtotal",
    "Payment Method",
    "Receipt Number",
    "Notes",
    "Image URL",
  ];
}

/**
 * Hash a receipt ID to a numeric metadata ID for Google Sheets
 * Uses SHA-256 and takes first 4 bytes as a 31-bit positive integer
 */
export async function hashToMetadataId(
  receiptId: string,
  destinationId: string
): Promise<number> {
  const input = `${destinationId}:${receiptId}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const view = new DataView(hashBuffer);
  const hash32 = view.getUint32(0, false);

  // Mask to 31 bits for positive value, ensure non-zero
  const result = hash32 & 0x7fffffff;
  return result === 0 ? 1 : result;
}
