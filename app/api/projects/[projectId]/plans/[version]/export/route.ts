import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { renderProjectProductionBible } from "@/lib/pdf/project-production-bible";
import { projectPlanSchema } from "@/lib/planning/initial-plan-approval";
import { projectSchema } from "@/lib/projects/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; version: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const { projectId, version } = await params;
  const planVersion = Number(version);
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(projectId) || !Number.isSafeInteger(planVersion) || planVersion < 1) return Response.json({ error: "PROJECT_EXPORT_NOT_FOUND" }, { status: 404 });
  try {
    const projectRef = getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!).collection("projects").doc(projectId);
    const [projectDoc, planDoc] = await Promise.all([projectRef.get(), projectRef.collection("plans").doc(`v${planVersion}`).get()]);
    if (!projectDoc.exists || projectDoc.get("ownerUserId") !== actor.userId || !planDoc.exists) return Response.json({ error: "PROJECT_EXPORT_NOT_FOUND" }, { status: 404 });
    const project = projectSchema.parse(projectDoc.data());
    const plan = projectPlanSchema.parse(planDoc.data());
    if (plan.planVersion !== planVersion) return Response.json({ error: "PROJECT_EXPORT_NOT_FOUND" }, { status: 404 });
    const pdf = await renderProjectProductionBible(project, plan);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${project.id}-plan-v${plan.planVersion}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "PROJECT_EXPORT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
