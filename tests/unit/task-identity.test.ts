import type { TokenPayload } from "google-auth-library";
import { describe, expect, it } from "vitest";

import {
  extractBearerToken,
  TaskIdentityError,
  validateTaskClaims,
} from "@/lib/cloud-tasks/verify-task-identity";

const expectations = {
  audience: "https://scriptops.example.test",
  serviceAccountEmail: "scriptops-task-invoker@example.test",
};

function validPayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: "https://accounts.google.com",
    sub: "task-invoker-subject",
    aud: expectations.audience,
    iat: 1,
    exp: 2,
    email: expectations.serviceAccountEmail,
    email_verified: true,
    ...overrides,
  };
}

function expectIdentityCode(operation: () => void, code: string) {
  try {
    operation();
    throw new Error("Expected TaskIdentityError");
  } catch (error) {
    expect(error).toBeInstanceOf(TaskIdentityError);
    expect((error as TaskIdentityError).code).toBe(code);
  }
}

describe("Cloud Tasks OIDC identity validation", () => {
  it("accepts the exact Google issuer, audience, and verified service account", () => {
    expect(() => validateTaskClaims(validPayload(), expectations)).not.toThrow();
  });

  it("rejects a non-Google issuer", () => {
    expectIdentityCode(
      () => validateTaskClaims(validPayload({ iss: "https://attacker.test" }), expectations),
      "TASK_ISSUER_INVALID",
    );
  });

  it("rejects the wrong audience", () => {
    expectIdentityCode(
      () => validateTaskClaims(validPayload({ aud: "https://other.test" }), expectations),
      "TASK_AUDIENCE_INVALID",
    );
  });

  it("rejects a different or unverified service account", () => {
    expectIdentityCode(
      () =>
        validateTaskClaims(
          validPayload({ email: "other@example.test", email_verified: false }),
          expectations,
        ),
      "TASK_SERVICE_ACCOUNT_INVALID",
    );
  });

  it("requires a bearer token", () => {
    expect(extractBearerToken("Bearer signed-token")).toBe("signed-token");
    expectIdentityCode(
      () => extractBearerToken("Basic credentials"),
      "TASK_IDENTITY_MISSING",
    );
  });
});
