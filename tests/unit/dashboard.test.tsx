import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildArtifactSummaries } from "@/components/dashboard/dashboard-model";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { immutableBaselinePlan } from "@/lib/domain/fixtures";

describe("populated baseline dashboard", () => {
  it("derives all five populated artifact summaries", () => {
    const summaries = buildArtifactSummaries(immutableBaselinePlan);

    expect(summaries).toHaveLength(5);
    expect(summaries.map(({ label }) => label)).toEqual([
      "Breakdown",
      "Schedule",
      "Budget",
      "Locations",
      "Casting",
    ]);
    for (const summary of summaries) {
      expect(summary.metric).not.toBe("");
      expect(summary.descriptor).not.toBe("");
    }
  });

  it("server-renders the complete first-view baseline", () => {
    const html = renderToStaticMarkup(
      <DashboardShell
        authConfigured={false}
        initialSnapshot={{
          cycle: 1,
          planVersion: 1,
          currentPlan: immutableBaselinePlan,
          hasApprovedRipple: false,
          openRunId: null,
          openRun: null,
          dailyCapReached: false,
        }}
      />,
    );

    expect(html).toContain("Dust &amp; Thunder");
    expect(html).toContain("Selected scene");
    expect(html).toContain("14");
    expect(html).toContain("Revision Ripple");
    expect(html).toContain("Analyze proposed ripple");
    expect(html).toContain("Move Scene 14 to a rainy night");
    expect(html).toContain("Breakdown");
    expect(html).toContain("Schedule");
    expect(html).toContain("Budget");
    expect(html).toContain("Locations");
    expect(html).toContain("Casting");
    expect(html).toContain("v1");
  });
});
