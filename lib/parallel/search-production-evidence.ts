import "server-only";

import { createHash } from "node:crypto";

import Parallel from "parallel-web";
import type { SearchResult } from "parallel-web/resources";

import { evidenceFallbackFixture } from "@/lib/domain/fixtures";
import { evidenceBundleSchema } from "@/lib/domain/schemas";
import type { EvidenceBundle } from "@/lib/domain/types";
import type {
  EvidenceCacheStore,
  EvidenceResearchInput,
} from "@/lib/firestore/evidence-cache";

export type EvidenceResolverDependencies = {
  cache: EvidenceCacheStore;
  search: (input: EvidenceResearchInput) => Promise<SearchResult>;
  ttlHours: number;
  now?: () => Date;
};

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function evidenceId(url: string): string {
  return `evidence-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`;
}

function sourceKey(urlValue: string): string {
  const url = new URL(urlValue);
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";

  // NM Film Office exposes some resource pages both below /whynewmexico and
  // at the canonical root path. They are one source, not two citations.
  if (url.hostname.endsWith("nmfilm.com")) {
    url.pathname = url.pathname.replace(/^\/whynewmexico(?=\/filmmaker-resources\/)/, "");
  }

  return `${url.origin}${url.pathname}`;
}

const navigationNoise = /\b(skip to content|subscribe|newsletter|conference|where history gets made|sign up|follow us)\b/i;
const productionEvidenceTerms = /\b(permit|production|road|child|minor|labor|safety|stunt|weather|rain|night|location|compliance|authorization)\b/i;

function cleanExcerpt(excerpts: string[], title: string): string | null {
  const normalizedTitle = title.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const sentences = excerpts.flatMap((excerpt) => {
    const text = excerpt
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/[`*_>#|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.match(/[^.!?]+[.!?]+/g) ?? [text];
  });
  const usable = sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .find((sentence) =>
      sentence.length >= 40 &&
      !navigationNoise.test(sentence) &&
      productionEvidenceTerms.test(sentence) &&
      sentence.replace(/[^a-z0-9]+/gi, "").toLowerCase() !== normalizedTitle,
    );

  return usable?.slice(0, 700) ?? null;
}

export function normalizeProductionEvidence(
  response: SearchResult,
  input: EvidenceResearchInput,
  retrievedAt: string,
): EvidenceBundle {
  const seen = new Set<string>();
  const records = response.results.flatMap((result, index) => {
    const url = canonicalUrl(result.url);
    const title = result.title?.trim() || (url ? new URL(url).hostname : "");
    const excerpt = cleanExcerpt(result.excerpts, title);
    if (!url || !excerpt) return [];
    const key = sourceKey(url);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: evidenceId(url),
      title,
      url,
      excerpt: excerpt.slice(0, 4_000),
      objective: input.objectives[index % input.objectives.length],
      query: input.searchQueries[index % input.searchQueries.length],
      retrievedAt,
      sourceMode: "live" as const,
    }];
  }).slice(0, input.maxResults);

  return evidenceBundleSchema.parse({
    sourceMode: "live",
    records,
    retrievedAt,
    parallelRequestId: response.search_id,
  });
}

export function validateProductionEvidenceCoverage(evidence: EvidenceBundle): EvidenceBundle {
  const text = JSON.stringify(evidence.records).toLowerCase();
  const hasOfficialNewMexicoSource = evidence.records.some((record) =>
    new URL(record.url).hostname.endsWith("nmfilm.com"),
  );
  const hasRequiredTopics = ["new mexico", "permit", "child", "stunt"].every((term) =>
    text.includes(term),
  );
  if (!hasOfficialNewMexicoSource || !hasRequiredTopics) {
    throw new Error("EVIDENCE_COVERAGE_INCOMPLETE");
  }
  return evidence;
}

export function createParallelSearch(
  apiKey: string,
  timeoutMs: number,
): (input: EvidenceResearchInput) => Promise<SearchResult> {
  const client = new Parallel({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
    logLevel: "off",
  });
  return (input) =>
    client.search({
      objective: input.objectives.join(" "),
      search_queries: input.searchQueries,
      mode: "basic",
      max_chars_total: 8_000,
      advanced_settings: {
        location: "US",
        max_results: input.maxResults,
        excerpt_settings: { max_chars_per_result: 1_200 },
        fetch_policy: {
          max_age_seconds: 600,
          timeout_seconds: Math.max(1, Math.floor(timeoutMs / 1_000)),
          disable_cache_fallback: true,
        },
      },
    });
}

export async function resolveProductionEvidence(
  input: EvidenceResearchInput,
  dependencies: EvidenceResolverDependencies,
): Promise<EvidenceBundle> {
  const now = dependencies.now?.() ?? new Date();
  try {
    const response = await dependencies.search(input);
    const live = validateProductionEvidenceCoverage(
      normalizeProductionEvidence(response, input, now.toISOString()),
    );
    await dependencies.cache.write(input, live, dependencies.ttlHours, now);
    return live;
  } catch {
    const cached = await dependencies.cache.read(input, now).catch(() => null);
    if (cached) return evidenceBundleSchema.parse(cached);
    return evidenceBundleSchema.parse(evidenceFallbackFixture.evidence);
  }
}
