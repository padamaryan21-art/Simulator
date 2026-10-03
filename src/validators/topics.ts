import { z } from "zod";
import { patchSchema } from "./patch";

export const topicSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(""),
  promptSeed: z.string().trim().max(2000).default(""),
  priority: z.number().int().min(1).max(10).default(5),
  cooldownMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .default(240),
  active: z.boolean().default(true),
});
export type TopicInput = z.infer<typeof topicSchema>;
export const topicUpdateSchema = patchSchema(topicSchema);
