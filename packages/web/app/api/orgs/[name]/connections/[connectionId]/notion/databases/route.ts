/**
 * API route for listing Notion databases for a connection
 */

import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { orgNameRouteContextSchema } from "@/lib/validations/orgs";
import { env } from "@/web-env";
import { NextResponse } from "next/server";
import { getDecryptedConnectionById, BackendEnv } from "shared/src/connection";
import { ConnectionType } from "shared/src/db/schema";
import {
  getAllDatabases,
  getDatabaseTitle,
  validateNotionDatabase,
  NotionPropertyType,
  DatabaseProperty,
} from "shared/src/notion";
import { Role, hasPermission } from "shared/src/types/role";
import * as z from "zod";

function getBackendEnv(): BackendEnv {
  return env as unknown as BackendEnv;
}

// Route context with both org name and connection ID
const routeContextSchema = z.object({
  params: z.object({
    name: z.string(),
    connectionId: z.string(),
  }),
});

type RouteContextType = z.infer<typeof routeContextSchema>;

export interface DatabaseDisplay {
  id: string;
  title: string;
  valid: boolean;
  errors: string[];
  properties: {
    id: string;
    name: string;
    type: NotionPropertyType;
  }[];
}

/**
 * GET /api/orgs/[name]/connections/[connectionId]/notion/databases
 * List all Notion databases the integration has access to
 */
export const GET = routeHandler<RouteContextType>(
  async (req, user, context) => {
    // Parse and validate route params
    const { params } = routeContextSchema.parse(context);
    const { name: orgName, connectionId } = params;

    // Verify user has access to this org
    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Get the connection with decrypted access token
    const connection = await getDecryptedConnectionById({
      env: getBackendEnv(),
      connectionId,
      orgId: userInOrg.orgId,
    });

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Verify it's a Notion connection
    if (connection.type !== ConnectionType.Notion) {
      return NextResponse.json(
        { error: "Connection is not a Notion connection" },
        { status: 400 }
      );
    }

    try {
      // Fetch all databases from Notion
      const databases = await getAllDatabases(connection.decryptedAccessToken);

      // Transform to display format
      const databaseDisplays: DatabaseDisplay[] = databases.map((db) => {
        const validation = validateNotionDatabase(db.properties);
        return {
          id: db.id,
          title: getDatabaseTitle(db),
          valid: validation.isValid,
          errors: validation.errors,
          properties: Object.values(db.properties).map((prop: DatabaseProperty) => ({
            id: prop.id,
            name: prop.name,
            type: prop.type,
          })),
        };
      });

      return NextResponse.json(databaseDisplays);
    } catch (error) {
      req.log.error("Failed to fetch Notion databases", {
        error: error instanceof Error ? error.message : String(error),
        connectionId,
      });

      return NextResponse.json(
        { error: "Failed to fetch databases from Notion" },
        { status: 500 }
      );
    }
  }
);
