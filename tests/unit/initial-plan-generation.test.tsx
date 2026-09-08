import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { InitialPlanGeneration } from "@/components/projects/initial-plan-generation";

describe("initial generation entry", () => {
  it("offers generation with provider disclosure and no automatic approval", () => {
    const html = renderToStaticMarkup(<InitialPlanGeneration projectId="project-one" activeJobId={null} />);
    expect(html).toContain("Generate initial plan");
    expect(html).toContain("Gemini");
    expect(html).toContain("Parallel");
    expect(html).toContain("does not become an approved baseline automatically");
  });
  it("rehydrates active work instead of offering a duplicate start", () => {
    const html = renderToStaticMarkup(<InitialPlanGeneration projectId="project-one" activeJobId="initial-one" />);
    expect(html).toContain("Loading saved generation progress");
    expect(html).not.toContain("Generate initial plan</button>");
  });
});
