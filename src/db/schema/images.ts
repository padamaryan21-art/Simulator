import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { IMAGE_KINDS } from "@/lib/image-kinds";
import { personas } from "./personas";
import { topics } from "./topics";

/**
 * The image library. Files live in a private Supabase Storage bucket; this table holds the
 * metadata and the rules for using each image exactly once.
 *
 * There is deliberately no "win/payout" kind: the library is for everyday photos, memes and plain
 * game-lobby screenshots.
 */

export const images = pgTable("images", {
  id: id(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull().unique(),
  mime: text("mime").notNull().default("image/jpeg"),
  bytes: integer("bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /** SHA-256 of the processed file: the same picture cannot be uploaded twice. */
  sha256: text("sha256").notNull().unique(),
  caption: text("caption").notNull().default(""),
  kind: text("kind", { enum: IMAGE_KINDS }).notNull().default("PHOTO"),
  /** The topic this image belongs to. Only conversations about that topic may use it. */
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
  /** The persona who "sends" it. */
  personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
  enabled: boolean("enabled").notNull().default(true),
  /** Set when the image is actually posted. An image with usedAt can never be picked again. */
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
