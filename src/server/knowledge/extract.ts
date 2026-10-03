import { generateText } from "@/server/claude/client";
import { extractJsonObject } from "@/server/claude/json";
import { jaccard } from "@/server/claude/validators";

export type ProposedFact = { fact: string; evidence: string };

/**
 * Normalises text for loose "does the page contain this quote" matching: case, spacing and
 * punctuation are ignored, but decimals (0.6%) and currency/percent signs stay significant.
 */
export const normForMatch = (s: string) =>
  s
    .toLowerCase()
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/[^\p{L}\p{N}%₱.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Keeps only facts whose evidence quote really appears in the page text, drops duplicates
 * and trivially short/long items. This is what stops invented facts reaching the database.
 */
export function filterProposedFacts(
  proposed: ProposedFact[],
  pageText: string,
  existing: string[] = [],
): ProposedFact[] {
  const page = normForMatch(pageText);
  const kept: ProposedFact[] = [];
  for (const p of proposed) {
    const fact = p.fact?.trim();
    const evidence = p.evidence?.trim();
    if (!fact || !evidence || fact.length < 8 || fact.length > 300) continue;
    if (!page.includes(normForMatch(evidence))) continue;
    if ([...existing, ...kept.map((k) => k.fact)].some((e) => jaccard(e, fact) >= 0.8)) continue;
    kept.push({ fact, evidence: evidence.slice(0, 500) });
  }
  return kept;
}

export function parseFactsJson(raw: string): ProposedFact[] {
  const obj = extractJsonObject(raw) as { facts?: unknown };
  if (!Array.isArray(obj.facts)) return [];
  return obj.facts.flatMap((f) => {
    const r = f as { fact?: unknown; evidence?: unknown };
    return typeof r.fact === "string" && typeof r.evidence === "string"
      ? [{ fact: r.fact, evidence: r.evidence }]
      : [];
  });
}

/** Asks the model for atomic, source-quoted facts about the site. Output is only a proposal. */
export async function extractFacts(
  pageText: string,
  url: string,
  existing: string[] = [],
): Promise<ProposedFact[]> {
  const res = await generateText({
    system:
      "You extract verifiable facts from website text. You never add information that is not written in the text. Output JSON only.",
    messages: [
      {
        role: "user",
        content: `Page URL: ${url}

Extract up to 25 short, atomic facts about the service stated in the page text (offers, terms, schedules, how things work, features).

Rules:
- Each fact is ONE self-contained sentence in English, keeping numbers, currencies and conditions exactly as written.
- "evidence" MUST be a short verbatim quote (under 200 characters) copied from the page text that supports the fact.
- Skip anything dynamic or transient: live winner lists, jackpot/player counters, per-game statistics, usernames, timestamps.
- Skip navigation labels, menu items, buttons and footer links (e.g. "the site has a FAQs page", "users can log in"), slogans, and vague marketing with no concrete claim.
- If the page has no concrete facts, return an empty list.

Return JSON: {"facts":[{"fact":"...","evidence":"..."}]}

PAGE TEXT:
"""
${pageText.slice(0, 14_000)}
"""`,
      },
    ],
    maxTokens: 3000,
    temperature: 0.1,
  });
  return filterProposedFacts(parseFactsJson(res.text), pageText, existing);
}
