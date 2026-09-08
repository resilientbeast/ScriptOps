import { PDFParse } from "pdf-parse";

import {
  assertWithinByteLimit,
  createSourceSpan,
  MAX_EXTRACTED_SCENES,
  MAX_PDF_PAGES,
  type IngestionWarning,
  type ParsedScene,
  type ParsedScreenplay,
  type SourceBlock,
  ScreenplayIngestionError,
} from "@/lib/ingestion/contracts";

const sceneHeadingPattern = /^(?:(\d+[A-Z]?)\s*[.:-]\s*)?((?:INT\.?|EXT\.?|I\/E\.?|INT\/EXT\.?).+)$/i;

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractBlocks(pages: Array<{ num: number; text: string }>): {
  blocks: SourceBlock[];
  warnings: IngestionWarning[];
} {
  const blocks: SourceBlock[] = [];
  const warnings: IngestionWarning[] = [];
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
    if (lines.length === 0) {
      warnings.push({
        code: "PAGE_TEXT_MISSING",
        message: `Page ${page.num} has no extractable text.`,
        sourceIds: [`pdf:page:${page.num}`],
      });
    }
    lines.forEach((text, lineIndex) => {
      blocks.push({
        id: `pdf:page:${page.num}:line:${lineIndex + 1}`,
        page: page.num,
        blockIndex: blocks.length,
        text,
      });
    });
  }
  return { blocks, warnings };
}

function segmentScenes(blocks: SourceBlock[]): {
  scenes: ParsedScene[];
  warnings: IngestionWarning[];
} {
  const scenes: ParsedScene[] = [];
  const warnings: IngestionWarning[] = [];
  const outsideSourceIds: string[] = [];
  let activeScene: ParsedScene | null = null;

  for (const block of blocks) {
    const match = sceneHeadingPattern.exec(block.text);
    if (match) {
      if (scenes.length >= MAX_EXTRACTED_SCENES) {
        throw new ScreenplayIngestionError(
          "SCENE_LIMIT_EXCEEDED",
          `Screenplays may contain at most ${MAX_EXTRACTED_SCENES} extracted scenes.`,
        );
      }
      activeScene = {
        id: `scene-${scenes.length + 1}`,
        ordinal: scenes.length + 1,
        displayNumber: match[1]?.toUpperCase() ?? null,
        heading: match[2]!.trim(),
        sourceText: block.text,
        sourceSpans: [createSourceSpan(block)],
      };
      scenes.push(activeScene);
      continue;
    }
    if (!activeScene) {
      outsideSourceIds.push(block.id);
      continue;
    }
    activeScene.sourceText = `${activeScene.sourceText}\n${block.text}`;
    activeScene.sourceSpans.push(createSourceSpan(block));
  }
  if (scenes.length === 0) {
    throw new ScreenplayIngestionError(
      "SCENE_HEADINGS_MISSING",
      "No recognizable screenplay scene headings were found in this PDF.",
    );
  }
  const missingNumberIds = scenes
    .filter((scene) => scene.displayNumber === null)
    .map((scene) => scene.sourceSpans[0]!.sourceId);
  if (missingNumberIds.length > 0) {
    warnings.push({
      code: "SCENE_NUMBER_MISSING",
      message: "Some scene headings have no explicit scene number.",
      sourceIds: missingNumberIds,
    });
  }
  if (outsideSourceIds.length > 0) {
    warnings.push({
      code: "TEXT_OUTSIDE_SCENE",
      message: "Some screenplay text appears before the first scene heading.",
      sourceIds: outsideSourceIds,
    });
  }
  return { scenes, warnings };
}

export async function parsePdfScreenplay(bytes: Uint8Array): Promise<ParsedScreenplay> {
  assertWithinByteLimit(bytes);
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new ScreenplayIngestionError(
      "PDF_SIGNATURE_INVALID",
      "This file is not a valid PDF document.",
    );
  }

  const parser = new PDFParse({
    data: bytes.slice(),
    stopAtErrors: true,
    isEvalSupported: false,
    disableFontFace: true,
    useWasm: false,
    maxImageSize: 0,
  });
  try {
    const result = await parser.getText();
    if (result.total > MAX_PDF_PAGES) {
      throw new ScreenplayIngestionError(
        "PDF_PAGE_LIMIT_EXCEEDED",
        `PDF screenplays may contain at most ${MAX_PDF_PAGES} pages.`,
      );
    }
    const { blocks, warnings: pageWarnings } = extractBlocks(result.pages);
    if (blocks.length === 0) {
      throw new ScreenplayIngestionError(
        "PDF_UNREADABLE",
        "This PDF has no extractable text. Upload a text-based PDF or FDX file.",
      );
    }
    const { scenes, warnings } = segmentScenes(blocks);
    return { format: "pdf", blocks, scenes, warnings: [...pageWarnings, ...warnings] };
  } catch (error) {
    if (error instanceof ScreenplayIngestionError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/password|encrypted/i.test(message)) {
      throw new ScreenplayIngestionError(
        "PDF_ENCRYPTED",
        "Password-protected PDFs are not supported. Upload an unlocked export.",
      );
    }
    throw new ScreenplayIngestionError(
      "PDF_UNREADABLE",
      "This PDF could not be read as a text-based screenplay.",
    );
  } finally {
    await parser.destroy();
  }
}
