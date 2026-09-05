import type { ArtifactKey } from "@/components/dashboard/types";
import type { ProductionPlan } from "@/lib/domain/types";

export type ArtifactSummary = {
  key: ArtifactKey;
  index: string;
  label: string;
  metric: string;
  descriptor: string;
};

function compactUsd(value: number): string {
  return `$${Math.round(value / 1_000)}k`;
}

export function buildArtifactSummaries(
  plan: ProductionPlan,
): ArtifactSummary[] {
  return [
    {
      key: "breakdown",
      index: "01",
      label: "Breakdown",
      metric: String(plan.scenes.length).padStart(2, "0"),
      descriptor: "scenes mapped",
    },
    {
      key: "schedule",
      index: "02",
      label: "Schedule",
      metric: String(plan.schedule.shootDays).padStart(2, "0"),
      descriptor: "shoot days",
    },
    {
      key: "budget",
      index: "03",
      label: "Budget",
      metric: `${compactUsd(plan.budget.low)}–${compactUsd(plan.budget.high)}`,
      descriptor: "working band",
    },
    {
      key: "locations",
      index: "04",
      label: "Locations",
      metric: String(plan.locations.length).padStart(2, "0"),
      descriptor: "candidates",
    },
    {
      key: "casting",
      index: "05",
      label: "Casting",
      metric: String(plan.casting.length).padStart(2, "0"),
      descriptor: "role briefs",
    },
  ];
}
