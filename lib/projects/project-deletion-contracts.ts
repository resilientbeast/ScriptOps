import type { Project } from "@/lib/projects/schemas";

export function assertProjectWrite(project: Project | null, expectedEpoch: number, scriptId?: string) {
  if (!project || project.lifecycle !== "active" || project.writeEpoch !== expectedEpoch || (scriptId && project.activeScriptVersionId !== scriptId)) throw new Error("PROJECT_WRITE_FENCED");
}
