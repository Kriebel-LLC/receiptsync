import { DrizzleD1Database } from "drizzle-orm/d1";
import { and, eq, gte, sql } from "drizzle-orm";
import { orgs, receipts, destinations } from "./db/schema";
import { Plan, getPlanLimits, PlanLimits } from "./types/plan";
import * as schema from "./db/schema";

export interface UsageInfo {
  receiptsUsed: number;
  receiptsLimit: number | null; // null = unlimited
  destinationsUsed: number;
  destinationsLimit: number | null; // null = unlimited
  percentReceiptsUsed: number | null; // null if unlimited
  percentDestinationsUsed: number | null; // null if unlimited
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number | null;
  suggestedPlan?: Plan;
}

/**
 * Get the usage info for an organization
 */
export async function getOrgUsageInfo(
  db: DrizzleD1Database<typeof schema>,
  orgId: string
): Promise<UsageInfo> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));

  if (!org) {
    throw new Error("Organization not found");
  }

  const limits = getPlanLimits(org.plan as Plan);

  // Get destination count
  const [destResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(destinations)
    .where(eq(destinations.orgId, orgId));

  const destinationsUsed = destResult?.count ?? 0;

  // Calculate receipt usage for the current billing period
  let receiptsUsed = org.receiptsUsedThisPeriod;

  // If no billing period is set (free plan users), count receipts from the current calendar month
  if (!org.billingPeriodStart) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [receiptResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(receipts)
      .where(
        and(eq(receipts.orgId, orgId), gte(receipts.createdAt, startOfMonth))
      );

    receiptsUsed = receiptResult?.count ?? 0;
  }

  return {
    receiptsUsed,
    receiptsLimit: limits.receiptsPerMonth,
    destinationsUsed,
    destinationsLimit: limits.maxDestinations,
    percentReceiptsUsed:
      limits.receiptsPerMonth !== null
        ? Math.round((receiptsUsed / limits.receiptsPerMonth) * 100)
        : null,
    percentDestinationsUsed:
      limits.maxDestinations !== null
        ? Math.round((destinationsUsed / limits.maxDestinations) * 100)
        : null,
    billingPeriodStart: org.billingPeriodStart,
    billingPeriodEnd: org.billingPeriodEnd,
  };
}

/**
 * Check if an organization can add a new receipt
 */
export async function canAddReceipt(
  db: DrizzleD1Database<typeof schema>,
  orgId: string
): Promise<LimitCheckResult> {
  const usage = await getOrgUsageInfo(db, orgId);

  if (
    usage.receiptsLimit !== null &&
    usage.receiptsUsed >= usage.receiptsLimit
  ) {
    // Determine which plan to suggest
    const suggestedPlan =
      usage.receiptsLimit === 50 ? Plan.PRO : Plan.BUSINESS;

    return {
      allowed: false,
      reason: `You've reached your monthly limit of ${usage.receiptsLimit} receipts. Please upgrade to continue.`,
      currentUsage: usage.receiptsUsed,
      limit: usage.receiptsLimit,
      suggestedPlan,
    };
  }

  return { allowed: true };
}

/**
 * Check if an organization can add a new destination
 */
export async function canAddDestination(
  db: DrizzleD1Database<typeof schema>,
  orgId: string
): Promise<LimitCheckResult> {
  const usage = await getOrgUsageInfo(db, orgId);

  if (
    usage.destinationsLimit !== null &&
    usage.destinationsUsed >= usage.destinationsLimit
  ) {
    return {
      allowed: false,
      reason: `You've reached your limit of ${usage.destinationsLimit} destination${usage.destinationsLimit === 1 ? "" : "s"}. Please upgrade to add more.`,
      currentUsage: usage.destinationsUsed,
      limit: usage.destinationsLimit,
      suggestedPlan: Plan.PRO,
    };
  }

  return { allowed: true };
}

/**
 * Increment the receipt usage counter for an organization
 */
export async function incrementReceiptUsage(
  db: DrizzleD1Database<typeof schema>,
  orgId: string
): Promise<void> {
  await db
    .update(orgs)
    .set({
      receiptsUsedThisPeriod: sql`${orgs.receiptsUsedThisPeriod} + 1`,
    })
    .where(eq(orgs.id, orgId));
}

/**
 * Check if the org is approaching their receipt limit
 * Returns a warning threshold (e.g., 80%, 90%, 100%)
 */
export function getUsageWarningLevel(usage: UsageInfo): number | null {
  if (usage.receiptsLimit === null || usage.percentReceiptsUsed === null) {
    return null;
  }

  if (usage.percentReceiptsUsed >= 100) return 100;
  if (usage.percentReceiptsUsed >= 90) return 90;
  if (usage.percentReceiptsUsed >= 80) return 80;

  return null;
}

/**
 * Get a human-readable upgrade message based on usage
 */
export function getUpgradePromptMessage(
  usage: UsageInfo,
  currentPlan: Plan
): string | null {
  const warningLevel = getUsageWarningLevel(usage);

  if (warningLevel === null) return null;

  if (warningLevel >= 100) {
    if (currentPlan === Plan.FREE) {
      return "You've used all 50 receipts this month. Upgrade to Pro for 500 receipts/month.";
    }
    if (currentPlan === Plan.PRO) {
      return "You've used all 500 receipts this month. Upgrade to Business for unlimited receipts.";
    }
    return null;
  }

  if (warningLevel >= 90) {
    const remaining = usage.receiptsLimit! - usage.receiptsUsed;
    return `You have ${remaining} receipt${remaining === 1 ? "" : "s"} remaining this month.`;
  }

  if (warningLevel >= 80) {
    return `You've used ${usage.percentReceiptsUsed}% of your monthly receipts.`;
  }

  return null;
}
