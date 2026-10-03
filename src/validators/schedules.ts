import { z } from "zod";
import { isValidTimezone } from "@/lib/scheduling/time";

const minute = z.number().int().min(0).max(1439);

export const shiftRuleSchema = z
  .object({
    type: z.enum(["DAY", "NIGHT", "CUSTOM", "OFF"]),
    startMinute: minute.optional(),
    endMinute: minute.optional(),
  })
  .refine(
    (r) => r.type !== "CUSTOM" || (r.startMinute !== undefined && r.endMinute !== undefined),
    {
      message: "Custom shifts need a start and end time",
    },
  )
  .refine((r) => r.type !== "CUSTOM" || r.startMinute !== r.endMinute, {
    message: "Start and end time must differ",
  });

const weeklySchema = z.record(z.string().regex(/^[0-6]$/), shiftRuleSchema);
const overridesSchema = z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), shiftRuleSchema);

export const scheduleUpdateSchema = z
  .object({
    enabled: z.boolean(),
    messagesPerAccountPerDay: z.number().int().min(10).max(1000),
    messagesPerSessionMin: z.number().int().min(6).max(40),
    messagesPerSessionMax: z.number().int().min(6).max(40),
    minGapPerAccountSec: z.number().int().min(5).max(600),
    timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
    weeklyPattern: weeklySchema,
    dateOverrides: overridesSchema,
  })
  .partial()
  .refine(
    (v) =>
      v.messagesPerSessionMin === undefined ||
      v.messagesPerSessionMax === undefined ||
      v.messagesPerSessionMin <= v.messagesPerSessionMax,
    { path: ["messagesPerSessionMax"], message: "Max must be at least the min" },
  );
export type ScheduleUpdate = z.infer<typeof scheduleUpdateSchema>;
