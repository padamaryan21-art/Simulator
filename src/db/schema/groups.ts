import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { personas } from "./personas";

export const groups = pgTable(
  "groups",
  {
    id: id(),
    name: text("name").notNull(),
    url: text("url"),
    telegramChatId: text("telegram_chat_id"),
    type: text("type", { enum: ["PRIVATE_SIMULATION", "REAL_COMMUNITY"] }).notNull(),
    purpose: text("purpose").notNull().default(""),
    /** Only honoured for PRIVATE_SIMULATION groups (enforced in service layer). */
    automationEnabled: boolean("automation_enabled").notNull().default(false),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Hard safety rail: the real community can never be automated or skip human approval.
    check(
      "real_community_requires_approval",
      sql`${t.type} <> 'REAL_COMMUNITY' OR (${t.automationEnabled} = false AND ${t.requiresApproval} = true)`,
    ),
  ],
).enableRLS();

export const groupParticipants = pgTable("group_participants", {
  id: id(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  personaId: uuid("persona_id")
    .notNull()
    .references(() => personas.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}).enableRLS();
