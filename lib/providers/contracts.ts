import { z } from "zod";

export const BREAKDOWN_SMOKE_PROMPT =
  "For scene-14, move a daytime desert road scene to a rainy night exterior, add a child witness, and require stunt driving. Produce the structured breakdown impact.";

export const breakdownSmokeResultSchema = z.object({
  sceneId: z.literal("scene-14"),
  timeOfDay: z.literal("night"),
  weather: z.literal("rain"),
  childWitnessRequired: z.literal(true),
  stuntDrivingRequired: z.literal(true),
  productionImplications: z.array(z.string().trim().min(1)).min(4).max(8),
  summary: z.string().trim().min(1).max(500),
});

export type BreakdownSmokeResult = z.infer<typeof breakdownSmokeResultSchema>;

export class BreakdownSmokeContractError extends Error {
  readonly issuePaths: string[];

  constructor(issuePaths: string[]) {
    super("GEMINI_OUTPUT_INVALID");
    this.name = "BreakdownSmokeContractError";
    this.issuePaths = [...new Set(issuePaths)].sort();
  }
}

export function parseBreakdownSmokeResult(
  input: unknown,
): BreakdownSmokeResult {
  const parsed = breakdownSmokeResultSchema.safeParse(input);

  if (!parsed.success) {
    throw new BreakdownSmokeContractError(
      parsed.error.issues.map((issue) => issue.path.join(".") || "$"),
    );
  }

  return parsed.data;
}

export function parseBreakdownSmokeJson(text: string): BreakdownSmokeResult {
  let input: unknown;
  const trimmed = text.trim();

  try {
    input = JSON.parse(trimmed);
  } catch {
    const fencedJson = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);

    if (!fencedJson) {
      throw new BreakdownSmokeContractError(["$json"]);
    }

    try {
      input = JSON.parse(fencedJson[1]);
    } catch {
      throw new BreakdownSmokeContractError(["$json"]);
    }
  }

  return parseBreakdownSmokeResult(input);
}

export function getBreakdownSmokeIssuePaths(error: unknown): string[] {
  return error instanceof BreakdownSmokeContractError ? error.issuePaths : [];
}

export const evidenceRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  excerpt: z.string().min(1),
  objective: z.string().min(1),
  query: z.string().min(1),
  retrievedAt: z.iso.datetime(),
  sourceMode: z.literal("live"),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

export const parallelSmokeResultSchema = z.object({
  attribution: z.literal("Parallel Search"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  objective: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(1).max(4),
  retrievedAt: z.iso.datetime(),
  sourceMode: z.literal("live"),
  evidence: z.array(evidenceRecordSchema).min(1).max(8),
});

export type ParallelSmokeResult = z.infer<typeof parallelSmokeResultSchema>;
