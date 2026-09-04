import "server-only";

import Parallel from "parallel-web";

import {
  type ParallelSmokeResult,
} from "@/lib/providers/contracts";
import {
  normalizeParallelSearch,
  PARALLEL_SMOKE_OBJECTIVE,
  PARALLEL_SMOKE_QUERIES,
} from "@/lib/providers/parallel-normalization";

export async function runParallelEvidenceSmoke(
  apiKey: string,
  timeoutMs: number,
): Promise<ParallelSmokeResult> {
  const client = new Parallel({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
    logLevel: "off",
  });
  const response = await client.search({
    objective: PARALLEL_SMOKE_OBJECTIVE,
    search_queries: [...PARALLEL_SMOKE_QUERIES],
    mode: "basic",
    max_chars_total: 8_000,
    advanced_settings: {
      location: "US",
      max_results: 8,
      excerpt_settings: { max_chars_per_result: 1_200 },
      fetch_policy: {
        max_age_seconds: 600,
        timeout_seconds: 10,
        disable_cache_fallback: true,
      },
    },
  });

  return normalizeParallelSearch(response, new Date().toISOString());
}
