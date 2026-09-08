import { createHash } from "node:crypto";

import { z } from "zod";

import { planningInputsRequestSchema } from "@/lib/planning/schemas";

const projectTitleSchema = z.string().trim().min(1).max(200);
const idempotencyKeySchema = z.string().trim().min(16).max(200);

export const createProjectRequestSchema = z
  .object({
    title: projectTitleSchema,
    planningInputs: planningInputsRequestSchema,
  })
  .strict();

export const updateProjectRequestSchema = z
  .object({
    recordVersion: z.number().int().positive(),
    title: projectTitleSchema.optional(),
    lifecycle: z.enum(["active", "archived"]).optional(),
  })
  .strict()
  .refine((request) => request.title !== undefined || request.lifecycle !== undefined, {
    message: "Provide a title or lifecycle update.",
  });

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const deleteProjectRequestSchema = z
  .object({
    recordVersion: z.number().int().positive(),
    confirmationTitle: projectTitleSchema,
  })
  .strict();

export function parseIdempotencyKey(value: string | null): string | null {
  const parsed = idempotencyKeySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createProjectRequestHash(
  actor: { userId: string },
  request: CreateProjectRequest,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ ownerUserId: actor.userId, ...request }), "utf8")
    .digest("hex");
}

export function projectIdempotencyRecordKey(actor: { userId: string }, key: string): string {
  return createHash("sha256")
    .update(`${actor.userId}:${key}`, "utf8")
    .digest("hex");
}
