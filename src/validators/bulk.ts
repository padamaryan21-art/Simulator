import { z } from "zod";

/**
 * Volume is expressed per account per day: e.g. 400 messages x 5 accounts = 2000 messages/day.
 * Total = participants x messagesPerAccountPerDay x days (capped at 10000 per run).
 */
export const bulkSchema = z
  .object({
    groupId: z.string().uuid(),
    participantIds: z.array(z.string().uuid()).min(2).max(8),
    messagesPerAccountPerDay: z.number().int().min(10).max(1000),
    days: z.number().int().min(1).max(5),
    minPerConversation: z.number().int().min(6).max(40).default(15),
    maxPerConversation: z.number().int().min(6).max(40).default(35),
  })
  .refine((v) => v.minPerConversation <= v.maxPerConversation, {
    path: ["maxPerConversation"],
    message: "Max must be at least the min",
  })
  .refine((v) => bulkTotal(v) <= 10000, {
    path: ["days"],
    message: "Total is capped at 10,000 messages per run",
  });
export type BulkInput = z.infer<typeof bulkSchema>;

export const bulkTotal = (v: {
  participantIds: unknown[];
  messagesPerAccountPerDay: number;
  days: number;
}) => v.participantIds.length * v.messagesPerAccountPerDay * v.days;
