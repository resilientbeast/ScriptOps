import type { ProductionPlan } from "@/lib/domain/types";

export type DashboardSnapshot = {
  cycle: number;
  planVersion: number;
  currentPlan: ProductionPlan;
  hasApprovedRipple: boolean;
  openRunId: string | null;
};

export type ArtifactKey =
  | "breakdown"
  | "schedule"
  | "budget"
  | "locations"
  | "casting";
