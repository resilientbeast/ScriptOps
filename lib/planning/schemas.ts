import { z } from "zod";

import { addDocumentSizeIssue, addProhibitedClaimIssues, addUniqueValueIssues } from "@/lib/domain/invariants";
import { MAX_SOURCE_SPANS_PER_SCENE } from "@/lib/ingestion/contracts";

const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const shortTextSchema = z.string().trim().min(1).max(500);
const noteSchema = z.string().trim().min(1).max(1_000);
const notesSchema = z.array(noteSchema).max(30);
const locationRiskSchema = noteSchema.refine(
  note => !/\b(?:standard|mandatory|legal|regulatory|approved|secured)\b/i.test(note),
  "Location risks must describe uncertainty without declaring a standard, legal rule, approval, or secured access.",
);
const cautiousComplianceNotesSchema = notesSchema.superRefine((notes, context) => {
  notes.forEach((note, index) => {
    if (!/\b(?:verify|confirm|consult|check|review|pending|subject to)\b/i.test(note) || /\b(?:standard|mandatory|legal|regulatory)\b/i.test(note)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "Compliance notes must state a verification step without declaring a standard or legal rule.",
      });
    }
  });
});
const castingComplianceNotesSchema = notesSchema.superRefine((notes, context) => {
  notes.forEach((note, index) => {
    if (/\b(?:standard|mandatory|legal|regulatory)\b/i.test(note)) {
      context.addIssue({ code: "custom", path: [index], message: "Casting notes may not declare a standard or legal rule." });
    }
  });
});

const planningInputsFields = {
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    regionCode: z.string().trim().min(1).max(20),
    currency: z.string().regex(/^[A-Z]{3}$/),
    assumptions: notesSchema,
    budgetCeiling: z.number().nonnegative().nullable(),
    shootWindow: z
      .object({ start: z.iso.date(), end: z.iso.date() })
      .strict()
      .nullable(),
    targetHoursPerDay: z.number().positive().max(24).nullable(),
    supportProfileVersion: z.string().trim().min(1).max(100),
};

function validateShootWindow(
  inputs: { shootWindow: { start: string; end: string } | null },
  context: z.RefinementCtx,
): void {
  if (inputs.shootWindow && inputs.shootWindow.end < inputs.shootWindow.start) {
    context.addIssue({
      code: "custom",
      path: ["shootWindow", "end"],
      message: "Shoot-window end must not precede its start.",
    });
  }
}

export const planningInputsRequestSchema = z
  .object(planningInputsFields)
  .strict()
  .superRefine(validateShootWindow);

export const planningInputsSchema = z
  .object({
    version: z.number().int().positive(),
    ...planningInputsFields,
    inputHash: hashSchema,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine(validateShootWindow);

export const planningSceneSchema = z
  .object({
    id: identifierSchema,
    displayNumber: z.string().regex(/^\d+[A-Z]?$/).nullable(),
    heading: shortTextSchema,
    setting: z.enum(["interior", "exterior", "interior-exterior", "unknown"]),
    storyLocation: z.string().trim().min(1).max(300).nullable(),
    timeOfDay: z.enum(["day", "night", "dawn", "dusk", "other", "unknown"]),
    summary: noteSchema,
    sourceFactIds: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_SOURCE_SPANS_PER_SCENE),
    sourceFacts: z.array(z.object({
      sourceId: z.string().trim().min(1).max(200),
      quote: noteSchema,
    }).strict()).min(1).max(MAX_SOURCE_SPANS_PER_SCENE),
    requirements: z
      .object({
        castRoleIds: z.array(identifierSchema).max(30),
        vehicles: notesSchema,
        stunts: notesSchema,
        minors: notesSchema,
        specialEquipment: notesSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((scene, context) => {
    if (scene.sourceFacts.some(fact => !scene.sourceFactIds.includes(fact.sourceId))) {
      context.addIssue({ code: "custom", path: ["sourceFacts"], message: "Source facts must reference a declared scene source." });
    }
  });

const shootingDaySchema = z
  .object({
    id: identifierSchema,
    dayNumber: z.number().int().positive(),
    label: shortTextSchema,
    sceneIds: z.array(identifierSchema).min(1).max(30),
    dayNight: z.enum(["day", "night", "mixed"]),
    estimatedHours: z.number().positive().max(24),
    setupRequirements: notesSchema,
    complianceNotes: cautiousComplianceNotesSchema,
  })
  .strict();

export const shootingScheduleSchema = z
  .object({
    shootDays: z.number().int().positive(),
    days: z.array(shootingDaySchema).min(1).max(150),
  })
  .strict()
  .superRefine((schedule, context) => {
    if (schedule.shootDays !== schedule.days.length) {
      context.addIssue({
        code: "custom",
        path: ["shootDays"],
        message: "Shoot-day count must match the number of shooting-day records.",
      });
    }
    addUniqueValueIssues(
      schedule.days.map((day) => day.id),
      context,
      ["days"],
      "Shooting-day IDs must be unique.",
    );
    addUniqueValueIssues(
      schedule.days.map((day) => day.dayNumber),
      context,
      ["days"],
      "Shooting-day numbers must be unique.",
    );
  });

export const evidenceRecordSchema = z
  .object({
    id: identifierSchema,
    title: shortTextSchema,
    url: z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol)),
    retrievedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const budgetDriverSchema = z
  .object({
    id: identifierSchema,
    label: shortTextSchema,
    direction: z.enum(["increase", "decrease", "neutral"]),
    reason: noteSchema,
    evidenceIds: z.array(identifierSchema).max(20),
  })
  .strict();

const budgetLineItemSchema = z
  .object({
    id: identifierSchema,
    category: shortTextSchema,
    quantity: z.number().positive().max(10_000),
    unit: shortTextSchema,
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
    basis: noteSchema,
    evidenceIds: z.array(identifierSchema).min(1).max(20),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.low > item.high) {
      context.addIssue({ code: "custom", path: ["high"], message: "Line-item high value must be at least the low value." });
    }
  });

export const initialBudgetSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
    lineItems: z.array(budgetLineItemSchema).min(1).max(100),
    costDrivers: z.array(budgetDriverSchema).min(1).max(30),
    assumptions: notesSchema,
  })
  .strict()
  .superRefine((budget, context) => {
    if (budget.low > budget.high) {
      context.addIssue({
        code: "custom",
        path: ["high"],
        message: "Budget high value must be at least the low value.",
      });
    }
    const lineLow = budget.lineItems.reduce((total, item) => total + item.low, 0);
    const lineHigh = budget.lineItems.reduce((total, item) => total + item.high, 0);
    if (Math.abs(lineLow - budget.low) > 0.01 || Math.abs(lineHigh - budget.high) > 0.01) {
      context.addIssue({
        code: "custom",
        path: ["lineItems"],
        message: "Budget totals must equal the sum of the line-item low and high values.",
      });
    }
  });

export const locationCandidateSchema = z
  .object({
    id: identifierSchema,
    name: shortTextSchema,
    locality: shortTextSchema,
    regionCode: z.string().trim().min(1).max(20),
    fit: noteSchema,
    risks: z.array(locationRiskSchema).max(20),
    evidenceIds: z.array(identifierSchema).max(20),
  })
  .strict();

export const castingBriefSchema = z
  .object({
    id: identifierSchema,
    roleName: shortTextSchema,
    archetype: noteSchema,
    ageCategory: z.enum(["adult", "minor", "unknown"]),
    complianceNotes: castingComplianceNotesSchema,
    specialistNeeds: notesSchema,
  })
  .strict();

export const initialProductionPlanSchema = z
  .object({
    title: shortTextSchema,
    logline: noteSchema.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    scenes: z.array(planningSceneSchema).min(1).max(200),
    schedule: shootingScheduleSchema,
    budget: initialBudgetSchema,
    locations: z.array(locationCandidateSchema).min(1).max(50),
    casting: z.array(castingBriefSchema).max(100),
    evidence: z.array(evidenceRecordSchema).min(1).max(50),
    assumptions: notesSchema,
    warnings: notesSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    addDocumentSizeIssue(plan, context);
    addProhibitedClaimIssues(plan, context);
    if (plan.currency !== plan.budget.currency) {
      context.addIssue({
        code: "custom",
        path: ["budget", "currency"],
        message: "Plan and budget currency must match.",
      });
    }
    addUniqueValueIssues(
      plan.scenes.map((scene) => scene.id),
      context,
      ["scenes"],
      "Scene IDs must be unique.",
    );
    addUniqueValueIssues(
      plan.casting.map((brief) => brief.id),
      context,
      ["casting"],
      "Casting IDs must be unique.",
    );
    addUniqueValueIssues(
      plan.locations.map((location) => location.id),
      context,
      ["locations"],
      "Location IDs must be unique.",
    );
    addUniqueValueIssues(
      plan.evidence.map((record) => record.id),
      context,
      ["evidence"],
      "Evidence IDs must be unique.",
    );

    const sceneIds = new Set(plan.scenes.map((scene) => scene.id));
    const roleIds = new Set(plan.casting.map((brief) => brief.id));
    const evidenceIds = new Set(plan.evidence.map((record) => record.id));
    const scheduledSceneIds = new Set<string>();
    plan.schedule.days.forEach((day, dayIndex) => {
      day.sceneIds.forEach((sceneId, sceneIndex) => {
        if (!sceneIds.has(sceneId)) {
          context.addIssue({
            code: "custom",
            path: ["schedule", "days", dayIndex, "sceneIds", sceneIndex],
            message: "Schedule references an unknown scene.",
          });
        }
        if (scheduledSceneIds.has(sceneId)) {
          context.addIssue({
            code: "custom",
            path: ["schedule", "days", dayIndex, "sceneIds", sceneIndex],
            message: "Each scene may appear on only one shooting day in the pilot schedule model.",
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
          message: "Every scene must appear in the schedule.",
        });
      }
      scene.requirements.castRoleIds.forEach((roleId, roleIndex) => {
        if (!roleIds.has(roleId)) {
          context.addIssue({
            code: "custom",
            path: ["scenes", sceneIndex, "requirements", "castRoleIds", roleIndex],
            message: "Scene references an unknown casting brief.",
          });
        }
      });
    });
    const assertEvidence = (ids: string[], path: PropertyKey[]) => {
      ids.forEach((evidenceId, evidenceIndex) => {
        if (!evidenceIds.has(evidenceId)) {
          context.addIssue({
            code: "custom",
            path: [...path, evidenceIndex],
            message: "Reference points to evidence not present in this plan.",
          });
        }
      });
    };
    plan.budget.costDrivers.forEach((driver, index) =>
      assertEvidence(driver.evidenceIds, ["budget", "costDrivers", index, "evidenceIds"]),
    );
    plan.budget.lineItems.forEach((lineItem, index) =>
      assertEvidence(lineItem.evidenceIds, ["budget", "lineItems", index, "evidenceIds"]),
    );
    plan.locations.forEach((location, index) =>
      assertEvidence(location.evidenceIds, ["locations", index, "evidenceIds"]),
    );
  });

export const initialPlanDraftSchema = z
  .object({
    kind: z.literal("initial"),
    basePlanVersion: z.literal(0),
    sceneRevisionId: identifierSchema,
    planningInputsVersion: z.number().int().positive(),
    inputHash: hashSchema,
    plan: initialProductionPlanSchema,
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type PlanningInputs = z.infer<typeof planningInputsSchema>;
export type InitialProductionPlan = z.infer<typeof initialProductionPlanSchema>;
export type InitialPlanDraft = z.infer<typeof initialPlanDraftSchema>;
