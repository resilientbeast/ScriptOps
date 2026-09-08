import { redirect } from "next/navigation";
import { AccessNotice } from "@/components/dashboard/access-notice";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { getProjectStateRepository } from "@/lib/projects/project-state-admin";
export const dynamic = "force-dynamic";
export default async function ProjectsPage() { const actor = await requireProjectActor(); if (actor instanceof Response) { if (actor.status === 401) redirect("/sign-in"); return <AccessNotice kind={actor.status === 403 ? "forbidden" : "misconfigured"} />; } return <ProjectWorkspace projects={await getProjectStateRepository().listOwnedProjects(actor.userId)} />; }
