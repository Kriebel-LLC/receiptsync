import { notFound, redirect } from "next/navigation";

import { DashboardHeader } from "@/custom-components/header";
import { OrgBillingForm } from "@/custom-components/org-billing-form";
import { DashboardShell } from "@/custom-components/shell";
import { getOrgUserForOrgName } from "@/lib/org";
import { getCurrentServerUser } from "@/lib/session";
import { getOrgSubscriptionPlan } from "@/lib/subscription";
import { cookies } from "next/headers";
import { Plan } from "shared/src/types/plan";
import { Role, hasPermission } from "shared/src/types/role";

export const metadata = {
  title: "Billing",
  description: "Manage billing and your subscription plan.",
};

export default async function BillingPage({
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

  const subscriptionPlan = await getOrgSubscriptionPlan(userInOrg.orgId);

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Billing"
        text="Manage billing and your subscription plan."
      />
      <div className="grid gap-8">
        <OrgBillingForm
          orgName={params.name}
          orgPlan={userInOrg.orgPlan as Plan}
          subscriptionPlan={subscriptionPlan}
        />
      </div>
    </DashboardShell>
  );
}
