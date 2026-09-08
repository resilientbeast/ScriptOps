import "server-only";

import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  InMemoryProjectStateStore,
  ProjectStateRepository,
} from "@/lib/projects/project-state";
import { FirestoreProjectStateStore } from "@/lib/projects/project-state-firestore";

const repositoryKey = Symbol.for("scriptops.project-state-repository");
const processState = globalThis as typeof globalThis & {
  [repositoryKey]?: ProjectStateRepository;
};

export function getProjectStateRepository(): ProjectStateRepository {
  if (processState[repositoryKey]) return processState[repositoryKey];

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (projectId) {
    processState[repositoryKey] = new ProjectStateRepository(
      new FirestoreProjectStateStore(getAdminFirestore(projectId)),
    );
    return processState[repositoryKey];
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured");
  }

  processState[repositoryKey] = new ProjectStateRepository(
    new InMemoryProjectStateStore(),
  );
  return processState[repositoryKey];
}
