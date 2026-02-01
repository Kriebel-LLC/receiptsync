import { env } from "@/web-env";
import { GOOGLE_SHEETS_REQUIRED_SCOPES, GoogleOAuthState } from "shared/src/types/connection";

/**
 * Create Google OAuth authorization URL for initiating the OAuth flow
 */
export function createGoogleOAuthAuthorizeUrl(
  orgId: string,
  connectionId?: string,
  returnPath?: string
): string {
  const state: GoogleOAuthState = {
    orgId,
    connectionId,
    returnPath,
  };

  const redirectUri = `${env.NEXT_PUBLIC_APP_URL}/api/callback/google`;

  const params = new URLSearchParams({
    client_id: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: GOOGLE_SHEETS_REQUIRED_SCOPES.join(" "),
    state: JSON.stringify(state),
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

/**
 * Redirect the user to Google OAuth authorization
 */
export function initiateGoogleOAuth(
  orgId: string,
  connectionId?: string,
  returnPath?: string
): void {
  const url = createGoogleOAuthAuthorizeUrl(orgId, connectionId, returnPath);
  window.location.href = url;
}
