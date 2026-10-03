import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { adminClient, AUTH_FILE, CRED_FILE, sql } from "./helpers";

/**
 * 1. Remember the automation state (a test presses STOP ALL; teardown puts it back).
 * 2. Create a throwaway dashboard user.
 * 3. Sign in once through the real login form and save the session for all tests.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync("tests/e2e/.auth", { recursive: true });

  const db = sql();
  const [state] = await db`select state from automation_state where id = 1`;
  await db.end();

  const email = `lakiph-e2e-${Date.now()}@example.com`;
  const password = `E2e-${Math.random().toString(36).slice(2)}-Aa1!`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Could not create the e2e test user: ${error?.message}`);
  writeFileSync(
    CRED_FILE,
    JSON.stringify({
      userId: data.user.id,
      email,
      password,
      automationState: state?.state ?? "STOPPED",
    }),
  );

  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch({ channel: config.projects[0].use.channel });
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 });
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}
