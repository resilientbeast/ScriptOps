import { createHash } from "node:crypto";

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { measureJsonBytes, MAX_PERSISTED_DOCUMENT_BYTES } from "@/lib/domain/invariants";
import { projectJobSchema, type ProjectJob } from "@/lib/jobs/schemas";
import { projectSchema } from "@/lib/projects/schemas";
import { planningInputsSchema } from "@/lib/planning/schemas";
import { createApprovedRipplePlan, projectPlanSchema } from "@/lib/planning/initial-plan-approval";
import { createProjectRippleJob, createProjectRippleRequestSchema, isProjectProductionRelevant, rippleRequestHash, type ProjectRippleSnapshot } from "@/lib/planning/project-ripple";
import { createProjectRippleManifest, projectRippleManifestSchema, type ProjectRippleDraft } from "@/lib/planning/project-ripple-manifest";
import { ATTEMPT_ALLOWANCE_CENTS, JOB_DEADLINE_MS, MAX_JOB_ALLOWANCE_CENTS, MAX_STAGE_ATTEMPTS, STAGE_LEASE_MS } from "@/lib/planning/generation-state";
import type { PlanningPricing } from "@/lib/planning/limits";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const assertSize = (value: unknown) => { if (measureJsonBytes(value) > MAX_PERSISTED_DOCUMENT_BYTES) throw new Error("RIPPLE_RECORD_LIMIT"); };

type RippleControl = {
  snapshot: ProjectRippleSnapshot & { pricing: PlanningPricing };
  deliveryGeneration: number;
  stageAttempt: number;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  reservedCents: number;
  failure: string | null;
};
export type RippleState = RippleControl & { job: ProjectJob };

export class FirestoreProjectRippleRepository {
  constructor(private readonly firestore: Firestore) {}
  private project(id: string) { return this.firestore.collection("projects").doc(id); }
  private job(projectId: string, jobId: string) { return this.project(projectId).collection("jobs").doc(jobId); }
  private control(projectId: string, jobId: string) { return this.job(projectId, jobId).collection("control").doc("ripple"); }

  private outbox(transaction: Transaction, projectId: string, jobId: string, generation: number) {
    transaction.set(this.firestore.collection("planningOutbox").doc(`${jobId}-${generation}`), { projectId, jobId, generation, pending: true, createdAt: new Date().toISOString() });
  }

  private async readState(transaction: Transaction, projectId: string, jobId: string): Promise<RippleState> {
    const [jobDoc, controlDoc] = await Promise.all([transaction.get(this.job(projectId, jobId)), transaction.get(this.control(projectId, jobId))]);
    if (!jobDoc.exists || !controlDoc.exists) throw new Error("RIPPLE_NOT_FOUND");
    return { ...(controlDoc.data() as RippleControl), job: projectJobSchema.parse(jobDoc.data()) };
  }

  private saveState(transaction: Transaction, state: RippleState) {
    const { job, ...control } = state;
    assertSize(control);
    transaction.set(this.job(job.projectId, job.id), job);
    transaction.set(this.control(job.projectId, job.id), control);
  }

  async start(projectId: string, ownerUserId: string, model: string, request: unknown, pricing: PlanningPricing) {
    const input = createProjectRippleRequestSchema.parse(request);
    if (!isProjectProductionRelevant(input.requestText)) throw new Error("RIPPLE_REQUEST_IRRELEVANT");
    const projectRef = this.project(projectId);
    const requestRef = projectRef.collection("rippleRequests").doc(digest(`${ownerUserId}:${input.idempotencyKey}`));
    return this.firestore.runTransaction(async transaction => {
      const [projectDoc, idempotencyDoc] = await Promise.all([transaction.get(projectRef), transaction.get(requestRef)]);
      if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId) throw new Error("PROJECT_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data());
      if (project.lifecycle !== "active" || !project.activeScriptVersionId || !project.acceptedSceneRevisionId || project.approvedPlanVersion < 1 || !project.approvedManifestId) throw new Error("RIPPLE_NOT_READY");
      const requestHash = rippleRequestHash(projectId, project.approvedPlanVersion, input.sceneId, input.requestText);
      if (idempotencyDoc.exists) {
        if (idempotencyDoc.get("requestHash") !== requestHash) throw new Error("RIPPLE_IDEMPOTENCY_CONFLICT");
        const existing = await transaction.get(this.job(projectId, idempotencyDoc.get("jobId")));
        if (!existing.exists) throw new Error("RIPPLE_NOT_FOUND");
        return projectJobSchema.parse(existing.data());
      }
      if (project.activeJobId) throw new Error("RIPPLE_ALREADY_ACTIVE");
      const [planDoc, inputsDoc] = await Promise.all([
        transaction.get(projectRef.collection("plans").doc(`v${project.approvedPlanVersion}`)),
        transaction.get(projectRef.collection("inputs").doc(String(project.planningInputsVersion))),
      ]);
      if (!planDoc.exists || !inputsDoc.exists) throw new Error("RIPPLE_NOT_READY");
      const base = projectPlanSchema.parse(planDoc.data());
      const planningInputs = planningInputsSchema.parse(inputsDoc.data());
      if (base.planVersion !== project.approvedPlanVersion || base.manifestId !== project.approvedManifestId || !base.manifest.draft.plan.scenes.some(scene => scene.id === input.sceneId)) throw new Error("RIPPLE_SCENE_NOT_FOUND");
      const job = createProjectRippleJob({ projectId, writeEpoch: project.writeEpoch, basePlanVersion: base.planVersion, scriptVersionId: project.activeScriptVersionId, sceneRevisionId: project.acceptedSceneRevisionId, planningInputsVersion: planningInputs.version, requestHash });
      const control: RippleControl = { snapshot: { projectTitle: project.title, model, planningInputs, base, sceneId: input.sceneId, requestText: input.requestText, pricing }, deliveryGeneration: 0, stageAttempt: 0, leaseToken: null, leaseExpiresAt: null, reservedCents: 0, failure: null };
      assertSize(control);
      transaction.create(this.job(projectId, job.id), job);
      transaction.create(this.control(projectId, job.id), control);
      transaction.create(requestRef, { requestHash, jobId: job.id });
      transaction.update(projectRef, { activeJobId: job.id, recordVersion: project.recordVersion + 1, updatedAt: job.createdAt });
      this.outbox(transaction, projectId, job.id, 0);
      transaction.create(this.firestore.collection("rippleActive").doc(job.id), { projectId, jobId: job.id });
      return job;
    });
  }

  private current(project: ReturnType<typeof projectSchema.parse>, state: RippleState) {
    return project.lifecycle === "active" && project.writeEpoch === state.job.projectWriteEpoch && project.activeJobId === state.job.id && project.approvedPlanVersion === state.job.basePlanVersion && project.approvedManifestId === state.snapshot.base.manifestId && project.activeScriptVersionId === state.job.scriptVersionId && project.acceptedSceneRevisionId === state.job.sceneRevisionId && project.planningInputsVersion === state.job.planningInputsVersion;
  }

  async claim(projectId: string, jobId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId);
      const [projectDoc, state] = await Promise.all([transaction.get(projectRef), this.readState(transaction, projectId, jobId)]);
      if (!projectDoc.exists) return null;
      const project = projectSchema.parse(projectDoc.data());
      if (!["queued", "running"].includes(state.job.status)) return null;
      if (!this.current(project, state)) {
        const next = { ...state, job: { ...state.job, status: "superseded" as const, finishedAt: now.toISOString() }, leaseToken: null, leaseExpiresAt: null, failure: "RIPPLE_BASELINE_CHANGED" };
        this.saveState(transaction, next);
        transaction.delete(this.firestore.collection("rippleActive").doc(jobId));
        if (project.activeJobId === jobId) transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
        return null;
      }
      if (state.job.status === "running" && state.leaseExpiresAt && Date.parse(state.leaseExpiresAt) > now.getTime()) return null;
      if (state.stageAttempt >= MAX_STAGE_ATTEMPTS || state.reservedCents + ATTEMPT_ALLOWANCE_CENTS > MAX_JOB_ALLOWANCE_CENTS || now.getTime() - Date.parse(state.job.createdAt) > JOB_DEADLINE_MS) {
        const next = { ...state, job: { ...state.job, status: "failed" as const, finishedAt: now.toISOString() }, leaseToken: null, leaseExpiresAt: null, failure: "RIPPLE_LIMIT_REACHED" };
        this.saveState(transaction, next);
        transaction.delete(this.firestore.collection("rippleActive").doc(jobId));
        transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
        return null;
      }
      const next = { ...state, job: { ...state.job, status: "running" as const }, stageAttempt: state.stageAttempt + 1, leaseToken: crypto.randomUUID(), leaseExpiresAt: new Date(now.getTime() + STAGE_LEASE_MS).toISOString(), reservedCents: state.reservedCents + ATTEMPT_ALLOWANCE_CENTS, failure: null };
      this.saveState(transaction, next);
      return next;
    });
  }

  async finish(projectId: string, jobId: string, token: string, draft: ProjectRippleDraft | null, failure: string | null, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId);
      const [projectDoc, state] = await Promise.all([transaction.get(projectRef), this.readState(transaction, projectId, jobId)]);
      if (!projectDoc.exists) throw new Error("RIPPLE_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data());
      if (!this.current(project, state) || state.job.status !== "running" || state.leaseToken !== token || !state.leaseExpiresAt || Date.parse(state.leaseExpiresAt) <= now.getTime()) throw new Error("RIPPLE_LEASE_INVALID");
      if (draft) {
        const completeDraft = { ...draft, jobId };
        const manifest = createProjectRippleManifest({ jobId, scriptVersionId: state.job.scriptVersionId!, planningInputsVersion: state.job.planningInputsVersion!, draft: completeDraft, createdAt: now.toISOString() });
        const complete = { ...manifest, provenance: { schemaVersion: "ripple-v1", promptVersion: "ripple-v1", model: state.snapshot.model, reservedCents: state.reservedCents } };
        assertSize(complete);
        transaction.create(projectRef.collection("manifests").doc(manifest.id), complete);
        const next = { ...state, job: { ...state.job, status: "proposal-ready" as const, candidateManifestId: manifest.id, finishedAt: now.toISOString() }, leaseToken: null, leaseExpiresAt: null, failure: null };
        this.saveState(transaction, next);
        transaction.delete(this.firestore.collection("rippleActive").doc(jobId));
        return next;
      }
      const terminal = state.stageAttempt >= MAX_STAGE_ATTEMPTS;
      const next = { ...state, job: { ...state.job, status: terminal ? "failed" as const : "queued" as const, finishedAt: terminal ? now.toISOString() : null }, deliveryGeneration: state.deliveryGeneration + 1, leaseToken: null, leaseExpiresAt: null, failure: failure ?? "RIPPLE_GENERATION_FAILED" };
      this.saveState(transaction, next);
      if (terminal) transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      if (terminal) transaction.delete(this.firestore.collection("rippleActive").doc(jobId));
      else this.outbox(transaction, projectId, jobId, next.deliveryGeneration);
      return next;
    });
  }

  async read(projectId: string, jobId: string, ownerUserId: string) {
    const projectDoc = await this.project(projectId).get();
    if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId) throw new Error("PROJECT_NOT_FOUND");
    const state = await this.firestore.runTransaction(transaction => this.readState(transaction, projectId, jobId));
    return { job: state.job, stage: "ripple", completedStages: state.job.status === "proposal-ready" || state.job.status === "approved" ? 1 : 0, totalStages: 1, reservedCents: state.reservedCents, failure: state.failure };
  }

  async recover(projectId: string, jobId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const state = await this.readState(transaction, projectId, jobId);
      if (state.job.status === "queued") {
        const outbox = await transaction.get(this.firestore.collection("planningOutbox").doc(`${jobId}-${state.deliveryGeneration}`));
        if (!outbox.exists || outbox.get("pending") || !outbox.get("sentAt") || now.getTime() - Date.parse(outbox.get("sentAt")) < 5 * 60_000) return;
      } else if (state.job.status !== "running" || !state.leaseExpiresAt || Date.parse(state.leaseExpiresAt) > now.getTime()) return;
      const next = { ...state, job: { ...state.job, status: "queued" as const }, leaseToken: null, leaseExpiresAt: null, deliveryGeneration: state.deliveryGeneration + 1 };
      this.saveState(transaction, next);
      this.outbox(transaction, projectId, jobId, next.deliveryGeneration);
    });
  }

  private async proposal(transaction: Transaction, projectRef: FirebaseFirestore.DocumentReference, job: ProjectJob) {
    if (!job.candidateManifestId) throw new Error("RIPPLE_MANIFEST_INVALID");
    const doc = await transaction.get(projectRef.collection("manifests").doc(job.candidateManifestId));
    if (!doc.exists) throw new Error("RIPPLE_MANIFEST_INVALID");
    const manifest = projectRippleManifestSchema.parse({ ...doc.data(), id: job.candidateManifestId });
    if (manifest.jobId !== job.id || manifest.basePlanVersion !== job.basePlanVersion) throw new Error("RIPPLE_MANIFEST_INVALID");
    return manifest;
  }

  async approve(projectId: string, jobId: string, ownerUserId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId); const jobRef = this.job(projectId, jobId);
      const [projectDoc, jobDoc] = await Promise.all([transaction.get(projectRef), transaction.get(jobRef)]);
      if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId || !jobDoc.exists) throw new Error("RIPPLE_APPROVAL_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data()); const job = projectJobSchema.parse(jobDoc.data());
      if (job.status === "approved" && job.approvedVersion) {
        const installed = await transaction.get(projectRef.collection("plans").doc(`v${job.approvedVersion}`));
        if (!installed.exists) throw new Error("RIPPLE_MANIFEST_INVALID");
        return projectPlanSchema.parse(installed.data());
      }
      if (project.lifecycle !== "active" || project.activeJobId !== jobId || project.approvedPlanVersion !== job.basePlanVersion || job.kind !== "ripple" || job.status !== "proposal-ready") throw new Error("RIPPLE_APPROVAL_STALE");
      const manifest = await this.proposal(transaction, projectRef, job);
      if (project.approvedManifestId !== manifest.baseManifestId) throw new Error("RIPPLE_APPROVAL_STALE");
      const version = job.basePlanVersion + 1;
      const approved = createApprovedRipplePlan(manifest, version, now.toISOString());
      transaction.create(projectRef.collection("plans").doc(`v${version}`), approved);
      transaction.update(projectRef, { approvedPlanVersion: version, approvedManifestId: approved.manifestId, activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      transaction.update(jobRef, { status: "approved", approvedVersion: version, finishedAt: now.toISOString() });
      return approved;
    });
  }

  async discard(projectId: string, jobId: string, ownerUserId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId); const jobRef = this.job(projectId, jobId);
      const [projectDoc, jobDoc] = await Promise.all([transaction.get(projectRef), transaction.get(jobRef)]);
      if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId || !jobDoc.exists) throw new Error("RIPPLE_APPROVAL_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data()); const job = projectJobSchema.parse(jobDoc.data());
      if (job.status === "discarded") return job;
      if (project.lifecycle !== "active" || project.activeJobId !== jobId || project.approvedPlanVersion !== job.basePlanVersion || job.kind !== "ripple" || job.status !== "proposal-ready") throw new Error("RIPPLE_APPROVAL_STALE");
      const discarded = { ...job, status: "discarded" as const, finishedAt: now.toISOString() };
      transaction.set(jobRef, discarded); transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      return projectJobSchema.parse(discarded);
    });
  }

  async readProposal(projectId: string, jobId: string, ownerUserId: string) {
    const [projectDoc, jobDoc] = await Promise.all([this.project(projectId).get(), this.job(projectId, jobId).get()]);
    if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId || !jobDoc.exists) throw new Error("RIPPLE_APPROVAL_NOT_FOUND");
    const project = projectSchema.parse(projectDoc.data()); const job = projectJobSchema.parse(jobDoc.data());
    if (project.activeJobId !== jobId || project.approvedPlanVersion !== job.basePlanVersion || job.kind !== "ripple" || job.status !== "proposal-ready") throw new Error("RIPPLE_APPROVAL_STALE");
    return this.firestore.runTransaction(transaction => this.proposal(transaction, this.project(projectId), job));
  }

  async history(projectId: string, ownerUserId: string) {
    const projectDoc = await this.project(projectId).get();
    if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId) throw new Error("PROJECT_NOT_FOUND");
    const project = projectSchema.parse(projectDoc.data());
    const docs = await this.firestore.getAll(...Array.from({ length: project.approvedPlanVersion }, (_, index) => this.project(projectId).collection("plans").doc(`v${index + 1}`)));
    return docs.filter(doc => doc.exists).map(doc => projectPlanSchema.parse(doc.data())).sort((a, b) => a.planVersion - b.planVersion);
  }
}
