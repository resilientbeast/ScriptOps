import "server-only";
import { Storage } from "@google-cloud/storage";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { readServerEnv } from "@/lib/env";
import { FirestoreUploadStateStore, InMemoryUploadStateStore, UploadRepository } from "@/lib/uploads/upload-state";
import { ProjectSourceStorage } from "@/lib/uploads/storage";
const key = Symbol.for("scriptops.upload-repository");
const state = globalThis as typeof globalThis & { [key]?: UploadRepository };
export function getUploadRepository(): UploadRepository { if (state[key]) return state[key]; const env = readServerEnv(); if (!env.PROJECT_UPLOAD_BUCKET) { if (process.env.NODE_ENV === "production") throw new Error("PROJECT_UPLOAD_BUCKET is not configured"); throw new Error("PROJECT_UPLOAD_BUCKET is not configured"); } const storage = new ProjectSourceStorage(new Storage({ projectId: env.GOOGLE_CLOUD_PROJECT }), env.PROJECT_UPLOAD_BUCKET); state[key] = new UploadRepository(new FirestoreUploadStateStore(getAdminFirestore(env.GOOGLE_CLOUD_PROJECT!)), storage); return state[key]; }
export function createInMemoryUploadRepository(storage: ConstructorParameters<typeof UploadRepository>[1]) { return new UploadRepository(new InMemoryUploadStateStore(), storage); }
