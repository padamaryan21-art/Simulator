import { describe, expect, it } from "vitest";
import {
  LIMITS,
  chunkIntoConversations,
  cleanText,
  countSpeakers,
  linesFromRows,
  linesFromText,
  matchSpeaker,
} from "@/server/imports/parse";

const personas = [
  { id: "rodel", names: ["Rodel", "Rodel Gonzales"] },
  { id: "jen", names: ["Jennelyn", "Jen"] },
  { id: "grace", names: ["Ma. Grace"] },
  { id: "ernesto", names: ["Ernesto"] },
];

describe("cleanText", () => {
  it("removes invisible characters and collapses whitespace", () => {
    expect(cleanText("  hello​   world ﻿\n\t!  ")).toBe("hello world !");
  });
});

describe("linesFromRows (Excel / CSV)", () => {
  it("reads a headed sheet with conversation and topic columns, in any column order", () => {
    const rows = [
      ["Message", "Conversation", "Speaker", "Topic"],
      ["uy kumusta", "1", "Rodel", "Kumustahan"],
      ["ok lang ako", "1", "Jen", "Kumustahan"],
      ["ikaw?", "2", "Rodel", ""],
    ];
    const out = linesFromRows(rows);
    expect(out).toEqual([
      { speaker: "Rodel", text: "uy kumusta", conversation: "1", topic: "Kumustahan" },
      { speaker: "Jen", text: "ok lang ako", conversation: "1", topic: "Kumustahan" },
      { speaker: "Rodel", text: "ikaw?", conversation: "2", topic: undefined },
    ]);
  });

  it("understands common header synonyms", () => {
    const out = linesFromRows([
      ["Sender", "Dialogue"],
      ["Ernesto", "magandang gabi"],
    ]);
    expect(out).toEqual([
      { speaker: "Ernesto", text: "magandang gabi", conversation: undefined, topic: undefined },
    ]);
  });

  it("falls back to speaker, message, conversation when there is no header row", () => {
    const out = linesFromRows([
      ["Rodel", "uy", "A"],
      ["Jen", "hi", "A"],
    ]);
    expect(out.map((l) => [l.speaker, l.text, l.conversation])).toEqual([
      ["Rodel", "uy", "A"],
      ["Jen", "hi", "A"],
    ]);
  });

  it("skips blank and incomplete rows", () => {
    const out = linesFromRows([
      ["speaker", "message"],
      ["", ""],
      ["Rodel", ""],
      ["", "orphan"],
      ["Jen", "ok"],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].speaker).toBe("Jen");
  });
});

describe("linesFromText (PDF)", () => {
  const pdf = `
Conversation 1: Pagod sa trabaho
Rodel: Grabe, pagod na pagod ako sa office.
Jennelyn: Ay naku, magpahinga ka naman
te, wag masyadong overwork.
Page 1 of 3

Topic: Weekend
Ma. Grace: Anong plano natin sa Sabado?
Conversation 2
Ernesto: Kumain na kayo?
`;
  const lines = linesFromText(pdf);

  it("reads speaker lines, re-joins wrapped lines, and ignores page numbers", () => {
    expect(lines.map((l) => [l.speaker, l.text])).toEqual([
      ["Rodel", "Grabe, pagod na pagod ako sa office."],
      ["Jennelyn", "Ay naku, magpahinga ka naman te, wag masyadong overwork."],
      ["Ma. Grace", "Anong plano natin sa Sabado?"],
      ["Ernesto", "Kumain na kayo?"],
    ]);
  });

  it("assigns conversation headings and topics", () => {
    expect(lines[0].conversation).toBe("Conversation 1: Pagod sa trabaho");
    expect(lines[2].conversation).toBe("Conversation 1: Pagod sa trabaho");
    expect(lines[2].topic).toBe("Weekend");
    expect(lines[3].conversation).toBe("Conversation 2");
    expect(lines[3].topic).toBeUndefined();
  });

  it("copes with numbering, timestamps, bold markers and decorated headings", () => {
    const out = linesFromText(
      "== Scene A ==\n1. **Rodel**: uy\n[10:42] Jennelyn: hello\n(9:15 PM) Ernesto: gabi na",
    );
    expect(out.map((l) => [l.speaker, l.text, l.conversation])).toEqual([
      ["Rodel", "uy", "Scene A"],
      ["Jennelyn", "hello", "Scene A"],
      ["Ernesto", "gabi na", "Scene A"],
    ]);
  });

  it("does not turn prose containing a colon into a speaker", () => {
    const out = linesFromText(
      "Rodel: ok\nthis sentence has a colon here: but it is a continuation, not a speaker",
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("continuation");
  });
});

describe("chunkIntoConversations", () => {
  const mk = (n: number, conv?: string) =>
    Array.from({ length: n }, (_, i) => ({
      speaker: i % 2 ? "Jen" : "Rodel",
      text: `line ${i}`,
      conversation: conv,
    }));

  it("groups by explicit conversation label, keeping order", () => {
    const lines = [...mk(3, "A"), ...mk(2, "B"), ...mk(1, "A")];
    const out = chunkIntoConversations(lines, { minSize: 2, maxSize: 10 });
    expect(out.map((c) => [c.title, c.lines.length])).toEqual([
      ["A", 4],
      ["B", 2],
    ]);
  });

  it("slices one continuous chat into conversations and folds a tiny tail into the last one", () => {
    const out = chunkIntoConversations(mk(2010), { minSize: 15, maxSize: 30 });
    expect(out.reduce((n, c) => n + c.lines.length, 0)).toBe(2010);
    expect(out.every((c) => c.lines.length >= 15)).toBe(true);
    expect(out.length).toBe(67);
  });

  it("splits a huge labelled conversation so no single send runs for hours", () => {
    const out = chunkIntoConversations(mk(150, "BIG"), { minSize: 15, maxSize: 30 });
    expect(out.length).toBe(3);
    expect(out.every((c) => c.lines.length <= LIMITS.maxConversationLines)).toBe(true);
    expect(out[0].title).toBe("BIG (part 1)");
  });
});

describe("matchSpeaker", () => {
  it("matches exact names ignoring case, dots, spaces and accents", () => {
    expect(matchSpeaker("rodel", personas)).toBe("rodel");
    expect(matchSpeaker("MA GRACE", personas)).toBe("grace");
    expect(matchSpeaker("Ma.Grace", personas)).toBe("grace");
    expect(matchSpeaker("Jénnelyn", personas)).toBe("jen");
  });
  it("accepts a unique prefix and rejects ambiguous or unknown names", () => {
    expect(matchSpeaker("Ernes", personas)).toBe("ernesto");
    expect(matchSpeaker("Stranger", personas)).toBeNull();
    expect(matchSpeaker("", personas)).toBeNull();
    expect(matchSpeaker("Je", personas)).toBeNull(); // too short to guess
  });
});

describe("countSpeakers", () => {
  it("counts lines per speaker in first-seen order", () => {
    expect(countSpeakers([{ speaker: "B" }, { speaker: "A" }, { speaker: "B" }])).toEqual([
      { name: "B", count: 2 },
      { name: "A", count: 1 },
    ]);
  });
});
