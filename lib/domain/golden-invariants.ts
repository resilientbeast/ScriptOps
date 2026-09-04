import type { RefinementCtx } from "zod";

import { revisionProposalSchema } from "@/lib/domain/schemas";

export const GOLDEN_SCENE_ID = "scene-14";
export const GOLDEN_REQUEST =
  "Move Scene 14 to a rainy night, add a child witness, and turn the escape into controlled stunt driving.";

function searchableText(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

function requireTerms(
  value: unknown,
  terms: readonly string[],
  context: RefinementCtx,
  path: PropertyKey[],
  label: string,
) {
  const text = searchableText(value);
  const missing = terms.filter((term) => !text.includes(term));

  if (missing.length > 0) {
    context.addIssue({
      code: "custom",
      path,
      message: `${label} is missing: ${missing.join(", ")}`,
    });
  }
}

export const goldenRevisionProposalSchema = revisionProposalSchema.superRefine(
  (proposal, context) => {
    if (proposal.sceneId !== GOLDEN_SCENE_ID) {
      context.addIssue({
        code: "custom",
        path: ["sceneId"],
        message: "Golden proposal must target Scene 14",
      });
    }

    if (proposal.requestText !== GOLDEN_REQUEST) {
      context.addIssue({
        code: "custom",
        path: ["requestText"],
        message: "Golden proposal must preserve the prepared request",
      });
    }

    Object.entries(proposal.impacts).forEach(([impactName, impact]) => {
      if (!impact.changed) {
        context.addIssue({
          code: "custom",
          path: ["impacts", impactName, "changed"],
          message: "All five golden-path artifacts must change",
        });
      }
    });

    requireTerms(
      proposal.impacts.breakdown.after,
      ["night", "rain", "child", "stunt driving"],
      context,
      ["impacts", "breakdown", "after"],
      "Golden breakdown",
    );
    requireTerms(
      proposal.evidence.records,
      ["new mexico", "permit", "child", "stunt"],
      context,
      ["evidence", "records"],
      "Golden evidence",
    );
    requireTerms(
      proposal.impacts.schedule.after,
      ["night", "lighting", "stunt", "child"],
      context,
      ["impacts", "schedule", "after"],
      "Golden schedule",
    );

    const revisedBudget = proposal.impacts.budget.after;
    if (revisedBudget.deltaLow <= 0 || revisedBudget.deltaHigh <= 0) {
      context.addIssue({
        code: "custom",
        path: ["impacts", "budget", "after"],
        message: "Golden budget must include a positive cost delta",
      });
    }
    requireTerms(
      revisedBudget,
      ["rain", "lighting", "night", "stunt", "child"],
      context,
      ["impacts", "budget", "after"],
      "Golden budget",
    );
    requireTerms(
      proposal.impacts.locations.after,
      ["access", "road-control", "rigging", "weather", "stunt"],
      context,
      ["impacts", "locations", "after"],
      "Golden locations",
    );
    requireTerms(
      proposal.impacts.casting.after,
      ["child witness", "stunt coordinator"],
      context,
      ["impacts", "casting", "after"],
      "Golden casting",
    );

    const sourceHosts = proposal.evidence.records.map(
      (record) => new URL(record.url).hostname,
    );
    if (!sourceHosts.some((host) => host.endsWith("nmfilm.com"))) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "records"],
        message: "Golden evidence must include New Mexico Film Office provenance",
      });
    }
  },
);
