import { describe, expect, it } from "vitest";

import { classifyGeminiFailure } from "@/lib/providers/provider-errors";

describe("classifyGeminiFailure", () => {
  it.each([
    [{ status: 404, message: "model not found" }, "GEMINI_MODEL_UNAVAILABLE"],
    [{ status: 403, message: "permission denied" }, "GEMINI_PERMISSION_DENIED"],
    [{ status: 429, message: "quota exhausted" }, "GEMINI_QUOTA_EXHAUSTED"],
    [
      { status: 400, message: "INVALID_ARGUMENT responseSchema enum" },
      "GEMINI_SCHEMA_REJECTED",
    ],
    [{ name: "AbortError" }, "GEMINI_TIMEOUT"],
    [
      { name: "BreakdownSmokeContractError", message: "GEMINI_OUTPUT_INVALID" },
      "GEMINI_OUTPUT_INVALID",
    ],
  ])("maps provider metadata to a redacted code", (error, expected) => {
    expect(classifyGeminiFailure(error)).toBe(expected);
  });

  it("does not surface unknown provider messages", () => {
    expect(classifyGeminiFailure(new Error("sensitive provider detail"))).toBe(
      "GEMINI_PROVIDER_FAILED",
    );
  });

  it("classifies a nested provider cause without exposing it", () => {
    expect(
      classifyGeminiFailure({
        name: "WrapperError",
        cause: { status: 404, message: "model not found in location" },
      }),
    ).toBe("GEMINI_MODEL_UNAVAILABLE");
  });
});
