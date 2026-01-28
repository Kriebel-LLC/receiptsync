import { db } from "@/db";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import {
  orgNameRouteContextSchema,
  orgNameRouteContextSchemaType,
} from "@/lib/validations/orgs";
import { NextResponse } from "next/server";
import {
  getOrgUsageInfo,
  getUpgradePromptMessage,
} from "shared/src/billing";
import { Plan } from "shared/src/types/plan";
import { Role, hasPermission } from "shared/src/types/role";

export const GET = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    let orgName: string;
    try {
      const { params } = orgNameRouteContextSchema.parse(context);
      orgName = params.name;
    } catch (error) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const usage = await getOrgUsageInfo(db(), userInOrg.orgId);
    const upgradePrompt = getUpgradePromptMessage(
      usage,
      userInOrg.orgPlan as Plan
    );

    return NextResponse.json({
      ...usage,
      plan: userInOrg.orgPlan,
      upgradePrompt,
    });
  }
);
