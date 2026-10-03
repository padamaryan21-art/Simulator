import { afterEach, describe, expect, it } from "vitest";
import { isAdminEmail } from "@/lib/admin";

describe("admin allow-list", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("allows any signed-in user when no list is configured", () => {
    expect(isAdminEmail("someone@example.com")).toBe(true);
  });

  it("allows only listed emails, ignoring case and spaces", () => {
    process.env.ADMIN_EMAILS = " Owner@Example.com , second@example.com ";
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("SECOND@example.com")).toBe(true);
    expect(isAdminEmail("stranger@example.com")).toBe(false);
  });

  it("refuses a missing email when a list is configured", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });
});
