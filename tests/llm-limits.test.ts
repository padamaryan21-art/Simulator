import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  cooldownFor,
  describeFailure,
  parseTryAgainMs,
} from "@/server/llm/limits";

describe("classifyFailure", () => {
  it("recognises missing credit before generic rate limits", () => {
    expect(classifyFailure(429, "You have no credits remaining. Add credits")).toBe("no_credit");
    expect(
      classifyFailure(429, "You exceeded your current quota, check your plan and billing"),
    ).toBe("no_credit");
    expect(classifyFailure(402, "Payment required")).toBe("no_credit");
  });
  it("recognises rate limits from status or text", () => {
    expect(classifyFailure(429, "anything")).toBe("rate_limit");
    expect(classifyFailure(400, "Rate limit exceeded: free-models-per-day")).toBe("rate_limit");
  });
  it("leaves everything else as ordinary errors", () => {
    expect(classifyFailure(500, "internal error")).toBe("other");
    expect(classifyFailure(400, "invalid request")).toBe("other");
  });
});

describe("parseTryAgainMs", () => {
  it("parses Groq-style durations", () => {
    expect(parseTryAgainMs("Please try again in 6m57.6s.")).toBe(417_600);
    expect(parseTryAgainMs("try again in 12s")).toBe(12_000);
    expect(parseTryAgainMs("try again in 1h2m")).toBe(3_720_000);
  });
  it("returns null when there is no hint", () => {
    expect(parseTryAgainMs("nothing to see")).toBeNull();
  });
});

describe("cooldownFor", () => {
  it("leaves daily limits and missing credit alone for an hour", () => {
    expect(cooldownFor("rate_limit", "Rate limit exceeded: free-models-per-day")).toBe(3_600_000);
    expect(cooldownFor("no_credit", "no credits")).toBe(3_600_000);
  });
  it("uses the provider's own hint for short limits, with sane bounds", () => {
    expect(cooldownFor("rate_limit", "try again in 40s")).toBe(40_000);
    expect(cooldownFor("rate_limit", "try again in 2s")).toBe(15_000); // never hammer sooner than 15s
    expect(cooldownFor("rate_limit", "try again in 9h")).toBe(3_600_000); // never longer than an hour
    expect(cooldownFor("rate_limit", "slow down", 30)).toBe(30_000); // Retry-After header
    expect(cooldownFor("rate_limit", "slow down")).toBe(60_000);
  });
  it("gives transient errors a brief breather", () => {
    expect(cooldownFor("other", "boom")).toBe(60_000);
  });
});

describe("describeFailure", () => {
  it("produces short reasons for the 'all models unavailable' message", () => {
    expect(describeFailure("no_credit", "", 0)).toBe("no credits");
    expect(describeFailure("rate_limit", "free-models-per-day", 3_600_000)).toBe(
      "daily free limit reached",
    );
    expect(describeFailure("rate_limit", "tokens per minute", 417_600)).toBe(
      "rate-limited, retry in about 7 min",
    );
  });
});
