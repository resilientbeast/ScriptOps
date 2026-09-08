import { beforeEach, describe, expect, it, vi } from "vitest";
import { planningFixture } from "@/tests/fixtures/planning";
import { shootingScheduleSchema } from "@/lib/planning/schemas";
import { createPlanningProviders } from "@/lib/planning/providers";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), search: vi.fn(), genaiConfig: vi.fn(), parallelConfig: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => ({ ThinkingLevel: { LOW: "LOW" }, GoogleGenAI: class {
  models = { generateContent: mocks.generate };
  constructor(config: unknown) { mocks.genaiConfig(config); }
} }));
vi.mock("parallel-web", () => ({ default: class {
  search = mocks.search;
  constructor(config: unknown) { mocks.parallelConfig(config); }
} }));

function providers(model = "test-model") {
  return createPlanningProviders({ project: "synthetic-test", location: "global", model, parallelApiKey: "fake-key", pricing: planningFixture().snapshot.pricing });
}
describe("planning provider boundaries (mock transport only)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses supported Gemini 3 thinking levels without deprecated sampling settings", async () => {
    mocks.generate.mockResolvedValue({ text: JSON.stringify(planningFixture().plan.schedule), candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 } });
    await providers("gemini-3.7-flash").generate("schedule", {}, shootingScheduleSchema);
    expect(mocks.generate.mock.calls[0]![0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(mocks.generate.mock.calls[0]![0].config).not.toHaveProperty("temperature");
  });
  it("uses bounded structured output, disables SDK retries, and records usage", async () => {
    mocks.generate.mockResolvedValue({ text: JSON.stringify(planningFixture().plan.schedule), candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100, thoughtsTokenCount: 50 } });
    const result = await providers().generate("schedule", { source: "Confidential screenplay" }, shootingScheduleSchema);
    expect(mocks.genaiConfig).toHaveBeenCalledWith(expect.objectContaining({ httpOptions: { retryOptions: { attempts: 1 }, timeout: 45_000 } }));
    expect(mocks.generate.mock.calls[0]![0].config).toMatchObject({ maxOutputTokens: 16_384, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 1024 } });
    expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 150 });
    expect(result.usage.estimatedCostCents).toBeGreaterThan(0);
  });
  it("rejects truncated output and oversize prompts without hidden retry", async () => {
    mocks.generate.mockResolvedValue({ text: "{}", candidates: [{ finishReason: "MAX_TOKENS" }] });
    const adapter = providers();
    await expect(adapter.generate("schedule", {}, shootingScheduleSchema)).rejects.toThrow("PROVIDER_INCOMPLETE");
    await expect(adapter.generate("schedule", { text: "x".repeat(180_000) }, shootingScheduleSchema)).rejects.toThrow("PROMPT_LIMIT");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("sends fixed research queries, disables fallback, and propagates provider failures", async () => {
    const f = planningFixture();
    f.snapshot.planningInputs.assumptions = ["MARA's secret contract"];
    mocks.search.mockRejectedValue(new Error("simulated provider failure"));
    await expect(providers().research(f.snapshot.planningInputs, ["permits", "costs"])).rejects.toThrow("simulated provider failure");
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.search.mock.calls[0])).not.toContain("MARA");
    expect(mocks.search.mock.calls[0]![0].advanced_settings.fetch_policy.disable_cache_fallback).toBe(true);
    expect(mocks.parallelConfig).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, logLevel: "off" }));
  });
});
