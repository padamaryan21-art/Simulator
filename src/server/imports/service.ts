import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMessages,
  conversationSessions,
  groupParticipants,
  groups,
  personas,
  telegramAccounts,
} from "@/db/schema";
import {
  SEVERE_CODES,
  validateConversation,
  type ValidationIssue,
} from "@/server/claude/validators";
import { writeLog } from "@/server/conversations/logs";
import { getConfirmedFacts } from "@/server/knowledge/retrieve";
import type { CommitInput } from "@/validators/imports";
import { detectKind, ImportError, MAX_FILE_BYTES, readLines } from "./files";
import {
  LIMITS,
  chunkIntoConversations,
  countSpeakers,
  matchSpeaker,
  type PersonaAlias,
} from "./parse";

export { ImportError };

async function privateGroup(groupId: string) {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!g) throw new ImportError("Group not found.");
  if (g.type !== "PRIVATE_SIMULATION") {
    // Imported scripts feed the automated private simulation. Anything for the real community
    // is generated in the Simulator and goes through human approval.
    throw new ImportError("Conversations can only be imported into a private simulation group.");
  }
  return g;
}

/** Participants of the group, with every name a file might use for them. */
async function groupPersonas(groupId: string) {
  const rows = await db
    .select({
      id: personas.id,
      name: personas.name,
      active: personas.active,
      account: telegramAccounts.displayName,
    })
    .from(groupParticipants)
    .innerJoin(personas, eq(groupParticipants.personaId, personas.id))
    .leftJoin(telegramAccounts, eq(personas.telegramAccountId, telegramAccounts.id))
    .where(eq(groupParticipants.groupId, groupId));
  const aliases: PersonaAlias[] = rows.map((r) => ({
    id: r.id,
    names: [r.name, ...(r.account ? [r.account] : [])],
  }));
  return { rows, aliases };
}

export type PreviewLine = { speaker: string; text: string; flags?: string[] };
export type PreviewConversation = { title: string | null; lines: PreviewLine[] };

export async function previewImport(input: {
  groupId: string;
  filename: string;
  data: Buffer;
  minSize: number;
  maxSize: number;
}) {
  if (input.data.byteLength === 0) throw new ImportError("The file is empty.");
  if (input.data.byteLength > MAX_FILE_BYTES)
    throw new ImportError("The file is larger than 4 MB.");
  await privateGroup(input.groupId);
  const { rows, aliases } = await groupPersonas(input.groupId);
  if (rows.length < 2)
    throw new ImportError("The group needs at least two participants first (Groups → Edit).");

  const kind = detectKind(input.filename, input.data);
  let lines;
  try {
    lines = await readLines(kind, input.data);
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError(
      "The file could not be read. Check that it is a valid, unprotected file.",
    );
  }
  if (!lines.length) {
    throw new ImportError(
      "No conversation lines were found. Use the template: columns speaker and message (and optionally conversation and topic), or 'Speaker: message' lines in a PDF.",
    );
  }
  if (lines.length > LIMITS.maxLines) {
    throw new ImportError(
      `The file has ${lines.length.toLocaleString()} lines; the limit is ${LIMITS.maxLines.toLocaleString()} per upload.`,
    );
  }

  const chunks = chunkIntoConversations(lines, { minSize: input.minSize, maxSize: input.maxSize });
  const speakers = countSpeakers(lines).map((s) => ({
    ...s,
    personaId: matchSpeaker(s.name, aliases),
  }));

  // Same quality rules as generated conversations; reported as warnings, never silently applied.
  const facts = (await getConfirmedFacts(200))
    .map((f) => f.fact)
    .join(" ")
    .replace(/\s/g, "");
  const names = speakers.map((s) => s.name);
  const byCode: Record<string, number> = {};
  const examples: {
    conversation: number;
    line: number;
    code: string;
    message: string;
    text: string;
  }[] = [];
  const conversations: PreviewConversation[] = chunks.map((c, ci) => {
    const result = validateConversation(c.lines, {
      participants: names,
      recent: [],
      topicCategory: "LAKIPH", // the import's topic is unknown; use the lenient LakiPH-mention limit
      factsText: facts,
      expectedCount: c.lines.length,
    });
    const flagged = new Map<number, string[]>();
    for (const issue of result.issues as ValidationIssue[]) {
      byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
      if (issue.index !== undefined)
        flagged.set(issue.index, [...(flagged.get(issue.index) ?? []), issue.code]);
      if (examples.length < 25 && issue.index !== undefined) {
        examples.push({
          conversation: ci + 1,
          line: issue.index + 1,
          code: issue.code,
          message: issue.message,
          text: c.lines[issue.index]?.text.slice(0, 140) ?? "",
        });
      }
    }
    return { title: c.title, lines: c.lines.map((l, i) => ({ ...l, flags: flagged.get(i) })) };
  });

  return {
    kind,
    totalLines: lines.length,
    conversationCount: conversations.length,
    speakers,
    participants: rows.map((r) => ({ id: r.id, name: r.name, active: r.active })),
    issues: { byCode, severe: [...SEVERE_CODES], examples },
    conversations,
  };
}

/** Creates one preview draft per conversation. Nothing is sent; the scheduler uses drafts first. */
export async function commitImport(input: CommitInput, userId: string) {
  const group = await privateGroup(input.groupId);
  const { rows } = await groupPersonas(group.id);
  const allowed = new Map(rows.map((r) => [r.id, r]));

  const total = input.conversations.reduce((n, c) => n + c.messages.length, 0);
  if (total > LIMITS.maxLines)
    throw new ImportError(`Too many lines (limit ${LIMITS.maxLines.toLocaleString()}).`);

  const ids = [...new Set(input.conversations.flatMap((c) => c.messages.map((m) => m.personaId)))];
  const outsiders = ids.filter((id) => !allowed.get(id)?.active);
  if (outsiders.length) {
    throw new ImportError(
      "Some lines are assigned to a persona that is not an active participant of this group.",
    );
  }
  const accounts = await db
    .select({ id: personas.id, accountId: personas.telegramAccountId })
    .from(personas)
    .where(inArray(personas.id, ids));
  const accountOf = new Map(accounts.map((a) => [a.id, a.accountId]));

  let sessionsCreated = 0;
  // Postgres now() is frozen inside a transaction, so every draft would share one created_at and the
  // scheduler (which plays drafts oldest first) would pick them in random order. Stagger them by 1 ms
  // so the file order is the play order.
  const importedAt = Date.now();
  await db.transaction(async (tx) => {
    for (const convo of input.conversations) {
      if (new Set(convo.messages.map((m) => m.personaId)).size < 2) continue; // a monologue is not a conversation
      const [s] = await tx
        .insert(conversationSessions)
        .values({
          groupId: group.id,
          topicId: null,
          mode: "PREVIEW",
          status: "DRAFT",
          environment: group.type,
          source: "IMPORTED",
          createdAt: new Date(importedAt + sessionsCreated),
          title: convo.title?.slice(0, 200) || null,
        })
        .returning({ id: conversationSessions.id });
      await tx.insert(conversationMessages).values(
        convo.messages.map((m, i) => ({
          sessionId: s.id,
          personaId: m.personaId,
          telegramAccountId: accountOf.get(m.personaId) ?? null,
          position: i,
          content: m.text,
          status: "GENERATED" as const,
        })),
      );
      sessionsCreated++;
    }
  });

  await writeLog("info", "import", "Conversations imported as drafts", {
    groupId: group.id,
    conversations: sessionsCreated,
    lines: total,
    actorId: userId,
  });
  return { conversations: sessionsCreated, lines: total };
}
