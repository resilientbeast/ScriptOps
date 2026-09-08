import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { addDocumentSizeIssue } from "@/lib/domain/invariants";
import { initialProductionPlanSchema } from "@/lib/planning/schemas";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);

export const projectRippleDraftSchema = z.object({
  jobId: identifierSchema,
  kind: z.literal("ripple"),
  basePlanVersion: z.number().int().positive(),
  baseManifestId: z.string().uuid(),
  sceneId: identifierSchema,
  requestText: z.string().trim().min(10).max(2_000),
  plan: initialProductionPlanSchema,
  generatedAt: z.iso.datetime({ offset: true }),
}).strict();

export type ProjectRippleDraft = z.infer<typeof projectRippleDraftSchema>;

export const projectRippleManifestSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("ripple"),
  status: z.literal("complete"),
  jobId: identifierSchema,
  scriptVersionId: identifierSchema,
  planningInputsVersion: z.number().int().positive(),
  basePlanVersion: z.number().int().positive(),
  baseManifestId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  draft: projectRippleDraftSchema,
  createdAt: z.iso.datetime({ offset: true }),
  provenance: z.object({ schemaVersion: z.string(), promptVersion: z.string(), model: z.string(), reservedCents: z.number().nonnegative() }).strict().optional(),
}).strict().superRefine((manifest, context) => {
  addDocumentSizeIssue(manifest, context);
  if (manifest.jobId !== manifest.draft.jobId || manifest.basePlanVersion !== manifest.draft.basePlanVersion || manifest.baseManifestId !== manifest.draft.baseManifestId || manifest.contentHash !== hash(manifest.draft)) {
    context.addIssue({ code: "custom", message: "Ripple manifest bindings or content hash are invalid." });
  }
});

export type ProjectRippleManifest = z.infer<typeof projectRippleManifestSchema>;

export function createProjectRippleManifest(input: { jobId: string; scriptVersionId: string; planningInputsVersion: number; draft: ProjectRippleDraft; id?: string; createdAt?: string }): ProjectRippleManifest {
  const draft = projectRippleDraftSchema.parse(input.draft);
  return projectRippleManifestSchema.parse({
    id: input.id ?? randomUUID(),
    kind: "ripple",
    status: "complete",
    jobId: input.jobId,
    scriptVersionId: input.scriptVersionId,
    planningInputsVersion: input.planningInputsVersion,
    basePlanVersion: draft.basePlanVersion,
    baseManifestId: draft.baseManifestId,
    contentHash: hash(draft),
    draft,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
