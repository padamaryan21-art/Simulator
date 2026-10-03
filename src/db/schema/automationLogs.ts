import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";

export const automationLogs = pgTable("automation_logs", {
  id: id(),
  level: text("level", { enum: ["debug", "info", "warn", "error"] })
    .notNull()
    .default("info"),
  category: text("category").notNull(),
  message: text("message").notNull(),
  /** Must never contain secrets, session strings or auth codes. */
  meta: jsonb("meta"),
  actorId: uuid("actor_id"),
  createdAt: createdAt(),
}).enableRLS();
