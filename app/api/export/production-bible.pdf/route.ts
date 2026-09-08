import { type NextRequest } from "next/server";

import { requireApiAccess } from "@/lib/auth/require-access";
import { readDemoId } from "@/lib/demo-session";
import { getRippleStateRepository } from "@/lib/firestore/ripple-state-admin";
import { isPdfExportEligible, renderProductionBible } from "@/lib/pdf/production-bible";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireApiAccess();
  if (denied) return denied;

  const demoId = readDemoId(request);
  if (!demoId) return Response.json({ error: { code: "DEMO_SESSION_REQUIRED" } }, { status: 401 });

  try {
    const repository = getRippleStateRepository();
    const instance = await repository.getDemo(demoId);
    const run = instance?.approvedRunId ? await repository.getRun(instance.approvedRunId) : null;
    if (!instance || !isPdfExportEligible(instance.currentPlan, run)) {
      return Response.json(
        { error: { code: "PDF_APPROVAL_REQUIRED", message: "Approve a revision to export." } },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const document = await renderProductionBible(instance.currentPlan, run!);
    return new Response(new Uint8Array(document), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="scriptops-production-bible.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      { error: { code: "PDF_EXPORT_UNAVAILABLE", message: "The approved plan could not be exported right now." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
