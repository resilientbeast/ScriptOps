import { describe, expect, it } from "vitest";

import { parseUploadedScreenplay } from "@/lib/ingestion/worker";
import { acceptSceneReviewDraft, createSceneReviewDraft, mergeAdjacentReviewedScenes, renameReviewedScene, restoreExcludedSourceBlock, splitReviewedScene } from "@/lib/scripts/scene-review";
import { createTextScreenplayPdf } from "@/tests/fixtures/screenplays/pdf-fixture";

describe("scene review", () => {
  it("requires explicit warning acknowledgement and fences stale edits", async () => {
    const draft = createSceneReviewDraft("script-a", await parseUploadedScreenplay("pdf", createTextScreenplayPdf()));
    const renamed = renameReviewedScene(draft, "scene-1", "INT. GREENHOUSE — DAY", 0);
    expect(renamed.editVersion).toBe(1);
    expect(() => acceptSceneReviewDraft(renamed, "user-a", 0)).toThrow("SCENE_REVIEW_VERSION_MISMATCH");
    const acknowledged = { ...renamed, warnings: renamed.warnings.map(warning => ({ ...warning, acknowledged: true })) };
    expect(acceptSceneReviewDraft(acknowledged, "user-a", 1)).toMatchObject({ status: "accepted", acceptedBy: "user-a" });
  });
  it("keeps predecessor provenance through split and adjacent merge", async () => {
    const draft = createSceneReviewDraft("script-a", await parseUploadedScreenplay("pdf", createTextScreenplayPdf()));
    const split = splitReviewedScene(draft, "scene-1", 1, 0);
    expect(split.scenes).toHaveLength(3);
    const merged = mergeAdjacentReviewedScenes(split, split.scenes[0]!.id, 1);
    expect(merged.scenes).toHaveLength(2);
    expect(merged.scenes[0]?.predecessorSceneIds).toContain("scene-1");
    expect(merged.scenes[0]?.reviewedHeading).toBe(draft.scenes[0]?.reviewedHeading);
  });
  it("requires parser-excluded source blocks to be restored before acceptance", () => {
    const excluded = { id: "source-excluded", page: 1, blockIndex: 1, text: "A missing scene follows." };
    const manifest = { parserVersion: "ph07-v1" as const, format: "pdf" as const, blockCount: 2, sceneCount: 1, sourceCoverage: "partial" as const, contentHash: "a".repeat(64), warnings: [{ code: "TEXT_OUTSIDE_SCENE" as const, message: "Text needs review.", sourceIds: [excluded.id] }], screenplay: { format: "pdf" as const, blocks: [{ id: "source-1", page: 1, blockIndex: 0, text: "INT. OFFICE - DAY" }, excluded], scenes: [{ id: "scene-1", ordinal: 1, displayNumber: "1", heading: "INT. OFFICE - DAY", sourceText: "INT. OFFICE - DAY", sourceSpans: [{ sourceId: "source-1", page: 1, blockIndex: 0, startOffset: 0, endOffset: 17 }] }], warnings: [] } };
    const draft = createSceneReviewDraft("script-a", manifest);
    const acknowledged = { ...draft, warnings: draft.warnings.map(warning => ({ ...warning, acknowledged: true })) };
    expect(() => acceptSceneReviewDraft(acknowledged, "user-a", 0)).toThrow("SCENE_REVIEW_RESTORATION_REQUIRED");
    const restored = restoreExcludedSourceBlock(acknowledged, excluded, "INT. HALLWAY - DAY", null, 0);
    expect(acceptSceneReviewDraft(restored, "user-a", 1)).toMatchObject({ status: "accepted", scenes: [{ id: "scene-1" }, { reviewedHeading: "INT. HALLWAY - DAY" }] });
  });
});
