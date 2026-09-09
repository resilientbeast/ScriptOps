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

function normalizeSceneHeading(
  value: string,
  displayNumber: string | null,
): { heading: string; displayNumber: string | null } {
  const normalized = normalizeLine(value);
  const layoutNumbers = /\s+(\d+[A-Z]?)\s+(\d+)$/i.exec(normalized);
  if (layoutNumbers) {
    return {
      heading: normalized.slice(0, layoutNumbers.index).trim(),
      displayNumber: displayNumber ?? layoutNumbers[1]!.toUpperCase(),
    };
  }
  return { heading: normalized, displayNumber };
}

function hasUnclosedParenthesis(value: string): boolean {
  let balance = 0;
  for (const character of value) {
    if (character === "(") balance += 1;
    if (character === ")") balance -= 1;
  }
  return balance > 0;
}

function isHeadingContinuation(heading: string, value: string): boolean {
  const normalized = normalizeLine(value);
  const endsWithLayoutNumbers = /\)\s+(?:\d+[A-Z]?\s+)?\d+$/i.test(normalized);
  return endsWithLayoutNumbers && (
    hasUnclosedParenthesis(heading) ||
    /^\([^)]*\)\s+(?:\d+[A-Z]?\s+)?\d+$/i.test(normalized)
  );
}

function isTitlePageFrontMatter(blocks: SourceBlock[]): boolean {
  if (!blocks.length || blocks.some((block) => block.page !== 1)) return false;
  const text = blocks.map((block) => block.text).join(" ");
  return /\b(?:written by|screenplay by|story by|draft|copyright)\b/i.test(text);
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
  const outsideBlocks: SourceBlock[] = [];
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
      const parsedHeading = normalizeSceneHeading(
        match[2]!,
        match[1]?.toUpperCase() ?? null,
      );
      activeScene = {
        id: `scene-${scenes.length + 1}`,
        ordinal: scenes.length + 1,
        displayNumber: parsedHeading.displayNumber,
        heading: parsedHeading.heading,
        sourceText: block.text,
        sourceSpans: [createSourceSpan(block)],
      };
      scenes.push(activeScene);
      continue;
    }
    if (!activeScene) {
      outsideBlocks.push(block);
      continue;
    }
    if (activeScene.sourceSpans.length === 1 && isHeadingContinuation(activeScene.heading, block.text)) {
      const parsedHeading = normalizeSceneHeading(
        `${activeScene.heading} ${block.text}`,
        activeScene.displayNumber,
      );
      activeScene.heading = parsedHeading.heading;
      activeScene.displayNumber = parsedHeading.displayNumber;
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
  if (outsideBlocks.length > 0) {
    const titlePage = isTitlePageFrontMatter(outsideBlocks);
    warnings.push({
      code: titlePage ? "FRONT_MATTER_EXCLUDED" : "TEXT_OUTSIDE_SCENE",
      message: titlePage
        ? "Title-page text was excluded from production scene review."
        : "Some screenplay text appears before the first scene heading.",
      sourceIds: outsideBlocks.map((block) => block.id),
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
