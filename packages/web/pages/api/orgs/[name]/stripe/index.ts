import { proPlan, businessPlan, getPlanByPriceId } from "@/config/subscriptions";
import { EventNames, track } from "@/lib/amplitude";
import { getOrgUserForOrgName } from "@/lib/org";
import { routeHandler } from "@/lib/route";
import { stripe } from "@/lib/stripe";
import { absoluteUrl } from "@/lib/utils";
import { NextResponse } from "next/server";
import { Plan } from "shared/src/types/plan";
import { Role, hasPermission } from "shared/src/types/role";
import { z } from "zod";

export const config = {
  unstable_allowDynamic: [
    // Stripe imports this, but does not use it, so tell build to ignore
    // use a glob to allow anything in the function-bind 3rd party module
    "**/node_modules/function-bind/**",
  ],
};

const checkoutQuerySchema = z.object({
  name: z.string().min(1),
  plan: z.enum(["pro", "business"]).optional(),
});

const handler = routeHandler(async (req, user) => {
  if (req.method !== "GET") {
    return new NextResponse(null, { status: 405 });
  }

  const url = new URL(req.url);
  const parseResult = checkoutQuerySchema.safeParse({
    name: url.searchParams.get("name"),
    plan: url.searchParams.get("plan") || undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const { name: orgName, plan: requestedPlan } = parseResult.data;

  const userInOrg = await getOrgUserForOrgName(user.uid, orgName);
  if (!userInOrg || !hasPermission(userInOrg.role, Role.READ)) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const billingUrl = absoluteUrl(`/${orgName}/billing`);

  // If already subscribed, redirect to billing portal
  if (userInOrg.orgPlan !== Plan.FREE && userInOrg.orgStripeCustomerId) {
    const stripeSession = await stripe.billingPortal.sessions.create({
      customer: userInOrg.orgStripeCustomerId,
      return_url: billingUrl,
    });

    track(EventNames.ORG_BILLING_PORTAL_VIEWED, user.uid, {
      "org id": userInOrg.orgId,
      "stripe customer id": userInOrg.orgStripeCustomerId,
    });

    return NextResponse.json({ url: stripeSession.url });
  }

  // Determine which plan to checkout for
  const selectedPlan = requestedPlan === "business" ? businessPlan : proPlan;

  // Stripe errors when both customer & customer_email are set, so prefer Id when set
  const customerDetails = userInOrg.orgStripeCustomerId
    ? { customer: userInOrg.orgStripeCustomerId }
    : { customer_email: user.email };

  const stripeSession = await stripe.checkout.sessions.create({
    success_url: billingUrl,
    cancel_url: billingUrl,
    mode: "subscription",
    billing_address_collection: "auto",
    ...customerDetails,
    line_items: [
      {
        price: selectedPlan.stripePriceId,
        quantity: 1,
      },
    ],
    metadata: {
      org_id: userInOrg.orgId,
    },
    subscription_data: {
      metadata: {
        org_id: userInOrg.orgId,
      },
    },
  });

  track(EventNames.ORG_CHECKOUT_STARTED, user.uid, {
    "org id": userInOrg.orgId,
    "price id": selectedPlan.stripePriceId,
    plan: requestedPlan || "pro",
  });

  return NextResponse.json({ url: stripeSession.url });
});

export default handler;
