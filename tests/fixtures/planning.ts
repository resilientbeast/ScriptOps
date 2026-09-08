import type { SourceBlock } from "@/lib/ingestion/contracts";
import type { PlanningProviders, PlanningSnapshot } from "@/lib/planning/generation";
import { createPlanningInputs } from "@/lib/planning/inputs";
import { normalizePlanningEvidence } from "@/lib/planning/planning-evidence";
import type { InitialProductionPlan } from "@/lib/planning/schemas";

export const planningNow = new Date("2026-09-07T00:00:00.000Z");
export function planningFixture(count = 1, people = false) {
  const blocks: SourceBlock[] = Array.from({ length: count }, (_, i) => ({ id: `fdx:block:${i}`, page: null, blockIndex: i, text: people ? "INT. WORKSHOP - DAY\nMARA repairs a clock. JO watches." : "EXT. DESERT - DAY\nWind moves sand. No people appear." }));
  const snapshot: PlanningSnapshot = {
    version: "initial-v5", model: "test-model", projectTitle: people ? "Clockwork" : "Empty horizon", pricing: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5, searchUsdPerRequest: 0.01 },
    planningInputs: createPlanningInputs({ countryCode: "US", regionCode: "US-NM", currency: "USD", assumptions: [], budgetCeiling: null, shootWindow: null, targetHoursPerDay: 10, supportProfileVersion: "pilot-v1" }, planningNow),
    revision: { id: "review-1", scriptVersionId: "script-1", parentRevisionId: null, editVersion: 0, status: "accepted", sceneManifestHash: "b".repeat(64), acknowledgedWarningIds: [], acceptedBy: "owner-a", acceptedAt: planningNow.toISOString(), scenes: blocks.map((block, i) => ({ id: `scene-${i + 1}`, ordinal: i + 1, displayNumber: i === 0 ? "12A" : String(i + 1), originalHeading: block.text.split("\n")[0]!, reviewedHeading: block.text.split("\n")[0]!, sourceSpans: [{ sourceId: block.id, page: null, blockIndex: i, startOffset: 0, endOffset: block.text.length }], warningIds: [], predecessorSceneIds: [] })) },
  };
  const scenes: InitialProductionPlan["scenes"] = snapshot.revision.scenes.map(scene => ({ id: scene.id, displayNumber: scene.displayNumber, heading: scene.reviewedHeading, setting: people ? "interior" : "exterior", storyLocation: people ? "Workshop" : "Desert", timeOfDay: "day", summary: people ? "Mara repairs a clock while Jo watches." : "Wind moves sand with no people present.", sourceFactIds: scene.sourceSpans.map(span => span.sourceId), sourceFacts: scene.sourceSpans.map(span => ({ sourceId: span.sourceId, quote: blocks[span.blockIndex]!.text.slice(span.startOffset, span.endOffset) })), requirements: { castRoleIds: people ? ["role-mara", "role-jo"] : [], vehicles: [], stunts: [], minors: [], specialEquipment: [] } }));
  const casting: InitialProductionPlan["casting"] = people ? ["Mara", "Jo"].map(name => ({ id: `role-${name.toLowerCase()}`, roleName: name, archetype: "Adult workshop visitor", ageCategory: "adult", complianceNotes: [], specialistNeeds: [] })) : [];
  const evidence = normalizePlanningEvidence([{ title: "New Mexico production guidance", url: "https://nmfilm.com/crew-rates", excerpts: ["New Mexico film production requires location permit review. Crew rates and production costs depend on shoot hours and agreements."] }], ["permits", "costs"], planningNow);
  const plan: InitialProductionPlan = { title: snapshot.projectTitle, logline: null, currency: "USD", scenes, schedule: { shootDays: Math.ceil(count / 5), days: Array.from({ length: Math.ceil(count / 5) }, (_, i) => ({ id: `day-${i + 1}`, dayNumber: i + 1, label: `Day ${i + 1}`, sceneIds: scenes.slice(i * 5, (i + 1) * 5).map(scene => scene.id), dayNight: "day", estimatedHours: 8, setupRequirements: ["Allow two hours for setup"], complianceNotes: [] })) }, budget: { currency: "USD", low: 3000, high: 6000, lineItems: [{ id: "crew-day", category: "Crew day", quantity: 1, unit: "shoot day", low: 3000, high: 6000, basis: "One scheduled shoot day at provisional local crew rates.", evidenceIds: [evidence[0]!.id] }], costDrivers: [{ id: "crew", label: "Crew and equipment", direction: "neutral", reason: "One small crew at provisional daily rates; scale against schedule.", evidenceIds: [evidence[0]!.id] }], assumptions: ["A small nonunion crew; rates require producer quotes."] }, locations: [{ id: "location-one", name: people ? "Workshop interior" : "Desert exterior", locality: "New Mexico", regionCode: "US-NM", fit: "Matches the screenplay setting", risks: ["Access needs producer verification"], evidenceIds: [evidence[0]!.id] }], casting, evidence: evidence.map(({ id, title, url, retrievedAt }) => ({ id, title, url, retrievedAt })), assumptions: [], warnings: [] };
  const calls: string[] = [];
  const providers: PlanningProviders = {
    async generate(stage) {
      calls.push(stage);
      const output = stage.startsWith("breakdown-") ? { scenes: scenes.slice(Number(stage.slice(10)) * 5, (Number(stage.slice(10)) + 1) * 5) } : stage === "normalize" ? { scenes, roles: casting, locations: [people ? "Workshop" : "Desert"], assumptions: [] } : stage === "schedule" ? plan.schedule : stage === "budget" ? plan.budget : stage === "locations" ? { locations: plan.locations } : { casting };
      return { output: structuredClone(output), usage: { inputTokens: 100, outputTokens: 100, elapsedMs: 1 } };
    },
    async research() { calls.push("research"); return { output: evidence, usage: { inputTokens: 0, outputTokens: 0, elapsedMs: 1 } }; },
  };
  return { snapshot, blocks, plan, evidence, providers, calls };
}
