import { randomUUID } from "node:crypto";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, describe, expect, it } from "vitest";

import { createPlanningInputs } from "@/lib/planning/inputs";
import { FirestoreProjectStateStore } from "@/lib/projects/project-state-firestore";
import { ProjectStateRepository } from "@/lib/projects/project-state";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const appName = `project-state-test-${randomUUID()}`;
const projectId = "scriptops-ph03-emulator";
const app = emulatorHost ? initializeApp({ projectId }, appName) : null;
const firestore = app ? getFirestore(app) : null;
const createdProjectIds: string[] = [];
const createdRequestKeys: string[] = [];

function planningInputs() {
  return {
    countryCode: "US",
    regionCode: "US-NM",
    currency: "USD",
    assumptions: [],
    budgetCeiling: null,
    shootWindow: null,
    targetHoursPerDay: null,
    supportProfileVersion: "us-nm-v1",
  };
}

function repositoryForEmulator(database: Firestore): ProjectStateRepository {
  return new ProjectStateRepository(new FirestoreProjectStateStore(database));
}

describe.skipIf(!firestore)("project state Firestore contract", () => {
  afterAll(async () => {
    await Promise.all([
      ...createdProjectIds.map((id) => firestore!.recursiveDelete(firestore!.collection("projects").doc(id))),
      ...createdRequestKeys.map((key) => firestore!.collection("projectCreateRequests").doc(key).delete()),
    ]);
    await deleteApp(app!);
  });

  it("enforces ownership, retries, record versions, and archive lifecycle transactionally", async () => {
    const repository = repositoryForEmulator(firestore!);
    const projectId = randomUUID();
    const secondProjectId = randomUUID();
    const foreignProjectId = randomUUID();
    const requestKey = randomUUID().replaceAll("-", "");
    createdProjectIds.push(projectId, secondProjectId, foreignProjectId);
    createdRequestKeys.push(requestKey);
    const input = {
      ownerUserId: "owner-a",
      projectId,
      title: "Firestore project",
      planningInputs: planningInputs(),
      idempotency: { key: requestKey, requestHash: "a".repeat(64) },
    };

    const created = await repository.createProject(input, createPlanningInputs);
    const retried = await repository.createProject(input, createPlanningInputs);
    await repository.createProject(
      {
        ownerUserId: "owner-a",
        projectId: secondProjectId,
        title: "Second Firestore project",
        planningInputs: planningInputs(),
      },
      createPlanningInputs,
    );
    await repository.createProject(
      {
        ownerUserId: "owner-b",
        projectId: foreignProjectId,
        title: "Foreign Firestore project",
        planningInputs: planningInputs(),
      },
      createPlanningInputs,
    );

    expect(created.created).toBe(true);
    expect(retried.created).toBe(false);
    expect(await repository.listOwnedProjects("owner-a")).toHaveLength(2);
    expect(await repository.getOwnedProject("owner-b", projectId)).toBeNull();
    expect(await repository.getOwnedPlanningInputs("owner-a", projectId)).toMatchObject({
      inputHash: created.planningInputs.inputHash,
      version: 1,
    });

    const updated = await repository.updateOwnedProject({
      ownerUserId: "owner-a",
      projectId,
      expectedRecordVersion: 1,
      title: "Updated Firestore project",
    });
    await expect(
      repository.updateOwnedProject({
        ownerUserId: "owner-a",
        projectId,
        expectedRecordVersion: 1,
        lifecycle: "archived",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_VERSION_MISMATCH" });
    const archived = await repository.updateOwnedProject({
      ownerUserId: "owner-a",
      projectId,
      expectedRecordVersion: updated.recordVersion,
      lifecycle: "archived",
    });
    await expect(
      repository.updateOwnedProject({
        ownerUserId: "owner-a",
        projectId,
        expectedRecordVersion: archived.recordVersion,
        title: "Rejected archived update",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
    await expect(
      repository.updateOwnedProject({
        ownerUserId: "owner-a",
        projectId,
        expectedRecordVersion: archived.recordVersion,
        lifecycle: "active",
      }),
    ).resolves.toMatchObject({ lifecycle: "active" });
  });
});
