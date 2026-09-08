import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { enqueueProjectJobTask } from "@/lib/cloud-tasks/enqueue-project-job";
import type { ProjectTaskRuntimeEnv } from "@/lib/env";
import { FirestoreGenerationRepository } from "@/lib/planning/generation-firestore";
import { FirestoreProjectRippleRepository } from "@/lib/planning/project-ripple-firestore";

export async function dispatchPlanningOutbox(firestore: Firestore, env: ProjectTaskRuntimeEnv) {
  const pending = await firestore.collection("planningOutbox").where("pending", "==", true).limit(30).get();
  let sent = 0;
  for (const doc of pending.docs) {
    const item = doc.data() as { projectId: string; jobId: string; generation: number };
    try {
      await enqueueProjectJobTask(env, item.projectId, item.jobId, item.generation);
      await doc.ref.update({ pending: false, sentAt: new Date().toISOString() });
      sent++;
    } catch { /* Durable pending record is retried by maintenance. */ }
  }
  return sent;
}

export async function reconcilePlanning(firestore: Firestore, env: ProjectTaskRuntimeEnv) {
  const cursorRef = firestore.collection("planningMaintenance").doc("cursor");
  const cursor = (await cursorRef.get()).get("after") as string | undefined;
  const query = firestore.collection("planningActive").orderBy(FieldPath.documentId()).limit(30);
  const active = await (cursor ? query.startAfter(cursor) : query).get();
  const repository = new FirestoreGenerationRepository(firestore);
  for (const doc of active.docs) {
    const { projectId, jobId } = doc.data() as { projectId: string; jobId: string };
    await repository.recover(projectId, jobId);
  }
  const rippleActive = await firestore.collection("rippleActive").limit(30).get();
  const rippleRepository = new FirestoreProjectRippleRepository(firestore);
  for (const doc of rippleActive.docs) {
    const { projectId, jobId } = doc.data() as { projectId: string; jobId: string };
    await rippleRepository.recover(projectId, jobId);
  }
  await cursorRef.set({ after: active.size === 30 ? active.docs.at(-1)!.id : null });
  return dispatchPlanningOutbox(firestore, env);
}
