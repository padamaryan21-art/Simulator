import { z } from "zod";
import { patchSchema } from "./patch";

const username = z
  .string()
  .trim()
  .regex(/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/, "Telegram usernames are 5-32 letters, digits or _");

/** International format, e.g. +639171234567 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +639171234567");

/** socks5://[user:pass@]host:port */
export const proxyUrlSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine(
    (v) => v == null || v === "" || /^socks5:\/\/.+:\d+$/.test(v),
    "Use socks5://[user:pass@]host:port format",
  )
  .transform((v) => v || null);

export const createAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  username,
  phone: z.union([phoneSchema, z.literal("")]).optional(),
  proxyUrl: proxyUrlSchema,
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    username,
    phone: phoneSchema.nullable(),
    active: z.boolean(),
    proxyUrl: proxyUrlSchema,
  })
  .partial();
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const sendCodeSchema = z.object({ phone: phoneSchema });
export const verifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the numeric code"),
});
export const verifyPasswordSchema = z.object({ password: z.string().min(1).max(256) });

export const GROUP_TYPES = ["PRIVATE_SIMULATION", "REAL_COMMUNITY"] as const;

const groupBase = z.object({
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https:\/\/t\.me\//i.test(u), "Must be a https://t.me/ link")
    .nullable()
    .optional(),
  telegramChatId: z.string().trim().max(64).nullable().optional(),
  type: z.enum(GROUP_TYPES),
  purpose: z.string().trim().max(500).default(""),
  automationEnabled: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  active: z.boolean().default(true),
  participantIds: z.array(z.string().uuid()).default([]),
});

/** Real communities can never be automated or skip approval (also enforced by a DB constraint). */
export const createGroupSchema = groupBase.refine(
  (g) => g.type !== "REAL_COMMUNITY" || (!g.automationEnabled && g.requiresApproval),
  { message: "REAL_COMMUNITY groups must require approval and cannot be automated" },
);
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = patchSchema(groupBase);
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
