import approvedExampleJson from "@/fixtures/approved-example.json";
import baselinePlanJson from "@/fixtures/baseline-plan.json";
import evidenceFallbackJson from "@/fixtures/evidence-fallback.json";
import sampleScreenplayJson from "@/fixtures/sample-screenplay.json";
import { goldenRevisionProposalSchema } from "@/lib/domain/golden-invariants";
import {
  approvedExampleFixtureSchema,
  approvedExampleSourceFixtureSchema,
  baselinePlanFixtureSchema,
  evidenceFallbackFixtureSchema,
  productionPlanSchema,
  revisionProposalSchema,
  screenplayFixtureSchema,
} from "@/lib/domain/schemas";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => deepFreeze(child));
  }

  return value;
}

const screenplay = screenplayFixtureSchema.parse(sampleScreenplayJson);
const baselineSource = baselinePlanFixtureSchema.parse(baselinePlanJson);

if (baselineSource.screenplayFixtureVersion !== screenplay.fixtureVersion) {
  throw new Error("Baseline and screenplay fixture versions do not match");
}

const baseline = productionPlanSchema.parse({
  fixtureVersion: baselineSource.fixtureVersion,
  production: baselineSource.production,
  scenes: screenplay.scenes,
  schedule: baselineSource.schedule,
  budget: baselineSource.budget,
  locations: baselineSource.locations,
  casting: baselineSource.casting,
  revisionRecord: baselineSource.revisionRecord,
});
const fallbackEvidence = evidenceFallbackFixtureSchema.parse(
  evidenceFallbackJson,
);
const approvedSource = approvedExampleSourceFixtureSchema.parse(
  approvedExampleJson,
);

if (approvedSource.baselineFixtureVersion !== baseline.fixtureVersion) {
  throw new Error("Approved example and baseline fixture versions do not match");
}

const baselineScene = baseline.scenes.find(
  (scene) => scene.id === approvedSource.sceneId,
);

if (!baselineScene) {
  throw new Error("Approved example targets a scene absent from the baseline");
}

const proposedPlan = productionPlanSchema.parse({
  ...baseline,
  scenes: baseline.scenes.map((scene) =>
    scene.id === approvedSource.sceneId ? approvedSource.revisedScene : scene,
  ),
  schedule: approvedSource.revisedSchedule,
  budget: approvedSource.revisedBudget,
  locations: approvedSource.revisedLocations,
  casting: approvedSource.revisedCasting,
  revisionRecord: null,
});

const proposal = revisionProposalSchema.parse({
  runId: approvedSource.runId,
  sceneId: approvedSource.sceneId,
  requestText: approvedSource.requestText,
  basePlanVersion: approvedSource.basePlanVersion,
  proposedPlan,
  impacts: {
    breakdown: {
      changed: true,
      before: baselineScene,
      after: approvedSource.revisedScene,
      reasons: [
        "The prepared revision changes time, weather, cast, and vehicle action.",
      ],
      evidenceIds: ["evidence-child-labor", "evidence-stunt-safety"],
      confidence: "high",
    },
    schedule: {
      changed: true,
      before: baseline.schedule,
      after: approvedSource.revisedSchedule,
      reasons: [
        "A protected fifth night unit isolates Scene 14's rain setup, stunt preparation, and child-work window.",
      ],
      evidenceIds: [
        "evidence-child-labor",
        "evidence-traffic-control",
        "evidence-stunt-safety",
      ],
      confidence: "high",
    },
    budget: {
      changed: true,
      before: baseline.budget,
      after: approvedSource.revisedBudget,
      reasons: [
        "Weather, lighting, night work, stunt driving, and child compliance raise the planning band.",
      ],
      evidenceIds: [
        "evidence-child-labor",
        "evidence-traffic-control",
        "evidence-stunt-safety",
        "evidence-weather",
      ],
      confidence: "medium",
    },
    locations: {
      changed: true,
      before: baseline.locations,
      after: approvedSource.revisedLocations,
      reasons: [
        "Candidates are re-ranked around control, rigging, drainage, and stunt-safety needs.",
      ],
      evidenceIds: [
        "evidence-permits",
        "evidence-traffic-control",
        "evidence-stunt-safety",
        "evidence-weather",
      ],
      confidence: "medium",
    },
    casting: {
      changed: true,
      before: baseline.casting,
      after: approvedSource.revisedCasting,
      reasons: [
        "The revision adds a child witness and qualified stunt-driving support.",
      ],
      evidenceIds: ["evidence-child-labor", "evidence-stunt-safety"],
      confidence: "high",
    },
  },
  evidence: approvedSource.evidence,
  assumptions: approvedSource.assumptions,
  warnings: approvedSource.warnings,
  generatedAt: approvedSource.generatedAt,
});

goldenRevisionProposalSchema.parse(proposal);

const approvedPlan = productionPlanSchema.parse({
  ...proposedPlan,
  revisionRecord: {
    runId: approvedSource.runId,
    sceneId: approvedSource.sceneId,
    requestText: approvedSource.requestText,
    basePlanVersion: approvedSource.basePlanVersion,
    planVersion: approvedSource.basePlanVersion + 1,
    approvedAt: approvedSource.approvedAt,
    evidenceSourceMode: approvedSource.evidence.sourceMode,
  },
});

const approvedExample = approvedExampleFixtureSchema.parse({
  fixtureVersion: approvedSource.fixtureVersion,
  disclosure: approvedSource.disclosure,
  proposal,
  approvedPlan,
});

export const sampleScreenplayFixture = deepFreeze(screenplay);
export const immutableBaselinePlan = deepFreeze(baseline);
export const evidenceFallbackFixture = deepFreeze(fallbackEvidence);
export const approvedExampleFixture = deepFreeze(approvedExample);
