import { describe, expect, it } from "vitest";

import {
  decodeDemoCookie,
  encodeDemoCookie,
  resolveDemoCookie,
} from "@/lib/demo-cookie-core";

const secret = "a-production-strength-cookie-secret-1234";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("signed demo cookie", () => {
  it("round-trips a valid browser identity", () => {
    const encoded = encodeDemoCookie(firstId, secret);

    expect(decodeDemoCookie(encoded, secret)).toBe(firstId);
    expect(resolveDemoCookie(encoded, secret, () => secondId)).toEqual({
      demoId: firstId,
      encoded,
      created: false,
    });
  });

  it("rejects tampering and creates a fresh isolated identity", () => {
    const encoded = encodeDemoCookie(firstId, secret);
    const tampered = encoded.replace(firstId, secondId);

    expect(decodeDemoCookie(tampered, secret)).toBeNull();
    expect(resolveDemoCookie(tampered, secret, () => secondId)).toMatchObject({
      demoId: secondId,
      created: true,
    });
  });

  it("does not accept a cookie signed with another secret", () => {
    const encoded = encodeDemoCookie(firstId, secret);

    expect(decodeDemoCookie(encoded, `${secret}-different`)).toBeNull();
  });
});
