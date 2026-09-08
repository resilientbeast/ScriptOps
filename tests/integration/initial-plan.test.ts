import { describe, expect, it } from "vitest";
import { planningFixture, planningNow } from "@/tests/fixtures/planning";
import { planningStages, runPlanningStage, type StageOutputs } from "@/lib/planning/generation";
import { initialPlanDraftSchema } from "@/lib/planning/schemas";
import { claimGeneration, finishGenerationStage, type GenerationState } from "@/lib/planning/generation-state";
import type { Project } from "@/lib/projects/schemas";

async function runFixture(count: number, people: boolean) {
  const fixture = planningFixture(count, people);
  const outputs: StageOutputs = {};
  for (const stage of planningStages(fixture.snapshot)) outputs[stage] = (await runPlanningStage(fixture.snapshot, stage, outputs, fixture.blocks, fixture.providers, planningNow)).output;
  return { ...fixture, outputs, draft: initialPlanDraftSchema.parse(outputs.assemble) };
}

describe("initial generation from accepted source", () => {
  it.each([[1, false], [6, true], [200, false]] as const)("assembles %s scenes with casting=%s", async (count, people) => {
    const { draft, calls } = await runFixture(count, people);
    expect(draft.plan.scenes).toHaveLength(count);
    expect(draft.plan.casting).toHaveLength(people ? 2 : 0);
    expect(draft.plan.scenes[0]!.sourceFactIds).toEqual(["fdx:block:0"]);
    expect(calls.filter(call => call.startsWith("breakdown-"))).toHaveLength(Math.ceil(count / 5));
    expect(draft.basePlanVersion).toBe(0);
  });
  it("retains prior stage outputs after a provider failure and resumes only the failed stage", async () => {
    const f = planningFixture(6, true);
    const outputs: StageOutputs = {};
    const stages = planningStages(f.snapshot);
    for (const stage of stages.slice(0, stages.indexOf("budget"))) outputs[stage] = (await runPlanningStage(f.snapshot, stage, outputs, f.blocks, f.providers, planningNow)).output;
    await expect(runPlanningStage(f.snapshot, "budget", outputs, [], { ...f.providers, generate: async () => { throw new Error("timeout"); } }, planningNow)).rejects.toThrow("timeout");
    expect(outputs.assemble).toBeUndefined();
    for (const stage of stages.slice(stages.indexOf("budget"))) outputs[stage] = (await runPlanningStage(f.snapshot, stage, outputs, [], f.providers, planningNow)).output;
    expect(f.calls.filter(call => call === "breakdown-0")).toHaveLength(1);
    expect(initialPlanDraftSchema.parse(outputs.assemble).plan.casting).toHaveLength(2);
  });
  it("rejects unknown citations at the specialist checkpoint", async () => {
    const f = await runFixture(1, false);
    f.plan.budget.costDrivers[0]!.evidenceIds = ["foreign-evidence"];
    await expect(runPlanningStage(f.snapshot, "budget", f.outputs, [], f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_CITATION_INVALID");
  });
  it("rejects fabricated source facts, unreconciled budget lines, and unsupported compliance claims", async () => {
    const f = planningFixture();
    f.plan.scenes[0]!.sourceFacts[0]!.quote = "Invented dialogue.";
    await expect(runPlanningStage(f.snapshot, "breakdown-0", {}, f.blocks, f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_SOURCE_FACT_INVALID");
    const complete = await runFixture(1, false);
    complete.plan.budget.lineItems[0]!.high = 5_999;
    await expect(runPlanningStage(complete.snapshot, "budget", complete.outputs, [], complete.providers, planningNow)).rejects.toThrow();
    complete.plan.budget.lineItems[0]!.high = 6_000;
    complete.plan.schedule.days[0]!.complianceNotes = ["Verify the standard 10-hour daily turnaround limits before scheduling."];
    await expect(runPlanningStage(complete.snapshot, "schedule", complete.outputs, [], complete.providers, planningNow)).rejects.toThrow();
  });
  it("rejects missing source and foreign scene outputs without truncating or publishing", async () => {
    const f = planningFixture();
    await expect(runPlanningStage(f.snapshot, "breakdown-0", {}, [], f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_SOURCE_MISSING");
    f.plan.scenes[0]!.id = "foreign-scene";
    await expect(runPlanningStage(f.snapshot, "breakdown-0", {}, f.blocks, f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_SOURCE_MISMATCH");
  });
  it("blocks hard constraints and zero-budget placeholders at their stage", async () => {
    const f = await runFixture(6, false);
    f.snapshot.planningInputs.shootWindow = { start: "2026-09-07", end: "2026-09-07" };
    await expect(runPlanningStage(f.snapshot, "schedule", f.outputs, [], f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_CONSTRAINT_INFEASIBLE");
    f.snapshot.planningInputs.budgetCeiling = 100;
    await expect(runPlanningStage(f.snapshot, "budget", f.outputs, [], f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_CONSTRAINT_INFEASIBLE");
    f.plan.budget.low = 0; f.plan.budget.high = 0;
    f.plan.budget.lineItems[0]!.low = 0; f.plan.budget.lineItems[0]!.high = 0;
    await expect(runPlanningStage(f.snapshot, "budget", f.outputs, [], f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_BUDGET_INVALID");
  });
  it("requires complete fresh research and prior dependencies", async () => {
    const f = await runFixture(1, false);
    await expect(runPlanningStage(f.snapshot, "assemble", {}, [], f.providers, planningNow)).rejects.toThrow("INITIAL_PLAN_DEPENDENCY_MISSING");
    await expect(runPlanningStage(f.snapshot, "research", f.outputs, [], { ...f.providers, research: async () => ({ output: [], usage: { inputTokens: 0, outputTokens: 0, elapsedMs: 1 } }) }, planningNow)).rejects.toThrow();
    await expect(runPlanningStage(f.snapshot, "assemble", f.outputs, [], f.providers, new Date("2026-09-09"))).rejects.toThrow("INITIAL_PLAN_EVIDENCE_EXPIRED");
  });
});

function stateFixture() {
  const { snapshot } = planningFixture();
  const project: Project = { id: "project-1", title: snapshot.projectTitle, ownerUserId: "owner-a", lifecycle: "active", recordVersion: 1, planningInputsVersion: 1, activeScriptVersionId: "script-1", acceptedSceneRevisionId: "review-1", approvedPlanVersion: 0, approvedManifestId: null, activeJobId: "initial-1", pendingUploadId: null, writeEpoch: 0, createdAt: planningNow.toISOString(), updatedAt: planningNow.toISOString() };
  const state: GenerationState = { job: { id: "initial-1", projectId: project.id, kind: "initial-plan", status: "queued", projectWriteEpoch: 0, requestHash: "a".repeat(64), idempotencyKeyHash: "a".repeat(64), scriptVersionId: "script-1", sceneRevisionId: "review-1", planningInputsVersion: 1, inputHash: snapshot.planningInputs.inputHash, basePlanVersion: 0, candidateManifestId: null, approvedVersion: null, createdAt: planningNow.toISOString(), finishedAt: null }, snapshot, stageIndex: 0, stageAttempt: 0, deliveryGeneration: 0, leaseToken: null, leaseExpiresAt: null, reservedCents: 0, failure: null };
  return { state, project };
}
describe("generation durability and bounded attempts", () => {
  it("fences expired/old tokens, duplicate claims, and changed inputs", () => {
    const { state, project } = stateFixture();
    const first = claimGeneration(state, project, planningNow)!;
    expect(claimGeneration(first, project, planningNow)).toBeNull();
    const later = new Date(planningNow.getTime() + 91_000);
    const second = claimGeneration(first, project, later)!;
    expect(second.reservedCents).toBe(50);
    expect(() => finishGenerationStage(second, project, first.leaseToken!, null, "failed", later)).toThrow("LEASE_INVALID");
    expect(() => finishGenerationStage(second, { ...project, acceptedSceneRevisionId: null }, second.leaseToken!, null, "failed", later)).toThrow("LEASE_INVALID");
    expect(claimGeneration(state, { ...project, writeEpoch: 1 }, planningNow)?.job.status).toBe("superseded");
  });
  it("caps failed and ambiguous attempts with no quota refund", () => {
    const { project } = stateFixture();
    let { state } = stateFixture();
    for (let i = 0; i < 3; i++) {
      state = claimGeneration(state, project, planningNow)!;
      state = finishGenerationStage(state, project, state.leaseToken!, null, "INITIAL_PLAN_STAGE_FAILED", planningNow);
    }
    expect(state).toMatchObject({ reservedCents: 75, stageIndex: 0, job: { status: "failed" } });
    expect(claimGeneration(state, project, planningNow)).toBeNull();
    const fresh = stateFixture().state;
    expect(claimGeneration({ ...fresh, reservedCents: 1500 }, project, planningNow)?.job.status).toBe("failed");
  });
});
