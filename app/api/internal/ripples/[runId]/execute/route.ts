import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  TaskIdentityError,
  verifyTaskRequestIdentity,
} from "@/lib/cloud-tasks/verify-task-identity";
import { readRippleTaskRuntimeEnv, readServerEnv } from "@/lib/env";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const workerBodySchema = z.object({ runId: z.uuid() }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const env = readRippleTaskRuntimeEnv();
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
  const body = workerBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || body.data.runId !== routeRunId) {
    return Response.json({ error: "TASK_BODY_INVALID" }, { status: 400 });
  }

  const repository = getRippleStateRepository();
  const claim = await repository.claimRun(
    routeRunId,
    readServerEnv().RIPPLE_STALE_MS ?? 180_000,
  );
  if (claim.outcome !== "claimed") return new Response(null, { status: 204 });

  const now = new Date().toISOString();
  const failure = {
    code: "AGENT_CREW_NOT_CONNECTED",
    message: "The durable revision lifecycle is ready; the evidence-aware agent crew is connected in the next build stage. The baseline was not changed.",
    baselineChanged: false as const,
    retryable: true,
    stage: "breakdown" as const,
  };
  await repository.transitionStage(routeRunId, claim.executionToken, "breakdown", {
    status: "active",
    message: "Validating the selected scene and revision request.",
    startedAt: now,
    completedAt: null,
    failure: null,
  });
  await repository.transitionStage(routeRunId, claim.executionToken, "breakdown", {
    status: "failed",
    message: "Agent crew connection is pending the next build stage.",
    startedAt: now,
    completedAt: new Date().toISOString(),
    failure,
  });
  await repository.failRun(routeRunId, claim.executionToken, failure);
  return new Response(null, { status: 204 });
}

