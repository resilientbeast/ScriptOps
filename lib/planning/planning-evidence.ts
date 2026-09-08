import { createHash } from "node:crypto";
import { z } from "zod";
import { evidenceRecordSchema, type InitialProductionPlan, type PlanningInputs } from "@/lib/planning/schemas";

export const RESEARCH_POLICY_VERSION = "project-research-v3";
export const researchTopicSchema = z.enum(["permits", "costs", "minors", "stunts", "vehicles", "night"]);
export type ResearchTopic = z.infer<typeof researchTopicSchema>;
export const planningEvidenceSchema = z.array(evidenceRecordSchema.extend({
  excerpt: z.string().trim().min(40).max(2400),
  topics: z.array(researchTopicSchema).min(1),
  regionCode: z.literal("US-NM"),
  policyVersion: z.literal(RESEARCH_POLICY_VERSION),
}).strict()).min(1).max(30);
export type PlanningEvidence = z.infer<typeof planningEvidenceSchema>;

const templates: Record<ResearchTopic, string> = {
  permits: "New Mexico film location permits",
  costs: "New Mexico Film Office 2025 report crew median hourly wage rates",
  minors: "New Mexico child performer labor requirements",
  stunts: "film stunt safety production guidelines",
  vehicles: "New Mexico filming road closure permits",
  night: "New Mexico night filming noise permits",
};
const relevance: Record<ResearchTopic, RegExp> = {
  permits: /permit|permission|authorization/i,
  costs: /\b(?:crew (?:rates?|wages?)|(?:wage|payroll) (?:rates?|schedule|agreement)|(?:median|hourly) wage|day rates?|union scale|fringe (?:rates?|benefits)|area standard agreement)\b/i,
  minors: /child|minor|young performer/i,
  stunts: /stunt|safety bulletin/i,
  vehicles: /road|vehicle|traffic/i,
  night: /night|noise|hours/i,
};

export function requiredResearchTopics(scenes: InitialProductionPlan["scenes"]): ResearchTopic[] {
  return ["permits", "costs", ...(scenes.some(s => s.requirements.minors.length) ? ["minors" as const] : []), ...(scenes.some(s => s.requirements.stunts.length) ? ["stunts" as const] : []), ...(scenes.some(s => s.requirements.vehicles.length) ? ["vehicles" as const] : []), ...(scenes.some(s => s.timeOfDay === "night") ? ["night" as const] : [])];
}

/** Only fixed vocabulary crosses the search boundary, never model-written queries. */
export function planningResearchRequest(inputs: PlanningInputs, topics: ResearchTopic[]) {
  if (inputs.countryCode !== "US" || inputs.regionCode !== "US-NM" || inputs.currency !== "USD" || inputs.supportProfileVersion !== "pilot-v1") throw new Error("INITIAL_PLAN_PROFILE_UNSUPPORTED");
  return { objective: "Find authoritative film production planning sources for New Mexico, United States. Include permit requirements and production cost assumptions; do not claim permissions or quotes are confirmed.", searchQueries: [...new Set(topics.map(topic => templates[researchTopicSchema.parse(topic)]))] };
}

function sourceKey(url: URL): string {
  const normalized = new URL(url);
  normalized.hash = "";
  normalized.search = "";
  normalized.hostname = normalized.hostname.toLowerCase();
  normalized.pathname = normalized.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (normalized.hostname.endsWith("nmfilm.com")) {
    normalized.pathname = normalized.pathname.replace(/^\/whynewmexico(?=\/filmmaker-resources\/)/, "");
  }
  return `${normalized.origin}${normalized.pathname}`;
}

const navigationNoise = /\b(skip to content|subscribe|newsletter|conference|where history gets made|sign up|follow us)\b/i;

function cleanExcerpt(excerpts: string[]): string {
  return excerpts
    .flatMap(excerpt => excerpt.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]*>/g, " ").replace(/[`*_>#|]/g, " ").split(/(?<=[.!?])\s+/))
    .map(sentence => sentence.replace(/\s+/g, " ").trim())
    .filter(sentence => sentence.length >= 40 && !navigationNoise.test(sentence))
    .join(" ")
    .slice(0, 2400);
}

export function normalizePlanningEvidence(results: Array<{ url: string; title?: string | null; excerpts: string[] }>, topics: ResearchTopic[], now = new Date()): PlanningEvidence {
  const records = new Map<string, PlanningEvidence[number]>();
  for (const result of results) {
    let url: URL;
    try { url = new URL(result.url); } catch { continue; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
    url.hash = "";
    const excerpt = cleanExcerpt(result.excerpts);
    const title = (result.title || url.hostname).slice(0, 500);
    const text = `${title} ${excerpt}`;
    const local = /new mexico/i.test(text) || /(^|\.)nmfilm\.com$|(^|\.)nm\.gov$/i.test(url.hostname);
    const matched = topics.filter(topic => relevance[topic].test(text) && (local || topic === "stunts"));
    if (excerpt.length < 40 || !matched.length) continue;
    const key = sourceKey(url);
    records.set(key, { id: `evidence-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`, title, url: url.href, retrievedAt: now.toISOString(), excerpt, topics: matched, regionCode: "US-NM", policyVersion: RESEARCH_POLICY_VERSION });
  }
  return validatePlanningEvidence([...records.values()].slice(0, 30), topics, now);
}

export function validatePlanningEvidence(value: unknown, topics: ResearchTopic[], now = new Date()): PlanningEvidence {
  const records = planningEvidenceSchema.parse(value);
  if (new Set(records.map(record => record.id)).size !== records.length || topics.some(topic => !records.some(record => record.topics.includes(topic)))) throw new Error("INITIAL_PLAN_EVIDENCE_COVERAGE");
  if (records.some(record => { const age = now.getTime() - Date.parse(record.retrievedAt); return age < -60_000 || age > 24 * 60 * 60_000; })) throw new Error("INITIAL_PLAN_EVIDENCE_EXPIRED");
  return records;
}
