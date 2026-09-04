import "server-only";

import {
  InMemoryRunner,
  isFinalResponse,
  LlmAgent,
  stringifyContent,
} from "@google/adk";

import {
  BREAKDOWN_SMOKE_PROMPT,
  parseBreakdownSmokeJson,
  parseBreakdownSmokeResult,
  type BreakdownSmokeResult,
} from "@/lib/providers/contracts";
import { z } from "zod";

const APP_NAME = "scriptops-provider-smoke";
const OUTPUT_KEY = "breakdownSmokeResult";
const USER_ID = "scriptops-smoke";

const adkBreakdownOutputSchema = z.object({
  sceneId: z.string(),
  timeOfDay: z.string(),
  weather: z.string(),
  childWitnessRequired: z.boolean(),
  stuntDrivingRequired: z.boolean(),
  productionImplications: z.array(z.string()).min(4).max(8),
  summary: z.string(),
});

function parseAgentResult(
  sessionOutput: unknown,
  eventOutput: unknown,
  finalText: string,
): BreakdownSmokeResult {
  let lastError: unknown;

  for (const candidate of [sessionOutput, eventOutput]) {
    if (candidate === undefined) {
      continue;
    }

    try {
      return typeof candidate === "string"
        ? parseBreakdownSmokeJson(candidate)
        : parseBreakdownSmokeResult(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (finalText.trim()) {
    return parseBreakdownSmokeJson(finalText);
  }

  throw lastError ?? new Error("GEMINI_SMOKE_EMPTY_RESULT");
}

export async function runGeminiBreakdownSmoke(
  model: string,
  timeoutMs: number,
): Promise<BreakdownSmokeResult> {
  const agent = new LlmAgent({
    name: "scene_breakdown_smoke",
    model,
    instruction:
      "You are a film production breakdown specialist. Return only the structured output requested by the schema. For this smoke proof, use these exact values: sceneId 'scene-14', timeOfDay 'night', weather 'rain', childWitnessRequired true, and stuntDrivingRequired true. Include 4 to 8 concise operational implications and a non-empty summary. Treat the request as a proposed change, not an approved baseline mutation. Do not provide legal, labor, or financial advice.",
    includeContents: "none",
    outputSchema: adkBreakdownOutputSchema,
    outputKey: OUTPUT_KEY,
    generateContentConfig: {
      temperature: 0,
      maxOutputTokens: 768,
    },
  });
  const runner = new InMemoryRunner({ agent, appName: APP_NAME });
  const session = await runner.sessionService.createSession({
    appName: APP_NAME,
    userId: USER_ID,
  });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  let eventOutput: unknown;
  let finalText = "";

  try {
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [
          {
            text: BREAKDOWN_SMOKE_PROMPT,
          },
        ],
      },
      abortSignal: abortController.signal,
    })) {
      if (event.output !== undefined) {
        eventOutput = event.output;
      }

      if (isFinalResponse(event)) {
        finalText = stringifyContent(event);
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const completedSession = await runner.sessionService.getSession({
    appName: APP_NAME,
    userId: USER_ID,
    sessionId: session.id,
  });
  const sessionOutput = completedSession?.state[OUTPUT_KEY];

  if (
    sessionOutput === undefined &&
    eventOutput === undefined &&
    !finalText.trim()
  ) {
    throw new Error("GEMINI_SMOKE_EMPTY_RESULT");
  }

  return parseAgentResult(sessionOutput, eventOutput, finalText);
}
