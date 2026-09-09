import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readAgentRuntimeEnv, type ProjectTaskRuntimeEnv } from "@/lib/env";
import { planningStages, runPlanningStage } from "@/lib/planning/generation";
import { FirestoreGenerationRepository } from "@/lib/planning/generation-firestore";
import { createPlanningProviders } from "@/lib/planning/providers";
import { dispatchPlanningOutbox } from "@/lib/planning/dispatch";

function providerFailureMetadata(error: unknown) {
  if (!(error instanceof Error)) return { errorName: "UnknownError", providerCode: null, status: null };
  const value = error as Error & { code?: string | number; status?: number };
  return {
    errorName: error.name.slice(0, 80),
    providerCode: typeof value.code === "string" || typeof value.code === "number" ? String(value.code).slice(0, 80) : null,
    status: typeof value.status === "number" ? value.status : null,
  };
}

export async function executeInitialPlanning(firestore: Firestore, taskEnv: ProjectTaskRuntimeEnv, projectId: string, jobId: string) {
  if (process.env.PROJECT_PLANNING_ENABLED !== "true") return Response.json({ error: "INITIAL_PLAN_DISABLED" }, { status: 503 });
  const repository = new FirestoreGenerationRepository(firestore);
  const state = await repository.claim(projectId, jobId);
  if (!state) return new Response(null, { status: 204 });
  const stage = planningStages(state.snapshot)[state.stageIndex]!;
  try {
    const env = readAgentRuntimeEnv();
    const providers = createPlanningProviders({ project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION, model: state.snapshot.model, parallelApiKey: env.PARALLEL_API_KEY, pricing: state.snapshot.pricing, geminiTimeoutMs: env.GEMINI_STAGE_TIMEOUT_MS, parallelTimeoutMs: env.PARALLEL_TIMEOUT_MS });
    const { outputs, blocks } = await repository.context(state);
    const result = await runPlanningStage(state.snapshot, stage, outputs, blocks, providers);
    await repository.finish(projectId, jobId, state.leaseToken!, result, null);
  } catch (error) {
    // Provider messages may contain prompts or secrets. Persist only known application codes.
    const code = error instanceof Error && /^INITIAL_PLAN_[A-Z_]+$/.test(error.message) ? error.message : "INITIAL_PLAN_STAGE_FAILED";
    console.error("Initial plan generation failed", { projectId, jobId, stage, attempt: state.stageAttempt, failure: code, ...providerFailureMetadata(error) });
    await repository.finish(projectId, jobId, state.leaseToken!, null, code).catch(() => undefined);
  }
  await dispatchPlanningOutbox(firestore, taskEnv).catch(() => undefined);
  return new Response(null, { status: 204 });
}
