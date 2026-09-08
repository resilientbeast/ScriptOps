import { notFound, redirect } from "next/navigation";

import { AccessNotice } from "@/components/dashboard/access-notice";
import { ProjectEmptyWorkspace } from "@/components/projects/project-workspace";
import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getProjectStateRepository } from "@/lib/projects/project-state-admin";
import type { SceneReviewRevision } from "@/lib/scripts/scene-review-state";
import { scriptVersionSchema, type ScriptVersion } from "@/lib/scripts/schemas";
import type { SourceBlock } from "@/lib/ingestion/contracts";
import { projectPlanSchema, type ProjectPlan } from "@/lib/planning/initial-plan-approval";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) {
    if (actor.status === 401) redirect("/sign-in");
    return <AccessNotice kind={actor.status === 403 ? "forbidden" : "misconfigured"} />;
  }
  const projectId = (await params).projectId;
  const project = await getProjectStateRepository().getOwnedProject(actor.userId, projectId);
  if (!project) notFound();

  let script: ScriptVersion | null = null;
  let revision: SceneReviewRevision | null = null;
  let sourceBlocks: SourceBlock[] = [];
  let approvedPlan: ProjectPlan | null = null;
  if (project.activeScriptVersionId) {
    const projectRef = getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!).collection("projects").doc(projectId);
    const scriptSnapshot = await projectRef.collection("scripts").doc(project.activeScriptVersionId).get();
    const parsedScript = scriptSnapshot.exists ? scriptVersionSchema.safeParse(scriptSnapshot.data()) : null;
    script = parsedScript?.success ? parsedScript.data : null;
    if (script?.currentReviewRevisionId) {
      const revisionSnapshot = await projectRef.collection("sceneRevisions").doc(script.currentReviewRevisionId).get();
      revision = revisionSnapshot.exists ? revisionSnapshot.data() as SceneReviewRevision : null;
    }
    if (script?.status === "review-ready") {
      const blocksSnapshot = await projectRef.collection("scripts").doc(script.id).collection("sourceBlocks").orderBy("blockIndex").get();
      sourceBlocks = blocksSnapshot.docs.map(document => document.data() as SourceBlock);
    }
  }
  if (project.approvedPlanVersion > 0) {
    const planSnapshot = await getAdminFirestore(process.env.GOOGLE_CLOUD_PROJECT!).collection("projects").doc(projectId).collection("plans").doc(`v${project.approvedPlanVersion}`).get();
    const parsedPlan = planSnapshot.exists ? projectPlanSchema.safeParse(planSnapshot.data()) : null;
    approvedPlan = parsedPlan?.success ? parsedPlan.data : null;
  }
  return <ProjectEmptyWorkspace project={project} script={script} revision={revision} sourceBlocks={sourceBlocks} approvedPlan={approvedPlan} planningEnabled={process.env.PROJECT_PLANNING_ENABLED === "true"} />;
}
