import type { Firestore } from "firebase-admin/firestore";
import { Storage } from "@google-cloud/storage";

import { parseAndPersistUploadedScreenplay } from "@/lib/ingestion/worker";
import { FirestoreScriptIngestionStore } from "@/lib/scripts/ingestion-state";
import { scriptVersionSchema } from "@/lib/scripts/schemas";
import { ProjectSourceStorage } from "@/lib/uploads/storage";
import { assertProjectWrite } from "@/lib/projects/project-deletion-contracts";
import { projectSchema } from "@/lib/projects/schemas";

export async function parseProjectScript(
  firestore: Firestore,
  input: { projectId: string; scriptId: string; cloudProjectId: string; bucket: string; expectedWriteEpoch?: number },
) {
  const projectRef = firestore.collection("projects").doc(input.projectId);
  const scriptRef = firestore.collection("projects").doc(input.projectId).collection("scripts").doc(input.scriptId);
  const [projectSnapshot, snapshot] = await Promise.all([projectRef.get(), scriptRef.get()]);
  const project = projectSnapshot.exists ? projectSchema.parse(projectSnapshot.data()) : null;
  const expectedWriteEpoch = input.expectedWriteEpoch ?? project?.writeEpoch;
  if (expectedWriteEpoch === undefined) throw new Error("PROJECT_WRITE_FENCED");
  assertProjectWrite(project, expectedWriteEpoch, input.scriptId);
  if (!snapshot.exists) throw new Error("SCRIPT_NOT_FOUND");
  const script = scriptVersionSchema.parse(snapshot.data());
  if (!script.sourceObjectRef) throw new Error("SCRIPT_SOURCE_MISSING");
  await firestore.runTransaction(async transaction => {
    const current = await transaction.get(projectRef);
    assertProjectWrite(current.exists ? projectSchema.parse(current.data()) : null, expectedWriteEpoch, input.scriptId);
    transaction.update(scriptRef, { status: "parsing" });
  });
  const storage = new ProjectSourceStorage(new Storage({ projectId: input.cloudProjectId }), input.bucket);
  const bytes = await storage.readVerifiedObject(script.sourceObjectRef.objectKey, script.sourceObjectRef.generation);
  const manifest = await parseAndPersistUploadedScreenplay({ projectId: input.projectId, scriptId: input.scriptId, format: script.format, bytes }, new FirestoreScriptIngestionStore(firestore, expectedWriteEpoch));
  await firestore.runTransaction(async transaction => {
    const current = await transaction.get(projectRef);
    assertProjectWrite(current.exists ? projectSchema.parse(current.data()) : null, expectedWriteEpoch, input.scriptId);
    transaction.update(scriptRef, { status: "review-ready", contentHash: manifest.contentHash, parserVersion: manifest.parserVersion });
  });
  return manifest;
}
