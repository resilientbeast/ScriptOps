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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const denied = await requireApiAccess();
  if (denied) return denied;
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "ORIGIN_INVALID", message: "The discard request origin was rejected." } },
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
    await repository.discardProposal(demoId, parsedRunId.data);
    const instance = await repository.getDemo(demoId);
    const run = await repository.getRun(parsedRunId.data);
    if (!instance || !run || run.demoId !== demoId) {
      return Response.json({ error: { code: "RIPPLE_NOT_FOUND" } }, { status: 404 });
    }
    return Response.json(
      {
        snapshot: await toPublicDemoSnapshot(
          repository,
          instance,
          readServerEnv().DAILY_RIPPLE_CAP,
        ),
        run: toPublicRippleRun(run),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof StateConflictError &&
      (error.code === "RUN_NOT_FOUND" || error.code === "RUN_OWNERSHIP_MISMATCH")
        ? 404
        : 409;
    return Response.json(
      { error: { code: "PROPOSAL_NOT_DISCARDABLE", message: "This proposal can no longer be discarded. The baseline was not changed." } },
      { status },
    );
  }
}
