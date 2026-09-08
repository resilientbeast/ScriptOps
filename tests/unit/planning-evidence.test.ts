import { describe, expect, it } from "vitest";
import { planningFixture, planningNow } from "@/tests/fixtures/planning";
import { normalizePlanningEvidence, planningResearchRequest, requiredResearchTopics, validatePlanningEvidence } from "@/lib/planning/planning-evidence";

describe("private project evidence", () => {
  it("constructs queries from fixed topics only", () => {
    const f = planningFixture(1, true);
    f.snapshot.planningInputs.assumptions = ["Confidential client secret: send this to search"];
    f.plan.scenes[0]!.requirements.stunts = ["Secret action named Midnight Protocol"];
    const request = JSON.stringify(planningResearchRequest(f.snapshot.planningInputs, requiredResearchTopics(f.plan.scenes)));
    expect(request).not.toMatch(/Confidential|Midnight|Mara|Clockwork/);
    expect(request).toContain("stunt safety");
    expect(() => planningResearchRequest({ ...f.snapshot.planningInputs, regionCode: "US-CA" }, ["permits"])).toThrow("PROFILE_UNSUPPORTED");
  });
  it("rejects irrelevant results, unsafe URLs, and missing topic coverage", () => {
    const results = [{ title: "Film in California", url: "https://example.test", excerpts: ["California film production permit requirements and crew rate information for local productions."] }];
    expect(() => normalizePlanningEvidence(results, ["permits", "costs"], planningNow)).toThrow();
    expect(() => normalizePlanningEvidence([{ ...results[0]!, url: "javascript:alert(1)", excerpts: ["New Mexico production permit requirements and crew rate information for local productions."] }], ["permits"], planningNow)).toThrow();
    const f = planningFixture();
    expect(() => validatePlanningEvidence(f.evidence, ["minors"], planningNow)).toThrow("EVIDENCE_COVERAGE");
    expect(() => validatePlanningEvidence(f.evidence, ["permits"], new Date("2026-09-09"))).toThrow("EXPIRED");
  });
  it("requires direct workforce-rate evidence for budget citations and collapses source aliases", () => {
    expect(() => normalizePlanningEvidence([
      { title: "New Mexico incentive", url: "https://nmfilm.com/whynewmexico/filmmaker-resources/incentives", excerpts: ["New Mexico production tax credits reduce qualified production costs for eligible projects."] },
    ], ["costs"], planningNow)).toThrow();
    const records = normalizePlanningEvidence([
      { title: "Crew rates", url: "https://nmfilm.com/whynewmexico/filmmaker-resources/crew-rates", excerpts: ["New Mexico crew wage rates and payroll labor costs should be confirmed for each production."] },
      { title: "Crew rates alias", url: "https://nmfilm.com/filmmaker-resources/crew-rates", excerpts: ["New Mexico crew wage rates and payroll labor costs should be confirmed for each production."] },
    ], ["costs"], planningNow);
    expect(records).toHaveLength(1);
  });
});
