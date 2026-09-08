import { z } from "zod";

import type { RippleRun } from "@/lib/firestore/state-types";

export const createRippleRequestSchema = z
  .object({
    sceneId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    requestText: z.string().trim().min(10).max(2_000),
    idempotencyKey: z.uuid(),
  })
  .strict();

const productionSignals = [
  /\bscene\b/i,
  /\b(day|night|dawn|dusk|weather|rain|snow|wind)\b/i,
  /\b(cast|actor|performer|child|minor|stunt)\b/i,
  /\b(location|road|interior|exterior|vehicle|prop)\b/i,
  /\b(schedule|shoot|budget|cost|crew|equipment|permit|safety)\b/i,
];

export function isProductionRelevant(requestText: string): boolean {
  return productionSignals.some((signal) => signal.test(requestText));
}

export function isSameOrigin(
  request: Request,
  environment: {
    CLOUD_RUN_BASE_URL?: string;
    CLOUD_RUN_ALLOWED_ORIGINS?: string;
  } = process.env as {
    CLOUD_RUN_BASE_URL?: string;
    CLOUD_RUN_ALLOWED_ORIGINS?: string;
  },
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const trustedOrigins = new Set([new URL(request.url).origin]);

    // Cloud Run terminates TLS before forwarding requests into the Next.js
    // container, so request.url can describe the internal container address.
    // Only explicitly configured public service origins are permitted.
    const configuredOrigins = [
      environment.CLOUD_RUN_BASE_URL,
      ...(environment.CLOUD_RUN_ALLOWED_ORIGINS?.split(",") ?? []),
    ];

    for (const configuredOrigin of configuredOrigins) {
      if (!configuredOrigin?.trim()) continue;

      try {
        trustedOrigins.add(new URL(configuredOrigin.trim()).origin);
      } catch {
        // A malformed optional deployment setting must not broaden access.
      }
    }

    return trustedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export type PublicRippleRun = Omit<
  RippleRun,
  "demoId" | "idempotencyKey" | "executionToken"
>;

export function toPublicRippleRun(run: RippleRun): PublicRippleRun {
  return Object.fromEntries(
    Object.entries(run).filter(
      ([key]) =>
        key !== "demoId" &&
        key !== "idempotencyKey" &&
        key !== "executionToken",
    ),
  ) as PublicRippleRun;
}
