import type { Project } from "@/lib/projects/schemas";

export type ProjectOwner = { userId: string };

export function isOwnedProject(project: Project, actor: ProjectOwner): boolean {
  return project.ownerUserId === actor.userId;
}
