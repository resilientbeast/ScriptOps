import { z } from "zod";

import {
  FIXTURE_VERSION,
  productionPlanSchema,
  publicErrorSchema,
  revisionProposalSchema,
  rippleStageProgressSchema,
} from "@/lib/domain/schemas";

export const runStatusSchema = z.enum([
  "queued",
  "analyzing",
  "rejected",
  "proposal_ready",
  "failed",
  "discarded",
  "approved",
  "superseded",
]);

export const demoInstanceSchema = z
  .object({
    demoId: z.uuid(),
    fixtureVersion: z.literal(FIXTURE_VERSION),
    cycle: z.number().int().positive(),
    planVersion: z.number().int().positive(),
    currentPlan: productionPlanSchema,
    openRunId: z.uuid().nullable(),
    approvedRunId: z.uuid().nullable(),
    hasApprovedRipple: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()
  .superRefine((instance, context) => {
    if (instance.hasApprovedRipple !== (instance.approvedRunId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["hasApprovedRipple"],
        message: "Approved-ripple flag and approved run must agree",
      });
    }

    if (instance.openRunId !== null && instance.hasApprovedRipple) {
      context.addIssue({
        code: "custom",
        path: ["openRunId"],
        message: "An approved cycle cannot retain an open run",
      });
    }
  });

export const rippleRunSchema = z
  .object({
    runId: z.uuid(),
    demoId: z.uuid(),
    cycle: z.number().int().positive(),
    basePlanVersion: z.number().int().positive(),
    idempotencyKey: z.uuid(),
    sceneId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    requestText: z.string().trim().min(10).max(2_000),
    status: runStatusSchema,
    stages: rippleStageProgressSchema,
    proposal: revisionProposalSchema.nullable(),
    failure: publicErrorSchema.nullable(),
    executionAttempt: z.number().int().nonnegative(),
    executionToken: z.uuid().nullable(),
    heartbeatAt: z.date().nullable(),
    createdAt: z.date(),
    startedAt: z.date().nullable(),
    finishedAt: z.date().nullable(),
    approvedAt: z.date().nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.proposal !== null && run.proposal.runId !== run.runId) {
      context.addIssue({
        code: "custom",
        path: ["proposal", "runId"],
        message: "Proposal must belong to its containing run",
      });
    }

    if (run.status === "analyzing" && run.executionToken === null) {
      context.addIssue({
        code: "custom",
        path: ["executionToken"],
        message: "Analyzing runs require an execution token",
      });
    }

    if (run.status !== "analyzing" && run.executionToken !== null) {
      context.addIssue({
        code: "custom",
        path: ["executionToken"],
        message: "Only analyzing runs may retain an execution token",
      });
    }

    if (run.status === "proposal_ready" && run.proposal === null) {
      context.addIssue({
        code: "custom",
        path: ["proposal"],
        message: "Proposal-ready runs require a complete proposal",
      });
    }

    if (run.status === "failed" && run.failure === null) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Failed runs require a public failure",
      });
    }
  });

export const dailyUsageSchema = z
  .object({
    dateUtc: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    acceptedStarts: z.number().int().nonnegative(),
    cap: z.number().int().positive(),
    updatedAt: z.date(),
  })
  .strict()
  .superRefine((usage, context) => {
    if (usage.acceptedStarts > usage.cap) {
      context.addIssue({
        code: "custom",
        path: ["acceptedStarts"],
        message: "Accepted starts cannot exceed the recorded cap",
      });
    }
  });

export type RunStatus = z.infer<typeof runStatusSchema>;
export type DemoInstance = z.infer<typeof demoInstanceSchema>;
export type RippleRun = z.infer<typeof rippleRunSchema>;
export type DailyUsage = z.infer<typeof dailyUsageSchema>;
