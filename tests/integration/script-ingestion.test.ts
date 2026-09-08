import { describe, expect, it } from "vitest";
import { parseAndPersistUploadedScreenplay, parseUploadedScreenplay } from "@/lib/ingestion/worker";
import { InMemoryScriptIngestionStore } from "@/lib/scripts/ingestion-state";
import { createTextScreenplayPdf } from "@/tests/fixtures/screenplays/pdf-fixture";

describe("durable script ingestion output", () => {
  it("preserves traceable PDF blocks and marks coverage", async () => {
    const result = await parseUploadedScreenplay("pdf", createTextScreenplayPdf());
    expect(result).toMatchObject({ parserVersion: "ph07-v1", blockCount: 5, sceneCount: 2, sourceCoverage: "complete" });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.screenplay.scenes[0]?.sourceSpans[0]?.sourceId).toBe("pdf:page:1:line:1");
  });
  it("persists an immutable manifest and its source blocks", async () => {
    const result = await parseUploadedScreenplay("pdf", createTextScreenplayPdf());
    const store = new InMemoryScriptIngestionStore();
    const stored = await store.save("project-a", "script-a", result);
    expect(stored).toMatchObject({ scriptId: "script-a", sceneCount: 2, blockCount: 5 });
    await expect(store.save("project-a", "script-a", { ...result, contentHash: "f".repeat(64) })).rejects.toThrow("SCRIPT_MANIFEST_CONTENT_CONFLICT");
  });
  it("runs parsing and persistence as one worker operation", async () => {
    const store = new InMemoryScriptIngestionStore();
    await expect(parseAndPersistUploadedScreenplay({ projectId: "project-a", scriptId: "script-a", format: "pdf", bytes: createTextScreenplayPdf() }, store)).resolves.toMatchObject({ sceneCount: 2 });
    await expect(store.get("project-a", "script-a")).resolves.toMatchObject({ sourceCoverage: "complete" });
  });
});
