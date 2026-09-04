import { z } from "zod";

import { hasValidSmokeAccess } from "@/lib/auth/require-smoke-access";
import { readProviderSmokeRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getProviderSmokeRun } from "@/lib/firestore/provider-smoke-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  provider: z.enum(["gemini", "parallel", "vertex"]),
  runId: z.uuid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string; runId: string }> },
) {
  const env = readProviderSmokeRuntimeEnv();

  if (!hasValidSmokeAccess(request, env.SMOKE_TRIGGER_TOKEN)) {
    return Response.json({ error: "SMOKE_ACCESS_DENIED" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return Response.json({ error: "PROVIDER_SMOKE_ID_INVALID" }, { status: 400 });
  }

  const run = await getProviderSmokeRun(
    getAdminFirestore(env.GOOGLE_CLOUD_PROJECT),
    parsedParams.data.runId,
  );

  if (!run || run.provider !== parsedParams.data.provider) {
    return Response.json({ error: "PROVIDER_SMOKE_NOT_FOUND" }, { status: 404 });
  }

  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}
