import { z } from "zod";

const blankAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalPositiveInteger = z.preprocess(
  blankAsUndefined,
  z.coerce.number().int().positive().optional(),
);
const optionalString = z.preprocess(
  blankAsUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(blankAsUndefined, z.url().optional());
const optionalEmail = z.preprocess(blankAsUndefined, z.email().optional());
const optionalSmokeToken = z.preprocess(
  blankAsUndefined,
  z.string().trim().min(32).optional(),
);
const vertexAiFlag = z.preprocess(
  blankAsUndefined,
  z.enum(["true"]).default("true"),
);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  CLERK_SECRET_KEY: optionalString,
  CLERK_ALLOWED_USER_IDS: optionalString,
  DEMO_INSTANCE_COOKIE_SECRET: z.preprocess(
    blankAsUndefined,
    z.string().min(32).optional(),
  ),
  GOOGLE_CLOUD_PROJECT: optionalString,
  GOOGLE_CLOUD_LOCATION: optionalString,
  GOOGLE_GENAI_USE_VERTEXAI: vertexAiFlag,
  GEMINI_MODEL: optionalString,
  CLOUD_TASKS_LOCATION: optionalString,
  CLOUD_TASKS_QUEUE: z.string().min(1).default("scriptops-ripples"),
  CLOUD_RUN_BASE_URL: optionalUrl,
  TASK_INVOKER_SERVICE_ACCOUNT: optionalEmail,
  TASK_OIDC_AUDIENCE: optionalUrl,
  SMOKE_TRIGGER_TOKEN: optionalSmokeToken,
  PARALLEL_API_KEY: optionalString,
  DAILY_RIPPLE_CAP: optionalPositiveInteger.default(20),
  RIPPLE_STALE_MS: optionalPositiveInteger,
  GEMINI_STAGE_TIMEOUT_MS: optionalPositiveInteger,
  PARALLEL_TIMEOUT_MS: optionalPositiveInteger,
  EVIDENCE_CACHE_TTL_HOURS: optionalPositiveInteger.default(72),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const smokeRuntimeEnvSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  CLOUD_TASKS_LOCATION: z.string().min(1),
  CLOUD_TASKS_QUEUE: z.string().min(1),
  CLOUD_RUN_BASE_URL: z.url(),
  TASK_INVOKER_SERVICE_ACCOUNT: z.email(),
  TASK_OIDC_AUDIENCE: z.url(),
  SMOKE_TRIGGER_TOKEN: z.string().trim().min(32),
});

export type SmokeRuntimeEnv = z.infer<typeof smokeRuntimeEnvSchema>;

export const rippleTaskRuntimeEnvSchema = smokeRuntimeEnvSchema.omit({
  SMOKE_TRIGGER_TOKEN: true,
});

export type RippleTaskRuntimeEnv = z.infer<typeof rippleTaskRuntimeEnvSchema>;

export const agentRuntimeEnvSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  GOOGLE_CLOUD_LOCATION: z.string().min(1),
  GOOGLE_GENAI_USE_VERTEXAI: z.literal("true"),
  GEMINI_MODEL: z.string().min(1),
  PARALLEL_API_KEY: z.string().trim().min(1),
  GEMINI_STAGE_TIMEOUT_MS: optionalPositiveInteger.default(45_000),
  PARALLEL_TIMEOUT_MS: optionalPositiveInteger.default(30_000),
  EVIDENCE_CACHE_TTL_HOURS: optionalPositiveInteger.default(72),
});

export type AgentRuntimeEnv = z.infer<typeof agentRuntimeEnvSchema>;

export const providerSmokeRuntimeEnvSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().min(1),
  GOOGLE_CLOUD_LOCATION: z.string().min(1),
  GOOGLE_GENAI_USE_VERTEXAI: z.literal("true"),
  GEMINI_MODEL: z.string().min(1),
  SMOKE_TRIGGER_TOKEN: z.string().trim().min(32),
  PARALLEL_API_KEY: z.string().trim().min(1),
  GEMINI_STAGE_TIMEOUT_MS: optionalPositiveInteger.default(45_000),
  PARALLEL_TIMEOUT_MS: optionalPositiveInteger.default(30_000),
});

export type ProviderSmokeRuntimeEnv = z.infer<
  typeof providerSmokeRuntimeEnvSchema
>;

export function readServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(input);
}

export function readSmokeRuntimeEnv(
  input: NodeJS.ProcessEnv = process.env,
): SmokeRuntimeEnv {
  return smokeRuntimeEnvSchema.parse(input);
}

export function readRippleTaskRuntimeEnv(
  input: NodeJS.ProcessEnv = process.env,
): RippleTaskRuntimeEnv {
  return rippleTaskRuntimeEnvSchema.parse(input);
}

export function readAgentRuntimeEnv(
  input: NodeJS.ProcessEnv = process.env,
): AgentRuntimeEnv {
  return agentRuntimeEnvSchema.parse(input);
}

export function readProviderSmokeRuntimeEnv(
  input: NodeJS.ProcessEnv = process.env,
): ProviderSmokeRuntimeEnv {
  return providerSmokeRuntimeEnvSchema.parse(input);
}
