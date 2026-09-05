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

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
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
