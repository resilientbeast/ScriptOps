import { describe, expect, it } from "vitest";

const configuredBaseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const deployed = configuredBaseUrl ? it : it.skip;

async function request(path: string, init?: RequestInit) {
  if (!configuredBaseUrl) throw new Error("E2E_BASE_URL is required for deployed verification.");
  return fetch(`${configuredBaseUrl}${path}`, { redirect: "manual", ...init });
}

describe("post-hackathon deployed boundary smoke", () => {
  deployed("serves a healthy production boundary", async () => {
    const response = await request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ service: "scriptops", status: "healthy" });
  });

  deployed("does not expose projects or deletion state without a Clerk session", async () => {
    const [projects, deletion] = await Promise.all([
      request("/api/projects"),
      request("/api/project-deletions/00000000-0000-4000-8000-000000000000"),
    ]);
    expect(projects.status).toBe(401);
    expect(deletion.status).toBe(401);
  });

  deployed("redirects the workspace entry point to sign-in when no session is present", async () => {
    const response = await request("/projects");
    expect([302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  deployed("rejects an anonymous destructive request before it can create a cleanup job", async () => {
    const response = await request("/api/projects/00000000-0000-4000-8000-000000000000", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Origin: configuredBaseUrl! },
      body: JSON.stringify({ recordVersion: 1, confirmationTitle: "Never created" }),
    });
    expect(response.status).toBe(401);
  });
});
