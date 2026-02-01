import { describe, it, expect } from "vitest";
import {
  Plan,
  PLAN_LIMITS,
  getPlanLimits,
  stripePriceIdToPlan,
  PlanLimits,
} from "./plan";

describe("Plan", () => {
  describe("PLAN_LIMITS", () => {
    it("should have correct limits for FREE plan", () => {
      const limits = PLAN_LIMITS[Plan.FREE];
      expect(limits.receiptsPerMonth).toBe(50);
      expect(limits.maxDestinations).toBe(1);
      expect(limits.priorityProcessing).toBe(false);
      expect(limits.teamFeatures).toBe(false);
      expect(limits.apiAccess).toBe(false);
    });

    it("should have correct limits for PRO plan", () => {
      const limits = PLAN_LIMITS[Plan.PRO];
      expect(limits.receiptsPerMonth).toBe(500);
      expect(limits.maxDestinations).toBe(null); // unlimited
      expect(limits.priorityProcessing).toBe(true);
      expect(limits.teamFeatures).toBe(false);
      expect(limits.apiAccess).toBe(false);
    });

    it("should have correct limits for BUSINESS plan", () => {
      const limits = PLAN_LIMITS[Plan.BUSINESS];
      expect(limits.receiptsPerMonth).toBe(null); // unlimited
      expect(limits.maxDestinations).toBe(null); // unlimited
      expect(limits.priorityProcessing).toBe(true);
      expect(limits.teamFeatures).toBe(true);
      expect(limits.apiAccess).toBe(true);
    });
  });

  describe("getPlanLimits", () => {
    it("should return correct limits for each plan", () => {
      expect(getPlanLimits(Plan.FREE)).toEqual(PLAN_LIMITS[Plan.FREE]);
      expect(getPlanLimits(Plan.PRO)).toEqual(PLAN_LIMITS[Plan.PRO]);
      expect(getPlanLimits(Plan.BUSINESS)).toEqual(PLAN_LIMITS[Plan.BUSINESS]);
    });
  });

  describe("stripePriceIdToPlan", () => {
    const mockEnv = {
      STRIPE_PRO_MONTHLY_PLAN_ID: "price_pro_123",
      STRIPE_BUSINESS_MONTHLY_PLAN_ID: "price_business_456",
    };

    it("should return PRO for pro price ID", () => {
      expect(stripePriceIdToPlan("price_pro_123", mockEnv)).toBe(Plan.PRO);
    });

    it("should return BUSINESS for business price ID", () => {
      expect(stripePriceIdToPlan("price_business_456", mockEnv)).toBe(Plan.BUSINESS);
    });

    it("should return null for unknown price ID", () => {
      expect(stripePriceIdToPlan("unknown_price", mockEnv)).toBe(null);
    });

    it("should return null for empty price ID", () => {
      expect(stripePriceIdToPlan("", mockEnv)).toBe(null);
    });
  });
});
