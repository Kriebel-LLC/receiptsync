import { notFound, redirect } from "next/navigation";

import { DashboardHeader } from "@/custom-components/header";
import { DashboardShell } from "@/custom-components/shell";
import { getOrgUserForOrgName, getOrgIdForOrgName } from "@/lib/org";
import { getCurrentServerUser } from "@/lib/session";
import { cookies } from "next/headers";
import { Role, hasPermission } from "shared/src/types/role";
import { db } from "@/db";
import { receipts, syncedReceipts, destinations } from "shared/src/db/schema";
import { eq, desc, and, gte, lte, like, or, sql, count } from "drizzle-orm";
import { ReceiptsClient } from "./receipts-client";
import { ReceiptCategory, ReceiptStatus } from "shared/src/db/schema";

export const metadata = {
  title: "Receipts",
};

interface ReceiptsPageProps {
  params: { name: string };
  searchParams: {
    page?: string;
    view?: string;
    search?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    amountMin?: string;
    amountMax?: string;
    status?: string;
    sort?: string;
    order?: string;
  };
}

export default async function ReceiptsPage({
  params,
  searchParams,
}: ReceiptsPageProps) {
  const user = await getCurrentServerUser(cookies());
  if (!user) {
    redirect("/login");
  }

  const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
    notFound();
  }

  const orgId = userInOrg.orgId;

  // Parse search params
  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = 12;
  const offset = (page - 1) * pageSize;
  const search = searchParams.search || "";
  const category = searchParams.category as ReceiptCategory | undefined;
  const status = searchParams.status as ReceiptStatus | undefined;
  const dateFrom = searchParams.dateFrom
    ? new Date(searchParams.dateFrom)
    : undefined;
  const dateTo = searchParams.dateTo ? new Date(searchParams.dateTo) : undefined;
  const amountMin = searchParams.amountMin
    ? parseFloat(searchParams.amountMin)
    : undefined;
  const amountMax = searchParams.amountMax
    ? parseFloat(searchParams.amountMax)
    : undefined;
  const sortField = searchParams.sort || "createdAt";
  const sortOrder = searchParams.order || "desc";

  // Build where conditions
  const conditions = [eq(receipts.orgId, orgId)];

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
    conditions.push(gte(receipts.date, dateFrom));
  }

  if (dateTo) {
    conditions.push(lte(receipts.date, dateTo));
  }

  if (amountMin !== undefined) {
    conditions.push(gte(receipts.amount, amountMin));
  }

  if (amountMax !== undefined) {
    conditions.push(lte(receipts.amount, amountMax));
  }

  // Get receipts with pagination
  const whereClause = and(...conditions);

  // Determine sort column and order
  const sortColumn =
    sortField === "date"
      ? receipts.date
      : sortField === "amount"
      ? receipts.amount
      : sortField === "vendor"
      ? receipts.vendor
      : receipts.createdAt;

  const orderByClause = sortOrder === "asc" ? sortColumn : desc(sortColumn);

  const [receiptsList, totalCountResult] = await Promise.all([
    db()
      .select()
      .from(receipts)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset),
    db()
      .select({ count: count() })
      .from(receipts)
      .where(whereClause),
  ]);

  const totalCount = totalCountResult[0]?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Get sync status for each receipt
  const receiptIds = receiptsList.map((r) => r.id);
  const syncStatuses =
    receiptIds.length > 0
      ? await db()
          .select({
            receiptId: syncedReceipts.receiptId,
            destinationId: syncedReceipts.destinationId,
            status: syncedReceipts.status,
          })
          .from(syncedReceipts)
          .where(
            or(...receiptIds.map((id) => eq(syncedReceipts.receiptId, id)))
          )
      : [];

  // Get destination names for sync statuses
  const destinationIds = [...new Set(syncStatuses.map((s) => s.destinationId))];
  const destinationsList =
    destinationIds.length > 0
      ? await db()
          .select({
            id: destinations.id,
            name: destinations.name,
            type: destinations.type,
          })
          .from(destinations)
          .where(or(...destinationIds.map((id) => eq(destinations.id, id))))
      : [];

  // Create sync status map
  const syncStatusMap = new Map<
    string,
    Array<{
      destinationId: string;
      destinationName: string;
      destinationType: string;
      status: string;
    }>
  >();

  for (const sync of syncStatuses) {
    const dest = destinationsList.find((d) => d.id === sync.destinationId);
    if (!syncStatusMap.has(sync.receiptId)) {
      syncStatusMap.set(sync.receiptId, []);
    }
    syncStatusMap.get(sync.receiptId)!.push({
      destinationId: sync.destinationId,
      destinationName: dest?.name || "Unknown",
      destinationType: dest?.type || "Unknown",
      status: sync.status,
    });
  }

  // Calculate quick stats (this month)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const statsResult = await db()
    .select({
      totalAmount: sql<number>`COALESCE(SUM(${receipts.amount}), 0)`,
      receiptCount: count(),
    })
    .from(receipts)
    .where(
      and(
        eq(receipts.orgId, orgId),
        gte(receipts.date, startOfMonth),
        lte(receipts.date, endOfMonth)
      )
    );

  const categoryStatsResult = await db()
    .select({
      category: receipts.category,
      totalAmount: sql<number>`COALESCE(SUM(${receipts.amount}), 0)`,
      receiptCount: count(),
    })
    .from(receipts)
    .where(
      and(
        eq(receipts.orgId, orgId),
        gte(receipts.date, startOfMonth),
        lte(receipts.date, endOfMonth)
      )
    )
    .groupBy(receipts.category);

  const stats = {
    thisMonth: {
      totalAmount: statsResult[0]?.totalAmount || 0,
      receiptCount: statsResult[0]?.receiptCount || 0,
    },
    byCategory: categoryStatsResult.map((c) => ({
      category: c.category,
      totalAmount: c.totalAmount,
      receiptCount: c.receiptCount,
    })),
  };

  // Prepare data for client component
  const receiptsWithSync = receiptsList.map((receipt) => ({
    ...receipt,
    syncStatuses: syncStatusMap.get(receipt.id) || [],
  }));

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Receipts"
        text="Manage and track your receipts."
      />
      <ReceiptsClient
        receipts={receiptsWithSync}
        stats={stats}
        pagination={{
          page,
          pageSize,
          totalCount,
          totalPages,
        }}
        filters={{
          search,
          category,
          status,
          dateFrom: dateFrom?.toISOString(),
          dateTo: dateTo?.toISOString(),
          amountMin,
          amountMax,
          sort: sortField,
          order: sortOrder,
        }}
        orgName={params.name}
        canWrite={hasPermission(userInOrg.role, Role.WRITE)}
      />
    </DashboardShell>
  );
}
