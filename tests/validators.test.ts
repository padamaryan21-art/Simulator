import { describe, expect, it } from "vitest";
import { parseConversationJson, validateConversation } from "@/server/claude/validators";

const base = {
  participants: ["Jen", "Rodel", "Grace"],
  recent: [],
  factsText: "",
  expectedCount: 6,
};
const msg = (speaker: string, text: string) => ({ speaker, text });
const codes = (r: ReturnType<typeof validateConversation>) => r.issues.map((i) => i.code);

describe("parseConversationJson", () => {
  it("parses fenced JSON with surrounding prose", () => {
    const out = parseConversationJson(
      'Sure!\n```json\n{"messages":[{"speaker":"Jen","text":"hi"}]}\n```',
    );
    expect(out).toEqual([{ speaker: "Jen", text: "hi" }]);
  });
  it("throws on non-JSON", () => {
    expect(() => parseConversationJson("no json here")).toThrow();
  });
});

describe("validateConversation", () => {
  const ok = [
    msg("Jen", "kumain ka na?"),
    msg("Rodel", "oo kanina"),
    msg("Jen", "ano ulam?"),
    msg("Grace", "adobo yata"),
    msg("Rodel", "sarap"),
    msg("Grace", "hehe"),
  ];
  it("accepts a clean conversation", () => {
    expect(validateConversation(ok, base).issues).toEqual([]);
  });
  it("drops unknown speakers (case-insensitively matches known ones)", () => {
    const r = validateConversation([msg("jen", "hello"), msg("Stranger", "hi"), ...ok], base);
    expect(r.messages[0].speaker).toBe("Jen");
    expect(codes(r)).toContain("unknown_speaker");
  });
  it("flags LakiPH mentions on unrelated topics", () => {
    const r = validateConversation([...ok.slice(0, 5), msg("Grace", "try niyo LakiPH")], {
      ...base,
      topicCategory: "FOOD",
    });
    expect(codes(r)).toContain("lakiph_mentions");
  });
  it("flags unverified percentages but allows confirmed ones", () => {
    const text = [...ok.slice(0, 5), msg("Grace", "may 160% daw")];
    expect(codes(validateConversation(text, { ...base, topicCategory: "LAKIPH" }))).toContain(
      "unverified_number",
    );
    expect(
      codes(
        validateConversation(text, {
          ...base,
          topicCategory: "LAKIPH",
          factsText: "bonusupto160%",
        }),
      ),
    ).not.toContain("unverified_number");
  });
  it("flags links, promo wording and win claims", () => {
    const r = validateConversation(
      [
        ...ok.slice(0, 3),
        msg("Grace", "visit www.laki.ph"),
        msg("Rodel", "sigurado panalo"),
        msg("Jen", "nanalo ako kahapon"),
      ],
      base,
    );
    expect(codes(r)).toEqual(expect.arrayContaining(["link", "promo_language", "win_claim"]));
  });
  it("flags long same-speaker runs and repetition", () => {
    const r = validateConversation(
      [
        msg("Jen", "a b c d"),
        msg("Jen", "e f g"),
        msg("Jen", "h i j"),
        msg("Rodel", "a b c d"),
        msg("Grace", "ok"),
      ],
      base,
    );
    expect(codes(r)).toEqual(expect.arrayContaining(["same_speaker_run", "repetition"]));
  });
  it("flags near-duplicates of recent group messages", () => {
    const r = validateConversation(ok, { ...base, recent: ["kumain ka na?"] });
    expect(codes(r)).toContain("repetition");
  });
});

describe("tolerant model JSON", () => {
  it("repairs the invalid escapes, trailing commas and raw newlines that free models emit", () => {
    const bad = `Here you go:\n{"messages":[{"speaker":"Jen","text":"hindi ko alam, di ko pa napanood\'yan"},{"speaker":"Rodel","text":"line one\nline two"},]}`;
    const out = parseConversationJson(bad);
    expect(out).toHaveLength(2);
    expect(out[0].text).toContain("napanood'yan");
  });
  it("still rejects replies with no JSON object at all", () => {
    expect(() => parseConversationJson("sorry, I cannot do that")).toThrow();
  });
});
