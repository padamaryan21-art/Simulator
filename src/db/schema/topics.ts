import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";

export const topicCategories = pgTable("topic_categories", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
}).enableRLS();

export const topics = pgTable("topics", {
  id: id(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => topicCategories.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  promptSeed: text("prompt_seed").notNull().default(""),
  priority: integer("priority").notNull().default(5),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(240),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
