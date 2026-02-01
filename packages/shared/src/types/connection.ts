import * as z from "zod";

// ============================================================================
// Google Connection Metadata
// ============================================================================

export const GoogleConnectionMetadataSchema = z.strictObject({
  scopes: z.string().min(1),
  ownerEmail: z.string().email().optional(),
  ownerFullName: z.string().min(1).optional(),
  ownerGoogleUserId: z.string().min(1).optional(),
});

export type GoogleConnectionMetadata = z.infer<
  typeof GoogleConnectionMetadataSchema
>;

// ============================================================================
// Notion Connection Metadata
// ============================================================================

export const NotionConnectionMetadataSchema = z.strictObject({
  workspaceId: z.string().min(1).optional(),
  workspaceName: z.string().min(1).optional(),
  ownerUserId: z.string().min(1).optional(),
});

export type NotionConnectionMetadata = z.infer<
  typeof NotionConnectionMetadataSchema
>;

// ============================================================================
// Unified Connection Metadata
// ============================================================================

export type ConnectionMetadata =
  | GoogleConnectionMetadata
  | NotionConnectionMetadata;

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

export type ConnectionErrorDetails = {
  errorType: ConnectionErrorType;
  errorDisplayMessage: string;
  details?: string;
};

// ============================================================================
// Google OAuth Types
// ============================================================================

/**
 * Required Google OAuth scopes for Sheets integration
 */
export const GOOGLE_SHEETS_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets", // Read/write spreadsheets
  "https://www.googleapis.com/auth/drive.file", // Access files created by the app
  "https://www.googleapis.com/auth/userinfo.email", // Get user email
  "https://www.googleapis.com/auth/userinfo.profile", // Get user profile
];

/**
 * Google OAuth token response from token exchange
 */
export interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string; // Only present on initial authorization
  scope: string;
  token_type: "Bearer";
}

/**
 * Google access token response from refresh
 */
export interface GoogleAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
}

/**
 * Google user info from userinfo endpoint
 */
export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture?: string;
  locale?: string;
}

/**
 * OAuth callback state for Google OAuth flow
 */
export interface GoogleOAuthState {
  orgId: string;
  connectionId?: string; // Present when re-authenticating an existing connection
  returnPath?: string; // Path to redirect to after OAuth completes
}
