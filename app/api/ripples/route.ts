import { type NextRequest } from "next/server";

import { requireApiAccess } from "@/lib/auth/require-access";
import { enqueueRippleTask } from "@/lib/cloud-tasks/enqueue-ripple";
import { readDemoId } from "@/lib/demo-session";
import { readRippleTaskRuntimeEnv, readServerEnv } from "@/lib/env";
import {
  StateConflictError,
} from "@/lib/firestore/ripple-state";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import {
  createRippleRequestSchema,
  isProductionRelevant,
  isSameOrigin,
  toPublicRippleRun,
} from "@/lib/ripple/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function conflictResponse(error: StateConflictError): Response {
  const status = error.code === "DAILY_CAP_REACHED" ? 429 : 409;
  const messages: Partial<Record<StateConflictError["code"], string>> = {
    DAILY_CAP_REACHED: "Revision Ripple is at today’s shared demo limit.",
    OPEN_RUN_EXISTS: "This browser already has an active revision.",
    RIPPLE_ALREADY_APPROVED: "Reset the demo before starting another revision.",
    SCENE_NOT_FOUND: "The selected scene is not part of this production.",
  };
  return Response.json(
    {
      error: {
        code: error.code,
        message: messages[error.code] ?? "The revision could not be started.",
        baselineChanged: false,
        retryable: error.code === "OPEN_RUN_EXISTS",
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAccess();
  if (denied) return denied;
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "ORIGIN_INVALID", message: "The revision request origin was rejected." } },
      { status: 403 },
    );
  }

  const demoId = readDemoId(request);
  if (!demoId) {
    return Response.json(
      { error: { code: "DEMO_SESSION_REQUIRED", message: "Reload the workspace before starting analysis." } },
      { status: 401 },
    );
  }

  const parsed = createRippleRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "REVISION_REQUEST_INVALID",
          message: "Describe a production change in at least ten characters.",
          baselineChanged: false,
          retryable: true,
        },
      },
      { status: 400 },
    );
  }
  if (!isProductionRelevant(parsed.data.requestText)) {
    return Response.json(
      {
        error: {
          code: "REVISION_NOT_PRODUCTION_RELEVANT",
          message: "Describe a production change such as time of day, weather, cast, stunts, location, schedule, or budget.",
          baselineChanged: false,
          retryable: true,
        },
      },
      { status: 422 },
    );
  }

  const repository = getRippleStateRepository();
  try {
    const result = await repository.createQueuedRun({
      ...parsed.data,
      demoId,
      dailyCap: readServerEnv().DAILY_RIPPLE_CAP,
    });

    if (result.outcome === "created") {
      try {
        await enqueueRippleTask(readRippleTaskRuntimeEnv(), result.run.runId);
      } catch {
        const failedRun = await repository.markEnqueueFailed(result.run.runId, {
          code: "TASK_ENQUEUE_FAILED",
          message: "Analysis could not be dispatched. The baseline was not changed; retry the full request.",
          baselineChanged: false,
          retryable: true,
        });
        return Response.json(
          { run: toPublicRippleRun(failedRun) },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    return Response.json(
      {
        run: toPublicRippleRun(result.run),
        statusUrl: `/api/ripples/${result.run.runId}`,
        eventsUrl: `/api/ripples/${result.run.runId}/events`,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StateConflictError) return conflictResponse(error);
    console.error("Ripple start failed", error);
    return Response.json(
      {
        error: {
          code: "RIPPLE_START_FAILED",
          message: "Analysis could not be started. The baseline was not changed.",
          baselineChanged: false,
          retryable: true,
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
