import { describe, expect, it } from "vitest";

import {
  breakdownSmokeResultSchema,
  getBreakdownSmokeIssuePaths,
  parseBreakdownSmokeJson,
  parseBreakdownSmokeResult,
} from "@/lib/providers/contracts";
import {
  normalizeParallelSearch,
  PARALLEL_SMOKE_OBJECTIVE,
} from "@/lib/providers/parallel-normalization";

describe("provider smoke contracts", () => {
  it("requires every golden Scene 14 breakdown signal", () => {
    const result = breakdownSmokeResultSchema.safeParse({
      sceneId: "scene-14",
      timeOfDay: "night",
      weather: "rain",
      childWitnessRequired: true,
      stuntDrivingRequired: false,
      productionImplications: ["night", "rain", "child", "stunt"],
      summary: "A complete production breakdown.",
    });

    expect(result.success).toBe(false);
  });

  it("reports only safe field paths for invalid Gemini output", () => {
    try {
      parseBreakdownSmokeResult({
        sceneId: "scene-14",
        timeOfDay: "rainy night",
      });
    } catch (error) {
      expect(getBreakdownSmokeIssuePaths(error)).toEqual([
        "childWitnessRequired",
        "productionImplications",
        "stuntDrivingRequired",
        "summary",
        "timeOfDay",
        "weather",
      ]);
    }
  });

  it("uses a safe marker when Gemini output is not JSON", () => {
    try {
      parseBreakdownSmokeJson("not-json");
    } catch (error) {
      expect(getBreakdownSmokeIssuePaths(error)).toEqual(["$json"]);
    }
  });

  it("accepts only a whole fenced JSON object as a compatibility fallback", () => {
    const result = parseBreakdownSmokeJson(`\`\`\`json
{
  "sceneId": "scene-14",
  "timeOfDay": "night",
  "weather": "rain",
  "childWitnessRequired": true,
  "stuntDrivingRequired": true,
  "productionImplications": ["night", "rain", "child", "stunt"],
  "summary": "A complete proposed breakdown."
}
\`\`\``);

    expect(result.sceneId).toBe("scene-14");
  });

  it("rejects prose surrounding an otherwise valid fenced object", () => {
    expect(() =>
      parseBreakdownSmokeJson(`Result:\n\`\`\`json\n{}\n\`\`\``),
    ).toThrow("GEMINI_OUTPUT_INVALID");
  });

  it("normalizes live Parallel results with visible attribution and provenance", () => {
    const retrievedAt = "2026-08-28T10:00:00.000Z";
    const result = normalizeParallelSearch(
      {
        search_id: "search_test",
        session_id: "session_test",
        results: [
          {
            title: "New Mexico Film Office",
            url: "https://nmfilm.com/production/",
            excerpts: ["Current production guidance."],
          },
        ],
      },
      retrievedAt,
    );

    expect(result).toMatchObject({
      attribution: "Parallel Search",
      requestId: "search_test",
      objective: PARALLEL_SMOKE_OBJECTIVE,
      retrievedAt,
      sourceMode: "live",
    });
    expect(result.evidence[0]).toMatchObject({
      title: "New Mexico Film Office",
      url: "https://nmfilm.com/production/",
      excerpt: "Current production guidance.",
      retrievedAt,
      sourceMode: "live",
    });
    expect(result.evidence[0].query).toContain("New Mexico");
  });
});
