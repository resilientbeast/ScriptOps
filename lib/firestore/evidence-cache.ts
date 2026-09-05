import "server-only";

import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { evidenceBundleSchema } from "@/lib/domain/schemas";
import type { EvidenceBundle } from "@/lib/domain/types";

export type EvidenceResearchInput = {
  region: "New Mexico";
  objectives: string[];
  searchQueries: string[];
  maxResults: number;
};

const evidenceCacheSchema = z.object({
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  region: z.literal("New Mexico"),
  objectives: z.array(z.string().min(1)).min(1).max(3),
  queries: z.array(z.string().min(1)).min(1).max(4),
  evidence: evidenceBundleSchema,
  retrievedAt: z.date(),
  expiresAt: z.date(),
});

function toDate(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }
  if (Array.isArray(value)) return value.map(toDate);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, toDate(child)]),
    );
  }
  return value;
}

export function evidenceQueryHash(input: EvidenceResearchInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        region: input.region,
        objectives: input.objectives.map((value) => value.trim().toLowerCase()),
        queries: input.searchQueries.map((value) => value.trim().toLowerCase()),
      }),
      "utf8",
    )
    .digest("hex");
}

export interface EvidenceCacheStore {
  read(input: EvidenceResearchInput, now?: Date): Promise<EvidenceBundle | null>;
  write(
    input: EvidenceResearchInput,
    evidence: EvidenceBundle,
    ttlHours: number,
    now?: Date,
  ): Promise<void>;
}

export class FirestoreEvidenceCache implements EvidenceCacheStore {
  constructor(private readonly firestore: Firestore) {}

  async read(
    input: EvidenceResearchInput,
    now = new Date(),
  ): Promise<EvidenceBundle | null> {
    const snapshot = await this.firestore
      .collection("evidenceCache")
      .doc(evidenceQueryHash(input))
      .get();
    if (!snapshot.exists) return null;

    const cached = evidenceCacheSchema.parse(toDate(snapshot.data()));
    if (cached.expiresAt.getTime() <= now.getTime()) return null;
    return evidenceBundleSchema.parse({
      ...cached.evidence,
      sourceMode: "cached",
      records: cached.evidence.records.map((record) => ({
        ...record,
        sourceMode: "cached",
      })),
    });
  }

  async write(
    input: EvidenceResearchInput,
    evidence: EvidenceBundle,
    ttlHours: number,
    now = new Date(),
  ): Promise<void> {
    const parsedEvidence = evidenceBundleSchema.parse(evidence);
    await this.firestore
      .collection("evidenceCache")
      .doc(evidenceQueryHash(input))
      .set(
        evidenceCacheSchema.parse({
          queryHash: evidenceQueryHash(input),
          region: input.region,
          objectives: input.objectives,
          queries: input.searchQueries,
          evidence: parsedEvidence,
          retrievedAt: new Date(parsedEvidence.retrievedAt),
          expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1_000),
        }),
      );
  }
}
