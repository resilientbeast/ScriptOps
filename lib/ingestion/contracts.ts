export const MAX_SCREENPLAY_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 150;
export const MAX_EXTRACTED_SCENES = 200;

export type ScreenplayFormat = "fdx" | "pdf";

export type SourceSpan = {
  sourceId: string;
  page: number | null;
  blockIndex: number;
  startOffset: number;
  endOffset: number;
};

export type SourceBlock = {
  id: string;
  page: number | null;
  blockIndex: number;
  text: string;
};

export type ParsedScene = {
  id: string;
  ordinal: number;
  displayNumber: string | null;
  heading: string;
  sourceText: string;
  sourceSpans: SourceSpan[];
};

export type IngestionWarning = {
  code: "SCENE_NUMBER_MISSING" | "TEXT_OUTSIDE_SCENE" | "PAGE_TEXT_MISSING";
  message: string;
  sourceIds: string[];
};

export type ParsedScreenplay = {
  format: ScreenplayFormat;
  blocks: SourceBlock[];
  scenes: ParsedScene[];
  warnings: IngestionWarning[];
};

export class ScreenplayIngestionError extends Error {
  constructor(
    readonly code:
      | "FILE_TOO_LARGE"
      | "PDF_SIGNATURE_INVALID"
      | "PDF_ENCRYPTED"
      | "PDF_UNREADABLE"
      | "PDF_PAGE_LIMIT_EXCEEDED"
      | "FDX_INVALID_ENCODING"
      | "FDX_DTD_FORBIDDEN"
      | "FDX_INVALID_XML"
      | "FDX_STRUCTURE_INVALID"
      | "SCENE_LIMIT_EXCEEDED"
      | "SCENE_HEADINGS_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "ScreenplayIngestionError";
  }
}

export function assertWithinByteLimit(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_SCREENPLAY_BYTES) {
    throw new ScreenplayIngestionError(
      "FILE_TOO_LARGE",
      `Screenplay files must be ${MAX_SCREENPLAY_BYTES / 1024 / 1024} MB or smaller.`,
    );
  }
}

export function createSourceSpan(block: SourceBlock): SourceSpan {
  return {
    sourceId: block.id,
    page: block.page,
    blockIndex: block.blockIndex,
    startOffset: 0,
    endOffset: block.text.length,
  };
}
