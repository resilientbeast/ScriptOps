import { type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiAccess } from "@/lib/auth/require-access";
import { readDemoId } from "@/lib/demo-session";
import { readServerEnv } from "@/lib/env";
import {
  StateConflictError,
} from "@/lib/firestore/ripple-state";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import { isSameOrigin, toPublicRippleRun } from "@/lib/ripple/contracts";
import { toPublicDemoSnapshot } from "@/lib/ripple/public-demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runIdSchema = z.uuid();

function conflictResponse(error: StateConflictError): Response {
  const status =
    error.code === "RUN_NOT_FOUND" || error.code === "RUN_OWNERSHIP_MISMATCH"
      ? 404
      : 409;
  return Response.json(
    {
      error: {
        code: error.code,
        message:
          error.code === "RIPPLE_ALREADY_APPROVED"
            ? "This browser already has an approved revision. Reset to begin a new cycle."
            : "This proposal can no longer be approved. The baseline was not changed.",
        baselineChanged: false,
        retryable: error.code === "OPEN_RUN_MISMATCH",
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const denied = await requireApiAccess();
  if (denied) return denied;
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "ORIGIN_INVALID", message: "The approval request origin was rejected." } },
      { status: 403 },
    );
  }

  const demoId = readDemoId(request);
  const parsedRunId = runIdSchema.safeParse((await params).runId);
  if (!demoId || !parsedRunId.success) {
    return Response.json({ error: { code: "RIPPLE_NOT_FOUND" } }, { status: 404 });
  }

  const repository = getRippleStateRepository();
  try {
    const result = await repository.approveProposal(demoId, parsedRunId.data);
    return Response.json(
      {
        snapshot: await toPublicDemoSnapshot(
          repository,
          result.instance,
          readServerEnv().DAILY_RIPPLE_CAP,
        ),
        run: toPublicRippleRun(result.run),
        outcome: result.outcome,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StateConflictError) return conflictResponse(error);
    return Response.json(
      { error: { code: "APPROVAL_UNAVAILABLE", message: "Approval is temporarily unavailable. The baseline was not changed." } },
      { status: 503 },
    );
  }
}
