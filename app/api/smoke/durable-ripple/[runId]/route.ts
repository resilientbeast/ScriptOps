import { z } from "zod";

import { hasValidSmokeAccess } from "@/lib/auth/require-smoke-access";
import { readSmokeRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getSmokeRun } from "@/lib/firestore/smoke-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runIdSchema = z.uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const env = readSmokeRuntimeEnv();

  if (!hasValidSmokeAccess(request, env.SMOKE_TRIGGER_TOKEN)) {
    return Response.json({ error: "SMOKE_ACCESS_DENIED" }, { status: 401 });
  }

  const parsedRunId = runIdSchema.safeParse((await params).runId);

  if (!parsedRunId.success) {
    return Response.json({ error: "SMOKE_RUN_ID_INVALID" }, { status: 400 });
  }

  const run = await getSmokeRun(
    getAdminFirestore(env.GOOGLE_CLOUD_PROJECT),
    parsedRunId.data,
  );

  if (!run) {
    return Response.json({ error: "SMOKE_RUN_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
