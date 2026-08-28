import { randomUUID } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";

export type SmokeRunStatus = "queued" | "analyzing" | "completed" | "failed";

export type SmokeRun = {
  runId: string;
  status: SmokeRunStatus;
  taskName: string | null;
  executionToken: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
};

export type SmokeRunClaim =
  | { outcome: "claimed"; executionToken: string }
  | { outcome: "already-running" | "terminal" };

const SMOKE_RUNS_COLLECTION = "smokeRuns";

function smokeRunRef(firestore: Firestore, runId: string) {
  return firestore.collection(SMOKE_RUNS_COLLECTION).doc(runId);
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function createSmokeRun(firestore: Firestore, runId: string): Promise<void> {
  const run: SmokeRun = {
    runId,
    status: "queued",
    taskName: null,
    executionToken: null,
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
    failureCode: null,
  };

  await smokeRunRef(firestore, runId).create(run);
}

export async function attachSmokeTask(
  firestore: Firestore,
  runId: string,
  taskName: string,
): Promise<void> {
  await smokeRunRef(firestore, runId).update({ taskName });
}

export async function markSmokeEnqueueFailed(
  firestore: Firestore,
  runId: string,
): Promise<void> {
  await smokeRunRef(firestore, runId).update({
    status: "failed",
    completedAt: nowIso(),
    failureCode: "TASK_ENQUEUE_FAILED",
  });
}

export async function claimSmokeRun(
  firestore: Firestore,
  runId: string,
): Promise<SmokeRunClaim> {
  return firestore.runTransaction(async (transaction) => {
    const reference = smokeRunRef(firestore, runId);
    const snapshot = await transaction.get(reference);

    if (!snapshot.exists) {
      throw new Error("SMOKE_RUN_NOT_FOUND");
    }

    const run = snapshot.data() as SmokeRun;

    if (run.status === "completed" || run.status === "failed") {
      return { outcome: "terminal" };
    }

    if (run.status === "analyzing") {
      return { outcome: "already-running" };
    }

    const executionToken = randomUUID();
    transaction.update(reference, {
      status: "analyzing",
      executionToken,
      startedAt: nowIso(),
      failureCode: null,
    });

    return { outcome: "claimed", executionToken };
  });
}

export async function completeSmokeRun(
  firestore: Firestore,
  runId: string,
  executionToken: string,
): Promise<boolean> {
  return firestore.runTransaction(async (transaction) => {
    const reference = smokeRunRef(firestore, runId);
    const snapshot = await transaction.get(reference);
    const run = snapshot.data() as SmokeRun | undefined;

    if (
      !snapshot.exists ||
      run?.status !== "analyzing" ||
      run.executionToken !== executionToken
    ) {
      return false;
    }

    transaction.update(reference, {
      status: "completed",
      completedAt: nowIso(),
      failureCode: null,
    });

    return true;
  });
}

export async function failSmokeRun(
  firestore: Firestore,
  runId: string,
  executionToken: string,
  failureCode: string,
): Promise<void> {
  await firestore.runTransaction(async (transaction) => {
    const reference = smokeRunRef(firestore, runId);
    const snapshot = await transaction.get(reference);
    const run = snapshot.data() as SmokeRun | undefined;

    if (
      !snapshot.exists ||
      run?.status !== "analyzing" ||
      run.executionToken !== executionToken
    ) {
      return;
    }

    transaction.update(reference, {
      status: "failed",
      completedAt: nowIso(),
      failureCode,
    });
  });
}

export async function getSmokeRun(
  firestore: Firestore,
  runId: string,
): Promise<SmokeRun | null> {
  const snapshot = await smokeRunRef(firestore, runId).get();

  return snapshot.exists ? (snapshot.data() as SmokeRun) : null;
}
