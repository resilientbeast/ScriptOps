import { type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiAccess } from "@/lib/auth/require-access";
import { readDemoId } from "@/lib/demo-session";
import { readServerEnv } from "@/lib/env";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import { toPublicRippleRun } from "@/lib/ripple/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runIdSchema = z.uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const denied = await requireApiAccess();
  if (denied) return denied;
  const demoId = readDemoId(request);
  const parsedRunId = runIdSchema.safeParse((await params).runId);
  if (!demoId || !parsedRunId.success) {
    return Response.json({ error: { code: "RIPPLE_NOT_FOUND" } }, { status: 404 });
  }

  const repository = getRippleStateRepository();
  let run = await repository.getRun(parsedRunId.data);
  if (!run || run.demoId !== demoId) {
    return Response.json({ error: { code: "RIPPLE_NOT_FOUND" } }, { status: 404 });
  }
  if (run.status === "queued" || run.status === "analyzing") {
    const stale = await repository.failStaleRun(
      demoId,
      run.runId,
      readServerEnv().RIPPLE_STALE_MS ?? 180_000,
    );
    run = stale.run;
  }

  return Response.json(
    { run: toPublicRippleRun(run) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
