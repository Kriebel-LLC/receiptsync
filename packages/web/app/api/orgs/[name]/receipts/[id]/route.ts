import { db } from "@/db";
import { routeHandler } from "@/lib/route";
import { getOrgUserForOrgName } from "@/lib/org";
import { NextResponse } from "next/server";
import { Role, hasPermission } from "shared/src/types/role";
import { receipts, ReceiptCategory } from "shared/src/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const updateReceiptSchema = z.object({
  vendor: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().max(3).nullable().optional(),
  category: z.nativeEnum(ReceiptCategory).nullable().optional(),
  date: z.string().nullable().optional().transform((val) => val ? new Date(val) : null),
  taxAmount: z.number().nullable().optional(),
  subtotal: z.number().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
});

interface RouteContext {
  params: { name: string; id: string };
}

// GET single receipt
export const GET = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, id } = context.params;

  const userInOrg = await getOrgUserForOrgName(user.uid, name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [receipt] = await db()
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.orgId, userInOrg.orgId)));

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return NextResponse.json(receipt);
});

// PATCH update receipt
export const PATCH = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, id } = context.params;

  const userInOrg = await getOrgUserForOrgName(user.uid, name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json();
  const body = updateReceiptSchema.parse(json);

  // Verify receipt exists and belongs to org
  const [existing] = await db()
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.orgId, userInOrg.orgId)));

  if (!existing) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  if (body.vendor !== undefined) updates.vendor = body.vendor;
  if (body.amount !== undefined) updates.amount = body.amount;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.category !== undefined) updates.category = body.category;
  if (body.date !== undefined) updates.date = body.date;
  if (body.taxAmount !== undefined) updates.taxAmount = body.taxAmount;
  if (body.subtotal !== undefined) updates.subtotal = body.subtotal;
  if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [updated] = await db()
    .update(receipts)
    .set(updates)
    .where(eq(receipts.id, id))
    .returning();

  return NextResponse.json(updated);
});

// DELETE receipt
export const DELETE = routeHandler<RouteContext>(async (req, user, context) => {
  const { name, id } = context.params;

  const userInOrg = await getOrgUserForOrgName(user.uid, name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify receipt exists and belongs to org
  const [existing] = await db()
    .select()
    .from(receipts)
    .where(and(eq(receipts.id, id), eq(receipts.orgId, userInOrg.orgId)));

  if (!existing) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  await db().delete(receipts).where(eq(receipts.id, id));

  return NextResponse.json({ success: true });
});
