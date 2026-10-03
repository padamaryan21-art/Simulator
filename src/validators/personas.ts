import { z } from "zod";
import { patchSchema } from "./patch";

const level = z.number().int().min(0).max(100);
const list = z.array(z.string().trim().min(1).max(200)).max(50);

export const MESSAGE_LENGTHS = ["SHORT", "MEDIUM", "LONG"] as const;

export const personaSchema = z.object({
  name: z.string().trim().min(1).max(100),
  telegramAccountId: z.string().uuid().nullable().default(null),
  personality: z.string().trim().max(2000).default(""),
  background: z.string().trim().max(4000).default(""),
  occupation: z.string().trim().max(200).default(""),
  interests: list.default([]),
  hobbies: list.default([]),
  likes: list.default([]),
  dislikes: list.default([]),
  languageStyle: z.string().trim().max(2000).default(""),
  tagalogLevel: level.default(60),
  englishLevel: level.default(40),
  taglishLevel: level.default(60),
  emojiFrequency: level.default(30),
  slangLevel: level.default(40),
  messageLength: z.enum(MESSAGE_LENGTHS).default("SHORT"),
  commonExpressions: list.default([]),
  behaviorRules: list.default([]),
  active: z.boolean().default(true),
});
export type PersonaInput = z.infer<typeof personaSchema>;
export type PersonaFormInput = z.input<typeof personaSchema>;

export const personaUpdateSchema = patchSchema(personaSchema);

export const relationshipSchema = z
  .object({
    personaAId: z.string().uuid(),
    personaBId: z.string().uuid(),
    relationshipType: z.string().trim().min(1).max(100).default("friends"),
    familiarity: level.default(50),
    tone: z.string().trim().min(1).max(100).default("casual"),
    notes: z.string().trim().max(2000).default(""),
    active: z.boolean().default(true),
  })
  .refine((r) => r.personaAId !== r.personaBId, {
    path: ["personaBId"],
    message: "Pick two different personas",
  });
export type RelationshipInput = z.infer<typeof relationshipSchema>;

export const relationshipUpdateSchema = z
  .object({
    relationshipType: z.string().trim().min(1).max(100),
    familiarity: level,
    tone: z.string().trim().min(1).max(100),
    notes: z.string().trim().max(2000),
    active: z.boolean(),
  })
  .partial();

export const MEMORY_SCOPES = ["persona", "relationship", "group"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const memoryCreateSchema = z.object({
  scope: z.enum(MEMORY_SCOPES),
  /** persona id, relationship id or group id depending on scope */
  ownerId: z.string().uuid(),
  content: z.string().trim().min(1).max(1000),
  importance: z.number().int().min(1).max(5).default(3),
});
export type MemoryCreateInput = z.infer<typeof memoryCreateSchema>;

export const memoryUpdateSchema = z
  .object({
    content: z.string().trim().min(1).max(1000),
    importance: z.number().int().min(1).max(5),
  })
  .partial();
