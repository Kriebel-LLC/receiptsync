/**
 * Notion destination sync service
 * Syncs receipts to Notion databases
 */

import {
  SimpleNotionClient,
  PageProperties,
  RichTextItem,
  processNotionError,
  NotionAuthorizationError,
  NotionNotFoundError,
  NotionRateLimitError,
  ReceiptFieldKey,
  NotionFieldMapping,
  DatabaseObjectResponse,
  NotionPropertyType,
} from "shared/src/notion";
import { Receipt, SyncedReceiptStatus } from "shared/src/db/schema";
import { NotionDestinationConfiguration } from "shared/src/types/destination";

// ============================================================================
// Types
// ============================================================================

export enum SyncUpdateType {
  Add = "ADD",
  Modify = "MODIFY",
  Remove = "REMOVE",
}

export interface NotionSyncParams {
  receipt: Receipt;
  configuration: NotionDestinationConfiguration;
  accessToken: string;
  updateType: SyncUpdateType;
  existingExternalId?: string; // Notion page ID if updating
}

export interface NotionSyncResult {
  success: boolean;
  externalId?: string; // Notion page ID
  error?: string;
  shouldRetry?: boolean;
}

// ============================================================================
// Property Conversion
// ============================================================================

/**
 * Create a rich text property value
 */
function createRichText(content: string): RichTextItem[] {
  return [{ text: { content } }];
}

/**
 * Convert a receipt to Notion page properties
 */
function receiptToNotionProperties(
  receipt: Receipt,
  databaseProperties: DatabaseObjectResponse["properties"],
  fieldMapping?: NotionFieldMapping
): PageProperties {
  const properties: PageProperties = {};

  // Build a map of property ID to property info
  const propertiesById = new Map(
    Object.entries(databaseProperties).map(([name, prop]) => [
      prop.id,
      { ...prop, name },
    ])
  );

  // Helper to get property info by ID or name
  const getProperty = (
    idOrName: string
  ): { type: NotionPropertyType; name: string } | undefined => {
    // Check by ID first
    const byId = propertiesById.get(idOrName);
    if (byId) return { type: byId.type as NotionPropertyType, name: byId.name };

    // Check by name
    const byName = Object.entries(databaseProperties).find(
      ([name]) => name.toLowerCase() === idOrName.toLowerCase()
    );
    if (byName)
      return {
        type: byName[1].type as NotionPropertyType,
        name: byName[0],
      };

    return undefined;
  };

  // Default field mapping if none provided
  const mapping: NotionFieldMapping = fieldMapping ?? {
    [ReceiptFieldKey.Vendor]: "Vendor",
    [ReceiptFieldKey.Date]: "Date",
    [ReceiptFieldKey.Amount]: "Amount",
    [ReceiptFieldKey.Currency]: "Currency",
    [ReceiptFieldKey.Category]: "Category",
    [ReceiptFieldKey.Notes]: "Notes",
    [ReceiptFieldKey.ImageUrl]: "Receipt Image",
  };

  // Process each mapped field
  for (const [receiptField, notionPropertyIdOrName] of Object.entries(
    mapping
  )) {
    const prop = getProperty(notionPropertyIdOrName);
    if (!prop) continue;

    const value = getReceiptFieldValue(receipt, receiptField as ReceiptFieldKey);
    if (value === null || value === undefined) continue;

    // Convert based on property type
    const propertyValue = convertToNotionPropertyValue(
      value,
      prop.type,
      receiptField as ReceiptFieldKey
    );
    if (propertyValue) {
      properties[prop.name] = propertyValue;
    }
  }

  return properties;
}

/**
 * Get a value from the receipt for a given field
 */
function getReceiptFieldValue(
  receipt: Receipt,
  field: ReceiptFieldKey
): string | number | Date | null {
  switch (field) {
    case ReceiptFieldKey.Id:
      return receipt.id;
    case ReceiptFieldKey.Vendor:
      return receipt.vendor;
    case ReceiptFieldKey.Date:
      return receipt.date;
    case ReceiptFieldKey.Amount:
      return receipt.amount;
    case ReceiptFieldKey.Currency:
      return receipt.currency;
    case ReceiptFieldKey.Category:
      return receipt.category;
    case ReceiptFieldKey.TaxAmount:
      return receipt.taxAmount;
    case ReceiptFieldKey.Subtotal:
      return receipt.subtotal;
    case ReceiptFieldKey.PaymentMethod:
      return receipt.paymentMethod;
    case ReceiptFieldKey.ReceiptNumber:
      return receipt.receiptNumber;
    case ReceiptFieldKey.ImageUrl:
      return receipt.originalImageUrl ?? receipt.processedImageUrl;
    case ReceiptFieldKey.Notes:
      return null; // Notes would be stored in extraction result
    default:
      return null;
  }
}

/**
 * Convert a value to the appropriate Notion property format
 */
function convertToNotionPropertyValue(
  value: string | number | Date | null,
  propertyType: NotionPropertyType,
  fieldKey: ReceiptFieldKey
): PageProperties[string] | null {
  if (value === null) return null;

  switch (propertyType) {
    case "title":
      return { title: createRichText(String(value)) };

    case "rich_text":
      return { rich_text: createRichText(String(value)) };

    case "number":
      return { number: typeof value === "number" ? value : parseFloat(String(value)) || null };

    case "select":
      return { select: { name: String(value) } };

    case "multi_select":
      return { multi_select: [{ name: String(value) }] };

    case "date":
      if (value instanceof Date) {
        return { date: { start: value.toISOString().split("T")[0] } };
      }
      // Try to parse string date
      const date = new Date(String(value));
      if (!isNaN(date.getTime())) {
        return { date: { start: date.toISOString().split("T")[0] } };
      }
      return null;

    case "url":
      return { url: String(value) };

    case "files":
      // Notion files must be external URLs
      return {
        files: [
          {
            type: "external" as const,
            name: "Receipt",
            external: { url: String(value) },
          },
        ],
      };

    case "checkbox":
      return { checkbox: Boolean(value) };

    // Read-only properties - skip
    case "created_time":
    case "last_edited_time":
    case "created_by":
    case "last_edited_by":
    case "formula":
    case "rollup":
      return null;

    default:
      // Default to rich_text for unknown types
      return { rich_text: createRichText(String(value)) };
  }
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Find existing pages in the database for a receipt
 */
async function findExistingPages(
  notion: SimpleNotionClient,
  databaseId: string,
  receiptId: string,
  fieldMapping?: NotionFieldMapping
): Promise<string[]> {
  // Determine which property to search for the receipt ID
  const idProperty =
    fieldMapping?.[ReceiptFieldKey.Id] ?? "Receipt ID";

  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        or: [
          { property: idProperty, title: { equals: receiptId } },
          { property: idProperty, rich_text: { equals: receiptId } },
        ],
      },
      page_size: 10,
      archived: false,
    });

    return response.results.map((page) => page.id);
  } catch (error) {
    console.warn("Error finding existing pages:", error);
    return [];
  }
}

/**
 * Execute Notion sync for a receipt
 */
export async function executeNotionSync(
  params: NotionSyncParams
): Promise<NotionSyncResult> {
  const { receipt, configuration, accessToken, updateType, existingExternalId } =
    params;

  const notion = new SimpleNotionClient({ auth: accessToken });
  const { databaseId, fieldMapping } = configuration;

  try {
    // Get database schema to validate properties
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });

    switch (updateType) {
      case SyncUpdateType.Add: {
        // Create new page
        const properties = receiptToNotionProperties(
          receipt,
          database.properties,
          fieldMapping
        );

        // Always include receipt ID as title if not mapped elsewhere
        const hasTitle = Object.values(database.properties).some(
          (p) => p.type === "title"
        );
        if (hasTitle && !Object.values(properties).some(p => 'title' in p)) {
          // Find the title property and add receipt ID
          const titleProp = Object.entries(database.properties).find(
            ([, p]) => p.type === "title"
          );
          if (titleProp) {
            properties[titleProp[0]] = {
              title: createRichText(receipt.vendor ?? `Receipt ${receipt.id}`),
            };
          }
        }

        const page = await notion.pages.create({
          parent: { database_id: databaseId },
          properties,
        });

        return {
          success: true,
          externalId: page.id,
        };
      }

      case SyncUpdateType.Modify: {
        // Find existing page(s)
        let pageIds: string[] = [];
        if (existingExternalId) {
          pageIds = [existingExternalId];
        } else {
          pageIds = await findExistingPages(
            notion,
            databaseId,
            receipt.id,
            fieldMapping
          );
        }

        if (pageIds.length === 0) {
          // No existing page found, create new one
          return executeNotionSync({
            ...params,
            updateType: SyncUpdateType.Add,
          });
        }

        // Update existing page(s)
        const properties = receiptToNotionProperties(
          receipt,
          database.properties,
          fieldMapping
        );

        for (const pageId of pageIds) {
          await notion.pages.update({
            page_id: pageId,
            properties,
          });
        }

        return {
          success: true,
          externalId: pageIds[0],
        };
      }

      case SyncUpdateType.Remove: {
        // Archive existing page(s)
        let pageIds: string[] = [];
        if (existingExternalId) {
          pageIds = [existingExternalId];
        } else {
          pageIds = await findExistingPages(
            notion,
            databaseId,
            receipt.id,
            fieldMapping
          );
        }

        for (const pageId of pageIds) {
          await notion.pages.update({
            page_id: pageId,
            archived: true,
          });
        }

        return {
          success: true,
          externalId: pageIds[0],
        };
      }

      default:
        return {
          success: false,
          error: `Unknown update type: ${updateType}`,
        };
    }
  } catch (error) {
    console.error("Notion sync error:", error);

    // Process error to determine if retryable
    try {
      processNotionError(error);
    } catch (processedError) {
      if (processedError instanceof NotionAuthorizationError) {
        return {
          success: false,
          error: "Authorization failed. Please reconnect Notion.",
          shouldRetry: false,
        };
      }
      if (processedError instanceof NotionNotFoundError) {
        return {
          success: false,
          error: "Database not found. Please check configuration.",
          shouldRetry: false,
        };
      }
      if (processedError instanceof NotionRateLimitError) {
        return {
          success: false,
          error: "Rate limited. Will retry later.",
          shouldRetry: true,
        };
      }
    }

    // Default to retryable for unknown errors
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      shouldRetry: true,
    };
  }
}
