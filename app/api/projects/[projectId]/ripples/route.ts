import { z } from "zod";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { readAgentRuntimeEnv, readProjectTaskRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { dispatchPlanningOutbox } from "@/lib/planning/dispatch";
import { FirestoreProjectRippleRepository } from "@/lib/planning/project-ripple-firestore";
import { readPlanningPricing } from "@/lib/planning/limits";
import { isSameOrigin } from "@/lib/ripple/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (!isSameOrigin(request)) return Response.json({ error: "ORIGIN_INVALID" }, { status: 403 });
  if (process.env.PROJECT_PLANNING_ENABLED !== "true") return Response.json({ error: "RIPPLE_DISABLED" }, { status: 503 });
  const { projectId } = await params;
  const idempotencyKey = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
  const body = await request.json().catch(() => null);
  if (!idempotencyKey.success || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(projectId) || !body || typeof body !== "object") return Response.json({ error: "RIPPLE_REQUEST_INVALID" }, { status: 400 });
  try {
    const env = readAgentRuntimeEnv(); const taskEnv = readProjectTaskRuntimeEnv(); const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
    const job = await new FirestoreProjectRippleRepository(firestore).start(projectId, actor.userId, env.GEMINI_MODEL, { ...(body as Record<string, unknown>), idempotencyKey: idempotencyKey.data }, readPlanningPricing());
    await dispatchPlanningOutbox(firestore, taskEnv).catch(() => undefined);
    return Response.json({ job }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^(RIPPLE_[A-Z_]+|PROJECT_NOT_FOUND)$/.test(error.message) ? error.message : "RIPPLE_UNAVAILABLE";
    return Response.json({ error: code }, { status: code === "PROJECT_NOT_FOUND" ? 404 : code === "RIPPLE_UNAVAILABLE" ? 503 : 409 });
  }
}
