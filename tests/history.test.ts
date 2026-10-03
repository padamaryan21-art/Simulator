import { describe, expect, it } from "vitest";
import {
  deleteSessionsSchema,
  logSearchSchema,
  messageSearchSchema,
  sessionSearchSchema,
} from "@/validators/history";

describe("history search validation", () => {
  it("applies paging defaults and coerces query-string numbers", () => {
    const r = sessionSearchSchema.parse({ page: "3", pageSize: "50" });
    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(50);
    expect(sessionSearchSchema.parse({}).pageSize).toBe(25);
  });

  it("treats empty filter values as unset", () => {
    const r = sessionSearchSchema.parse({
      q: "",
      groupId: "",
      status: "",
      mode: "",
      from: "",
      to: "",
    });
    expect(r.q).toBeUndefined();
    expect(r.groupId).toBeUndefined();
    expect(r.status).toBeUndefined();
    expect(r.from).toBeUndefined();
  });

  it("rejects unknown enum values, bad dates, bad ids and oversized pages", () => {
    expect(sessionSearchSchema.safeParse({ status: "DONE" }).success).toBe(false);
    expect(sessionSearchSchema.safeParse({ from: "01/02/2026" }).success).toBe(false);
    expect(messageSearchSchema.safeParse({ personaId: "not-a-uuid" }).success).toBe(false);
    expect(logSearchSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
    expect(logSearchSchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("accepts valid filters", () => {
    const r = messageSearchSchema.safeParse({
      q: "adobo",
      status: "SENT",
      from: "2026-10-01",
      to: "2026-10-03",
      personaId: "7f0f7e0e-5f4d-4c68-8f0c-5f9c3d9a1b2c",
    });
    expect(r.success).toBe(true);
  });
});

describe("deleteSessionsSchema", () => {
  it("requires 1-500 valid ids", () => {
    expect(deleteSessionsSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(deleteSessionsSchema.safeParse({ ids: ["x"] }).success).toBe(false);
    const id = "7f0f7e0e-5f4d-4c68-8f0c-5f9c3d9a1b2c";
    expect(deleteSessionsSchema.safeParse({ ids: [id] }).success).toBe(true);
    expect(deleteSessionsSchema.safeParse({ ids: Array(501).fill(id) }).success).toBe(false);
  });
});
