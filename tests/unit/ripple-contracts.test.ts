import { describe, expect, it } from "vitest";

import { GOLDEN_REQUEST } from "@/lib/domain/golden-invariants";
import { RippleStateRepository } from "@/lib/firestore/ripple-state";
import { InMemoryStateStore } from "@/lib/firestore/transaction-store";
import {
  createRippleRequestSchema,
  isProductionRelevant,
  isSameOrigin,
  toPublicRippleRun,
} from "@/lib/ripple/contracts";

const demoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idempotencyKey = "11111111-2222-4333-8444-555555555555";

describe("revision lifecycle contracts", () => {
  it("accepts the golden production change and rejects irrelevant text", () => {
    expect(isProductionRelevant(GOLDEN_REQUEST)).toBe(true);
    expect(isProductionRelevant("Please write me a cheerful poem today")).toBe(false);
    expect(
      createRippleRequestSchema.safeParse({
        sceneId: "scene-14",
        requestText: GOLDEN_REQUEST,
        idempotencyKey,
      }).success,
    ).toBe(true);
  });

  it("requires an exact same-origin mutation", () => {
    expect(
      isSameOrigin(
        new Request("https://scriptops.example/api/ripples", {
          method: "POST",
          headers: { Origin: "https://scriptops.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("https://scriptops.example/api/ripples", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
  });

  it("accepts configured public origins behind a Cloud Run proxy", () => {
    const publicOrigin = "https://scriptops-916693774226.us-central1.run.app";
    const serviceOrigin = "https://scriptops-5sinbwmqzq-uc.a.run.app";
    const proxiedRequest = new Request("http://127.0.0.1:8080/api/ripples", {
      method: "POST",
      headers: { Origin: serviceOrigin },
    });

    expect(
      isSameOrigin(proxiedRequest, {
        CLOUD_RUN_BASE_URL: publicOrigin,
        CLOUD_RUN_ALLOWED_ORIGINS: serviceOrigin,
      }),
    ).toBe(true);
    expect(
      isSameOrigin(proxiedRequest, {
        CLOUD_RUN_BASE_URL: "https://another-service.example",
      }),
    ).toBe(false);
  });

  it("redacts browser ownership and worker tokens from public snapshots", async () => {
    const repository = new RippleStateRepository(new InMemoryStateStore());
    await repository.initializeDemo(demoId);
    const { run } = await repository.createQueuedRun({
      demoId,
      idempotencyKey,
      sceneId: "scene-14",
      requestText: GOLDEN_REQUEST,
      dailyCap: 20,
    });

    const publicRun = toPublicRippleRun(run);
    expect(publicRun.runId).toBe(run.runId);
    expect(publicRun).not.toHaveProperty("demoId");
    expect(publicRun).not.toHaveProperty("idempotencyKey");
    expect(publicRun).not.toHaveProperty("executionToken");
  });
});
