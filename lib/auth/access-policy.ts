export type AccessDecision =
  | { outcome: "allowed"; mode: "clerk" | "development-preview" }
  | { outcome: "signed-out" }
  | { outcome: "forbidden" }
  | { outcome: "misconfigured" };

export function parseAllowedUserIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function evaluateAccess(input: {
  clerkConfigured: boolean;
  environment: "development" | "test" | "production";
  userId: string | null;
  allowedUserIds: string | undefined;
}): AccessDecision {
  if (!input.clerkConfigured) {
    return input.environment === "production"
      ? { outcome: "misconfigured" }
      : { outcome: "allowed", mode: "development-preview" };
  }

  if (!input.userId) {
    return { outcome: "signed-out" };
  }

  const allowList = parseAllowedUserIds(input.allowedUserIds);
  return allowList.has(input.userId)
    ? { outcome: "allowed", mode: "clerk" }
    : { outcome: "forbidden" };
}

export function hasClerkConfiguration(
  input: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    input.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && input.CLERK_SECRET_KEY,
  );
}
