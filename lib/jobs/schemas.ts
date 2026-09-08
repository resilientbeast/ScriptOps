import { z } from "zod";

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const projectJobSchema = z
  .object({
    id: identifierSchema,
    projectId: identifierSchema,
    kind: z.enum(["parse", "initial-plan", "ripple", "delete"]),
    status: z.enum(["queued", "running", "proposal-ready", "succeeded", "failed", "discarded", "approved", "superseded"]),
    projectWriteEpoch: z.number().int().nonnegative(),
    requestHash: hashSchema,
    idempotencyKeyHash: hashSchema,
    scriptVersionId: identifierSchema.nullable(),
    sceneRevisionId: identifierSchema.nullable(),
    planningInputsVersion: z.number().int().positive().nullable(),
    inputHash: hashSchema.nullable(),
    basePlanVersion: z.number().int().nonnegative(),
    candidateManifestId: identifierSchema.nullable(),
    approvedVersion: z.number().int().positive().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.kind === "initial-plan" && job.basePlanVersion !== 0) {
      context.addIssue({
        code: "custom",
        path: ["basePlanVersion"],
        message: "Initial-plan jobs must start from plan version zero.",
      });
    }
    if (job.kind === "initial-plan" && (!job.sceneRevisionId || !job.inputHash)) {
      context.addIssue({
        code: "custom",
        path: ["sceneRevisionId"],
        message: "Initial-plan jobs require accepted scenes and an immutable input hash.",
      });
    }
    if (job.status === "approved" && job.approvedVersion === null) {
      context.addIssue({
        code: "custom",
        path: ["approvedVersion"],
        message: "Approved jobs must record their installed plan version.",
      });
    }
  });

export type ProjectJob = z.infer<typeof projectJobSchema>;
