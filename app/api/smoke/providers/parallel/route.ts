import { randomUUID } from "node:crypto";

import { hasValidSmokeAccess } from "@/lib/auth/require-smoke-access";
import { readProviderSmokeRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { saveProviderSmokeRun } from "@/lib/firestore/provider-smoke-runs";
import { runParallelEvidenceSmoke } from "@/lib/providers/parallel-evidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SDK_VERSION = "1.3.2";

export async function POST(request: Request) {
  const env = readProviderSmokeRuntimeEnv();

  if (!hasValidSmokeAccess(request, env.SMOKE_TRIGGER_TOKEN)) {
    return Response.json({ error: "SMOKE_ACCESS_DENIED" }, { status: 401 });
  }

  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);

  try {
    const result = await runParallelEvidenceSmoke(
      env.PARALLEL_API_KEY,
      env.PARALLEL_TIMEOUT_MS,
    );
    const completedAt = new Date().toISOString();
    await saveProviderSmokeRun(firestore, {
      runId,
      provider: "parallel",
      status: "completed",
      sdkPackage: "parallel-web",
      sdkVersion: SDK_VERSION,
      modelId: null,
      createdAt,
      completedAt,
      failureCode: null,
      result,
    });

    return Response.json(
      {
        runId,
        provider: "Parallel Search",
        sdkVersion: SDK_VERSION,
        result,
        persisted: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await saveProviderSmokeRun(firestore, {
      runId,
      provider: "parallel",
      status: "failed",
      sdkPackage: "parallel-web",
      sdkVersion: SDK_VERSION,
      modelId: null,
      createdAt,
      completedAt: new Date().toISOString(),
      failureCode: "PARALLEL_SMOKE_FAILED",
      result: null,
    });

    return Response.json(
      { error: "PARALLEL_SMOKE_FAILED", runId },
      { status: 502 },
    );
  }
}
