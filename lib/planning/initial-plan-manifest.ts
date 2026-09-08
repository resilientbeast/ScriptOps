import { randomUUID } from "node:crypto";
import { z } from "zod";
import { addDocumentSizeIssue } from "@/lib/domain/invariants";

import { initialPlanDraftHash } from "@/lib/planning/initial-plan";
import { initialPlanDraftSchema, type InitialPlanDraft } from "@/lib/planning/schemas";

export const initialPlanManifestSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("initial"),
  status: z.literal("complete"),
  jobId: z.string().min(1).max(100),
  scriptVersionId: z.string().min(1).max(100),
  sceneRevisionId: z.string().min(1).max(100),
  planningInputsVersion: z.number().int().positive(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  basePlanVersion: z.literal(0),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  draft: initialPlanDraftSchema,
  createdAt: z.iso.datetime({ offset: true }),
  provenance: z.object({ schemaVersion: z.string(), promptVersion: z.string(), model: z.string(), pricing: z.object({ inputUsdPerMillion: z.number().positive(), outputUsdPerMillion: z.number().positive(), searchUsdPerRequest: z.number().positive() }).strict(), reservedCents: z.number().nonnegative(), stepIds: z.array(z.string()).max(50), sceneManifestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
}).strict().superRefine((manifest, context) => {
  addDocumentSizeIssue(manifest, context);
  if (manifest.sceneRevisionId !== manifest.draft.sceneRevisionId || manifest.inputHash !== manifest.draft.inputHash || manifest.planningInputsVersion !== manifest.draft.planningInputsVersion || manifest.contentHash !== initialPlanDraftHash(manifest.draft)) context.addIssue({ code: "custom", message: "Manifest provenance or content hash does not match the draft." });
});

export type InitialPlanManifest = z.infer<typeof initialPlanManifestSchema>;

export function createInitialPlanManifest(input: { jobId: string; scriptVersionId: string; draft: InitialPlanDraft; id?: string; createdAt?: string }): InitialPlanManifest {
  const draft = initialPlanDraftSchema.parse(input.draft);
  return initialPlanManifestSchema.parse({
    id: input.id ?? randomUUID(),
    kind: "initial",
    status: "complete",
    jobId: input.jobId,
    scriptVersionId: input.scriptVersionId,
    sceneRevisionId: draft.sceneRevisionId,
    planningInputsVersion: draft.planningInputsVersion,
    inputHash: draft.inputHash,
    basePlanVersion: 0,
    contentHash: initialPlanDraftHash(draft),
    draft,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
