import { OAuth2Client, type TokenPayload } from "google-auth-library";

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const oauth2Client = new OAuth2Client();

export type TaskIdentityExpectations = {
  audience: string;
  serviceAccountEmail: string;
};

export class TaskIdentityError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TaskIdentityError";
  }
}

export function extractBearerToken(authorizationHeader: string | null): string {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new TaskIdentityError("TASK_IDENTITY_MISSING");
  }

  return match[1];
}

export function validateTaskClaims(
  payload: TokenPayload,
  expectations: TaskIdentityExpectations,
): void {
  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    throw new TaskIdentityError("TASK_ISSUER_INVALID");
  }

  if (payload.aud !== expectations.audience) {
    throw new TaskIdentityError("TASK_AUDIENCE_INVALID");
  }

  if (
    payload.email !== expectations.serviceAccountEmail ||
    payload.email_verified !== true
  ) {
    throw new TaskIdentityError("TASK_SERVICE_ACCOUNT_INVALID");
  }
}

export async function verifyTaskRequestIdentity(
  request: Request,
  expectations: TaskIdentityExpectations,
): Promise<TokenPayload> {
  const idToken = extractBearerToken(request.headers.get("authorization"));
  let payload: TokenPayload | undefined;

  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: expectations.audience,
    });
    payload = ticket.getPayload();
  } catch {
    throw new TaskIdentityError("TASK_TOKEN_INVALID");
  }

  if (!payload) {
    throw new TaskIdentityError("TASK_TOKEN_PAYLOAD_MISSING");
  }

  validateTaskClaims(payload, expectations);
  return payload;
}
