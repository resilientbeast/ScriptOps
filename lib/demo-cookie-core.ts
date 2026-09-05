import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const demoIdSchema = z.uuid();

function signature(demoId: string, secret: string): string {
  return createHmac("sha256", secret).update(demoId).digest("base64url");
}

export function encodeDemoCookie(demoIdInput: string, secret: string): string {
  const demoId = demoIdSchema.parse(demoIdInput);
  return `${demoId}.${signature(demoId, secret)}`;
}

export function decodeDemoCookie(
  value: string | undefined,
  secret: string,
): string | null {
  if (!value) return null;
  const [demoId, providedSignature, extra] = value.split(".");
  if (!demoId || !providedSignature || extra) return null;
  if (!demoIdSchema.safeParse(demoId).success) return null;

  const expected = Buffer.from(signature(demoId, secret));
  const provided = Buffer.from(providedSignature);
  if (
    expected.byteLength !== provided.byteLength ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }
  return demoId;
}

export function resolveDemoCookie(
  value: string | undefined,
  secret: string,
  createId: () => string = randomUUID,
): { demoId: string; encoded: string; created: boolean } {
  const existing = decodeDemoCookie(value, secret);
  if (existing) {
    return { demoId: existing, encoded: value!, created: false };
  }

  const demoId = demoIdSchema.parse(createId());
  return { demoId, encoded: encodeDemoCookie(demoId, secret), created: true };
}
