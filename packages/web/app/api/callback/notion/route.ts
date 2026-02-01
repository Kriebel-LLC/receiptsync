/**
 * Notion OAuth callback route
 * Handles the redirect from Notion after user authorization
 */

import { db } from "@/db";
import { getNotionOAuthRedirectUrl } from "@/lib/notion-oauth";
import { getOrgNameForOrgId, verifyUserHasPermissionForOrgId } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { parseQueryParams } from "@/lib/utils";
import {
  notionOAuthCallbackQuerySchema,
  NotionOAuthCallbackQueryType,
} from "@/lib/validations/connections";
import { env } from "@/web-env";
import { NextResponse } from "next/server";
import { createConnection, BackendEnv } from "shared/src/connection";
import { ConnectionType } from "shared/src/db/schema";
import {
  SimpleNotionClient,
  notionOAuthResponseToMetadata,
} from "shared/src/notion";
import { Role } from "shared/src/types/role";

function getBackendEnv(): BackendEnv {
  // Construct backend env from web env
  // This is a bit awkward but needed for shared code compatibility
  return env as unknown as BackendEnv;
}

export const GET = routeHandler(async (req, user) => {
  // Parse OAuth callback query params
  const query = parseQueryParams<NotionOAuthCallbackQueryType>(
    req,
    notionOAuthCallbackQuerySchema
  );

  const { code, state: orgId, error } = query;

  // Check for OAuth error
  if (error) {
    req.log.warn(`Notion OAuth error: ${error}`);
    // Get org name for redirect
    const orgName = await getOrgNameForOrgId(orgId);
    if (!orgName) {
      return NextResponse.redirect(
        new URL(
          `/destinations/new?error=${encodeURIComponent("Organization not found")}`,
          req.url
        )
      );
    }
    return NextResponse.redirect(
      new URL(
        `/${orgName}/destinations/new?error=${encodeURIComponent(error)}`,
        req.url
      )
    );
  }

  // Code is required if no error
  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/destinations/new?error=${encodeURIComponent("Authorization code missing")}`,
        req.url
      )
    );
  }

  // Verify user has permission for this org
  const hasPermission = await verifyUserHasPermissionForOrgId(
    user.uid,
    orgId,
    Role.WRITE
  );

  if (!hasPermission) {
    req.log.warn(`User ${user.uid} does not have permission for org ${orgId}`);
    return NextResponse.redirect(
      new URL(
        `/destinations/new?error=${encodeURIComponent("Permission denied")}`,
        req.url
      )
    );
  }

  // Get org name for redirect
  const orgName = await getOrgNameForOrgId(orgId);
  if (!orgName) {
    return NextResponse.redirect(
      new URL(
        `/destinations/new?error=${encodeURIComponent("Organization not found")}`,
        req.url
      )
    );
  }

  try {
    // Exchange authorization code for access token
    const notion = new SimpleNotionClient();
    const notionOAuthResponse = await notion.oauth.token({
      code,
      redirect_uri: getNotionOAuthRedirectUrl(new URL(req.url).host),
      client_id: env.NEXT_PUBLIC_NOTION_CLIENT_ID,
      client_secret: env.NOTION_CLIENT_SECRET,
      grant_type: "authorization_code",
    });

    const accessToken = notionOAuthResponse.access_token;
    const metadata = notionOAuthResponseToMetadata(notionOAuthResponse);

    req.log.info("Notion OAuth successful", {
      workspaceId: metadata.workspaceId,
      workspaceName: metadata.workspaceName,
    });

    // Create connection record
    const connection = await createConnection({
      env: getBackendEnv(),
      connectionType: ConnectionType.Notion,
      orgId,
      accessToken,
      metadata,
    });

    req.log.info("Notion connection created", {
      connectionId: connection.id,
      orgId,
    });

    // Redirect to destinations page with success message
    return NextResponse.redirect(
      new URL(
        `/${orgName}/destinations/new?connectionId=${connection.id}&success=${encodeURIComponent("Notion connected successfully!")}`,
        req.url
      )
    );
  } catch (error) {
    req.log.error("Notion OAuth failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.redirect(
      new URL(
        `/${orgName}/destinations/new?error=${encodeURIComponent("Failed to connect Notion. Please try again.")}`,
        req.url
      )
    );
  }
});
