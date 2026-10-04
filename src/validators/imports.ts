import { z } from "zod";
import { LIMITS } from "@/server/imports/parse";

export const previewFieldsSchema = z
  .object({
    groupId: z.string().uuid(),
    minSize: z.coerce.number().int().min(4).max(200).default(15),
    maxSize: z.coerce.number().int().min(4).max(200).default(35),
  })
  .refine((v) => v.minSize <= v.maxSize, {
    path: ["maxSize"],
    message: "Max must be at least the min",
  });

const messageSchema = z.object({
  personaId: z.string().uuid(),
  text: z.string().trim().min(1).max(LIMITS.maxMessageChars),
});

export const commitSchema = z.object({
  groupId: z.string().uuid(),
  conversations: z
    .array(
      z.object({
        title: z.string().trim().max(200).nullable().optional(),
        messages: z.array(messageSchema).min(2).max(LIMITS.maxConversationLines),
      }),
    )
    .min(1)
    .max(2000),
});
export type CommitInput = z.infer<typeof commitSchema>;
