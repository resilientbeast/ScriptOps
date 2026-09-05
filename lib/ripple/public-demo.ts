import type { DemoInstance } from "@/lib/firestore/state-types";
import type { RippleStateRepository } from "@/lib/firestore/ripple-state";
import {
  toPublicRippleRun,
  type PublicRippleRun,
} from "@/lib/ripple/contracts";

export type PublicDemoSnapshot = {
  cycle: number;
  planVersion: number;
  currentPlan: DemoInstance["currentPlan"];
  hasApprovedRipple: boolean;
  openRunId: string | null;
  openRun: PublicRippleRun | null;
  dailyCapReached: boolean;
};

export async function toPublicDemoSnapshot(
  repository: RippleStateRepository,
  instance: DemoInstance,
  dailyCap: number,
): Promise<PublicDemoSnapshot> {
  const [openRun, usage] = await Promise.all([
    instance.openRunId ? repository.getRun(instance.openRunId) : null,
    repository.getDailyUsage(new Date().toISOString().slice(0, 10)),
  ]);
  if (
    (instance.openRunId && !openRun) ||
    (openRun && openRun.demoId !== instance.demoId)
  ) {
    throw new Error("Open run ownership mismatch");
  }

  return {
    cycle: instance.cycle,
    planVersion: instance.planVersion,
    currentPlan: instance.currentPlan,
    hasApprovedRipple: instance.hasApprovedRipple,
    openRunId: instance.openRunId,
    openRun: openRun ? toPublicRippleRun(openRun) : null,
    dailyCapReached: (usage?.acceptedStarts ?? 0) >= (usage?.cap ?? dailyCap),
  };
}
