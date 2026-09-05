import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { ProposalReview } from "@/components/ripple/proposal-review";
import {
  approvedExampleFixture,
  immutableBaselinePlan,
} from "@/lib/domain/fixtures";

describe("producer proposal review", () => {
  it("renders every required artifact decision with atomic controls", () => {
    const html = renderToStaticMarkup(
      <ProposalReview
        proposal={approvedExampleFixture.proposal}
        pending={false}
        onApprove={() => undefined}
        onDiscard={() => undefined}
        onEditAndRerun={() => undefined}
      />,
    );

    expect(html).toContain("Approve all 5 updates");
    expect(html).toContain("Discard proposal");
    expect(html).toContain("Edit request and rerun");
    expect(html).toContain("Scene breakdown");
    expect(html).toContain("Shooting schedule");
    expect(html).toContain("Budget band");
    expect(html).toContain("Location candidates");
    expect(html).toContain("Casting briefs");
    expect(html).toContain("4 → 5 shoot days");
    expect(html).not.toContain("Verify Verify");
  });

  it("uses the shared drawer to disclose proposal before and after values", () => {
    const scene = immutableBaselinePlan.scenes.find((item) => item.id === "scene-14")!;
    const html = renderToStaticMarkup(
      <DetailDrawer
        artifact="breakdown"
        plan={immutableBaselinePlan}
        scene={scene}
        proposal={approvedExampleFixture.proposal}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain("Proposal preview");
  });
});
