import { createHash } from "node:crypto";
import { initialPlanDraftSchema, initialProductionPlanSchema, type InitialPlanDraft, type PlanningInputs } from "@/lib/planning/schemas";
import type { AcceptedSceneRevision } from "@/lib/scripts/schemas";

/** Assembly accepts generated artifacts only; there is no placeholder or demo path. */
export function createInitialPlanDraft(input: {
  projectTitle: string; revision: AcceptedSceneRevision; planningInputs: PlanningInputs; plan: unknown; generatedAt?: string;
}): InitialPlanDraft {
  const plan = initialProductionPlanSchema.parse(input.plan);
  const { revision, planningInputs: inputs } = input;
  if (plan.title !== input.projectTitle || plan.currency !== inputs.currency) throw new Error("INITIAL_PLAN_INPUT_MISMATCH");
  if (plan.scenes.length !== revision.scenes.length) throw new Error("INITIAL_PLAN_SCENE_COVERAGE");
  plan.scenes.forEach((scene, index) => {
    const source = revision.scenes[index]!;
    const facts = [...new Set(source.sourceSpans.map(span => span.sourceId))];
    if (scene.id !== source.id || scene.heading !== source.reviewedHeading || scene.displayNumber !== source.displayNumber ||
      scene.sourceFactIds.length !== facts.length || new Set(scene.sourceFactIds).size !== facts.length || scene.sourceFactIds.some(id => !facts.includes(id))) throw new Error("INITIAL_PLAN_SOURCE_MISMATCH");
  });
  if (plan.budget.high <= 0 || plan.budget.costDrivers.some(driver => !driver.evidenceIds.length) || plan.locations.some(location => !location.evidenceIds.length || location.regionCode !== inputs.regionCode)) throw new Error("INITIAL_PLAN_EVIDENCE_REQUIRED");
  if ((inputs.budgetCeiling !== null && plan.budget.high > inputs.budgetCeiling) ||
    (inputs.targetHoursPerDay !== null && plan.schedule.days.some(day => day.estimatedHours > inputs.targetHoursPerDay!)) ||
    (inputs.shootWindow && plan.schedule.shootDays > Math.floor((Date.parse(inputs.shootWindow.end) - Date.parse(inputs.shootWindow.start)) / 86_400_000) + 1)) throw new Error("INITIAL_PLAN_CONSTRAINT_INFEASIBLE");
  if (plan.schedule.days.some((day, index) => day.dayNumber !== index + 1)) throw new Error("INITIAL_PLAN_SCHEDULE_ORDER");
  return initialPlanDraftSchema.parse({ kind: "initial", basePlanVersion: 0, sceneRevisionId: revision.id, planningInputsVersion: inputs.version, inputHash: inputs.inputHash, plan, generatedAt: input.generatedAt ?? new Date().toISOString() });
}
export function initialPlanDraftHash(draft: InitialPlanDraft) {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}
