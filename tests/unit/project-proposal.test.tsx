import { describe, expect, it } from "vitest";

import { createApprovedInitialPlan } from "@/lib/planning/initial-plan-approval";
import { createInitialPlanDraft } from "@/lib/planning/initial-plan";
import { createInitialPlanManifest } from "@/lib/planning/initial-plan-manifest";
import { createProjectRippleDraft, rippleDelta } from "@/lib/planning/project-ripple";
import { planningFixture } from "@/tests/fixtures/planning";

describe("project proposal contract", () => {
  it("keeps approved screenplay facts and evidence while deriving version-to-version impact", () => {
    const fixture = planningFixture(2, true);
    const draft = createInitialPlanDraft({ projectTitle: fixture.snapshot.projectTitle, revision: fixture.snapshot.revision, planningInputs: fixture.snapshot.planningInputs, plan: fixture.plan });
    const base = createApprovedInitialPlan(createInitialPlanManifest({ jobId: "initial-fixture", scriptVersionId: "script-1", draft }));
    const output = {
      schedule: fixture.plan.schedule,
      budget: { ...fixture.plan.budget, low: 3500, high: 7000, lineItems: [{ ...fixture.plan.budget.lineItems[0]!, low: 3500, high: 7000 }] },
      locations: fixture.plan.locations,
      casting: fixture.plan.casting,
      assumptions: ["Weather cover requires producer confirmation."],
      warnings: ["Costs are estimates pending producer review."],
    };
    const freshEvidence = fixture.evidence.map(record => ({ ...record, retrievedAt: "2026-09-09T00:00:00.000Z" }));
    const proposal = createProjectRippleDraft({ jobId: "ripple-fixture", planningInputs: fixture.snapshot.planningInputs, base, sceneId: fixture.plan.scenes[0]!.id, requestText: "Move the scene to a covered weather day and revise crew needs.", evidence: freshEvidence, output });
    expect(proposal.plan.scenes).toEqual(fixture.plan.scenes);
    expect(proposal.plan.evidence).toEqual(freshEvidence.map(({ id, title, url, retrievedAt }) => ({ id, title, url, retrievedAt })));
    expect(proposal.plan.evidence).not.toEqual(fixture.plan.evidence);
    expect(proposal.evidenceProvenance).toMatchObject({ mode: "fresh-parallel-search", basePlanVersion: 1, baselineRecordCount: fixture.plan.evidence.length, freshRecordCount: freshEvidence.length });
    expect(rippleDelta(fixture.plan, proposal.plan)).toMatchObject({ budgetLow: 500, budgetHigh: 1000, shootDays: 0, currency: "USD" });
  });

  it("rejects a revision that changes the approved plan currency or project region", () => {
    const fixture = planningFixture(1, true);
    const draft = createInitialPlanDraft({ projectTitle: fixture.snapshot.projectTitle, revision: fixture.snapshot.revision, planningInputs: fixture.snapshot.planningInputs, plan: fixture.plan });
    const base = createApprovedInitialPlan(createInitialPlanManifest({ jobId: "initial-fixture", scriptVersionId: "script-1", draft }));
    expect(() => createProjectRippleDraft({ jobId: "ripple-fixture", planningInputs: fixture.snapshot.planningInputs, base, sceneId: fixture.plan.scenes[0]!.id, requestText: "Move the scene to a covered weather day and revise crew needs.", evidence: fixture.evidence, output: { schedule: fixture.plan.schedule, budget: { ...fixture.plan.budget, currency: "EUR" }, locations: fixture.plan.locations, casting: fixture.plan.casting, assumptions: [], warnings: [] } })).toThrow("RIPPLE_REGION_OR_CURRENCY_MISMATCH");
  });
});
