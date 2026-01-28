import { notFound, redirect } from "next/navigation";

import { DashboardHeader } from "@/custom-components/header";
import { DashboardShell } from "@/custom-components/shell";
import { ReceiptExport } from "@/custom-components/receipt-export";
import { getOrgUserForOrgName } from "@/lib/org";
import { getCurrentServerUser } from "@/lib/session";
import { cookies } from "next/headers";
import { Role, hasPermission } from "shared/src/types/role";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage({
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

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Organization Dashboard"
        text="Manage your receipts and export data."
      />
      <div className="grid gap-8">
        <ReceiptExport orgName={params.name} />
      </div>
    </DashboardShell>
  );
}
