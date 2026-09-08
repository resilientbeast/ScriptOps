import { createHash, randomUUID } from "node:crypto";

import { projectJobSchema, type ProjectJob } from "@/lib/jobs/schemas";
import type { PlanningInputs } from "@/lib/planning/schemas";
import type { AcceptedSceneRevision, ScriptVersion } from "@/lib/scripts/schemas";

export function initialPlanJobKey(projectId: string, revisionId: string, inputHash: string) {
  return createHash("sha256").update(`${projectId}\n${revisionId}\n${inputHash}`).digest("hex");
}

export function createInitialPlanJob(input: { projectId: string; writeEpoch: number; script: ScriptVersion; revision: AcceptedSceneRevision; planningInputs: PlanningInputs; now?: string }): ProjectJob {
  if (input.script.id !== input.revision.scriptVersionId || input.script.status !== "review-ready") throw new Error("INITIAL_PLAN_SCRIPT_NOT_READY");
  const requestHash = initialPlanJobKey(input.projectId, input.revision.id, input.planningInputs.inputHash);
  return projectJobSchema.parse({ id: `initial-${randomUUID()}`, projectId: input.projectId, kind: "initial-plan", status: "queued", projectWriteEpoch: input.writeEpoch, requestHash, idempotencyKeyHash: requestHash, scriptVersionId: input.script.id, sceneRevisionId: input.revision.id, planningInputsVersion: input.planningInputs.version, inputHash: input.planningInputs.inputHash, basePlanVersion: 0, candidateManifestId: null, approvedVersion: null, createdAt: input.now ?? new Date().toISOString(), finishedAt: null });
}
