import { type NextRequest } from "next/server";

import { requireApiAccess } from "@/lib/auth/require-access";
import { readDemoId } from "@/lib/demo-session";
import { readServerEnv } from "@/lib/env";
import {
  StateConflictError,
} from "@/lib/firestore/ripple-state";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import { isSameOrigin } from "@/lib/ripple/contracts";
import { toPublicDemoSnapshot } from "@/lib/ripple/public-demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireApiAccess();
  if (denied) return denied;
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "ORIGIN_INVALID", message: "The reset request origin was rejected." } },
      { status: 403 },
    );
  }

  const demoId = readDemoId(request);
  if (!demoId) {
    return Response.json({ error: { code: "DEMO_SESSION_REQUIRED" } }, { status: 401 });
  }

  const repository = getRippleStateRepository();
  try {
    const instance = await repository.resetDemo(demoId);
    return Response.json(
      {
        snapshot: await toPublicDemoSnapshot(
          repository,
          instance,
          readServerEnv().DAILY_RIPPLE_CAP,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof StateConflictError ? 409 : 503;
    return Response.json(
      {
        error: {
          code: error instanceof StateConflictError ? error.code : "RESET_UNAVAILABLE",
          message: "This demo cannot be reset while analysis is still running.",
        },
      },
      { status },
    );
  }
}
