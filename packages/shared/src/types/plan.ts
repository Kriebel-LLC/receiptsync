export enum Plan {
  FREE = "free",
  PRO = "pro",
  BUSINESS = "business",
}

/**
 * Plan limits for ReceiptSync
 */
export interface PlanLimits {
  receiptsPerMonth: number | null; // null = unlimited
  maxDestinations: number | null; // null = unlimited
  priorityProcessing: boolean;
  teamFeatures: boolean;
  apiAccess: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  [Plan.FREE]: {
    receiptsPerMonth: 50,
    maxDestinations: 1,
    priorityProcessing: false,
    teamFeatures: false,
    apiAccess: false,
  },
  [Plan.PRO]: {
    receiptsPerMonth: 500,
    maxDestinations: null, // unlimited
    priorityProcessing: true,
    teamFeatures: false,
    apiAccess: false,
  },
  [Plan.BUSINESS]: {
    receiptsPerMonth: null, // unlimited
    maxDestinations: null, // unlimited
    priorityProcessing: true,
    teamFeatures: true,
    apiAccess: true,
  },
};

export interface StripePriceEnv {
  STRIPE_PRO_MONTHLY_PLAN_ID: string;
  STRIPE_BUSINESS_MONTHLY_PLAN_ID: string;
}

export function stripePriceIdToPlan(
  stripePriceId: string,
  env: StripePriceEnv
): Plan | null {
  switch (stripePriceId) {
    case env.STRIPE_PRO_MONTHLY_PLAN_ID:
      return Plan.PRO;
    case env.STRIPE_BUSINESS_MONTHLY_PLAN_ID:
      return Plan.BUSINESS;
    default:
      return null;
  }
}

/**
 * Get the plan limits for a given plan
 */
export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
