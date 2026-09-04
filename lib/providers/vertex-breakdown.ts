import "server-only";

import { GoogleGenAI } from "@google/genai";

import {
  BREAKDOWN_SMOKE_PROMPT,
  parseBreakdownSmokeJson,
  type BreakdownSmokeResult,
} from "@/lib/providers/contracts";

const responseJsonSchema = {
  type: "object",
  properties: {
    sceneId: { type: "string" },
    timeOfDay: { type: "string" },
    weather: { type: "string" },
    childWitnessRequired: { type: "boolean" },
    stuntDrivingRequired: { type: "boolean" },
    productionImplications: {
      type: "array",
      items: { type: "string" },
      minItems: 4,
      maxItems: 8,
    },
    summary: { type: "string" },
  },
  required: [
    "sceneId",
    "timeOfDay",
    "weather",
    "childWitnessRequired",
    "stuntDrivingRequired",
    "productionImplications",
    "summary",
  ],
};

export async function runVertexBreakdownDiagnostic(input: {
  location: string;
  model: string;
  project: string;
  timeoutMs: number;
}): Promise<BreakdownSmokeResult> {
  const client = new GoogleGenAI({
    vertexai: true,
    project: input.project,
    location: input.location,
  });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), input.timeoutMs);

  try {
    const response = await client.models.generateContent({
      model: input.model,
      contents: BREAKDOWN_SMOKE_PROMPT,
      config: {
        abortSignal: abortController.signal,
        systemInstruction:
          "You are a film production breakdown specialist. Return only the JSON requested by the response schema. For this smoke proof, use these exact values: sceneId 'scene-14', timeOfDay 'night', weather 'rain', childWitnessRequired true, and stuntDrivingRequired true. Include 4 to 8 concise operational implications and a non-empty summary. Treat this as a proposed change and avoid legal, labor, or financial advice.",
        temperature: 0,
        maxOutputTokens: 768,
        responseMimeType: "application/json",
        responseJsonSchema,
      },
    });

    if (!response.text?.trim()) {
      throw new Error("GEMINI_DIAGNOSTIC_EMPTY_RESULT");
    }

    return parseBreakdownSmokeJson(response.text);
  } finally {
    clearTimeout(timeout);
  }
}
