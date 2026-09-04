import { randomUUID } from "node:crypto";

import { hasValidSmokeAccess } from "@/lib/auth/require-smoke-access";
import { readProviderSmokeRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { saveProviderSmokeRun } from "@/lib/firestore/provider-smoke-runs";
import { getBreakdownSmokeIssuePaths } from "@/lib/providers/contracts";
import { classifyGeminiFailure } from "@/lib/providers/provider-errors";
import { runVertexBreakdownDiagnostic } from "@/lib/providers/vertex-breakdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SDK_VERSION = "2.19.0";

export async function POST(request: Request) {
  const env = readProviderSmokeRuntimeEnv();

  if (!hasValidSmokeAccess(request, env.SMOKE_TRIGGER_TOKEN)) {
    return Response.json({ error: "SMOKE_ACCESS_DENIED" }, { status: 401 });
  }

  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);

  try {
    const result = await runVertexBreakdownDiagnostic({
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_CLOUD_LOCATION,
      model: env.GEMINI_MODEL,
      timeoutMs: env.GEMINI_STAGE_TIMEOUT_MS,
    });
    const completedAt = new Date().toISOString();
    await saveProviderSmokeRun(firestore, {
      runId,
      provider: "vertex",
      status: "completed",
      sdkPackage: "@google/genai",
      sdkVersion: SDK_VERSION,
      modelId: env.GEMINI_MODEL,
      createdAt,
      completedAt,
      failureCode: null,
      result,
    });

    return Response.json(
      {
        runId,
        provider: "Vertex AI Gemini direct diagnostic",
        modelId: env.GEMINI_MODEL,
        sdkVersion: SDK_VERSION,
        result,
        persisted: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const failureCode = classifyGeminiFailure(error);
    const diagnosticPaths = getBreakdownSmokeIssuePaths(error);
    await saveProviderSmokeRun(firestore, {
      runId,
      provider: "vertex",
      status: "failed",
      sdkPackage: "@google/genai",
      sdkVersion: SDK_VERSION,
      modelId: env.GEMINI_MODEL,
      createdAt,
      completedAt: new Date().toISOString(),
      failureCode,
      diagnosticPaths,
      result: null,
    });

    return Response.json(
      { error: failureCode, diagnosticPaths, runId },
      { status: 502 },
    );
  }
}
