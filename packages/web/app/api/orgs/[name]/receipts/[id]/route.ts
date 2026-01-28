import { db } from "@/db";
import { logError } from "@/lib/logger";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { getPresignedDownloadUrl } from "@/lib/storage/r2";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { receipts, ReceiptCategory } from "shared/src/db/schema";
import { Role, hasPermission } from "shared/src/types/role";
import * as z from "zod";

interface RouteContext {
  params: { name: string; id: string };
}

const updateReceiptSchema = z.object({
  vendor: z.string().max(500).nullable().optional(),
  amount: z.number().positive().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  date: z.string().nullable().optional(),
  category: z.nativeEnum(ReceiptCategory).nullable().optional(),
  taxAmount: z.number().nullable().optional(),
  subtotal: z.number().nullable().optional(),
  paymentMethod: z.string().max(100).nullable().optional(),
  receiptNumber: z.string().max(191).nullable().optional(),
});

export const GET = routeHandler(async (req, user, { params }: RouteContext) => {
  try {
    // Check user has read permission for this org
    const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
    if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch receipt
    const [receipt] = await db()
      .select()
      .from(receipts)
      .where(
        and(eq(receipts.id, params.id), eq(receipts.orgId, userInOrg.orgId))
      )
      .limit(1);

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Generate presigned URL for the image if available
    let imageUrl: string | null = null;
    if (receipt.originalImageUrl) {
      imageUrl = await getPresignedDownloadUrl({
        key: receipt.originalImageUrl,
        expiresIn: 3600,
      });
    }

    return NextResponse.json({
      ...receipt,
      imageUrl,
    });
  } catch (error) {
    logError(error, req);
    return NextResponse.json(
      { error: "Failed to fetch receipt" },
      { status: 500 }
    );
  }
});

export const PATCH = routeHandler(
  async (req, user, { params }: RouteContext) => {
    try {
      // Check user has write permission for this org
      const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
      if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Verify the receipt exists and belongs to this org
      const [existingReceipt] = await db()
        .select()
        .from(receipts)
        .where(
          and(eq(receipts.id, params.id), eq(receipts.orgId, userInOrg.orgId))
        )
        .limit(1);

      if (!existingReceipt) {
        return NextResponse.json(
          { error: "Receipt not found" },
          { status: 404 }
        );
      }

      const json = await req.json();
      const body = updateReceiptSchema.parse(json);

      // Build update object
      const updateData: Partial<typeof receipts.$inferInsert> = {};

      if (body.vendor !== undefined) updateData.vendor = body.vendor;
      if (body.amount !== undefined) updateData.amount = body.amount;
      if (body.currency !== undefined) updateData.currency = body.currency;
      if (body.date !== undefined) {
        updateData.date = body.date ? new Date(body.date) : null;
      }
      if (body.category !== undefined) updateData.category = body.category;
      if (body.taxAmount !== undefined) updateData.taxAmount = body.taxAmount;
      if (body.subtotal !== undefined) updateData.subtotal = body.subtotal;
      if (body.paymentMethod !== undefined)
        updateData.paymentMethod = body.paymentMethod;
      if (body.receiptNumber !== undefined)
        updateData.receiptNumber = body.receiptNumber;

      // Update receipt
      await db()
        .update(receipts)
        .set(updateData)
        .where(eq(receipts.id, params.id));

      // Fetch updated receipt
      const [updatedReceipt] = await db()
        .select()
        .from(receipts)
        .where(eq(receipts.id, params.id))
        .limit(1);

      return NextResponse.json(updatedReceipt);
    } catch (error) {
      logError(error, req);

      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 422 });
      }

      return NextResponse.json(
        { error: "Failed to update receipt" },
        { status: 500 }
      );
    }
  }
);

export const DELETE = routeHandler(
  async (req, user, { params }: RouteContext) => {
    try {
      // Check user has write permission for this org
      const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
      if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Verify the receipt exists and belongs to this org
      const [existingReceipt] = await db()
        .select()
        .from(receipts)
        .where(
          and(eq(receipts.id, params.id), eq(receipts.orgId, userInOrg.orgId))
        )
        .limit(1);

      if (!existingReceipt) {
        return NextResponse.json(
          { error: "Receipt not found" },
          { status: 404 }
        );
      }

      // Delete receipt (soft delete by archiving)
      await db().delete(receipts).where(eq(receipts.id, params.id));

      return NextResponse.json({ success: true });
    } catch (error) {
      logError(error, req);
      return NextResponse.json(
        { error: "Failed to delete receipt" },
        { status: 500 }
      );
    }
  }
);
