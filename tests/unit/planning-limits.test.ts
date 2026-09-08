import { describe, expect, it } from "vitest";
import { readPlanningPricing, validatePlanningPricing } from "@/lib/planning/limits";

describe("planning spend envelope", () => {
  it("requires explicit nonzero price ceilings and refuses models exceeding an attempt allowance", () => {
    expect(() => readPlanningPricing({ NODE_ENV: "test" })).toThrow();
    expect(() => validatePlanningPricing({ inputUsdPerMillion: 100, outputUsdPerMillion: 100, searchUsdPerRequest: 1 })).toThrow("PRICING_EXCEEDS_ALLOWANCE");
    expect(validatePlanningPricing({ inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5, searchUsdPerRequest: 0.01 })).toMatchObject({ searchUsdPerRequest: 0.01 });
  });
});
