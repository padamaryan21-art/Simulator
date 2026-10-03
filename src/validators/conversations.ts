import { z } from "zod";

export const CONVERSATION_MODES = ["PREVIEW", "MANUAL", "AUTOMATIC"] as const;

export const createConversationSchema = z.object({
  groupId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()).min(2, "Pick at least 2 participants").max(8),
  /** null/undefined = let the topic engine choose. */
  topicId: z.string().uuid().nullish(),
  mode: z.enum(CONVERSATION_MODES).default("PREVIEW"),
  messageCount: z.number().int().min(4).max(40).default(12),
  instruction: z.string().trim().max(500).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const approveSchema = z.object({
  /** Omit to approve every approvable message. */
  messageIds: z.array(z.string().uuid()).optional(),
});

export const messageEditSchema = z
  .object({
    content: z.string().trim().min(1).max(600),
    /** "skip" excludes the message from sending; "restore" brings it back for review. */
    action: z.enum(["skip", "restore"]),
    /** Attach this library image, or null to remove the current one. */
    imageId: z.string().uuid().nullable(),
  })
  .partial()
  .refine(
    (v) => v.content !== undefined || v.action !== undefined || v.imageId !== undefined,
    "Nothing to update",
  );
