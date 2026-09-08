import { randomUUID } from "node:crypto";

import type { CreatePlanningInputs } from "@/lib/planning/inputs";
import type { PlanningInputs } from "@/lib/planning/schemas";
import { isOwnedProject } from "@/lib/projects/access";
import { projectSchema, type Project } from "@/lib/projects/schemas";

export const projectStateErrorCodes = [
  "PROJECT_NOT_FOUND",
  "PROJECT_OWNERSHIP_MISMATCH",
  "PROJECT_VERSION_MISMATCH",
  "PROJECT_IDEMPOTENCY_CONFLICT",
  "PROJECT_ARCHIVED",
  "PROJECT_BUSY",
] as const;

export type ProjectStateErrorCode = (typeof projectStateErrorCodes)[number];

export class ProjectStateConflictError extends Error {
  constructor(readonly code: ProjectStateErrorCode) {
    super(code);
    this.name = "ProjectStateConflictError";
  }
}

export interface ProjectStateTransaction {
  getProject(id: string): Promise<Project | null>;
  setProject(project: Project): void;
  getPlanningInputs(projectId: string, version: number): Promise<PlanningInputs | null>;
  setPlanningInputs(projectId: string, inputs: PlanningInputs): void;
  getCreateRequest(key: string): Promise<ProjectCreateRequest | null>;
  setCreateRequest(key: string, request: ProjectCreateRequest): void;
}

export type ProjectCreateRequest = {
  ownerUserId: string;
  projectId: string;
  requestHash: string;
};

export interface ProjectStateStore {
  runTransaction<T>(work: (transaction: ProjectStateTransaction) => Promise<T>): Promise<T>;
  listProjects(ownerUserId: string): Promise<Project[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function inputKey(projectId: string, version: number): string {
  return `${projectId}/${version}`;
}

export class InMemoryProjectStateStore implements ProjectStateStore {
  private readonly projects = new Map<string, Project>();
  private readonly planningInputs = new Map<string, PlanningInputs>();
  private readonly createRequests = new Map<string, ProjectCreateRequest>();
  private tail: Promise<void> = Promise.resolve();

  async runTransaction<T>(
    work: (transaction: ProjectStateTransaction) => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const stagedProjects = new Map<string, Project>();
    const stagedInputs = new Map<string, PlanningInputs>();
    const stagedCreateRequests = new Map<string, ProjectCreateRequest>();
    const transaction: ProjectStateTransaction = {
      getProject: async (id) => {
        const project = stagedProjects.get(id) ?? this.projects.get(id);
        return project ? clone(project) : null;
      },
      setProject: (project) => stagedProjects.set(project.id, clone(project)),
      getPlanningInputs: async (projectId, version) => {
        const key = inputKey(projectId, version);
        const inputs = stagedInputs.get(key) ?? this.planningInputs.get(key);
        return inputs ? clone(inputs) : null;
      },
      setPlanningInputs: (projectId, inputs) =>
        stagedInputs.set(inputKey(projectId, inputs.version), clone(inputs)),
      getCreateRequest: async (key) => {
        const request = stagedCreateRequests.get(key) ?? this.createRequests.get(key);
        return request ? clone(request) : null;
      },
      setCreateRequest: (key, request) => stagedCreateRequests.set(key, clone(request)),
    };
    try {
      const result = await work(transaction);
      stagedProjects.forEach((project, id) => this.projects.set(id, project));
      stagedInputs.forEach((inputs, key) => this.planningInputs.set(key, inputs));
      stagedCreateRequests.forEach((request, key) => this.createRequests.set(key, request));
      return result;
    } finally {
      release();
    }
  }

  async listProjects(ownerUserId: string): Promise<Project[]> {
    return [...this.projects.values()]
      .filter((project) => project.ownerUserId === ownerUserId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone);
  }
}

export type CreateProjectInput = {
  ownerUserId: string;
  title: string;
  planningInputs: CreatePlanningInputs;
  now?: Date;
  projectId?: string;
  idempotency?: { key: string; requestHash: string };
};

export type UpdateProjectInput = {
  ownerUserId: string;
  projectId: string;
  expectedRecordVersion: number;
  title?: string;
  lifecycle?: "active" | "archived";
  now?: Date;
};

export class ProjectStateRepository {
  constructor(private readonly store: ProjectStateStore) {}

  async createProject(
    input: CreateProjectInput,
    createInputs: (input: CreatePlanningInputs, now: Date) => PlanningInputs,
  ): Promise<{ project: Project; planningInputs: PlanningInputs; created: boolean }> {
    const now = input.now ?? new Date();
    const projectId = input.projectId ?? randomUUID();
    return this.store.runTransaction(async (transaction) => {
      if (input.idempotency) {
        const prior = await transaction.getCreateRequest(input.idempotency.key);
        if (prior) {
          if (
            prior.ownerUserId !== input.ownerUserId ||
            prior.requestHash !== input.idempotency.requestHash
          ) {
            throw new ProjectStateConflictError("PROJECT_IDEMPOTENCY_CONFLICT");
          }
          const priorProject = await transaction.getProject(prior.projectId);
          const priorInputs = priorProject
            ? await transaction.getPlanningInputs(
                priorProject.id,
                priorProject.planningInputsVersion,
              )
            : null;
          if (!priorProject || !priorInputs) {
            throw new ProjectStateConflictError("PROJECT_VERSION_MISMATCH");
          }
          return { project: priorProject, planningInputs: priorInputs, created: false };
        }
      }
      const existing = await transaction.getProject(projectId);
      if (existing) throw new ProjectStateConflictError("PROJECT_VERSION_MISMATCH");
      const planningInputs = createInputs(input.planningInputs, now);
      const project = projectSchema.parse({
        id: projectId,
        ownerUserId: input.ownerUserId,
        title: input.title,
        lifecycle: "active",
        recordVersion: 1,
        planningInputsVersion: planningInputs.version,
        activeScriptVersionId: null,
        acceptedSceneRevisionId: null,
        approvedPlanVersion: 0,
        approvedManifestId: null,
        activeJobId: null,
        pendingUploadId: null,
        writeEpoch: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      transaction.setProject(project);
      transaction.setPlanningInputs(project.id, planningInputs);
      if (input.idempotency) {
        transaction.setCreateRequest(input.idempotency.key, {
          ownerUserId: input.ownerUserId,
          projectId: project.id,
          requestHash: input.idempotency.requestHash,
        });
      }
      return { project, planningInputs, created: true };
    });
  }

  listOwnedProjects(ownerUserId: string): Promise<Project[]> {
    return this.store.listProjects(ownerUserId);
  }

  async getOwnedProject(ownerUserId: string, projectId: string): Promise<Project | null> {
    return this.store.runTransaction(async (transaction) => {
      const project = await transaction.getProject(projectId);
      if (!project || !isOwnedProject(project, { userId: ownerUserId })) return null;
      return projectSchema.parse(project);
    });
  }

  async updateOwnedProject(input: UpdateProjectInput): Promise<Project> {
    const now = input.now ?? new Date();
    return this.store.runTransaction(async (transaction) => {
      const project = await transaction.getProject(input.projectId);
      if (!project) throw new ProjectStateConflictError("PROJECT_NOT_FOUND");
      if (!isOwnedProject(project, { userId: input.ownerUserId })) {
        throw new ProjectStateConflictError("PROJECT_OWNERSHIP_MISMATCH");
      }
      if (project.recordVersion !== input.expectedRecordVersion) {
        throw new ProjectStateConflictError("PROJECT_VERSION_MISMATCH");
      }
      if (project.lifecycle === "archived" && input.lifecycle !== "active") {
        throw new ProjectStateConflictError("PROJECT_ARCHIVED");
      }
      if (project.lifecycle === "deleting") {
        throw new ProjectStateConflictError("PROJECT_ARCHIVED");
      }
      if (input.lifecycle === "archived" && (project.activeJobId || project.pendingUploadId)) {
        throw new ProjectStateConflictError("PROJECT_BUSY");
      }
      const updated = projectSchema.parse({
        ...project,
        title: input.title ?? project.title,
        lifecycle: input.lifecycle ?? project.lifecycle,
        recordVersion: project.recordVersion + 1,
        updatedAt: now.toISOString(),
      });
      transaction.setProject(updated);
      return updated;
    });
  }

  async getOwnedPlanningInputs(
    ownerUserId: string,
    projectId: string,
  ): Promise<PlanningInputs | null> {
    return this.store.runTransaction(async (transaction) => {
      const project = await transaction.getProject(projectId);
      if (!project || !isOwnedProject(project, { userId: ownerUserId })) return null;
      return transaction.getPlanningInputs(project.id, project.planningInputsVersion);
    });
  }
}
