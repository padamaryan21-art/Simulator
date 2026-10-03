import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { updatedAt } from "./_shared";

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
}).enableRLS();
