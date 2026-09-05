import "server-only";

import { auth } from "@clerk/nextjs/server";

import {
  evaluateAccess,
  hasClerkConfiguration,
  type AccessDecision,
} from "@/lib/auth/access-policy";

function environment(): "development" | "test" | "production" {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

export async function getServerAccess(): Promise<AccessDecision> {
  const clerkConfigured = hasClerkConfiguration();
  if (!clerkConfigured) {
    return evaluateAccess({
      clerkConfigured,
      environment: environment(),
      userId: null,
      allowedUserIds: process.env.CLERK_ALLOWED_USER_IDS,
    });
  }

  const { userId } = await auth();
  return evaluateAccess({
    clerkConfigured,
    environment: environment(),
    userId,
    allowedUserIds: process.env.CLERK_ALLOWED_USER_IDS,
  });
}

export async function requireApiAccess(): Promise<Response | null> {
  const decision = await getServerAccess();
  if (decision.outcome === "allowed") return null;

  const status = decision.outcome === "misconfigured" ? 503 : 401;
  const code =
    decision.outcome === "misconfigured"
      ? "ACCESS_NOT_CONFIGURED"
      : decision.outcome === "forbidden"
        ? "ACCESS_NOT_ALLOWED"
        : "AUTHENTICATION_REQUIRED";

  return Response.json(
    { error: { code, message: "ScriptOps access is unavailable." } },
    { status },
  );
}
