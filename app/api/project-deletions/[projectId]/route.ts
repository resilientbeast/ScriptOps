import { type NextRequest } from "next/server";

import { requireProjectActor } from "@/lib/auth/require-project-actor";
import { readServerEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { readOwnedProjectDeletion } from "@/lib/projects/project-deletion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const actor = await requireProjectActor();
  if (actor instanceof Response) return actor;
  const env = readServerEnv();
  if (!env.GOOGLE_CLOUD_PROJECT) return Response.json({ error: { code: "PROJECT_DELETION_UNAVAILABLE" } }, { status: 503 });
  const deletion = await readOwnedProjectDeletion(getAdminFirestore(env.GOOGLE_CLOUD_PROJECT), (await params).projectId, actor.userId);
  if (!deletion) return Response.json({ error: { code: "PROJECT_DELETION_NOT_FOUND" } }, { status: 404 });
  return Response.json({ deletion }, { headers: { "Cache-Control": "no-store" } });
}
