import type { Firestore } from "firebase-admin/firestore";

export type ProviderSmokeProvider = "gemini" | "parallel" | "vertex";
export type ProviderSmokeStatus = "completed" | "failed";

export type ProviderSmokeRun = {
  runId: string;
  provider: ProviderSmokeProvider;
  status: ProviderSmokeStatus;
  sdkPackage: "@google/adk" | "@google/genai" | "parallel-web";
  sdkVersion: string;
  modelId: string | null;
  createdAt: string;
  completedAt: string;
  failureCode: string | null;
  diagnosticPaths?: string[];
  result: unknown | null;
};

const PROVIDER_SMOKE_RUNS_COLLECTION = "providerSmokeRuns";

function providerSmokeRunRef(firestore: Firestore, runId: string) {
  return firestore.collection(PROVIDER_SMOKE_RUNS_COLLECTION).doc(runId);
}

export async function saveProviderSmokeRun(
  firestore: Firestore,
  run: ProviderSmokeRun,
): Promise<void> {
  await providerSmokeRunRef(firestore, run.runId).create(run);
}

export async function getProviderSmokeRun(
  firestore: Firestore,
  runId: string,
): Promise<ProviderSmokeRun | null> {
  const snapshot = await providerSmokeRunRef(firestore, runId).get();

  return snapshot.exists ? (snapshot.data() as ProviderSmokeRun) : null;
}
