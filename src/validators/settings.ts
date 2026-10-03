import { z } from "zod";

export const sendingSettingsSchema = z
  .object({
    /** Seconds to wait between messages in one conversation. */
    minDelaySec: z.number().int().min(0).max(600),
    maxDelaySec: z.number().int().min(0).max(1800),
  })
  .refine((s) => s.minDelaySec <= s.maxDelaySec, {
    path: ["maxDelaySec"],
    message: "Max delay must be at least the min delay",
  });
export type SendingSettings = z.infer<typeof sendingSettingsSchema>;

export const imageSettingsSchema = z.object({
  /** Master switch: when off, conversations never get pictures. */
  enabled: z.boolean(),
  /** Chance (0-100) that a conversation whose topic has an unused image gets one. */
  chancePercent: z.number().int().min(0).max(100),
});
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
