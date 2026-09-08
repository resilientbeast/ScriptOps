import { describe, expect, it } from "vitest";

import { runIngestionSmoke } from "@/lib/ingestion/smoke";

describe("ingestion Cloud Run smoke input", () => {
  it("parses synthetic FDX and PDF inputs without returning screenplay text", async () => {
    const result = await runIngestionSmoke();

    expect(result.fdx).toMatchObject({ format: "fdx", sceneCount: 2, blockCount: 4 });
    expect(result.pdf).toMatchObject({ format: "pdf", sceneCount: 2, blockCount: 4 });
    expect(result.fdx.warningCodes).toEqual([]);
    expect(result.pdf.warningCodes).toEqual([]);
    expect(result.totalElapsedMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result)).not.toContain("GREENHOUSE");
    expect(JSON.stringify(result)).not.toContain("MARA");
  });
});
