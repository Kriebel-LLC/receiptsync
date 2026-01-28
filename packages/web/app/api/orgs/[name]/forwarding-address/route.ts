import { db } from "@/db";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import {
  orgNameRouteContextSchema,
  orgNameRouteContextSchemaType,
} from "@/lib/validations/orgs";
import { NextResponse } from "next/server";
import { emailForwardingAddresses } from "shared/src/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid, customAlphabet } from "nanoid";
import { Role, hasPermission } from "shared/src/types/role";

// Generate a URL-safe, lowercase alphanumeric code
const generateAddressCode = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  8
);

const EMAIL_DOMAIN = "receipts.receiptsync.com";

/**
 * GET /api/orgs/[name]/forwarding-address
 * Get the forwarding address for an organization
 */
export const GET = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    let orgName: string;
    try {
      const { params } = orgNameRouteContextSchema.parse(context);
      orgName = params.name;
    } catch {
      return new NextResponse(null, { status: 400 });
    }

    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Get the forwarding address for this org
    const forwardingAddress = await db()
      .select()
      .from(emailForwardingAddresses)
      .where(
        and(
          eq(emailForwardingAddresses.orgId, userInOrg.orgId),
          eq(emailForwardingAddresses.isActive, true)
        )
      )
      .get();

    if (!forwardingAddress) {
      return NextResponse.json({ forwardingAddress: null });
    }

    return NextResponse.json({
      forwardingAddress: {
        id: forwardingAddress.id,
        email: `${forwardingAddress.addressCode}@${EMAIL_DOMAIN}`,
        addressCode: forwardingAddress.addressCode,
        label: forwardingAddress.label,
        isActive: forwardingAddress.isActive,
        createdAt: forwardingAddress.createdAt,
      },
    });
  }
);

/**
 * POST /api/orgs/[name]/forwarding-address
 * Create a new forwarding address for an organization
 */
export const POST = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    let orgName: string;
    let label: string | undefined;

    try {
      const { params } = orgNameRouteContextSchema.parse(context);
      orgName = params.name;

      // Optional label in request body
      const body = (await req.json().catch(() => ({}))) as { label?: string };
      label = body.label;
    } catch {
      return new NextResponse(null, { status: 400 });
    }

    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.ADMIN)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Check if org already has an active forwarding address
    const existingAddress = await db()
      .select()
      .from(emailForwardingAddresses)
      .where(
        and(
          eq(emailForwardingAddresses.orgId, userInOrg.orgId),
          eq(emailForwardingAddresses.isActive, true)
        )
      )
      .get();

    if (existingAddress) {
      return NextResponse.json(
        { error: "Organization already has an active forwarding address" },
        { status: 409 }
      );
    }

    // Generate unique address code
    let addressCode = generateAddressCode();
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness
    while (attempts < maxAttempts) {
      const existing = await db()
        .select()
        .from(emailForwardingAddresses)
        .where(eq(emailForwardingAddresses.addressCode, addressCode))
        .get();

      if (!existing) break;
      addressCode = generateAddressCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: "Failed to generate unique address code" },
        { status: 500 }
      );
    }

    // Create the forwarding address
    const id = nanoid();
    await db().insert(emailForwardingAddresses).values({
      id,
      orgId: userInOrg.orgId,
      addressCode,
      isActive: true,
      label,
    });

    return NextResponse.json({
      forwardingAddress: {
        id,
        email: `${addressCode}@${EMAIL_DOMAIN}`,
        addressCode,
        label,
        isActive: true,
      },
    });
  }
);

/**
 * DELETE /api/orgs/[name]/forwarding-address
 * Deactivate the forwarding address for an organization
 */
export const DELETE = routeHandler<orgNameRouteContextSchemaType>(
  async (req, user, context) => {
    let orgName: string;
    try {
      const { params } = orgNameRouteContextSchema.parse(context);
      orgName = params.name;
    } catch {
      return new NextResponse(null, { status: 400 });
    }

    const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.ADMIN)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Deactivate all forwarding addresses for this org
    await db()
      .update(emailForwardingAddresses)
      .set({ isActive: false })
      .where(eq(emailForwardingAddresses.orgId, userInOrg.orgId));

    return NextResponse.json({ success: true });
  }
);
