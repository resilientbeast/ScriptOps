import { z } from "zod";

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);

export const projectLifecycleSchema = z.enum(["active", "archived", "deleting"]);

export const projectSchema = z
  .object({
    id: identifierSchema,
    ownerUserId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    lifecycle: projectLifecycleSchema,
    recordVersion: z.number().int().positive(),
    planningInputsVersion: z.number().int().positive(),
    activeScriptVersionId: identifierSchema.nullable(),
    acceptedSceneRevisionId: identifierSchema.nullable(),
    approvedPlanVersion: z.number().int().nonnegative(),
    approvedManifestId: identifierSchema.nullable(),
    activeJobId: identifierSchema.nullable(),
    pendingUploadId: identifierSchema.nullable(),
    writeEpoch: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((project, context) => {
    const hasApprovedPlan = project.approvedPlanVersion > 0;
    if (hasApprovedPlan !== (project.approvedManifestId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["approvedManifestId"],
        message: "Approved-plan version and manifest pointer must agree.",
      });
    }
    if (project.lifecycle === "deleting" && project.activeJobId !== null) {
      context.addIssue({
        code: "custom",
        path: ["activeJobId"],
        message: "Deleting projects cannot retain an active job pointer.",
      });
    }
  });

export type Project = z.infer<typeof projectSchema>;
