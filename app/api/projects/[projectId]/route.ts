import { type NextRequest } from "next/server";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { updateProjectRequestSchema } from "@/lib/projects/contracts";
import { deleteProjectRequestSchema } from "@/lib/projects/contracts";
import { getProjectStateRepository } from "@/lib/projects/project-state-admin";
import { ProjectStateConflictError } from "@/lib/projects/project-state";
import { isSameOrigin } from "@/lib/ripple/contracts";
import { beginProjectDeletion, ProjectDeletionError } from "@/lib/projects/project-deletion";
import { enqueueProjectJobTask } from "@/lib/cloud-tasks/enqueue-project-job";
import { readProjectTaskRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound(): Response {
  return Response.json(
    { error: { code: "PROJECT_NOT_FOUND", message: "The project was not found." } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;

  const project = await getProjectStateRepository().getOwnedProject(
    actor.userId,
    (await params).projectId,
  );
  if (!project) return notFound();
  return Response.json({ project }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "ORIGIN_INVALID", message: "The project request origin was rejected." } },
      { status: 403 },
    );
  }
  const parsed = updateProjectRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: { code: "PROJECT_UPDATE_INVALID", message: "Check the project update." } },
      { status: 400 },
    );
  }

  try {
    const project = await getProjectStateRepository().updateOwnedProject({
      ownerUserId: actor.userId,
      projectId: (await params).projectId,
      expectedRecordVersion: parsed.data.recordVersion,
      title: parsed.data.title,
      lifecycle: parsed.data.lifecycle,
    });
    return Response.json({ project }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProjectStateConflictError) {
      if (error.code === "PROJECT_NOT_FOUND" || error.code === "PROJECT_OWNERSHIP_MISMATCH") {
        return notFound();
      }
      return Response.json(
        { error: { code: error.code, message: "The project changed before this update." } },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project update failed", error);
    return Response.json(
      { error: { code: "PROJECT_UPDATE_FAILED", message: "The project could not be updated." } },
      { status: 503 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (!isSameOrigin(request)) return Response.json({ error: { code: "ORIGIN_INVALID", message: "The project request origin was rejected." } }, { status: 403 });
  const parsed = deleteProjectRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "PROJECT_DELETE_INVALID", message: "Type the exact project title to delete it." } }, { status: 400 });
  const projectId = (await params).projectId;
  try {
    const taskEnv = readProjectTaskRuntimeEnv();
    const result = await beginProjectDeletion(getAdminFirestore(taskEnv.GOOGLE_CLOUD_PROJECT), {
      projectId,
      ownerUserId: actor.userId,
      expectedRecordVersion: parsed.data.recordVersion,
      confirmationTitle: parsed.data.confirmationTitle,
    });
    let dispatch = "queued-for-reconciliation";
    try {
      await enqueueProjectJobTask(taskEnv, projectId, result.job.id);
      dispatch = "dispatched";
    } catch {
      // Maintenance picks up the durable deletion job when Cloud Tasks is briefly unavailable.
    }
    return Response.json({ deletionJobId: result.job.id, status: result.tombstone.status, dispatch }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProjectDeletionError) {
      if (error.code === "PROJECT_NOT_FOUND") return notFound();
      return Response.json({ error: { code: error.code, message: error.code === "PROJECT_CONFIRMATION_MISMATCH" ? "The confirmation title does not match." : "The project changed before deletion." } }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Project deletion could not be started", error);
    return Response.json({ error: { code: "PROJECT_DELETE_FAILED", message: "The project deletion could not be started." } }, { status: 503 });
  }
}
