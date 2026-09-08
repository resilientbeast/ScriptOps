import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { measureJsonBytes, MAX_PERSISTED_DOCUMENT_BYTES } from "@/lib/domain/invariants";
import type { SourceBlock } from "@/lib/ingestion/contracts";
import { projectJobSchema } from "@/lib/jobs/schemas";
import { projectSchema } from "@/lib/projects/schemas";
import { sceneReviewRevisionSchema, scriptVersionSchema } from "@/lib/scripts/schemas";
import { initialPlanDraftSchema, planningInputsSchema } from "@/lib/planning/schemas";
import { createInitialPlanJob, initialPlanJobKey } from "@/lib/planning/initial-plan-job";
import { createInitialPlanManifest, initialPlanManifestSchema } from "@/lib/planning/initial-plan-manifest";
import { createApprovedInitialPlan, approvedInitialPlanSchema } from "@/lib/planning/initial-plan-approval";
import { PLANNING_VERSION, planningRevision, planningStages, type PlanningSnapshot, type StageOutputs, type StageResult } from "@/lib/planning/generation";
import { ATTEMPT_ALLOWANCE_CENTS, claimGeneration, finishGenerationStage, type GenerationState } from "@/lib/planning/generation-state";
import { planningResearchRequest } from "@/lib/planning/planning-evidence";
import { validatePlanningPricing, type PlanningPricing } from "@/lib/planning/limits";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function assertSize(value: unknown) { if (measureJsonBytes(value) > MAX_PERSISTED_DOCUMENT_BYTES) throw new Error("INITIAL_PLAN_RECORD_LIMIT"); }

export class FirestoreGenerationRepository {
  constructor(private readonly firestore: Firestore) {}
  private project(id: string) { return this.firestore.collection("projects").doc(id); }
  private job(projectId: string, jobId: string) { return this.project(projectId).collection("jobs").doc(jobId); }

  async start(projectId: string, ownerUserId: string, model: string, idempotencyKey: string, pricing: PlanningPricing) {
    validatePlanningPricing(pricing);
    const projectRef = this.project(projectId);
    const requestRef = projectRef.collection("planningRequests").doc(digest(`${ownerUserId}:${idempotencyKey}`));
    return this.firestore.runTransaction(async transaction => {
      const [projectDoc, requestDoc] = await Promise.all([transaction.get(projectRef), transaction.get(requestRef)]);
      if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId) throw new Error("PROJECT_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data());
      if (!project.acceptedSceneRevisionId || !project.activeScriptVersionId || project.lifecycle !== "active" || project.approvedPlanVersion !== 0) throw new Error("INITIAL_PLAN_NOT_READY");
      const [reviewDoc, inputsDoc, scriptDoc] = await Promise.all([
        transaction.get(projectRef.collection("sceneRevisions").doc(project.acceptedSceneRevisionId)),
        transaction.get(projectRef.collection("inputs").doc(String(project.planningInputsVersion))),
        transaction.get(projectRef.collection("scripts").doc(project.activeScriptVersionId)),
      ]);
      const revision = planningRevision(sceneReviewRevisionSchema.parse(reviewDoc.data()));
      const planningInputs = planningInputsSchema.parse(inputsDoc.data());
      const script = scriptVersionSchema.parse(scriptDoc.data());
      if (script.currentReviewRevisionId !== revision.id) throw new Error("INITIAL_PLAN_NOT_READY");
      planningResearchRequest(planningInputs, ["permits", "costs"]);
      const requestHash = initialPlanJobKey(projectId, revision.id, planningInputs.inputHash);
      if (requestDoc.exists) {
        if (requestDoc.get("requestHash") !== requestHash) throw new Error("INITIAL_PLAN_IDEMPOTENCY_CONFLICT");
        return projectJobSchema.parse((await transaction.get(this.job(projectId, requestDoc.get("jobId")))).data());
      }
      if (project.activeJobId) throw new Error("INITIAL_PLAN_ALREADY_ACTIVE");
      const job = createInitialPlanJob({ projectId, writeEpoch: project.writeEpoch, script, revision, planningInputs });
      const snapshot: PlanningSnapshot = { projectTitle: project.title, revision, planningInputs, model, version: PLANNING_VERSION, pricing };
      const control = { snapshot, stageIndex: 0, stageAttempt: 0, deliveryGeneration: 0, leaseToken: null, leaseExpiresAt: null, reservedCents: 0, failure: null };
      assertSize(control);
      const usageRef = projectRef.collection("usage").doc("planning-starts");
      const usage = await transaction.get(usageRef);
      if ((usage.get("used") ?? 0) >= 20) throw new Error("INITIAL_PLAN_START_LIMIT");
      transaction.set(usageRef, { used: (usage.get("used") ?? 0) + 1 });
      transaction.create(this.job(projectId, job.id), job);
      transaction.create(this.job(projectId, job.id).collection("control").doc("state"), control);
      transaction.create(requestRef, { requestHash, jobId: job.id });
      transaction.update(projectRef, { activeJobId: job.id, recordVersion: project.recordVersion + 1, updatedAt: job.createdAt });
      this.outbox(transaction, projectId, job.id, 0);
      transaction.create(this.firestore.collection("planningActive").doc(job.id), { projectId, jobId: job.id });
      return job;
    });
  }

  private outbox(transaction: Transaction, projectId: string, jobId: string, generation: number) {
    transaction.set(this.firestore.collection("planningOutbox").doc(`${jobId}-${generation}`), { projectId, jobId, generation, pending: true, createdAt: new Date().toISOString() });
  }

  private async state(transaction: Transaction, projectId: string, jobId: string): Promise<GenerationState> {
    const ref = this.job(projectId, jobId);
    const [job, control] = await Promise.all([transaction.get(ref), transaction.get(ref.collection("control").doc("state"))]);
    if (!job.exists || !control.exists) throw new Error("INITIAL_PLAN_NOT_FOUND");
    return { ...control.data(), job: projectJobSchema.parse(job.data()) } as GenerationState;
  }

  private save(transaction: Transaction, state: GenerationState) {
    const { job, ...control } = state;
    assertSize(control);
    const ref = this.job(job.projectId, job.id);
    transaction.set(ref, job);
    transaction.set(ref.collection("control").doc("state"), control);
  }

  async claim(projectId: string, jobId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId);
      const [projectDoc, state] = await Promise.all([transaction.get(projectRef), this.state(transaction, projectId, jobId)]);
      if (!projectDoc.exists) return null;
      const project = projectSchema.parse(projectDoc.data());
      let claimed = claimGeneration(state, project, now);
      if (!claimed) return null;
      if (claimed.job.status === "running") {
        // Ambiguous/failed calls retain their entire allowance. No refund can increase retries.
        const day = now.toISOString().slice(0, 10);
        const limits = [[`global-${day}`, 10_000], [`owner-${digest(project.ownerUserId)}-${day}`, 3000], [`project-${projectId}-${day}`, 3000]] as const;
        const refs = limits.map(([id]) => this.firestore.collection("planningUsageDaily").doc(id));
        const usage = await Promise.all(refs.map(ref => transaction.get(ref)));
        if (usage.some((doc, index) => (doc.get("reservedCents") ?? 0) + ATTEMPT_ALLOWANCE_CENTS > limits[index]![1])) {
          claimed = { ...state, job: { ...state.job, status: "failed", finishedAt: now.toISOString() }, leaseToken: null, leaseExpiresAt: null, failure: "INITIAL_PLAN_DAILY_LIMIT" };
        } else {
          refs.forEach((ref, index) => transaction.set(ref, { reservedCents: (usage[index]!.get("reservedCents") ?? 0) + ATTEMPT_ALLOWANCE_CENTS }));
        }
      }
      this.save(transaction, claimed);
      if (["failed", "superseded"].includes(claimed.job.status)) transaction.delete(this.firestore.collection("planningActive").doc(jobId));
      if (["failed", "superseded"].includes(claimed.job.status) && project.activeJobId === jobId) transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      return claimed.job.status === "running" ? claimed : null;
    });
  }

  async finish(projectId: string, jobId: string, token: string, result: StageResult | null, failure: string | null, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId);
      const [projectDoc, state] = await Promise.all([transaction.get(projectRef), this.state(transaction, projectId, jobId)]);
      const project = projectSchema.parse(projectDoc.data());
      const next = finishGenerationStage(state, project, token, result, failure, now);
      const stage = planningStages(state.snapshot)[state.stageIndex]!;
      if (result) {
        assertSize(result);
        transaction.create(this.job(projectId, jobId).collection("steps").doc(stage), { ...result, stage, attempt: state.stageAttempt, inputHash: state.job.inputHash, version: PLANNING_VERSION, model: state.snapshot.model, completedAt: now.toISOString() });
      }
      if (next.job.status === "proposal-ready") {
        const manifest = createInitialPlanManifest({ jobId, scriptVersionId: state.job.scriptVersionId!, draft: initialPlanDraftSchema.parse(result!.output), createdAt: now.toISOString() });
        const complete = { ...manifest, provenance: { schemaVersion: PLANNING_VERSION, promptVersion: PLANNING_VERSION, model: state.snapshot.model, pricing: state.snapshot.pricing, reservedCents: next.reservedCents, stepIds: planningStages(state.snapshot), sceneManifestHash: state.snapshot.revision.sceneManifestHash } };
        assertSize(complete);
        transaction.create(projectRef.collection("manifests").doc(manifest.id), complete);
        next.job.candidateManifestId = manifest.id;
      }
      this.save(transaction, next);
      if (["failed", "proposal-ready"].includes(next.job.status)) transaction.delete(this.firestore.collection("planningActive").doc(jobId));
      if (next.job.status === "queued") this.outbox(transaction, projectId, jobId, next.deliveryGeneration);
      if (next.job.status === "failed" && project.activeJobId === jobId) transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      return next;
    });
  }

  async context(state: GenerationState): Promise<{ outputs: StageOutputs; blocks: SourceBlock[] }> {
    const ref = this.job(state.job.projectId, state.job.id);
    const steps = await ref.collection("steps").get();
    const outputs = Object.fromEntries(steps.docs.map(doc => [doc.id, doc.get("output")]));
    const stage = planningStages(state.snapshot)[state.stageIndex]!;
    if (!stage.startsWith("breakdown-")) return { outputs, blocks: [] };
    const batchIndex = Number(stage.slice(10));
    const ids = [...new Set(state.snapshot.revision.scenes.slice(batchIndex * 5, (batchIndex + 1) * 5).flatMap(scene => scene.sourceSpans.map(span => span.sourceId)))];
    const sources = this.project(state.job.projectId).collection("scripts").doc(state.job.scriptVersionId!).collection("sourceBlocks");
    const blocks = await this.firestore.getAll(...ids.map(id => sources.doc(id.replaceAll("/", "_"))));
    if (blocks.some(doc => !doc.exists)) throw new Error("INITIAL_PLAN_SOURCE_MISSING");
    return { outputs, blocks: blocks.map(doc => doc.data() as SourceBlock) };
  }

  async read(projectId: string, jobId: string, ownerUserId: string) {
    const project = await this.project(projectId).get();
    if (!project.exists || project.get("ownerUserId") !== ownerUserId) throw new Error("PROJECT_NOT_FOUND");
    const state = await this.firestore.runTransaction(transaction => this.state(transaction, projectId, jobId));
    return { job: state.job, stage: planningStages(state.snapshot)[state.stageIndex] ?? "complete", completedStages: state.stageIndex, totalStages: planningStages(state.snapshot).length, reservedCents: state.reservedCents, failure: state.failure };
  }

  async approve(projectId: string, jobId: string, ownerUserId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId);
      const jobRef = this.job(projectId, jobId);
      const [projectDoc, jobDoc] = await Promise.all([transaction.get(projectRef), transaction.get(jobRef)]);
      if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId || !jobDoc.exists) throw new Error("PROJECT_APPROVAL_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data());
      const job = projectJobSchema.parse(jobDoc.data());
      if (job.status === "approved" && project.approvedPlanVersion === 1 && project.approvedManifestId === job.candidateManifestId && job.approvedVersion === 1) {
        const approvedDoc = await transaction.get(projectRef.collection("plans").doc("v1"));
        if (!approvedDoc.exists) throw new Error("PROJECT_APPROVAL_MANIFEST_INVALID");
        return approvedInitialPlanSchema.parse(approvedDoc.data());
      }
      if (project.lifecycle !== "active" || project.approvedPlanVersion !== 0 || project.activeJobId !== jobId || job.kind !== "initial-plan" || job.status !== "proposal-ready" || !job.candidateManifestId || job.projectWriteEpoch !== project.writeEpoch || job.scriptVersionId !== project.activeScriptVersionId || job.sceneRevisionId !== project.acceptedSceneRevisionId || job.planningInputsVersion !== project.planningInputsVersion) throw new Error("PROJECT_APPROVAL_STALE");
      const manifestDoc = await transaction.get(projectRef.collection("manifests").doc(job.candidateManifestId));
      if (!manifestDoc.exists) throw new Error("PROJECT_APPROVAL_MANIFEST_INVALID");
      const manifest = initialPlanManifestSchema.parse({
        ...manifestDoc.data(),
        id: job.candidateManifestId,
      });
      if (manifest.jobId !== job.id || manifest.scriptVersionId !== job.scriptVersionId || manifest.sceneRevisionId !== job.sceneRevisionId || manifest.planningInputsVersion !== job.planningInputsVersion || manifest.inputHash !== job.inputHash || manifest.basePlanVersion !== job.basePlanVersion) throw new Error("PROJECT_APPROVAL_MANIFEST_INVALID");
      const approved = createApprovedInitialPlan(manifest, now.toISOString());
      transaction.create(projectRef.collection("plans").doc("v1"), approved);
      transaction.update(projectRef, { approvedPlanVersion: 1, approvedManifestId: approved.manifestId, activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      transaction.update(jobRef, { status: "approved", approvedVersion: 1, finishedAt: now.toISOString() });
      return approved;
    });
  }

  async discard(projectId: string, jobId: string, ownerUserId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const projectRef = this.project(projectId); const jobRef = this.job(projectId, jobId);
      const [projectDoc, jobDoc] = await Promise.all([transaction.get(projectRef), transaction.get(jobRef)]);
      if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId || !jobDoc.exists) throw new Error("PROJECT_APPROVAL_NOT_FOUND");
      const project = projectSchema.parse(projectDoc.data()); const job = projectJobSchema.parse(jobDoc.data());
      if (job.status === "discarded") return job;
      if (project.lifecycle !== "active" || project.approvedPlanVersion !== 0 || project.activeJobId !== jobId || job.status !== "proposal-ready") throw new Error("PROJECT_APPROVAL_STALE");
      const discarded = { ...job, status: "discarded" as const, finishedAt: now.toISOString() };
      transaction.set(jobRef, discarded); transaction.update(projectRef, { activeJobId: null, recordVersion: project.recordVersion + 1, updatedAt: now.toISOString() });
      return projectJobSchema.parse(discarded);
    });
  }

  async readProposal(projectId: string, jobId: string, ownerUserId: string) {
    const [projectDoc, jobDoc] = await Promise.all([this.project(projectId).get(), this.job(projectId, jobId).get()]);
    if (!projectDoc.exists || projectDoc.get("ownerUserId") !== ownerUserId || !jobDoc.exists) throw new Error("PROJECT_APPROVAL_NOT_FOUND");
    const project = projectSchema.parse(projectDoc.data());
    const job = projectJobSchema.parse(jobDoc.data());
    if (project.approvedPlanVersion !== 0 || project.activeJobId !== jobId || job.kind !== "initial-plan" || job.status !== "proposal-ready" || !job.candidateManifestId) throw new Error("PROJECT_APPROVAL_STALE");
    const manifestDoc = await this.project(projectId).collection("manifests").doc(job.candidateManifestId).get();
    if (!manifestDoc.exists) throw new Error("PROJECT_APPROVAL_MANIFEST_INVALID");
    const manifest = initialPlanManifestSchema.parse({ ...manifestDoc.data(), id: job.candidateManifestId });
    if (manifest.jobId !== job.id || manifest.scriptVersionId !== job.scriptVersionId || manifest.sceneRevisionId !== job.sceneRevisionId || manifest.planningInputsVersion !== job.planningInputsVersion || manifest.inputHash !== job.inputHash || manifest.basePlanVersion !== job.basePlanVersion) throw new Error("PROJECT_APPROVAL_MANIFEST_INVALID");
    return manifest;
  }

  async recover(projectId: string, jobId: string, now = new Date()) {
    return this.firestore.runTransaction(async transaction => {
      const state = await this.state(transaction, projectId, jobId);
      if (state.job.status === "queued") {
        const outbox = await transaction.get(this.firestore.collection("planningOutbox").doc(`${jobId}-${state.deliveryGeneration}`));
        // Acknowledged dispatch is not proof of worker delivery. Recover lost/exhausted tasks too.
        if (!outbox.exists || outbox.get("pending") || !outbox.get("sentAt") || now.getTime() - Date.parse(outbox.get("sentAt")) < 5 * 60_000) return;
      } else if (state.job.status !== "running" || !state.leaseExpiresAt || Date.parse(state.leaseExpiresAt) > now.getTime()) return;
      const recovered = { ...state, job: { ...state.job, status: "queued" as const }, leaseToken: null, leaseExpiresAt: null, deliveryGeneration: state.deliveryGeneration + 1 };
      this.save(transaction, recovered);
      this.outbox(transaction, projectId, jobId, recovered.deliveryGeneration);
    });
  }
}
