import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseFdxScreenplay } from "@/lib/ingestion/fdx";
import { parsePdfScreenplay } from "@/lib/ingestion/pdf";
import { ScreenplayIngestionError } from "@/lib/ingestion/contracts";
import { parseUploadedScreenplay } from "@/lib/ingestion/worker";
import { createSceneReviewDraft } from "@/lib/scripts/scene-review";
import {
  createBlankPdf,
  createPdfWithPageLines,
  createTextScreenplayPdf,
} from "@/tests/fixtures/screenplays/pdf-fixture";

const fixtureDirectory = new URL("../fixtures/screenplays/", import.meta.url);

async function fixtureBytes(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fileURLToPath(new URL(name, fixtureDirectory))));
}

function report(caseName: string, startedAt: number, details: Record<string, number | string>): void {
  console.info(
    JSON.stringify({
      check: "post-hackathon-ingestion",
      case: caseName,
      elapsedMs: Date.now() - startedAt,
      rssBytes: process.memoryUsage().rss,
      ...details,
    }),
  );
}

function fdxWithSceneCount(sceneCount: number): Uint8Array {
  const paragraphs = Array.from({ length: sceneCount }, (_, index) => {
    const sceneNumber = index + 1;
    return `<Paragraph Type="Scene Heading"><Text>${sceneNumber}. INT. SYNTHETIC SET ${sceneNumber} - DAY</Text></Paragraph>`;
  }).join("");
  return new TextEncoder().encode(`<FinalDraft><Content>${paragraphs}</Content></FinalDraft>`);
}

function screenplayPageLines(pageCount: number): string[][] {
  return Array.from({ length: pageCount }, (_, index) => {
    const sceneNumber = index + 1;
    return [
      `${sceneNumber}. INT. SYNTHETIC SET ${sceneNumber} - DAY`,
      `Synthetic action for page ${sceneNumber}.`,
    ];
  });
}

describe("PH01 ingestion feasibility", () => {
  it("extracts Final Draft paragraphs in source order with traceable scene spans", async () => {
    const startedAt = Date.now();
    const screenplay = parseFdxScreenplay(await fixtureBytes("final-draft-basic.fdx"));
    expect(screenplay.blocks).toHaveLength(7);
    expect(screenplay.scenes).toHaveLength(2);
    expect(screenplay.scenes[0]).toMatchObject({
      displayNumber: "12A",
      heading: "12A. INT. CABIN - NIGHT",
    });
    expect(screenplay.scenes[0]!.sourceSpans).toHaveLength(4);
    expect(screenplay.scenes[1]!.sourceSpans[0]).toMatchObject({
      sourceId: "fdx:paragraph:6:heading:",
      page: null,
      blockIndex: 5,
    });
    expect(screenplay.warnings.map((warning) => warning.code)).toEqual([
      "SCENE_NUMBER_MISSING",
      "TEXT_OUTSIDE_SCENE",
    ]);
    report("fdx-basic", startedAt, {
      format: screenplay.format,
      blockCount: screenplay.blocks.length,
      sceneCount: screenplay.scenes.length,
      warningCount: screenplay.warnings.length,
    });
  });

  it("rejects Final Draft DTD/entity declarations before XML parsing", async () => {
    const startedAt = Date.now();
    const bytes = await fixtureBytes("final-draft-doctype.fdx");
    expect(() => parseFdxScreenplay(bytes)).toThrowError(
      ScreenplayIngestionError,
    );
    report("fdx-doctype-rejected", startedAt, { expectedError: "FDX_DTD_FORBIDDEN" });
  });

  it("rejects malformed Final Draft XML before scene extraction", async () => {
    const startedAt = Date.now();
    const bytes = await fixtureBytes("final-draft-malformed.fdx");
    expect(() => parseFdxScreenplay(bytes)).toThrowError(
      ScreenplayIngestionError,
    );
    report("fdx-malformed-rejected", startedAt, { expectedError: "FDX_INVALID_XML" });
  });

  it("extracts a text-based PDF by page with traceable scene spans", async () => {
    const startedAt = Date.now();
    const screenplay = await parsePdfScreenplay(createTextScreenplayPdf());
    expect(screenplay.blocks.length).toBeGreaterThanOrEqual(5);
    expect(screenplay.scenes).toHaveLength(2);
    expect(screenplay.scenes[0]).toMatchObject({
      displayNumber: "1",
      heading: "INT. GREENHOUSE - DAY",
    });
    expect(screenplay.scenes[1]!.sourceSpans[0]).toMatchObject({ page: 2 });
    report("pdf-text-basic", startedAt, {
      format: screenplay.format,
      blockCount: screenplay.blocks.length,
      sceneCount: screenplay.scenes.length,
      pageCount: new Set(screenplay.blocks.map((block) => block.page)).size,
    });
  });

  it("keeps a long continuous scene reviewable without losing its source trace", async () => {
    const startedAt = Date.now();
    const continuousAction = Array.from(
      { length: 198 },
      (_, index) => `Continuous screenplay action line ${index + 1}.`,
    );
    const pages = Array.from(
      { length: 99 },
      (_, index) => continuousAction.slice(index * 2, index * 2 + 2),
    );
    pages[0]!.unshift("1. INT. ARCHIVE - NIGHT");
    pages.at(-1)!.push("2. EXT./INT. RECORDS OFFICE - DAY", "A clerk opens the file.");
    const manifest = await parseUploadedScreenplay(
      "pdf",
      createPdfWithPageLines(pages),
    );
    const draft = createSceneReviewDraft("script-long-scene", manifest);

    expect(manifest.screenplay.scenes).toHaveLength(2);
    expect(manifest.screenplay.scenes[0]!.sourceSpans).toHaveLength(199);
    expect(manifest.screenplay.scenes[1]).toMatchObject({
      heading: "EXT./INT. RECORDS OFFICE - DAY",
    });
    expect(draft.scenes[0]!.sourceSpans).toHaveLength(199);
    report("pdf-long-scene-review", startedAt, {
      sceneCount: draft.scenes.length,
      sourceSpanCount: draft.scenes[0]!.sourceSpans.length,
    });
  });

  it("rejects non-PDF data before extraction", async () => {
    const startedAt = Date.now();
    await expect(parsePdfScreenplay(new TextEncoder().encode("not a PDF"))).rejects.toMatchObject({
      code: "PDF_SIGNATURE_INVALID",
    });
    report("pdf-signature-rejected", startedAt, { expectedError: "PDF_SIGNATURE_INVALID" });
  });

  it("rejects PDFs without extractable screenplay text", async () => {
    const startedAt = Date.now();
    await expect(parsePdfScreenplay(createBlankPdf())).rejects.toMatchObject({
      code: "PDF_UNREADABLE",
    });
    report("pdf-no-text-rejected", startedAt, { expectedError: "PDF_UNREADABLE" });
  });

  it("flags a mixed text and scan-like PDF page for producer review", async () => {
    const startedAt = Date.now();
    const screenplay = await parsePdfScreenplay(
      createPdfWithPageLines([[], ["1. INT. STUDIO - DAY", "Crew unloads cases."]]),
    );
    expect(screenplay.scenes).toHaveLength(1);
    expect(screenplay.warnings).toContainEqual({
      code: "PAGE_TEXT_MISSING",
      message: "Page 1 has no extractable text.",
      sourceIds: ["pdf:page:1"],
    });
    report("pdf-mixed-text-warning", startedAt, {
      sceneCount: screenplay.scenes.length,
      warningCount: screenplay.warnings.length,
    });
  });

  it("accepts the proposed 200-scene FDX limit and rejects scene 201", () => {
    const startedAt = Date.now();
    const accepted = parseFdxScreenplay(fdxWithSceneCount(200));
    expect(accepted.scenes).toHaveLength(200);
    expect(() => parseFdxScreenplay(fdxWithSceneCount(201))).toThrowError(
      ScreenplayIngestionError,
    );
    report("fdx-scene-limit", startedAt, {
      acceptedSceneCount: accepted.scenes.length,
      rejectedSceneCount: 201,
    });
  });

  it("accepts the proposed 150-page PDF limit and rejects page 151", async () => {
    const startedAt = Date.now();
    const accepted = await parsePdfScreenplay(createPdfWithPageLines(screenplayPageLines(150)));
    expect(accepted.scenes).toHaveLength(150);
    await expect(
      parsePdfScreenplay(createPdfWithPageLines(screenplayPageLines(151))),
    ).rejects.toMatchObject({ code: "PDF_PAGE_LIMIT_EXCEEDED" });
    report("pdf-page-limit", startedAt, {
      acceptedPageCount: 150,
      rejectedPageCount: 151,
      acceptedSceneCount: accepted.scenes.length,
    });
  });
});
