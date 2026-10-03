import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { adminClient, CRED_FILE } from "./helpers";

const creds = () =>
  JSON.parse(readFileSync(CRED_FILE, "utf8")) as { email: string; password: string };

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every dashboard page redirects to the login form", async ({ page }) => {
    for (const path of [
      "/",
      "/telegram/accounts",
      "/ai/simulator",
      "/automation/scheduler",
      "/settings",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("API calls without a session are refused and return no data", async ({ request }) => {
    const res = await request.get("/api/personas", { maxRedirects: 0 });
    // The proxy redirects page-style requests; either that or a 401 is acceptable, a 200 with data is not.
    expect([307, 308, 401]).toContain(res.status());
    for (const path of ["/api/groups", "/api/telegram/accounts", "/api/queue", "/api/knowledge"]) {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status(), path).not.toBe(200);
    }
  });

  test("a wrong password shows an error and does not sign in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(creds().email);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("the login form validates before submitting", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email")).toBeVisible();
  });

  test("an open-redirect attempt through ?next= is ignored after sign-in", async ({ page }) => {
    await page.goto("/login?next=https://evil.example/steal");
    await page.getByLabel("Email").fill(creds().email);
    await page.getByLabel("Password").fill(creds().password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => u.hostname === "localhost");
    expect(new URL(page.url()).hostname).toBe("localhost");
  });

  test("responses carry the security headers", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("signed in", () => {
  test("a cross-site write is blocked even with a valid session", async ({ request }) => {
    const res = await request.post("/api/groups", {
      headers: { Origin: "https://evil.example" },
      data: { name: "ZZ-E2E-should-not-exist", type: "PRIVATE_SIMULATION" },
    });
    expect(res.status()).toBe(403);
    const groups = await (await request.get("/api/groups")).json();
    expect(groups.some((g: { name: string }) => g.name === "ZZ-E2E-should-not-exist")).toBe(false);
  });

  test("a same-origin write is accepted (sanity check for the rule above)", async ({ request }) => {
    const res = await request.post("/api/groups", {
      headers: { Origin: "http://localhost:3100" },
      data: { name: "ZZ-E2E-origin-ok", type: "PRIVATE_SIMULATION", participantIds: [] },
    });
    expect(res.status()).toBe(200);
    const g = await res.json();
    expect((await request.delete(`/api/groups/${g.id}`)).status()).toBe(200);
  });

  test("the real community cannot be created with automation on or approval off", async ({
    request,
  }) => {
    for (const bad of [{ automationEnabled: true }, { requiresApproval: false }]) {
      const res = await request.post("/api/groups", {
        data: { name: "ZZ-E2E-real-bad", type: "REAL_COMMUNITY", participantIds: [], ...bad },
      });
      expect(res.status()).toBe(400);
    }
  });

  test("invalid input is rejected with a clear message, not a server error", async ({
    request,
  }) => {
    const res = await request.patch("/api/personas/not-a-uuid", { data: { active: false } });
    expect(res.status()).toBe(400);
    const res2 = await request.post("/api/conversations", { data: { groupId: "nope" } });
    expect(res2.status()).toBe(400);
  });

  test("signing out ends the session (uses its own user: sign-out is global and would kill the shared login)", async ({
    browser,
  }) => {
    const admin = adminClient();
    const email = `lakiph-e2e-signout-${Date.now()}@example.com`;
    const password = `E2e-${Math.random().toString(36).slice(2)}-Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
        timeout: 60_000,
      });
      await page.getByRole("button", { name: "Logout" }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.goto("/telegram/accounts");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
      await admin.auth.admin.deleteUser(data.user!.id);
    }
  });
});
