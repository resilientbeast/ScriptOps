import { describe, expect, it } from "vitest";

import { AGENT_OUTPUT_KEYS, breakdownAgentOutputSchema, parseAgentOutput } from "@/lib/agents/contracts";
import { approvedExampleFixture } from "@/lib/domain/fixtures";

describe("Revision Ripple agent contracts", () => {
  it("gives every workflow result a distinct state key", () => {
    const keys = Object.values(AGENT_OUTPUT_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("accepts a complete scene result and whole-document fenced JSON", () => {
    const value = {
      accepted: true,
      revisedScene: approvedExampleFixture.proposal.impacts.breakdown.after,
      reasons: ["The scene changes time, weather, cast, and vehicle action."],
      assumptions: ["Production-specific checks remain pending."],
    };
    const parsed = parseAgentOutput(breakdownAgentOutputSchema, `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``);
    expect(parsed.accepted).toBe(true);
    expect(parsed.revisedScene.id).toBe("scene-14");
  });

  it("fails a partial scene result instead of allowing a partial proposal", () => {
    expect(() => breakdownAgentOutputSchema.parse({ accepted: true })).toThrow();
  });
});
