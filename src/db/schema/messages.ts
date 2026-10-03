import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { conversationSessions } from "./conversations";
import { images } from "./images";
import { personas } from "./personas";
import { telegramAccounts } from "./telegramAccounts";

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => conversationSessions.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
    telegramAccountId: uuid("telegram_account_id").references(() => telegramAccounts.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
    content: text("content").notNull(),
    status: text("status", {
      enum: [
        "GENERATED",
        "EDITED",
        "APPROVED",
        "SKIPPED",
        "SCHEDULED",
        "SENT",
        "FAILED",
        "CANCELLED",
      ],
    })
      .notNull()
      .default("GENERATED"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    /** Optional picture sent with this message (the text becomes its caption). */
    imageId: uuid("image_id").references(() => images.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    // An image can be attached to at most one message. This is what stops repeated use, even when
    // two conversations are generated at the same instant.
    uniqueIndex("conversation_messages_image_unique")
      .on(t.imageId)
      .where(sql`${t.imageId} is not null`),
  ],
).enableRLS();
