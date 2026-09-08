import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { approvedExampleFixture, immutableBaselinePlan } from "@/lib/domain/fixtures";
import { rippleRunSchema } from "@/lib/firestore/state-types";
import { isPdfExportEligible, renderProductionBible } from "@/lib/pdf/production-bible";

const now = new Date("2026-09-05T14:00:00.000Z");
const completedStage = {
  status: "completed" as const,
  message: "Complete.",
  startedAt: "2026-09-05T13:59:00.000Z",
  completedAt: "2026-09-05T14:00:00.000Z",
  failure: null,
};

const approvedRun = rippleRunSchema.parse({
  runId: approvedExampleFixture.proposal.runId,
  demoId: "22222222-2222-4222-8222-222222222222",
  cycle: 1,
  basePlanVersion: 1,
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
  sceneId: approvedExampleFixture.proposal.sceneId,
  requestText: approvedExampleFixture.proposal.requestText,
  status: "approved",
  stages: {
    breakdown: completedStage,
    evidence: completedStage,
    schedule: completedStage,
    budget: completedStage,
    locations: completedStage,
    casting: completedStage,
  },
  proposal: approvedExampleFixture.proposal,
  failure: null,
  executionAttempt: 1,
  executionToken: null,
  heartbeatAt: now,
  createdAt: now,
  startedAt: now,
  finishedAt: now,
  approvedAt: now,
});

describe("approved production bible", () => {
  it("blocks export until a revision is approved", () => {
    expect(isPdfExportEligible(immutableBaselinePlan, null)).toBe(false);
  });

  it("renders a two-page PDF for the approved five-artifact plan", async () => {
    expect(isPdfExportEligible(approvedExampleFixture.approvedPlan, approvedRun)).toBe(true);
    const pdf = await renderProductionBible(approvedExampleFixture.approvedPlan, approvedRun);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  });
});
