import type { Firestore, Transaction } from "firebase-admin/firestore";

import type { PlanningInputs } from "@/lib/planning/schemas";
import type { Project } from "@/lib/projects/schemas";
import type {
  ProjectCreateRequest,
  ProjectStateStore,
  ProjectStateTransaction,
} from "@/lib/projects/project-state";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class FirestoreProjectStateStore implements ProjectStateStore {
  constructor(private readonly firestore: Firestore) {}

  runTransaction<T>(
    work: (transaction: ProjectStateTransaction) => Promise<T>,
  ): Promise<T> {
    return this.firestore.runTransaction((nativeTransaction) =>
      work(this.wrap(nativeTransaction)),
    );
  }

  async listProjects(ownerUserId: string): Promise<Project[]> {
    const snapshot = await this.firestore
      .collection("projects")
      .where("ownerUserId", "==", ownerUserId)
      .get();
    return snapshot.docs
      .map((document) => document.data() as Project)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }

  private wrap(transaction: Transaction): ProjectStateTransaction {
    return {
      getProject: async (id) => {
        const snapshot = await transaction.get(this.firestore.collection("projects").doc(id));
        return snapshot.exists ? clone(snapshot.data() as Project) : null;
      },
      setProject: (project) => {
        transaction.set(this.firestore.collection("projects").doc(project.id), project);
      },
      getPlanningInputs: async (projectId, version) => {
        const snapshot = await transaction.get(
          this.firestore.collection("projects").doc(projectId).collection("inputs").doc(String(version)),
        );
        return snapshot.exists ? clone(snapshot.data() as PlanningInputs) : null;
      },
      setPlanningInputs: (projectId, inputs) => {
        transaction.set(
          this.firestore
            .collection("projects")
            .doc(projectId)
            .collection("inputs")
            .doc(String(inputs.version)),
          inputs,
        );
      },
      getCreateRequest: async (key) => {
        const snapshot = await transaction.get(
          this.firestore.collection("projectCreateRequests").doc(key),
        );
        return snapshot.exists ? clone(snapshot.data() as ProjectCreateRequest) : null;
      },
      setCreateRequest: (key, request) => {
        transaction.set(this.firestore.collection("projectCreateRequests").doc(key), request);
      },
    };
  }
}
