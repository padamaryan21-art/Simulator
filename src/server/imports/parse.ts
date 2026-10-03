/**
 * Parsing of uploaded conversations (Excel/CSV rows or PDF text). Pure functions, unit-tested.
 * Input comes from other AI tools and people, so everything here is forgiving about format.
 */

export type ParsedLine = { speaker: string; text: string; conversation?: string; topic?: string };
export type ParsedConversation = {
  title: string | null;
  lines: { speaker: string; text: string }[];
};

export const LIMITS = {
  maxLines: 20_000,
  maxMessageChars: 600,
  /** Longer conversations are split so a single send job never runs for hours. */
  maxConversationLines: 60,
};

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Collapses whitespace, removes invisible/control characters, and trims. */
export function cleanText(s: string): string {
  return s
    .replace(/[​-‏‪-‮⁠﻿]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADERS = {
  speaker: ["speaker", "name", "persona", "sender", "from", "character", "who", "member", "user"],
  message: [
    "message",
    "text",
    "line",
    "content",
    "dialogue",
    "dialog",
    "chat",
    "reply",
    "msg",
    "conversationline",
  ],
  conversation: [
    "conversation",
    "convo",
    "thread",
    "session",
    "scene",
    "conversationid",
    "convoid",
    "chatid",
    "group",
    "batch",
  ],
  topic: ["topic", "title", "subject", "theme", "conversationtitle"],
};

function findColumns(header: string[]) {
  const cols: Partial<Record<keyof typeof HEADERS, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const key of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
      if (cols[key] === undefined && HEADERS[key].includes(n)) cols[key] = i;
    }
  });
  return cols;
}

/** Rows from one worksheet or CSV. A header row is detected; otherwise columns are speaker, message, conversation. */
export function linesFromRows(rows: string[][]): ParsedLine[] {
  const nonEmpty = rows.filter((r) => r.some((c) => cleanText(String(c ?? "")) !== ""));
  if (!nonEmpty.length) return [];

  const cols = findColumns(nonEmpty[0].map((c) => String(c ?? "")));
  const hasHeader = cols.speaker !== undefined && cols.message !== undefined;
  const sIdx = hasHeader ? cols.speaker! : 0;
  const mIdx = hasHeader ? cols.message! : 1;
  const cIdx = hasHeader ? cols.conversation : rows[0]?.length > 2 ? 2 : undefined;
  const tIdx = hasHeader ? cols.topic : undefined;
  const dataRows = hasHeader ? nonEmpty.slice(1) : nonEmpty;

  const out: ParsedLine[] = [];
  for (const r of dataRows) {
    const speaker = cleanText(String(r[sIdx] ?? ""));
    const text = cleanText(String(r[mIdx] ?? ""));
    if (!speaker || !text) continue;
    const conv = cIdx !== undefined ? cleanText(String(r[cIdx] ?? "")) : "";
    const topic = tIdx !== undefined ? cleanText(String(r[tIdx] ?? "")) : "";
    out.push({
      speaker,
      text,
      conversation: conv || undefined,
      topic: topic || undefined,
    });
  }
  return out;
}

const CONVO_HEADING =
  /^(?:conversation|convo|scene|chat|session|thread|usapan)\s*#?\s*(\d+|[A-Za-z0-9_-]+)?\s*[:.\-–—]?\s*(.*)$/i;
const DECORATED_HEADING = /^[=#*\-_~]{2,}\s*(.+?)\s*[=#*\-_~]*$/;
const TOPIC_LINE = /^topic\s*[:\-–—]\s*(.+)$/i;
const PAGE_NOISE = /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i;
const SPEAKER_LINE =
  /^(?:\[[^\]]{0,30}\]\s*|\(\d{1,2}:\d{2}[^)]*\)\s*|\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–]\s*)?(?:\d{1,4}[.)]\s*)?([^\s:：\-–—#=][^:：]{0,40}?)\s*[:：]\s*(.+)$/;

/**
 * Text from a PDF (or pasted): "Speaker: message" lines. Headings ("Conversation 3: ...",
 * "== Scene ==") start a new conversation, "Topic: ..." labels it, wrapped lines are re-joined.
 */
export function linesFromText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let conversation: string | undefined;
  let topic: string | undefined;
  let last: ParsedLine | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = cleanText(raw);
    if (!line) {
      last = null; // a blank line ends the current message
      continue;
    }
    if (PAGE_NOISE.test(line)) continue;

    // 1. "Topic: ..."
    const topicMatch = TOPIC_LINE.exec(line);
    if (topicMatch) {
      topic = topicMatch[1].trim();
      last = null;
      continue;
    }

    // 2. conversation headings: "Conversation 3: ...", "Scene 2", "== Weekend plans =="
    const decorated = DECORATED_HEADING.exec(line);
    if (CONVO_HEADING.test(line) || decorated) {
      conversation = (decorated ? decorated[1] : line).trim();
      topic = undefined;
      last = null;
      continue;
    }

    // 3. "Speaker: message"
    const sp = SPEAKER_LINE.exec(line);
    if (sp) {
      const speaker = cleanText(sp[1].replace(/^[*_]+|[*_]+$/g, ""));
      const message = cleanText(sp[2].replace(/^[*_]+|[*_]+$/g, ""));
      if (speaker && message && looksLikeName(speaker)) {
        last = { speaker, text: message, conversation, topic };
        out.push(last);
        continue;
      }
    }

    // 4. otherwise: a wrapped continuation of the previous message
    if (last) last.text = cleanText(`${last.text} ${line}`);
  }
  return out;
}

function looksLikeName(s: string) {
  const words = s.trim().split(/\s+/);
  return words.length <= 3 && /^[A-ZÀ-Ý]/.test(words[0]);
}

/** Groups parsed lines into conversations, using explicit conversation labels when present. */
export function chunkIntoConversations(
  lines: ParsedLine[],
  opts: { minSize: number; maxSize: number },
): ParsedConversation[] {
  const labelled = lines.some((l) => l.conversation);
  let groups: { title: string | null; lines: { speaker: string; text: string }[] }[] = [];

  if (labelled) {
    const order: string[] = [];
    const map = new Map<
      string,
      { title: string | null; lines: { speaker: string; text: string }[] }
    >();
    for (const l of lines) {
      const key = l.conversation ?? "";
      if (!map.has(key)) {
        map.set(key, { title: l.conversation || l.topic || null, lines: [] });
        order.push(key);
      }
      map.get(key)!.lines.push({ speaker: l.speaker, text: l.text });
    }
    groups = order.map((k) => map.get(k)!);
  } else {
    // One continuous chat: slice it into conversations of about maxSize lines.
    const size = Math.max(opts.minSize, opts.maxSize);
    for (let i = 0; i < lines.length; i += size) {
      groups.push({
        title: lines[i].topic ?? null,
        lines: lines.slice(i, i + size).map((l) => ({ speaker: l.speaker, text: l.text })),
      });
    }
    // A tiny tail is folded into the previous conversation rather than sent alone.
    if (groups.length > 1 && groups[groups.length - 1].lines.length < opts.minSize) {
      const tail = groups.pop()!;
      groups[groups.length - 1].lines.push(...tail.lines);
    }
  }

  // Never leave a huge conversation: split at the limit.
  const result: ParsedConversation[] = [];
  for (const g of groups) {
    if (g.lines.length <= LIMITS.maxConversationLines) {
      result.push(g);
      continue;
    }
    const parts = Math.ceil(g.lines.length / LIMITS.maxConversationLines);
    const per = Math.ceil(g.lines.length / parts);
    for (let p = 0; p < parts; p++) {
      result.push({
        title: g.title ? `${g.title} (part ${p + 1})` : null,
        lines: g.lines.slice(p * per, (p + 1) * per),
      });
    }
  }
  return result.filter((c) => c.lines.length > 0);
}

export type PersonaAlias = { id: string; names: string[] };

/**
 * Maps a speaker name from the file to a persona. Matches ignoring case, spaces, dots and accents,
 * and accepts a unique first-name/prefix match ("Rodel" for "Rodel Gonzales").
 */
export function matchSpeaker(name: string, personas: PersonaAlias[]): string | null {
  const n = norm(name);
  if (!n) return null;
  for (const p of personas) if (p.names.some((a) => norm(a) === n)) return p.id;
  if (n.length >= 3) {
    const hits = personas.filter((p) =>
      p.names.some((a) => {
        const an = norm(a);
        return an.startsWith(n) || (an.length >= 3 && n.startsWith(an));
      }),
    );
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

/** Distinct speakers in first-seen order with how many lines each has. */
export function countSpeakers(lines: { speaker: string }[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.speaker, (m.get(l.speaker) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count }));
}
