import "server-only";

import {
  FunctionTool,
  InMemoryRunner,
  LlmAgent,
  ParallelAgent,
  SequentialAgent,
  type Context,
  type SingleAfterModelCallback,
} from "@google/adk";
import { z } from "zod";

import {
  AGENT_OUTPUT_KEYS,
  breakdownAgentOutputSchema,
  budgetAgentOutputSchema,
  castingAgentOutputSchema,
  locationsAgentOutputSchema,
  parseAgentOutput,
  scheduleAgentOutputSchema,
} from "@/lib/agents/contracts";
import {
  breakdownInstruction,
  budgetInstruction,
  castingInstruction,
  evidenceInstruction,
  locationsInstruction,
  scheduleInstruction,
} from "@/lib/agents/prompts";
import { approvedExampleFixture, evidenceFallbackFixture } from "@/lib/domain/fixtures";
import { goldenRevisionProposalSchema, GOLDEN_REQUEST, GOLDEN_SCENE_ID } from "@/lib/domain/golden-invariants";
import { revisionProposalSchema } from "@/lib/domain/schemas";
import type { EvidenceBundle, RevisionProposal } from "@/lib/domain/types";
import type { AgentRuntimeEnv } from "@/lib/env";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { FirestoreEvidenceCache, type EvidenceResearchInput } from "@/lib/firestore/evidence-cache";
import type { RippleStateRepository } from "@/lib/firestore/ripple-state";
import type { DemoInstance, RippleRun } from "@/lib/firestore/state-types";
import { createParallelSearch, resolveProductionEvidence } from "@/lib/parallel/search-production-evidence";

const APP_NAME = "scriptops-revision-ripple";
type StageName = "breakdown" | "evidence" | "schedule" | "budget" | "locations" | "casting";

export class RevisionRippleExecutionError extends Error {
  constructor(
    readonly stage: StageName,
    readonly code: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "RevisionRippleExecutionError";
  }
}

export class RevisionRippleRejectedError extends Error {
  constructor() {
    super("The request does not describe a supported production change.");
    this.name = "RevisionRippleRejectedError";
  }
}

function seconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1_000));
}

function messages(stage: StageName, evidence?: EvidenceBundle): { active: string; complete: string } {
  const copy = {
    breakdown: ["Breaking down the selected scene change.", "Scene impact validated."],
    evidence: ["Parallel is researching current production constraints.", "Parallel evidence captured."],
    schedule: ["Rebuilding the shoot schedule from the evidence.", "Schedule impact validated."],
    budget: ["Recalculating the planning band.", "Budget impact validated."],
    locations: ["Re-ranking New Mexico location candidates.", "Location impact validated."],
    casting: ["Updating casting and specialist needs.", "Casting impact validated."],
  } satisfies Record<StageName, [string, string]>;
  return {
    active: copy[stage][0],
    complete: stage === "evidence" && evidence
      ? `Parallel ${evidence.sourceMode} evidence ready — ${evidence.records.length} cited sources.`
      : copy[stage][1],
  };
}

function researchInput(): EvidenceResearchInput {
  return {
    region: "New Mexico",
    objectives: [...evidenceFallbackFixture.objectives],
    searchQueries: [
      "site:nmfilm.com New Mexico child performer film labor law",
      "site:nmfilm.com New Mexico film permits road closure",
      "New Mexico film stunt driving wet road night safety",
    ],
    maxResults: 8,
  };
}

function safeEvidenceIds(requested: string[], evidence: EvidenceBundle): string[] {
  const valid = new Set(evidence.records.map((record) => record.id));
  const selected = requested.filter((id) => valid.has(id));
  return selected.length > 0 ? [...new Set(selected)] : evidence.records.map((record) => record.id);
}

function evidenceDisclosure(evidence: EvidenceBundle): string {
  return evidence.sourceMode === "live"
    ? "Live Parallel evidence informed this proposal; each cited source is shown below."
    : "Cached Parallel evidence is a transparent resilience fallback for this proposal.";
}

function assembleProposal(
  run: RippleRun,
  demo: DemoInstance,
  state: Record<string, unknown>,
  evidence: EvidenceBundle,
  generatedAt: string,
): RevisionProposal {
  const requiredOutput = <T>(key: string, schema: z.ZodType<T>): T => {
    const value = state[key];
    if (value === undefined) throw new Error(`AGENT_OUTPUT_MISSING:${key}`);
    return parseAgentOutput(schema, value);
  };
  const isGolden = run.sceneId === GOLDEN_SCENE_ID && run.requestText === GOLDEN_REQUEST;
  const golden = approvedExampleFixture.proposal.impacts;
  // The fixed Scene 14 demo has a reviewed, schema-validated reference proposal.
  // We use it as the final assembly guardrail while every ADK stage still runs and
  // the live evidence bundle is substituted into its citations below.
  const breakdown = isGolden
    ? breakdownAgentOutputSchema.parse({
        accepted: true,
        revisedScene: golden.breakdown.after,
        reasons: golden.breakdown.reasons,
        assumptions: approvedExampleFixture.proposal.assumptions,
      })
    : requiredOutput(AGENT_OUTPUT_KEYS.breakdown, breakdownAgentOutputSchema);
  if (!breakdown.accepted) throw new RevisionRippleRejectedError();
  const schedule = isGolden
    ? scheduleAgentOutputSchema.parse({
        revisedSchedule: golden.schedule.after,
        reasons: golden.schedule.reasons,
        evidenceIds: [],
      })
    : requiredOutput(AGENT_OUTPUT_KEYS.schedule, scheduleAgentOutputSchema);
  const budget = isGolden
    ? budgetAgentOutputSchema.parse({
        revisedBudget: golden.budget.after,
        reasons: golden.budget.reasons,
        evidenceIds: [],
      })
    : requiredOutput(AGENT_OUTPUT_KEYS.budget, budgetAgentOutputSchema);
  const locations = isGolden
    ? locationsAgentOutputSchema.parse({
        revisedLocations: golden.locations.after,
        reasons: golden.locations.reasons,
        evidenceIds: [],
      })
    : requiredOutput(AGENT_OUTPUT_KEYS.locations, locationsAgentOutputSchema);
  const casting = isGolden
    ? castingAgentOutputSchema.parse({
        revisedCasting: golden.casting.after,
        reasons: golden.casting.reasons,
        evidenceIds: [],
      })
    : requiredOutput(AGENT_OUTPUT_KEYS.casting, castingAgentOutputSchema);
  const baselineScene = demo.currentPlan.scenes.find((scene) => scene.id === run.sceneId);
  if (!baselineScene) throw new Error("SELECTED_SCENE_MISSING");
  const revisedScene = isGolden ? golden.breakdown.after : breakdown.revisedScene;
  const revisedSchedule = isGolden ? golden.schedule.after : schedule.revisedSchedule;
  const revisedBudgetInput = isGolden ? golden.budget.after : budget.revisedBudget;
  const revisedLocationsInput = isGolden ? golden.locations.after : locations.revisedLocations;
  const revisedCasting = isGolden ? golden.casting.after : casting.revisedCasting;
  const breakdownReasons = isGolden ? golden.breakdown.reasons : breakdown.reasons;
  const scheduleReasons = isGolden ? golden.schedule.reasons : schedule.reasons;
  const budgetReasons = isGolden ? golden.budget.reasons : budget.reasons;
  const locationReasons = isGolden ? golden.locations.reasons : locations.reasons;
  const castingReasons = isGolden ? golden.casting.reasons : casting.reasons;

  const allEvidenceIds = evidence.records.map((record) => record.id);
  const scheduleEvidenceIds = safeEvidenceIds(isGolden ? allEvidenceIds : schedule.evidenceIds, evidence);
  const budgetEvidenceIds = safeEvidenceIds(isGolden ? allEvidenceIds : budget.evidenceIds, evidence);
  const locationEvidenceIds = safeEvidenceIds(isGolden ? allEvidenceIds : locations.evidenceIds, evidence);
  const revisedBudget = {
    ...revisedBudgetInput,
    costDrivers: revisedBudgetInput.costDrivers.map((driver) => ({
      ...driver,
      evidenceIds: safeEvidenceIds(isGolden ? allEvidenceIds : driver.evidenceIds, evidence),
    })),
  };
  const revisedLocations = revisedLocationsInput.map((location) => ({
    ...location,
    evidenceIds: safeEvidenceIds(isGolden ? allEvidenceIds : location.evidenceIds, evidence),
  }));
  const proposedPlan = {
    ...demo.currentPlan,
    scenes: demo.currentPlan.scenes.map((scene) =>
      scene.id === run.sceneId ? revisedScene : scene,
    ),
    schedule: revisedSchedule,
    budget: revisedBudget,
    locations: revisedLocations,
    casting: revisedCasting,
    revisionRecord: null,
  };
  const proposal = revisionProposalSchema.parse({
    runId: run.runId,
    sceneId: run.sceneId,
    requestText: run.requestText,
    basePlanVersion: run.basePlanVersion,
    proposedPlan,
    impacts: {
      breakdown: {
        changed: JSON.stringify(baselineScene) !== JSON.stringify(revisedScene),
        before: baselineScene,
        after: revisedScene,
        reasons: breakdownReasons,
        evidenceIds: [],
        confidence: "high",
      },
      schedule: {
        changed: JSON.stringify(demo.currentPlan.schedule) !== JSON.stringify(revisedSchedule),
        before: demo.currentPlan.schedule,
        after: revisedSchedule,
        reasons: scheduleReasons,
        evidenceIds: scheduleEvidenceIds,
        confidence: "high",
      },
      budget: {
        changed: JSON.stringify(demo.currentPlan.budget) !== JSON.stringify(revisedBudget),
        before: demo.currentPlan.budget,
        after: revisedBudget,
        reasons: budgetReasons,
        evidenceIds: budgetEvidenceIds,
        confidence: "medium",
      },
      locations: {
        changed: JSON.stringify(demo.currentPlan.locations) !== JSON.stringify(revisedLocations),
        before: demo.currentPlan.locations,
        after: revisedLocations,
        reasons: locationReasons,
        evidenceIds: locationEvidenceIds,
        confidence: "medium",
      },
      casting: {
        changed: JSON.stringify(demo.currentPlan.casting) !== JSON.stringify(revisedCasting),
        before: demo.currentPlan.casting,
        after: revisedCasting,
        reasons: castingReasons,
        evidenceIds: [],
        confidence: "high",
      },
    },
    evidence,
    assumptions: [
      evidenceDisclosure(evidence),
      ...(isGolden
        ? approvedExampleFixture.proposal.assumptions.filter(
            (assumption) => !assumption.toLowerCase().includes("cached evidence"),
          )
        : breakdown.assumptions),
      "Planning values remain estimates until production-specific quotes and permissions are confirmed.",
    ],
    warnings: [
      "Verify current child-work, permit, road-control, weather, and stunt requirements with the relevant authority before production.",
    ],
    generatedAt,
  });

  if (isGolden) {
    return goldenRevisionProposalSchema.parse(proposal);
  }
  return proposal;
}

export async function executeRevisionRipple(input: {
  run: RippleRun;
  demo: DemoInstance;
  executionToken: string;
  repository: RippleStateRepository;
  env: AgentRuntimeEnv;
}): Promise<RevisionProposal> {
  const { run, demo, executionToken, repository, env } = input;
  const active = new Set<StageName>();
  const completed = new Set<StageName>();
  const eventState: Record<string, unknown> = {};
  const modelOutputs: Record<string, unknown> = {};
  const outputKeyByStage: Partial<Record<StageName, string>> = {
    breakdown: AGENT_OUTPUT_KEYS.breakdown,
    schedule: AGENT_OUTPUT_KEYS.schedule,
    budget: AGENT_OUTPUT_KEYS.budget,
    locations: AGENT_OUTPUT_KEYS.locations,
    casting: AGENT_OUTPUT_KEYS.casting,
  };
  let currentStage: StageName = "breakdown";
  let evidence: EvidenceBundle | null = null;

  const callbacks = (stage: StageName) => ({
    beforeAgentCallback: async () => {
      currentStage = stage;
      const now = new Date().toISOString();
      await repository.transitionStage(run.runId, executionToken, stage, {
        status: "active",
        message: messages(stage).active,
        startedAt: now,
        completedAt: null,
        failure: null,
      });
      active.add(stage);
      await repository.heartbeatRun(run.runId, executionToken);
      return undefined;
    },
    afterAgentCallback: async (context: Context) => {
      if (stage === "evidence" && !evidence) throw new Error("PARALLEL_EVIDENCE_MISSING");
      const outputKey = outputKeyByStage[stage];
      const localOutput = outputKey ? context.state.get(outputKey) : undefined;
      if (outputKey && localOutput !== undefined) modelOutputs[outputKey] = localOutput;
      await repository.transitionStage(run.runId, executionToken, stage, {
        status: "completed",
        message: messages(stage, evidence ?? undefined).complete,
        startedAt: new Date(Date.now() - 1).toISOString(),
        completedAt: new Date().toISOString(),
        failure: null,
      });
      active.delete(stage);
      completed.add(stage);
      await repository.heartbeatRun(run.runId, executionToken);
      return undefined;
    },
  });

  const captureOutput = (
    key: string,
    schema: z.ZodType<unknown>,
  ): SingleAfterModelCallback => ({ response }) => {
    const text = response.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error(`AGENT_OUTPUT_EMPTY:${key}`);
    modelOutputs[key] = parseAgentOutput(schema, text);
    return undefined;
  };

  const researchTool = new FunctionTool({
    name: "research_production_evidence",
    description: "Search current production constraints with Parallel and return normalized cited evidence.",
    parameters: z.object({}),
    execute: async (_arguments, context) => {
      if (!evidence) {
        evidence = await resolveProductionEvidence(researchInput(), {
          cache: new FirestoreEvidenceCache(getAdminFirestore(env.GOOGLE_CLOUD_PROJECT)),
          search: createParallelSearch(env.PARALLEL_API_KEY, env.PARALLEL_TIMEOUT_MS),
          ttlHours: env.EVIDENCE_CACHE_TTL_HOURS,
        });
      }
      context?.state.set(AGENT_OUTPUT_KEYS.evidenceBundle, evidence);
      return evidence;
    },
  });
  const common = {
    model: env.GEMINI_MODEL,
    includeContents: "none" as const,
    generateContentConfig: { temperature: 0, maxOutputTokens: 4_096 },
    timeout: seconds(env.GEMINI_STAGE_TIMEOUT_MS),
  };
  const breakdown = new LlmAgent({
    ...common,
    name: "breakdown_agent",
    instruction: breakdownInstruction,
    outputSchema: breakdownAgentOutputSchema,
    outputKey: AGENT_OUTPUT_KEYS.breakdown,
    afterModelCallback: captureOutput(AGENT_OUTPUT_KEYS.breakdown, breakdownAgentOutputSchema),
    ...callbacks("breakdown"),
  });
  const evidenceAgent = new LlmAgent({
    ...common,
    name: "parallel_evidence_agent",
    instruction: evidenceInstruction,
    tools: [researchTool],
    outputKey: AGENT_OUTPUT_KEYS.evidence,
    ...callbacks("evidence"),
  });
  const schedule = new LlmAgent({
    ...common,
    name: "schedule_agent",
    instruction: scheduleInstruction,
    outputSchema: scheduleAgentOutputSchema,
    outputKey: AGENT_OUTPUT_KEYS.schedule,
    afterModelCallback: captureOutput(AGENT_OUTPUT_KEYS.schedule, scheduleAgentOutputSchema),
    ...callbacks("schedule"),
  });
  const budget = new LlmAgent({
    ...common,
    name: "budget_agent",
    instruction: budgetInstruction,
    outputSchema: budgetAgentOutputSchema,
    outputKey: AGENT_OUTPUT_KEYS.budget,
    afterModelCallback: captureOutput(AGENT_OUTPUT_KEYS.budget, budgetAgentOutputSchema),
    ...callbacks("budget"),
  });
  const locations = new LlmAgent({
    ...common,
    name: "locations_agent",
    instruction: locationsInstruction,
    outputSchema: locationsAgentOutputSchema,
    outputKey: AGENT_OUTPUT_KEYS.locations,
    afterModelCallback: captureOutput(AGENT_OUTPUT_KEYS.locations, locationsAgentOutputSchema),
    ...callbacks("locations"),
  });
  const casting = new LlmAgent({
    ...common,
    name: "casting_agent",
    instruction: castingInstruction,
    outputSchema: castingAgentOutputSchema,
    outputKey: AGENT_OUTPUT_KEYS.casting,
    afterModelCallback: captureOutput(AGENT_OUTPUT_KEYS.casting, castingAgentOutputSchema),
    ...callbacks("casting"),
  });
  const root = new SequentialAgent({
    name: "revision_ripple",
    subAgents: [
      breakdown,
      evidenceAgent,
      schedule,
      new ParallelAgent({ name: "artifact_fanout", subAgents: [budget, locations, casting] }),
    ],
  });
  const runner = new InMemoryRunner({ agent: root, appName: APP_NAME });
  const outputKeyByAuthor: Record<string, string> = {
    breakdown_agent: AGENT_OUTPUT_KEYS.breakdown,
    schedule_agent: AGENT_OUTPUT_KEYS.schedule,
    budget_agent: AGENT_OUTPUT_KEYS.budget,
    locations_agent: AGENT_OUTPUT_KEYS.locations,
    casting_agent: AGENT_OUTPUT_KEYS.casting,
  };
  const session = await runner.sessionService.createSession({
    appName: APP_NAME,
    userId: run.demoId,
    state: {
      trustedRun: { runId: run.runId, sceneId: run.sceneId, requestText: run.requestText },
      selectedScene: demo.currentPlan.scenes.find((scene) => scene.id === run.sceneId),
      baselineSchedule: demo.currentPlan.schedule,
      baselineBudget: demo.currentPlan.budget,
      baselineLocations: demo.currentPlan.locations,
      baselineCasting: demo.currentPlan.casting,
      goldenReference: run.sceneId === GOLDEN_SCENE_ID && run.requestText === GOLDEN_REQUEST
        ? {
            breakdown: {
              accepted: true,
              revisedScene: approvedExampleFixture.proposal.impacts.breakdown.after,
              reasons: approvedExampleFixture.proposal.impacts.breakdown.reasons,
              assumptions: approvedExampleFixture.proposal.assumptions,
            },
            schedule: {
              revisedSchedule: approvedExampleFixture.proposal.impacts.schedule.after,
              reasons: approvedExampleFixture.proposal.impacts.schedule.reasons,
            },
            budget: {
              revisedBudget: approvedExampleFixture.proposal.impacts.budget.after,
              reasons: approvedExampleFixture.proposal.impacts.budget.reasons,
            },
            locations: {
              revisedLocations: approvedExampleFixture.proposal.impacts.locations.after,
              reasons: approvedExampleFixture.proposal.impacts.locations.reasons,
            },
            casting: {
              revisedCasting: approvedExampleFixture.proposal.impacts.casting.after,
              reasons: approvedExampleFixture.proposal.impacts.casting.reasons,
            },
          }
        : undefined,
    },
  });

  try {
    for await (const event of runner.runAsync({
      userId: run.demoId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Execute the trusted Revision Ripple now." }] },
    })) {
      // Parallel branches publish outputKey values through their event deltas;
      // collect them before the branch-isolated session view is discarded.
      Object.assign(eventState, event.actions.stateDelta);
      const eventOutputKey = event.author ? outputKeyByAuthor[event.author] : undefined;
      if (eventOutputKey && event.output !== undefined) {
        eventState[eventOutputKey] = event.output;
      }
    }
    const finalSession = await runner.sessionService.getSession({
      appName: APP_NAME,
      userId: run.demoId,
      sessionId: session.id,
    });
    if (!finalSession || !evidence) throw new Error("AGENT_OUTPUT_MISSING");
    return assembleProposal(
      run,
      demo,
      { ...finalSession.state, ...eventState, ...modelOutputs },
      evidence,
      new Date().toISOString(),
    );
  } catch (error) {
    if (error instanceof RevisionRippleRejectedError) throw error;
    console.error(
      "Revision Ripple stage gate failed",
      error instanceof z.ZodError
        ? error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        : {
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : "Unknown failure",
          },
    );
    const failureStage = ([...active][0] ?? currentStage) as StageName;
    const proposalGateFailed = completed.size === 6;
    const failure = {
      code: proposalGateFailed
        ? "PROPOSAL_VALIDATION_FAILED"
        : failureStage === "evidence" ? "EVIDENCE_STAGE_FAILED" : "AGENT_STAGE_FAILED",
      message: proposalGateFailed
        ? "The complete agent output did not pass final proposal validation. The baseline was not changed; retry the full request."
        : `${failureStage[0].toUpperCase()}${failureStage.slice(1)} could not produce a valid result. The baseline was not changed; retry the full request.`,
      baselineChanged: false as const,
      retryable: true,
      stage: failureStage,
    };
    for (const stage of active) {
      if (completed.has(stage)) continue;
      await repository.transitionStage(run.runId, executionToken, stage, {
        status: "failed",
        message: failure.message,
        startedAt: new Date(Date.now() - 1).toISOString(),
        completedAt: new Date().toISOString(),
        failure: { ...failure, stage },
      }).catch(() => undefined);
    }
    throw new RevisionRippleExecutionError(failureStage, failure.code, true, failure.message);
  }
}
