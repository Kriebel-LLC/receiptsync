/**
 * API routes for managing a single destination
 */

import { db } from "@/db";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import {
  destinationIdRouteContextSchema,
  DestinationIdRouteContextSchemaType,
  updateDestinationSchema,
  UpdateDestinationType,
} from "@/lib/validations/destinations";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { destinations, DestinationStatus } from "shared/src/db/schema";
import { Role, hasPermission } from "shared/src/types/role";

/**
 * GET /api/orgs/[name]/destinations/[destinationId]
 * Get a single destination
 */
export const GET = routeHandler<DestinationIdRouteContextSchemaType>(
  async (req, user, context) => {
    const { params } = destinationIdRouteContextSchema.parse(context);
    const { name: orgName, destinationId } = params;

    // Verify user has access
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Get destination
    const result = await db()
      .select()
      .from(destinations)
      .where(
        and(
          eq(destinations.id, destinationId),
          eq(destinations.orgId, userInOrg.orgId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Destination not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result[0]);
  }
);

/**
 * PATCH /api/orgs/[name]/destinations/[destinationId]
 * Update a destination
 */
export const PATCH = routeHandler<DestinationIdRouteContextSchemaType>(
  async (req, user, context) => {
    const { params } = destinationIdRouteContextSchema.parse(context);
    const { name: orgName, destinationId } = params;

    // Verify user has write access
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Parse and validate body
    let body: UpdateDestinationType;
    try {
      const json = await req.json();
      body = updateDestinationSchema.parse(json);
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Get existing destination
    const existing = await db()
      .select()
      .from(destinations)
      .where(
        and(
          eq(destinations.id, destinationId),
          eq(destinations.orgId, userInOrg.orgId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Destination not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Partial<typeof destinations.$inferSelect> = {};
    if (body.name !== undefined) {
      updates.name = body.name;
    }
    if (body.status !== undefined) {
      updates.status =
        body.status === "RUNNING"
          ? DestinationStatus.Running
          : DestinationStatus.Paused;
    }
    if (body.configuration !== undefined) {
      updates.configuration = body.configuration;
    }

    // Update destination
    await db()
      .update(destinations)
      .set(updates)
      .where(eq(destinations.id, destinationId));

    // Return updated destination
    const updated = await db()
      .select()
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1);

    req.log.info("Destination updated", {
      destinationId,
      updates: Object.keys(updates),
    });

    return NextResponse.json(updated[0]);
  }
);

/**
 * DELETE /api/orgs/[name]/destinations/[destinationId]
 * Archive (soft delete) a destination
 */
export const DELETE = routeHandler<DestinationIdRouteContextSchemaType>(
  async (req, user, context) => {
    const { params } = destinationIdRouteContextSchema.parse(context);
    const { name: orgName, destinationId } = params;

    // Verify user has admin access
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.ADMIN)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Archive destination
    const result = await db()
      .update(destinations)
      .set({ status: DestinationStatus.Archived })
      .where(
        and(
          eq(destinations.id, destinationId),
          eq(destinations.orgId, userInOrg.orgId)
        )
      );

    req.log.info("Destination archived", { destinationId });

    return new NextResponse(null, { status: 204 });
  }
);
