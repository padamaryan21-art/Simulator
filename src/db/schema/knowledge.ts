import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";

export const websiteSources = pgTable("website_sources", {
  id: id(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull().unique(),
  active: boolean("active").notNull().default(true),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  createdAt: createdAt(),
}).enableRLS();

export const websitePages = pgTable("website_pages", {
  id: id(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => websiteSources.id, { onDelete: "cascade" }),
  url: text("url").notNull().unique(),
  title: text("title"),
  content: text("content").notNull().default(""),
  contentHash: text("content_hash"),
  /** How the content was obtained: plain fetch, headless-browser render, or pasted by an admin. */
  fetchMode: text("fetch_mode", { enum: ["STATIC", "RENDERED", "MANUAL"] }),
  lastError: text("last_error"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  createdAt: createdAt(),
}).enableRLS();

export const websiteFacts = pgTable("website_facts", {
  id: id(),
  pageId: uuid("page_id").references(() => websitePages.id, { onDelete: "set null" }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => websiteSources.id, { onDelete: "cascade" }),
  fact: text("fact").notNull(),
  /** Verbatim quote from the page that supports the fact (null for hand-entered facts). */
  evidence: text("evidence"),
  /** Every fact retains its source URL. */
  sourceUrl: text("source_url").notNull(),
  status: text("status", { enum: ["CONFIRMED", "UNKNOWN", "OUTDATED"] })
    .notNull()
    .default("CONFIRMED"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
}).enableRLS();
