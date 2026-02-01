/**
 * Notion integration module for ReceiptSync
 * Provides types, validation, and helper functions for working with Notion
 */

export * from "./simple-notion-client";
import {
  SimpleNotionClient,
  SimpleNotionClientError,
  isSimpleNotionClientError,
  DatabaseObjectResponse,
  NotionPropertyType,
  OauthTokenResponse,
} from "./simple-notion-client";
import { NotionConnectionMetadata } from "../types/connection";

// ============================================================================
// Receipt Field Keys (what we sync to Notion)
// ============================================================================

/**
 * Receipt fields that can be mapped to Notion properties
 */
export enum ReceiptFieldKey {
  Id = "id",
  Date = "date",
  Vendor = "vendor",
  Amount = "amount",
  Currency = "currency",
  Category = "category",
  TaxAmount = "taxAmount",
  Subtotal = "subtotal",
  PaymentMethod = "paymentMethod",
  ReceiptNumber = "receiptNumber",
  ImageUrl = "imageUrl",
  Notes = "notes",
}

/**
 * Default Notion property names for receipt fields
 */
export const DefaultNotionPropertyNames: Record<ReceiptFieldKey, string> = {
  [ReceiptFieldKey.Id]: "Receipt ID",
  [ReceiptFieldKey.Date]: "Date",
  [ReceiptFieldKey.Vendor]: "Vendor",
  [ReceiptFieldKey.Amount]: "Amount",
  [ReceiptFieldKey.Currency]: "Currency",
  [ReceiptFieldKey.Category]: "Category",
  [ReceiptFieldKey.TaxAmount]: "Tax",
  [ReceiptFieldKey.Subtotal]: "Subtotal",
  [ReceiptFieldKey.PaymentMethod]: "Payment Method",
  [ReceiptFieldKey.ReceiptNumber]: "Receipt #",
  [ReceiptFieldKey.ImageUrl]: "Receipt Image",
  [ReceiptFieldKey.Notes]: "Notes",
};

/**
 * Compatible Notion property types for each receipt field
 */
export const ReceiptFieldToNotionTypes: Record<
  ReceiptFieldKey,
  NotionPropertyType[]
> = {
  [ReceiptFieldKey.Id]: ["title", "rich_text"],
  [ReceiptFieldKey.Date]: ["date", "rich_text"],
  [ReceiptFieldKey.Vendor]: ["title", "rich_text", "select"],
  [ReceiptFieldKey.Amount]: ["number", "rich_text"],
  [ReceiptFieldKey.Currency]: ["select", "rich_text"],
  [ReceiptFieldKey.Category]: ["select", "multi_select", "rich_text"],
  [ReceiptFieldKey.TaxAmount]: ["number", "rich_text"],
  [ReceiptFieldKey.Subtotal]: ["number", "rich_text"],
  [ReceiptFieldKey.PaymentMethod]: ["select", "rich_text"],
  [ReceiptFieldKey.ReceiptNumber]: ["rich_text", "title"],
  [ReceiptFieldKey.ImageUrl]: ["url", "files", "rich_text"],
  [ReceiptFieldKey.Notes]: ["rich_text"],
};

// ============================================================================
// Field Mapping Types
// ============================================================================

/**
 * Maps receipt fields to Notion property IDs
 */
export type NotionFieldMapping = Partial<Record<ReceiptFieldKey, string>>;

// ============================================================================
// Database Validation
// ============================================================================

export interface DatabaseValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that a Notion database has compatible properties for receipt syncing
 */
export function validateNotionDatabase(
  properties: DatabaseObjectResponse["properties"],
  fieldMapping?: NotionFieldMapping
): DatabaseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // If no field mapping, check for basic title property (required for Notion)
  const hasTitle = Object.values(properties).some((p) => p.type === "title");
  if (!hasTitle) {
    errors.push("Database must have at least one title property");
  }

  // With field mapping, validate each mapped field
  if (fieldMapping) {
    for (const [receiptField, notionPropertyId] of Object.entries(fieldMapping)) {
      const property = Object.values(properties).find(
        (p) => p.id === notionPropertyId
      );

      if (!property) {
        errors.push(
          `Mapped property for "${receiptField}" not found in database`
        );
        continue;
      }

      const compatibleTypes =
        ReceiptFieldToNotionTypes[receiptField as ReceiptFieldKey];
      if (compatibleTypes && !compatibleTypes.includes(property.type)) {
        errors.push(
          `Property "${property.name}" (${property.type}) is not compatible with receipt field "${receiptField}". ` +
            `Compatible types: ${compatibleTypes.join(", ")}`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a receipt field is compatible with a Notion property type
 */
export function isFieldCompatibleWithProperty(
  receiptField: ReceiptFieldKey,
  propertyType: NotionPropertyType
): boolean {
  const compatibleTypes = ReceiptFieldToNotionTypes[receiptField];
  return compatibleTypes?.includes(propertyType) ?? false;
}

// ============================================================================
// OAuth Helpers
// ============================================================================

/**
 * Extract connection metadata from Notion OAuth response
 */
export function notionOAuthResponseToMetadata(
  response: OauthTokenResponse
): NotionConnectionMetadata {
  return {
    botId: response.bot_id,
    workspaceId: response.workspace_id,
    workspaceName: response.workspace_name,
    workspaceIcon: response.workspace_icon,
  };
}

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Get all databases the integration has access to
 */
export async function getAllDatabases(
  accessToken: string
): Promise<DatabaseObjectResponse[]> {
  const notion = new SimpleNotionClient({ auth: accessToken });

  const results: DatabaseObjectResponse[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "database",
      },
      page_size: 100,
      start_cursor: startCursor,
    });

    results.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor ?? undefined;
  }

  return results;
}

/**
 * Get display title from a database
 */
export function getDatabaseTitle(database: DatabaseObjectResponse): string {
  return (
    database.title.map((t) => t.text?.content ?? "").join("") ||
    "Untitled Database"
  );
}

// ============================================================================
// Error Handling
// ============================================================================

export class NotionAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionAuthorizationError";
  }
}

export class NotionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionValidationError";
  }
}

export class NotionRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "NotionRateLimitError";
  }
}

export class NotionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionNotFoundError";
  }
}

/**
 * Process Notion API errors into domain-specific errors
 */
export function processNotionError(error: unknown): never {
  if (isSimpleNotionClientError(error)) {
    const { code, message, status } = error;

    switch (code) {
      case "unauthorized":
      case "restricted_resource":
        throw new NotionAuthorizationError(message);
      case "object_not_found":
        throw new NotionNotFoundError(message);
      case "rate_limited":
        throw new NotionRateLimitError(message, 200);
      case "validation_error":
        throw new NotionValidationError(message);
      default:
        // Re-throw for unexpected error codes
        if (status === 401 || status === 403) {
          throw new NotionAuthorizationError(message);
        }
        throw error;
    }
  }

  // Re-throw unknown errors
  throw error;
}

/**
 * Validate that a Notion connection works by making a simple API call
 */
export async function validateNotionConnection(
  accessToken: string
): Promise<boolean> {
  try {
    const notion = new SimpleNotionClient({ auth: accessToken });
    // Use search as a cheap validation call (doesn't require any IDs)
    await notion.search({ query: "_validation_check_", page_size: 1 });
    return true;
  } catch (error) {
    console.error("Notion connection validation failed:", error);
    return false;
  }
}
