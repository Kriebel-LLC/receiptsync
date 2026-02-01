import * as z from "zod";

// ============================================================================
// Connection Metadata Types
// ============================================================================

/**
 * Notion-specific connection metadata from OAuth response
 */
export const NotionConnectionMetadataSchema = z.object({
  botId: z.string().min(1),
  workspaceId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  workspaceIcon: z.string().nullable(),
});

export type NotionConnectionMetadata = z.infer<
  typeof NotionConnectionMetadataSchema
>;

/**
 * Google-specific connection metadata
 */
export const GoogleConnectionMetadataSchema = z.object({
  email: z.string().email().optional(),
  scope: z.string().optional(),
});

export type GoogleConnectionMetadata = z.infer<
  typeof GoogleConnectionMetadataSchema
>;

/**
 * Union type for all connection metadata
 */
export type ConnectionMetadata =
  | NotionConnectionMetadata
  | GoogleConnectionMetadata;

// ============================================================================
// Connection Error Types
// ============================================================================

export enum ConnectionErrorType {
  AuthenticationError = "AUTHENTICATION_ERROR",
  PermissionError = "PERMISSION_ERROR",
  RateLimitError = "RATE_LIMIT_ERROR",
  NetworkError = "NETWORK_ERROR",
  UnknownError = "UNKNOWN_ERROR",
}

export type ConnectionError = {
  errorType: ConnectionErrorType;
  errorMessage: string;
  details?: string;
  occurredAt: string; // ISO 8601 timestamp
};

// ============================================================================
// Connection Display Types
// ============================================================================

/**
 * Slim connection record without access token (for API responses)
 */
export interface ConnectionDisplay {
  id: string;
  type: string;
  status: string;
  metadata: ConnectionMetadata | null;
  error: ConnectionError | null;
  createdAt: Date;
}
