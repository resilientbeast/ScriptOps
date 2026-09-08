import type { Firestore } from "firebase-admin/firestore";
import type { ParsedScriptManifest } from "@/lib/ingestion/worker";
import { assertProjectWrite } from "@/lib/projects/project-deletion-contracts";
import { projectSchema } from "@/lib/projects/schemas";

export type StoredScriptManifest = Omit<ParsedScriptManifest, "screenplay"> & { scriptId: string; createdAt: string; scenes: ParsedScriptManifest["screenplay"]["scenes"] };
export class InMemoryScriptIngestionStore {
  private readonly manifests = new Map<string, StoredScriptManifest>();
  private readonly blocks = new Map<string, ParsedScriptManifest["screenplay"]["blocks"]>();
  async save(projectId: string, scriptId: string, manifest: ParsedScriptManifest) { const key = `${projectId}/${scriptId}`; const stored = { ...manifest, screenplay: undefined, scriptId, createdAt: new Date().toISOString() }; const record: StoredScriptManifest = { parserVersion: stored.parserVersion, format: stored.format, blockCount: stored.blockCount, sceneCount: stored.sceneCount, sourceCoverage: stored.sourceCoverage, warnings: stored.warnings, contentHash: stored.contentHash, scriptId, createdAt: stored.createdAt, scenes: manifest.screenplay.scenes }; const prior = this.manifests.get(key); if (prior && prior.contentHash !== record.contentHash) throw new Error("SCRIPT_MANIFEST_CONTENT_CONFLICT"); this.manifests.set(key, structuredClone(record)); this.blocks.set(key, structuredClone(manifest.screenplay.blocks)); return record; }
  async get(projectId: string, scriptId: string) { return this.manifests.get(`${projectId}/${scriptId}`) ?? null; }
}
export class FirestoreScriptIngestionStore {
  constructor(private readonly firestore: Firestore, private readonly expectedWriteEpoch: number) {}
  async save(projectId: string, scriptId: string, manifest: ParsedScriptManifest) { const project = this.firestore.collection("projects").doc(projectId); const script = project.collection("scripts").doc(scriptId); const manifestRef = script.collection("manifests").doc("parse-v1"); return this.firestore.runTransaction(async transaction => { const [projectSnapshot, prior] = await Promise.all([transaction.get(project), transaction.get(manifestRef)]); assertProjectWrite(projectSnapshot.exists ? projectSchema.parse(projectSnapshot.data()) : null, this.expectedWriteEpoch, scriptId); if (prior.exists && prior.data()?.contentHash !== manifest.contentHash) throw new Error("SCRIPT_MANIFEST_CONTENT_CONFLICT"); const record: StoredScriptManifest = { parserVersion: manifest.parserVersion, format: manifest.format, blockCount: manifest.blockCount, sceneCount: manifest.sceneCount, sourceCoverage: manifest.sourceCoverage, warnings: manifest.warnings, contentHash: manifest.contentHash, scriptId, createdAt: new Date().toISOString(), scenes: manifest.screenplay.scenes }; transaction.set(manifestRef, record); manifest.screenplay.blocks.forEach(block => transaction.set(script.collection("sourceBlocks").doc(block.id.replaceAll("/", "_")), block)); return record; }); }
}
