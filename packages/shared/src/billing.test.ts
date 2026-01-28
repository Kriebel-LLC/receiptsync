import { describe, it, expect } from "vitest";
import {
  getUsageWarningLevel,
  getUpgradePromptMessage,
  UsageInfo,
} from "./billing";
import { Plan } from "./types/plan";

describe("billing", () => {
  describe("getUsageWarningLevel", () => {
    const createUsageInfo = (
      receiptsUsed: number,
      receiptsLimit: number | null
    ): UsageInfo => ({
      receiptsUsed,
      receiptsLimit,
      destinationsUsed: 0,
      destinationsLimit: null,
      percentReceiptsUsed:
        receiptsLimit !== null
          ? Math.round((receiptsUsed / receiptsLimit) * 100)
          : null,
      percentDestinationsUsed: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
    });

    it("should return null for unlimited plans", () => {
      const usage = createUsageInfo(1000, null);
      expect(getUsageWarningLevel(usage)).toBe(null);
    });

    it("should return null when below 80%", () => {
      const usage = createUsageInfo(39, 50); // 78%
      expect(getUsageWarningLevel(usage)).toBe(null);
    });

    it("should return 80 when at 80%", () => {
      const usage = createUsageInfo(40, 50); // 80%
      expect(getUsageWarningLevel(usage)).toBe(80);
    });

    it("should return 80 when between 80-90%", () => {
      const usage = createUsageInfo(42, 50); // 84%
      expect(getUsageWarningLevel(usage)).toBe(80);
    });

    it("should return 90 when at 90%", () => {
      const usage = createUsageInfo(45, 50); // 90%
      expect(getUsageWarningLevel(usage)).toBe(90);
    });

    it("should return 90 when between 90-100%", () => {
      const usage = createUsageInfo(47, 50); // 94%
      expect(getUsageWarningLevel(usage)).toBe(90);
    });

    it("should return 100 when at 100%", () => {
      const usage = createUsageInfo(50, 50); // 100%
      expect(getUsageWarningLevel(usage)).toBe(100);
    });

    it("should return 100 when over 100%", () => {
      const usage = createUsageInfo(55, 50); // 110%
      expect(getUsageWarningLevel(usage)).toBe(100);
    });
  });

  describe("getUpgradePromptMessage", () => {
    const createUsageInfo = (
      receiptsUsed: number,
      receiptsLimit: number | null
    ): UsageInfo => ({
      receiptsUsed,
      receiptsLimit,
      destinationsUsed: 0,
      destinationsLimit: null,
      percentReceiptsUsed:
        receiptsLimit !== null
          ? Math.round((receiptsUsed / receiptsLimit) * 100)
          : null,
      percentDestinationsUsed: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
    });

    it("should return null for unlimited plans", () => {
      const usage = createUsageInfo(1000, null);
      expect(getUpgradePromptMessage(usage, Plan.BUSINESS)).toBe(null);
    });

    it("should return null when below 80%", () => {
      const usage = createUsageInfo(39, 50);
      expect(getUpgradePromptMessage(usage, Plan.FREE)).toBe(null);
    });

    it("should return upgrade message for FREE plan at 100%", () => {
      const usage = createUsageInfo(50, 50);
      const message = getUpgradePromptMessage(usage, Plan.FREE);
      expect(message).toContain("50 receipts");
      expect(message).toContain("Upgrade to Pro");
    });

    it("should return upgrade message for PRO plan at 100%", () => {
      const usage = createUsageInfo(500, 500);
      const message = getUpgradePromptMessage(usage, Plan.PRO);
      expect(message).toContain("500 receipts");
      expect(message).toContain("Upgrade to Business");
    });

    it("should return remaining count message at 90%", () => {
      const usage = createUsageInfo(45, 50);
      const message = getUpgradePromptMessage(usage, Plan.FREE);
      expect(message).toContain("5 receipts remaining");
    });

    it("should handle singular receipt correctly", () => {
      const usage = createUsageInfo(49, 50);
      const message = getUpgradePromptMessage(usage, Plan.FREE);
      expect(message).toContain("1 receipt remaining");
      expect(message).not.toContain("receipts remaining");
    });

    it("should return percentage message at 80%", () => {
      const usage = createUsageInfo(40, 50);
      const message = getUpgradePromptMessage(usage, Plan.FREE);
      expect(message).toContain("80%");
    });
  });
});
