import { db } from "@/db";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import {
  orgNameRouteContextSchema,
  orgNameRouteContextSchemaType,
} from "@/lib/validations/orgs";
import { NextResponse } from "next/server";
import { canAddReceipt, canAddDestination } from "shared/src/billing";
import { Role, hasPermission } from "shared/src/types/role";
import { z } from "zod";

const querySchema = z.object({
  check: z.enum(["receipt", "destination"]),
});

export const GET = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    let orgName: string;
    try {
      const { params } = orgNameRouteContextSchema.parse(context);
      orgName = params.name;
    } catch (error) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const url = new URL(req.url);
    const parseResult = querySchema.safeParse({
      check: url.searchParams.get("check"),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Missing or invalid 'check' parameter. Use 'receipt' or 'destination'." },
        { status: 400 }
      );
    }

    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const { check } = parseResult.data;

    if (check === "receipt") {
      const result = await canAddReceipt(db(), userInOrg.orgId);
      return NextResponse.json(result);
    }

    if (check === "destination") {
      const result = await canAddDestination(db(), userInOrg.orgId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid check type" }, { status: 400 });
  }
);
