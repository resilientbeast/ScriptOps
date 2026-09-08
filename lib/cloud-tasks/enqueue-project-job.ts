import "server-only";

import { CloudTasksClient } from "@google-cloud/tasks";

import type { ProjectTaskRuntimeEnv } from "@/lib/env";

let cloudTasksClient: CloudTasksClient | undefined;

function getCloudTasksClient(): CloudTasksClient {
  cloudTasksClient ??= new CloudTasksClient();
  return cloudTasksClient;
}

export async function enqueueProjectJobTask(
  env: ProjectTaskRuntimeEnv,
  projectId: string,
  jobId: string,
  deliveryGeneration?: number,
): Promise<string> {
  const client = getCloudTasksClient();
  const parent = client.queuePath(env.GOOGLE_CLOUD_PROJECT, env.CLOUD_TASKS_LOCATION, env.PROJECT_TASKS_QUEUE);
  const taskName = client.taskPath(env.GOOGLE_CLOUD_PROJECT, env.CLOUD_TASKS_LOCATION, env.PROJECT_TASKS_QUEUE, `project-job-${jobId}${deliveryGeneration === undefined ? "" : `-g${deliveryGeneration}`}`);
  const workerUrl = new URL(`/api/internal/projects/${projectId}/jobs/${jobId}/execute`, env.CLOUD_RUN_BASE_URL).toString();
  try {
    const [task] = await client.createTask({ parent, task: { name: taskName, httpRequest: { httpMethod: 1, url: workerUrl, headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ projectId, jobId }), "utf8").toString("base64"), oidcToken: { serviceAccountEmail: env.TASK_INVOKER_SERVICE_ACCOUNT, audience: env.TASK_OIDC_AUDIENCE } } } });
    if (!task.name) throw new Error("TASK_NAME_MISSING");
    return task.name;
  } catch (error) {
    if (isAlreadyExists(error)) return taskName;
    throw error;
  }
}

function isAlreadyExists(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 6;
}
