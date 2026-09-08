import type { ProjectPlan } from "@/lib/planning/initial-plan-approval";
import type { InitialProductionPlan } from "@/lib/planning/schemas";

export function planFromRecord(record: ProjectPlan): InitialProductionPlan {
  return record.manifest.draft.plan;
}

export function rippleDelta(base: InitialProductionPlan, proposal: InitialProductionPlan) {
  return { shootDays: proposal.schedule.shootDays - base.schedule.shootDays, budgetLow: proposal.budget.low - base.budget.low, budgetHigh: proposal.budget.high - base.budget.high, locationCount: proposal.locations.length - base.locations.length, currency: proposal.currency };
}
