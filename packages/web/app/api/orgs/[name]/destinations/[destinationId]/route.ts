import { db } from "@/db";
import { getOrgIdForOrgName, verifyUserHasPermissionForOrgId } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { Role } from "shared/src/types/role";
import { destinations, DestinationStatus } from "shared/src/db/schema";
import { DestinationType } from "shared/src/types/destination-type";
import {
  GoogleSheetsDestinationConfigurationSchema,
  NotionDestinationConfigurationSchema,
} from "shared/src/types/destination";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ name: string; destinationId: string }>;
};

/**
 * GET /api/orgs/[name]/destinations/[destinationId]
 * Get a specific destination
 */
export const GET = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, destinationId } = await context.params;

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

  const [destination] = await db()
    .select()
    .from(destinations)
    .where(
      and(eq(destinations.id, destinationId), eq(destinations.orgId, orgId))
    );

  if (!destination) {
    return NextResponse.json({ error: "Destination not found" }, { status: 404 });
  }

  return NextResponse.json({ destination });
});

const updateDestinationSchema = z.object({
  name: z.string().min(1).max(191).optional(),
  status: z.enum([
    DestinationStatus.Running,
    DestinationStatus.Paused,
  ]).optional(),
  configuration: z.union([
    GoogleSheetsDestinationConfigurationSchema,
    NotionDestinationConfigurationSchema,
  ]).optional(),
});

/**
 * PATCH /api/orgs/[name]/destinations/[destinationId]
 * Update a destination
 */
export const PATCH = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, destinationId } = await context.params;

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
  const parseResult = updateDestinationSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  // Check destination exists
  const [existing] = await db()
    .select()
    .from(destinations)
    .where(
      and(eq(destinations.id, destinationId), eq(destinations.orgId, orgId))
    );

  if (!existing) {
    return NextResponse.json({ error: "Destination not found" }, { status: 404 });
  }

  const updates: Partial<typeof existing> = {};
  if (parseResult.data.name !== undefined) {
    updates.name = parseResult.data.name;
  }
  if (parseResult.data.status !== undefined) {
    updates.status = parseResult.data.status;
  }
  if (parseResult.data.configuration !== undefined) {
    updates.configuration = parseResult.data.configuration;
  }

  const [updated] = await db()
    .update(destinations)
    .set(updates)
    .where(eq(destinations.id, destinationId))
    .returning();

  req.log.info("Updated destination", { destinationId });

  return NextResponse.json({ destination: updated });
});

/**
 * DELETE /api/orgs/[name]/destinations/[destinationId]
 * Archive a destination
 */
export const DELETE = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, destinationId } = await context.params;

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

  // Check destination exists
  const [existing] = await db()
    .select()
    .from(destinations)
    .where(
      and(eq(destinations.id, destinationId), eq(destinations.orgId, orgId))
    );

  if (!existing) {
    return NextResponse.json({ error: "Destination not found" }, { status: 404 });
  }

  await db()
    .update(destinations)
    .set({ status: DestinationStatus.Archived })
    .where(eq(destinations.id, destinationId));

  req.log.info("Archived destination", { destinationId });

  return NextResponse.json({ success: true });
});
