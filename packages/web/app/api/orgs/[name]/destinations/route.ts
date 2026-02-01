import { db } from "@/db";
import { getOrgIdForOrgName, verifyUserHasPermissionForOrgId } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { Role } from "shared/src/types/role";
import {
  destinations,
  DestinationStatus,
  connections,
} from "shared/src/db/schema";
import { DestinationType } from "shared/src/types/destination-type";
import {
  GoogleSheetsDestinationConfigurationSchema,
  NotionDestinationConfigurationSchema,
} from "shared/src/types/destination";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ name: string }>;
};

/**
 * GET /api/orgs/[name]/destinations
 * List all destinations for an organization
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

  // Get destinations with connection info
  const destinationList = await db()
    .select({
      id: destinations.id,
      name: destinations.name,
      type: destinations.type,
      status: destinations.status,
      configuration: destinations.configuration,
      connectionId: destinations.connectionId,
      metadata: destinations.metadata,
      error: destinations.error,
      lastSyncedAt: destinations.lastSyncedAt,
      createdAt: destinations.createdAt,
      updatedAt: destinations.updatedAt,
    })
    .from(destinations)
    .where(eq(destinations.orgId, orgId));

  // Fetch connection metadata for destinations that have connections
  const connectionIds = destinationList
    .map((d) => d.connectionId)
    .filter((id): id is string => id !== null);

  let connectionMap: Record<string, { email?: string; status: string }> = {};
  if (connectionIds.length > 0) {
    const connectionList = await db()
      .select({
        id: connections.id,
        status: connections.status,
        metadata: connections.metadata,
      })
      .from(connections)
      .where(eq(connections.orgId, orgId));

    connectionMap = Object.fromEntries(
      connectionList.map((c) => [
        c.id,
        {
          email: (c.metadata as { ownerEmail?: string })?.ownerEmail,
          status: c.status,
        },
      ])
    );
  }

  // Enrich destinations with connection info
  const enrichedDestinations = destinationList.map((d) => ({
    ...d,
    connection: d.connectionId ? connectionMap[d.connectionId] : null,
  }));

  return NextResponse.json({ destinations: enrichedDestinations });
});

const createDestinationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(DestinationType.GoogleSheets),
    name: z.string().min(1).max(191),
    connectionId: z.string().min(1),
    configuration: GoogleSheetsDestinationConfigurationSchema,
  }),
  z.object({
    type: z.literal(DestinationType.Notion),
    name: z.string().min(1).max(191),
    connectionId: z.string().min(1),
    configuration: NotionDestinationConfigurationSchema,
  }),
]);

/**
 * POST /api/orgs/[name]/destinations
 * Create a new destination
 */
export const POST = routeHandler<RouteContext>(async (req, user, context) => {
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
  const parseResult = createDestinationSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const { type, name: destName, connectionId, configuration } = parseResult.data;

  // Verify the connection exists and belongs to this org
  const [connection] = await db()
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId));

  if (!connection || connection.orgId !== orgId) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 }
    );
  }

  const destinationId = nanoid();

  const [destination] = await db()
    .insert(destinations)
    .values({
      id: destinationId,
      orgId,
      name: destName,
      type,
      status: DestinationStatus.Running,
      connectionId,
      configuration,
    })
    .returning();

  req.log.info("Created destination", {
    destinationId: destination.id,
    type,
  });

  return NextResponse.json({ destination });
});
