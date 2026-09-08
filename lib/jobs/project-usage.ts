import type { Firestore } from "firebase-admin/firestore";
export class ProjectUsageError extends Error { constructor(readonly code: "PROJECT_JOB_QUOTA_EXHAUSTED") { super(code); } }
export class ProjectUsageRepository {
  constructor(private readonly firestore: Firestore, private readonly limit = 20) {}
  async reserve(projectId: string, jobId: string): Promise<void> { await this.firestore.runTransaction(async transaction => { const ref = this.firestore.collection("projects").doc(projectId).collection("usage").doc("jobs"); const snapshot = await transaction.get(ref); const value = snapshot.exists ? snapshot.data() as { used: number; jobIds: string[] } : { used: 0, jobIds: [] }; if (value.jobIds.includes(jobId)) return; if (value.used >= this.limit) throw new ProjectUsageError("PROJECT_JOB_QUOTA_EXHAUSTED"); transaction.set(ref, { used: value.used + 1, jobIds: [...value.jobIds, jobId] }); }); }
}
