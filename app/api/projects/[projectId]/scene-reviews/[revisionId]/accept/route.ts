import { type NextRequest } from "next/server";
import { z } from "zod";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { projectSchema } from "@/lib/projects/schemas";
import { acceptSceneReviewDraft } from "@/lib/scripts/scene-review";
import { sceneReviewRevisionSchema, scriptVersionSchema } from "@/lib/scripts/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ editVersion: z.number().int().nonnegative(), acknowledgedWarningIds: z.array(z.string().min(1)).max(200) }).strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; revisionId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const { projectId, revisionId } = await params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "SCENE_REVIEW_ACCEPT_INVALID" }, { status: 400 });

  const firestore = getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!);
  const projectRef = firestore.collection("projects").doc(projectId);
  const revisionRef = projectRef.collection("sceneRevisions").doc(revisionId);
  try {
    const revision = await firestore.runTransaction(async transaction => {
      const [projectSnapshot, revisionSnapshot] = await Promise.all([
        transaction.get(projectRef),
        transaction.get(revisionRef),
      ]);
      if (!projectSnapshot.exists) throw new Error("PROJECT_NOT_FOUND");
      const project = projectSchema.parse(projectSnapshot.data());
      if (project.ownerUserId !== actor.userId) throw new Error("PROJECT_NOT_FOUND");
      if (!revisionSnapshot.exists) throw new Error("SCENE_REVIEW_NOT_FOUND");
      const current = sceneReviewRevisionSchema.parse(revisionSnapshot.data());
      if (current.scriptVersionId !== project.activeScriptVersionId) throw new Error("SCENE_REVIEW_SCRIPT_NOT_ACTIVE");
      const scriptRef = projectRef.collection("scripts").doc(current.scriptVersionId);
      const scriptSnapshot = await transaction.get(scriptRef);
      if (!scriptSnapshot.exists) throw new Error("SCRIPT_NOT_FOUND");
      const script = scriptVersionSchema.parse(scriptSnapshot.data());
      if (script.currentReviewRevisionId !== current.id) throw new Error("SCENE_REVIEW_NOT_CURRENT");
      const acknowledged = { ...current, warnings: current.warnings.map(warning => ({ ...warning, acknowledged: body.data.acknowledgedWarningIds.includes(warning.id) })) };
      const accepted = acceptSceneReviewDraft(acknowledged, actor.userId, body.data.editVersion);
      const now = new Date().toISOString();
      transaction.set(revisionRef, accepted);
      transaction.update(projectRef, { acceptedSceneRevisionId: accepted.id, recordVersion: project.recordVersion + 1, updatedAt: now });
      return accepted;
    });
    return Response.json({ revision });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SCENE_REVIEW_ACCEPT_FAILED";
    return Response.json({ error: code }, { status: code === "PROJECT_NOT_FOUND" || code === "SCENE_REVIEW_NOT_FOUND" ? 404 : 409 });
  }
}
