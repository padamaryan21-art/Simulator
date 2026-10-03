import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";

/**
 * Prompts you wrote yourself (the built-in ones live in code). The full text sent to ChatGPT is
 * always built from these fields plus the current personas, so it never goes stale.
 */
export const promptTemplates = pgTable("prompt_templates", {
  id: id(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  description: text("description").notNull().default(""),
  situations: jsonb("situations").$type<{ label: string; detail: string }[]>().notNull(),
  notes: text("notes").notNull().default(""),
  conversations: integer("conversations").notNull(),
  linesMin: integer("lines_min").notNull(),
  linesMax: integer("lines_max").notNull(),
  batchSize: integer("batch_size").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
