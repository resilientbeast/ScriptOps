import { randomUUID } from "node:crypto";

import type { SourceBlock } from "@/lib/ingestion/contracts";
import type { ParsedScriptManifest } from "@/lib/ingestion/worker";
import { sceneReviewRevisionSchema, type ParsedScene } from "@/lib/scripts/schemas";

type SceneReviewDraft = ReturnType<typeof createSceneReviewDraft>;

function reindex(scenes: ParsedScene[]) {
  return scenes.map((scene, index) => ({ ...scene, ordinal: index + 1 }));
}

function assertExpectedVersion(draft: SceneReviewDraft, expectedEditVersion: number) {
  if (draft.editVersion !== expectedEditVersion) throw new Error("SCENE_REVIEW_VERSION_MISMATCH");
}

function assertReviewSourceIntegrity(draft: SceneReviewDraft) {
  const includedSourceIds = new Set<string>();
  for (const scene of draft.scenes) {
    for (const span of scene.sourceSpans) {
      if (includedSourceIds.has(span.sourceId)) throw new Error("SCENE_REVIEW_SOURCE_OVERLAP");
      includedSourceIds.add(span.sourceId);
    }
  }
  const excludedSources = draft.warnings
    .filter(warning => warning.code === "TEXT_OUTSIDE_SCENE")
    .flatMap(warning => warning.sourceIds);
  if (excludedSources.some(sourceId => !includedSourceIds.has(sourceId))) {
    throw new Error("SCENE_REVIEW_RESTORATION_REQUIRED");
  }
}

export function createSceneReviewDraft(scriptId: string, manifest: ParsedScriptManifest, now = new Date()) {
  return sceneReviewRevisionSchema.parse({
    id: randomUUID(),
    scriptVersionId: scriptId,
    parentRevisionId: null,
    editVersion: 0,
    status: "draft",
    scenes: manifest.screenplay.scenes.map(scene => ({ id: scene.id, ordinal: scene.ordinal, displayNumber: scene.displayNumber, originalHeading: scene.heading, reviewedHeading: scene.heading, sourceSpans: scene.sourceSpans, warningIds: [], predecessorSceneIds: [] })),
    warnings: manifest.warnings.map((warning, index) => ({ id: `warning-${index + 1}`, code: warning.code, sourceIds: warning.sourceIds, acknowledged: false })),
    createdAt: now.toISOString(),
    acceptedBy: null,
    acceptedAt: null,
  });
}

export function reopenSceneReview(accepted: SceneReviewDraft, now = new Date()) {
  if (accepted.status !== "accepted") throw new Error("SCENE_REVIEW_NOT_ACCEPTED");
  return sceneReviewRevisionSchema.parse({
    ...accepted,
    id: randomUUID(),
    parentRevisionId: accepted.id,
    editVersion: 0,
    status: "draft",
    createdAt: now.toISOString(),
    acceptedBy: null,
    acceptedAt: null,
  });
}

export function acceptSceneReviewDraft(draft: SceneReviewDraft, actorId: string, expectedEditVersion: number, now = new Date()) {
  assertExpectedVersion(draft, expectedEditVersion);
  if (draft.warnings.some(warning => !warning.acknowledged)) throw new Error("SCENE_REVIEW_WARNINGS_UNACKNOWLEDGED");
  assertReviewSourceIntegrity(draft);
  return sceneReviewRevisionSchema.parse({ ...draft, status: "accepted", acceptedBy: actorId, acceptedAt: now.toISOString() });
}

export function renameReviewedScene(draft: SceneReviewDraft, sceneId: string, heading: string, expectedEditVersion: number) {
  assertExpectedVersion(draft, expectedEditVersion);
  const scenes = draft.scenes.map(scene => scene.id === sceneId ? { ...scene, reviewedHeading: heading } : scene);
  if (!scenes.some(scene => scene.id === sceneId)) throw new Error("SCENE_REVIEW_SCENE_NOT_FOUND");
  return sceneReviewRevisionSchema.parse({ ...draft, scenes, editVersion: draft.editVersion + 1 });
}

export function mergeAdjacentReviewedScenes(draft: SceneReviewDraft, firstSceneId: string, expectedEditVersion: number) {
  assertExpectedVersion(draft, expectedEditVersion);
  const index = draft.scenes.findIndex(scene => scene.id === firstSceneId);
  const first = draft.scenes[index];
  const second = draft.scenes[index + 1];
  if (!first || !second) throw new Error("SCENE_REVIEW_ADJACENT_SCENE_REQUIRED");
  const reviewedHeading = first.reviewedHeading === second.reviewedHeading
    ? first.reviewedHeading
    : `${first.reviewedHeading} / ${second.reviewedHeading}`;
  const merged = { ...first, reviewedHeading, sourceSpans: [...first.sourceSpans, ...second.sourceSpans], warningIds: [...new Set([...first.warningIds, ...second.warningIds])], predecessorSceneIds: [...new Set([...first.predecessorSceneIds, first.id, second.id])] };
  return sceneReviewRevisionSchema.parse({ ...draft, scenes: reindex([...draft.scenes.slice(0, index), merged, ...draft.scenes.slice(index + 2)]), editVersion: draft.editVersion + 1 });
}

export function splitReviewedScene(draft: SceneReviewDraft, sceneId: string, sourceSpanIndex: number, expectedEditVersion: number) {
  assertExpectedVersion(draft, expectedEditVersion);
  const index = draft.scenes.findIndex(scene => scene.id === sceneId);
  const scene = draft.scenes[index];
  if (!scene || sourceSpanIndex <= 0 || sourceSpanIndex >= scene.sourceSpans.length) throw new Error("SCENE_REVIEW_SPLIT_INVALID");
  const predecessorSceneIds = [...new Set([...scene.predecessorSceneIds, scene.id])];
  const left = { ...scene, id: randomUUID(), sourceSpans: scene.sourceSpans.slice(0, sourceSpanIndex), predecessorSceneIds };
  const right = { ...scene, id: randomUUID(), sourceSpans: scene.sourceSpans.slice(sourceSpanIndex), predecessorSceneIds };
  return sceneReviewRevisionSchema.parse({ ...draft, scenes: reindex([...draft.scenes.slice(0, index), left, right, ...draft.scenes.slice(index + 1)]), editVersion: draft.editVersion + 1 });
}

export function restoreExcludedSourceBlock(draft: SceneReviewDraft, block: SourceBlock, heading: string, insertAfterSceneId: string | null, expectedEditVersion: number) {
  assertExpectedVersion(draft, expectedEditVersion);
  const excludedSourceIds = new Set(draft.warnings.filter(warning => warning.code === "TEXT_OUTSIDE_SCENE").flatMap(warning => warning.sourceIds));
  if (!excludedSourceIds.has(block.id)) throw new Error("SCENE_REVIEW_SOURCE_NOT_RESTORABLE");
  if (draft.scenes.some(scene => scene.sourceSpans.some(span => span.sourceId === block.id))) throw new Error("SCENE_REVIEW_SOURCE_ALREADY_INCLUDED");
  const index = insertAfterSceneId === null ? draft.scenes.length : draft.scenes.findIndex(scene => scene.id === insertAfterSceneId) + 1;
  if (index < 0) throw new Error("SCENE_REVIEW_SCENE_NOT_FOUND");
  const warningIds = draft.warnings.filter(warning => warning.sourceIds.includes(block.id)).map(warning => warning.id);
  const restored: ParsedScene = { id: randomUUID(), ordinal: index + 1, displayNumber: null, originalHeading: heading, reviewedHeading: heading, sourceSpans: [{ sourceId: block.id, page: block.page, blockIndex: block.blockIndex, startOffset: 0, endOffset: block.text.length }], warningIds, predecessorSceneIds: [] };
  return sceneReviewRevisionSchema.parse({ ...draft, scenes: reindex([...draft.scenes.slice(0, index), restored, ...draft.scenes.slice(index)]), editVersion: draft.editVersion + 1 });
}
