import { redirect } from "next/navigation";

import { AccessNotice } from "@/components/dashboard/access-notice";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getServerAccess } from "@/lib/auth/require-access";
import { immutableBaselinePlan } from "@/lib/domain/fixtures";
import { readServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (readServerEnv().PROJECT_WORKSPACES_ENABLED === "true") redirect("/projects");
  const access = await getServerAccess();
  if (access.outcome === "signed-out") redirect("/sign-in");
  if (access.outcome === "forbidden") {
    return <AccessNotice kind="forbidden" />;
  }
  if (access.outcome === "misconfigured") {
    return <AccessNotice kind="misconfigured" />;
  }

  return (
    <DashboardShell
      authConfigured={access.mode === "clerk"}
      initialSnapshot={{
        cycle: 1,
        planVersion: 1,
        currentPlan: immutableBaselinePlan,
        hasApprovedRipple: false,
        openRunId: null,
        openRun: null,
        dailyCapReached: false,
      }}
    />
  );
}
