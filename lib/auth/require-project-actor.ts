import "server-only";

import { auth } from "@clerk/nextjs/server";

import { hasClerkConfiguration, parseAllowedUserIds } from "@/lib/auth/access-policy";

export type ProjectActor = {
  userId: string;
  mode: "clerk";
};

/** Real projects deliberately have no unauthenticated development or demo actor. */
export async function requireProjectActor(): Promise<ProjectActor | Response> {
  if (!hasClerkConfiguration()) {
    return Response.json(
      { error: { code: "PROJECT_ACCESS_NOT_CONFIGURED", message: "Project access is unavailable." } },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to access projects." } },
      { status: 401 },
    );
  }
  if (!parseAllowedUserIds(process.env.CLERK_ALLOWED_USER_IDS).has(userId)) {
    return Response.json(
      { error: { code: "PROJECT_ACCESS_NOT_ALLOWED", message: "Project access is unavailable." } },
      { status: 403 },
    );
  }
  return { userId, mode: "clerk" };
}
