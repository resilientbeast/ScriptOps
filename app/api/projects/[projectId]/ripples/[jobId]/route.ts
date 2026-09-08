import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { FirestoreProjectRippleRepository } from "@/lib/planning/project-ripple-firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; jobId: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const { projectId, jobId } = await params;
  if (![projectId, jobId].every(id => /^[a-z0-9][a-z0-9-]{0,99}$/.test(id))) return Response.json({ error: "RIPPLE_NOT_FOUND" }, { status: 404 });
  try {
    return Response.json(await new FirestoreProjectRippleRepository(getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!)).read(projectId, jobId, actor.userId), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "RIPPLE_NOT_FOUND" }, { status: 404 });
  }
}
