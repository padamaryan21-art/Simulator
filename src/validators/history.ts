import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined));
const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined));
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal("").transform(() => undefined));

const paging = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
};

export const sessionSearchSchema = z.object({
  q: optionalString,
  groupId: optionalUuid,
  status: z
    .enum(["DRAFT", "PENDING_APPROVAL", "SENDING", "COMPLETED", "CANCELLED", "FAILED"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  mode: z
    .enum(["PREVIEW", "MANUAL", "AUTOMATIC"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  from: optionalDate,
  to: optionalDate,
  ...paging,
});
export type SessionSearch = z.infer<typeof sessionSearchSchema>;

export const messageSearchSchema = z.object({
  q: optionalString,
  groupId: optionalUuid,
  personaId: optionalUuid,
  sessionId: optionalUuid,
  status: z
    .enum([
      "GENERATED",
      "EDITED",
      "APPROVED",
      "SKIPPED",
      "SCHEDULED",
      "SENT",
      "FAILED",
      "CANCELLED",
    ])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  from: optionalDate,
  to: optionalDate,
  ...paging,
});
export type MessageSearch = z.infer<typeof messageSearchSchema>;

export const logSearchSchema = z.object({
  q: optionalString,
  level: z
    .enum(["debug", "info", "warn", "error"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  category: optionalString,
  from: optionalDate,
  to: optionalDate,
  ...paging,
});
export type LogSearch = z.infer<typeof logSearchSchema>;

export const deleteSessionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});
