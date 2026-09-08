import { randomUUID } from "node:crypto";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, describe, expect, it } from "vitest";

import { queueProjectParse } from "@/lib/jobs/queue-project-parse";
import { projectSchema } from "@/lib/projects/schemas";
import { scriptVersionSchema } from "@/lib/scripts/schemas";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const app = emulatorHost ? initializeApp({ projectId: "scriptops-ph06-emulator" }, `project-parse-queue-${randomUUID()}`) : null;
const firestore = app ? getFirestore(app) : null;
const projectId = randomUUID();
const scriptId = randomUUID();

describe.skipIf(!firestore)("project parse queue Firestore contract", () => {
  afterAll(async () => {
    await firestore!.recursiveDelete(firestore!.collection("projects").doc(projectId));
    await deleteApp(app!);
  });

  it("publishes one parse job and one quota reservation for a retried finalization", async () => {
    const now = "2026-09-06T00:00:00.000Z";
    const projectRef = firestore!.collection("projects").doc(projectId);
    await projectRef.set(projectSchema.parse({ id: projectId, ownerUserId: "owner-a", title: "Queue test", lifecycle: "active", recordVersion: 2, planningInputsVersion: 1, activeScriptVersionId: scriptId, acceptedSceneRevisionId: null, approvedPlanVersion: 0, approvedManifestId: null, activeJobId: null, pendingUploadId: null, writeEpoch: 0, createdAt: now, updatedAt: now }));
    await projectRef.collection("scripts").doc(scriptId).set(scriptVersionSchema.parse({ id: scriptId, format: "pdf", originalFilename: "queue-test.pdf", declaredBytes: 123, sourceObjectRef: { objectKey: `projects/${projectId}/scripts/${scriptId}/source`, generation: "123456789" }, status: "validating", contentHash: null, parserVersion: null, currentReviewRevisionId: null, uploadedBy: "owner-a", createdAt: now }));

    const first = await queueProjectParse(firestore! as Firestore, projectId, scriptId);
    const second = await queueProjectParse(firestore! as Firestore, projectId, scriptId);
    const usage = await projectRef.collection("usage").doc("jobs").get();

    expect(first).toMatchObject({ created: true, job: { id: `parse-${scriptId}`, kind: "parse", status: "queued" } });
    expect(second).toMatchObject({ created: false, job: { id: first.job.id } });
    expect(usage.data()).toMatchObject({ used: 1, jobIds: [first.job.id] });
  });

  it("requeues an expired worker lease without another browser request", async () => {
    const jobRef = firestore!.collection("projects").doc(projectId).collection("jobs").doc(`parse-${scriptId}`);
    await jobRef.update({ status: "running", leaseToken: "expired-token", leaseExpiresAt: "2026-09-06T00:00:00.000Z", attempt: 1 });
    const recovered = await queueProjectParse(firestore! as Firestore, projectId, scriptId);
    expect(recovered).toMatchObject({ created: false, job: { status: "queued" } });
    expect((await jobRef.get()).data()).toMatchObject({ status: "queued", leaseToken: null, leaseExpiresAt: null, attempt: 1 });
  });
});
