import { redirect } from "next/navigation";
import { AccessNotice } from "@/components/dashboard/access-notice";
import { NewProjectForm } from "@/components/projects/project-workspace";
import { requireProjectActor } from "@/lib/auth/require-project-actor";
export const dynamic = "force-dynamic";
export default async function NewProjectPage() { const actor = await requireProjectActor(); if (actor instanceof Response) { if (actor.status === 401) redirect("/sign-in"); return <AccessNotice kind={actor.status === 403 ? "forbidden" : "misconfigured"} />; } return <NewProjectForm />; }
