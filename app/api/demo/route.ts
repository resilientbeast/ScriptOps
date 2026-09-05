import { type NextRequest, NextResponse } from "next/server";

import { requireApiAccess } from "@/lib/auth/require-access";
import {
  DEMO_COOKIE_MAX_AGE_SECONDS,
  DEMO_COOKIE_NAME,
  getDemoCookieSecret,
  resolveDemoCookie,
} from "@/lib/demo-cookie";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import { readServerEnv } from "@/lib/env";
import { toPublicDemoSnapshot } from "@/lib/ripple/public-demo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireApiAccess();
  if (denied) return denied;

  try {
    const cookie = resolveDemoCookie(
      request.cookies.get(DEMO_COOKIE_NAME)?.value,
      getDemoCookieSecret(),
    );
    const repository = getRippleStateRepository();
    const instance = await repository.initializeDemo(cookie.demoId);
    const response = NextResponse.json(
      await toPublicDemoSnapshot(
        repository,
        instance,
        readServerEnv().DAILY_RIPPLE_CAP,
      ),
    );

    if (cookie.created) {
      response.cookies.set(DEMO_COOKIE_NAME, cookie.encoded, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: DEMO_COOKIE_MAX_AGE_SECONDS,
        priority: "high",
      });
    }
    return response;
  } catch {
    return Response.json(
      {
        error: {
          code: "DEMO_UNAVAILABLE",
          message: "The production workspace is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
