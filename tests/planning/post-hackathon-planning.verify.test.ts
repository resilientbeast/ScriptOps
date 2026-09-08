import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { planningFixture, planningNow } from "@/tests/fixtures/planning";
import { parseUploadedScreenplay } from "@/lib/ingestion/worker";
import { acceptSceneReviewDraft, createSceneReviewDraft } from "@/lib/scripts/scene-review";
import { planningRevision, planningStages, runPlanningStage, type PlanningProviders, type StageOutputs } from "@/lib/planning/generation";
import { initialPlanDraftSchema } from "@/lib/planning/schemas";
import { readPlanningPricing } from "@/lib/planning/limits";
import { readAgentRuntimeEnv } from "@/lib/env";

vi.mock("server-only", () => ({}));

// Original synthetic scripts authored for PH09, CC0. No uploaded/private material.
const corpus = [
  { name: "empty-desert", people: false, headings: ["1. EXT. DESERT - DAY", "2. EXT. RIDGE - DAY"], action: "Wind moves sand across empty ground. No people or vehicles appear." },
  { name: "clock-workshop", people: true, headings: ["12A. INT. WORKSHOP - DAY", "13. INT. SHOP - DAY"], action: "MARA, an adult clockmaker, repairs a clock while JO, her adult customer, watches." },
  { name: "community-rehearsal", people: true, headings: ["1. INT. COMMUNITY HALL - DAY", "2. EXT. COURTYARD - DAY", "3. INT. HALL - DAY"], action: "MARA and JO, two adult dancers, rehearse a slow duet. They carry chairs into the courtyard, then return to the hall." },
] as const;

let lastLiveProviderCallAt = 0;

async function paceLiveProviderCall(live: boolean): Promise<void> {
  if (!live) return;
  const configured = Number(process.env.PH09_PROVIDER_STAGE_INTERVAL_MS ?? "0");
  const intervalMs = Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 60_000) : 0;
  const waitMs = Math.max(0, lastLiveProviderCallAt + intervalMs - Date.now());
  if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastLiveProviderCallAt = Date.now();
}

async function corpusFixture(item: typeof corpus[number]) {
  const xml = `<FinalDraft><Content>${item.headings.map(heading => `<Paragraph Type="Scene Heading"><Text>${heading}</Text></Paragraph><Paragraph Type="Action"><Text>${item.action}</Text></Paragraph>`).join("")}</Content></FinalDraft>`;
  const parsed = await parseUploadedScreenplay("fdx", new TextEncoder().encode(xml));
  const review = createSceneReviewDraft("synthetic-script", parsed);
  const accepted = acceptSceneReviewDraft({ ...review, warnings: review.warnings.map(w => ({ ...w, acknowledged: true })) }, "synthetic-producer", 0);
  const f = planningFixture(item.headings.length, item.people);
  f.snapshot.revision = planningRevision(accepted);
  f.snapshot.projectTitle = item.name;
  f.plan.title = item.name;
  f.plan.scenes.forEach((scene, index) => {
    const source = accepted.scenes[index]!;
    scene.id = source.id; scene.heading = source.reviewedHeading; scene.displayNumber = source.displayNumber;
    scene.sourceFactIds = source.sourceSpans.map(span => span.sourceId);
    scene.sourceFacts = source.sourceSpans.map(span => {
      const block = parsed.screenplay.blocks.find(candidate => candidate.id === span.sourceId);
      if (!block) throw new Error("PH09_FIXTURE_SOURCE_MISSING");
      return { sourceId: span.sourceId, quote: block.text.slice(span.startOffset, span.endOffset) };
    });
  });
  f.plan.schedule.days[0]!.sceneIds = f.plan.scenes.map(scene => scene.id);
  return { ...f, blocks: parsed.screenplay.blocks };
}

async function verify(item: typeof corpus[number], live: boolean) {
  const f = await corpusFixture(item);
  let providers: PlanningProviders = f.providers;
  if (live) {
    const env = readAgentRuntimeEnv();
    f.snapshot.model = env.GEMINI_MODEL;
    f.snapshot.pricing = readPlanningPricing();
    const { createPlanningProviders } = await import("@/lib/planning/providers");
    providers = createPlanningProviders({ project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION, model: env.GEMINI_MODEL, parallelApiKey: env.PARALLEL_API_KEY, pricing: f.snapshot.pricing });
  }
  const outputs: StageOutputs = {};
  const started = Date.now();
  const runId = randomUUID();
  let tokens = 0, estimatedCostCents = 0, calls = 0;
  for (const stage of planningStages(f.snapshot)) {
    // Explicit test allowance: at most 60 provider stages and $15 reserved per script, no retries.
    if (++calls > 60) throw new Error("PH09_TEST_ALLOWANCE_EXHAUSTED");
    let result;
    let attemptedResult: Awaited<ReturnType<PlanningProviders["generate"]>> | undefined;
    const observedProviders: PlanningProviders = {
      generate: async (...args) => { await paceLiveProviderCall(live); attemptedResult = await providers.generate(...args); return attemptedResult; },
      research: async (...args) => { await paceLiveProviderCall(live); attemptedResult = await providers.research(...args); return attemptedResult; },
    };
    try {
      result = await runPlanningStage(f.snapshot, stage, outputs, f.blocks, observedProviders, live ? new Date() : planningNow);
    } catch (error) {
      // Never let Vitest print SDK request objects, authorization headers or credentials.
      const value = error as { name?: string; status?: number; code?: string | number; message?: string; issues?: Array<{ path: unknown; code: unknown; message: unknown }> };
      const status = typeof value.status === "number" ? value.status : typeof value.code === "number" ? value.code : null;
      const code = value.message && /^(INITIAL_PLAN_|PH09_)[A-Z_]+$/.test(value.message) ? value.message : "PH09_PROVIDER_OR_VALIDATION_FAILURE";
      const hints = ["invalid_grant", "invalid_rapt", "PERMISSION_DENIED", "UNAUTHENTICATED", "INVALID_ARGUMENT", "response_schema", "responseJsonSchema", "additionalProperties", "thinking", "quota", "timeout"].filter(term => value.message?.includes(term));
      let providerMessage: string | undefined;
      if (status === 400 || status === 429) {
        try {
          const parsed = JSON.parse(value.message ?? "{}");
          providerMessage = typeof parsed.error?.message === "string" ? parsed.error.message : value.message;
        } catch { providerMessage = value.message; }
        if (providerMessage) {
          for (const [key, secret] of Object.entries(process.env)) if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key) && secret) providerMessage = providerMessage.replaceAll(secret, "[redacted]");
          providerMessage = providerMessage.slice(0, 1200);
        }
      }
      if (attemptedResult) { tokens += attemptedResult.usage.inputTokens + attemptedResult.usage.outputTokens; estimatedCostCents += attemptedResult.usage.estimatedCostCents ?? 0; }
      const failure = { case: item.name, stage, code, status, hints, providerMessage, issues: value.issues?.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })), tokens, estimatedCostCents, reservedCents: calls * 25, elapsedMs: Date.now() - started };
      if (live) {
        const directory = resolve("docs/post-hackathon/evidence");
        await mkdir(directory, { recursive: true });
        await writeFile(resolve(directory, `planning-failed-${item.name}-${runId}.json`), JSON.stringify({ ...failure, model: f.snapshot.model, version: f.snapshot.version, outputs, rejectedOutput: attemptedResult?.output }, null, 2));
      }
      console.info(JSON.stringify(failure));
      throw new Error(`${code}: ${item.name}/${stage}; HTTP ${status ?? "unknown"}`);
    }
    outputs[stage] = result.output;
    tokens += result.usage.inputTokens + result.usage.outputTokens;
    estimatedCostCents += result.usage.estimatedCostCents ?? 0;
    console.info(JSON.stringify({ check: "post-hackathon-planning", mode: live ? "live" : "fake", case: item.name, stage, usage: result.usage }));
  }
  const draft = initialPlanDraftSchema.parse(outputs.assemble);
  expect(draft.plan.scenes).toHaveLength(item.headings.length);
  if (!item.people) expect(draft.plan.casting).toHaveLength(0);
  expect(draft.plan.budget.high).toBeGreaterThan(0);
  if (live) {
    const directory = resolve("docs/post-hackathon/evidence");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, `planning-${item.name}-${randomUUID()}.json`), JSON.stringify({ case: item.name, model: f.snapshot.model, version: f.snapshot.version, pricing: f.snapshot.pricing, draft, research: outputs.research, tokens, estimatedCostCents, elapsedMs: Date.now() - started, humanQualityReview: "pending" }, null, 2));
  }
  console.info(JSON.stringify({ check: "post-hackathon-planning", mode: live ? "live" : "fake", case: item.name, scenes: draft.plan.scenes.length, sourceCoverage: "validated", elapsedMs: Date.now() - started, tokens, estimatedCostCents, reservedCents: calls * 25, humanQualityReview: "pending" }));
}

describe("PH09 local three-script planning contract", () => {
  it.each(corpus)("parses and drafts $name using fake providers", item => verify(item, false));
});

describe.skipIf(process.env.PH09_PROVIDER_TESTS !== "true")("PH09 explicit live provider quality capture", () => {
  it.each(corpus)("generates $name with live providers", item => verify(item, true), 600_000);
});
