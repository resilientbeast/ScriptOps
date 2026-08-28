import { randomUUID } from "node:crypto";

import { hasValidSmokeAccess } from "@/lib/auth/require-smoke-access";
import { enqueueSmokeTask } from "@/lib/cloud-tasks/enqueue-smoke";
import { readSmokeRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  attachSmokeTask,
  createSmokeRun,
  markSmokeEnqueueFailed,
} from "@/lib/firestore/smoke-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = readSmokeRuntimeEnv();

  if (!hasValidSmokeAccess(request, env.SMOKE_TRIGGER_TOKEN)) {
    return Response.json({ error: "SMOKE_ACCESS_DENIED" }, { status: 401 });
  }

  const runId = randomUUID();
  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
  await createSmokeRun(firestore, runId);

  try {
    const taskName = await enqueueSmokeTask(env, runId);
    await attachSmokeTask(firestore, runId, taskName);
  } catch {
    await markSmokeEnqueueFailed(firestore, runId);
    return Response.json({ error: "TASK_ENQUEUE_FAILED", runId }, { status: 503 });
  }

  return Response.json(
    {
      runId,
      status: "queued",
      statusUrl: `/api/smoke/durable-ripple/${runId}`,
    },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
