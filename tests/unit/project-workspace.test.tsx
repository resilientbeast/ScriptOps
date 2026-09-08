import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectWorkspace } from "@/components/projects/project-workspace";
import type { Project } from "@/lib/projects/schemas";

const project = { id: "project-a", ownerUserId: "user-a", title: "Untitled feature", lifecycle: "active", recordVersion: 1, planningInputsVersion: 1, activeScriptVersionId: null, acceptedSceneRevisionId: null, approvedPlanVersion: 0, approvedManifestId: null, activeJobId: null, pendingUploadId: null, writeEpoch: 0, createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z" } as Project;

describe("project workspace", () => { it("keeps a new project empty and links to the isolated demo", () => { const markup = renderToStaticMarkup(<ProjectWorkspace projects={[project]} />); expect(markup).toContain("Untitled feature"); expect(markup).toContain("No screenplay yet"); expect(markup).toContain('href="/demo"'); }); });
