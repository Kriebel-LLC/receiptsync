import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateOverallConfidence,
  mapToReceiptCategory,
  parseExtractedDate,
} from "./receipt-extractor";
import { ReceiptCategory } from "shared/src/db/schema";
import { ReceiptExtractionResult } from "shared/src/types/receipt";

describe("Receipt Extractor Utilities", () => {
  describe("calculateOverallConfidence", () => {
    it("should return 0.5 when no field confidences are provided", () => {
      const data: ReceiptExtractionResult = {
        vendor: "Test Store",
        amount: 12.99,
        currency: "USD",
        date: "2024-01-15",
      };

      expect(calculateOverallConfidence(data)).toBe(0.5);
    });

    it("should return 0.5 when field confidences object is empty", () => {
      const data: ReceiptExtractionResult = {
        vendor: "Test Store",
        amount: 12.99,
        currency: "USD",
        date: "2024-01-15",
        fieldConfidences: {},
      };

      expect(calculateOverallConfidence(data)).toBe(0.5);
    });

    it("should calculate weighted average of provided confidences", () => {
      const data: ReceiptExtractionResult = {
        vendor: "Test Store",
        amount: 12.99,
        currency: "USD",
        date: "2024-01-15",
        fieldConfidences: {
          vendor: 0.9,
          amount: 1.0,
          date: 0.8,
          currency: 0.95,
        },
      };

      // Weighted average: (0.9*0.3 + 1.0*0.4 + 0.8*0.2 + 0.95*0.1) / 1.0
      // = (0.27 + 0.4 + 0.16 + 0.095) / 1.0 = 0.925
      const result = calculateOverallConfidence(data);
      expect(result).toBeCloseTo(0.925, 2);
    });

    it("should handle partial confidences", () => {
      const data: ReceiptExtractionResult = {
        vendor: "Test Store",
        amount: 12.99,
        currency: "USD",
        date: "2024-01-15",
        fieldConfidences: {
          vendor: 0.8,
          amount: 0.9,
        },
      };

      // Only vendor (0.3) and amount (0.4) weights
      // = (0.8*0.3 + 0.9*0.4) / 0.7 = (0.24 + 0.36) / 0.7 ≈ 0.857
      const result = calculateOverallConfidence(data);
      expect(result).toBeCloseTo(0.857, 2);
    });
  });

  describe("mapToReceiptCategory", () => {
    it("should map valid category strings to enum values", () => {
      expect(mapToReceiptCategory("FOOD")).toBe(ReceiptCategory.Food);
      expect(mapToReceiptCategory("TRAVEL")).toBe(ReceiptCategory.Travel);
      expect(mapToReceiptCategory("OFFICE")).toBe(ReceiptCategory.Office);
      expect(mapToReceiptCategory("SOFTWARE")).toBe(ReceiptCategory.Software);
      expect(mapToReceiptCategory("UTILITIES")).toBe(ReceiptCategory.Utilities);
      expect(mapToReceiptCategory("ENTERTAINMENT")).toBe(
        ReceiptCategory.Entertainment
      );
      expect(mapToReceiptCategory("HEALTHCARE")).toBe(
        ReceiptCategory.Healthcare
      );
      expect(mapToReceiptCategory("SHOPPING")).toBe(ReceiptCategory.Shopping);
      expect(mapToReceiptCategory("SERVICES")).toBe(ReceiptCategory.Services);
      expect(mapToReceiptCategory("OTHER")).toBe(ReceiptCategory.Other);
    });

    it("should handle lowercase category strings", () => {
      expect(mapToReceiptCategory("food")).toBe(ReceiptCategory.Food);
      expect(mapToReceiptCategory("travel")).toBe(ReceiptCategory.Travel);
    });

    it("should handle mixed case category strings", () => {
      expect(mapToReceiptCategory("Food")).toBe(ReceiptCategory.Food);
      expect(mapToReceiptCategory("TrAvEl")).toBe(ReceiptCategory.Travel);
    });

    it("should return OTHER for invalid categories", () => {
      expect(mapToReceiptCategory("INVALID")).toBe(ReceiptCategory.Other);
      expect(mapToReceiptCategory("random")).toBe(ReceiptCategory.Other);
    });

    it("should return null for null or undefined input", () => {
      expect(mapToReceiptCategory(null)).toBeNull();
      expect(mapToReceiptCategory(undefined)).toBeNull();
    });

    it("should handle categories with extra characters", () => {
      expect(mapToReceiptCategory("FOOD & DINING")).toBe(ReceiptCategory.Other);
    });
  });

  describe("parseExtractedDate", () => {
    it("should parse valid ISO date strings", () => {
      const result = parseExtractedDate("2024-01-15");
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString().split("T")[0]).toBe("2024-01-15");
    });

    it("should parse full ISO datetime strings", () => {
      const result = parseExtractedDate("2024-01-15T10:30:00Z");
      expect(result).toBeInstanceOf(Date);
    });

    it("should return null for null input", () => {
      expect(parseExtractedDate(null)).toBeNull();
    });

    it("should return null for invalid date strings", () => {
      expect(parseExtractedDate("not-a-date")).toBeNull();
      expect(parseExtractedDate("")).toBeNull();
    });

    it("should handle various date formats", () => {
      // JavaScript Date can parse various formats
      const result1 = parseExtractedDate("2024-01-15");
      expect(result1).toBeInstanceOf(Date);

      const result2 = parseExtractedDate("January 15, 2024");
      expect(result2).toBeInstanceOf(Date);
    });
  });
});

describe("ReceiptExtractor", () => {
  // Mock tests for the ReceiptExtractor class
  // In a real scenario, you would mock the Anthropic SDK

  it("should be importable", async () => {
    const { ReceiptExtractor } = await import("./receipt-extractor");
    expect(ReceiptExtractor).toBeDefined();
  });

  it("should require an API key to instantiate", async () => {
    const { ReceiptExtractor } = await import("./receipt-extractor");
    const extractor = new ReceiptExtractor("test-api-key");
    expect(extractor).toBeDefined();
  });
});
