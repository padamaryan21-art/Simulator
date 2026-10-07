/** Quality validation for generated conversations. Pure functions, unit-tested. */

import { extractJsonObject } from "./json";

export type RawMessage = { speaker: string; text: string };
export type ValidationIssue = { code: string; message: string; index?: number };

export type ValidationInput = {
  participants: string[];
  /** Messages already in the group (for repetition checks). */
  recent: string[];
  topicCategory?: string;
  /** Confirmed fact text; percentages/numbers must appear here to be allowed. */
  factsText: string;
  expectedCount: number;
};

export type ValidationResult = {
  messages: RawMessage[];
  issues: ValidationIssue[];
};

/** Extracts the JSON object from a model reply (tolerates fences and surrounding prose). */
export function parseConversationJson(raw: string): RawMessage[] {
  const obj = extractJsonObject(raw) as { messages?: unknown };
  if (!Array.isArray(obj.messages)) throw new Error("JSON has no messages array");
  return obj.messages.flatMap((m) => {
    const r = m as { speaker?: unknown; text?: unknown };
    return typeof r.speaker === "string" && typeof r.text === "string"
      ? [{ speaker: r.speaker.trim(), text: r.text.trim() }]
      : [];
  });
}

const URL_RE = /(https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(com|ph|net|org|io|me)\b)/i;
const ALLYONO_RE = /(all\s?yono|laki\s?\.?\s?ph)/gi;
const PERCENT_RE = /\d+(?:[.,]\d+)?\s?%/g;
const PROMO_RE =
  /\b(guaranteed|sure\s?win|sigurado(ng)?\s+(panalo|win)|jackpot|deposit|mag-?register|sign\s?up|join\s+(us|na)|sali\s+na|click|download|promo\s?code|referral)\b/i;
const WIN_CLAIM_RE =
  /\b(nanalo\s+ako|naka-?(jackpot|win)|kumita\s+ako\s+ng|i\s+won\s+\d|panalo\s+ko)\b/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export function jaccard(a: string, b: string): number {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export function validateConversation(raw: RawMessage[], v: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const byName = new Map(v.participants.map((n) => [n.toLowerCase(), n]));

  // Hard cleanup: unknown speakers and empty messages are dropped.
  const messages: RawMessage[] = [];
  raw.forEach((m, i) => {
    const speaker = byName.get(m.speaker.toLowerCase());
    if (!speaker) {
      issues.push({ code: "unknown_speaker", message: `Unknown speaker "${m.speaker}"`, index: i });
      return;
    }
    if (!m.text) {
      issues.push({ code: "empty", message: "Empty message", index: i });
      return;
    }
    messages.push({ speaker, text: m.text });
  });

  if (messages.length < Math.max(2, Math.floor(v.expectedCount * 0.5))) {
    issues.push({
      code: "too_few",
      message: `Only ${messages.length} usable messages (wanted about ${v.expectedCount})`,
    });
  }

  const speakers = new Set(messages.map((m) => m.speaker));
  if (v.participants.length >= 2 && messages.length >= 4 && speakers.size < 2) {
    issues.push({ code: "single_speaker", message: "Only one participant spoke" });
  }

  let run = 1;
  messages.forEach((m, i) => {
    run = i > 0 && messages[i - 1].speaker === m.speaker ? run + 1 : 1;
    if (run > 2)
      issues.push({
        code: "same_speaker_run",
        message: `${m.speaker} spoke 3+ times in a row`,
        index: i,
      });
    if (m.text.length > 600)
      issues.push({ code: "too_long", message: "Message over 600 characters", index: i });
    if (URL_RE.test(m.text))
      issues.push({ code: "link", message: "Contains a link or domain", index: i });
    if (PROMO_RE.test(m.text))
      issues.push({ code: "promo_language", message: "Promotional wording", index: i });
    if (WIN_CLAIM_RE.test(m.text))
      issues.push({ code: "win_claim", message: "Claims winnings", index: i });
    for (const pct of m.text.match(PERCENT_RE) ?? []) {
      if (!v.factsText.includes(pct.replace(/\s/g, ""))) {
        issues.push({ code: "unverified_number", message: `Unverified figure "${pct}"`, index: i });
      }
    }
  });

  const mentions = messages.filter((m) => (m.text.match(ALLYONO_RE) ?? []).length > 0).length;
  const limit = v.topicCategory === "ALLYONO" ? Math.max(2, Math.ceil(messages.length * 0.25)) : 0;
  if (mentions > limit) {
    issues.push({
      code: "allyono_mentions",
      message:
        limit === 0
          ? `AllYono mentioned ${mentions}x on an unrelated topic`
          : `AllYono mentioned in ${mentions} messages (max ${limit})`,
    });
  }

  messages.forEach((m, i) => {
    if (
      v.recent.some((r) => jaccard(r, m.text) >= 0.8) ||
      messages.slice(0, i).some((p) => jaccard(p.text, m.text) >= 0.8)
    ) {
      issues.push({
        code: "repetition",
        message: "Near-duplicate of an earlier message",
        index: i,
      });
    }
  });

  return { messages, issues };
}

/** Issues that should block sending without a human noticing (shown as warnings in the UI). */
export const SEVERE_CODES = new Set([
  "unverified_number",
  "win_claim",
  "promo_language",
  "link",
  "allyono_mentions",
]);

/**
 * The same risk checks used on conversation lines, applied to a single short text such as an image
 * caption. Returns the issue codes found (empty = fine).
 */
export function textRiskCodes(text: string, factsText = ""): string[] {
  const codes: string[] = [];
  if (URL_RE.test(text)) codes.push("link");
  if (PROMO_RE.test(text)) codes.push("promo_language");
  if (WIN_CLAIM_RE.test(text)) codes.push("win_claim");
  for (const pct of text.match(PERCENT_RE) ?? []) {
    if (!factsText.includes(pct.replace(/\s/g, ""))) {
      codes.push("unverified_number");
      break;
    }
  }
  return codes;
}
