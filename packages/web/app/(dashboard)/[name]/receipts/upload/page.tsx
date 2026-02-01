import { notFound, redirect } from "next/navigation";

import { DashboardHeader } from "@/custom-components/header";
import { DashboardShell } from "@/custom-components/shell";
import { getOrgUserForOrgName } from "@/lib/org";
import { getCurrentServerUser } from "@/lib/session";
import { cookies } from "next/headers";
import { Role, hasPermission } from "shared/src/types/role";
import { ReceiptUploader } from "./receipt-uploader";

export const metadata = {
  title: "Upload Receipts",
};

export default async function ReceiptUploadPage({
  params,
}: {
  params: { name: string };
}) {
  const user = await getCurrentServerUser(cookies());
  if (!user) {
    redirect("/login");
  }

  const userInOrg = await getOrgUserForOrgName(user.uid, params.name);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.WRITE)) {
    notFound();
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Upload Receipts"
        text="Drag and drop receipts or take photos to upload."
      />
      <ReceiptUploader orgId={userInOrg.orgId} orgName={params.name} />
    </DashboardShell>
  );
}
