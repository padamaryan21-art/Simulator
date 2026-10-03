import { z } from "zod";

export const FACT_STATUSES = ["CONFIRMED", "UNKNOWN", "OUTDATED"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");

export const sourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: httpUrl,
});

export const pageSchema = z.object({
  sourceId: z.string().uuid(),
  url: httpUrl,
  /** Paste the page text instead of fetching it (for sites that block or cannot be rendered). */
  content: z.string().trim().min(50).max(60_000).optional(),
});

export const factCreateSchema = z.object({
  sourceId: z.string().uuid(),
  fact: z.string().trim().min(8).max(300),
  /** Every fact must keep its source. */
  sourceUrl: httpUrl,
  status: z.enum(FACT_STATUSES).default("CONFIRMED"),
});

export const factUpdateSchema = z
  .object({
    fact: z.string().trim().min(8).max(300),
    status: z.enum(FACT_STATUSES),
  })
  .partial();

export const factBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(FACT_STATUSES),
});
