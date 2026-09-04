import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { approvedExampleFixture } from "@/lib/domain/fixtures";
import { GOLDEN_REQUEST } from "@/lib/domain/golden-invariants";
import type { StageProgress } from "@/lib/domain/types";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { RippleStateRepository } from "@/lib/firestore/ripple-state";
import type { DemoInstance } from "@/lib/firestore/state-types";
import { FirestoreStateStore } from "@/lib/firestore/transaction-store";

const runLive = process.env.RUN_FIRESTORE_INTEGRATION === "1";
const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "";
const namespace = `stateTest${randomUUID().replaceAll("-", "")}`;
const store = runLive
  ? new FirestoreStateStore(getAdminFirestore(projectId), namespace)
  : null;
const repository = store ? new RippleStateRepository(store) : null;

describe.skipIf(!runLive)("isolated Firestore transaction contract", () => {
  afterAll(async () => {
    await store?.clearNamespace();
  });

  it(
    "deduplicates concurrent writes and preserves global usage",
    async () => {
      if (!repository)
        throw new Error("Firestore integration store is unavailable");
      const demoId = randomUUID();
      const idempotencyKey = randomUUID();
      const now = new Date();
      await repository.initializeDemo(demoId, now);
      const input = {
        demoId,
        idempotencyKey,
        sceneId: "scene-14",
        requestText: GOLDEN_REQUEST,
        dailyCap: 20,
        now,
      };

      const results = await Promise.all([
        repository.createQueuedRun(input),
        repository.createQueuedRun(input),
      ]);
      expect(results.map((result) => result.outcome).sort()).toEqual([
        "created",
        "duplicate",
      ]);
      expect(
        (await repository.getDailyUsage(now.toISOString().slice(0, 10)))
          ?.acceptedStarts,
      ).toBe(1);
    },
    30_000,
  );

  it(
    "rejects version drift and makes concurrent approval idempotent",
    async () => {
      if (!repository || !store)
        throw new Error("Firestore integration store is unavailable");
      const demoId = randomUUID();
      const now = new Date();
      await repository.initializeDemo(demoId, now);
      const created = await repository.createQueuedRun({
        demoId,
        idempotencyKey: randomUUID(),
        sceneId: "scene-14",
        requestText: GOLDEN_REQUEST,
        dailyCap: 20,
        now,
      });
      const claim = await repository.claimRun(created.run.runId, 30_000, now);
      if (claim.outcome !== "claimed") throw new Error("Run was not claimed");

      const completed = (stage: string): StageProgress => ({
        status: "completed",
        message: `${stage} completed`,
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        failure: null,
      });
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
          {
            ...completed(stage),
            status: "active",
            completedAt: null,
          },
        );
        await repository.transitionStage(
          created.run.runId,
          claim.executionToken,
          stage,
          completed(stage),
        );
      }

      const proposal = structuredClone(approvedExampleFixture.proposal);
      proposal.runId = created.run.runId;
      await repository.writeProposal(
        created.run.runId,
        claim.executionToken,
        proposal,
        now,
      );

      await store.runTransaction(async (transaction) => {
        transaction.update<DemoInstance>("demoInstances", demoId, {
          planVersion: 2,
        });
      });
      await expect(
        repository.approveProposal(demoId, created.run.runId, now),
      ).rejects.toMatchObject({ code: "PLAN_VERSION_MISMATCH" });
      await store.runTransaction(async (transaction) => {
        transaction.update<DemoInstance>("demoInstances", demoId, {
          planVersion: 1,
        });
      });

      const approvals = await Promise.all([
        repository.approveProposal(demoId, created.run.runId, now),
        repository.approveProposal(demoId, created.run.runId, now),
      ]);
      expect(approvals.map((result) => result.outcome).sort()).toEqual([
        "approved",
        "duplicate",
      ]);
      const instance = await repository.getDemo(demoId);
      expect(instance?.planVersion).toBe(2);
      expect(instance?.currentPlan.schedule).toEqual(proposal.proposedPlan.schedule);
      expect(instance?.currentPlan.budget).toEqual(proposal.proposedPlan.budget);
      expect(instance?.currentPlan.locations).toEqual(proposal.proposedPlan.locations);
      expect(instance?.currentPlan.casting).toEqual(proposal.proposedPlan.casting);
      expect(instance?.currentPlan.scenes).toEqual(proposal.proposedPlan.scenes);
    },
    120_000,
  );
});
