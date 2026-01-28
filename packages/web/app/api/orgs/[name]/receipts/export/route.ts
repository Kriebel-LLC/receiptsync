import { db } from "@/db";
import { routeHandler } from "@/lib/route";
import { getOrgUserForOrgName } from "@/lib/org";
import { NextResponse } from "next/server";
import { Role, hasPermission } from "shared/src/types/role";
import { receipts, ReceiptCategory, ReceiptStatus } from "shared/src/db/schema";
import { and, eq, gte, lte, like, or, inArray, desc } from "drizzle-orm";

interface RouteContext {
  params: { name: string };
}

// GET - Export receipts as CSV
export const GET = routeHandler<RouteContext>(async (req, user, context) => {
  const { name } = context.params;

  const userInOrg = await getOrgUserForOrgName(user.uid, name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean);
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") as ReceiptCategory | null;
  const status = searchParams.get("status") as ReceiptStatus | null;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const amountMin = searchParams.get("amountMin");
  const amountMax = searchParams.get("amountMax");

  // Build where conditions
  const conditions = [eq(receipts.orgId, userInOrg.orgId)];

  if (ids && ids.length > 0) {
    conditions.push(inArray(receipts.id, ids));
  } else {
    if (search) {
      conditions.push(
        or(
          like(receipts.vendor, `%${search}%`),
          like(receipts.receiptNumber, `%${search}%`)
        )!
      );
    }

    if (category) {
      conditions.push(eq(receipts.category, category));
    }

    if (status) {
      conditions.push(eq(receipts.status, status));
    }

    if (dateFrom) {
      conditions.push(gte(receipts.date, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(receipts.date, new Date(dateTo)));
    }

    if (amountMin) {
      conditions.push(gte(receipts.amount, parseFloat(amountMin)));
    }

    if (amountMax) {
      conditions.push(lte(receipts.amount, parseFloat(amountMax)));
    }
  }

  const whereClause = and(...conditions);

  const receiptsList = await db()
    .select()
    .from(receipts)
    .where(whereClause)
    .orderBy(desc(receipts.date));

  // Build CSV
  const headers = [
    "ID",
    "Vendor",
    "Amount",
    "Currency",
    "Date",
    "Category",
    "Status",
    "Subtotal",
    "Tax",
    "Payment Method",
    "Receipt Number",
    "Confidence Score",
    "Created At",
  ];

  const escapeCSV = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  };

  const rows = receiptsList.map((receipt) => [
    escapeCSV(receipt.id),
    escapeCSV(receipt.vendor),
    escapeCSV(receipt.amount),
    escapeCSV(receipt.currency),
    escapeCSV(formatDate(receipt.date)),
    escapeCSV(receipt.category),
    escapeCSV(receipt.status),
    escapeCSV(receipt.subtotal),
    escapeCSV(receipt.taxAmount),
    escapeCSV(receipt.paymentMethod),
    escapeCSV(receipt.receiptNumber),
    escapeCSV(receipt.confidenceScore),
    escapeCSV(formatDate(receipt.createdAt)),
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n"
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="receipts-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
});
