import { db } from "@/db";
import { getOrgIdForOrgName, verifyUserHasPermissionForOrgId } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { env } from "@/web-env";
import { NextResponse } from "next/server";
import { Role } from "shared/src/types/role";
import { getDecryptedConnection } from "shared/src/connection";
import { getGoogleAccessToken } from "shared/src/google-oauth";
import { getSpreadsheet, createSpreadsheet, getDefaultReceiptHeaders } from "shared/src/google-sheets";
import { ConnectionType } from "shared/src/db/schema";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ name: string; connectionId: string }>;
};

/**
 * GET /api/orgs/[name]/connections/[connectionId]/spreadsheets?spreadsheetId=...
 * Get information about a specific spreadsheet
 */
export const GET = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, connectionId } = await context.params;

  const orgId = await getOrgIdForOrgName(name);
  if (!orgId) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const hasPermission = await verifyUserHasPermissionForOrgId(
    user.uid,
    orgId,
    Role.READ
  );

  if (!hasPermission) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get the connection
  const connection = await getDecryptedConnection(
    db(),
    env.ENCRYPTION_SECRET_KEY,
    connectionId,
    orgId
  );

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (connection.type !== ConnectionType.Google) {
    return NextResponse.json(
      { error: "Connection is not a Google connection" },
      { status: 400 }
    );
  }

  // Get spreadsheet ID from query
  const url = new URL(req.url);
  const spreadsheetId = url.searchParams.get("spreadsheetId");

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "spreadsheetId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Get fresh access token
    const tokenResponse = await getGoogleAccessToken(
      connection.decryptedAccessToken,
      env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    // Get spreadsheet info
    const spreadsheet = await getSpreadsheet(
      spreadsheetId,
      tokenResponse.access_token
    );

    if (!spreadsheet) {
      return NextResponse.json(
        { error: "Spreadsheet not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      spreadsheet: {
        id: spreadsheet.spreadsheetId,
        title: spreadsheet.properties.title,
        sheets: spreadsheet.sheets.map((s) => ({
          id: s.properties.sheetId,
          title: s.properties.title,
          index: s.properties.index,
        })),
      },
    });
  } catch (err) {
    req.log.error("Failed to get spreadsheet", { error: err });
    return NextResponse.json(
      { error: "Failed to get spreadsheet from Google" },
      { status: 500 }
    );
  }
});

const createSpreadsheetSchema = z.object({
  title: z.string().min(1).max(200),
  sheetTitle: z.string().min(1).max(200).optional(),
  includeHeaders: z.boolean().optional().default(true),
});

/**
 * POST /api/orgs/[name]/connections/[connectionId]/spreadsheets
 * Create a new spreadsheet for syncing receipts
 */
export const POST = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, connectionId } = await context.params;

  const orgId = await getOrgIdForOrgName(name);
  if (!orgId) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const hasPermission = await verifyUserHasPermissionForOrgId(
    user.uid,
    orgId,
    Role.WRITE
  );

  if (!hasPermission) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get the connection
  const connection = await getDecryptedConnection(
    db(),
    env.ENCRYPTION_SECRET_KEY,
    connectionId,
    orgId
  );

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (connection.type !== ConnectionType.Google) {
    return NextResponse.json(
      { error: "Connection is not a Google connection" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parseResult = createSpreadsheetSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const { title, sheetTitle, includeHeaders } = parseResult.data;

  try {
    // Get fresh access token
    const tokenResponse = await getGoogleAccessToken(
      connection.decryptedAccessToken,
      env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    // Create the spreadsheet
    const spreadsheet = await createSpreadsheet(
      title,
      tokenResponse.access_token,
      sheetTitle || "Receipts"
    );

    // Add headers if requested
    if (includeHeaders && spreadsheet.sheets.length > 0) {
      const { appendValues } = await import("shared/src/google-sheets");
      const headers = getDefaultReceiptHeaders();

      await appendValues(
        spreadsheet.spreadsheetId,
        `${spreadsheet.sheets[0].properties.title}!A1`,
        [headers],
        tokenResponse.access_token
      );
    }

    req.log.info("Created spreadsheet", {
      spreadsheetId: spreadsheet.spreadsheetId,
    });

    return NextResponse.json({
      spreadsheet: {
        id: spreadsheet.spreadsheetId,
        title: spreadsheet.properties.title,
        sheets: spreadsheet.sheets.map((s) => ({
          id: s.properties.sheetId,
          title: s.properties.title,
          index: s.properties.index,
        })),
      },
    });
  } catch (err) {
    req.log.error("Failed to create spreadsheet", { error: err });
    return NextResponse.json(
      { error: "Failed to create spreadsheet in Google" },
      { status: 500 }
    );
  }
});
