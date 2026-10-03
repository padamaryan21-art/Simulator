import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { websiteFacts, websitePages, websiteSources } from "@/db/schema";
import { childLogger } from "@/lib/logger";
import { writeLog } from "@/server/conversations/logs";
import type { FactStatus } from "@/validators/knowledge";
import { extractFacts } from "./extract";
import { assertAllowedUrl, fetchPageText, FetchError } from "./fetcher";

const log = childLogger("knowledge");

export class KnowledgeError extends Error {}

const MAX_PAGES_PER_SOURCE = 30;

export async function listKnowledge() {
  const [sources, pages, facts] = await Promise.all([
    db.select().from(websiteSources).orderBy(asc(websiteSources.createdAt)),
    db
      .select({
        id: websitePages.id,
        sourceId: websitePages.sourceId,
        url: websitePages.url,
        title: websitePages.title,
        fetchMode: websitePages.fetchMode,
        lastError: websitePages.lastError,
        fetchedAt: websitePages.fetchedAt,
        content: websitePages.content,
      })
      .from(websitePages)
      .orderBy(asc(websitePages.createdAt)),
    db.select().from(websiteFacts).orderBy(desc(websiteFacts.createdAt)),
  ]);
  return {
    sources,
    // Page bodies stay on the server; the UI only needs their size.
    pages: pages.map(({ content, ...p }) => ({ ...p, contentLength: content.length })),
    facts,
  };
}

export async function addSource(input: { name: string; baseUrl: string }) {
  const [row] = await db.insert(websiteSources).values(input).onConflictDoNothing().returning();
  if (!row) throw new KnowledgeError("A source with this URL already exists.");
  return row;
}

export async function deleteSource(id: string) {
  await db.delete(websiteSources).where(eq(websiteSources.id, id));
}

async function getSource(id: string) {
  const [s] = await db.select().from(websiteSources).where(eq(websiteSources.id, id));
  if (!s) throw new KnowledgeError("Source not found.");
  return s;
}

type Fetched = { title: string | null; text: string; mode: "STATIC" | "RENDERED" | "MANUAL" };

/**
 * Stores page text (fetched or pasted), marks facts from a CHANGED page as OUTDATED, and
 * proposes new facts for human review. Proposed facts are never CONFIRMED automatically.
 */
async function ingestPage(
  source: typeof websiteSources.$inferSelect,
  url: string,
  fetched: Fetched,
) {
  const hash = createHash("sha256").update(fetched.text).digest("hex");
  const [existing] = await db.select().from(websitePages).where(eq(websitePages.url, url));
  const changed = Boolean(existing && existing.contentHash !== hash);

  let pageId = existing?.id;
  if (!existing) {
    const [created] = await db
      .insert(websitePages)
      .values({
        sourceId: source.id,
        url,
        title: fetched.title,
        content: fetched.text,
        contentHash: hash,
        fetchMode: fetched.mode,
        fetchedAt: new Date(),
      })
      .returning({ id: websitePages.id });
    pageId = created.id;
  } else {
    await db
      .update(websitePages)
      .set({
        title: fetched.title,
        content: fetched.text,
        contentHash: hash,
        fetchMode: fetched.mode,
        lastError: null,
        fetchedAt: new Date(),
      })
      .where(eq(websitePages.id, existing.id));
  }

  let outdated = 0;
  if (changed && pageId) {
    const res = await db
      .update(websiteFacts)
      .set({ status: "OUTDATED" })
      .where(and(eq(websiteFacts.pageId, pageId), eq(websiteFacts.status, "CONFIRMED")))
      .returning({ id: websiteFacts.id });
    outdated = res.length;
  }

  const known = await db
    .select({ fact: websiteFacts.fact })
    .from(websiteFacts)
    .where(eq(websiteFacts.sourceId, source.id));
  const proposed = await extractFacts(
    fetched.text,
    url,
    known.map((k) => k.fact),
  );
  if (proposed.length) {
    await db.insert(websiteFacts).values(
      proposed.map((p) => ({
        pageId,
        sourceId: source.id,
        fact: p.fact,
        evidence: p.evidence,
        sourceUrl: url,
        status: "UNKNOWN" as const,
      })),
    );
  }
  await db
    .update(websiteSources)
    .set({ lastRefreshedAt: new Date() })
    .where(eq(websiteSources.id, source.id));
  return { pageId, proposed: proposed.length, outdated, changed, mode: fetched.mode };
}

async function fetchOrFail(url: string, baseUrl: string): Promise<Fetched> {
  try {
    return await fetchPageText(url, baseUrl);
  } catch (err) {
    const msg = err instanceof FetchError ? err.message : `Fetch failed: ${(err as Error).message}`;
    await db.update(websitePages).set({ lastError: msg }).where(eq(websitePages.url, url));
    throw new KnowledgeError(msg);
  }
}

/** Add a page by URL (fetched) or by pasted text. */
export async function addPage(input: { sourceId: string; url: string; content?: string }) {
  const source = await getSource(input.sourceId);
  await assertAllowedUrl(input.url, source.baseUrl).catch((e: Error) => {
    throw new KnowledgeError(e.message);
  });
  const existing = await db
    .select({ id: websitePages.id, url: websitePages.url })
    .from(websitePages)
    .where(eq(websitePages.sourceId, source.id));
  if (!existing.some((p) => p.url === input.url) && existing.length >= MAX_PAGES_PER_SOURCE) {
    throw new KnowledgeError(`Limit of ${MAX_PAGES_PER_SOURCE} pages per source reached.`);
  }

  const fetched: Fetched = input.content
    ? { title: null, text: input.content, mode: "MANUAL" }
    : await fetchOrFail(input.url, source.baseUrl);
  const result = await ingestPage(source, input.url, fetched);
  await writeLog("info", "knowledge", "Page added", {
    url: input.url,
    mode: result.mode,
    proposed: result.proposed,
  });
  return result;
}

export async function refreshPage(pageId: string) {
  const [page] = await db.select().from(websitePages).where(eq(websitePages.id, pageId));
  if (!page) throw new KnowledgeError("Page not found.");
  const source = await getSource(page.sourceId);
  if (page.fetchMode === "MANUAL") {
    throw new KnowledgeError("This page was pasted manually. Paste updated text to refresh it.");
  }
  const fetched = await fetchOrFail(page.url, source.baseUrl);
  const result = await ingestPage(source, page.url, fetched);
  await writeLog("info", "knowledge", "Page refreshed", {
    url: page.url,
    changed: result.changed,
    outdated: result.outdated,
    proposed: result.proposed,
  });
  return result;
}

/** Refreshes every fetchable page of a source (adding the base URL if it has no pages yet). */
export async function refreshSource(sourceId: string) {
  const source = await getSource(sourceId);
  const pages = await db.select().from(websitePages).where(eq(websitePages.sourceId, sourceId));
  const targets = pages.filter((p) => p.fetchMode !== "MANUAL");

  const results: {
    url: string;
    ok: boolean;
    error?: string;
    proposed?: number;
    changed?: boolean;
  }[] = [];
  const run = async (url: string, fn: () => Promise<{ proposed: number; changed: boolean }>) => {
    try {
      const r = await fn();
      results.push({ url, ok: true, proposed: r.proposed, changed: r.changed });
    } catch (err) {
      log.warn({ url, err: (err as Error).message }, "page refresh failed");
      results.push({ url, ok: false, error: (err as Error).message });
    }
  };

  if (!pages.length) await run(source.baseUrl, () => addPage({ sourceId, url: source.baseUrl }));
  for (const p of targets) await run(p.url, () => refreshPage(p.id));
  return results;
}

export async function deletePage(id: string) {
  await db.delete(websitePages).where(eq(websitePages.id, id));
}

export async function createFact(input: {
  sourceId: string;
  fact: string;
  sourceUrl: string;
  status: FactStatus;
}) {
  await getSource(input.sourceId);
  const [row] = await db
    .insert(websiteFacts)
    .values({ ...input, verifiedAt: input.status === "CONFIRMED" ? new Date() : null })
    .returning();
  return row;
}

export async function updateFact(id: string, patch: { fact?: string; status?: FactStatus }) {
  if (patch.fact === undefined && patch.status === undefined) {
    const [current] = await db.select().from(websiteFacts).where(eq(websiteFacts.id, id));
    return current ?? null;
  }
  const [row] = await db
    .update(websiteFacts)
    .set({ ...patch, ...(patch.status === "CONFIRMED" ? { verifiedAt: new Date() } : {}) })
    .where(eq(websiteFacts.id, id))
    .returning();
  return row ?? null;
}

export async function setFactsStatus(ids: string[], status: FactStatus) {
  const rows = await db
    .update(websiteFacts)
    .set({ status, ...(status === "CONFIRMED" ? { verifiedAt: new Date() } : {}) })
    .where(inArray(websiteFacts.id, ids))
    .returning({ id: websiteFacts.id });
  return { updated: rows.length };
}

export async function deleteFact(id: string) {
  await db.delete(websiteFacts).where(eq(websiteFacts.id, id));
}
