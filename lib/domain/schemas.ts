import { z } from "zod";

import {
  addDocumentSizeIssue,
  addProhibitedClaimIssues,
  addUniqueValueIssues,
  isHttpUrl,
  MAX_PERSISTED_DOCUMENT_BYTES,
} from "@/lib/domain/invariants";

export const FIXTURE_VERSION = "2026-09-04.1";
export { MAX_PERSISTED_DOCUMENT_BYTES };

export const persistedDocumentSizeSchema = z
  .unknown()
  .superRefine((value, context) => addDocumentSizeIssue(value, context));

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const shortTextSchema = z.string().trim().min(1).max(500);
const noteSchema = z.string().trim().min(1).max(1_000);
const notesSchema = z.array(noteSchema).max(20);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.url().refine(isHttpUrl, "URL must use HTTP or HTTPS");

export const sourceModeSchema = z.enum(["live", "cached"]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);
export const stageNameSchema = z.enum([
  "breakdown",
  "evidence",
  "schedule",
  "budget",
  "locations",
  "casting",
]);

export const publicErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
    message: shortTextSchema,
    baselineChanged: z.literal(false),
    retryable: z.boolean(),
    stage: stageNameSchema.optional(),
  })
  .strict();

export const stageProgressSchema = z
  .object({
    status: z.enum(["pending", "active", "completed", "failed"]),
    message: shortTextSchema,
    startedAt: isoDateTimeSchema.nullable(),
    completedAt: isoDateTimeSchema.nullable(),
    failure: publicErrorSchema.nullable(),
  })
  .strict()
  .superRefine((stage, context) => {
    if (stage.status === "pending" && stage.startedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["startedAt"],
        message: "Pending stages cannot have a start time",
      });
    }

    if (stage.status === "active" && stage.startedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["startedAt"],
        message: "Active stages require a start time",
      });
    }

    if (stage.status === "completed" && stage.completedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Completed stages require a completion time",
      });
    }

    if (stage.status === "failed" && stage.failure === null) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Failed stages require a public failure",
      });
    }

    if (stage.status !== "failed" && stage.failure !== null) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Only failed stages may expose a public failure",
      });
    }
  });

export const rippleStageProgressSchema = z
  .object({
    breakdown: stageProgressSchema,
    evidence: stageProgressSchema,
    schedule: stageProgressSchema,
    budget: stageProgressSchema,
    locations: stageProgressSchema,
    casting: stageProgressSchema,
  })
  .strict();

export const sceneRequirementsSchema = z
  .object({
    timeOfDay: z.enum(["day", "night", "dawn", "dusk"]),
    weather: z.array(shortTextSchema).max(8),
    castRoleIds: z.array(identifierSchema).max(20),
    vehicles: notesSchema,
    stunts: notesSchema,
    minors: notesSchema,
    specialEquipment: notesSchema,
  })
  .strict();

export const sceneBreakdownSchema = z
  .object({
    id: identifierSchema,
    sceneNumber: z.number().int().positive(),
    heading: shortTextSchema,
    setting: z.enum(["interior", "exterior", "interior-exterior"]),
    location: shortTextSchema,
    summary: shortTextSchema,
    excerpt: z.string().trim().min(1).max(1_500),
    pageStart: z.number().positive(),
    pageEnd: z.number().positive(),
    requirements: sceneRequirementsSchema,
  })
  .strict()
  .superRefine((scene, context) => {
    if (scene.pageEnd < scene.pageStart) {
      context.addIssue({
        code: "custom",
        path: ["pageEnd"],
        message: "Scene page end must not precede its start",
      });
    }

    addUniqueValueIssues(
      scene.requirements.castRoleIds,
      context,
      ["requirements", "castRoleIds"],
      "Cast role IDs must be unique within a scene",
    );
  });

export const screenplayFixtureSchema = z
  .object({
    fixtureVersion: z.literal(FIXTURE_VERSION),
    productionId: identifierSchema,
    title: shortTextSchema,
    screenplayVersion: shortTextSchema,
    scenes: z.array(sceneBreakdownSchema).min(1).max(200),
  })
  .strict()
  .superRefine((screenplay, context) => {
    addUniqueValueIssues(
      screenplay.scenes.map((scene) => scene.id),
      context,
      ["scenes"],
      "Scene IDs must be unique",
    );
    addUniqueValueIssues(
      screenplay.scenes.map((scene) => scene.sceneNumber),
      context,
      ["scenes"],
      "Scene numbers must be unique",
    );
  });

export const shootingDaySchema = z
  .object({
    id: identifierSchema,
    dayNumber: z.number().int().positive(),
    label: shortTextSchema,
    sceneIds: z.array(identifierSchema).min(1).max(30),
    dayNight: z.enum(["day", "night", "mixed"]),
    estimatedHours: z.number().positive().max(24),
    setupRequirements: notesSchema,
    complianceNotes: notesSchema,
  })
  .strict()
  .superRefine((day, context) => {
    addUniqueValueIssues(
      day.sceneIds,
      context,
      ["sceneIds"],
      "A scene may appear only once within a shooting day",
    );
  });

export const shootingScheduleSchema = z
  .object({
    shootDays: z.number().int().positive(),
    days: z.array(shootingDaySchema).min(1).max(60),
  })
  .strict()
  .superRefine((schedule, context) => {
    if (schedule.shootDays !== schedule.days.length) {
      context.addIssue({
        code: "custom",
        path: ["shootDays"],
        message: "Shoot-day count must equal the number of day records",
      });
    }

    addUniqueValueIssues(
      schedule.days.map((day) => day.id),
      context,
      ["days"],
      "Shooting-day IDs must be unique",
    );
    addUniqueValueIssues(
      schedule.days.map((day) => day.dayNumber),
      context,
      ["days"],
      "Shooting-day numbers must be unique",
    );
  });

export const budgetCostDriverSchema = z
  .object({
    id: identifierSchema,
    label: shortTextSchema,
    direction: z.enum(["increase", "decrease", "neutral"]),
    reason: noteSchema,
    evidenceIds: z.array(identifierSchema).max(20),
  })
  .strict();

export const budgetBandSchema = z
  .object({
    currency: z.literal("USD"),
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
    deltaLow: z.number(),
    deltaHigh: z.number(),
    costDrivers: z.array(budgetCostDriverSchema).min(1).max(20),
    assumptions: notesSchema,
  })
  .strict()
  .superRefine((budget, context) => {
    if (budget.low > budget.high) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "Budget high value must be at least the low value",
      });
    }

    if (budget.deltaLow > budget.deltaHigh) {
      context.addIssue({
        code: "custom",
        path: ["deltaHigh"],
        message: "Budget delta high value must be at least the delta low value",
      });
    }

    addUniqueValueIssues(
      budget.costDrivers.map((driver) => driver.id),
      context,
      ["costDrivers"],
      "Budget cost-driver IDs must be unique",
    );
  });

export const locationCandidateSchema = z
  .object({
    id: identifierSchema,
    name: shortTextSchema,
    locality: shortTextSchema,
    region: z.literal("New Mexico"),
    fit: noteSchema,
    risks: z.array(noteSchema).min(1).max(12),
    evidenceIds: z.array(identifierSchema).max(20),
    mapSearchUrl: httpUrlSchema.optional(),
  })
  .strict();

export const castingBriefSchema = z
  .object({
    id: identifierSchema,
    roleName: shortTextSchema,
    archetype: noteSchema,
    performerType: z.literal("archetype"),
    ageCategory: z.enum(["adult", "minor"]),
    complianceNotes: notesSchema,
    specialistNeeds: notesSchema,
  })
  .strict();

export const approvedRevisionSchema = z
  .object({
    runId: z.uuid(),
    sceneId: identifierSchema,
    requestText: z.string().trim().min(10).max(2_000),
    basePlanVersion: z.number().int().positive(),
    planVersion: z.number().int().positive(),
    approvedAt: isoDateTimeSchema,
    evidenceSourceMode: sourceModeSchema,
  })
  .strict()
  .superRefine((revision, context) => {
    if (revision.planVersion !== revision.basePlanVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["planVersion"],
        message: "Approved revision must increment the plan version exactly once",
      });
    }
  });

const productionPlanObjectSchema = z
  .object({
    fixtureVersion: z.literal(FIXTURE_VERSION),
    production: z
      .object({
        id: identifierSchema,
        title: shortTextSchema,
        logline: noteSchema,
        region: z.literal("New Mexico"),
      })
      .strict(),
    scenes: z.array(sceneBreakdownSchema).min(1).max(200),
    schedule: shootingScheduleSchema,
    budget: budgetBandSchema,
    locations: z.array(locationCandidateSchema).min(1).max(20),
    casting: z.array(castingBriefSchema).min(1).max(50),
    revisionRecord: approvedRevisionSchema.nullable(),
  })
  .strict();

export const productionPlanSchema = productionPlanObjectSchema.superRefine(
  (plan, context) => {
    addDocumentSizeIssue(plan, context);
    addProhibitedClaimIssues(plan, context);
    addUniqueValueIssues(
      plan.scenes.map((scene) => scene.id),
      context,
      ["scenes"],
      "Scene IDs must be unique",
    );
    addUniqueValueIssues(
      plan.locations.map((location) => location.id),
      context,
      ["locations"],
      "Location IDs must be unique",
    );
    addUniqueValueIssues(
      plan.casting.map((brief) => brief.id),
      context,
      ["casting"],
      "Casting-brief IDs must be unique",
    );

    const sceneIds = new Set(plan.scenes.map((scene) => scene.id));
    const roleIds = new Set(plan.casting.map((brief) => brief.id));
    const scheduledSceneIds = new Set<string>();

    plan.schedule.days.forEach((day, dayIndex) => {
      day.sceneIds.forEach((sceneId, sceneIndex) => {
        if (!sceneIds.has(sceneId)) {
          context.addIssue({
            code: "custom",
            path: ["schedule", "days", dayIndex, "sceneIds", sceneIndex],
            message: "Schedule references an unknown scene",
          });
        }

        if (scheduledSceneIds.has(sceneId)) {
          context.addIssue({
            code: "custom",
            path: ["schedule", "days", dayIndex, "sceneIds", sceneIndex],
            message: "A scene may appear on only one shooting day",
          });
        }
        scheduledSceneIds.add(sceneId);
      });
    });

    plan.scenes.forEach((scene, sceneIndex) => {
      if (!scheduledSceneIds.has(scene.id)) {
        context.addIssue({
          code: "custom",
          path: ["scenes", sceneIndex, "id"],
          message: "Every scene must appear on exactly one shooting day",
        });
      }
    });

    plan.scenes.forEach((scene, sceneIndex) => {
      scene.requirements.castRoleIds.forEach((roleId, roleIndex) => {
        if (!roleIds.has(roleId)) {
          context.addIssue({
            code: "custom",
            path: [
              "scenes",
              sceneIndex,
              "requirements",
              "castRoleIds",
              roleIndex,
            ],
            message: "Scene references an unknown casting brief",
          });
        }
      });
    });
  },
);

export const baselinePlanFixtureSchema = productionPlanObjectSchema
  .omit({ scenes: true })
  .extend({
    screenplayFixtureVersion: z.literal(FIXTURE_VERSION),
  })
  .strict();

export const evidenceRecordSchema = z
  .object({
    id: identifierSchema,
    title: shortTextSchema,
    url: httpUrlSchema,
    excerpt: z.string().trim().min(1).max(4_000),
    objective: noteSchema,
    query: noteSchema,
    retrievedAt: isoDateTimeSchema,
    sourceMode: sourceModeSchema,
  })
  .strict();

export const evidenceBundleSchema = z
  .object({
    sourceMode: sourceModeSchema,
    records: z.array(evidenceRecordSchema).min(1).max(30),
    retrievedAt: isoDateTimeSchema,
    parallelRequestId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    addUniqueValueIssues(
      evidence.records.map((record) => record.id),
      context,
      ["records"],
      "Evidence record IDs must be unique",
    );

    evidence.records.forEach((record, index) => {
      if (record.sourceMode !== evidence.sourceMode) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "sourceMode"],
          message: "Evidence record mode must match its bundle",
        });
      }
    });
  });

function artifactImpactSchema<T extends z.ZodType>(artifactSchema: T) {
  return z
    .object({
      changed: z.boolean(),
      before: artifactSchema,
      after: artifactSchema,
      reasons: z.array(noteSchema).min(1).max(12),
      evidenceIds: z.array(identifierSchema).max(30),
      confidence: confidenceSchema,
    })
    .strict();
}

export const breakdownImpactSchema = artifactImpactSchema(sceneBreakdownSchema);
export const scheduleImpactSchema = artifactImpactSchema(shootingScheduleSchema);
export const budgetImpactSchema = artifactImpactSchema(budgetBandSchema);
export const locationsImpactSchema = artifactImpactSchema(
  z.array(locationCandidateSchema).min(1).max(20),
);
export const castingImpactSchema = artifactImpactSchema(
  z.array(castingBriefSchema).min(1).max(50),
);

export const revisionProposalSchema = z
  .object({
    runId: z.uuid(),
    sceneId: identifierSchema,
    requestText: z.string().trim().min(10).max(2_000),
    basePlanVersion: z.number().int().positive(),
    proposedPlan: productionPlanSchema,
    impacts: z
      .object({
        breakdown: breakdownImpactSchema,
        schedule: scheduleImpactSchema,
        budget: budgetImpactSchema,
        locations: locationsImpactSchema,
        casting: castingImpactSchema,
      })
      .strict(),
    evidence: evidenceBundleSchema,
    assumptions: notesSchema,
    warnings: notesSchema,
    generatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((proposal, context) => {
    addDocumentSizeIssue(proposal, context);
    addProhibitedClaimIssues(proposal, context);

    if (proposal.proposedPlan.revisionRecord !== null) {
      context.addIssue({
        code: "custom",
        path: ["proposedPlan", "revisionRecord"],
        message: "A proposal cannot contain an approved revision record",
      });
    }

    if (!proposal.proposedPlan.scenes.some((scene) => scene.id === proposal.sceneId)) {
      context.addIssue({
        code: "custom",
        path: ["sceneId"],
        message: "Proposal scene must exist in the proposed plan",
      });
    }

    const evidenceIds = new Set(
      proposal.evidence.records.map((record) => record.id),
    );
    const impacts = Object.entries(proposal.impacts);

    impacts.forEach(([impactName, impact]) => {
      impact.evidenceIds.forEach((evidenceId, evidenceIndex) => {
        if (!evidenceIds.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            path: ["impacts", impactName, "evidenceIds", evidenceIndex],
            message: "Impact references missing evidence",
          });
        }
      });
    });

    proposal.proposedPlan.budget.costDrivers.forEach((driver, driverIndex) => {
      driver.evidenceIds.forEach((evidenceId, evidenceIndex) => {
        if (!evidenceIds.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            path: [
              "proposedPlan",
              "budget",
              "costDrivers",
              driverIndex,
              "evidenceIds",
              evidenceIndex,
            ],
            message: "Budget driver references missing evidence",
          });
        }
      });
    });

    proposal.proposedPlan.locations.forEach((location, locationIndex) => {
      location.evidenceIds.forEach((evidenceId, evidenceIndex) => {
        if (!evidenceIds.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            path: [
              "proposedPlan",
              "locations",
              locationIndex,
              "evidenceIds",
              evidenceIndex,
            ],
            message: "Location references missing evidence",
          });
        }
      });
    });
  });

export const evidenceFallbackFixtureSchema = z
  .object({
    fixtureVersion: z.literal(FIXTURE_VERSION),
    region: z.literal("New Mexico"),
    disclosure: shortTextSchema,
    objectives: z.array(noteSchema).min(1).max(3),
    queries: z.array(noteSchema).min(1).max(4),
    evidence: evidenceBundleSchema,
  })
  .strict()
  .superRefine((fixture, context) => {
    if (fixture.evidence.sourceMode !== "cached") {
      context.addIssue({
        code: "custom",
        path: ["evidence", "sourceMode"],
        message: "Bundled fallback evidence must remain visibly cached",
      });
    }
  });

export const approvedExampleSourceFixtureSchema = z
  .object({
    fixtureVersion: z.literal(FIXTURE_VERSION),
    baselineFixtureVersion: z.literal(FIXTURE_VERSION),
    disclosure: shortTextSchema,
    runId: z.uuid(),
    sceneId: z.literal("scene-14"),
    requestText: z.string().trim().min(10).max(2_000),
    basePlanVersion: z.number().int().positive(),
    revisedScene: sceneBreakdownSchema,
    revisedSchedule: shootingScheduleSchema,
    revisedBudget: budgetBandSchema,
    revisedLocations: z.array(locationCandidateSchema).min(1).max(20),
    revisedCasting: z.array(castingBriefSchema).min(1).max(50),
    evidence: evidenceBundleSchema,
    assumptions: notesSchema,
    warnings: notesSchema,
    generatedAt: isoDateTimeSchema,
    approvedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((fixture, context) => {
    if (fixture.revisedScene.id !== fixture.sceneId) {
      context.addIssue({
        code: "custom",
        path: ["revisedScene", "id"],
        message: "Approved fixture revision must target its declared scene",
      });
    }

    if (fixture.evidence.sourceMode !== "cached") {
      context.addIssue({
        code: "custom",
        path: ["evidence", "sourceMode"],
        message: "Bundled approved fixture must remain visibly cached",
      });
    }
  });

export const approvedExampleFixtureSchema = z
  .object({
    fixtureVersion: z.literal(FIXTURE_VERSION),
    disclosure: shortTextSchema,
    proposal: revisionProposalSchema,
    approvedPlan: productionPlanSchema,
  })
  .strict()
  .superRefine((fixture, context) => {
    const revision = fixture.approvedPlan.revisionRecord;

    if (revision === null) {
      context.addIssue({
        code: "custom",
        path: ["approvedPlan", "revisionRecord"],
        message: "Approved example requires an approved revision record",
      });
      return;
    }

    if (revision.runId !== fixture.proposal.runId) {
      context.addIssue({
        code: "custom",
        path: ["approvedPlan", "revisionRecord", "runId"],
        message: "Approved example must reference its proposal run",
      });
    }
  });
