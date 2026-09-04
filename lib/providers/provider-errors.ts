type ErrorLike = {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function errorSignal(error: unknown, depth = 0): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const candidate = error as ErrorLike;

  const ownSignal = [
    candidate.name,
    candidate.code,
    candidate.status,
    candidate.statusCode,
    candidate.message,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ");

  if (depth >= 3 || candidate.cause === undefined) {
    return ownSignal;
  }

  return `${ownSignal} ${errorSignal(candidate.cause, depth + 1)}`;
}

export type GeminiFailureCode =
  | "GEMINI_AUTHENTICATION_FAILED"
  | "GEMINI_MODEL_UNAVAILABLE"
  | "GEMINI_OUTPUT_INVALID"
  | "GEMINI_PERMISSION_DENIED"
  | "GEMINI_PROVIDER_FAILED"
  | "GEMINI_QUOTA_EXHAUSTED"
  | "GEMINI_SCHEMA_REJECTED"
  | "GEMINI_TIMEOUT";

export function classifyGeminiFailure(error: unknown): GeminiFailureCode {
  const signal = errorSignal(error);

  if (/AbortError|aborted|deadline|timeout/i.test(signal)) {
    return "GEMINI_TIMEOUT";
  }

  if (/401|UNAUTHENTICATED|credential/i.test(signal)) {
    return "GEMINI_AUTHENTICATION_FAILED";
  }

  if (/403|PERMISSION_DENIED|permission/i.test(signal)) {
    return "GEMINI_PERMISSION_DENIED";
  }

  if (/404|NOT_FOUND|model.+(unavailable|not found)|location.+not supported/i.test(signal)) {
    return "GEMINI_MODEL_UNAVAILABLE";
  }

  if (/429|RESOURCE_EXHAUSTED|quota/i.test(signal)) {
    return "GEMINI_QUOTA_EXHAUSTED";
  }

  if (/response.?schema|INVALID_ARGUMENT|enum/i.test(signal)) {
    return "GEMINI_SCHEMA_REJECTED";
  }

  if (
    /BreakdownSmokeContractError|GEMINI_OUTPUT_INVALID|JSON|Zod|parse|structured output/i.test(
      signal,
    )
  ) {
    return "GEMINI_OUTPUT_INVALID";
  }

  return "GEMINI_PROVIDER_FAILED";
}
