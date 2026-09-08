import { type NextRequest } from "next/server";

import { TaskIdentityError, verifyTaskRequestIdentity } from "@/lib/cloud-tasks/verify-task-identity";
import { readProjectTaskRuntimeEnv, readServerEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { ProjectJobError } from "@/lib/jobs/project-job-state";
import { getProjectJobRepository } from "@/lib/jobs/project-job-admin";
import { parseProjectScript } from "@/lib/scripts/parse-project-script";
import { executeInitialPlanning } from "@/lib/planning/execute";
import { executeProjectRipple } from "@/lib/planning/project-ripple-execute";
import { executeProjectDeletion } from "@/lib/projects/project-deletion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PARSE_ATTEMPTS = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; jobId: string }> },
) {
  const taskEnv = readProjectTaskRuntimeEnv();
  try {
    await verifyTaskRequestIdentity(request, { audience: taskEnv.TASK_OIDC_AUDIENCE, serviceAccountEmail: taskEnv.TASK_INVOKER_SERVICE_ACCOUNT });
  } catch (error) {
    return Response.json({ error: error instanceof TaskIdentityError ? error.code : "TASK_IDENTITY_INVALID" }, { status: 401 });
  }
  const { projectId, jobId } = await params;
  const repository = getProjectJobRepository();
  const existing = await repository.get(projectId, jobId);
  if (existing?.kind === "delete") {
    const env = readServerEnv();
    if (!env.GOOGLE_CLOUD_PROJECT || !env.PROJECT_UPLOAD_BUCKET) return Response.json({ error: "UPLOAD_STORAGE_NOT_CONFIGURED" }, { status: 503 });
    await executeProjectDeletion(getAdminFirestore(env.GOOGLE_CLOUD_PROJECT), { projectId, operationId: jobId, bucket: env.PROJECT_UPLOAD_BUCKET, cloudProjectId: env.GOOGLE_CLOUD_PROJECT });
    return new Response(null, { status: 204 });
  }
  if (existing?.kind === "initial-plan") return executeInitialPlanning(getAdminFirestore(taskEnv.GOOGLE_CLOUD_PROJECT), taskEnv, projectId, jobId);
  if (existing?.kind === "ripple") return executeProjectRipple(getAdminFirestore(taskEnv.GOOGLE_CLOUD_PROJECT), taskEnv, projectId, jobId);
  let claim;
  try {
    claim = await repository.claim(projectId, jobId);
  } catch (error) {
    if (error instanceof ProjectJobError && error.code === "JOB_NOT_CLAIMABLE") return new Response(null, { status: 204 });
    return Response.json({ error: "PROJECT_JOB_NOT_AVAILABLE" }, { status: 404 });
  }
  if (claim.kind !== "parse" || !claim.scriptVersionId || !claim.leaseToken) {
    await repository.retryOrFail(projectId, jobId, claim.leaseToken ?? "", 1).catch(() => undefined);
    return new Response(null, { status: 204 });
  }

  const env = readServerEnv();
  if (!env.GOOGLE_CLOUD_PROJECT || !env.PROJECT_UPLOAD_BUCKET) {
    await repository.retryOrFail(projectId, jobId, claim.leaseToken, MAX_PARSE_ATTEMPTS).catch(() => undefined);
    return Response.json({ error: "UPLOAD_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }
  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
  try {
    await parseProjectScript(firestore, { projectId, scriptId: claim.scriptVersionId, cloudProjectId: env.GOOGLE_CLOUD_PROJECT, bucket: env.PROJECT_UPLOAD_BUCKET, expectedWriteEpoch: claim.projectWriteEpoch });
    await repository.succeed(projectId, jobId, claim.leaseToken);
    return new Response(null, { status: 204 });
  } catch {
    const terminal = await repository.retryOrFail(projectId, jobId, claim.leaseToken, MAX_PARSE_ATTEMPTS).catch(() => null);
    if (terminal?.status === "failed") {
      await firestore.collection("projects").doc(projectId).collection("scripts").doc(claim.scriptVersionId).update({ status: "failed" }).catch(() => undefined);
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: "PROJECT_PARSE_RETRY" }, { status: 503 });
  }
}
