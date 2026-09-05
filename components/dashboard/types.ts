import type { ProductionPlan } from "@/lib/domain/types";
import type { PublicRippleRun } from "@/lib/ripple/contracts";

export type DashboardSnapshot = {
  cycle: number;
  planVersion: number;
  currentPlan: ProductionPlan;
  hasApprovedRipple: boolean;
  openRunId: string | null;
  openRun: PublicRippleRun | null;
};

export type ArtifactKey =
  | "breakdown"
  | "schedule"
  | "budget"
  | "locations"
  | "casting";
