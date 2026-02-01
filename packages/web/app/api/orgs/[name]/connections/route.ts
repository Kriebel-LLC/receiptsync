import { db } from "@/db";
import { getOrgIdForOrgName, verifyUserHasPermissionForOrgId } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { env } from "@/web-env";
import { NextResponse } from "next/server";
import { Role } from "shared/src/types/role";
import { getConnectionsForOrg, archiveConnection } from "shared/src/connection";
import { ConnectionType } from "shared/src/db/schema";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ name: string }>;
};

/**
 * GET /api/orgs/[name]/connections
 * List all connections for an organization
 */
export const GET = routeHandler<RouteContext>(async (req, user, context) => {
  const { name } = await context.params;

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

  // Parse query params for optional type filter
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const type = typeParam
    ? (typeParam.toUpperCase() as ConnectionType)
    : undefined;

  const connections = await getConnectionsForOrg(db(), orgId, type);

  return NextResponse.json({ connections });
});

const deleteBodySchema = z.object({
  connectionId: z.string().min(1),
});

/**
 * DELETE /api/orgs/[name]/connections
 * Archive a connection
 */
export const DELETE = routeHandler<RouteContext>(async (req, user, context) => {
  const { name } = await context.params;

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

  const body = await req.json();
  const parseResult = deleteBodySchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { connectionId } = parseResult.data;

  await archiveConnection(db(), connectionId, orgId);

  return NextResponse.json({ success: true });
});
