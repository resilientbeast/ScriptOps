import { z } from "zod";

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const shortTextSchema = z.string().trim().min(1).max(500);

export const sourceSpanSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(200),
    page: z.number().int().positive().nullable(),
    blockIndex: z.number().int().nonnegative(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((span, context) => {
    if (span.endOffset < span.startOffset) {
      context.addIssue({
        code: "custom",
        path: ["endOffset"],
        message: "Source-span end must not precede its start.",
      });
    }
  });

export const parsedSceneSchema = z
  .object({
    id: identifierSchema,
    ordinal: z.number().int().positive(),
    displayNumber: z.string().regex(/^\d+[A-Z]?$/).nullable(),
    originalHeading: shortTextSchema,
    reviewedHeading: shortTextSchema,
    sourceSpans: z.array(sourceSpanSchema).min(1).max(100),
    warningIds: z.array(identifierSchema).max(30),
    predecessorSceneIds: z.array(identifierSchema).max(30),
  })
  .strict();

export const acceptedSceneRevisionSchema = z
  .object({
    id: identifierSchema,
    scriptVersionId: identifierSchema,
    parentRevisionId: identifierSchema.nullable(),
    editVersion: z.number().int().nonnegative(),
    status: z.literal("accepted"),
    sceneManifestHash: hashSchema,
    scenes: z.array(parsedSceneSchema).min(1).max(200),
    acknowledgedWarningIds: z.array(identifierSchema).max(100),
    acceptedBy: z.string().trim().min(1).max(200),
    acceptedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const sceneReviewRevisionSchema = z.object({
  id: identifierSchema,
  scriptVersionId: identifierSchema,
  parentRevisionId: identifierSchema.nullable(),
  editVersion: z.number().int().nonnegative(),
  status: z.enum(["draft", "accepted"]),
  scenes: z.array(parsedSceneSchema).min(1).max(200),
  warnings: z.array(z.object({ id: identifierSchema, code: z.string().min(1), sourceIds: z.array(z.string().trim().min(1).max(200)).max(200), acknowledged: z.boolean() }).strict()).max(200),
  createdAt: z.iso.datetime({ offset: true }),
  acceptedBy: z.string().trim().min(1).max(200).nullable(),
  acceptedAt: z.iso.datetime({ offset: true }).nullable(),
}).strict().superRefine((revision, context) => {
  if (revision.status === "accepted" && (!revision.acceptedBy || !revision.acceptedAt)) context.addIssue({ code: "custom", path: ["acceptedAt"], message: "Accepted revisions require producer provenance." });
  if (revision.status === "draft" && (revision.acceptedBy || revision.acceptedAt)) context.addIssue({ code: "custom", path: ["acceptedAt"], message: "Draft revisions cannot be accepted." });
});

export const scriptVersionSchema = z
  .object({
    id: identifierSchema,
    format: z.enum(["pdf", "fdx"]),
    originalFilename: z.string().trim().min(1).max(255),
    declaredBytes: z.number().int().positive().max(20 * 1024 * 1024),
    sourceObjectRef: z.object({ objectKey: z.string().min(1), generation: z.string().min(1) }).strict().nullable(),
    status: z.enum(["uploading", "validating", "parsing", "review-ready", "failed", "superseded"]),
    contentHash: hashSchema.nullable(),
    parserVersion: z.string().trim().min(1).max(100).nullable(),
    currentReviewRevisionId: identifierSchema.nullable(),
    uploadedBy: z.string().trim().min(1).max(200),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ParsedScene = z.infer<typeof parsedSceneSchema>;
export type AcceptedSceneRevision = z.infer<typeof acceptedSceneRevisionSchema>;
export type ScriptVersion = z.infer<typeof scriptVersionSchema>;
