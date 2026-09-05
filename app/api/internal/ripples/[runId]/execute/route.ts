import { type NextRequest } from "next/server";
import { z } from "zod";

import {
  executeRevisionRipple,
  RevisionRippleExecutionError,
  RevisionRippleRejectedError,
} from "@/lib/agents/revision-ripple";
import {
  TaskIdentityError,
  verifyTaskRequestIdentity,
} from "@/lib/cloud-tasks/verify-task-identity";
import { readAgentRuntimeEnv, readRippleTaskRuntimeEnv, readServerEnv } from "@/lib/env";
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

  const run = await repository.getRun(routeRunId);
  if (!run) return Response.json({ error: "RUN_NOT_FOUND" }, { status: 404 });
  const demo = await repository.getDemo(run.demoId);
  if (!demo) return Response.json({ error: "DEMO_NOT_FOUND" }, { status: 404 });

  try {
    const proposal = await executeRevisionRipple({
      run,
      demo,
      executionToken: claim.executionToken,
      repository,
      env: readAgentRuntimeEnv(),
    });
    await repository.writeProposal(routeRunId, claim.executionToken, proposal);
  } catch (error) {
    if (error instanceof RevisionRippleRejectedError) {
      await repository.rejectRun(routeRunId, claim.executionToken, {
        code: "REQUEST_NOT_PRODUCTION_RELEVANT",
        message: error.message,
        baselineChanged: false,
        retryable: false,
        stage: "breakdown",
      });
      return new Response(null, { status: 204 });
    }
    const failure = error instanceof RevisionRippleExecutionError
      ? {
          code: error.code,
          message: error.message,
          baselineChanged: false as const,
          retryable: error.retryable,
          stage: error.stage,
        }
      : {
          code: "REVISION_RIPPLE_FAILED",
          message: "The revision proposal could not be completed. The baseline was not changed; retry the full request.",
          baselineChanged: false as const,
          retryable: true,
        };
    await repository.failRun(routeRunId, claim.executionToken, failure);
  }
  return new Response(null, { status: 204 });
}
