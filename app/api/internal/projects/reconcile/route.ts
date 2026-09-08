import { type NextRequest } from "next/server";

import { TaskIdentityError, verifyTaskRequestIdentity } from "@/lib/cloud-tasks/verify-task-identity";
import { enqueueProjectJobTask } from "@/lib/cloud-tasks/enqueue-project-job";
import { readProjectTaskRuntimeEnv } from "@/lib/env";
import { readServerEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { queueProjectParse } from "@/lib/jobs/queue-project-parse";
import { reconcilePlanning } from "@/lib/planning/dispatch";
import { reconcileProjectDeletions } from "@/lib/projects/project-deletion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const env = readProjectTaskRuntimeEnv();
  try {
    await verifyTaskRequestIdentity(request, { audience: env.TASK_OIDC_AUDIENCE, serviceAccountEmail: env.TASK_INVOKER_SERVICE_ACCOUNT });
  } catch (error) {
    return Response.json({ error: error instanceof TaskIdentityError ? error.code : "TASK_IDENTITY_INVALID" }, { status: 401 });
  }
  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
  const projects = await firestore.collection("projects").limit(20).get();
  const scripts = [] as FirebaseFirestore.QueryDocumentSnapshot[];
  for (const projectSnapshot of projects.docs) {
    if (scripts.length >= 20) break;
    const projectScripts = await projectSnapshot.ref.collection("scripts").get();
    for (const scriptSnapshot of projectScripts.docs) {
      const status = scriptSnapshot.get("status");
      if ((status === "validating" || status === "parsing") && scripts.length < 20) scripts.push(scriptSnapshot);
    }
  }
  let dispatched = 0;
  let deferred = 0;
  for (const scriptSnapshot of scripts) {
    const projectId = scriptSnapshot.ref.parent.parent?.id;
    if (!projectId) continue;
    try {
      const queued = await queueProjectParse(firestore, projectId, scriptSnapshot.id);
      if (queued.job.status !== "queued") continue;
      await enqueueProjectJobTask(env, projectId, queued.job.id);
      dispatched += 1;
    } catch {
      deferred += 1;
    }
  }
  const planningDispatched = process.env.PROJECT_PLANNING_ENABLED === "true" ? await reconcilePlanning(firestore, env) : 0;
  const serverEnv = readServerEnv();
  const deletionMaintenance = serverEnv.PROJECT_UPLOAD_BUCKET
    ? await reconcileProjectDeletions(firestore, {
      bucket: serverEnv.PROJECT_UPLOAD_BUCKET,
      cloudProjectId: env.GOOGLE_CLOUD_PROJECT,
      dispatch: async (projectId, jobId) => { await enqueueProjectJobTask(env, projectId, jobId); },
    })
    : { dispatched: 0, expiredUploads: 0, lateObjectsRemoved: 0, expiredTombstones: 0 };
  return Response.json({ scanned: scripts.length, dispatched, deferred, planningDispatched, deletionMaintenance }, { headers: { "Cache-Control": "no-store" } });
}
