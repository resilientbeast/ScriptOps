import type { PublicDemoSnapshot } from "@/lib/ripple/public-demo";

export type DashboardSnapshot = PublicDemoSnapshot;

export type ArtifactKey =
  | "breakdown"
  | "schedule"
  | "budget"
  | "locations"
  | "casting";
