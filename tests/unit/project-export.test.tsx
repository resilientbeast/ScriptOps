import { describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";

vi.mock("server-only", () => ({}));

import { createApprovedInitialPlan, createApprovedRipplePlan } from "@/lib/planning/initial-plan-approval";
import { createInitialPlanDraft } from "@/lib/planning/initial-plan";
import { createInitialPlanManifest } from "@/lib/planning/initial-plan-manifest";
import { createProjectRippleDraft } from "@/lib/planning/project-ripple";
import { createProjectRippleManifest } from "@/lib/planning/project-ripple-manifest";
import { renderProjectProductionBible } from "@/lib/pdf/project-production-bible";
import { planningFixture } from "@/tests/fixtures/planning";

function approvedPlans(sceneCount = 6) {
  const fixture = planningFixture(sceneCount, true);
  const initialDraft = createInitialPlanDraft({ projectTitle: fixture.snapshot.projectTitle, revision: fixture.snapshot.revision, planningInputs: fixture.snapshot.planningInputs, plan: fixture.plan });
  const v1 = createApprovedInitialPlan(createInitialPlanManifest({ jobId: "initial-export", scriptVersionId: "script-1", draft: initialDraft }));
  const rippleDraft = createProjectRippleDraft({ jobId: "ripple-export", planningInputs: fixture.snapshot.planningInputs, base: v1, sceneId: fixture.plan.scenes[0]!.id, requestText: "Move the opening scene to a covered weather day and revise the crew cost.", evidence: fixture.evidence, output: { schedule: fixture.plan.schedule, budget: fixture.plan.budget, locations: fixture.plan.locations, casting: fixture.plan.casting, assumptions: ["Covered day access needs producer confirmation."], warnings: ["Production estimates need producer review."] } });
  const v2 = createApprovedRipplePlan(createProjectRippleManifest({ jobId: "ripple-export", scriptVersionId: "script-1", planningInputsVersion: 1, draft: rippleDraft }), 2);
  return { fixture, v1, v2 };
}

describe("approved project production exports", () => {
  it("renders approved initial and revised project versions without using demo state", async () => {
    const { fixture, v1, v2 } = approvedPlans();
    const project = { id: "project-export", title: fixture.snapshot.projectTitle };
    const [initial, revised] = await Promise.all([renderProjectProductionBible(project, v1), renderProjectProductionBible(project, v2)]);
    if (process.env.PROJECT_EXPORT_PDF_PATH) await writeFile(process.env.PROJECT_EXPORT_PDF_PATH, revised);
    expect(initial.subarray(0, 4).toString()).toBe("%PDF");
    expect(revised.subarray(0, 4).toString()).toBe("%PDF");
    expect(revised.byteLength).toBeGreaterThan(1_000);
  });

  it("flows a feature-length approved version across as many pages as its content needs", async () => {
    const { fixture, v1 } = approvedPlans(60);
    const pdf = await renderProjectProductionBible({ id: "project-feature", title: fixture.snapshot.projectTitle }, v1);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(10_000);
  }, 30_000);
});
