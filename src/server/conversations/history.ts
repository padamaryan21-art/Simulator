import { and, count, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  automationLogs,
  conversationMessages,
  conversationSessions,
  groups,
  personas,
  topics,
} from "@/db/schema";
import type { LogSearch, MessageSearch, SessionSearch } from "@/validators/history";

/** Escapes LIKE wildcards so user input is matched literally. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const dayStart = (d: string) => new Date(`${d}T00:00:00+08:00`); // Philippine time
const dayEndExclusive = (d: string) => new Date(dayStart(d).getTime() + 24 * 3600 * 1000);

const paginate = (page: number, pageSize: number) => ({
  limit: pageSize,
  offset: (page - 1) * pageSize,
});

export async function searchSessions(f: SessionSearch) {
  const conds: (SQL | undefined)[] = [
    f.groupId ? eq(conversationSessions.groupId, f.groupId) : undefined,
    f.status ? eq(conversationSessions.status, f.status) : undefined,
    f.mode ? eq(conversationSessions.mode, f.mode) : undefined,
    f.from ? gte(conversationSessions.createdAt, dayStart(f.from)) : undefined,
    f.to ? lt(conversationSessions.createdAt, dayEndExclusive(f.to)) : undefined,
  ];
  if (f.q) {
    const p = likePattern(f.q);
    conds.push(
      or(
        ilike(topics.title, p),
        ilike(conversationSessions.title, p),
        sql`exists (select 1 from conversation_messages m where m.session_id = ${conversationSessions.id} and m.content ilike ${p})`,
      ),
    );
  }
  const where = and(...conds);

  const counts = db
    .select({
      sessionId: conversationMessages.sessionId,
      total: count().as("total"),
      sent: sql<number>`count(*) filter (where ${conversationMessages.status} = 'SENT')`
        .mapWith(Number)
        .as("sent"),
    })
    .from(conversationMessages)
    .groupBy(conversationMessages.sessionId)
    .as("counts");

  const base = db
    .select({
      id: conversationSessions.id,
      mode: conversationSessions.mode,
      status: conversationSessions.status,
      environment: conversationSessions.environment,
      createdAt: conversationSessions.createdAt,
      endedAt: conversationSessions.endedAt,
      groupId: conversationSessions.groupId,
      groupName: groups.name,
      topicTitle: sql<string | null>`coalesce(${topics.title}, ${conversationSessions.title})`,
      source: conversationSessions.source,
      total: sql<number>`coalesce(${counts.total}, 0)`.mapWith(Number),
      sent: sql<number>`coalesce(${counts.sent}, 0)`.mapWith(Number),
    })
    .from(conversationSessions)
    .innerJoin(groups, eq(conversationSessions.groupId, groups.id))
    .leftJoin(topics, eq(conversationSessions.topicId, topics.id))
    .leftJoin(counts, eq(counts.sessionId, conversationSessions.id))
    .where(where);

  const [rows, [{ total }]] = await Promise.all([
    base
      .orderBy(desc(conversationSessions.createdAt))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ total: count() })
      .from(conversationSessions)
      .innerJoin(groups, eq(conversationSessions.groupId, groups.id))
      .leftJoin(topics, eq(conversationSessions.topicId, topics.id))
      .where(where),
  ]);
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

export async function searchMessages(f: MessageSearch) {
  const conds: (SQL | undefined)[] = [
    f.q ? ilike(conversationMessages.content, likePattern(f.q)) : undefined,
    f.status ? eq(conversationMessages.status, f.status) : undefined,
    f.personaId ? eq(conversationMessages.personaId, f.personaId) : undefined,
    f.sessionId ? eq(conversationMessages.sessionId, f.sessionId) : undefined,
    f.groupId ? eq(conversationSessions.groupId, f.groupId) : undefined,
    f.from ? gte(conversationMessages.createdAt, dayStart(f.from)) : undefined,
    f.to ? lt(conversationMessages.createdAt, dayEndExclusive(f.to)) : undefined,
  ];
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: conversationMessages.id,
        sessionId: conversationMessages.sessionId,
        content: conversationMessages.content,
        status: conversationMessages.status,
        createdAt: conversationMessages.createdAt,
        sentAt: conversationMessages.sentAt,
        approvedAt: conversationMessages.approvedAt,
        errorMessage: conversationMessages.errorMessage,
        personaName: personas.name,
        groupName: groups.name,
        environment: conversationSessions.environment,
      })
      .from(conversationMessages)
      .innerJoin(conversationSessions, eq(conversationMessages.sessionId, conversationSessions.id))
      .innerJoin(groups, eq(conversationSessions.groupId, groups.id))
      .leftJoin(personas, eq(conversationMessages.personaId, personas.id))
      .where(where)
      .orderBy(desc(conversationMessages.createdAt), desc(conversationMessages.position))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ total: count() })
      .from(conversationMessages)
      .innerJoin(conversationSessions, eq(conversationMessages.sessionId, conversationSessions.id))
      .where(where),
  ]);
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

export async function searchLogs(f: LogSearch) {
  const where = and(
    f.level ? eq(automationLogs.level, f.level) : undefined,
    f.category ? eq(automationLogs.category, f.category) : undefined,
    f.q ? ilike(automationLogs.message, likePattern(f.q)) : undefined,
    f.from ? gte(automationLogs.createdAt, dayStart(f.from)) : undefined,
    f.to ? lt(automationLogs.createdAt, dayEndExclusive(f.to)) : undefined,
  );
  const { limit, offset } = paginate(f.page, f.pageSize);
  const [rows, [{ total }], cats] = await Promise.all([
    db
      .select()
      .from(automationLogs)
      .where(where)
      .orderBy(desc(automationLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(automationLogs).where(where),
    db.selectDistinct({ category: automationLogs.category }).from(automationLogs),
  ]);
  return {
    rows,
    total,
    page: f.page,
    pageSize: f.pageSize,
    categories: cats.map((c) => c.category).sort(),
  };
}

/** Deletes sessions (and, by cascade, their messages). Sessions that are sending are kept. */
export async function deleteSessions(ids: string[]) {
  const rows = await db
    .delete(conversationSessions)
    .where(and(inArray(conversationSessions.id, ids), ne(conversationSessions.status, "SENDING")))
    .returning({ id: conversationSessions.id });
  return { deleted: rows.length, skipped: ids.length - rows.length };
}
