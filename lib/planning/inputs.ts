import { createHash } from "node:crypto";

import {
  planningInputsSchema,
  type PlanningInputs,
} from "@/lib/planning/schemas";

export type CreatePlanningInputs = Omit<
  PlanningInputs,
  "version" | "inputHash" | "createdAt"
>;

export function createPlanningInputs(
  input: CreatePlanningInputs,
  now = new Date(),
): PlanningInputs {
  const stableInput = {
    countryCode: input.countryCode,
    regionCode: input.regionCode,
    currency: input.currency,
    assumptions: input.assumptions,
    budgetCeiling: input.budgetCeiling,
    shootWindow: input.shootWindow,
    targetHoursPerDay: input.targetHoursPerDay,
    supportProfileVersion: input.supportProfileVersion,
  };
  const inputHash = createHash("sha256")
    .update(JSON.stringify(stableInput), "utf8")
    .digest("hex");
  return planningInputsSchema.parse({
    ...stableInput,
    version: 1,
    inputHash,
    createdAt: now.toISOString(),
  });
}
