import { type NextRequest } from "next/server";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { projectSchema } from "@/lib/projects/schemas";
import { projectJobSchema } from "@/lib/jobs/schemas";
import { reopenSceneReview } from "@/lib/scripts/scene-review";
import { sceneReviewRevisionSchema, scriptVersionSchema } from "@/lib/scripts/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; revisionId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const { projectId, revisionId } = await params;
  const firestore = getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!);
  const projectRef = firestore.collection("projects").doc(projectId);
  const acceptedRef = projectRef.collection("sceneRevisions").doc(revisionId);
  try {
    const draft = await firestore.runTransaction(async transaction => {
      const [projectSnapshot, acceptedSnapshot] = await Promise.all([
        transaction.get(projectRef),
        transaction.get(acceptedRef),
      ]);
      if (!projectSnapshot.exists) throw new Error("PROJECT_NOT_FOUND");
      const project = projectSchema.parse(projectSnapshot.data());
      if (project.ownerUserId !== actor.userId) throw new Error("PROJECT_NOT_FOUND");
      if (project.approvedPlanVersion > 0) throw new Error("SCENE_REVIEW_REOPEN_AFTER_PLAN_FORBIDDEN");
      if (project.acceptedSceneRevisionId !== revisionId) throw new Error("SCENE_REVIEW_NOT_ACCEPTED_POINTER");
      if (!acceptedSnapshot.exists) throw new Error("SCENE_REVIEW_NOT_FOUND");
      const accepted = sceneReviewRevisionSchema.parse(acceptedSnapshot.data());
      if (accepted.status !== "accepted" || accepted.scriptVersionId !== project.activeScriptVersionId) throw new Error("SCENE_REVIEW_NOT_ACCEPTED");
      const scriptRef = projectRef.collection("scripts").doc(accepted.scriptVersionId);
      const scriptSnapshot = await transaction.get(scriptRef);
      if (!scriptSnapshot.exists) throw new Error("SCRIPT_NOT_FOUND");
      const script = scriptVersionSchema.parse(scriptSnapshot.data());
      if (script.currentReviewRevisionId !== accepted.id) throw new Error("SCENE_REVIEW_NOT_CURRENT");
      const activeJobRef = project.activeJobId ? projectRef.collection("jobs").doc(project.activeJobId) : null;
      const activeJobSnapshot = activeJobRef ? await transaction.get(activeJobRef) : null;
      if (activeJobSnapshot && !activeJobSnapshot.exists) throw new Error("PROJECT_APPROVAL_STALE");
      const activeJob = activeJobSnapshot ? projectJobSchema.parse(activeJobSnapshot.data()) : null;
      if (activeJob && (activeJob.kind !== "initial-plan" || activeJob.status !== "proposal-ready")) throw new Error("PROJECT_APPROVAL_STALE");
      const draft = reopenSceneReview(accepted);
      const now = new Date().toISOString();
      transaction.set(projectRef.collection("sceneRevisions").doc(draft.id), draft);
      transaction.update(scriptRef, { currentReviewRevisionId: draft.id });
      transaction.update(projectRef, { acceptedSceneRevisionId: null, activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now });
      if (activeJob && activeJobRef) transaction.update(activeJobRef, { status: "superseded", finishedAt: now });
      return draft;
    });
    return Response.json({ revision: draft }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SCENE_REVIEW_REOPEN_FAILED";
    return Response.json({ error: code }, { status: code === "PROJECT_NOT_FOUND" || code === "SCENE_REVIEW_NOT_FOUND" ? 404 : 409 });
  }
}
