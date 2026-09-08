import { describe, expect, it } from "vitest";

import { isOwnedProject } from "@/lib/projects/access";
import type { Project } from "@/lib/projects/schemas";

const project = {
  id: "project-a",
  ownerUserId: "user-a",
} as Project;

describe("project ownership", () => {
  it("requires the actor identity to match the persisted project owner", () => {
    expect(isOwnedProject(project, { userId: "user-a" })).toBe(true);
    expect(isOwnedProject(project, { userId: "user-b" })).toBe(false);
  });
});
