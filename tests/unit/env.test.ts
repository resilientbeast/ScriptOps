import { describe, expect, it } from "vitest";

import { providerSmokeRuntimeEnvSchema, serverEnvSchema } from "@/lib/env";

describe("serverEnvSchema", () => {
  it("supplies safe local defaults without provider credentials", () => {
    const result = serverEnvSchema.parse({ NODE_ENV: "test" });

    expect(result).toMatchObject({
      NODE_ENV: "test",
      GOOGLE_GENAI_USE_VERTEXAI: "true",
      CLOUD_TASKS_QUEUE: "scriptops-ripples",
      DAILY_RIPPLE_CAP: 20,
      EVIDENCE_CACHE_TTL_HOURS: 72,
    });
  });

  it("rejects invalid cost-control values", () => {
    const result = serverEnvSchema.safeParse({ DAILY_RIPPLE_CAP: "0" });

    expect(result.success).toBe(false);
  });

  it("rejects a weak demo cookie secret", () => {
    const result = serverEnvSchema.safeParse({ DEMO_INSTANCE_COOKIE_SECRET: "too-short" });

    expect(result.success).toBe(false);
  });

  it("requires provider smoke secrets and an explicit Vertex model", () => {
    const result = providerSmokeRuntimeEnvSchema.safeParse({
      GOOGLE_CLOUD_PROJECT: "scriptops-agentic-arkad",
      GOOGLE_CLOUD_LOCATION: "us-central1",
      GOOGLE_GENAI_USE_VERTEXAI: "true",
      GEMINI_MODEL: "gemini-3.7-flash",
      SMOKE_TRIGGER_TOKEN: "s".repeat(32),
    });

    expect(result.success).toBe(false);
  });
});
