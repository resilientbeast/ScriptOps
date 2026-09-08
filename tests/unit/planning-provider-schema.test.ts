import { describe, expect, it } from "vitest";
import { z } from "zod";
import { planningProviderSchema } from "@/lib/planning/provider-schema";

describe("Vertex schema transport", () => {
  it("limits generated citation identifiers to the actual research records", () => {
    const transport = planningProviderSchema(z.object({ evidenceIds: z.array(z.string()) }), ["known-evidence"]);
    expect(transport).toMatchObject({ properties: { evidenceIds: { items: { type: "string", enum: ["known-evidence"] } } } });
  });
  it("keeps field structure and enum requirements while moving costly bounds to guidance", () => {
    const schema = z.object({ records: z.array(z.object({ name: z.string().min(1).max(100), kind: z.enum(["fact", "inference"]), detail: z.string().nullable() }).strict()).max(200) }).strict();
    const transport = planningProviderSchema(schema);
    const json = JSON.stringify(transport);
    expect(transport.required).toEqual(["records"]);
    expect(json).toContain('"enum":["fact","inference"]');
    expect(json).toContain("maxItems: 200");
    expect(json).not.toContain('"maxItems":');
    expect(json).not.toContain('"$schema"');
    expect(() => schema.parse({ records: [{ name: "x".repeat(101), kind: "fact", detail: null }] })).toThrow();
    expect(() => schema.parse({ records: [], extra: "unexpected" })).toThrow();
  });
});
