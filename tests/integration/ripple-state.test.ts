import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  approvedExampleFixture,
  immutableBaselinePlan,
} from "@/lib/domain/fixtures";
import { GOLDEN_REQUEST } from "@/lib/domain/golden-invariants";
import type { StageProgress } from "@/lib/domain/types";
import {
  deriveRunId,
  RippleStateRepository,
  StateConflictError,
} from "@/lib/firestore/ripple-state";
import type { DemoInstance } from "@/lib/firestore/state-types";
import { InMemoryStateStore } from "@/lib/firestore/transaction-store";

const NOW = new Date("2026-09-04T08:00:00.000Z");
const LATER = new Date("2026-09-04T08:01:00.000Z");
const DEMO_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEMO_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDEMPOTENCY_A = "11111111-2222-4333-8444-555555555555";
const IDEMPOTENCY_B = "66666666-7777-4888-8999-000000000000";

function activeProgress(stage: string): StageProgress {
  return {
    status: "active",
    message: `${stage} active`,
    startedAt: NOW.toISOString(),
    completedAt: null,
    failure: null,
  };
}

function completedProgress(stage: string): StageProgress {
  return {
    status: "completed",
    message: `${stage} completed`,
    startedAt: NOW.toISOString(),
    completedAt: LATER.toISOString(),
    failure: null,
  };
}

async function expectStateError(
  promise: Promise<unknown>,
  code: StateConflictError["code"],
) {
  await expect(promise).rejects.toMatchObject({ code });
}

async function createReadyRun(
  repository: RippleStateRepository,
  demoId = DEMO_A,
  idempotencyKey = IDEMPOTENCY_A,
) {
  await repository.initializeDemo(demoId, NOW);
  const created = await repository.createQueuedRun({
    demoId,
    idempotencyKey,
    sceneId: "scene-14",
    requestText: GOLDEN_REQUEST,
    dailyCap: 20,
    now: NOW,
  });
  const claim = await repository.claimRun(created.run.runId, 30_000, NOW);
  if (claim.outcome !== "claimed") {
    throw new Error("Expected test run to be claimed");
  }

  for (const stage of [
    "breakdown",
    "evidence",
    "schedule",
    "budget",
    "locations",
    "casting",
  ]) {
    await repository.transitionStage(
      created.run.runId,
      claim.executionToken,
      stage,
      activeProgress(stage),
    );
    await repository.transitionStage(
      created.run.runId,
      claim.executionToken,
      stage,
      completedProgress(stage),
    );
  }

  const proposal = structuredClone(approvedExampleFixture.proposal);
  proposal.runId = created.run.runId;
  proposal.basePlanVersion = created.run.basePlanVersion;
  const ready = await repository.writeProposal(
    created.run.runId,
    claim.executionToken,
    proposal,
    LATER,
  );
  return { created, ready };
}

describe("transactional ripple state", () => {
  it("initializes and isolates immutable baselines by browser demo UUID", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    const [first, duplicate, otherBrowser] = await Promise.all([
      repository.initializeDemo(DEMO_A, NOW),
      repository.initializeDemo(DEMO_A, LATER),
      repository.initializeDemo(DEMO_B, NOW),
    ]);

    expect(first).toEqual(duplicate);
    expect(first.demoId).not.toBe(otherBrowser.demoId);
    expect(first.currentPlan).toEqual(immutableBaselinePlan);
    expect(otherBrowser.currentPlan).toEqual(immutableBaselinePlan);
  });

  it("derives stable cycle-scoped run IDs", () => {
    const first = deriveRunId(DEMO_A, 1, IDEMPOTENCY_A);
    expect(first).toBe(deriveRunId(DEMO_A, 1, IDEMPOTENCY_A));
    expect(first).not.toBe(deriveRunId(DEMO_A, 2, IDEMPOTENCY_A));
    expect(first).not.toBe(deriveRunId(DEMO_B, 1, IDEMPOTENCY_A));
  });

  it("deduplicates concurrent starts without double-counting usage", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(DEMO_A, NOW);
    const input = {
      demoId: DEMO_A,
      idempotencyKey: IDEMPOTENCY_A,
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 20,
      now: NOW,
    };
    const results = await Promise.all([
      repository.createQueuedRun(input),
      repository.createQueuedRun(input),
    ]);

    expect(results.map((result) => result.outcome).sort()).toEqual([
      "created",
      "duplicate",
    ]);
    expect(results[0].run.runId).toBe(results[1].run.runId);
    expect((await repository.getDailyUsage("2026-09-04"))?.acceptedStarts).toBe(
      1,
    );
  });

  it("allows at most one concurrent open run per browser cycle", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(DEMO_A, NOW);
    const settled = await Promise.allSettled(
      [IDEMPOTENCY_A, IDEMPOTENCY_B].map((idempotencyKey) =>
        repository.createQueuedRun({
          demoId: DEMO_A,
          idempotencyKey,
          sceneId: "scene-14",
          requestText: GOLDEN_REQUEST,
          dailyCap: 20,
          now: NOW,
        }),
      ),
    );

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = settled.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: { code: "OPEN_RUN_EXISTS" },
    });
    expect((await repository.getDailyUsage("2026-09-04"))?.acceptedStarts).toBe(
      1,
    );
  });

  it("enforces the UTC daily cap across isolated browser demos", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await Promise.all([
      repository.initializeDemo(DEMO_A, NOW),
      repository.initializeDemo(DEMO_B, NOW),
    ]);
    await repository.createQueuedRun({
      demoId: DEMO_A,
      idempotencyKey: IDEMPOTENCY_A,
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 1,
      now: NOW,
    });
    await expectStateError(
      repository.createQueuedRun({
        demoId: DEMO_B,
        idempotencyKey: IDEMPOTENCY_B,
        sceneId: "scene-14",
        requestText: GOLDEN_REQUEST,
        dailyCap: 1,
        now: NOW,
      }),
      "DAILY_CAP_REACHED",
    );
  });

  it("rejects invalid stage transitions and incomplete proposals", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(DEMO_A, NOW);
    const created = await repository.createQueuedRun({
      demoId: DEMO_A,
      idempotencyKey: IDEMPOTENCY_A,
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 20,
      now: NOW,
    });
    const claim = await repository.claimRun(created.run.runId, 30_000, NOW);
    expect(claim.outcome).toBe("claimed");
    if (claim.outcome !== "claimed") return;

    await expectStateError(
      repository.transitionStage(
        created.run.runId,
        claim.executionToken,
        "breakdown",
        completedProgress("breakdown"),
      ),
      "INVALID_STAGE_TRANSITION",
    );
    const proposal = structuredClone(approvedExampleFixture.proposal);
    proposal.runId = created.run.runId;
    await expectStateError(
      repository.writeProposal(
        created.run.runId,
        claim.executionToken,
        proposal,
        LATER,
      ),
      "STAGES_INCOMPLETE",
    );
  });

  it("uses execution tokens to reject late worker writes after reclaim", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(DEMO_A, NOW);
    const created = await repository.createQueuedRun({
      demoId: DEMO_A,
      idempotencyKey: IDEMPOTENCY_A,
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 20,
      now: NOW,
    });
    const first = await repository.claimRun(created.run.runId, 30_000, NOW);
    expect(first.outcome).toBe("claimed");
    if (first.outcome !== "claimed") return;

    expect(
      await repository.claimRun(
        created.run.runId,
        30_000,
        new Date("2026-09-04T08:00:20.000Z"),
      ),
    ).toEqual({ outcome: "already-running" });
    const reclaimed = await repository.claimRun(
      created.run.runId,
      30_000,
      new Date("2026-09-04T08:01:00.000Z"),
    );
    expect(reclaimed.outcome).toBe("claimed");
    if (reclaimed.outcome !== "claimed") return;

    expect(reclaimed.executionToken).not.toBe(first.executionToken);
    await expectStateError(
      repository.heartbeatRun(created.run.runId, first.executionToken, LATER),
      "RUN_LEASE_LOST",
    );
    await expectStateError(
      repository.transitionStage(
        created.run.runId,
        first.executionToken,
        "breakdown",
        activeProgress("breakdown"),
      ),
      "RUN_LEASE_LOST",
    );
  });

  it("atomically approves all five artifacts once", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    const { ready } = await createReadyRun(repository);
    const approvals = await Promise.all([
      repository.approveProposal(DEMO_A, ready.runId, LATER),
      repository.approveProposal(DEMO_A, ready.runId, LATER),
    ]);

    expect(approvals.map((result) => result.outcome).sort()).toEqual([
      "approved",
      "duplicate",
    ]);
    const instance = await repository.getDemo(DEMO_A);
    expect(instance?.planVersion).toBe(2);
    expect(instance?.currentPlan.scenes).toEqual(ready.proposal?.proposedPlan.scenes);
    expect(instance?.currentPlan.schedule).toEqual(
      ready.proposal?.proposedPlan.schedule,
    );
    expect(instance?.currentPlan.budget).toEqual(ready.proposal?.proposedPlan.budget);
    expect(instance?.currentPlan.locations).toEqual(
      ready.proposal?.proposedPlan.locations,
    );
    expect(instance?.currentPlan.casting).toEqual(
      ready.proposal?.proposedPlan.casting,
    );
    await expectStateError(
      repository.createQueuedRun({
        demoId: DEMO_A,
        idempotencyKey: IDEMPOTENCY_B,
        sceneId: "scene-14",
        requestText: GOLDEN_REQUEST,
        dailyCap: 20,
        now: LATER,
      }),
      "RIPPLE_ALREADY_APPROVED",
    );
  });

  it("rejects approval when the instance version has moved", async () => {
    const store = new InMemoryStateStore();
    const repository = new RippleStateRepository(store);
    const { ready } = await createReadyRun(repository);
    await store.runTransaction(async (transaction) => {
      transaction.update<DemoInstance>("demoInstances", DEMO_A, {
        planVersion: 2,
      });
    });

    await expectStateError(
      repository.approveProposal(DEMO_A, ready.runId, LATER),
      "PLAN_VERSION_MISMATCH",
    );
    expect((await repository.getDemo(DEMO_A))?.currentPlan).toEqual(
      immutableBaselinePlan,
    );
  });

  it("rejects approval when the browser cycle has moved", async () => {
    const store = new InMemoryStateStore();
    const repository = new RippleStateRepository(store);
    const { ready } = await createReadyRun(repository);
    await store.runTransaction(async (transaction) => {
      transaction.update<DemoInstance>("demoInstances", DEMO_A, {
        cycle: 2,
      });
    });

    await expectStateError(
      repository.approveProposal(DEMO_A, ready.runId, LATER),
      "CYCLE_MISMATCH",
    );
  });

  it("discards a proposal without mutating the baseline", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    const { ready } = await createReadyRun(repository);
    await repository.discardProposal(DEMO_A, ready.runId, LATER);

    expect((await repository.getRun(ready.runId))?.status).toBe("discarded");
    const instance = await repository.getDemo(DEMO_A);
    expect(instance?.openRunId).toBeNull();
    expect(instance?.planVersion).toBe(1);
    expect(instance?.currentPlan).toEqual(immutableBaselinePlan);
  });

  it("resets without replacing the browser identity or refunding usage", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    const { ready } = await createReadyRun(repository);
    const reset = await repository.resetDemo(DEMO_A, LATER);

    expect(reset.demoId).toBe(DEMO_A);
    expect(reset.cycle).toBe(2);
    expect(reset.planVersion).toBe(1);
    expect(reset.currentPlan).toEqual(immutableBaselinePlan);
    expect((await repository.getRun(ready.runId))?.status).toBe("superseded");
    expect((await repository.getDailyUsage("2026-09-04"))?.acceptedStarts).toBe(
      1,
    );
  });

  it("blocks reset during live work and clears a failed enqueue safely", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(DEMO_A, NOW);
    const created = await repository.createQueuedRun({
      demoId: DEMO_A,
      idempotencyKey: randomUUID(),
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 20,
      now: NOW,
    });
    await expectStateError(
      repository.resetDemo(DEMO_A, LATER),
      "RESET_BLOCKED_BY_LIVE_RUN",
    );

    await repository.markEnqueueFailed(
      created.run.runId,
      {
        code: "TASK_ENQUEUE_FAILED",
        message: "The revision could not be queued. Try again.",
        baselineChanged: false,
        retryable: true,
      },
      LATER,
    );
    expect((await repository.getRun(created.run.runId))?.status).toBe("failed");
    expect((await repository.getDemo(DEMO_A))?.openRunId).toBeNull();
  });

  it("records semantic rejection without refunding usage or changing baseline", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(DEMO_A, NOW);
    const created = await repository.createQueuedRun({
      demoId: DEMO_A,
      idempotencyKey: IDEMPOTENCY_A,
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 20,
      now: NOW,
    });
    const claim = await repository.claimRun(created.run.runId, 30_000, NOW);
    if (claim.outcome !== "claimed") throw new Error("Run was not claimed");

    await repository.rejectRun(
      created.run.runId,
      claim.executionToken,
      {
        code: "REVISION_NOT_ACTIONABLE",
        message: "The requested change is not production-relevant.",
        baselineChanged: false,
        retryable: false,
        stage: "breakdown",
      },
      LATER,
    );
    expect((await repository.getRun(created.run.runId))?.status).toBe("rejected");
    expect((await repository.getDemo(DEMO_A))?.currentPlan).toEqual(
      immutableBaselinePlan,
    );
    expect((await repository.getDailyUsage("2026-09-04"))?.acceptedStarts).toBe(
      1,
    );
  });
});
