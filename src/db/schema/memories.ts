import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { groups } from "./groups";
import { personas } from "./personas";

export const personaMemories = pgTable("persona_memories", {
  id: id(),
  personaId: uuid("persona_id")
    .notNull()
    .references(() => personas.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  importance: integer("importance").notNull().default(3),
  sourceSessionId: uuid("source_session_id"),
  createdAt: createdAt(),
}).enableRLS();

export const groupMemories = pgTable("group_memories", {
  id: id(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  importance: integer("importance").notNull().default(3),
  sourceSessionId: uuid("source_session_id"),
  createdAt: createdAt(),
}).enableRLS();
