import { z } from "zod";
import { IMAGE_KINDS } from "@/lib/image-kinds";

const optionalUuid = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const imageDefaultsSchema = z.object({
  topicId: optionalUuid,
  personaId: optionalUuid,
  kind: z.enum(IMAGE_KINDS).default("PHOTO"),
  caption: z.string().trim().max(200).default(""),
});

export const imageUpdateSchema = z
  .object({
    caption: z.string().trim().max(200),
    kind: z.enum(IMAGE_KINDS),
    topicId: z.string().uuid().nullable(),
    personaId: z.string().uuid().nullable(),
    enabled: z.boolean(),
  })
  .partial();

export const imageListSchema = z.object({
  topicId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  personaId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  status: z
    .enum(["AVAILABLE", "RESERVED", "USED", "DISABLED"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type ImageListFilter = z.infer<typeof imageListSchema>;
