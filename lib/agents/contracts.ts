import { z } from "zod";

import {
  budgetBandSchema,
  castingBriefSchema,
  locationCandidateSchema,
  sceneBreakdownSchema,
  shootingScheduleSchema,
} from "@/lib/domain/schemas";

const reasonsSchema = z.array(z.string().trim().min(1).max(500)).min(1).max(8);
const evidenceIdsSchema = z.array(z.string().trim().min(1)).max(20);

export const breakdownAgentOutputSchema = z.object({
  accepted: z.boolean(),
  revisedScene: sceneBreakdownSchema,
  reasons: reasonsSchema,
  assumptions: z.array(z.string().trim().min(1).max(500)).max(8),
});

export const scheduleAgentOutputSchema = z.object({
  revisedSchedule: shootingScheduleSchema,
  reasons: reasonsSchema,
  evidenceIds: evidenceIdsSchema,
});

export const budgetAgentOutputSchema = z.object({
  revisedBudget: budgetBandSchema,
  reasons: reasonsSchema,
  evidenceIds: evidenceIdsSchema,
});

export const locationsAgentOutputSchema = z.object({
  revisedLocations: z.array(locationCandidateSchema).min(1).max(20),
  reasons: reasonsSchema,
  evidenceIds: evidenceIdsSchema,
});

export const castingAgentOutputSchema = z.object({
  revisedCasting: z.array(castingBriefSchema).min(1).max(50),
  reasons: reasonsSchema,
  evidenceIds: evidenceIdsSchema,
});

export type BreakdownAgentOutput = z.infer<typeof breakdownAgentOutputSchema>;
export type ScheduleAgentOutput = z.infer<typeof scheduleAgentOutputSchema>;
export type BudgetAgentOutput = z.infer<typeof budgetAgentOutputSchema>;
export type LocationsAgentOutput = z.infer<typeof locationsAgentOutputSchema>;
export type CastingAgentOutput = z.infer<typeof castingAgentOutputSchema>;

export const AGENT_OUTPUT_KEYS = {
  breakdown: "breakdownOutput",
  evidence: "evidenceOutput",
  evidenceBundle: "evidenceBundle",
  schedule: "scheduleOutput",
  budget: "budgetOutput",
  locations: "locationsOutput",
  casting: "castingOutput",
} as const;

export function parseAgentOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  if (typeof value !== "string") return schema.parse(value);
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return schema.parse(JSON.parse(fenced?.[1] ?? trimmed));
}
