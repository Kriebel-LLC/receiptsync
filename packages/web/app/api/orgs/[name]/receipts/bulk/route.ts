import { db } from "@/db";
import { routeHandler } from "@/lib/route";
import { getOrgUserForOrgName } from "@/lib/org";
import { NextResponse } from "next/server";
import { Role, hasPermission } from "shared/src/types/role";
import { receipts, syncedReceipts, ReceiptCategory } from "shared/src/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  receiptIds: z.array(z.string()).min(1).max(100),
});

const bulkUpdateSchema = z.object({
  receiptIds: z.array(z.string()).min(1).max(100),
  updates: z.object({
    category: z.nativeEnum(ReceiptCategory).optional(),
    vendor: z.string().optional(),
  }),
});

interface RouteContext {
  params: { name: string };
}

// PATCH - Bulk update receipts
export const PATCH = routeHandler<RouteContext>(async (req, user, context) => {
  const { name } = context.params;

  const userInOrg = await getOrgUserForOrgName(user.uid, name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json();
  const body = bulkUpdateSchema.parse(json);

  // Verify all receipts belong to the org
  const existingReceipts = await db()
    .select({ id: receipts.id })
    .from(receipts)
    .where(
      and(
        inArray(receipts.id, body.receiptIds),
        eq(receipts.orgId, userInOrg.orgId)
      )
    );

  const existingIds = new Set(existingReceipts.map((r) => r.id));
  const invalidIds = body.receiptIds.filter((id) => !existingIds.has(id));

  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: "Some receipt IDs are invalid or do not belong to this org" },
      { status: 400 }
    );
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  if (body.updates.category) updates.category = body.updates.category;
  if (body.updates.vendor) updates.vendor = body.updates.vendor;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, updated: 0 });
  }

  await db()
    .update(receipts)
    .set(updates)
    .where(inArray(receipts.id, body.receiptIds));

  return NextResponse.json({ success: true, updated: body.receiptIds.length });
});

// DELETE - Bulk delete receipts
export const DELETE = routeHandler<RouteContext>(async (req, user, context) => {
  const { name } = context.params;

  const userInOrg = await getOrgUserForOrgName(user.uid, name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json();
  const body = bulkDeleteSchema.parse(json);

  // Verify all receipts belong to the org
  const existingReceipts = await db()
    .select({ id: receipts.id })
    .from(receipts)
    .where(
      and(
        inArray(receipts.id, body.receiptIds),
        eq(receipts.orgId, userInOrg.orgId)
      )
    );

  const existingIds = new Set(existingReceipts.map((r) => r.id));
  const validIds = body.receiptIds.filter((id) => existingIds.has(id));

  if (validIds.length === 0) {
    return NextResponse.json(
      { error: "No valid receipt IDs found" },
      { status: 400 }
    );
  }

  // Delete synced receipts first (foreign key constraint)
  await db()
    .delete(syncedReceipts)
    .where(inArray(syncedReceipts.receiptId, validIds));

  // Delete receipts
  await db().delete(receipts).where(inArray(receipts.id, validIds));

  return NextResponse.json({ success: true, deleted: validIds.length });
});
