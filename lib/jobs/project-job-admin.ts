import "server-only";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { FirestoreProjectJobRepository } from "@/lib/jobs/project-job-firestore";
export function getProjectJobRepository() { const projectId = process.env.GOOGLE_CLOUD_PROJECT; if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT is not configured"); return new FirestoreProjectJobRepository(getAdminFirestore(projectId)); }
