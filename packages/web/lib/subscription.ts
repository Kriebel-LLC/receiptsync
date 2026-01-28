import { db } from "@/db";
import {
  freePlan,
  proPlan,
  businessPlan,
  planToSubscriptionPlan,
} from "@/config/subscriptions";
import { OrgSubscriptionPlan, UserSubscriptionPlan } from "types";
import { getOrCreateUserRecord } from "./auth";
import { Plan, stripePriceIdToPlan } from "shared/src/types/plan";
import { env } from "@/web-env";
import { orgs } from "shared/src/db/schema";
import { eq } from "drizzle-orm";

export async function getUserSubscriptionPlan(
  userId: string
): Promise<UserSubscriptionPlan> {
  const user = await getOrCreateUserRecord(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Check if user has an active subscription
  const hasActiveSubscription =
    user.stripePriceId &&
    user.stripeCurrentPeriodEnd &&
    user.stripeCurrentPeriodEnd.getTime() + 86_400_000 > Date.now();

  // Determine plan from price ID
  let plan = Plan.FREE;
  if (hasActiveSubscription && user.stripePriceId) {
    const detectedPlan = stripePriceIdToPlan(user.stripePriceId, env);
    if (detectedPlan) {
      plan = detectedPlan;
    }
  }

  const subscriptionPlan = planToSubscriptionPlan(plan);
  const isPro = plan !== Plan.FREE;

  return {
    ...subscriptionPlan,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd?.getTime() ?? 0,
    isPro,
    plan,
  };
}

export async function getOrgSubscriptionPlan(
  orgId: string
): Promise<OrgSubscriptionPlan> {
  const [org] = await db()
    .select()
    .from(orgs)
    .where(eq(orgs.id, orgId));

  if (!org) {
    throw new Error("Organization not found");
  }

  const subscriptionPlan = planToSubscriptionPlan(org.plan as Plan);

  return {
    ...subscriptionPlan,
    stripeCustomerId: org.stripeCustomerId,
    stripeSubscriptionId: org.stripeSubscriptionId,
    stripeCurrentPeriodEnd: org.stripeCurrentPeriodEnd?.getTime() ?? null,
    plan: org.plan as Plan,
    receiptsUsedThisPeriod: org.receiptsUsedThisPeriod,
    billingPeriodStart: org.billingPeriodStart,
    billingPeriodEnd: org.billingPeriodEnd,
  };
}

/**
 * Get the subscription plan for an org by name
 */
export async function getOrgSubscriptionPlanByName(
  orgName: string
): Promise<OrgSubscriptionPlan> {
  const [org] = await db()
    .select()
    .from(orgs)
    .where(eq(orgs.name, orgName));

  if (!org) {
    throw new Error("Organization not found");
  }

  return getOrgSubscriptionPlan(org.id);
}
