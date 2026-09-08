import { createHash } from "node:crypto";

import type { ParsedScreenplay } from "@/lib/ingestion/contracts";
import { parseFdxScreenplay } from "@/lib/ingestion/fdx";
import { parsePdfScreenplay } from "@/lib/ingestion/pdf";

export type ParsedScriptManifest = {
  parserVersion: "ph07-v1";
  format: "pdf" | "fdx";
  blockCount: number;
  sceneCount: number;
  sourceCoverage: "complete" | "partial";
  warnings: ParsedScreenplay["warnings"];
  contentHash: string;
  screenplay: ParsedScreenplay;
};

export async function parseUploadedScreenplay(
  format: "pdf" | "fdx",
  bytes: Uint8Array,
): Promise<ParsedScriptManifest> {
  const screenplay = format === "pdf"
    ? await parsePdfScreenplay(bytes)
    : parseFdxScreenplay(bytes);
  return {
    parserVersion: "ph07-v1",
    format,
    blockCount: screenplay.blocks.length,
    sceneCount: screenplay.scenes.length,
    sourceCoverage: screenplay.warnings.some((warning) => warning.code === "PAGE_TEXT_MISSING") ? "partial" : "complete",
    warnings: screenplay.warnings,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    screenplay,
  };
}

export async function parseAndPersistUploadedScreenplay(
  input: { projectId: string; scriptId: string; format: "pdf" | "fdx"; bytes: Uint8Array },
  store: { save(projectId: string, scriptId: string, manifest: ParsedScriptManifest): Promise<unknown> },
): Promise<ParsedScriptManifest> {
  const manifest = await parseUploadedScreenplay(input.format, input.bytes);
  await store.save(input.projectId, input.scriptId, manifest);
  return manifest;
}
