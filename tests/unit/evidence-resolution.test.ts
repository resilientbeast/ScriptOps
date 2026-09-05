import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evidenceFallbackFixture } from "@/lib/domain/fixtures";
import type { EvidenceBundle } from "@/lib/domain/types";
import type { EvidenceCacheStore, EvidenceResearchInput } from "@/lib/firestore/evidence-cache";
import { normalizeProductionEvidence, resolveProductionEvidence } from "@/lib/parallel/search-production-evidence";

const input: EvidenceResearchInput = {
  region: "New Mexico",
  objectives: ["Check current production constraints."],
  searchQueries: ["New Mexico film permits"],
  maxResults: 3,
};

function cache(initial: EvidenceBundle | null = null): EvidenceCacheStore & { written: EvidenceBundle | null } {
  return {
    written: null,
    async read() { return initial; },
    async write(_input, evidence) { this.written = evidence; },
  };
}

describe("production evidence resolution", () => {
  beforeAll(() => {
    expect(evidenceFallbackFixture.evidence.records.length).toBeGreaterThan(0);
  });

  it("normalizes, deduplicates, and caches live Parallel evidence", async () => {
    const store = cache();
    const result = await resolveProductionEvidence(input, {
      cache: store,
      ttlHours: 72,
      now: () => new Date("2026-09-05T01:00:00.000Z"),
      search: async () => ({
        search_id: "search-live",
        session_id: "session-live",
        results: [
          { title: "Permit guidance", url: "https://nmfilm.com/permits#top", excerpts: ["Current New Mexico permit, child performer, and stunt safety guidance."] },
          { title: "Duplicate", url: "https://nmfilm.com/permits", excerpts: ["Duplicate."] },
          { title: "Unsafe", url: "javascript:alert(1)", excerpts: ["Ignore."] },
        ],
      }),
    });

    expect(result.sourceMode).toBe("live");
    expect(result.records).toHaveLength(1);
    expect(result.records[0].id).toMatch(/^evidence-[a-f0-9]{12}$/);
    expect(store.written).toEqual(result);
  });

  it("uses a valid cache after a live attempt fails", async () => {
    const cached = evidenceFallbackFixture.evidence;
    const result = await resolveProductionEvidence(input, {
      cache: cache(cached),
      ttlHours: 72,
      search: async () => { throw new Error("provider unavailable"); },
    });
    expect(result).toEqual(cached);
    expect(result.sourceMode).toBe("cached");
  });

  it("uses the visibly cached bundle when live and cache both fail", async () => {
    const result = await resolveProductionEvidence(input, {
      cache: {
        read: async () => { throw new Error("cache unavailable"); },
        write: async () => undefined,
      },
      ttlHours: 72,
      search: async () => { throw new Error("provider unavailable"); },
    });
    expect(result).toEqual(evidenceFallbackFixture.evidence);
    expect(result.records.every((record) => record.sourceMode === "cached")).toBe(true);
  });
});

describe("live evidence normalization", () => {
  it("rejects an empty usable result set at the schema gate", () => {
    expect(() => normalizeProductionEvidence({ search_id: "empty", session_id: "session-empty", results: [] }, input, "2026-09-05T01:00:00.000Z")).toThrow();
  });
});
