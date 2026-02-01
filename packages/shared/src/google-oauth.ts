import {
  GoogleAccessTokenResponse,
  GoogleOAuthTokenResponse,
  GoogleUserInfo,
  GOOGLE_SHEETS_REQUIRED_SCOPES,
} from "./types/connection";

/**
 * Error thrown when a refresh token is invalid or expired
 */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Error thrown when rate limited by Google API
 */
export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Exchange an authorization code for tokens
 */
export async function exchangeGoogleOAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleOAuthTokenResponse> {
  const requestBody = new URLSearchParams();
  requestBody.append("code", code);
  requestBody.append("client_id", clientId);
  requestBody.append("client_secret", clientSecret);
  requestBody.append("redirect_uri", redirectUri);
  requestBody.append("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody.toString(),
  });

  if (!(response as any).ok) {
    const errorText = await (response as any).text();
    throw new Error(`Failed to exchange OAuth code: ${errorText}`);
  }

  return (response as any).json() as Promise<GoogleOAuthTokenResponse>;
}

/**
 * Refresh an access token using a refresh token
 */
export async function getGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleAccessTokenResponse> {
  const requestBody = new URLSearchParams();
  requestBody.append("client_id", clientId);
  requestBody.append("client_secret", clientSecret);
  requestBody.append("refresh_token", refreshToken);
  requestBody.append("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody.toString(),
  });

  if (!(response as any).ok) {
    const errorText = await (response as any).text();
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error === "invalid_grant") {
        throw new UnauthorizedError(
          "Invalid grant: The provided refresh token is invalid or has expired."
        );
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) throw e;
    }
    throw new Error(`Failed to refresh token: ${errorText}`);
  }

  return (response as any).json() as Promise<GoogleAccessTokenResponse>;
}

/**
 * Get user info from Google using an access token
 */
export async function getGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  if (!(response as any).ok) {
    const errorText = await (response as any).text();
    throw new Error(`Failed to get user info: ${errorText}`);
  }

  return (response as any).json() as Promise<GoogleUserInfo>;
}

/**
 * Revoke a Google OAuth token
 */
export async function revokeGoogleToken(token: string): Promise<void> {
  const response = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!(response as any).ok) {
    const errorText = await (response as any).text();
    throw new Error(`Failed to revoke token: ${errorText}`);
  }
}

/**
 * Validate that the token has all required scopes
 */
export function hasRequiredScopes(grantedScopes: string): boolean {
  const scopes = grantedScopes.split(" ");
  return GOOGLE_SHEETS_REQUIRED_SCOPES.every((scope) => scopes.includes(scope));
}

/**
 * Build the Google OAuth authorization URL
 */
export function buildGoogleOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GOOGLE_SHEETS_REQUIRED_SCOPES.join(" "),
    state: state,
    response_type: "code",
    access_type: "offline", // Required for refresh token
    include_granted_scopes: "true",
    prompt: "consent", // Always show consent screen to get refresh token
  });

  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}
