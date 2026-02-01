import { db } from "@/db";
import { verifyUserHasPermissionForOrgId } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { env } from "@/web-env";
import { NextResponse } from "next/server";
import { Role } from "shared/src/types/role";
import { z } from "zod";
import {
  exchangeGoogleOAuthCode,
  getGoogleUserInfo,
  hasRequiredScopes,
} from "shared/src/google-oauth";
import {
  createConnection,
  updateConnection,
  getDecryptedConnection,
} from "shared/src/connection";
import { ConnectionStatus, ConnectionType } from "shared/src/db/schema";
import { GoogleOAuthState, GoogleConnectionMetadata } from "shared/src/types/connection";

const queryParamsSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  state: z.string(),
});

/**
 * Google OAuth callback handler
 * Handles the redirect from Google after user authorizes the app
 */
export const GET = routeHandler(async (req, user) => {
  const url = new URL(req.url);
  const parseResult = queryParamsSchema.safeParse(
    Object.fromEntries(url.searchParams)
  );

  if (!parseResult.success) {
    return NextResponse.redirect(
      new URL("/destinations?error=invalid_callback", req.url)
    );
  }

  const { code, error, state: stateString } = parseResult.data;

  // Parse state
  let state: GoogleOAuthState;
  try {
    state = JSON.parse(stateString);
  } catch {
    return NextResponse.redirect(
      new URL("/destinations?error=invalid_state", req.url)
    );
  }

  const { orgId, connectionId, returnPath } = state;
  const redirectBase = returnPath || `/${orgId}/destinations`;

  // Handle OAuth errors
  if (error) {
    req.log.warn("Google OAuth error", { error });
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=no_code`, req.url)
    );
  }

  // Verify user has permission to modify this org
  const hasPermission = await verifyUserHasPermissionForOrgId(
    user.uid,
    orgId,
    Role.WRITE
  );

  if (!hasPermission) {
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=unauthorized`, req.url)
    );
  }

  try {
    // Build redirect URI (must match what was used in the authorization request)
    const redirectUri = `${env.NEXT_PUBLIC_APP_URL}/api/callback/google`;

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeGoogleOAuthCode(
      code,
      env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Verify we got a refresh token (only comes on initial authorization)
    if (!tokenResponse.refresh_token && !connectionId) {
      req.log.error("No refresh token received from Google");
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=no_refresh_token`, req.url)
      );
    }

    // Validate scopes
    if (!hasRequiredScopes(tokenResponse.scope)) {
      req.log.warn("Missing required scopes", { scope: tokenResponse.scope });
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=missing_scopes`, req.url)
      );
    }

    // Get user info from Google
    const userInfo = await getGoogleUserInfo(tokenResponse.access_token);

    const metadata: GoogleConnectionMetadata = {
      scopes: tokenResponse.scope,
      ownerEmail: userInfo.email,
      ownerFullName: userInfo.name || `${userInfo.given_name} ${userInfo.family_name}`,
      ownerGoogleUserId: userInfo.id,
    };

    if (connectionId) {
      // Re-authenticating an existing connection
      const existingConnection = await getDecryptedConnection(
        db(),
        env.ENCRYPTION_SECRET_KEY,
        connectionId,
        orgId
      );

      if (!existingConnection) {
        return NextResponse.redirect(
          new URL(`${redirectBase}?error=connection_not_found`, req.url)
        );
      }

      // Use new refresh token if provided, otherwise keep existing
      const refreshToken = tokenResponse.refresh_token || existingConnection.decryptedAccessToken;

      await updateConnection({
        db: db(),
        encryptionKey: env.ENCRYPTION_SECRET_KEY,
        connectionId,
        orgId,
        newAccessToken: refreshToken,
        metadataUpdates: metadata,
        status: ConnectionStatus.Active,
      });

      req.log.info("Updated existing Google connection", { connectionId });

      return NextResponse.redirect(
        new URL(`${redirectBase}?success=reconnected`, req.url)
      );
    } else {
      // Creating a new connection
      const connection = await createConnection({
        db: db(),
        encryptionKey: env.ENCRYPTION_SECRET_KEY,
        connectionType: ConnectionType.Google,
        orgId,
        accessToken: tokenResponse.refresh_token!,
        metadata,
      });

      req.log.info("Created new Google connection", {
        connectionId: connection.id,
      });

      return NextResponse.redirect(
        new URL(`${redirectBase}?success=connected&connectionId=${connection.id}`, req.url)
      );
    }
  } catch (err) {
    req.log.error("Failed to complete Google OAuth", { error: err });
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=oauth_failed`, req.url)
    );
  }
});
