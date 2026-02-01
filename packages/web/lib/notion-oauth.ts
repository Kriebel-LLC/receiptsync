/**
 * Notion OAuth utilities for web package
 */

import { env } from "@/web-env";

/**
 * Get the Notion OAuth redirect URL based on the current host
 */
export function getNotionOAuthRedirectUrl(host: string): string {
  // Use the configured OAuth URL, potentially adjusted based on host
  return env.NEXT_PUBLIC_NOTION_OAUTH_URL;
}

/**
 * Build the Notion OAuth authorization URL
 * @param orgId - The org ID to store in the state parameter
 * @param host - The current request host
 */
export function getNotionOAuthAuthorizeUrl(orgId: string, host: string): string {
  const redirectUri = getNotionOAuthRedirectUrl(host);
  const params = new URLSearchParams({
    client_id: env.NEXT_PUBLIC_NOTION_CLIENT_ID,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
    state: orgId, // Store orgId in state for security
  });

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}
