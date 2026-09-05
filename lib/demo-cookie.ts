import "server-only";

export {
  decodeDemoCookie,
  encodeDemoCookie,
  resolveDemoCookie,
} from "@/lib/demo-cookie-core";

export const DEMO_COOKIE_NAME = "scriptops_demo_id";
export const DEMO_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const developmentSecret =
  "scriptops-local-preview-cookie-secret-only";

export function getDemoCookieSecret(): string {
  const configured = process.env.DEMO_INSTANCE_COOKIE_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return developmentSecret;
  throw new Error("DEMO_INSTANCE_COOKIE_SECRET is not configured");
}
