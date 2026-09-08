import { describe, expect, it } from "vitest";
import { createInitialPlanDraft } from "@/lib/planning/initial-plan";
import { createInitialPlanManifest, initialPlanManifestSchema } from "@/lib/planning/initial-plan-manifest";
import { createInitialPlanJob } from "@/lib/planning/initial-plan-job";
import { planningFixture, planningNow } from "@/tests/fixtures/planning";

describe("initial plan draft", () => {
  it("requires generated artifacts and binds the manifest to their hash", () => {
    const f = planningFixture();
    const draft = createInitialPlanDraft({ ...f.snapshot, plan: f.plan, generatedAt: planningNow.toISOString() });
    expect(draft.plan.casting).toEqual([]);
    expect(draft.plan.budget.high).toBeGreaterThan(0);
    const manifest = createInitialPlanManifest({ jobId: "initial-job-1", scriptVersionId: "script-1", draft });
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => initialPlanManifestSchema.parse({ ...manifest, inputHash: "f".repeat(64) })).toThrow();
    expect(() => createInitialPlanDraft({ ...f.snapshot, plan: undefined })).toThrow();
  });
  it("fences a queued job to the reviewed script and immutable planning hash", () => {
    const f = planningFixture();
    const script = { id: "script-1", format: "pdf" as const, originalFilename: "script.pdf", declaredBytes: 42, sourceObjectRef: { objectKey: "source", generation: "1" }, status: "review-ready" as const, contentHash: "b".repeat(64), parserVersion: "v1", currentReviewRevisionId: "review-1", uploadedBy: "user-1", createdAt: planningNow.toISOString() };
    const job = createInitialPlanJob({ projectId: "project-1", writeEpoch: 0, script, revision: f.snapshot.revision, planningInputs: f.snapshot.planningInputs });
    expect(job).toMatchObject({ kind: "initial-plan", sceneRevisionId: "review-1", inputHash: f.snapshot.planningInputs.inputHash, basePlanVersion: 0 });
  });
});
