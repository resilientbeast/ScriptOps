import type { z } from "zod";

import type {
  approvedExampleFixtureSchema,
  approvedExampleSourceFixtureSchema,
  baselinePlanFixtureSchema,
  budgetBandSchema,
  castingBriefSchema,
  evidenceBundleSchema,
  evidenceFallbackFixtureSchema,
  evidenceRecordSchema,
  locationCandidateSchema,
  productionPlanSchema,
  publicErrorSchema,
  revisionProposalSchema,
  rippleStageProgressSchema,
  sceneBreakdownSchema,
  screenplayFixtureSchema,
  shootingScheduleSchema,
  stageProgressSchema,
} from "@/lib/domain/schemas";

export type SceneBreakdown = z.infer<typeof sceneBreakdownSchema>;
export type ShootingSchedule = z.infer<typeof shootingScheduleSchema>;
export type BudgetBand = z.infer<typeof budgetBandSchema>;
export type LocationCandidate = z.infer<typeof locationCandidateSchema>;
export type CastingBrief = z.infer<typeof castingBriefSchema>;
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;
export type RevisionProposal = z.infer<typeof revisionProposalSchema>;
export type PublicError = z.infer<typeof publicErrorSchema>;
export type StageProgress = z.infer<typeof stageProgressSchema>;
export type RippleStageProgress = z.infer<typeof rippleStageProgressSchema>;
export type ScreenplayFixture = z.infer<typeof screenplayFixtureSchema>;
export type BaselinePlanFixture = z.infer<typeof baselinePlanFixtureSchema>;
export type EvidenceFallbackFixture = z.infer<
  typeof evidenceFallbackFixtureSchema
>;
export type ApprovedExampleFixture = z.infer<
  typeof approvedExampleFixtureSchema
>;
export type ApprovedExampleSourceFixture = z.infer<
  typeof approvedExampleSourceFixtureSchema
>;
