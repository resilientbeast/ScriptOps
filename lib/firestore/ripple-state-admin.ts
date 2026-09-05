import "server-only";

import { getAdminFirestore } from "@/lib/firestore/admin";
import { RippleStateRepository } from "@/lib/firestore/ripple-state";
import {
  FirestoreStateStore,
  InMemoryStateStore,
} from "@/lib/firestore/transaction-store";

let repository: RippleStateRepository | undefined;

export function getRippleStateRepository(): RippleStateRepository {
  if (repository) return repository;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const shouldUseFirestore =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (projectId && shouldUseFirestore) {
    repository = new RippleStateRepository(
      new FirestoreStateStore(getAdminFirestore(projectId)),
    );
    return repository;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured");
  }

  repository = new RippleStateRepository(new InMemoryStateStore());
  return repository;
}
