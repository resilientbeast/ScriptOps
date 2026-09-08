import { hasValidSmokeAccess } from "@/lib/auth/require-smoke-access";
import { readSmokeRuntimeEnv } from "@/lib/env";
import { runIngestionSmoke } from "@/lib/ingestion/smoke";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const env = readSmokeRuntimeEnv();

  if (!hasValidSmokeAccess(request, env.SMOKE_TRIGGER_TOKEN)) {
    return Response.json({ error: "SMOKE_ACCESS_DENIED" }, { status: 401 });
  }

  try {
    return Response.json(await runIngestionSmoke(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "INGESTION_SMOKE_FAILED" }, { status: 502 });
  }
}
