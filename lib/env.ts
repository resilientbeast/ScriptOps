import { z } from "zod";

const optionalPositiveInteger = z.coerce.number().int().positive().optional();

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_ALLOWED_USER_IDS: z.string().min(1).optional(),
  DEMO_INSTANCE_COOKIE_SECRET: z.string().min(32).optional(),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  GOOGLE_CLOUD_LOCATION: z.string().min(1).optional(),
  GOOGLE_GENAI_USE_VERTEXAI: z.enum(["true"]).default("true"),
  GEMINI_MODEL: z.string().min(1).optional(),
  CLOUD_TASKS_LOCATION: z.string().min(1).optional(),
  CLOUD_TASKS_QUEUE: z.string().min(1).default("scriptops-ripples"),
  CLOUD_RUN_BASE_URL: z.url().optional(),
  TASK_INVOKER_SERVICE_ACCOUNT: z.email().optional(),
  TASK_OIDC_AUDIENCE: z.url().optional(),
  SMOKE_TRIGGER_TOKEN: z.string().trim().min(32).optional(),
  PARALLEL_API_KEY: z.string().min(1).optional(),
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

export function readServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(input);
}

export function readSmokeRuntimeEnv(
  input: NodeJS.ProcessEnv = process.env,
): SmokeRuntimeEnv {
  return smokeRuntimeEnvSchema.parse(input);
}
