import { z } from "zod";
import { ATTEMPT_ALLOWANCE_CENTS } from "@/lib/planning/generation-state";

export const planningPricingSchema = z.object({ inputUsdPerMillion: z.number().positive(), outputUsdPerMillion: z.number().positive(), searchUsdPerRequest: z.number().positive() }).strict();
export type PlanningPricing = z.infer<typeof planningPricingSchema>;
// Conservative token envelope includes schema/system text and reasoning output.
export const MAX_BILLED_INPUT_TOKENS = 220_000;
export const MAX_BILLED_OUTPUT_TOKENS = 18_432;
export const MAX_RESEARCH_REQUESTS_PER_ATTEMPT = 6;
export function validatePlanningPricing(value: unknown): PlanningPricing {
  const pricing = planningPricingSchema.parse(value);
  const modelCents = 100 * (MAX_BILLED_INPUT_TOKENS * pricing.inputUsdPerMillion + MAX_BILLED_OUTPUT_TOKENS * pricing.outputUsdPerMillion) / 1_000_000;
  if (Math.max(modelCents, pricing.searchUsdPerRequest * 100 * MAX_RESEARCH_REQUESTS_PER_ATTEMPT) > ATTEMPT_ALLOWANCE_CENTS) throw new Error("INITIAL_PLAN_PRICING_EXCEEDS_ALLOWANCE");
  return pricing;
}
export function readPlanningPricing(env: NodeJS.ProcessEnv = process.env) {
  return validatePlanningPricing({ inputUsdPerMillion: Number(env.PLANNING_INPUT_USD_PER_MILLION), outputUsdPerMillion: Number(env.PLANNING_OUTPUT_USD_PER_MILLION), searchUsdPerRequest: Number(env.PLANNING_SEARCH_USD_PER_REQUEST) });
}
