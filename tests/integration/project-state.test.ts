import { describe, expect, it } from "vitest";

import { createPlanningInputs } from "@/lib/planning/inputs";
import {
  InMemoryProjectStateStore,
  ProjectStateRepository,
} from "@/lib/projects/project-state";

const now = new Date("2026-09-06T15:00:00.000Z");

function createInput(ownerUserId: string, projectId: string) {
  return {
    ownerUserId,
    projectId,
    title: `Project ${projectId}`,
    planningInputs: {
      countryCode: "US",
      regionCode: "US-NM",
      currency: "USD",
      assumptions: [],
      budgetCeiling: null,
      shootWindow: null,
      targetHoursPerDay: null,
      supportProfileVersion: "us-nm-v1",
    },
    now,
  };
}

describe("project state repository", () => {
  it("isolates projects and their immutable planning inputs by owner", async () => {
    const repository = new ProjectStateRepository(new InMemoryProjectStateStore());
    const first = await repository.createProject(
      createInput("user-a", "project-a"),
      createPlanningInputs,
    );
    await repository.createProject(createInput("user-b", "project-b"), createPlanningInputs);

    expect(await repository.listOwnedProjects("user-a")).toHaveLength(1);
    expect(await repository.getOwnedProject("user-b", "project-a")).toBeNull();
    expect(await repository.getOwnedPlanningInputs("user-a", "project-a")).toMatchObject({
      inputHash: first.planningInputs.inputHash,
      version: 1,
    });
  });

  it("uses record versions to reject stale updates and preserves the prior project", async () => {
    const repository = new ProjectStateRepository(new InMemoryProjectStateStore());
    await repository.createProject(createInput("user-a", "project-a"), createPlanningInputs);
    const updated = await repository.updateOwnedProject({
      ownerUserId: "user-a",
      projectId: "project-a",
      expectedRecordVersion: 1,
      title: "Renamed project",
      now,
    });
    expect(updated.recordVersion).toBe(2);

    await expect(
      repository.updateOwnedProject({
        ownerUserId: "user-a",
        projectId: "project-a",
        expectedRecordVersion: 1,
        lifecycle: "archived",
        now,
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_VERSION_MISMATCH",
    });
    expect((await repository.getOwnedProject("user-a", "project-a"))?.title).toBe(
      "Renamed project",
    );
  });

  it("deduplicates an equivalent create and rejects a conflicting reused key", async () => {
    const repository = new ProjectStateRepository(new InMemoryProjectStateStore());
    const input = {
      ...createInput("user-a", "project-a"),
      idempotency: { key: "owner-a-key", requestHash: "a".repeat(64) },
    };
    const first = await repository.createProject(input, createPlanningInputs);
    const second = await repository.createProject(input, createPlanningInputs);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    expect(await repository.listOwnedProjects("user-a")).toHaveLength(1);

    await expect(
      repository.createProject(
        { ...input, idempotency: { key: "owner-a-key", requestHash: "b".repeat(64) } },
        createPlanningInputs,
      ),
    ).rejects.toMatchObject({ code: "PROJECT_IDEMPOTENCY_CONFLICT" });
  });

  it("permits restore while refusing ordinary writes to an archived project", async () => {
    const repository = new ProjectStateRepository(new InMemoryProjectStateStore());
    await repository.createProject(createInput("user-a", "project-a"), createPlanningInputs);
    const archived = await repository.updateOwnedProject({
      ownerUserId: "user-a",
      projectId: "project-a",
      expectedRecordVersion: 1,
      lifecycle: "archived",
      now,
    });

    await expect(
      repository.updateOwnedProject({
        ownerUserId: "user-a",
        projectId: "project-a",
        expectedRecordVersion: archived.recordVersion,
        title: "Cannot rename archived project",
        now,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
    await expect(
      repository.updateOwnedProject({
        ownerUserId: "user-a",
        projectId: "project-a",
        expectedRecordVersion: archived.recordVersion,
        lifecycle: "active",
        now,
      }),
    ).resolves.toMatchObject({ lifecycle: "active", recordVersion: 3 });
  });
});
