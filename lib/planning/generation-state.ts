import { randomUUID } from "node:crypto";
import type { ProjectJob } from "@/lib/jobs/schemas";
import type { Project } from "@/lib/projects/schemas";
import { type PlanningSnapshot, planningStages, type StageResult } from "@/lib/planning/generation";

export const MAX_STAGE_ATTEMPTS = 3;
export const MAX_JOB_ALLOWANCE_CENTS = 1500;
export const ATTEMPT_ALLOWANCE_CENTS = 25;
export const STAGE_LEASE_MS = 90_000;
export const JOB_DEADLINE_MS = 60 * 60_000;
export type GenerationState = {
  job: ProjectJob; snapshot: PlanningSnapshot; stageIndex: number; stageAttempt: number;
  deliveryGeneration: number; leaseToken: string | null; leaseExpiresAt: string | null;
  reservedCents: number; failure: string | null;
};
export function inputsCurrent(project: Project, state: GenerationState): boolean {
  return project.lifecycle === "active" && project.writeEpoch === state.job.projectWriteEpoch && project.activeJobId === state.job.id && project.activeScriptVersionId === state.job.scriptVersionId && project.acceptedSceneRevisionId === state.job.sceneRevisionId && project.planningInputsVersion === state.job.planningInputsVersion && project.approvedPlanVersion === 0;
}
export function claimGeneration(state: GenerationState, project: Project, now = new Date()): GenerationState | null {
  if (!["queued", "running"].includes(state.job.status)) return null;
  if (!inputsCurrent(project, state)) return { ...state, job: { ...state.job, status: "superseded", finishedAt: now.toISOString() }, leaseToken: null, leaseExpiresAt: null, failure: "INITIAL_PLAN_INPUTS_CHANGED" };
  if (state.job.status === "running" && state.leaseExpiresAt && Date.parse(state.leaseExpiresAt) > now.getTime()) return null;
  if (state.stageAttempt >= MAX_STAGE_ATTEMPTS || state.reservedCents + ATTEMPT_ALLOWANCE_CENTS > MAX_JOB_ALLOWANCE_CENTS || now.getTime() - Date.parse(state.job.createdAt) > JOB_DEADLINE_MS) {
    return { ...state, job: { ...state.job, status: "failed", finishedAt: now.toISOString() }, leaseToken: null, leaseExpiresAt: null, failure: "INITIAL_PLAN_LIMIT_REACHED" };
  }
  return { ...state, job: { ...state.job, status: "running" }, stageAttempt: state.stageAttempt + 1, leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + STAGE_LEASE_MS).toISOString(), reservedCents: state.reservedCents + ATTEMPT_ALLOWANCE_CENTS, failure: null };
}
export function assertGenerationLease(state: GenerationState, project: Project, token: string, now = new Date()) {
  if (!inputsCurrent(project, state) || state.job.status !== "running" || state.leaseToken !== token || !state.leaseExpiresAt || Date.parse(state.leaseExpiresAt) <= now.getTime()) throw new Error("INITIAL_PLAN_LEASE_INVALID");
}
export function finishGenerationStage(state: GenerationState, project: Project, token: string, result: StageResult | null, failure: string | null, now = new Date()): GenerationState {
  assertGenerationLease(state, project, token, now);
  const complete = result !== null && state.stageIndex === planningStages(state.snapshot).length - 1;
  const failed = result === null && state.stageAttempt >= MAX_STAGE_ATTEMPTS;
  return { ...state, job: { ...state.job, status: complete ? "proposal-ready" : failed ? "failed" : "queued", finishedAt: complete || failed ? now.toISOString() : null }, stageIndex: result ? state.stageIndex + 1 : state.stageIndex, stageAttempt: result ? 0 : state.stageAttempt, deliveryGeneration: state.deliveryGeneration + 1, leaseToken: null, leaseExpiresAt: null, failure };
}
