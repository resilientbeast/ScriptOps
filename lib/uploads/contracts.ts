import { z } from "zod";

export const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024;
export const acceptedSourceContentTypes = [
  "application/pdf",
  "application/xml",
  "text/xml",
  "application/vnd.finaldraft",
] as const;

const identifier = z.string().uuid();
const filename = z.string().trim().min(1).max(255);

export const createUploadReservationSchema = z.object({
  filename,
  declaredBytes: z.number().int().positive().max(MAX_SOURCE_FILE_BYTES),
  contentType: z.enum(acceptedSourceContentTypes),
}).strict().superRefine((value, context) => {
  const name = value.filename.toLowerCase();
  const extensionMatches = (name.endsWith(".pdf") && value.contentType === "application/pdf") ||
    (name.endsWith(".fdx") && value.contentType !== "application/pdf");
  if (!extensionMatches) context.addIssue({ code: "custom", path: ["filename"], message: "Use a PDF or Final Draft .fdx file." });
});

export type UploadReservationRequest = z.infer<typeof createUploadReservationSchema>;
export type UploadReservation = UploadReservationRequest & {
  projectId: string;
  scriptId: string;
  objectKey: string;
  expiresAt: string;
};

export function sourceObjectKey(projectId: string, scriptId: string): string {
  if (!identifier.safeParse(projectId).success || !identifier.safeParse(scriptId).success) {
    throw new Error("Project and script IDs must be UUIDs.");
  }
  return `projects/${projectId}/scripts/${scriptId}/source`;
}

export function screenplayFormatForFilename(name: string): "pdf" | "fdx" {
  return name.trim().toLowerCase().endsWith(".fdx") ? "fdx" : "pdf";
}
