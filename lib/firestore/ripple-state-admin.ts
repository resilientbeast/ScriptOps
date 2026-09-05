import "server-only";

import { getAdminFirestore } from "@/lib/firestore/admin";
import { RippleStateRepository } from "@/lib/firestore/ripple-state";
import {
  FirestoreStateStore,
  InMemoryStateStore,
} from "@/lib/firestore/transaction-store";

const repositoryKey = Symbol.for("scriptops.ripple-state-repository");
const processState = globalThis as typeof globalThis & {
  [repositoryKey]?: RippleStateRepository;
};

export function getRippleStateRepository(): RippleStateRepository {
  if (processState[repositoryKey]) return processState[repositoryKey];

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (projectId) {
    processState[repositoryKey] = new RippleStateRepository(
      new FirestoreStateStore(getAdminFirestore(projectId)),
    );
    return processState[repositoryKey];
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured");
  }

  processState[repositoryKey] = new RippleStateRepository(
    new InMemoryStateStore(),
  );
  return processState[repositoryKey];
}
