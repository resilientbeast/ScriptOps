import type { Firestore } from "firebase-admin/firestore";
import type { sceneReviewRevisionSchema } from "@/lib/scripts/schemas";
import type { z } from "zod";
export type SceneReviewRevision = z.infer<typeof sceneReviewRevisionSchema>;
export class FirestoreSceneReviewStore {
  constructor(private readonly firestore: Firestore) {}
  private ref(projectId: string, revisionId: string) { return this.firestore.collection("projects").doc(projectId).collection("sceneRevisions").doc(revisionId); }
  async save(projectId: string, revision: SceneReviewRevision) { await this.ref(projectId, revision.id).set(revision); return revision; }
  async get(projectId: string, revisionId: string) { const snapshot = await this.ref(projectId, revisionId).get(); return snapshot.exists ? snapshot.data() as SceneReviewRevision : null; }
  async replace(projectId: string, revision: SceneReviewRevision, expectedEditVersion: number) { return this.firestore.runTransaction(async transaction => { const ref = this.ref(projectId, revision.id); const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new Error("SCENE_REVIEW_NOT_FOUND"); const current = snapshot.data() as SceneReviewRevision; if (current.editVersion !== expectedEditVersion) throw new Error("SCENE_REVIEW_VERSION_MISMATCH"); transaction.set(ref, revision); return revision; }); }
}
