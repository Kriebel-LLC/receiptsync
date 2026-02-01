/**
 * API routes for managing destinations
 */

import { db } from "@/db";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import {
  createDestinationSchema,
  CreateDestinationType,
} from "@/lib/validations/destinations";
import {
  orgNameRouteContextSchema,
  orgNameRouteContextSchemaType,
} from "@/lib/validations/orgs";
import { env } from "@/web-env";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getSlimConnectionById, BackendEnv } from "shared/src/connection";
import {
  destinations,
  DestinationStatus,
  Destination,
} from "shared/src/db/schema";
import { Role, hasPermission } from "shared/src/types/role";

function getBackendEnv(): BackendEnv {
  return env as unknown as BackendEnv;
}

/**
 * GET /api/orgs/[name]/destinations
 * List all destinations for an org
 */
export const GET = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    const { params } = orgNameRouteContextSchema.parse(context);
    const orgName = params.name;

    // Verify user has access
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Get destinations (excluding archived)
    const results = await db()
      .select()
      .from(destinations)
      .where(
        and(
          eq(destinations.orgId, userInOrg.orgId),
          eq(destinations.status, DestinationStatus.Running)
        )
      )
      .orderBy(desc(destinations.createdAt));

    // Also get paused destinations
    const pausedResults = await db()
      .select()
      .from(destinations)
      .where(
        and(
          eq(destinations.orgId, userInOrg.orgId),
          eq(destinations.status, DestinationStatus.Paused)
        )
      )
      .orderBy(desc(destinations.createdAt));

    return NextResponse.json([...results, ...pausedResults]);
  }
);

/**
 * POST /api/orgs/[name]/destinations
 * Create a new destination
 */
export const POST = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    const { params } = orgNameRouteContextSchema.parse(context);
    const orgName = params.name;

    // Verify user has write access
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Parse and validate body
    let body: CreateDestinationType;
    try {
      const json = await req.json();
      body = createDestinationSchema.parse(json);
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Verify connection exists and belongs to org
    const connection = await getSlimConnectionById({
      env: getBackendEnv(),
      connectionId: body.connectionId,
      orgId: userInOrg.orgId,
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Create destination
    const destinationId = nanoid();
    const destination = {
      id: destinationId,
      orgId: userInOrg.orgId,
      name: body.name,
      type: body.type,
      configuration: body.configuration,
      connectionId: body.connectionId,
      status: DestinationStatus.Running,
    };

    await db().insert(destinations).values(destination);

    req.log.info("Destination created", {
      destinationId,
      type: body.type,
      orgId: userInOrg.orgId,
    });

    // Return created destination
    const created = await db()
      .select()
      .from(destinations)
      .where(eq(destinations.id, destinationId))
      .limit(1);

    return NextResponse.json(created[0], { status: 201 });
  }
);
