import { type NextRequest } from "next/server";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getProjectStateRepository } from "@/lib/projects/project-state-admin";
import { createSceneReviewDraft } from "@/lib/scripts/scene-review";
import { type SceneReviewRevision } from "@/lib/scripts/scene-review-state";
import { scriptVersionSchema } from "@/lib/scripts/schemas";
import type { ParsedScriptManifest } from "@/lib/ingestion/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; scriptId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const { projectId, scriptId } = await params;
  if (!await getProjectStateRepository().getOwnedProject(actor.userId, projectId)) {
    return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  }

  const firestore = getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!);
  const scriptRef = firestore.collection("projects").doc(projectId).collection("scripts").doc(scriptId);
  const scriptSnapshot = await scriptRef.get();
  if (!scriptSnapshot.exists) return Response.json({ error: "SCRIPT_NOT_FOUND" }, { status: 404 });
  const script = scriptVersionSchema.safeParse(scriptSnapshot.data());
  if (!script.success || script.data.status !== "review-ready") {
    return Response.json({ error: "SCRIPT_NOT_REVIEW_READY" }, { status: 409 });
  }

  const manifestSnapshot = await scriptRef.collection("manifests").doc("parse-v1").get();
  if (!manifestSnapshot.exists) return Response.json({ error: "SCRIPT_NOT_REVIEW_READY" }, { status: 409 });
  const manifest = manifestSnapshot.data()!;
  const draft = createSceneReviewDraft(scriptId, {
    parserVersion: manifest.parserVersion,
    format: manifest.format,
    blockCount: manifest.blockCount,
    sceneCount: manifest.sceneCount,
    sourceCoverage: manifest.sourceCoverage,
    warnings: manifest.warnings,
    contentHash: manifest.contentHash,
    screenplay: { format: manifest.format, blocks: [], scenes: manifest.scenes, warnings: manifest.warnings },
  } as ParsedScriptManifest);

  const revision = await firestore.runTransaction(async transaction => {
    const currentScriptSnapshot = await transaction.get(scriptRef);
    if (!currentScriptSnapshot.exists) throw new Error("SCRIPT_NOT_FOUND");
    const currentScript = scriptVersionSchema.parse(currentScriptSnapshot.data());
    if (currentScript.currentReviewRevisionId) {
      const existingRef = scriptRef.parent.parent!.collection("sceneRevisions").doc(currentScript.currentReviewRevisionId);
      const existing = await transaction.get(existingRef);
      if (existing.exists) return existing.data() as SceneReviewRevision;
    }
    transaction.set(scriptRef.parent.parent!.collection("sceneRevisions").doc(draft.id), draft);
    transaction.update(scriptRef, { currentReviewRevisionId: draft.id });
    return draft;
  });
  return Response.json(revision, { status: revision.id === draft.id ? 201 : 200 });
}
