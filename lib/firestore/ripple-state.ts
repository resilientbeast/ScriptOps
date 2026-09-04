import { createHash, randomUUID } from "node:crypto";

import type { StageProgress } from "@/lib/domain/types";
import { immutableBaselinePlan } from "@/lib/domain/fixtures";
import {
  productionPlanSchema,
  publicErrorSchema,
  revisionProposalSchema,
  stageNameSchema,
  stageProgressSchema,
} from "@/lib/domain/schemas";
import {
  dailyUsageSchema,
  demoInstanceSchema,
  rippleRunSchema,
  type DailyUsage,
  type DemoInstance,
  type RippleRun,
} from "@/lib/firestore/state-types";
import type {
  StateTransaction,
  TransactionalStateStore,
} from "@/lib/firestore/transaction-store";

export const stateErrorCodes = [
  "DEMO_NOT_FOUND",
  "RUN_NOT_FOUND",
  "RUN_OWNERSHIP_MISMATCH",
  "SCENE_NOT_FOUND",
  "OPEN_RUN_EXISTS",
  "RIPPLE_ALREADY_APPROVED",
  "DAILY_CAP_REACHED",
  "RUN_NOT_QUEUED",
  "RUN_LEASE_ACTIVE",
  "RUN_LEASE_LOST",
  "INVALID_STAGE_TRANSITION",
  "STAGES_INCOMPLETE",
  "PROPOSAL_MISMATCH",
  "RUN_NOT_PROPOSAL_READY",
  "CYCLE_MISMATCH",
  "PLAN_VERSION_MISMATCH",
  "OPEN_RUN_MISMATCH",
  "RESET_BLOCKED_BY_LIVE_RUN",
] as const;

export type StateErrorCode = (typeof stateErrorCodes)[number];

export class StateConflictError extends Error {
  constructor(readonly code: StateErrorCode) {
    super(code);
    this.name = "StateConflictError";
  }
}

const stageNames = [
  "breakdown",
  "evidence",
  "schedule",
  "budget",
  "locations",
  "casting",
] as const;

const terminalRunStatuses = new Set([
  "rejected",
  "proposal_ready",
  "failed",
  "discarded",
  "approved",
  "superseded",
]);

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function initialStages(): RippleRun["stages"] {
  return Object.fromEntries(
    stageNames.map((stage) => [
      stage,
      {
        status: "pending",
        message: `${stage} pending`,
        startedAt: null,
        completedAt: null,
        failure: null,
      },
    ]),
  ) as RippleRun["stages"];
}

export function deriveRunId(
  demoId: string,
  cycle: number,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256")
    .update(`${demoId}:${cycle}:${idempotencyKey}`, "utf8")
    .digest("hex");
  const versioned = `${digest.slice(0, 12)}5${digest.slice(13, 16)}`;
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  const uuidHex = `${versioned}${variant}${digest.slice(17, 32)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20, 32)}`;
}

export type CreateRunInput = {
  demoId: string;
  idempotencyKey: string;
  sceneId: string;
  requestText: string;
  dailyCap: number;
  now?: Date;
};

export type ClaimRunResult =
  | { outcome: "claimed"; executionToken: string; attempt: number }
  | { outcome: "already-running" | "terminal" };

export class RippleStateRepository {
  constructor(private readonly store: TransactionalStateStore) {}

  initializeDemo(demoId: string, now = new Date()): Promise<DemoInstance> {
    return this.store.runTransaction(async (transaction) => {
      const existing = await transaction.get<DemoInstance>(
        "demoInstances",
        demoId,
      );
      if (existing) {
        return demoInstanceSchema.parse(existing);
      }

      const instance = demoInstanceSchema.parse({
        demoId,
        fixtureVersion: immutableBaselinePlan.fixtureVersion,
        cycle: 1,
        planVersion: 1,
        currentPlan: immutableBaselinePlan,
        openRunId: null,
        approvedRunId: null,
        hasApprovedRipple: false,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set("demoInstances", demoId, instance);
      return instance;
    });
  }

  createQueuedRun(input: CreateRunInput): Promise<{
    outcome: "created" | "duplicate";
    run: RippleRun;
  }> {
    const now = input.now ?? new Date();

    return this.store.runTransaction(async (transaction) => {
      const instance = await this.requireDemo(transaction, input.demoId);
      const runId = deriveRunId(
        instance.demoId,
        instance.cycle,
        input.idempotencyKey,
      );
      const dateUtc = utcDateKey(now);
      const [existing, usage] = await Promise.all([
        transaction.get<RippleRun>("rippleRuns", runId),
        transaction.get<DailyUsage>("usageDaily", dateUtc),
      ]);

      if (existing) {
        const run = rippleRunSchema.parse(existing);
        if (run.demoId !== input.demoId) {
          throw new StateConflictError("RUN_OWNERSHIP_MISMATCH");
        }
        return { outcome: "duplicate", run };
      }

      if (instance.hasApprovedRipple) {
        throw new StateConflictError("RIPPLE_ALREADY_APPROVED");
      }
      if (instance.openRunId !== null) {
        throw new StateConflictError("OPEN_RUN_EXISTS");
      }
      if (!instance.currentPlan.scenes.some((scene) => scene.id === input.sceneId)) {
        throw new StateConflictError("SCENE_NOT_FOUND");
      }

      const parsedUsage = usage ? dailyUsageSchema.parse(usage) : null;
      const cap = parsedUsage?.cap ?? input.dailyCap;
      const acceptedStarts = parsedUsage?.acceptedStarts ?? 0;
      if (acceptedStarts >= cap) {
        throw new StateConflictError("DAILY_CAP_REACHED");
      }

      const run = rippleRunSchema.parse({
        runId,
        demoId: instance.demoId,
        cycle: instance.cycle,
        basePlanVersion: instance.planVersion,
        idempotencyKey: input.idempotencyKey,
        sceneId: input.sceneId,
        requestText: input.requestText,
        status: "queued",
        stages: initialStages(),
        proposal: null,
        failure: null,
        executionAttempt: 0,
        executionToken: null,
        heartbeatAt: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        approvedAt: null,
      });
      const nextUsage = dailyUsageSchema.parse({
        dateUtc,
        acceptedStarts: acceptedStarts + 1,
        cap,
        updatedAt: now,
      });

      transaction.set("rippleRuns", runId, run);
      transaction.update<DemoInstance>("demoInstances", instance.demoId, {
        openRunId: runId,
        updatedAt: now,
      });
      transaction.set("usageDaily", dateUtc, nextUsage);

      return { outcome: "created", run };
    });
  }

  claimRun(
    runId: string,
    staleAfterMs: number,
    now = new Date(),
  ): Promise<ClaimRunResult> {
    return this.store.runTransaction(async (transaction) => {
      const run = await this.requireRun(transaction, runId);
      if (terminalRunStatuses.has(run.status)) {
        return { outcome: "terminal" };
      }

      if (run.status === "analyzing") {
        const leaseTime = run.heartbeatAt ?? run.startedAt;
        if (leaseTime && now.getTime() - leaseTime.getTime() <= staleAfterMs) {
          return { outcome: "already-running" };
        }
      } else if (run.status !== "queued") {
        throw new StateConflictError("RUN_NOT_QUEUED");
      }

      const executionToken = randomUUID();
      const attempt = run.executionAttempt + 1;
      transaction.update<RippleRun>("rippleRuns", runId, {
        status: "analyzing",
        executionToken,
        executionAttempt: attempt,
        heartbeatAt: now,
        startedAt: run.startedAt ?? now,
        failure: null,
      });
      return { outcome: "claimed", executionToken, attempt };
    });
  }

  heartbeatRun(runId: string, executionToken: string, now = new Date()) {
    return this.store.runTransaction(async (transaction) => {
      const run = await this.requireOwnedLease(
        transaction,
        runId,
        executionToken,
      );
      transaction.update<RippleRun>("rippleRuns", run.runId, {
        heartbeatAt: now,
      });
      return true;
    });
  }

  transitionStage(
    runId: string,
    executionToken: string,
    stageInput: string,
    next: StageProgress,
  ) {
    const stage = stageNameSchema.parse(stageInput);
    const progress = stageProgressSchema.parse(next);

    return this.store.runTransaction(async (transaction) => {
      const run = await this.requireOwnedLease(
        transaction,
        runId,
        executionToken,
      );
      const current = run.stages[stage];
      const allowed =
        (current.status === "pending" && progress.status === "active") ||
        (current.status === "active" &&
          (progress.status === "completed" || progress.status === "failed"));

      if (!allowed) {
        throw new StateConflictError("INVALID_STAGE_TRANSITION");
      }

      transaction.update<RippleRun>("rippleRuns", runId, {
        stages: { ...run.stages, [stage]: progress },
      });
      return progress;
    });
  }

  writeProposal(
    runId: string,
    executionToken: string,
    proposalInput: unknown,
    now = new Date(),
  ): Promise<RippleRun> {
    const proposal = revisionProposalSchema.parse(proposalInput);

    return this.store.runTransaction(async (transaction) => {
      const run = await this.requireOwnedLease(
        transaction,
        runId,
        executionToken,
      );
      if (
        proposal.runId !== run.runId ||
        proposal.sceneId !== run.sceneId ||
        proposal.basePlanVersion !== run.basePlanVersion
      ) {
        throw new StateConflictError("PROPOSAL_MISMATCH");
      }
      if (!stageNames.every((stage) => run.stages[stage].status === "completed")) {
        throw new StateConflictError("STAGES_INCOMPLETE");
      }

      const updated = rippleRunSchema.parse({
        ...run,
        status: "proposal_ready",
        proposal,
        executionToken: null,
        heartbeatAt: now,
        finishedAt: now,
      });
      transaction.set("rippleRuns", runId, updated);
      return updated;
    });
  }

  markEnqueueFailed(runId: string, failureInput: unknown, now = new Date()) {
    const failure = publicErrorSchema.parse(failureInput);
    return this.finishFailedRun(runId, null, failure, now);
  }

  failRun(
    runId: string,
    executionToken: string,
    failureInput: unknown,
    now = new Date(),
  ) {
    const failure = publicErrorSchema.parse(failureInput);
    return this.finishFailedRun(runId, executionToken, failure, now);
  }

  rejectRun(
    runId: string,
    executionToken: string,
    failureInput: unknown,
    now = new Date(),
  ) {
    const failure = publicErrorSchema.parse(failureInput);
    return this.store.runTransaction(async (transaction) => {
      const run = await this.requireOwnedLease(
        transaction,
        runId,
        executionToken,
      );
      const instance = await this.requireDemo(transaction, run.demoId);
      const rejectedRun = rippleRunSchema.parse({
        ...run,
        status: "rejected",
        executionToken: null,
        heartbeatAt: now,
        finishedAt: now,
        failure,
      });
      transaction.set("rippleRuns", runId, rejectedRun);
      if (instance.openRunId === runId) {
        transaction.update<DemoInstance>("demoInstances", run.demoId, {
          openRunId: null,
          updatedAt: now,
        });
      }
      return rejectedRun;
    });
  }

  discardProposal(demoId: string, runId: string, now = new Date()) {
    return this.store.runTransaction(async (transaction) => {
      const [instance, run] = await Promise.all([
        this.requireDemo(transaction, demoId),
        this.requireRun(transaction, runId),
      ]);
      this.requireOwnership(instance, run);
      if (run.status !== "proposal_ready") {
        throw new StateConflictError("RUN_NOT_PROPOSAL_READY");
      }
      if (instance.openRunId !== runId) {
        throw new StateConflictError("OPEN_RUN_MISMATCH");
      }

      transaction.update<RippleRun>("rippleRuns", runId, {
        status: "discarded",
        finishedAt: now,
      });
      transaction.update<DemoInstance>("demoInstances", demoId, {
        openRunId: null,
        updatedAt: now,
      });
      return { outcome: "discarded" as const };
    });
  }

  approveProposal(demoId: string, runId: string, now = new Date()) {
    return this.store.runTransaction(async (transaction) => {
      const [instance, run] = await Promise.all([
        this.requireDemo(transaction, demoId),
        this.requireRun(transaction, runId),
      ]);
      this.requireOwnership(instance, run);

      if (
        run.status === "approved" &&
        instance.approvedRunId === runId &&
        instance.hasApprovedRipple
      ) {
        return { outcome: "duplicate" as const, instance, run };
      }
      if (run.status !== "proposal_ready" || run.proposal === null) {
        throw new StateConflictError("RUN_NOT_PROPOSAL_READY");
      }
      if (instance.cycle !== run.cycle) {
        throw new StateConflictError("CYCLE_MISMATCH");
      }
      if (instance.planVersion !== run.basePlanVersion) {
        throw new StateConflictError("PLAN_VERSION_MISMATCH");
      }
      if (instance.openRunId !== runId) {
        throw new StateConflictError("OPEN_RUN_MISMATCH");
      }
      if (instance.hasApprovedRipple) {
        throw new StateConflictError("RIPPLE_ALREADY_APPROVED");
      }

      const proposal = revisionProposalSchema.parse(run.proposal);
      const nextVersion = instance.planVersion + 1;
      const approvedPlan = productionPlanSchema.parse({
        ...proposal.proposedPlan,
        revisionRecord: {
          runId: proposal.runId,
          sceneId: proposal.sceneId,
          requestText: proposal.requestText,
          basePlanVersion: proposal.basePlanVersion,
          planVersion: nextVersion,
          approvedAt: now.toISOString(),
          evidenceSourceMode: proposal.evidence.sourceMode,
        },
      });
      const approvedInstance = demoInstanceSchema.parse({
        ...instance,
        planVersion: nextVersion,
        currentPlan: approvedPlan,
        openRunId: null,
        approvedRunId: runId,
        hasApprovedRipple: true,
        updatedAt: now,
      });
      const approvedRun = rippleRunSchema.parse({
        ...run,
        status: "approved",
        approvedAt: now,
        finishedAt: run.finishedAt ?? now,
      });

      transaction.set("demoInstances", demoId, approvedInstance);
      transaction.set("rippleRuns", runId, approvedRun);
      return {
        outcome: "approved" as const,
        instance: approvedInstance,
        run: approvedRun,
      };
    });
  }

  resetDemo(demoId: string, now = new Date()) {
    return this.store.runTransaction(async (transaction) => {
      const instance = await this.requireDemo(transaction, demoId);
      const openRun = instance.openRunId
        ? await this.requireRun(transaction, instance.openRunId)
        : null;

      if (
        openRun &&
        (openRun.status === "queued" || openRun.status === "analyzing")
      ) {
        throw new StateConflictError("RESET_BLOCKED_BY_LIVE_RUN");
      }

      const resetInstance = demoInstanceSchema.parse({
        ...instance,
        cycle: instance.cycle + 1,
        planVersion: 1,
        currentPlan: immutableBaselinePlan,
        openRunId: null,
        approvedRunId: null,
        hasApprovedRipple: false,
        updatedAt: now,
      });

      if (openRun && openRun.status === "proposal_ready") {
        transaction.update<RippleRun>("rippleRuns", openRun.runId, {
          status: "superseded",
          finishedAt: now,
        });
      }
      transaction.set("demoInstances", demoId, resetInstance);
      return resetInstance;
    });
  }

  getDemo(demoId: string): Promise<DemoInstance | null> {
    return this.store.runTransaction(async (transaction) => {
      const instance = await transaction.get<DemoInstance>(
        "demoInstances",
        demoId,
      );
      return instance ? demoInstanceSchema.parse(instance) : null;
    });
  }

  getRun(runId: string): Promise<RippleRun | null> {
    return this.store.runTransaction(async (transaction) => {
      const run = await transaction.get<RippleRun>("rippleRuns", runId);
      return run ? rippleRunSchema.parse(run) : null;
    });
  }

  getDailyUsage(dateUtc: string): Promise<DailyUsage | null> {
    return this.store.runTransaction(async (transaction) => {
      const usage = await transaction.get<DailyUsage>("usageDaily", dateUtc);
      return usage ? dailyUsageSchema.parse(usage) : null;
    });
  }

  private async finishFailedRun(
    runId: string,
    executionToken: string | null,
    failure: RippleRun["failure"],
    now: Date,
  ) {
    return this.store.runTransaction(async (transaction) => {
      const run = await this.requireRun(transaction, runId);
      const instance = await this.requireDemo(transaction, run.demoId);
      if (executionToken === null) {
        if (run.status !== "queued") {
          throw new StateConflictError("RUN_NOT_QUEUED");
        }
      } else if (
        run.status !== "analyzing" ||
        run.executionToken !== executionToken
      ) {
        throw new StateConflictError("RUN_LEASE_LOST");
      }

      const failedRun = rippleRunSchema.parse({
        ...run,
        status: "failed",
        executionToken: null,
        heartbeatAt: now,
        finishedAt: now,
        failure,
      });
      transaction.set("rippleRuns", runId, failedRun);
      if (instance.openRunId === runId) {
        transaction.update<DemoInstance>("demoInstances", run.demoId, {
          openRunId: null,
          updatedAt: now,
        });
      }
      return failedRun;
    });
  }

  private async requireDemo(
    transaction: StateTransaction,
    demoId: string,
  ): Promise<DemoInstance> {
    const instance = await transaction.get<DemoInstance>(
      "demoInstances",
      demoId,
    );
    if (!instance) {
      throw new StateConflictError("DEMO_NOT_FOUND");
    }
    return demoInstanceSchema.parse(instance);
  }

  private async requireRun(
    transaction: StateTransaction,
    runId: string,
  ): Promise<RippleRun> {
    const run = await transaction.get<RippleRun>("rippleRuns", runId);
    if (!run) {
      throw new StateConflictError("RUN_NOT_FOUND");
    }
    return rippleRunSchema.parse(run);
  }

  private async requireOwnedLease(
    transaction: StateTransaction,
    runId: string,
    executionToken: string,
  ): Promise<RippleRun> {
    const run = await this.requireRun(transaction, runId);
    if (run.status !== "analyzing" || run.executionToken !== executionToken) {
      throw new StateConflictError("RUN_LEASE_LOST");
    }
    return run;
  }

  private requireOwnership(instance: DemoInstance, run: RippleRun): void {
    if (instance.demoId !== run.demoId) {
      throw new StateConflictError("RUN_OWNERSHIP_MISMATCH");
    }
  }
}
