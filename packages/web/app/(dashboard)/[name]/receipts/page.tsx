import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { DashboardHeader } from "@/custom-components/header";
import { DashboardShell } from "@/custom-components/shell";
import { EmptyPlaceholder } from "@/custom-components/empty-placeholder";
import { getOrgUserForOrgName } from "@/lib/org";
import { getCurrentServerUser } from "@/lib/session";
import { cookies } from "next/headers";
import { Role, hasPermission } from "shared/src/types/role";
import { db } from "@/db";
import { receipts, ReceiptStatus } from "shared/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { Button } from "components/ui/button";
import { Icons } from "@/custom-components/icons";
import { ReceiptsList } from "./receipts-list";

export const metadata = {
  title: "Receipts",
};

export default async function ReceiptsPage({
  params,
}: {
  params: { name: string };
}) {
  const user = await getCurrentServerUser(cookies());
  if (!user) {
    redirect("/login");
  }

  const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
    notFound();
  }

  // Fetch receipts for this org
  const receiptRecords = await db()
    .select()
    .from(receipts)
    .where(eq(receipts.orgId, userInOrg.orgId))
    .orderBy(desc(receipts.createdAt))
    .limit(100);

  const canWrite = hasPermission(userInOrg.role, Role.WRITE);

  return (
    <DashboardShell>
      <DashboardHeader heading="Receipts" text="View and manage your receipts.">
        {canWrite && (
          <Link href={`/${params.name}/receipts/upload`}>
            <Button>
              <Icons.add className="mr-2 h-4 w-4" />
              Upload Receipts
            </Button>
          </Link>
        )}
      </DashboardHeader>

      {receiptRecords.length === 0 ? (
        <EmptyPlaceholder>
          <EmptyPlaceholder.Icon name="receipt" />
          <EmptyPlaceholder.Title>No receipts yet</EmptyPlaceholder.Title>
          <EmptyPlaceholder.Description>
            Upload your first receipt to get started tracking expenses.
          </EmptyPlaceholder.Description>
          {canWrite && (
            <Link href={`/${params.name}/receipts/upload`}>
              <Button variant="outline">
                <Icons.add className="mr-2 h-4 w-4" />
                Upload Receipt
              </Button>
            </Link>
          )}
        </EmptyPlaceholder>
      ) : (
        <ReceiptsList receipts={receiptRecords} orgName={params.name} />
      )}
    </DashboardShell>
  );
}
