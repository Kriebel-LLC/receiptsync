import { UserDetail } from "../types";
import { Plan } from "../types/plan";
import { Role } from "../types/role";
import { InferInsertModel, InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { DestinationType } from "../types/destination-type";
import {
  DestinationConfiguration,
  DestinationErrorDetails,
  DestinationMetadata,
} from "../types/destination";
import {
  ReceiptExtractionResult,
  ReceiptSourceConfiguration,
} from "../types/receipt";
import { ConnectionMetadata, ConnectionError } from "../types/connection";

export const users = sqliteTable(
  "users",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    stripeCustomerId: text("stripe_customer_id", { length: 191 }),
    stripeSubscriptionId: text("stripe_subscription_id", { length: 191 }),
    stripePriceId: text("stripe_price_id", { length: 191 }),
    stripeCurrentPeriodEnd: integer("stripe_current_period_end", {
      mode: "timestamp_ms",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      stripeCustomerIdKey: uniqueIndex("users_stripe_customer_id_key").on(
        table.stripeCustomerId
      ),
      stripeSubscriptionIdKey: uniqueIndex(
        "users_stripe_subscription_id_key"
      ).on(table.stripeSubscriptionId),
    };
  }
);

export const orgs = sqliteTable(
  "orgs",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    name: text("name", { length: 191 }).notNull(),
    plan: text("plan", { enum: [Plan.FREE, Plan.PRO, Plan.BUSINESS] })
      .default(Plan.FREE)
      .notNull(),
    stripeCustomerId: text("stripe_customer_id", { length: 191 }),
    stripeSubscriptionId: text("stripe_subscription_id", { length: 191 }),
    stripePriceId: text("stripe_price_id", { length: 191 }),
    stripeCurrentPeriodEnd: integer("stripe_current_period_end", {
      mode: "timestamp_ms",
    }),
    // Billing period for usage tracking
    billingPeriodStart: integer("billing_period_start", {
      mode: "timestamp",
    }),
    billingPeriodEnd: integer("billing_period_end", {
      mode: "timestamp",
    }),
    // Usage counters (reset at billing period start)
    receiptsUsedThisPeriod: integer("receipts_used_this_period")
      .default(0)
      .notNull(),
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      stripeCustomerIdKey: uniqueIndex("orgs_stripe_customer_id_key").on(
        table.stripeCustomerId
      ),
      stripeSubscriptionIdKey: uniqueIndex("orgs_stripe_subscription_id_key").on(
        table.stripeSubscriptionId
      ),
      nameIdKey: uniqueIndex("orgs_name_id_key").on(table.name),
    };
  }
);

const rolesEnum = text("role", { enum: [Role.READ, Role.WRITE, Role.ADMIN] });

export const orgInvites = sqliteTable(
  "org_invites",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    email: text("email", { length: 191 }).notNull(),
    token: text("token", { length: 191 }).notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    senderUserId: text("sender_user_id", { length: 191 }).notNull(),
    orgId: text("org_id", { length: 191 }).notNull(),
    role: rolesEnum.default(Role.READ).notNull(),
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      tokenIdKey: uniqueIndex("token_org_invites_id_key").on(table.token),
    };
  }
);

export const orgUsers = sqliteTable("org_users", {
  id: text("id", { length: 191 }).primaryKey().notNull(),
  role: rolesEnum.default(Role.READ).notNull(),
  orgId: text("org_id", { length: 191 }).notNull(),
  userId: text("user_id", { length: 191 }).notNull(),
  createdAt: integer("created_at", {
    mode: "timestamp",
  })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", {
    mode: "timestamp",
  })
    .default(sql`(unixepoch())`)
    .notNull()
    .$onUpdate(() => new Date()),
});

// ============================================================================
// ReceiptSync Tables
// ============================================================================

/**
 * Connection types - OAuth connections to external services
 */
export enum ConnectionType {
  Notion = "NOTION",
  Google = "GOOGLE",
}

/**
 * Connection status
 */
export enum ConnectionStatus {
  Active = "ACTIVE",
  Warning = "WARNING", // Connection has issues but may still work
  Disabled = "DISABLED", // Connection is disabled (user action needed)
  Archived = "ARCHIVED",
}

/**
 * Connections - OAuth connections to external services (Notion, Google, etc.)
 */
export const connections = sqliteTable(
  "connections",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    orgId: text("org_id", { length: 191 }).notNull(),
    type: text("type", {
      enum: [ConnectionType.Notion, ConnectionType.Google],
    })
      .notNull()
      .$type<ConnectionType>(),
    // Encrypted access token
    accessToken: text("access_token", { length: 512 }).notNull(),
    status: text("status", {
      enum: [
        ConnectionStatus.Active,
        ConnectionStatus.Warning,
        ConnectionStatus.Disabled,
        ConnectionStatus.Archived,
      ],
    })
      .default(ConnectionStatus.Active)
      .notNull()
      .$type<ConnectionStatus>(),
    // Type-specific metadata (workspace name, bot ID, etc.)
    metadata: text("metadata", { mode: "json" }).$type<ConnectionMetadata>(),
    // Error details if connection has issues
    error: text("error", { mode: "json" }).$type<ConnectionError>(),
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      orgIdIndex: index("connections_org_id_idx").on(table.orgId),
      typeIndex: index("connections_type_idx").on(table.type),
    };
  }
);

/**
 * Receipt source types - where receipts can be ingested from
 */
export enum ReceiptSourceType {
  Email = "EMAIL", // Email inbox forwarding/monitoring
  Upload = "UPLOAD", // Manual upload endpoint
  Api = "API", // External API integration
}

/**
 * Receipt source status
 */
export enum ReceiptSourceStatus {
  Active = "ACTIVE",
  Inactive = "INACTIVE",
  Archived = "ARCHIVED",
}

/**
 * Receipt sources - email inboxes or upload endpoints where receipts come from
 */
export const receiptSources = sqliteTable(
  "receipt_sources",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    orgId: text("org_id", { length: 191 }).notNull(),
    name: text("name", { length: 191 }).notNull(),
    type: text("type", {
      enum: [
        ReceiptSourceType.Email,
        ReceiptSourceType.Upload,
        ReceiptSourceType.Api,
      ],
    })
      .notNull()
      .$type<ReceiptSourceType>(),
    status: text("status", {
      enum: [
        ReceiptSourceStatus.Active,
        ReceiptSourceStatus.Inactive,
        ReceiptSourceStatus.Archived,
      ],
    })
      .default(ReceiptSourceStatus.Active)
      .notNull()
      .$type<ReceiptSourceStatus>(),
    // Type-specific configuration (email address, webhook URL, etc.)
    configuration: text("configuration", { mode: "json" }).$type<ReceiptSourceConfiguration>(),
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      orgIdIndex: index("receipt_sources_org_id_idx").on(table.orgId),
    };
  }
);

/**
 * Receipt status - tracks the processing state of a receipt
 */
export enum ReceiptStatus {
  Pending = "PENDING", // Receipt uploaded, awaiting extraction
  Processing = "PROCESSING", // Currently being processed by OCR/AI
  Extracted = "EXTRACTED", // Successfully extracted, ready for sync
  Failed = "FAILED", // Extraction failed
  Archived = "ARCHIVED", // Soft deleted
}

/**
 * Receipt category - common receipt categories
 */
export enum ReceiptCategory {
  Food = "FOOD",
  Travel = "TRAVEL",
  Office = "OFFICE",
  Software = "SOFTWARE",
  Utilities = "UTILITIES",
  Entertainment = "ENTERTAINMENT",
  Healthcare = "HEALTHCARE",
  Shopping = "SHOPPING",
  Services = "SERVICES",
  Other = "OTHER",
}

/**
 * Receipts - stores extracted receipt data
 */
export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    orgId: text("org_id", { length: 191 }).notNull(),
    receiptSourceId: text("receipt_source_id", { length: 191 }),
    status: text("status", {
      enum: [
        ReceiptStatus.Pending,
        ReceiptStatus.Processing,
        ReceiptStatus.Extracted,
        ReceiptStatus.Failed,
        ReceiptStatus.Archived,
      ],
    })
      .default(ReceiptStatus.Pending)
      .notNull()
      .$type<ReceiptStatus>(),

    // Core receipt data (populated after extraction)
    vendor: text("vendor", { length: 500 }),
    amount: real("amount"), // Total amount
    currency: text("currency", { length: 3 }), // ISO 4217 currency code (e.g., USD, EUR)
    date: integer("date", { mode: "timestamp" }), // Receipt/transaction date
    category: text("category", {
      enum: [
        ReceiptCategory.Food,
        ReceiptCategory.Travel,
        ReceiptCategory.Office,
        ReceiptCategory.Software,
        ReceiptCategory.Utilities,
        ReceiptCategory.Entertainment,
        ReceiptCategory.Healthcare,
        ReceiptCategory.Shopping,
        ReceiptCategory.Services,
        ReceiptCategory.Other,
      ],
    }).$type<ReceiptCategory>(),

    // Additional extracted fields
    taxAmount: real("tax_amount"),
    subtotal: real("subtotal"),
    paymentMethod: text("payment_method", { length: 100 }),
    receiptNumber: text("receipt_number", { length: 191 }),

    // Image/file storage
    originalImageUrl: text("original_image_url", { length: 2048 }),
    processedImageUrl: text("processed_image_url", { length: 2048 }),

    // Extraction metadata
    confidenceScore: real("confidence_score"), // 0.0 to 1.0 extraction confidence
    extractionResult: text("extraction_result", { mode: "json" }).$type<ReceiptExtractionResult>(),
    extractionError: text("extraction_error", { length: 2048 }),

    // Timestamps
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      orgIdIndex: index("receipts_org_id_idx").on(table.orgId),
      receiptSourceIdIndex: index("receipts_receipt_source_id_idx").on(
        table.receiptSourceId
      ),
      statusIndex: index("receipts_status_idx").on(table.status),
      dateIndex: index("receipts_date_idx").on(table.date),
      createdAtIndex: index("receipts_created_at_idx").on(table.createdAt),
    };
  }
);

/**
 * Destination status
 */
export enum DestinationStatus {
  Running = "RUNNING", // Destination is running and actively syncing
  Paused = "PAUSED", // Destination is NOT running or syncing
  Archived = "ARCHIVED",
}

/**
 * Destinations - where receipt data gets synced (Google Sheets, Notion, etc.)
 */
export const destinations = sqliteTable(
  "destinations",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    orgId: text("org_id", { length: 191 }).notNull(),
    name: text("name", { length: 191 }).notNull(),
    status: text("status", {
      enum: [
        DestinationStatus.Running,
        DestinationStatus.Paused,
        DestinationStatus.Archived,
      ],
    })
      .default(DestinationStatus.Running)
      .notNull()
      .$type<DestinationStatus>(),
    type: text("type", {
      enum: [DestinationType.GoogleSheets, DestinationType.Notion],
    })
      .notNull()
      .$type<DestinationType>(),
    // Type-specific configuration (spreadsheet ID, database ID, field mappings, etc.)
    configuration: text("configuration", { mode: "json" })
      .notNull()
      .$type<DestinationConfiguration>(),
    // OAuth connection reference (for Google, Notion OAuth)
    connectionId: text("connection_id", { length: 191 }),
    // Optional metadata for destination-specific state
    metadata: text("metadata", { mode: "json" }).$type<DestinationMetadata>(),
    // Error tracking
    error: text("error", { mode: "json" }).$type<DestinationErrorDetails>(),
    firstFailedAt: integer("first_failed_at", { mode: "timestamp" }),
    lastFailedAt: integer("last_failed_at", { mode: "timestamp" }),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
    // Timestamps
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      orgIdIndex: index("destinations_org_id_idx").on(table.orgId),
      statusIndex: index("destinations_status_idx").on(table.status),
    };
  }
);

/**
 * Synced receipt status - tracks the outcome of syncing a receipt to a destination
 */
export enum SyncedReceiptStatus {
  Pending = "PENDING", // Receipt is queued for sync
  Sent = "SENT", // Successfully synced to destination
  Failed = "FAILED", // Sync failed permanently after retries
  PendingRetry = "PENDING_RETRY", // Sync failed, will retry
  Skipped = "SKIPPED", // Skipped due to filter/conditional
}

/**
 * Synced receipts - tracks what receipts have been synced to each destination
 */
export const syncedReceipts = sqliteTable(
  "synced_receipts",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    receiptId: text("receipt_id", { length: 191 }).notNull(),
    destinationId: text("destination_id", { length: 191 }).notNull(),
    status: text("status", {
      enum: [
        SyncedReceiptStatus.Pending,
        SyncedReceiptStatus.Sent,
        SyncedReceiptStatus.Failed,
        SyncedReceiptStatus.PendingRetry,
        SyncedReceiptStatus.Skipped,
      ],
    })
      .default(SyncedReceiptStatus.Pending)
      .notNull()
      .$type<SyncedReceiptStatus>(),
    // External reference ID in the destination (e.g., Notion page ID, Sheets row ID)
    externalId: text("external_id", { length: 191 }),
    // Error details if sync failed
    error: text("error", { length: 2048 }),
    retryCount: integer("retry_count").default(0).notNull(),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
    // Timestamps
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      receiptIdIndex: index("synced_receipts_receipt_id_idx").on(
        table.receiptId
      ),
      destinationIdIndex: index("synced_receipts_destination_id_idx").on(
        table.destinationId
      ),
      statusIndex: index("synced_receipts_status_idx").on(table.status),
      // Composite unique index to prevent duplicate syncs
      receiptDestinationIndex: uniqueIndex(
        "synced_receipts_receipt_destination_idx"
      ).on(table.receiptId, table.destinationId),
    };
  }
);

// ============================================================================
// Type Exports
// ============================================================================

export type User = InferSelectModel<typeof users>;
export type Org = InferSelectModel<typeof orgs>;
export type OrgInvite = InferSelectModel<typeof orgInvites>;
export type OrgUser = InferSelectModel<typeof orgUsers>;
export type OrgUserWithDetail = OrgUser & UserDetail;

// ReceiptSync types
export type Connection = InferSelectModel<typeof connections>;
export type InsertConnection = InferInsertModel<typeof connections>;
export type ReceiptSource = InferSelectModel<typeof receiptSources>;
export type InsertReceiptSource = InferInsertModel<typeof receiptSources>;
export type Receipt = InferSelectModel<typeof receipts>;
export type InsertReceipt = InferInsertModel<typeof receipts>;
export type Destination = InferSelectModel<typeof destinations>;
export type InsertDestination = InferInsertModel<typeof destinations>;
export type SyncedReceipt = InferSelectModel<typeof syncedReceipts>;
export type InsertSyncedReceipt = InferInsertModel<typeof syncedReceipts>;

// ============================================================================
// Email Forwarding Tables
// ============================================================================

/**
 * Unique email addresses for receipt forwarding per organization
 * Each org gets a unique forwarding address like: abc123@receipts.receiptsync.com
 */
export const emailForwardingAddresses = sqliteTable(
  "email_forwarding_addresses",
  {
    id: text("id", { length: 191 }).primaryKey().notNull(),
    orgId: text("org_id", { length: 191 }).notNull(),
    // Unique identifier used in the email address (e.g., "abc123" in abc123@receipts.receiptsync.com)
    addressCode: text("address_code", { length: 32 }).notNull(),
    // Whether this forwarding address is active
    isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
    // Optional description/label for the forwarding address
    label: text("label", { length: 191 }),
    // Timestamps
    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .default(sql`(unixepoch())`)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      orgIdIndex: index("email_forwarding_addresses_org_id_idx").on(table.orgId),
      addressCodeIndex: uniqueIndex("email_forwarding_addresses_code_idx").on(
        table.addressCode
      ),
    };
  }
);

export type EmailForwardingAddress = InferSelectModel<typeof emailForwardingAddresses>;
export type InsertEmailForwardingAddress = InferInsertModel<typeof emailForwardingAddresses>;
