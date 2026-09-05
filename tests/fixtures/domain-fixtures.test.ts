import { describe, expect, it } from "vitest";

import {
  approvedExampleFixture,
  evidenceFallbackFixture,
  immutableBaselinePlan,
  sampleScreenplayFixture,
} from "@/lib/domain/fixtures";
import { goldenRevisionProposalSchema } from "@/lib/domain/golden-invariants";
import {
  MAX_PERSISTED_DOCUMENT_BYTES,
  persistedDocumentSizeSchema,
  productionPlanSchema,
  publicErrorSchema,
  revisionProposalSchema,
  rippleStageProgressSchema,
} from "@/lib/domain/schemas";

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("versioned domain fixtures", () => {
  it("hydrates the screenplay and immutable baseline", () => {
    expect(sampleScreenplayFixture.scenes).toHaveLength(14);
    expect(immutableBaselinePlan.scenes).toHaveLength(14);
    expect(immutableBaselinePlan.revisionRecord).toBeNull();
    expect(Object.isFrozen(immutableBaselinePlan)).toBe(true);

    console.info(
      `Fixture: sample screenplay (${sampleScreenplayFixture.scenes.length} scenes)`,
    );
    console.info(
      `Fixture: immutable baseline (${immutableBaselinePlan.schedule.shootDays} shoot days)`,
    );
  });

  it("hydrates cached evidence and the approved golden example", () => {
    expect(evidenceFallbackFixture.evidence.sourceMode).toBe("cached");
    expect(evidenceFallbackFixture.evidence.records).toHaveLength(5);
    expect(approvedExampleFixture.approvedPlan.revisionRecord?.planVersion).toBe(
      2,
    );
    expect(approvedExampleFixture.proposal.impacts.schedule.before.shootDays).toBe(4);
    expect(approvedExampleFixture.proposal.impacts.schedule.after.shootDays).toBe(5);
    expect(approvedExampleFixture.proposal.impacts.schedule.reasons[0]).toContain(
      "protected fifth night unit",
    );
    expect(
      goldenRevisionProposalSchema.safeParse(approvedExampleFixture.proposal)
        .success,
    ).toBe(true);

    console.info(
      `Fixture: evidence fallback (${evidenceFallbackFixture.evidence.records.length} records)`,
    );
    console.info(
      `Fixture: approved example (${Object.keys(approvedExampleFixture.proposal.impacts).length} impacts)`,
    );
  });
});

describe("contract rejection boundaries", () => {
  it("rejects malformed or incomplete schedules", () => {
    const wrongCount = clone(immutableBaselinePlan);
    wrongCount.schedule.shootDays = 5;
    expect(productionPlanSchema.safeParse(wrongCount).success).toBe(false);

    const missingScene = clone(immutableBaselinePlan);
    missingScene.schedule.days.at(-1)?.sceneIds.pop();
    const result = productionPlanSchema.safeParse(missingScene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "scenes")).toBe(
        true,
      );
    }
  });

  it("rejects inverted budget bands", () => {
    const plan = clone(immutableBaselinePlan);
    plan.budget.low = plan.budget.high + 1;
    expect(productionPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects evidence references that are absent from the bundle", () => {
    const proposal = clone(approvedExampleFixture.proposal);
    proposal.impacts.schedule.evidenceIds.push("evidence-not-present");
    proposal.proposedPlan.budget.costDrivers[0].evidenceIds.push(
      "evidence-not-present",
    );
    expect(revisionProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects named performers in archetype-only casting briefs", () => {
    const plan = clone(immutableBaselinePlan) as unknown as Record<string, unknown>;
    const casting = plan.casting as Array<Record<string, unknown>>;
    casting[0].performerName = "Named Actor";
    expect(productionPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects incomplete five-impact proposals", () => {
    const proposal = clone(approvedExampleFixture.proposal) as unknown as {
      impacts: Record<string, unknown>;
    };
    delete proposal.impacts.casting;
    expect(revisionProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects oversized persisted snapshots", () => {
    const oversized = {
      snapshot: "x".repeat(MAX_PERSISTED_DOCUMENT_BYTES + 1),
    };
    expect(persistedDocumentSizeSchema.safeParse(oversized).success).toBe(false);
  });

  it("rejects prohibited certainty claims", () => {
    const plan = clone(immutableBaselinePlan);
    plan.locations[0].risks.push("Permit approved for the selected road");
    expect(productionPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("preserves prohibited phrases when they are quoted inside source evidence", () => {
    const proposal = clone(approvedExampleFixture.proposal);
    proposal.evidence.records[0].excerpt =
      "The source says permits are approved for a different historical production.";

    expect(revisionProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it("rejects a proposal that drifts from Scene 14 golden invariants", () => {
    const proposal = clone(approvedExampleFixture.proposal);
    proposal.impacts.locations.after = proposal.impacts.locations.after.map(
      (location) => ({
        ...location,
        fit: "A visually useful candidate.",
        risks: ["verify practical constraints"],
      }),
    );
    expect(goldenRevisionProposalSchema.safeParse(proposal).success).toBe(false);
  });
});

describe("public progress and failure contracts", () => {
  it("accepts a complete six-stage progress record", () => {
    const completed = {
      status: "completed" as const,
      message: "Stage completed.",
      startedAt: "2026-08-28T10:00:00.000Z",
      completedAt: "2026-08-28T10:01:00.000Z",
      failure: null,
    };
    expect(
      rippleStageProgressSchema.safeParse({
        breakdown: completed,
        evidence: completed,
        schedule: completed,
        budget: completed,
        locations: completed,
        casting: completed,
      }).success,
    ).toBe(true);
  });

  it("keeps public errors recoverable and explicit about baseline safety", () => {
    expect(
      publicErrorSchema.safeParse({
        code: "PROVIDER_TIMEOUT",
        message: "The evidence lookup timed out. Try the revision again.",
        baselineChanged: false,
        retryable: true,
        stage: "evidence",
      }).success,
    ).toBe(true);
    expect(
      publicErrorSchema.safeParse({
        code: "PROVIDER_TIMEOUT",
        message: "Internal stack trace",
        baselineChanged: true,
        retryable: true,
      }).success,
    ).toBe(false);
  });
});
