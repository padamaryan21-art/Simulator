import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { personas } from "./personas";

export const relationships = pgTable("relationships", {
  id: id(),
  personaAId: uuid("persona_a_id")
    .notNull()
    .references(() => personas.id, { onDelete: "cascade" }),
  personaBId: uuid("persona_b_id")
    .notNull()
    .references(() => personas.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull().default("friends"),
  /** 0-100 */
  familiarity: integer("familiarity").notNull().default(50),
  tone: text("tone").notNull().default("casual"),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const relationshipMemories = pgTable("relationship_memories", {
  id: id(),
  relationshipId: uuid("relationship_id")
    .notNull()
    .references(() => relationships.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  importance: integer("importance").notNull().default(3),
  sourceSessionId: uuid("source_session_id"),
  createdAt: createdAt(),
}).enableRLS();
