import { createHash, randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { afterAll, describe, expect, it } from "vitest";
import { planningFixture } from "@/tests/fixtures/planning";
import { FirestoreGenerationRepository } from "@/lib/planning/generation-firestore";
import { planningStages, runPlanningStage } from "@/lib/planning/generation";
import { initialPlanManifestSchema } from "@/lib/planning/initial-plan-manifest";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host && !/^127\.0\.0\.1:\d+$/.test(host)) throw new Error("PH09 tests require an explicit loopback emulator");
const namespace = `demo-ph09-${randomUUID().slice(0, 8)}`;
const app = host ? initializeApp({ projectId: namespace }, namespace) : null;
const firestore = app ? getFirestore(app) : null;
const ids: string[] = [];
const owner = `owner-${namespace}`;
const usageDays = new Set<string>();

async function setup() {
  const f = planningFixture(6, true);
  const id = randomUUID(); ids.push(id);
  const project = firestore!.collection("projects").doc(id);
  const now = new Date().toISOString(); usageDays.add(now.slice(0, 10));
  f.evidence.forEach(record => { record.retrievedAt = now; });
  await project.set({ id, ownerUserId: owner, title: f.snapshot.projectTitle, lifecycle: "active", recordVersion: 1, planningInputsVersion: 1, activeScriptVersionId: "script-1", acceptedSceneRevisionId: "review-1", approvedPlanVersion: 0, approvedManifestId: null, activeJobId: null, pendingUploadId: null, writeEpoch: 0, createdAt: now, updatedAt: now });
  await project.collection("inputs").doc("1").set(f.snapshot.planningInputs);
  const { revision } = f.snapshot;
  await project.collection("sceneRevisions").doc("review-1").set({ id: revision.id, scriptVersionId: revision.scriptVersionId, parentRevisionId: null, editVersion: 0, status: "accepted", scenes: revision.scenes, warnings: [], createdAt: now, acceptedBy: owner, acceptedAt: now });
  await project.collection("scripts").doc("script-1").set({ id: "script-1", format: "fdx", originalFilename: "test.fdx", declaredBytes: 100, sourceObjectRef: { objectKey: `projects/${id}/source`, generation: "1" }, status: "review-ready", contentHash: "b".repeat(64), parserVersion: "v1", currentReviewRevisionId: "review-1", uploadedBy: owner, createdAt: now });
  await Promise.all(f.blocks.map(block => project.collection("scripts").doc("script-1").collection("sourceBlocks").doc(block.id).set(block)));
  return { ...f, id, project, repository: new FirestoreGenerationRepository(firestore!) };
}

async function readyProposal(f: Awaited<ReturnType<typeof setup>>) {
  const job = await f.repository.start(f.id, owner, "test-model", randomUUID(), f.snapshot.pricing);
  for (const stage of planningStages(f.snapshot)) {
    const claim = await f.repository.claim(f.id, job.id);
    expect(claim).not.toBeNull();
    const context = await f.repository.context(claim!);
    const result = await runPlanningStage(claim!.snapshot, stage, context.outputs, context.blocks, f.providers);
    await f.repository.finish(f.id, job.id, claim!.leaseToken!, result, null);
  }
  return job;
}

describe.skipIf(!firestore)("PH09 Firestore transactions", () => {
  afterAll(async () => {
    // Exact test namespace and project IDs only; this suite never targets a live project.
    if (!host?.startsWith("127.0.0.1:") || !namespace.startsWith("demo-ph09-")) throw new Error("Cleanup namespace invalid");
    for (const id of ids) {
      for (const collection of ["planningOutbox", "planningActive"]) {
        const rows = await firestore!.collection(collection).where("projectId", "==", id).get();
        for (const row of rows.docs) await row.ref.delete();
      }
      await firestore!.recursiveDelete(firestore!.collection("projects").doc(id));
      for (const day of usageDays) await firestore!.collection("planningUsageDaily").doc(`project-${id}-${day}`).delete();
    }
    for (const day of usageDays) {
      await firestore!.collection("planningUsageDaily").doc(`global-${day}`).delete();
      await firestore!.collection("planningUsageDaily").doc(`owner-${createHash("sha256").update(owner).digest("hex")}-${day}`).delete();
    }
    await deleteApp(app!);
  });

  it("races duplicate starts, publishes one manifest, and atomically approves Plan v1 once", async () => {
    const f = await setup();
    const key = randomUUID();
    const [first, duplicate] = await Promise.all([f.repository.start(f.id, owner, "test-model", key, f.snapshot.pricing), f.repository.start(f.id, owner, "test-model", key, f.snapshot.pricing)]);
    expect(duplicate.id).toBe(first.id);
    expect((await f.project.collection("usage").doc("planning-starts").get()).get("used")).toBe(1);
    await expect(f.repository.read(f.id, first.id, "other-owner")).rejects.toThrow("PROJECT_NOT_FOUND");
    for (const stage of planningStages(f.snapshot)) {
      const claim = await f.repository.claim(f.id, first.id);
      expect(claim).not.toBeNull();
      expect(await f.repository.claim(f.id, first.id)).toBeNull();
      const context = await f.repository.context(claim!);
      const result = await runPlanningStage(claim!.snapshot, stage, context.outputs, context.blocks, f.providers);
      await f.repository.finish(f.id, first.id, claim!.leaseToken!, result, null);
      await expect(f.repository.finish(f.id, first.id, claim!.leaseToken!, result, null)).rejects.toThrow("LEASE_INVALID");
    }
    const status = await f.repository.read(f.id, first.id, owner);
    expect(status.job.status).toBe("proposal-ready");
    const project = (await f.project.get()).data();
    expect(project).toMatchObject({ approvedPlanVersion: 0, approvedManifestId: null, activeJobId: first.id });
    const manifests = await f.project.collection("manifests").get();
    expect(manifests.size).toBe(1);
    expect(initialPlanManifestSchema.parse(manifests.docs[0]!.data()).draft.plan.scenes).toHaveLength(6);
    expect(await f.repository.claim(f.id, first.id)).toBeNull();
    const [approved, duplicateApproval] = await Promise.all([
      f.repository.approve(f.id, first.id, owner),
      f.repository.approve(f.id, first.id, owner),
    ]);
    expect(duplicateApproval).toEqual(approved);
    expect(approved).toMatchObject({ planVersion: 1, manifestId: manifests.docs[0]!.id, jobId: first.id });
    expect((await f.project.get()).data()).toMatchObject({ approvedPlanVersion: 1, approvedManifestId: manifests.docs[0]!.id, activeJobId: null });
    expect((await f.project.collection("plans").get()).size).toBe(1);
    expect((await f.project.collection("jobs").doc(first.id).get()).data()).toMatchObject({ status: "approved", approvedVersion: 1 });
  }, 30_000);

  it("keeps a discarded manifest immutable and releases its proposal lock", async () => {
    const f = await setup();
    const job = await readyProposal(f);
    const manifestId = (await f.repository.read(f.id, job.id, owner)).job.candidateManifestId!;
    const [discarded, duplicateDiscard] = await Promise.all([
      f.repository.discard(f.id, job.id, owner),
      f.repository.discard(f.id, job.id, owner),
    ]);
    expect(duplicateDiscard).toEqual(discarded);
    expect(discarded.status).toBe("discarded");
    expect((await f.project.get()).data()).toMatchObject({ approvedPlanVersion: 0, approvedManifestId: null, activeJobId: null });
    expect(initialPlanManifestSchema.parse((await f.project.collection("manifests").doc(manifestId).get()).data()).id).toBe(manifestId);
  }, 30_000);

  it("rejects stale or incomplete proposal manifests before Plan v1 is written", async () => {
    const f = await setup();
    const staleJob = await readyProposal(f);
    await f.project.update({ acceptedSceneRevisionId: null });
    await expect(f.repository.approve(f.id, staleJob.id, owner)).rejects.toThrow("PROJECT_APPROVAL_STALE");
    expect((await f.project.collection("plans").get()).empty).toBe(true);

    const valid = await setup();
    const incompleteJob = await readyProposal(valid);
    await valid.project.collection("manifests").doc((await valid.repository.read(valid.id, incompleteJob.id, owner)).job.candidateManifestId!).update({ status: "incomplete" });
    await expect(valid.repository.approve(valid.id, incompleteJob.id, owner)).rejects.toThrow();
    expect((await valid.project.collection("plans").get()).empty).toBe(true);
  }, 45_000);

  it("recovers expired work, preserves accounting, and fences reopened input", async () => {
    const f = await setup();
    const job = await f.repository.start(f.id, owner, "test-model", randomUUID(), f.snapshot.pricing);
    const first = await f.repository.claim(f.id, job.id);
    const later = new Date(Date.now() + 91_000); usageDays.add(later.toISOString().slice(0, 10));
    await f.repository.recover(f.id, job.id, later);
    const recovered = await f.repository.claim(f.id, job.id, later);
    expect(recovered).toMatchObject({ stageAttempt: 2, reservedCents: 50, deliveryGeneration: 1 });
    await expect(f.repository.finish(f.id, job.id, first!.leaseToken!, null, "failed", later)).rejects.toThrow("LEASE_INVALID");
    await f.project.update({ acceptedSceneRevisionId: null });
    await expect(f.repository.finish(f.id, job.id, recovered!.leaseToken!, null, "failed", later)).rejects.toThrow("LEASE_INVALID");
    await f.repository.recover(f.id, job.id, new Date(later.getTime() + 91_000));
    expect(await f.repository.claim(f.id, job.id, new Date(later.getTime() + 91_000))).toBeNull();
    expect((await f.repository.read(f.id, job.id, owner)).job.status).toBe("superseded");
    expect((await f.project.get()).get("activeJobId")).toBeNull();
    expect((await f.project.collection("manifests").get()).empty).toBe(true);
  }, 30_000);

  it("recovers acknowledged dispatch that never reached a worker with a new task generation", async () => {
    const f = await setup();
    const job = await f.repository.start(f.id, owner, "test-model", randomUUID(), f.snapshot.pricing);
    const outbox = firestore!.collection("planningOutbox").doc(`${job.id}-0`);
    await outbox.update({ pending: false, sentAt: new Date(Date.now() - 6 * 60_000).toISOString() });
    await f.repository.recover(f.id, job.id);
    expect((await firestore!.collection("planningOutbox").doc(`${job.id}-1`).get()).get("pending")).toBe(true);
    expect(await f.repository.claim(f.id, job.id)).toMatchObject({ deliveryGeneration: 1, stageAttempt: 1, reservedCents: 25 });
  }, 30_000);

  it("rejects a daily quota reservation atomically and releases only its own job lock", async () => {
    const f = await setup();
    const job = await f.repository.start(f.id, owner, "test-model", randomUUID(), f.snapshot.pricing);
    const usage = firestore!.collection("planningUsageDaily").doc(`project-${f.id}-${new Date().toISOString().slice(0, 10)}`);
    await usage.set({ reservedCents: 3000 });
    expect(await f.repository.claim(f.id, job.id)).toBeNull();
    expect((await usage.get()).get("reservedCents")).toBe(3000);
    expect((await f.repository.read(f.id, job.id, owner)).failure).toBe("INITIAL_PLAN_DAILY_LIMIT");
    expect((await f.project.get()).data()).toMatchObject({ activeJobId: null, approvedPlanVersion: 0, approvedManifestId: null });
  }, 30_000);
});
