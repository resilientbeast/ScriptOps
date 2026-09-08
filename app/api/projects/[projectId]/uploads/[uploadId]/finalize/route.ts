import { type NextRequest } from "next/server";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { enqueueProjectJobTask } from "@/lib/cloud-tasks/enqueue-project-job";
import { readProjectTaskRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { ProjectParseQueueError, queueProjectParse } from "@/lib/jobs/queue-project-parse";
import { getProjectStateRepository } from "@/lib/projects/project-state-admin";
import { isSameOrigin } from "@/lib/ripple/contracts";
import { getUploadRepository } from "@/lib/uploads/upload-admin";
import { UploadStateError } from "@/lib/uploads/upload-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; uploadId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (!isSameOrigin(request)) return Response.json({ error: { code: "ORIGIN_INVALID" } }, { status: 403 });
  const { projectId, uploadId } = await params;
  if (!await getProjectStateRepository().getOwnedProject(actor.userId, projectId)) {
    return Response.json({ error: { code: "PROJECT_NOT_FOUND" } }, { status: 404 });
  }
  try {
    const result = await getUploadRepository().finalize(actor.userId, uploadId);
    if (result.reservation.projectId !== projectId || !result.script) {
      return Response.json({ error: { code: "UPLOAD_NOT_FOUND" } }, { status: 404 });
    }
    const taskEnv = readProjectTaskRuntimeEnv();
    const queued = await queueProjectParse(getAdminFirestore(taskEnv.GOOGLE_CLOUD_PROJECT), projectId, result.script.id);
    let dispatch = "already-dispatched";
    try {
      await enqueueProjectJobTask(taskEnv, projectId, queued.job.id);
    } catch {
      dispatch = "queued-for-reconciliation";
    }
    return Response.json({ script: result.script, uploadId, job: { id: queued.job.id, status: queued.job.status, dispatch } }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof UploadStateError || error instanceof ProjectParseQueueError ? error.code : "UPLOAD_FINALIZE_FAILED";
    const status = code === "UPLOAD_NOT_FOUND" || code === "PROJECT_NOT_FOUND" ? 404 : code === "PROJECT_JOB_QUOTA_EXHAUSTED" ? 429 : 409;
    return Response.json({ error: { code } }, { status });
  }
}
