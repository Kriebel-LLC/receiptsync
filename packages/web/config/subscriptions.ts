import { env } from "@/web-env";
import { Plan, PLAN_LIMITS } from "shared/src/types/plan";
import { assertNever } from "shared/src/utils";
import { SubscriptionPlan } from "types";

export const freePlan: SubscriptionPlan = {
  name: "Free",
  description:
    "Perfect for getting started. Includes 50 receipts/month and 1 destination.",
  stripePriceId: "",
  price: 0,
  features: [
    "50 receipts per month",
    "1 destination (Google Sheets or Notion)",
    "Standard processing",
    "Email support",
  ],
  limits: PLAN_LIMITS[Plan.FREE],
};

export const proPlan: SubscriptionPlan = {
  name: "Pro",
  description:
    "Best for individuals and small teams. 500 receipts/month with unlimited destinations.",
  stripePriceId: env.STRIPE_PRO_MONTHLY_PLAN_ID || "",
  price: 9,
  features: [
    "500 receipts per month",
    "Unlimited destinations",
    "Priority processing",
    "Email support",
  ],
  limits: PLAN_LIMITS[Plan.PRO],
};

export const businessPlan: SubscriptionPlan = {
  name: "Business",
  description:
    "For growing teams. Unlimited receipts with team features and API access.",
  stripePriceId: env.STRIPE_BUSINESS_MONTHLY_PLAN_ID || "",
  price: 29,
  features: [
    "Unlimited receipts",
    "Unlimited destinations",
    "Priority processing",
    "Team collaboration features",
    "Full API access",
    "Priority support",
  ],
  limits: PLAN_LIMITS[Plan.BUSINESS],
};

export const ALL_PLANS = [freePlan, proPlan, businessPlan] as const;

export function planToSubscriptionPlan(plan: Plan): SubscriptionPlan {
  switch (plan) {
    case Plan.FREE:
      return freePlan;
    case Plan.PRO:
      return proPlan;
    case Plan.BUSINESS:
      return businessPlan;
    default:
      assertNever(plan);
  }
}

export function getPlanByPriceId(priceId: string): SubscriptionPlan | null {
  if (priceId === proPlan.stripePriceId) return proPlan;
  if (priceId === businessPlan.stripePriceId) return businessPlan;
  return null;
}
