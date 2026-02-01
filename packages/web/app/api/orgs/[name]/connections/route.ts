/**
 * API routes for listing connections
 */

import { db } from "@/db";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { parseQueryParams } from "@/lib/utils";
import {
  getConnectionsQuerySchema,
  GetConnectionsQueryType,
} from "@/lib/validations/connections";
import {
  orgNameRouteContextSchema,
  orgNameRouteContextSchemaType,
} from "@/lib/validations/orgs";
import { env } from "@/web-env";
import { NextResponse } from "next/server";
import {
  getSlimConnectionsForOrgId,
  slimConnectionsToDisplays,
  BackendEnv,
} from "shared/src/connection";
import { ConnectionStatus } from "shared/src/db/schema";
import { Role, hasPermission } from "shared/src/types/role";

function getBackendEnv(): BackendEnv {
  return env as unknown as BackendEnv;
}

/**
 * GET /api/orgs/[name]/connections
 * List connections for an org, optionally filtered by type
 */
export const GET = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    // Parse and validate route params
    const { params } = orgNameRouteContextSchema.parse(context);
    const orgName = params.name;

    // Verify user has access to this org
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Parse query params
    const query = parseQueryParams<GetConnectionsQueryType>(
      req,
      getConnectionsQuerySchema
    );

    // Get connections, excluding archived/disabled
    const connections = await getSlimConnectionsForOrgId({
      env: getBackendEnv(),
      orgId: userInOrg.orgId,
      type: query.type,
      excludingStatuses: [ConnectionStatus.Disabled, ConnectionStatus.Archived],
    });

    return NextResponse.json(slimConnectionsToDisplays(connections));
  }
);
