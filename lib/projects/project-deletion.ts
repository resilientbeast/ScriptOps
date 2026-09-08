import "server-only";

import { randomUUID } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { Storage } from "@google-cloud/storage";

import { projectJobSchema, type ProjectJob } from "@/lib/jobs/schemas";
import { projectSchema } from "@/lib/projects/schemas";
export { assertProjectWrite } from "@/lib/projects/project-deletion-contracts";

export type ProjectDeletionTombstone = {
  projectId: string;
  ownerUserId: string;
  operationId: string;
  writeEpoch: number;
  status: "queued" | "cleaning" | "complete" | "failed";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string;
  failure: string | null;
};

export class ProjectDeletionError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "PROJECT_VERSION_MISMATCH" | "PROJECT_CONFIRMATION_MISMATCH" | "PROJECT_DELETE_IN_PROGRESS") {
    super(code);
  }
}

const tombstoneRef = (firestore: Firestore, projectId: string) => firestore.collection("projectTombstones").doc(projectId);
const projectRef = (firestore: Firestore, projectId: string) => firestore.collection("projects").doc(projectId);

export async function beginProjectDeletion(
  firestore: Firestore,
  input: { projectId: string; ownerUserId: string; expectedRecordVersion: number; confirmationTitle: string; now?: Date },
): Promise<{ tombstone: ProjectDeletionTombstone; job: ProjectJob }> {
  const now = input.now ?? new Date();
  return firestore.runTransaction(async transaction => {
    const [projectSnapshot, existingTombstone] = await Promise.all([
      transaction.get(projectRef(firestore, input.projectId)),
      transaction.get(tombstoneRef(firestore, input.projectId)),
    ]);
    if (!projectSnapshot.exists) throw new ProjectDeletionError("PROJECT_NOT_FOUND");
    const project = projectSchema.parse(projectSnapshot.data());
    if (project.ownerUserId !== input.ownerUserId) throw new ProjectDeletionError("PROJECT_NOT_FOUND");
    if (existingTombstone.exists) {
      const tombstone = existingTombstone.data() as ProjectDeletionTombstone;
      if (tombstone.ownerUserId === input.ownerUserId && tombstone.status !== "complete") {
        const jobSnapshot = await transaction.get(projectRef(firestore, input.projectId).collection("jobs").doc(tombstone.operationId));
        return { tombstone, job: projectJobSchema.parse(jobSnapshot.data()) };
      }
      throw new ProjectDeletionError("PROJECT_DELETE_IN_PROGRESS");
    }
    if (project.recordVersion !== input.expectedRecordVersion) throw new ProjectDeletionError("PROJECT_VERSION_MISMATCH");
    if (project.title !== input.confirmationTitle.trim()) throw new ProjectDeletionError("PROJECT_CONFIRMATION_MISMATCH");
    const writeEpoch = project.writeEpoch + 1;
    const operationId = `delete-${randomUUID()}`;
    const timestamp = now.toISOString();
    const tombstone: ProjectDeletionTombstone = {
      projectId: input.projectId,
      ownerUserId: input.ownerUserId,
      operationId,
      writeEpoch,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      // The application keeps no project content in this record. Retain the fence for seven days.
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString(),
      failure: null,
    };
    const requestHash = randomUUID().replaceAll("-", "");
    const job = projectJobSchema.parse({
      id: operationId,
      projectId: input.projectId,
      kind: "delete",
      status: "queued",
      projectWriteEpoch: writeEpoch,
      requestHash: requestHash.padEnd(64, "0").slice(0, 64),
      idempotencyKeyHash: requestHash.padEnd(64, "0").slice(0, 64),
      scriptVersionId: null,
      sceneRevisionId: null,
      planningInputsVersion: null,
      inputHash: null,
      basePlanVersion: 0,
      candidateManifestId: null,
      approvedVersion: null,
      createdAt: timestamp,
      finishedAt: null,
    });
    transaction.set(tombstoneRef(firestore, input.projectId), tombstone);
    transaction.set(projectRef(firestore, input.projectId).collection("jobs").doc(operationId), { ...job, leaseToken: null, leaseExpiresAt: null, attempt: 0 });
    transaction.update(projectRef(firestore, input.projectId), {
      lifecycle: "deleting",
      writeEpoch,
      activeJobId: null,
      pendingUploadId: null,
      recordVersion: project.recordVersion + 1,
      updatedAt: timestamp,
    });
    return { tombstone, job };
  });
}

async function deleteQueryDocuments(firestore: Firestore, query: FirebaseFirestore.Query) {
  const snapshot = await query.get();
  if (snapshot.empty) return 0;
  const batch = firestore.batch();
  snapshot.docs.forEach(document => batch.delete(document.ref));
  await batch.commit();
  return snapshot.size;
}

async function deleteProjectObjectGenerations(storage: Storage, bucketName: string, projectId: string) {
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: `projects/${projectId}/`, versions: true });
  await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  return files.length;
}

async function recursiveDelete(firestore: Firestore, projectId: string) {
  const ref = projectRef(firestore, projectId);
  const candidate = firestore as Firestore & { recursiveDelete?: (reference: FirebaseFirestore.DocumentReference) => Promise<void> };
  if (candidate.recursiveDelete) {
    await candidate.recursiveDelete(ref);
    return;
  }
  const collections = await ref.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    for (const document of snapshot.docs) {
      const childCollections = await document.ref.listCollections();
      for (const child of childCollections) await deleteQueryDocuments(firestore, child.limit(500));
      await document.ref.delete();
    }
  }
  await ref.delete();
}

export async function executeProjectDeletion(
  firestore: Firestore,
  input: { projectId: string; operationId: string; bucket: string; cloudProjectId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const tombstoneSnapshot = await tombstoneRef(firestore, input.projectId).get();
  if (!tombstoneSnapshot.exists) return { outcome: "missing" as const };
  const tombstone = tombstoneSnapshot.data() as ProjectDeletionTombstone;
  if (tombstone.operationId !== input.operationId || tombstone.status === "complete") return { outcome: "stale" as const };
  await tombstoneRef(firestore, input.projectId).update({ status: "cleaning", updatedAt: now.toISOString(), failure: null });
  try {
    const storage = new Storage({ projectId: input.cloudProjectId });
    await deleteQueryDocuments(firestore, firestore.collection("projectUploadSessions").where("reservation.projectId", "==", input.projectId).limit(500));
    await deleteQueryDocuments(firestore, firestore.collection("planningOutbox").where("projectId", "==", input.projectId).limit(500));
    await deleteQueryDocuments(firestore, firestore.collection("planningActive").where("projectId", "==", input.projectId).limit(500));
    await deleteQueryDocuments(firestore, firestore.collection("rippleActive").where("projectId", "==", input.projectId).limit(500));
    await deleteProjectObjectGenerations(storage, input.bucket, input.projectId);
    await recursiveDelete(firestore, input.projectId);
    // A second pass catches writes that raced with the first pass. Writer transactions check the tombstone fence.
    await deleteProjectObjectGenerations(storage, input.bucket, input.projectId);
    await recursiveDelete(firestore, input.projectId);
    const completedAt = new Date().toISOString();
    await tombstoneRef(firestore, input.projectId).set({ ...tombstone, status: "complete", updatedAt: completedAt, completedAt, failure: null });
    return { outcome: "complete" as const };
  } catch (error) {
    await tombstoneRef(firestore, input.projectId).update({ status: "failed", updatedAt: new Date().toISOString(), failure: error instanceof Error ? error.message.slice(0, 160) : "PROJECT_CLEANUP_FAILED" }).catch(() => undefined);
    throw error;
  }
}

export async function readOwnedProjectDeletion(firestore: Firestore, projectId: string, ownerUserId: string) {
  const snapshot = await tombstoneRef(firestore, projectId).get();
  if (!snapshot.exists) return null;
  const tombstone = snapshot.data() as ProjectDeletionTombstone;
  return tombstone.ownerUserId === ownerUserId ? tombstone : null;
}

export async function sweepExpiredProjectTombstones(firestore: Firestore, now = new Date()) {
  const snapshots = await firestore.collection("projectTombstones").where("expiresAt", "<=", now.toISOString()).limit(50).get();
  await Promise.all(snapshots.docs.map(document => document.ref.delete()));
  return snapshots.size;
}

export async function reconcileProjectDeletions(
  firestore: Firestore,
  input: { bucket: string; cloudProjectId: string; dispatch: (projectId: string, jobId: string) => Promise<void>; now?: Date },
) {
  const now = input.now ?? new Date();
  const queued = await firestore.collection("projectTombstones").where("status", "in", ["queued", "failed"]).limit(20).get();
  let dispatched = 0;
  for (const document of queued.docs) {
    const tombstone = document.data() as ProjectDeletionTombstone;
    try {
      await input.dispatch(tombstone.projectId, tombstone.operationId);
      if (tombstone.status === "failed") await document.ref.update({ status: "queued", updatedAt: now.toISOString(), failure: null });
      dispatched += 1;
    } catch {
      // The tombstone is intentionally retained for a later maintenance delivery.
    }
  }
  const expiredSessions = await firestore.collection("projectUploadSessions").where("reservation.expiresAt", "<=", now.toISOString()).limit(50).get();
  const storage = new Storage({ projectId: input.cloudProjectId });
  await Promise.all(expiredSessions.docs.map(async document => {
    const session = document.data() as { reservation?: { objectKey?: string }; status?: string };
    if (session.status === "reserved" && session.reservation?.objectKey) {
      const [files] = await storage.bucket(input.bucket).getFiles({ prefix: session.reservation.objectKey, versions: true });
      await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
    }
    await document.ref.delete();
  }));
  // Signed upload URLs cannot be revoked once issued. Re-sweep every completed tombstone
  // during its fence window so a delayed browser PUT has no durable project object.
  const completed = await firestore.collection("projectTombstones").where("status", "==", "complete").limit(20).get();
  let lateObjectsRemoved = 0;
  await Promise.all(completed.docs.map(async document => {
    const tombstone = document.data() as ProjectDeletionTombstone;
    lateObjectsRemoved += await deleteProjectObjectGenerations(storage, input.bucket, tombstone.projectId);
    await recursiveDelete(firestore, tombstone.projectId);
  }));
  const expiredTombstones = await sweepExpiredProjectTombstones(firestore, now);
  return { dispatched, expiredUploads: expiredSessions.size, lateObjectsRemoved, expiredTombstones };
}
