import { describe, expect, it } from "vitest";
import { normalizeTelegramLink, sameTelegramTarget } from "@/lib/telegram-links";

describe("normalizeTelegramLink", () => {
  it("treats the usual spellings of one link as the same", () => {
    const variants = [
      "https://t.me/+AbCdEf",
      "http://t.me/+abcdef/",
      "https://www.t.me/+AbCdEf?utm=1",
      "t.me/joinchat/AbCdEf",
      "  https://t.me/+ABCDEF#top  ",
    ];
    for (const v of variants) expect(normalizeTelegramLink(v)).toBe("t.me/+abcdef");
  });

  it("returns null for nothing", () => {
    expect(normalizeTelegramLink(null)).toBeNull();
    expect(normalizeTelegramLink("")).toBeNull();
    expect(normalizeTelegramLink("   ")).toBeNull();
  });
});

describe("sameTelegramTarget", () => {
  const real = { url: "https://t.me/LakiPHCommunity", telegramChatId: "2214472402" };

  it("matches by resolved chat id, whatever the link says", () => {
    expect(
      sameTelegramTarget({ url: "https://t.me/+other", telegramChatId: "2214472402" }, real),
    ).toBe(true);
  });

  it("matches by link even before the chat id is resolved", () => {
    expect(sameTelegramTarget({ url: "t.me/lakiphcommunity/", telegramChatId: null }, real)).toBe(
      true,
    );
  });

  it("does not match a different chat", () => {
    expect(
      sameTelegramTarget(
        { url: "https://t.me/+FCH42LUbwP4xODJl", telegramChatId: "5554266979" },
        real,
      ),
    ).toBe(false);
  });

  it("does not match two groups that both have nothing set", () => {
    expect(
      sameTelegramTarget({ url: null, telegramChatId: null }, { url: null, telegramChatId: null }),
    ).toBe(false);
  });

  it("compares chat ids as text, so a number and a string match", () => {
    expect(
      sameTelegramTarget(
        { telegramChatId: 2214472402 as unknown as string },
        { telegramChatId: "2214472402" },
      ),
    ).toBe(true);
  });
});
