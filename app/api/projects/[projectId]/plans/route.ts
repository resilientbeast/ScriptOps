import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { FirestoreProjectRippleRepository } from "@/lib/planning/project-ripple-firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const { projectId } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(projectId)) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  try {
    return Response.json({ plans: await new FirestoreProjectRippleRepository(getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!)).history(projectId, actor.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  }
}
