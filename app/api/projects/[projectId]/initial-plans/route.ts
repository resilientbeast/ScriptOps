import { z } from "zod";
import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { readAgentRuntimeEnv, readProjectTaskRuntimeEnv } from "@/lib/env";
import { FirestoreGenerationRepository } from "@/lib/planning/generation-firestore";
import { dispatchPlanningOutbox } from "@/lib/planning/dispatch";
import { readPlanningPricing } from "@/lib/planning/limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (process.env.PROJECT_PLANNING_ENABLED !== "true") return Response.json({ error: "INITIAL_PLAN_DISABLED" }, { status: 503 });
  const key = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
  const { projectId } = await params;
  if (!key.success || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(projectId)) return Response.json({ error: "INITIAL_PLAN_REQUEST_INVALID" }, { status: 400 });
  try {
    const env = readAgentRuntimeEnv();
    const taskEnv = readProjectTaskRuntimeEnv();
    const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
    const job = await new FirestoreGenerationRepository(firestore).start(projectId, actor.userId, env.GEMINI_MODEL, key.data, readPlanningPricing());
    await dispatchPlanningOutbox(firestore, taskEnv).catch(() => undefined);
    return Response.json({ job }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^(INITIAL_PLAN_[A-Z_]+|PROJECT_NOT_FOUND)$/.test(error.message) ? error.message : "INITIAL_PLAN_UNAVAILABLE";
    return Response.json({ error: code }, { status: code === "PROJECT_NOT_FOUND" ? 404 : code === "INITIAL_PLAN_UNAVAILABLE" ? 503 : 409 });
  }
}
