import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { FirestoreGenerationRepository } from "@/lib/planning/generation-firestore";
import { isSameOrigin } from "@/lib/ripple/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; jobId: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (!isSameOrigin(request)) return Response.json({ error: "ORIGIN_INVALID" }, { status: 403 });
  const { projectId, jobId } = await params;
  if (![projectId, jobId].every(id => /^[a-z0-9][a-z0-9-]{0,99}$/.test(id))) return Response.json({ error: "PROJECT_APPROVAL_NOT_FOUND" }, { status: 404 });
  try {
    const plan = await new FirestoreGenerationRepository(getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!)).approve(projectId, jobId, actor.userId);
    return Response.json({ plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^(PROJECT_APPROVAL_[A-Z_]+)$/.test(error.message) ? error.message : "PROJECT_APPROVAL_UNAVAILABLE";
    return Response.json({ error: code }, { status: code === "PROJECT_APPROVAL_NOT_FOUND" ? 404 : code === "PROJECT_APPROVAL_UNAVAILABLE" ? 503 : 409 });
  }
}
