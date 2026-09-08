import { describe, expect, it } from "vitest";

import { assertProjectWrite } from "@/lib/projects/project-deletion-contracts";
import { projectSchema } from "@/lib/projects/schemas";

const activeProject = projectSchema.parse({
  id: "project-1",
  ownerUserId: "user-1",
  title: "Cleanup fixture",
  lifecycle: "active",
  recordVersion: 1,
  planningInputsVersion: 1,
  activeScriptVersionId: "script-1",
  acceptedSceneRevisionId: null,
  approvedPlanVersion: 0,
  approvedManifestId: null,
  activeJobId: "parse-script-1",
  pendingUploadId: null,
  writeEpoch: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("project deletion fencing", () => {
  it("allows the worker only while its exact project epoch and script remain active", () => {
    expect(() => assertProjectWrite(activeProject, 3, "script-1")).not.toThrow();
    expect(() => assertProjectWrite({ ...activeProject, writeEpoch: 4 }, 3, "script-1")).toThrow("PROJECT_WRITE_FENCED");
    expect(() => assertProjectWrite({ ...activeProject, lifecycle: "deleting", activeJobId: null }, 3, "script-1")).toThrow("PROJECT_WRITE_FENCED");
    expect(() => assertProjectWrite({ ...activeProject, activeScriptVersionId: "script-2" }, 3, "script-1")).toThrow("PROJECT_WRITE_FENCED");
  });
});
