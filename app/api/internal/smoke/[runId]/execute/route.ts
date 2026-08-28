import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import {
  TaskIdentityError,
  verifyTaskRequestIdentity,
} from "@/lib/cloud-tasks/verify-task-identity";
import { readSmokeRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  claimSmokeRun,
  completeSmokeRun,
  failSmokeRun,
} from "@/lib/firestore/smoke-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const workerBodySchema = z.object({ runId: z.uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const env = readSmokeRuntimeEnv();

  try {
    await verifyTaskRequestIdentity(request, {
      audience: env.TASK_OIDC_AUDIENCE,
      serviceAccountEmail: env.TASK_INVOKER_SERVICE_ACCOUNT,
    });
  } catch (error) {
    const code = error instanceof TaskIdentityError ? error.code : "TASK_IDENTITY_INVALID";
    return Response.json({ error: code }, { status: 401 });
  }

  const routeRunId = (await params).runId;
  const parsedBody = workerBodySchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success || parsedBody.data.runId !== routeRunId) {
    return Response.json({ error: "TASK_BODY_INVALID" }, { status: 400 });
  }

  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
  const claim = await claimSmokeRun(firestore, routeRunId);

  if (claim.outcome !== "claimed") {
    return new Response(null, { status: 204 });
  }

  try {
    await delay(10_000);
    const completed = await completeSmokeRun(
      firestore,
      routeRunId,
      claim.executionToken,
    );

    if (!completed) {
      return Response.json({ error: "TASK_OWNERSHIP_LOST" }, { status: 409 });
    }

    return new Response(null, { status: 204 });
  } catch {
    await failSmokeRun(
      firestore,
      routeRunId,
      claim.executionToken,
      "SMOKE_WORKER_FAILED",
    );
    return Response.json({ error: "SMOKE_WORKER_FAILED" }, { status: 500 });
  }
}
