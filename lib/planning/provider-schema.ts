import { z } from "zod";

/** Avoid Vertex's bounded-array grammar explosion; strict Zod validation remains authoritative. */
export function planningProviderSchema(schema: z.ZodType, evidenceIds: string[] = []): Record<string, unknown> {
  const convert = (value: unknown): Record<string, unknown> => {
    const node = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of ["type", "enum", "required", "description"]) if (node[key] !== undefined) result[key] = node[key];
    if (node.const !== undefined) result.enum = [node.const];
    if (node.properties) result.properties = Object.fromEntries(Object.entries(node.properties as Record<string, unknown>).map(([key, child]) => {
      const converted = convert(child);
      if (key === "evidenceIds" && evidenceIds.length) converted.items = { type: "string", enum: evidenceIds };
      return [key, converted];
    }));
    if (node.items) result.items = convert(node.items);
    if (node.anyOf) result.anyOf = (node.anyOf as unknown[]).map(convert);
    const limits = ["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "format"].filter(key => node[key] !== undefined).map(key => `${key}: ${node[key]}`);
    if (limits.length) result.description = [result.description, `Validation requirements: ${limits.join("; ")}.`].filter(Boolean).join(" ");
    return result;
  };
  return convert(z.toJSONSchema(schema));
}
