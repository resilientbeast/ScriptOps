import { setTimeout as delay } from "node:timers/promises";

import { type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiAccess } from "@/lib/auth/require-access";
import { readDemoId } from "@/lib/demo-session";
import { readServerEnv } from "@/lib/env";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import { toPublicRippleRun } from "@/lib/ripple/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runIdSchema = z.uuid();
const terminalStatuses = new Set([
  "rejected",
  "proposal_ready",
  "failed",
  "discarded",
  "approved",
  "superseded",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const denied = await requireApiAccess();
  if (denied) return denied;
  const demoId = readDemoId(request);
  const parsedRunId = runIdSchema.safeParse((await params).runId);
  if (!demoId || !parsedRunId.success) {
    return Response.json({ error: { code: "RIPPLE_NOT_FOUND" } }, { status: 404 });
  }

  const repository = getRippleStateRepository();
  const initial = await repository.getRun(parsedRunId.data);
  if (!initial || initial.demoId !== demoId) {
    return Response.json({ error: { code: "RIPPLE_NOT_FOUND" } }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let priorSnapshot = "";
      try {
        for (let tick = 0; tick < 30 && !request.signal.aborted; tick += 1) {
          let run = await repository.getRun(parsedRunId.data);
          if (!run || run.demoId !== demoId) break;
          if (run.status === "queued" || run.status === "analyzing") {
            run = (
              await repository.failStaleRun(
                demoId,
                run.runId,
                readServerEnv().RIPPLE_STALE_MS ?? 180_000,
              )
            ).run;
          }

          const snapshot = JSON.stringify({ run: toPublicRippleRun(run) });
          if (snapshot !== priorSnapshot) {
            controller.enqueue(encoder.encode(`data: ${snapshot}\n\n`));
            priorSnapshot = snapshot;
          } else if (tick > 0 && tick % 10 === 0) {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          }
          if (terminalStatuses.has(run.status)) break;
          await delay(1_000, undefined, { signal: request.signal }).catch(() => undefined);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
