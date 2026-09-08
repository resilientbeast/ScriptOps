import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { GOLDEN_REQUEST } from "@/lib/domain/golden-invariants";
import { createApprovedInitialPlan } from "@/lib/planning/initial-plan-approval";
import { createInitialPlanDraft } from "@/lib/planning/initial-plan";
import { createInitialPlanManifest } from "@/lib/planning/initial-plan-manifest";
import { createProjectRippleDraft } from "@/lib/planning/project-ripple";
import { FirestoreProjectRippleRepository } from "@/lib/planning/project-ripple-firestore";
import { planningFixture } from "@/tests/fixtures/planning";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host && !/^127\.0\.0\.1:\d+$/.test(host)) throw new Error("PH11 tests require an explicit loopback emulator");
const namespace = `demo-ph11-${randomUUID().slice(0, 8)}`;
const app = host ? initializeApp({ projectId: namespace }, namespace) : null;
const firestore = app ? getFirestore(app) : null;
const owner = `owner-${namespace}`;
const projectIds: string[] = [];

async function setup(sceneCount = 2) {
  const fixture = planningFixture(sceneCount, true);
  const id = randomUUID(); projectIds.push(id);
  const project = firestore!.collection("projects").doc(id);
  const now = new Date().toISOString();
  fixture.evidence.forEach(record => { record.retrievedAt = now; });
  const draft = createInitialPlanDraft({ projectTitle: fixture.snapshot.projectTitle, revision: fixture.snapshot.revision, planningInputs: fixture.snapshot.planningInputs, plan: fixture.plan, generatedAt: now });
  const manifest = createInitialPlanManifest({ jobId: "initial-fixture", scriptVersionId: "script-1", draft, createdAt: now });
  const approved = createApprovedInitialPlan(manifest, now);
  await project.set({ id, ownerUserId: owner, title: fixture.snapshot.projectTitle, lifecycle: "active", recordVersion: 1, planningInputsVersion: 1, activeScriptVersionId: "script-1", acceptedSceneRevisionId: "review-1", approvedPlanVersion: 1, approvedManifestId: manifest.id, activeJobId: null, pendingUploadId: null, writeEpoch: 0, createdAt: now, updatedAt: now });
  await project.collection("inputs").doc("1").set(fixture.snapshot.planningInputs);
  await project.collection("plans").doc("v1").set(approved);
  await project.collection("manifests").doc(manifest.id).set(manifest);
  return { id, project, fixture, repository: new FirestoreProjectRippleRepository(firestore!) };
}

async function readyProposal(context: Awaited<ReturnType<typeof setup>>, requestText = "Move this scene to a covered weather day and revise production costs.", sceneId = context.fixture.plan.scenes[0]!.id) {
  const job = await context.repository.start(context.id, owner, "test-model", { sceneId, requestText, idempotencyKey: randomUUID() }, context.fixture.snapshot.pricing);
  const claimed = await context.repository.claim(context.id, job.id);
  expect(claimed).not.toBeNull();
  const basePlan = claimed!.snapshot.base.manifest.draft.plan;
  const draft = createProjectRippleDraft({ jobId: job.id, planningInputs: claimed!.snapshot.planningInputs, base: claimed!.snapshot.base, sceneId: claimed!.snapshot.sceneId, requestText: claimed!.snapshot.requestText, output: { schedule: basePlan.schedule, budget: basePlan.budget, locations: basePlan.locations, casting: basePlan.casting, assumptions: ["Covered-day availability needs producer verification."], warnings: ["This proposal is an estimate pending producer review."] } });
  await context.repository.finish(context.id, job.id, claimed!.leaseToken!, draft, null);
  return job;
}

describe.skipIf(!firestore)("PH11 project ripple transactions", () => {
  afterAll(async () => {
    if (!host?.startsWith("127.0.0.1:") || !namespace.startsWith("demo-ph11-")) throw new Error("Cleanup namespace invalid");
    for (const id of projectIds) await firestore!.recursiveDelete(firestore!.collection("projects").doc(id));
    await deleteApp(app!);
  });

  it("approves v1 → v2 → v3, keeps stale retries idempotent, and permits another proposal after approval", async () => {
    const context = await setup();
    const v2Job = await readyProposal(context);
    const v2 = await context.repository.approve(context.id, v2Job.id, owner);
    expect(v2).toMatchObject({ kind: "ripple", planVersion: 2, jobId: v2Job.id });
    const v3Job = await readyProposal(context, "Shift this scene to a night shoot and assess the crew and budget impact.");
    const v3 = await context.repository.approve(context.id, v3Job.id, owner);
    expect(v3).toMatchObject({ kind: "ripple", planVersion: 3, jobId: v3Job.id });
    expect(await context.repository.approve(context.id, v2Job.id, owner)).toEqual(v2);
    expect((await context.project.get()).data()).toMatchObject({ approvedPlanVersion: 3, approvedManifestId: v3.manifestId, activeJobId: null });
    expect((await context.repository.history(context.id, owner)).map(plan => plan.planVersion)).toEqual([1, 2, 3]);
  });

  it("keeps a discarded proposal immutable and releases only that project lock", async () => {
    const context = await setup();
    const job = await readyProposal(context);
    const manifestId = (await context.repository.read(context.id, job.id, owner)).job.candidateManifestId!;
    await expect(context.repository.discard(context.id, job.id, owner)).resolves.toMatchObject({ status: "discarded" });
    expect((await context.project.get()).data()).toMatchObject({ approvedPlanVersion: 1, activeJobId: null });
    expect((await context.project.collection("manifests").doc(manifestId).get()).exists).toBe(true);
  });

  it("does not route a real project request matching the demo golden input to fixture assembly, and leaves another project unchanged", async () => {
    const primary = await setup(14);
    const untouched = await setup();
    const job = await readyProposal(primary, GOLDEN_REQUEST, "scene-14");
    const proposal = await primary.repository.readProposal(primary.id, job.id, owner);
    expect(proposal).toMatchObject({ kind: "ripple", basePlanVersion: 1, jobId: job.id });
    expect(proposal.draft.plan.scenes).toHaveLength(14);
    expect((await untouched.project.get()).data()).toMatchObject({ approvedPlanVersion: 1, activeJobId: null });
    await primary.project.update({ approvedPlanVersion: 2 });
    await expect(primary.repository.approve(primary.id, job.id, owner)).rejects.toThrow("RIPPLE_APPROVAL_STALE");
  });
});
