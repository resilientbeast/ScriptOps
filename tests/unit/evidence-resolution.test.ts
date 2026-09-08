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
  it("keeps only clean, sentence-level excerpts instead of navigation or markdown noise", () => {
    const evidence = normalizeProductionEvidence({
      search_id: "clean",
      session_id: "session-clean",
      results: [
        {
          title: "New Mexico Film Office",
          url: "https://nmfilm.com/production",
          excerpts: [
            "Skip To Content # **Where History Gets Made** [Subscribe](https://nmfilm.com/newsletter)",
            "Productions should confirm permit requirements before scheduling road control.",
          ],
        },
      ],
    }, input, "2026-09-05T01:00:00.000Z");

    expect(evidence.records[0]?.excerpt).toBe(
      "Productions should confirm permit requirements before scheduling road control.",
    );
    expect(evidence.records[0]?.excerpt).not.toContain("[");
    expect(evidence.records[0]?.excerpt).not.toContain("Subscribe");
  });

  it("omits generic marketing copy that does not state a production constraint", () => {
    const evidence = normalizeProductionEvidence({
      search_id: "relevance",
      session_id: "session-relevance",
      results: [
        {
          title: "New Mexico Film Office",
          url: "https://nmfilm.com/",
          excerpts: ["Bring your film to life in New Mexico. It pays to film in New Mexico."],
        },
        {
          title: "Permit guidance",
          url: "https://nmfilm.com/permits",
          excerpts: ["Productions should confirm permit requirements before scheduling road control."],
        },
      ],
    }, input, "2026-09-05T01:00:00.000Z");

    expect(evidence.records).toHaveLength(1);
    expect(evidence.records[0]?.title).toBe("Permit guidance");
  });

  it("drops title-only excerpts and duplicate NM Film Office path variants", () => {
    const evidence = normalizeProductionEvidence({
      search_id: "distinct",
      session_id: "session-distinct",
      results: [
        {
          title: "Labor Law | New Mexico Film Office",
          url: "https://nmfilm.com/whynewmexico/filmmaker-resources/permits-procedures/labor-law",
          excerpts: ["Employers must obtain a child performer pre-authorization certificate before employment begins."],
        },
        {
          title: "Labor Law | New Mexico Film Office",
          url: "https://nmfilm.com/filmmaker-resources/permits-procedures/labor-law",
          excerpts: ["Children in New Mexico may be employed by production companies under special guidelines."],
        },
        {
          title: "Labor Law - New Mexico Department of Workforce Solutions",
          url: "https://www.dws.nm.gov/Portals/0/DM/LaborRelations/Child_Labor_Law.pdf",
          excerpts: ["Labor Law - New Mexico Department of Workforce Solutions"],
        },
        {
          title: "Permit information",
          url: "https://nmfilm.com/filmmaker-resources/permits-procedures/permit-information",
          excerpts: ["Permits are required for production on federal, state-owned, and tribal properties and lands."],
        },
      ],
    }, input, "2026-09-05T01:00:00.000Z");

    expect(evidence.records).toHaveLength(2);
    expect(evidence.records.map((record) => record.title)).toEqual([
      "Labor Law | New Mexico Film Office",
      "Permit information",
    ]);
  });

  it("rejects an empty usable result set at the schema gate", () => {
    expect(() => normalizeProductionEvidence({ search_id: "empty", session_id: "session-empty", results: [] }, input, "2026-09-05T01:00:00.000Z")).toThrow();
  });
});
