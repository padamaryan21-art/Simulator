import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";

export const telegramAccounts = pgTable("telegram_accounts", {
  id: id(),
  displayName: text("display_name").notNull(),
  username: text("username").notNull().unique(),
  phone: text("phone"),
  /** AES-256-GCM encrypted GramJS session string. Never sent to the browser. */
  encryptedSession: text("encrypted_session"),
  status: text("status", {
    enum: ["DISCONNECTED", "AWAITING_CODE", "AWAITING_PASSWORD", "CONNECTED", "ERROR"],
  })
    .notNull()
    .default("DISCONNECTED"),
  lastError: text("last_error"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
