import { timingSafeEqual } from "node:crypto";

const SMOKE_TOKEN_HEADER = "x-scriptops-smoke-token";

export function hasValidSmokeAccess(request: Request, expectedToken: string): boolean {
  const suppliedToken = request.headers.get(SMOKE_TOKEN_HEADER);

  if (!suppliedToken) {
    return false;
  }

  const supplied = Buffer.from(suppliedToken, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
