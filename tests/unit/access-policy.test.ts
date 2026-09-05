import { describe, expect, it } from "vitest";

import {
  evaluateAccess,
  hasClerkConfiguration,
  parseAllowedUserIds,
} from "@/lib/auth/access-policy";

describe("access policy", () => {
  it("fails closed when production auth is not configured", () => {
    expect(
      evaluateAccess({
        clerkConfigured: false,
        environment: "production",
        userId: null,
        allowedUserIds: undefined,
      }),
    ).toEqual({ outcome: "misconfigured" });
  });

  it("allows an explicit local preview outside production", () => {
    expect(
      evaluateAccess({
        clerkConfigured: false,
        environment: "development",
        userId: null,
        allowedUserIds: undefined,
      }),
    ).toEqual({ outcome: "allowed", mode: "development-preview" });
  });

  it("requires a signed-in, allow-listed Clerk user", () => {
    const common = {
      clerkConfigured: true,
      environment: "production" as const,
      allowedUserIds: " user_alpha, user_judge ",
    };

    expect(evaluateAccess({ ...common, userId: null })).toEqual({
      outcome: "signed-out",
    });
    expect(evaluateAccess({ ...common, userId: "user_other" })).toEqual({
      outcome: "forbidden",
    });
    expect(evaluateAccess({ ...common, userId: "user_judge" })).toEqual({
      outcome: "allowed",
      mode: "clerk",
    });
  });

  it("normalizes allow-list entries and requires both Clerk keys", () => {
    expect([...parseAllowedUserIds(" one, ,two,one ")]).toEqual(["one", "two"]);
    expect(
      hasClerkConfiguration({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
        CLERK_SECRET_KEY: "sk_test_example",
      }),
    ).toBe(true);
    expect(
      hasClerkConfiguration({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test" }),
    ).toBe(false);
  });
});
