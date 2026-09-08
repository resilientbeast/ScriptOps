import { describe, expect, it } from "vitest";

import { projectJobSchema } from "@/lib/jobs/schemas";
import {
  initialPlanDraftSchema,
  planningInputsSchema,
} from "@/lib/planning/schemas";
import { projectSchema } from "@/lib/projects/schemas";
import { acceptedSceneRevisionSchema, scriptVersionSchema } from "@/lib/scripts/schemas";

const timestamp = "2026-09-06T15:00:00.000Z";
const hash = "a".repeat(64);

function initialPlan() {
  return {
    title: "Synthetic Feature",
    logline: null,
    currency: "USD",
    scenes: [
      {
        id: "scene-1",
        displayNumber: "12A",
        heading: "INT. SYNTHETIC STUDIO - DAY",
        setting: "interior",
        storyLocation: "Synthetic Studio",
        timeOfDay: "day",
        summary: "A producer checks the lighting plan.",
        sourceFactIds: ["source-1"],
        sourceFacts: [
          { sourceId: "source-1", quote: "A producer checks the lighting plan." },
        ],
        requirements: {
          castRoleIds: [],
          vehicles: [],
          stunts: [],
          minors: [],
          specialEquipment: ["Lighting package"],
        },
      },
    ],
    schedule: {
      shootDays: 1,
      days: [
        {
          id: "day-1",
          dayNumber: 1,
          label: "Studio day",
          sceneIds: ["scene-1"],
          dayNight: "day",
          estimatedHours: 10,
          setupRequirements: ["Lighting setup"],
          complianceNotes: [],
        },
      ],
    },
    budget: {
      currency: "USD",
      low: 1000,
      high: 1500,
      lineItems: [
        {
          id: "line-1",
          category: "Lighting package",
          quantity: 1,
          unit: "shoot day",
          low: 1000,
          high: 1500,
          basis: "One controlled interior setup requires a lighting package.",
          evidenceIds: ["evidence-1"],
        },
      ],
      costDrivers: [
        {
          id: "driver-1",
          label: "Lighting package",
          direction: "increase",
          reason: "The scene requires a controlled interior setup.",
          evidenceIds: ["evidence-1"],
        },
      ],
      assumptions: ["Estimate excludes negotiated vendor rates."],
    },
    locations: [
      {
        id: "location-1",
        name: "Synthetic Studio",
        locality: "Santa Fe",
        regionCode: "US-NM",
        fit: "Controlled interior with power access.",
        risks: ["Availability requires confirmation."],
        evidenceIds: ["evidence-1"],
      },
    ],
    casting: [],
    evidence: [
      {
        id: "evidence-1",
        title: "Synthetic production guidance",
        url: "https://example.test/production-guidance",
        retrievedAt: timestamp,
      },
    ],
    assumptions: ["The production is shooting in the US-NM pilot profile."],
    warnings: [],
  };
}

describe("post-hackathon project contracts", () => {
  it("accepts product-owned project, script, scene, and Plan v1 records", () => {
    const project = projectSchema.parse({
      id: "project-1",
      ownerUserId: "user_123",
      title: "Synthetic Feature",
      lifecycle: "active",
      recordVersion: 1,
      planningInputsVersion: 1,
      activeScriptVersionId: "script-1",
      acceptedSceneRevisionId: "scene-revision-1",
      approvedPlanVersion: 0,
      approvedManifestId: null,
      activeJobId: null,
      pendingUploadId: null,
      writeEpoch: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(project.ownerUserId).toBe("user_123");

    const inputs = planningInputsSchema.parse({
      version: 1,
      countryCode: "US",
      regionCode: "US-NM",
      currency: "USD",
      assumptions: [],
      budgetCeiling: null,
      shootWindow: null,
      targetHoursPerDay: null,
      supportProfileVersion: "us-nm-v1",
      inputHash: hash,
      createdAt: timestamp,
    });
    expect(inputs.currency).toBe("USD");

    const script = scriptVersionSchema.parse({
      id: "script-1",
      format: "fdx",
      originalFilename: "synthetic-feature.fdx",
      declaredBytes: 4_096,
      sourceObjectRef: null,
      status: "review-ready",
      contentHash: hash,
      parserVersion: "fdx-v1",
      currentReviewRevisionId: "scene-revision-1",
      uploadedBy: "user_123",
      createdAt: timestamp,
    });
    expect(script.format).toBe("fdx");

    const revision = acceptedSceneRevisionSchema.parse({
      id: "scene-revision-1",
      scriptVersionId: "script-1",
      parentRevisionId: null,
      editVersion: 0,
      status: "accepted",
      sceneManifestHash: hash,
      scenes: [
        {
          id: "scene-1",
          ordinal: 1,
          displayNumber: "12A",
          originalHeading: "INT. SYNTHETIC STUDIO - DAY",
          reviewedHeading: "INT. SYNTHETIC STUDIO - DAY",
          sourceSpans: [
            {
              sourceId: "source-1",
              page: null,
              blockIndex: 0,
              startOffset: 0,
              endOffset: 31,
            },
          ],
          warningIds: [],
          predecessorSceneIds: [],
        },
      ],
      acknowledgedWarningIds: [],
      acceptedBy: "user_123",
      acceptedAt: timestamp,
    });
    expect(revision.scenes[0]!.displayNumber).toBe("12A");

    const draft = initialPlanDraftSchema.parse({
      kind: "initial",
      basePlanVersion: 0,
      sceneRevisionId: "scene-revision-1",
      planningInputsVersion: 1,
      inputHash: hash,
      plan: initialPlan(),
      generatedAt: timestamp,
    });
    expect(draft.plan.casting).toEqual([]);
  });

  it("rejects unknown fields, foreign references, and initial-plan deltas", () => {
    expect(
      planningInputsSchema.safeParse({
        version: 1,
        countryCode: "US",
        regionCode: "US-NM",
        currency: "USD",
        assumptions: [],
        budgetCeiling: null,
        shootWindow: null,
        targetHoursPerDay: null,
        supportProfileVersion: "us-nm-v1",
        inputHash: hash,
        createdAt: timestamp,
        unsupported: true,
      }).success,
    ).toBe(false);

    const planWithForeignReference = initialPlan();
    planWithForeignReference.schedule.days[0]!.sceneIds = ["scene-404"];
    expect(
      initialPlanDraftSchema.safeParse({
        kind: "initial",
        basePlanVersion: 0,
        sceneRevisionId: "scene-revision-1",
        planningInputsVersion: 1,
        inputHash: hash,
        plan: planWithForeignReference,
        generatedAt: timestamp,
      }).success,
    ).toBe(false);

    const planWithDelta = initialPlan();
    Object.assign(planWithDelta.budget, { deltaLow: 10, deltaHigh: 20 });
    expect(
      initialPlanDraftSchema.safeParse({
        kind: "initial",
        basePlanVersion: 0,
        sceneRevisionId: "scene-revision-1",
        planningInputsVersion: 1,
        inputHash: hash,
        plan: planWithDelta,
        generatedAt: timestamp,
      }).success,
    ).toBe(false);
  });

  it("requires an immutable accepted-scene hash for initial planning jobs", () => {
    const job = {
      id: "job-1",
      projectId: "project-1",
      kind: "initial-plan",
      status: "queued",
      projectWriteEpoch: 0,
      requestHash: hash,
      idempotencyKeyHash: hash,
      scriptVersionId: "script-1",
      sceneRevisionId: "scene-revision-1",
      planningInputsVersion: 1,
      inputHash: hash,
      basePlanVersion: 0,
      candidateManifestId: null,
      approvedVersion: null,
      createdAt: timestamp,
      finishedAt: null,
    };
    expect(projectJobSchema.safeParse(job).success).toBe(true);
    expect(projectJobSchema.safeParse({ ...job, inputHash: null }).success).toBe(false);
    expect(projectJobSchema.safeParse({ ...job, basePlanVersion: 1 }).success).toBe(false);
  });
});
