import { describe, expect, it } from "vitest";
import { filterProposedFacts, parseFactsJson } from "@/server/knowledge/extract";
import { htmlToText } from "@/server/knowledge/fetcher";

const page = `Welcome to Example
New members: grab 160% NOW — 30% then 50% then 80%
Wednesday 20:00–22:00 ONLY — Lucky Day Double up to 88%
Maglaro nang responsable. Para sa 18+ lamang.`;

describe("filterProposedFacts", () => {
  it("keeps facts whose evidence is quoted from the page", () => {
    const out = filterProposedFacts(
      [
        {
          fact: "New members get a 160% bonus split 30/50/80.",
          evidence: "New members: grab 160% NOW",
        },
      ],
      page,
    );
    expect(out).toHaveLength(1);
  });

  it("matches evidence loosely (case, spacing, punctuation)", () => {
    const out = filterProposedFacts(
      [
        {
          fact: "Service is for adults aged 18 or over.",
          evidence: "maglaro nang   RESPONSABLE para sa 18+ lamang",
        },
      ],
      page,
    );
    expect(out).toHaveLength(1);
  });

  it("drops invented facts whose evidence is not on the page", () => {
    const out = filterProposedFacts(
      [
        {
          fact: "Withdrawals are processed within 5 minutes.",
          evidence: "Withdrawals processed in 5 minutes",
        },
      ],
      page,
    );
    expect(out).toEqual([]);
  });

  it("drops missing/too-short/too-long facts and duplicates", () => {
    const quote = "New members: grab 160% NOW";
    const out = filterProposedFacts(
      [
        { fact: "", evidence: quote },
        { fact: "short", evidence: quote },
        { fact: "x".repeat(301), evidence: quote },
        { fact: "New members get a 160% bonus.", evidence: quote },
        { fact: "New members get a 160% bonus!", evidence: quote },
      ],
      page,
    );
    expect(out).toHaveLength(1);
  });

  it("skips facts already known", () => {
    const out = filterProposedFacts(
      [{ fact: "New members get a 160% bonus.", evidence: "New members: grab 160% NOW" }],
      page,
      ["New members get a 160% bonus."],
    );
    expect(out).toEqual([]);
  });
});

describe("parseFactsJson", () => {
  it("parses fenced JSON and ignores malformed items", () => {
    const out = parseFactsJson(
      '```json\n{"facts":[{"fact":"a fact here","evidence":"quote"},{"fact":1}]}\n```',
    );
    expect(out).toEqual([{ fact: "a fact here", evidence: "quote" }]);
  });
  it("throws when there is no JSON", () => {
    expect(() => parseFactsJson("nothing")).toThrow();
  });
});

describe("htmlToText", () => {
  it("extracts visible text and drops scripts/styles", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Hi</title><style>.a{}</style></head><body><script>var x=1</script><h1>Promo</h1><p>160% bonus</p><ul><li>One</li><li>Two</li></ul></body></html>",
    );
    expect(title).toBe("Hi");
    expect(text).toContain("160% bonus");
    expect(text).toContain("One\nTwo");
    expect(text).not.toContain("var x");
  });
});
