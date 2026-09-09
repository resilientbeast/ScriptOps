import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { initialBudgetSchema, locationCandidateSchema, shootingScheduleSchema, castingBriefSchema, type PlanningInputs } from "@/lib/planning/schemas";
import { planningEvidenceSchema, type PlanningEvidence } from "@/lib/planning/planning-evidence";
import type { ProjectPlan } from "@/lib/planning/initial-plan-approval";
import { projectRippleDraftSchema, type ProjectRippleDraft } from "@/lib/planning/project-ripple-manifest";
import { projectJobSchema, type ProjectJob } from "@/lib/jobs/schemas";
import { planFromRecord } from "@/lib/planning/project-ripple-contracts";

export { planFromRecord, rippleDelta } from "@/lib/planning/project-ripple-contracts";

const notesSchema = z.array(z.string().trim().min(1).max(1_000)).max(30);

export const createProjectRippleRequestSchema = z.object({
  sceneId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  requestText: z.string().trim().min(10).max(2_000),
  idempotencyKey: z.uuid(),
}).strict();

const productionSignals = [/\bscene\b/i, /\b(day|night|dawn|dusk|weather|rain|snow|wind)\b/i, /\b(cast|actor|performer|child|minor|stunt)\b/i, /\b(location|road|interior|exterior|vehicle|prop)\b/i, /\b(schedule|shoot|budget|cost|crew|equipment|permit|safety)\b/i];
export const isProjectProductionRelevant = (requestText: string) => productionSignals.some(signal => signal.test(requestText));

export const projectRippleOutputSchema = z.object({
  schedule: shootingScheduleSchema,
  budget: initialBudgetSchema,
  locations: z.array(locationCandidateSchema).min(1).max(50),
  casting: z.array(castingBriefSchema).max(100),
  assumptions: notesSchema,
  warnings: notesSchema,
}).strict();

export type ProjectRippleOutput = z.infer<typeof projectRippleOutputSchema>;

export function isOfficialNewMexicoCostEvidence(record: PlanningEvidence[number]) {
  return record.topics.includes("costs") && /(^|\.)(nmfilm\.com|nm\.gov)$/i.test(new URL(record.url).hostname);
}

export function rippleRequestHash(projectId: string, basePlanVersion: number, sceneId: string, requestText: string) {
  return createHash("sha256").update(`${projectId}\n${basePlanVersion}\n${sceneId}\n${requestText.trim()}`).digest("hex");
}

export function createProjectRippleJob(input: { projectId: string; writeEpoch: number; basePlanVersion: number; scriptVersionId: string; sceneRevisionId: string; planningInputsVersion: number; requestHash: string; now?: string }): ProjectJob {
  return projectJobSchema.parse({
    id: `ripple-${randomUUID()}`,
    projectId: input.projectId,
    kind: "ripple",
    status: "queued",
    projectWriteEpoch: input.writeEpoch,
    requestHash: input.requestHash,
    idempotencyKeyHash: input.requestHash,
    scriptVersionId: input.scriptVersionId,
    sceneRevisionId: input.sceneRevisionId,
    planningInputsVersion: input.planningInputsVersion,
    inputHash: null,
    basePlanVersion: input.basePlanVersion,
    candidateManifestId: null,
    approvedVersion: null,
    createdAt: input.now ?? new Date().toISOString(),
    finishedAt: null,
  });
}

export function createProjectRippleDraft(input: { jobId: string; planningInputs: PlanningInputs; base: ProjectPlan; sceneId: string; requestText: string; evidence: PlanningEvidence; output: unknown; now?: string }): ProjectRippleDraft {
  const output = projectRippleOutputSchema.parse(input.output);
  const basePlan = planFromRecord(input.base);
  const evidence = planningEvidenceSchema.parse(input.evidence);
  if (!basePlan.scenes.some(scene => scene.id === input.sceneId)) throw new Error("RIPPLE_SCENE_NOT_FOUND");
  if (basePlan.currency !== input.planningInputs.currency || output.budget.currency !== basePlan.currency || output.locations.some(location => location.regionCode !== input.planningInputs.regionCode)) throw new Error("RIPPLE_REGION_OR_CURRENCY_MISMATCH");
  if ((input.planningInputs.budgetCeiling !== null && output.budget.high > input.planningInputs.budgetCeiling) || (input.planningInputs.targetHoursPerDay !== null && output.schedule.days.some(day => day.estimatedHours > input.planningInputs.targetHoursPerDay!)) || (input.planningInputs.shootWindow && output.schedule.shootDays > Math.floor((Date.parse(input.planningInputs.shootWindow.end) - Date.parse(input.planningInputs.shootWindow.start)) / 86_400_000) + 1)) throw new Error("RIPPLE_CONSTRAINT_INFEASIBLE");
  const evidenceIds = new Set(evidence.map(record => record.id));
  const officialCostEvidenceIds = new Set(evidence.filter(isOfficialNewMexicoCostEvidence).map(record => record.id));
  if (!officialCostEvidenceIds.size) throw new Error("RIPPLE_COST_EVIDENCE_UNAVAILABLE");
  const budgetCitations = [...output.budget.lineItems, ...output.budget.costDrivers];
  const cited = [...budgetCitations, ...output.locations];
  if (cited.some(item => !item.evidenceIds.length || item.evidenceIds.some(id => !evidenceIds.has(id)))) throw new Error("RIPPLE_CITATION_INVALID");
  if (budgetCitations.some(item => item.evidenceIds.some(id => !officialCostEvidenceIds.has(id)))) throw new Error("RIPPLE_COST_EVIDENCE_INVALID");
  const plan = {
    ...basePlan,
    schedule: output.schedule,
    budget: output.budget,
    locations: output.locations,
    casting: output.casting,
    evidence: evidence.map(({ id, title, url, retrievedAt }) => ({ id, title, url, retrievedAt })),
    assumptions: [...new Set([...basePlan.assumptions, ...output.assumptions])],
    warnings: [...new Set([...basePlan.warnings, ...output.warnings])],
  };
  return projectRippleDraftSchema.parse({
    jobId: input.jobId,
    kind: "ripple",
    basePlanVersion: input.base.planVersion,
    baseManifestId: input.base.manifestId,
    sceneId: input.sceneId,
    requestText: input.requestText.trim(),
    plan,
    evidenceProvenance: { mode: "fresh-parallel-search", searchedAt: input.now ?? new Date().toISOString(), basePlanVersion: input.base.planVersion, baselineRecordCount: basePlan.evidence.length, freshRecordCount: evidence.length },
    generatedAt: input.now ?? new Date().toISOString(),
  });
}

export type ProjectRippleSnapshot = { projectTitle: string; model: string; planningInputs: PlanningInputs; base: ProjectPlan; sceneId: string; requestText: string };
