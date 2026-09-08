import { type NextRequest } from "next/server";
import { TaskIdentityError, verifyTaskRequestIdentity } from "@/lib/cloud-tasks/verify-task-identity";
import { readRippleTaskRuntimeEnv, readServerEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { parseProjectScript } from "@/lib/scripts/parse-project-script";

export const dynamic = "force-dynamic"; export const runtime = "nodejs"; export const maxDuration = 60;
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; scriptId: string }> }) {
  const taskEnv = readRippleTaskRuntimeEnv();
  try { await verifyTaskRequestIdentity(request, { audience: taskEnv.TASK_OIDC_AUDIENCE, serviceAccountEmail: taskEnv.TASK_INVOKER_SERVICE_ACCOUNT }); } catch (error) { return Response.json({ error: error instanceof TaskIdentityError ? error.code : "TASK_IDENTITY_INVALID" }, { status: 401 }); }
  const { projectId, scriptId } = await params; const env = readServerEnv(); if (!env.PROJECT_UPLOAD_BUCKET || !env.GOOGLE_CLOUD_PROJECT) return Response.json({ error: "UPLOAD_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const firestore = getAdminFirestore(env.GOOGLE_CLOUD_PROJECT);
  try { const manifest = await parseProjectScript(firestore, { projectId, scriptId, cloudProjectId: env.GOOGLE_CLOUD_PROJECT, bucket: env.PROJECT_UPLOAD_BUCKET }); return Response.json({ status: "review-ready", sceneCount: manifest.sceneCount, sourceCoverage: manifest.sourceCoverage }, { headers: { "Cache-Control": "no-store" } }); } catch { await firestore.collection("projects").doc(projectId).collection("scripts").doc(scriptId).update({ status: "failed" }).catch(() => undefined); return Response.json({ error: "SCRIPT_PARSE_FAILED" }, { status: 422 }); }
}
