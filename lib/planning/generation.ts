import { createHash } from "node:crypto";
import { z } from "zod";
import { measureJsonBytes, MAX_PERSISTED_DOCUMENT_BYTES } from "@/lib/domain/invariants";
import type { SourceBlock } from "@/lib/ingestion/contracts";
import { createInitialPlanDraft } from "@/lib/planning/initial-plan";
import { castingBriefSchema, initialBudgetSchema, locationCandidateSchema, planningSceneSchema, shootingScheduleSchema, type PlanningInputs } from "@/lib/planning/schemas";
import { requiredResearchTopics, validatePlanningEvidence } from "@/lib/planning/planning-evidence";
import { acceptedSceneRevisionSchema, type AcceptedSceneRevision } from "@/lib/scripts/schemas";
import type { SceneReviewRevision } from "@/lib/scripts/scene-review-state";
import type { PlanningPricing } from "@/lib/planning/limits";

export const PLANNING_VERSION = "initial-v6";
export const BATCH_SIZE = 5;
export const MAX_PROMPT_BYTES = 180_000;
export const MAX_OUTPUT_TOKENS = 16_384;
export type PlanningSnapshot = { projectTitle: string; revision: AcceptedSceneRevision; planningInputs: PlanningInputs; model: string; version: typeof PLANNING_VERSION; pricing: PlanningPricing };
export type StageUsage = { inputTokens: number; outputTokens: number; elapsedMs: number; estimatedCostCents?: number };
export type StageResult = { output: unknown; usage: StageUsage };
export type PlanningProviders = {
  generate(stage: string, data: unknown, schema: z.ZodType): Promise<StageResult>;
  research(inputs: PlanningInputs, topics: ReturnType<typeof requiredResearchTopics>): Promise<StageResult>;
};
export type StageOutputs = Record<string, unknown>;
const breakdownSchema = z.object({ scenes: z.array(planningSceneSchema).min(1).max(BATCH_SIZE) }).strict();
const normalizationSchema = z.object({ scenes: z.array(planningSceneSchema).min(1).max(200), roles: z.array(castingBriefSchema).max(100), locations: z.array(z.string().min(1).max(300)).max(200), assumptions: z.array(z.string().min(1).max(1000)).max(30) }).strict();
const locationsSchema = z.object({ locations: z.array(locationCandidateSchema).min(1).max(50) }).strict();
const castingSchema = z.object({ casting: z.array(castingBriefSchema).max(100) }).strict();

export function planningRevision(review: SceneReviewRevision): AcceptedSceneRevision {
  if (review.status !== "accepted") throw new Error("INITIAL_PLAN_SCENES_NOT_ACCEPTED");
  return acceptedSceneRevisionSchema.parse({ id: review.id, scriptVersionId: review.scriptVersionId, parentRevisionId: review.parentRevisionId, editVersion: review.editVersion, status: review.status, scenes: review.scenes, sceneManifestHash: createHash("sha256").update(JSON.stringify(review.scenes)).digest("hex"), acknowledgedWarningIds: review.warnings.filter(w => w.acknowledged).map(w => w.id), acceptedBy: review.acceptedBy, acceptedAt: review.acceptedAt });
}

export function planningStages(snapshot: PlanningSnapshot): string[] {
  return [...Array.from({ length: Math.ceil(snapshot.revision.scenes.length / BATCH_SIZE) }, (_, i) => `breakdown-${i}`), "normalize", "research", "schedule", "budget", "locations", "casting", "assemble"];
}

function sourceScenes(snapshot: PlanningSnapshot, blocks: SourceBlock[], index: number) {
  const byId = new Map(blocks.map(block => [block.id, block]));
  return snapshot.revision.scenes.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE).map(scene => ({
    ...scene, sources: scene.sourceSpans.map(span => {
      const block = byId.get(span.sourceId);
      if (!block || block.blockIndex !== span.blockIndex || block.page !== span.page || span.endOffset > block.text.length || span.startOffset >= span.endOffset) throw new Error("INITIAL_PLAN_SOURCE_MISSING");
      return { id: span.sourceId, text: block.text.slice(span.startOffset, span.endOffset) };
    }),
  }));
}

function validateScenes(scenes: z.infer<typeof planningSceneSchema>[], expected: AcceptedSceneRevision["scenes"]) {
  if (scenes.length !== expected.length) throw new Error("INITIAL_PLAN_SCENE_COVERAGE");
  scenes.forEach((scene, index) => {
    const source = expected[index]!;
    const facts = [...new Set(source.sourceSpans.map(span => span.sourceId))];
    if (scene.id !== source.id || scene.heading !== source.reviewedHeading || scene.displayNumber !== source.displayNumber || scene.sourceFactIds.length !== facts.length || new Set(scene.sourceFactIds).size !== facts.length || scene.sourceFactIds.some(id => !facts.includes(id))) throw new Error("INITIAL_PLAN_SOURCE_MISMATCH");
  });
}

/**
 * PDF extraction can produce many source blocks for a single screenplay scene.
 * The accepted review is the authority for that complete provenance set: Gemini
 * supplies grounded facts, while the server restores every source ID after
 * checking the scene identity. This keeps long scenes traceable without asking
 * a model to reproduce hundreds of opaque block IDs.
 */
function restoreSourceFactIds(scenes: z.infer<typeof planningSceneSchema>[], expected: AcceptedSceneRevision["scenes"]) {
  if (scenes.length !== expected.length) throw new Error("INITIAL_PLAN_SCENE_COVERAGE");
  return scenes.map((scene, index) => {
    const source = expected[index]!;
    if (scene.id !== source.id || scene.heading !== source.reviewedHeading || scene.displayNumber !== source.displayNumber) throw new Error("INITIAL_PLAN_SOURCE_MISMATCH");
    return { ...scene, sourceFactIds: [...new Set(source.sourceSpans.map(span => span.sourceId))] };
  });
}

function normalizeSourceText(value: string) {
  return value.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Gemini can correctly copy a source quote but associate it with an adjacent
 * PDF block. Rebind only uniquely matched quotes within the same reviewed
 * scene; an ambiguous or non-source quote remains a hard failure.
 */
function reconcileSourceFacts(scenes: z.infer<typeof planningSceneSchema>[], sourceScenesForBatch: ReturnType<typeof sourceScenes>) {
  return scenes.map((scene, index) => {
    const sources = sourceScenesForBatch[index]!.sources;
    return {
      ...scene,
      sourceFacts: scene.sourceFacts.map(fact => {
        const quote = normalizeSourceText(fact.quote);
        const current = sources.find(source => source.id === fact.sourceId);
        if (current && normalizeSourceText(current.text).includes(quote)) return fact;
        const matches = sources.filter(source => normalizeSourceText(source.text).includes(quote));
        if (matches.length !== 1) throw new Error("INITIAL_PLAN_SOURCE_FACT_INVALID");
        return { ...fact, sourceId: matches[0]!.id };
      }),
    };
  });
}

function validateSourceFacts(scenes: z.infer<typeof planningSceneSchema>[], sourceScenesForBatch: ReturnType<typeof sourceScenes>) {
  scenes.forEach((scene, index) => {
    const sourceTexts = new Map(sourceScenesForBatch[index]!.sources.map(source => [source.id, source.text]));
    if (scene.sourceFacts.some(fact => !sourceTexts.get(fact.sourceId) || !normalizeSourceText(sourceTexts.get(fact.sourceId)!).includes(normalizeSourceText(fact.quote)))) {
      throw new Error("INITIAL_PLAN_SOURCE_FACT_INVALID");
    }
  });
}

export async function runPlanningStage(snapshot: PlanningSnapshot, stage: string, outputs: StageOutputs, blocks: SourceBlock[], providers: PlanningProviders, now = new Date()): Promise<StageResult> {
  if (snapshot.version !== PLANNING_VERSION) throw new Error("INITIAL_PLAN_VERSION_MISMATCH");
  const stages = planningStages(snapshot);
  const index = stages.indexOf(stage);
  if (index < 0 || stages.slice(0, index).some(key => !(key in outputs))) throw new Error("INITIAL_PLAN_DEPENDENCY_MISSING");
  const generate = async (data: unknown, schema: z.ZodType) => {
    if (measureJsonBytes(data) > MAX_PROMPT_BYTES) throw new Error("INITIAL_PLAN_PROMPT_LIMIT");
    const result = await providers.generate(stage, data, schema);
    return { ...result, output: schema.parse(result.output) };
  };
  let result: StageResult;
  if (stage.startsWith("breakdown-")) {
    const batchIndex = Number(stage.slice(10));
    const sources = sourceScenes(snapshot, blocks, batchIndex);
    result = await generate({ scenes: sources, instruction: "Break down all source action, cast, vehicles, stunts, minors and equipment. Preserve ordered scene IDs, reviewed headings, and display numbers. Return one or more exact sourceFacts quotes copied from the supplied source text, each paired with its sourceId. The server maintains each scene's complete provenance ID set. Facts must be grounded in supplied source; label inferred needs in summaries. No invented cast for unpeopled scenes." }, breakdownSchema);
    const parsed = breakdownSchema.parse(result.output);
    const breakdown = { scenes: reconcileSourceFacts(restoreSourceFactIds(parsed.scenes, snapshot.revision.scenes.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE)), sources) };
    result.output = breakdown;
    validateScenes(breakdown.scenes, snapshot.revision.scenes.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE));
    validateSourceFacts(breakdown.scenes, sources);
  } else if (stage === "normalize") {
    const scenes = stages.filter(key => key.startsWith("breakdown-")).flatMap(key => breakdownSchema.parse(outputs[key]).scenes);
    result = await generate({ scenes, instruction: "Normalize shared cast role IDs and story location names across all scenes without losing any requirements or source facts. Preserve sourceFacts verbatim. Return shared role briefs (empty when appropriate), normalized scenes and distinct story locations. Explicitly state inferred assumptions. Do not state age, dialogue, casting, legal, labor, or availability facts unless an exact sourceFact supports it." }, normalizationSchema);
    const parsed = normalizationSchema.parse(result.output);
    const normalized = { ...parsed, scenes: restoreSourceFactIds(parsed.scenes, snapshot.revision.scenes) };
    result.output = normalized;
    validateScenes(normalized.scenes, snapshot.revision.scenes);
    normalized.scenes.forEach((scene, i) => {
      const original = scenes[i]!;
      if (scene.setting !== original.setting || scene.timeOfDay !== original.timeOfDay ||
        JSON.stringify(scene.sourceFacts) !== JSON.stringify(original.sourceFacts) ||
        ["vehicles", "stunts", "minors", "specialEquipment"].some(key => JSON.stringify(scene.requirements[key as "vehicles"]) !== JSON.stringify(original.requirements[key as "vehicles"])) ||
        (original.requirements.castRoleIds.length > 0 && scene.requirements.castRoleIds.length === 0)) throw new Error("INITIAL_PLAN_REQUIREMENTS_LOST");
    });
    const roles = new Set(normalized.roles.map(role => role.id));
    if (roles.size !== normalized.roles.length || normalized.scenes.some(scene => scene.requirements.castRoleIds.some(id => !roles.has(id)))) throw new Error("INITIAL_PLAN_ROLE_REFERENCE");
  } else {
    const normalized = normalizationSchema.parse(outputs.normalize);
    const topics = requiredResearchTopics(normalized.scenes);
    if (stage === "research") {
      result = await providers.research(snapshot.planningInputs, topics);
      result.output = validatePlanningEvidence(result.output, topics, now);
    } else {
      const evidence = validatePlanningEvidence(outputs.research, topics, now);
      const common = { planningInputs: snapshot.planningInputs, ...normalized, evidence };
      if (stage === "schedule") result = await generate({ ...common, instruction: "Allocate every scene exactly once. Honor hard budget, shoot-window and daily-hour constraints. Include realistic setup, travel and safety time. Sequential day numbers start at one. complianceNotes must be empty unless they state a specific verification step. Do not use the words standard, mandatory, legal, or regulatory, and never present planning targets as labor, meal, rest, or turnaround rules." }, shootingScheduleSchema);
      else if (stage === "budget") {
        const costEvidence = evidence.filter(record => record.topics.includes("costs") && /(^|\.)(nmfilm\.com|nm\.gov)$/i.test(new URL(record.url).hostname));
        if (!costEvidence.length) throw new Error("INITIAL_PLAN_COST_EVIDENCE_UNAVAILABLE");
        result = await generate({ ...common, evidence: costEvidence, schedule: outputs.schedule, instruction: "Estimate a nonzero whole-project budget band consistent with scheduled days and requirements, in the requested currency. Return lineItems with quantities, units, a basis, evidence IDs, and low/high values whose sums exactly equal the budget low/high totals. Cite only supplied official cost-topic evidence IDs on every line item and driver. Explain uncertainty in assumptions/drivers. Do not invent quotes or silently reduce scope to meet a ceiling." }, initialBudgetSchema);
      }
      else if (stage === "locations") result = await generate({ ...common, schedule: outputs.schedule, instruction: "Recommend relevant shooting location candidates or location types within the production region for the shared story locations. Cite supplied evidence for each, disclose access/availability risks. No generic placeholder or claims of confirmed permissions, access, availability, safety, or costs. State that access needs verification instead of saying availability is guaranteed. Do not use standard, mandatory, legal, regulatory, approved, or secured in risks." }, locationsSchema);
      else if (stage === "casting") {
        result = await generate({ ...common, schedule: outputs.schedule, instruction: "Develop the shared role briefs. Preserve exactly the normalized role IDs; legitimate empty casting stays empty. Only state age or performer facts supported by sourceFacts; otherwise use unknown and record an assumption. Include minor/stunt needs and uncertainty. complianceNotes must be empty unless they state a specific verification step." }, castingSchema);
        const casting = castingSchema.parse(result.output).casting;
        if (casting.length !== normalized.roles.length || new Set(casting.map(role => role.id)).size !== casting.length || casting.some(role => !normalized.roles.some(source => source.id === role.id))) throw new Error("INITIAL_PLAN_ROLE_REFERENCE");
      } else {
        const assumptions = [...new Set([...snapshot.planningInputs.assumptions, ...normalized.assumptions])];
        const plan = { title: snapshot.projectTitle, logline: null, currency: snapshot.planningInputs.currency, scenes: normalized.scenes, schedule: outputs.schedule, budget: outputs.budget, locations: locationsSchema.parse(outputs.locations).locations, casting: castingSchema.parse(outputs.casting).casting, evidence: evidence.map(({ id, title, url, retrievedAt }) => ({ id, title, url, retrievedAt })), assumptions, warnings: ["Planning estimates require producer validation; rates, access and availability are not confirmed."] };
        result = { output: createInitialPlanDraft({ ...snapshot, plan, generatedAt: now.toISOString() }), usage: { inputTokens: 0, outputTokens: 0, elapsedMs: 0 } };
      }
      if (stage === "budget" || stage === "locations") {
        const cited = stage === "budget" ? [...initialBudgetSchema.parse(result.output).costDrivers, ...initialBudgetSchema.parse(result.output).lineItems] : locationsSchema.parse(result.output).locations;
        if (cited.some(item => !item.evidenceIds.length || item.evidenceIds.some(id => !evidence.some(record => record.id === id)))) throw new Error("INITIAL_PLAN_CITATION_INVALID");
        if (stage === "budget") {
          const costEvidenceIds = new Set(evidence.filter(record => record.topics.includes("costs") && /(^|\.)(nmfilm\.com|nm\.gov)$/i.test(new URL(record.url).hostname)).map(record => record.id));
          if (cited.some(item => item.evidenceIds.some(id => !costEvidenceIds.has(id)))) throw new Error("INITIAL_PLAN_COST_EVIDENCE_INVALID");
        }
      }
      if (stage === "schedule") {
        const schedule = shootingScheduleSchema.parse(result.output);
        const allocated = schedule.days.flatMap(day => day.sceneIds);
        const expected = normalized.scenes.map(scene => scene.id);
        if (allocated.length !== expected.length || new Set(allocated).size !== expected.length || allocated.some(id => !expected.includes(id)) || schedule.days.some((day, i) => day.dayNumber !== i + 1)) throw new Error("INITIAL_PLAN_SCHEDULE_COVERAGE");
        const inputs = snapshot.planningInputs;
        if ((inputs.targetHoursPerDay !== null && schedule.days.some(day => day.estimatedHours > inputs.targetHoursPerDay!)) || (inputs.shootWindow && schedule.shootDays > (Date.parse(inputs.shootWindow.end) - Date.parse(inputs.shootWindow.start)) / 86_400_000 + 1)) throw new Error("INITIAL_PLAN_CONSTRAINT_INFEASIBLE");
      }
      if (stage === "budget") {
        const budget = initialBudgetSchema.parse(result.output);
        if (budget.high <= 0 || budget.currency !== snapshot.planningInputs.currency) throw new Error("INITIAL_PLAN_BUDGET_INVALID");
        if (snapshot.planningInputs.budgetCeiling !== null && budget.high > snapshot.planningInputs.budgetCeiling) throw new Error("INITIAL_PLAN_CONSTRAINT_INFEASIBLE");
      }
      if (stage === "locations" && locationsSchema.parse(result.output).locations.some(location => location.regionCode !== snapshot.planningInputs.regionCode)) throw new Error("INITIAL_PLAN_REGION_MISMATCH");
    }
  }
  if (measureJsonBytes(result) > MAX_PERSISTED_DOCUMENT_BYTES) throw new Error("INITIAL_PLAN_OUTPUT_LIMIT");
  return result;
}
