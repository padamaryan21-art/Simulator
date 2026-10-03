import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { telegramAccounts } from "./telegramAccounts";

export const personas = pgTable("personas", {
  id: id(),
  name: text("name").notNull(),
  telegramAccountId: uuid("telegram_account_id").references(() => telegramAccounts.id, {
    onDelete: "set null",
  }),
  personality: text("personality").notNull().default(""),
  background: text("background").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  interests: text("interests").array().notNull().default([]),
  hobbies: text("hobbies").array().notNull().default([]),
  likes: text("likes").array().notNull().default([]),
  dislikes: text("dislikes").array().notNull().default([]),
  languageStyle: text("language_style").notNull().default(""),
  /** 0-100 sliders */
  tagalogLevel: integer("tagalog_level").notNull().default(60),
  englishLevel: integer("english_level").notNull().default(40),
  taglishLevel: integer("taglish_level").notNull().default(60),
  emojiFrequency: integer("emoji_frequency").notNull().default(30),
  slangLevel: integer("slang_level").notNull().default(40),
  messageLength: text("message_length", { enum: ["SHORT", "MEDIUM", "LONG"] })
    .notNull()
    .default("SHORT"),
  commonExpressions: text("common_expressions").array().notNull().default([]),
  behaviorRules: text("behavior_rules").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
