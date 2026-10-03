import { describe, expect, it } from "vitest";
import { BUILTIN_PROMPTS } from "@/lib/prompts/builtin";
import {
  MIN_TOTAL_LINES,
  SAFETY_RULES,
  buildPrompt,
  promptStats,
  resumeMessage,
  specProblem,
} from "@/lib/prompts/build";
import { textRiskCodes } from "@/server/claude/validators";
import { LIMITS, chunkIntoConversations } from "@/server/imports/parse";
import { readLines } from "@/server/imports/files";
import { promptSchema, promptUpdateSchema } from "@/validators/prompts";

const cast = [
  { name: "Rodel", personality: "Easygoing, jokey.", messageLength: "SHORT" as const },
  { name: "Jennelyn", personality: "Maalaga.", commonExpressions: ["te", "naman"] },
  { name: "Ma. Grace", languageStyle: "Madaming emoji" },
];

describe("built-in prompt library", () => {
  it("has at least 10 prompts with unique ids, titles and topics", () => {
    expect(BUILTIN_PROMPTS.length).toBeGreaterThanOrEqual(10);
    for (const key of ["id", "title", "topic"] as const) {
      const values = BUILTIN_PROMPTS.map((p) => p[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it.each(BUILTIN_PROMPTS.map((p) => [p.title, p] as const))(
    "%s reaches 2,000+ lines and is internally consistent",
    (_title, p) => {
      expect(specProblem(p)).toBeNull();
      expect(promptStats(p).minLines).toBeGreaterThanOrEqual(MIN_TOTAL_LINES);
      expect(p.linesMax).toBeLessThanOrEqual(LIMITS.maxConversationLines);
      // enough different situations that conversations are not copies of each other
      expect(p.situations.length).toBeGreaterThanOrEqual(10);
      expect(new Set(p.situations.map((s) => s.label)).size).toBe(p.situations.length);
      // 80 conversations spread over the situations: every situation is used more than once
      expect(p.conversations / p.situations.length).toBeGreaterThanOrEqual(2);
    },
  );

  it("never asks ChatGPT for anything the importer flags (links, promo, win claims, figures)", () => {
    for (const p of BUILTIN_PROMPTS) {
      const own = [
        p.description,
        p.notes ?? "",
        ...p.situations.map((s) => `${s.label} ${s.detail}`),
      ];
      for (const text of own) expect(textRiskCodes(text), `${p.id}: ${text}`).toEqual([]);
    }
  });
});

describe("buildPrompt", () => {
  const spec = BUILTIN_PROMPTS[0];
  const text = buildPrompt(spec, cast);

  it("names every persona and includes their details", () => {
    for (const c of cast) expect(text).toContain(`- ${c.name}`);
    expect(text).toContain("Often says: te, naman.");
    expect(text).toContain("usually very short messages");
  });

  it("states the format the importer reads and the safety rules", () => {
    expect(text).toContain("conversation,topic,speaker,message");
    for (const rule of SAFETY_RULES) expect(text).toContain(rule);
    expect(text).toContain("ONLY in the first batch");
  });

  it("states the size and the batch plan", () => {
    const { minLines, maxLines, batches } = promptStats(spec);
    expect(text).toContain(`${spec.conversations} separate conversations`);
    expect(text).toContain(`${spec.linesMin} to ${spec.linesMax} messages`);
    expect(text).toContain(minLines.toLocaleString());
    expect(text).toContain(maxLines.toLocaleString());
    expect(text).toContain(`${batches} batches`);
    expect(text).toContain(`conversations 1 to ${spec.batchSize}`);
    expect(text).toContain(`After conversation ${spec.conversations}`);
  });

  it("lists every situation, numbered", () => {
    spec.situations.forEach((s, i) => expect(text).toContain(`${i + 1}. ${s.label}: ${s.detail}`));
  });

  it("explains how to continue when the AI loses its place", () => {
    expect(resumeMessage(11, spec)).toContain("conversations 11 to 15");
    expect(resumeMessage(78, spec)).toContain("conversations 78 to 80");
  });

  it("still produces a usable prompt with no personas yet", () => {
    expect(buildPrompt(spec, [])).toContain("add personas first");
  });
});

describe("a reply in the prompt's format goes through the real importer", () => {
  const batch1 = [
    "conversation,topic,speaker,message",
    '1,Ano ulam mamaya,Rodel,"uy, ano ulam mamaya?"',
    '1,Ano ulam mamaya,Jennelyn,"adobo na lang te, ""sulit"" naman"',
    '1,Ano ulam mamaya,Ma. Grace,"sige 😄"',
  ];
  const batch2 = [
    '2,Pumalyang luto,Jennelyn,"naku nasunog yung sinaing"',
    '2,Pumalyang luto,Rodel,"hahaha grabe"',
  ];

  it("keeps commas, quotes and emoji, and splits conversations by number", async () => {
    // All batches pasted into one file: the header appears once, in the first batch.
    const csv = Buffer.from([...batch1, ...batch2].join("\n"), "utf8");
    const lines = await readLines("csv", csv);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatchObject({ speaker: "Rodel", text: "uy, ano ulam mamaya?" });
    expect(lines[1].text).toBe('adobo na lang te, "sulit" naman');
    expect(lines[2].text).toBe("sige 😄");
    const convs = chunkIntoConversations(lines, { minSize: 15, maxSize: 35 });
    expect(convs.map((c) => c.lines.length)).toEqual([3, 2]);
  });
});

describe("custom prompt validation", () => {
  const ok = {
    title: "Mine",
    topic: "Test",
    situations: [{ label: "A", detail: "B" }],
    conversations: 80,
    linesMin: 26,
    linesMax: 36,
    batchSize: 5,
  };

  it("accepts a prompt that can reach 2,000 lines", () => {
    expect(promptSchema.safeParse(ok).success).toBe(true);
  });

  it("refuses one that cannot, naming the shortfall", () => {
    const r = promptSchema.safeParse({ ...ok, conversations: 20 });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/only 520 lines/);
  });

  it("refuses minimum above maximum and conversations over 60 lines", () => {
    expect(promptSchema.safeParse({ ...ok, linesMin: 40, linesMax: 30 }).success).toBe(false);
    expect(promptSchema.safeParse({ ...ok, linesMax: 61 }).success).toBe(false);
  });

  it("a PATCH keeps only the fields that were sent (no defaults filled in)", () => {
    expect(promptUpdateSchema.parse({ title: "New" })).toEqual({ title: "New" });
  });
});
