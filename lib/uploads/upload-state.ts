import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

import { projectSchema } from "@/lib/projects/schemas";
import { scriptVersionSchema, type ScriptVersion } from "@/lib/scripts/schemas";
import { screenplayFormatForFilename, sourceObjectKey, type UploadReservationRequest } from "@/lib/uploads/contracts";
import type { SourceStorage, VerifiedSourceObject } from "@/lib/uploads/storage";

type UploadSession = { id: string; ownerUserId: string; reservation: import("@/lib/uploads/contracts").UploadReservation; status: "reserved" | "finalized"; verifiedObject: VerifiedSourceObject | null; script: ScriptVersion | null };

export class UploadStateError extends Error { constructor(readonly code: "UPLOAD_NOT_FOUND" | "UPLOAD_OWNERSHIP_MISMATCH" | "UPLOAD_EXPIRED") { super(code); } }

export interface UploadStateStore { get(id: string): Promise<UploadSession | null>; create(session: UploadSession): Promise<void>; finalize(id: string, ownerUserId: string, verified: VerifiedSourceObject): Promise<UploadSession>; }

export class InMemoryUploadStateStore implements UploadStateStore {
  private readonly sessions = new Map<string, UploadSession>();
  async get(id: string) { const value = this.sessions.get(id); return value ? structuredClone(value) : null; }
  async create(session: UploadSession) { this.sessions.set(session.id, structuredClone(session)); }
  async finalize(id: string, ownerUserId: string, verified: VerifiedSourceObject) { const session = await this.get(id); if (!session) throw new UploadStateError("UPLOAD_NOT_FOUND"); if (session.ownerUserId !== ownerUserId) throw new UploadStateError("UPLOAD_OWNERSHIP_MISMATCH"); if (session.status === "finalized") return session; session.status = "finalized"; session.verifiedObject = verified; session.script = scriptVersionSchema.parse({ id: session.reservation.scriptId, format: screenplayFormatForFilename(session.reservation.filename), originalFilename: session.reservation.filename, declaredBytes: session.reservation.declaredBytes, sourceObjectRef: { objectKey: verified.objectKey, generation: verified.generation }, status: "validating", contentHash: null, parserVersion: null, currentReviewRevisionId: null, uploadedBy: ownerUserId, createdAt: new Date().toISOString() }); this.sessions.set(id, structuredClone(session)); return session; }
}

export class FirestoreUploadStateStore implements UploadStateStore {
  constructor(private readonly firestore: Firestore) {}
  private ref(id: string) { return this.firestore.collection("projectUploadSessions").doc(id); }
  async get(id: string) { const snapshot = await this.ref(id).get(); return snapshot.exists ? snapshot.data() as UploadSession : null; }
  async create(session: UploadSession) {
    const projectRef = this.firestore.collection("projects").doc(session.reservation.projectId);
    await this.firestore.runTransaction(async transaction => {
      const projectSnapshot = await transaction.get(projectRef);
      if (!projectSnapshot.exists) throw new UploadStateError("UPLOAD_NOT_FOUND");
      const project = projectSchema.parse(projectSnapshot.data());
      if (project.ownerUserId !== session.ownerUserId || project.lifecycle !== "active" || project.approvedPlanVersion > 0) throw new UploadStateError("UPLOAD_OWNERSHIP_MISMATCH");
      transaction.create(this.ref(session.id), session);
    });
  }
  async finalize(id: string, ownerUserId: string, verified: VerifiedSourceObject) {
    return this.firestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(this.ref(id));
      if (!snapshot.exists) throw new UploadStateError("UPLOAD_NOT_FOUND");
      const session = snapshot.data() as UploadSession;
      if (session.ownerUserId !== ownerUserId) throw new UploadStateError("UPLOAD_OWNERSHIP_MISMATCH");
      if (session.status === "finalized") return session;

      const projectRef = this.firestore.collection("projects").doc(session.reservation.projectId);
      const projectSnapshot = await transaction.get(projectRef);
      if (!projectSnapshot.exists) throw new UploadStateError("UPLOAD_NOT_FOUND");
      const project = projectSchema.parse(projectSnapshot.data());
      if (project.ownerUserId !== ownerUserId || project.lifecycle !== "active" || project.approvedPlanVersion > 0) {
        throw new UploadStateError("UPLOAD_OWNERSHIP_MISMATCH");
      }

      const script = scriptVersionSchema.parse({ id: session.reservation.scriptId, format: screenplayFormatForFilename(session.reservation.filename), originalFilename: session.reservation.filename, declaredBytes: session.reservation.declaredBytes, sourceObjectRef: { objectKey: verified.objectKey, generation: verified.generation }, status: "validating", contentHash: null, parserVersion: null, currentReviewRevisionId: null, uploadedBy: ownerUserId, createdAt: new Date().toISOString() });
      const finalized = { ...session, status: "finalized" as const, verifiedObject: verified, script };
      const now = new Date().toISOString();
      transaction.set(this.ref(id), finalized);
      transaction.set(projectRef.collection("scripts").doc(script.id), script);
      transaction.update(projectRef, {
        activeScriptVersionId: script.id,
        acceptedSceneRevisionId: null,
        recordVersion: project.recordVersion + 1,
        updatedAt: now,
      });
      return finalized;
    });
  }
}

export class UploadRepository {
  constructor(private readonly store: UploadStateStore, private readonly storage: SourceStorage) {}
  async reserve(ownerUserId: string, projectId: string, request: UploadReservationRequest, now = new Date()) { const scriptId = randomUUID(); const session: UploadSession = { id: randomUUID(), ownerUserId, reservation: { ...request, projectId, scriptId, objectKey: sourceObjectKey(projectId, scriptId), expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString() }, status: "reserved", verifiedObject: null, script: null }; await this.store.create(session); return { uploadId: session.id, reservation: session.reservation, writeUrl: await this.storage.createWriteUrl(session.reservation) }; }
  async finalize(ownerUserId: string, uploadId: string) { const session = await this.store.get(uploadId); if (!session) throw new UploadStateError("UPLOAD_NOT_FOUND"); if (session.ownerUserId !== ownerUserId) throw new UploadStateError("UPLOAD_OWNERSHIP_MISMATCH"); if (session.status === "finalized") return session; if (new Date(session.reservation.expiresAt) < new Date()) throw new UploadStateError("UPLOAD_EXPIRED"); return this.store.finalize(uploadId, ownerUserId, await this.storage.verifyUploadedObject(session.reservation)); }
}
