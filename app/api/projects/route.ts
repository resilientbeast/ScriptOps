import { type NextRequest } from "next/server";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { createPlanningInputs } from "@/lib/planning/inputs";
import {
  createProjectRequestHash,
  createProjectRequestSchema,
  parseIdempotencyKey,
  projectIdempotencyRecordKey,
} from "@/lib/projects/contracts";
import { getProjectStateRepository } from "@/lib/projects/project-state-admin";
import { ProjectStateConflictError } from "@/lib/projects/project-state";
import { isSameOrigin } from "@/lib/ripple/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function conflictResponse(error: ProjectStateConflictError): Response {
  const status = error.code === "PROJECT_IDEMPOTENCY_CONFLICT" ? 422 : 409;
  return Response.json(
    {
      error: {
        code: error.code,
        message:
          error.code === "PROJECT_IDEMPOTENCY_CONFLICT"
            ? "Use a new idempotency key when changing a project request."
            : "The project could not be created safely.",
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;

  const projects = await getProjectStateRepository().listOwnedProjects(actor.userId);
  return Response.json({ projects }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "ORIGIN_INVALID", message: "The project request origin was rejected." } },
      { status: 403 },
    );
  }

  const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
  if (!idempotencyKey) {
    return Response.json(
      { error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Provide an Idempotency-Key header." } },
      { status: 400 },
    );
  }
  const parsed = createProjectRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: { code: "PROJECT_REQUEST_INVALID", message: "Check the project title and planning inputs." } },
      { status: 400 },
    );
  }

  try {
    const result = await getProjectStateRepository().createProject(
      {
        ownerUserId: actor.userId,
        title: parsed.data.title,
        planningInputs: parsed.data.planningInputs,
        idempotency: {
          key: projectIdempotencyRecordKey(actor, idempotencyKey),
          requestHash: createProjectRequestHash(actor, parsed.data),
        },
      },
      createPlanningInputs,
    );
    return Response.json(
      { project: result.project, planningInputs: result.planningInputs },
      {
        status: result.created ? 201 : 200,
        headers: {
          "Cache-Control": "no-store",
          Location: `/api/projects/${result.project.id}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof ProjectStateConflictError) return conflictResponse(error);
    console.error("Project creation failed", error);
    return Response.json(
      { error: { code: "PROJECT_CREATE_FAILED", message: "The project could not be created." } },
      { status: 503 },
    );
  }
}
