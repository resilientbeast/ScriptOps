import type { SearchResult } from "parallel-web/resources";

import {
  parallelSmokeResultSchema,
  type ParallelSmokeResult,
} from "@/lib/providers/contracts";

export const PARALLEL_SMOKE_OBJECTIVE =
  "Find current, authoritative production constraints in New Mexico that affect a rainy night road exterior with a child performer and stunt driving.";

export const PARALLEL_SMOKE_QUERIES = [
  "New Mexico child performer film rules",
  "New Mexico film road closure permits",
  "New Mexico film stunt safety night shoot",
] as const;

function fallbackTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Untitled source";
  }
}

export function normalizeParallelSearch(
  response: SearchResult,
  retrievedAt: string,
): ParallelSmokeResult {
  const query = PARALLEL_SMOKE_QUERIES.join(" | ");
  const evidence = response.results.slice(0, 8).map((result, index) => ({
    id: `${response.search_id}:${index + 1}`,
    title: result.title?.trim() || fallbackTitle(result.url),
    url: result.url,
    excerpt: result.excerpts.filter(Boolean).join("\n\n").trim(),
    objective: PARALLEL_SMOKE_OBJECTIVE,
    query,
    retrievedAt,
    sourceMode: "live" as const,
  }));

  return parallelSmokeResultSchema.parse({
    attribution: "Parallel Search",
    requestId: response.search_id,
    sessionId: response.session_id,
    objective: PARALLEL_SMOKE_OBJECTIVE,
    searchQueries: [...PARALLEL_SMOKE_QUERIES],
    retrievedAt,
    sourceMode: "live",
    evidence,
  });
}
