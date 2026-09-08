import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";

import { projectSchema } from "@/lib/projects/schemas";
import { projectJobSchema, type ProjectJob } from "@/lib/jobs/schemas";
import { scriptVersionSchema, type ScriptVersion } from "@/lib/scripts/schemas";

const PROJECT_JOB_LIMIT = 20;

export class ProjectParseQueueError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "SCRIPT_NOT_ACTIVE" | "PROJECT_JOB_QUOTA_EXHAUSTED") {
    super(code);
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function queueProjectParse(
  firestore: Firestore,
  projectId: string,
  scriptId: string,
): Promise<{ job: ProjectJob; created: boolean }> {
  const projectRef = firestore.collection("projects").doc(projectId);
  const scriptRef = projectRef.collection("scripts").doc(scriptId);
  const jobId = `parse-${scriptId}`;
  const jobRef = projectRef.collection("jobs").doc(jobId);
  const usageRef = projectRef.collection("usage").doc("jobs");
  return firestore.runTransaction(async transaction => {
    const [projectSnapshot, scriptSnapshot, existingJob] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(scriptRef),
      transaction.get(jobRef),
    ]);
    if (!projectSnapshot.exists) throw new ProjectParseQueueError("PROJECT_NOT_FOUND");
    const project = projectSchema.parse(projectSnapshot.data());
    if (project.activeScriptVersionId !== scriptId || project.lifecycle !== "active" || project.approvedPlanVersion > 0) {
      throw new ProjectParseQueueError("SCRIPT_NOT_ACTIVE");
    }
    if (!scriptSnapshot.exists) throw new ProjectParseQueueError("SCRIPT_NOT_ACTIVE");
    const script = scriptVersionSchema.parse(scriptSnapshot.data());
    if (!script.sourceObjectRef) throw new ProjectParseQueueError("SCRIPT_NOT_ACTIVE");
    if (existingJob.exists) {
      const persisted = existingJob.data() as Record<string, unknown>;
      if (persisted.status === "running" && typeof persisted.leaseExpiresAt === "string" && new Date(persisted.leaseExpiresAt) <= new Date()) {
        transaction.update(jobRef, { status: "queued", leaseToken: null, leaseExpiresAt: null });
        persisted.status = "queued";
        persisted.leaseToken = null;
        persisted.leaseExpiresAt = null;
      }
      const storedJob = { ...persisted };
      delete storedJob.leaseToken;
      delete storedJob.leaseExpiresAt;
      delete storedJob.attempt;
      return { job: projectJobSchema.parse(storedJob), created: false };
    }

    const usageSnapshot = await transaction.get(usageRef);
    const usage = usageSnapshot.exists ? usageSnapshot.data() as { used: number; jobIds: string[] } : { used: 0, jobIds: [] };
    if (usage.used >= PROJECT_JOB_LIMIT) throw new ProjectParseQueueError("PROJECT_JOB_QUOTA_EXHAUSTED");
    const requestHash = sha256(["parse", projectId, script.id, script.sourceObjectRef.objectKey, script.sourceObjectRef.generation].join("\n"));
    const job = projectJobSchema.parse({ id: jobId, projectId, kind: "parse", status: "queued", projectWriteEpoch: project.writeEpoch, requestHash, idempotencyKeyHash: requestHash, scriptVersionId: script.id, sceneRevisionId: null, planningInputsVersion: null, inputHash: null, basePlanVersion: 0, candidateManifestId: null, approvedVersion: null, createdAt: new Date().toISOString(), finishedAt: null });
    transaction.set(jobRef, { ...job, leaseToken: null, leaseExpiresAt: null, attempt: 0 });
    transaction.set(usageRef, { used: usage.used + 1, jobIds: [...usage.jobIds, jobId] });
    return { job, created: true };
  });
}

export function isParseReadyScript(script: ScriptVersion) {
  return script.status === "validating" && script.sourceObjectRef !== null;
}
