import { notFound, redirect } from "next/navigation";

import { DashboardHeader } from "@/custom-components/header";
import { DashboardShell } from "@/custom-components/shell";
import { getOrgUserForOrgName } from "@/lib/org";
import { getCurrentServerUser } from "@/lib/session";
import { cookies } from "next/headers";
import { Role, hasPermission } from "shared/src/types/role";
import { db } from "@/db";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ReceiptReviewList } from "./receipt-review-list";

export const metadata = {
  title: "Review Receipts",
};

interface PageProps {
  params: { name: string };
  searchParams: { ids?: string };
}

export default async function ReceiptReviewPage({
  params,
  searchParams,
}: PageProps) {
  const user = await getCurrentServerUser(cookies());
  if (!user) {
    redirect("/login");
  }

  const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
    notFound();
  }

  // Get receipt IDs from query params
  const receiptIds = searchParams.ids?.split(",").filter(Boolean) || [];

  if (receiptIds.length === 0) {
    redirect(`/${params.name}/receipts/upload`);
  }

  // Fetch receipts from database
  const receiptRecords = await db()
    .select()
    .from(receipts)
    .where(
      and(inArray(receipts.id, receiptIds), eq(receipts.orgId, userInOrg.orgId))
    );

  if (receiptRecords.length === 0) {
    redirect(`/${params.name}/receipts/upload`);
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Review Receipts"
        text={`Review and confirm ${receiptRecords.length} receipt${
          receiptRecords.length !== 1 ? "s" : ""
        }.`}
      />
      <ReceiptReviewList
        receipts={receiptRecords}
        orgId={userInOrg.orgId}
        orgName={params.name}
      />
    </DashboardShell>
  );
}
