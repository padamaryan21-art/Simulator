import { z } from "zod";

/**
 * Builds a PATCH schema from a create schema: every field optional and NO defaults.
 *
 * Zod's own `.partial()` keeps `.default()` on fields (in Zod 4), so parsing `{ active: false }`
 * would silently fill in every other field with its default and a partial update would wipe the
 * record. A PATCH must contain only the fields the client actually sent.
 */
export function patchSchema<T extends z.ZodObject>(schema: T) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
    shape[key] = (inner as z.ZodType).optional();
  }
  return z.object(shape) as unknown as ReturnType<T["partial"]>;
}
