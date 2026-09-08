import { z } from "zod";

import { initialPlanManifestSchema } from "@/lib/planning/initial-plan-manifest";
import { projectRippleManifestSchema } from "@/lib/planning/project-ripple-manifest";

export const approvedInitialPlanSchema = z.object({
  id: z.string().regex(/^plan-v1-[a-z0-9-]{1,90}$/),
  kind: z.literal("initial"),
  planVersion: z.literal(1),
  manifestId: z.string().uuid(),
  jobId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAt: z.iso.datetime({ offset: true }),
  manifest: initialPlanManifestSchema,
}).strict().superRefine((record, context) => {
  if (record.manifestId !== record.manifest.id || record.jobId !== record.manifest.jobId || record.contentHash !== record.manifest.contentHash) {
    context.addIssue({ code: "custom", message: "Approved plan must retain its exact complete manifest." });
  }
});

export type ApprovedInitialPlan = z.infer<typeof approvedInitialPlanSchema>;

export const approvedRipplePlanSchema = z.object({
  id: z.string().regex(/^plan-v[2-9][0-9]*-[a-z0-9-]{1,90}$/),
  kind: z.literal("ripple"),
  planVersion: z.number().int().min(2),
  manifestId: z.string().uuid(),
  jobId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAt: z.iso.datetime({ offset: true }),
  manifest: projectRippleManifestSchema,
}).strict().superRefine((record, context) => {
  if (record.manifestId !== record.manifest.id || record.jobId !== record.manifest.jobId || record.contentHash !== record.manifest.contentHash || record.planVersion !== record.manifest.basePlanVersion + 1) {
    context.addIssue({ code: "custom", message: "Approved ripple plan must retain its exact next-version manifest." });
  }
});

export type ApprovedRipplePlan = z.infer<typeof approvedRipplePlanSchema>;
export const projectPlanSchema = z.union([approvedInitialPlanSchema, approvedRipplePlanSchema]);
export type ProjectPlan = z.infer<typeof projectPlanSchema>;

export function createApprovedInitialPlan(manifest: unknown, approvedAt = new Date().toISOString()): ApprovedInitialPlan {
  const complete = initialPlanManifestSchema.parse(manifest);
  return approvedInitialPlanSchema.parse({ id: `plan-v1-${complete.id}`, kind: "initial", planVersion: 1, manifestId: complete.id, jobId: complete.jobId, contentHash: complete.contentHash, approvedAt, manifest: complete });
}

export function createApprovedRipplePlan(manifest: unknown, planVersion: number, approvedAt = new Date().toISOString()): ApprovedRipplePlan {
  const complete = projectRippleManifestSchema.parse(manifest);
  return approvedRipplePlanSchema.parse({ id: `plan-v${planVersion}-${complete.id}`, kind: "ripple", planVersion, manifestId: complete.id, jobId: complete.jobId, contentHash: complete.contentHash, approvedAt, manifest: complete });
}
