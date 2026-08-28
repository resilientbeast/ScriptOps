import { CloudTasksClient } from "@google-cloud/tasks";

import type { SmokeRuntimeEnv } from "@/lib/env";

let cloudTasksClient: CloudTasksClient | undefined;

function getCloudTasksClient(): CloudTasksClient {
  cloudTasksClient ??= new CloudTasksClient();
  return cloudTasksClient;
}

export async function enqueueSmokeTask(
  env: SmokeRuntimeEnv,
  runId: string,
): Promise<string> {
  const client = getCloudTasksClient();
  const parent = client.queuePath(
    env.GOOGLE_CLOUD_PROJECT,
    env.CLOUD_TASKS_LOCATION,
    env.CLOUD_TASKS_QUEUE,
  );
  const taskName = client.taskPath(
    env.GOOGLE_CLOUD_PROJECT,
    env.CLOUD_TASKS_LOCATION,
    env.CLOUD_TASKS_QUEUE,
    `smoke-${runId}`,
  );
  const workerUrl = new URL(
    `/api/internal/smoke/${runId}/execute`,
    env.CLOUD_RUN_BASE_URL,
  ).toString();
  const body = Buffer.from(JSON.stringify({ runId }), "utf8").toString("base64");

  const [task] = await client.createTask({
    parent,
    task: {
      name: taskName,
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + 5,
      },
      httpRequest: {
        // google.cloud.tasks.v2.HttpMethod.POST
        httpMethod: 1,
        url: workerUrl,
        headers: {
          "Content-Type": "application/json",
        },
        body,
        oidcToken: {
          serviceAccountEmail: env.TASK_INVOKER_SERVICE_ACCOUNT,
          audience: env.TASK_OIDC_AUDIENCE,
        },
      },
    },
  });

  if (!task.name) {
    throw new Error("TASK_NAME_MISSING");
  }

  return task.name;
}
