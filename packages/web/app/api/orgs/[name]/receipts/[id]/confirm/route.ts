import { db } from "@/db";
import { logError } from "@/lib/logger";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { Role, hasPermission } from "shared/src/types/role";

interface RouteContext {
  params: { name: string; id: string };
}

export const POST = routeHandler(
  async (req, user, { params }: RouteContext) => {
    try {
      // Check user has write permission for this org
      const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
      if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Verify the receipt exists and belongs to this org
      const [receipt] = await db()
        .select()
        .from(receipts)
        .where(
          and(eq(receipts.id, params.id), eq(receipts.orgId, userInOrg.orgId))
        )
        .limit(1);

      if (!receipt) {
        return NextResponse.json(
          { error: "Receipt not found" },
          { status: 404 }
        );
      }

      // Only confirm if still pending
      if (receipt.status !== ReceiptStatus.Pending) {
        return NextResponse.json({
          receiptId: receipt.id,
          status: receipt.status,
          message: "Receipt already processed",
        });
      }

      // Update status to PROCESSING
      await db()
        .update(receipts)
        .set({ status: ReceiptStatus.Processing })
        .where(eq(receipts.id, params.id));

      // TODO: Trigger extraction queue job when queue is set up
      // For now, we'll just mark it as processing and the review page
      // will show the processing status

      return NextResponse.json({
        receiptId: receipt.id,
        status: ReceiptStatus.Processing,
        message: "Receipt upload confirmed and extraction started",
      });
    } catch (error) {
      logError(error, req);
      return NextResponse.json(
        { error: "Failed to confirm upload" },
        { status: 500 }
      );
    }
  }
);
