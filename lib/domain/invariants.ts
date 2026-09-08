import type { RefinementCtx } from "zod";

export const MAX_PERSISTED_DOCUMENT_BYTES = 700 * 1024;

const prohibitedClaimPatterns = [
  /(?<!not )\bguarantee(?:d|s)?\b/i,
  /\bfully compliant\b/i,
  /\bpermit(?:s)? (?:is |are |has been |have been )?(?:approved|secured|cleared)\b/i,
  /\b(?:access|availability|safety|costs?) (?:is|are|has been|have been) confirmed\b/i,
];

export function isHttpUrl(value: string): boolean {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}

export function measureJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function addDocumentSizeIssue(
  value: unknown,
  context: RefinementCtx,
): void {
  if (measureJsonBytes(value) > MAX_PERSISTED_DOCUMENT_BYTES) {
    context.addIssue({
      code: "custom",
      path: [],
      message: `Persisted document exceeds ${MAX_PERSISTED_DOCUMENT_BYTES} bytes`,
    });
  }
}

export function addUniqueValueIssues(
  values: Array<string | number>,
  context: RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message });
  }
}

function collectStrings(value: unknown, strings: string[]): void {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, strings));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectStrings(entry, strings));
  }
}

export function addProhibitedClaimIssues(
  value: unknown,
  context: RefinementCtx,
): void {
  const strings: string[] = [];
  collectStrings(value, strings);

  if (
    strings.some((text) =>
      prohibitedClaimPatterns.some((pattern) => pattern.test(text)),
    )
  ) {
    context.addIssue({
      code: "custom",
      path: [],
      message:
        "Production plans may not claim guaranteed permits, access, compliance, safety, availability, or costs",
    });
  }
}
