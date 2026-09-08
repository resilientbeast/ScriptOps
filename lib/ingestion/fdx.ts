import { XMLParser, XMLValidator } from "fast-xml-parser";

import {
  assertWithinByteLimit,
  createSourceSpan,
  MAX_EXTRACTED_SCENES,
  type IngestionWarning,
  type ParsedScene,
  type ParsedScreenplay,
  type SourceBlock,
  ScreenplayIngestionError,
} from "@/lib/ingestion/contracts";

type OrderedXmlNode = Record<string, unknown>;

const sceneHeadingType = "scene heading";

function asNodes(value: unknown): OrderedXmlNode[] {
  return Array.isArray(value)
    ? value.filter(
        (candidate): candidate is OrderedXmlNode =>
          candidate !== null && typeof candidate === "object" && !Array.isArray(candidate),
      )
    : [];
}

function textFromNodes(nodes: OrderedXmlNode[]): string {
  const fragments: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      fragments.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    Object.entries(value).forEach(([name, child]) => {
      if (name !== ":@") visit(child);
    });
  };
  visit(nodes);
  return fragments.join("").replace(/\s+/g, " ").trim();
}

function attributes(node: OrderedXmlNode): Record<string, string> {
  const attributeNode = node[":@"];
  if (!attributeNode || typeof attributeNode !== "object") return {};
  return Object.fromEntries(
    Object.entries(attributeNode).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function collectParagraphs(value: unknown, output: Array<{ type: string; text: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((child) => collectParagraphs(child, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as OrderedXmlNode;

  Object.entries(node).forEach(([name, child]) => {
    if (name === "Paragraph") {
      const nodes = asNodes(child);
      output.push({
        type: attributes(node)["@_Type"]?.trim().toLowerCase() ?? "",
        text: textFromNodes(nodes),
      });
      return;
    }
    if (name !== ":@") collectParagraphs(child, output);
  });
}

function parseDisplayNumber(heading: string): string | null {
  return /^(\d+[A-Z]?)\s*[.:-]\s*/i.exec(heading)?.[1]?.toUpperCase() ?? null;
}

function buildScenes(blocks: SourceBlock[]): {
  scenes: ParsedScene[];
  warnings: IngestionWarning[];
} {
  const scenes: ParsedScene[] = [];
  const warnings: IngestionWarning[] = [];
  let activeScene: ParsedScene | null = null;
  const outsideSourceIds: string[] = [];

  for (const block of blocks) {
    const isHeading = block.id.includes(":heading:");
    if (isHeading) {
      if (scenes.length >= MAX_EXTRACTED_SCENES) {
        throw new ScreenplayIngestionError(
          "SCENE_LIMIT_EXCEEDED",
          `Screenplays may contain at most ${MAX_EXTRACTED_SCENES} extracted scenes.`,
        );
      }
      activeScene = {
        id: `scene-${scenes.length + 1}`,
        ordinal: scenes.length + 1,
        displayNumber: parseDisplayNumber(block.text),
        heading: block.text,
        sourceText: block.text,
        sourceSpans: [createSourceSpan(block)],
      };
      scenes.push(activeScene);
      continue;
    }

    if (!block.text) continue;
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
      "No Final Draft scene headings were found in this screenplay.",
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

export function parseFdxScreenplay(bytes: Uint8Array): ParsedScreenplay {
  assertWithinByteLimit(bytes);
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ScreenplayIngestionError(
      "FDX_INVALID_ENCODING",
      "Final Draft files must be valid UTF-8 XML.",
    );
  }
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    throw new ScreenplayIngestionError(
      "FDX_DTD_FORBIDDEN",
      "Final Draft files containing DTD or entity declarations are not supported.",
    );
  }
  if (XMLValidator.validate(xml) !== true) {
    throw new ScreenplayIngestionError(
      "FDX_INVALID_XML",
      "This Final Draft file is not well-formed XML.",
    );
  }

  let document: OrderedXmlNode[];
  try {
    document = asNodes(
      new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        processEntities: false,
        maxNestedTags: 50,
      }).parse(xml),
    );
  } catch {
    throw new ScreenplayIngestionError(
      "FDX_INVALID_XML",
      "This Final Draft file is not well-formed XML.",
    );
  }
  if (!document.some((node) => "FinalDraft" in node)) {
    throw new ScreenplayIngestionError(
      "FDX_STRUCTURE_INVALID",
      "This XML file is not a Final Draft screenplay.",
    );
  }

  const paragraphs: Array<{ type: string; text: string }> = [];
  collectParagraphs(document, paragraphs);
  const blocks = paragraphs.map((paragraph, index) => ({
    id: `fdx:paragraph:${index + 1}${paragraph.type === sceneHeadingType ? ":heading:" : ":text:"}`,
    page: null,
    blockIndex: index,
    text: paragraph.text,
  }));
  const { scenes, warnings } = buildScenes(blocks);
  return { format: "fdx", blocks, scenes, warnings };
}
