import { describe, expect, it } from "vitest";
import {
  RuleError,
  assertMessageSendable,
  assertModeAllowed,
  pickDelaySeconds,
} from "@/server/conversations/rules";

const approved = { status: "APPROVED", approvedBy: "user-1", approvedAt: new Date() };

describe("assertModeAllowed", () => {
  const priv = { type: "PRIVATE_SIMULATION" as const, automationEnabled: true };
  it("allows automatic for an enabled private group while running", () => {
    expect(() => assertModeAllowed("AUTOMATIC", priv, "RUNNING")).not.toThrow();
  });
  it("blocks automatic for the real community, always", () => {
    const real = { type: "REAL_COMMUNITY" as const, automationEnabled: true };
    expect(() => assertModeAllowed("AUTOMATIC", real, "RUNNING")).toThrow(RuleError);
  });
  it("blocks automatic when stopped or paused or group automation off", () => {
    expect(() => assertModeAllowed("AUTOMATIC", priv, "STOPPED")).toThrow(RuleError);
    expect(() => assertModeAllowed("AUTOMATIC", priv, "PAUSED")).toThrow(RuleError);
    expect(() =>
      assertModeAllowed("AUTOMATIC", { ...priv, automationEnabled: false }, "RUNNING"),
    ).toThrow(RuleError);
  });
  it("never restricts manual/preview", () => {
    const real = { type: "REAL_COMMUNITY" as const, automationEnabled: false };
    expect(() => assertModeAllowed("MANUAL", real, "STOPPED")).not.toThrow();
  });
});

describe("assertMessageSendable", () => {
  const ctx = {
    environment: "REAL_COMMUNITY" as const,
    mode: "MANUAL" as const,
    automation: "STOPPED" as const,
  };
  it("sends a human-approved real-community message", () => {
    expect(() => assertMessageSendable(approved, ctx)).not.toThrow();
  });
  it("refuses real-community messages without a named approver", () => {
    expect(() => assertMessageSendable({ ...approved, approvedBy: null }, ctx)).toThrow(RuleError);
  });
  it("refuses unapproved, edited or skipped messages", () => {
    for (const status of ["GENERATED", "EDITED", "SKIPPED", "CANCELLED"]) {
      expect(() => assertMessageSendable({ ...approved, status }, ctx)).toThrow(RuleError);
    }
  });
  it("refuses anything in preview mode", () => {
    expect(() => assertMessageSendable(approved, { ...ctx, mode: "PREVIEW" })).toThrow(RuleError);
  });
  it("refuses real community in automatic mode even if approved", () => {
    expect(() =>
      assertMessageSendable(approved, { ...ctx, mode: "AUTOMATIC", automation: "RUNNING" }),
    ).toThrow(RuleError);
  });
  it("blocks automatic private sends when automation is not running", () => {
    const c = { environment: "PRIVATE_SIMULATION" as const, mode: "AUTOMATIC" as const };
    expect(() =>
      assertMessageSendable({ ...approved, approvedBy: null }, { ...c, automation: "RUNNING" }),
    ).not.toThrow();
    expect(() =>
      assertMessageSendable({ ...approved, approvedBy: null }, { ...c, automation: "STOPPED" }),
    ).toThrow(RuleError);
  });
});

describe("pickDelaySeconds", () => {
  it("stays within range plus typing allowance and is 0 when disabled", () => {
    expect(pickDelaySeconds({ minDelaySec: 0, maxDelaySec: 0 }, 500)).toBe(0);
    const d = pickDelaySeconds({ minDelaySec: 5, maxDelaySec: 10 }, 0, () => 0);
    expect(d).toBe(5);
  });
});
