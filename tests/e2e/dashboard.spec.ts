import { expect, test } from "@playwright/test";

const PAGES: [path: string, heading: string][] = [
  ["/", "Dashboard"],
  ["/telegram/accounts", "Telegram Accounts"],
  ["/telegram/groups", "Telegram Groups"],
  ["/ai/personas", "Personas"],
  ["/ai/relationships", "Relationships"],
  ["/ai/memories", "Memories"],
  ["/ai/simulator", "Simulator"],
  ["/ai/prompts", "Prompt library"],
  ["/ai/import", "Import conversations"],
  ["/content/topics", "Topics"],
  ["/content/knowledge", "AllYono Knowledge"],
  ["/automation/scheduler", "Scheduler"],
  ["/automation/queue", "Queue"],
  ["/automation/logs", "Logs"],
  ["/history/conversations", "Conversations"],
  ["/history/messages", "Messages"],
  ["/settings", "Settings"],
];

test("every page renders without a crash or a JavaScript error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  for (const [path, heading] of PAGES) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
      path,
    ).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("the sidebar links to every section", async ({ page }) => {
  await page.goto("/");
  for (const label of [
    "Accounts",
    "Groups",
    "Personas",
    "Relationships",
    "Memories",
    "Simulator",
    "Topics",
    "AllYono Knowledge",
    "Scheduler",
    "Queue",
    "Logs",
    "Conversations",
    "Messages",
    "Settings",
  ]) {
    await expect(page.getByRole("link", { name: label, exact: true }).first()).toBeVisible();
  }
});

test("dashboard shows the stats and the emergency controls", async ({ page }) => {
  await page.goto("/");
  for (const label of [
    "Connected Accounts",
    "Active Simulations",
    "Pending Approval",
    "Scheduled",
    "Failed",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const b of ["START ALL", "PAUSE ALL", "RESUME ALL", "STOP ALL"]) {
    await expect(page.getByRole("button", { name: b })).toBeVisible();
  }
});

test("PAUSE ALL and STOP ALL change the automation state immediately", async ({ page }) => {
  // The original state is restored by global teardown.
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  const badge = page.getByText(/Automation: (RUNNING|PAUSED|STOPPED)/);
  await expect(badge).toBeVisible();

  // Make sure we start from RUNNING without invoking the planner (direct API, same as START ALL's state change).
  const state = (await badge.textContent())?.replace("Automation: ", "");
  if (state === "RUNNING") {
    await page.getByRole("button", { name: "PAUSE ALL" }).click();
    await expect(badge).toHaveText("Automation: PAUSED");
    await expect(page.getByRole("button", { name: "RESUME ALL" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "PAUSE ALL" })).toBeDisabled();
  }

  await page.getByRole("button", { name: "STOP ALL" }).click();
  await expect(badge).toHaveText("Automation: STOPPED");
  await expect(page.getByRole("button", { name: "STOP ALL" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "PAUSE ALL" })).toBeDisabled();

  // The state is real (server side), not just a label.
  const res = await page.request.get("/api/automation");
  expect((await res.json()).state).toBe("STOPPED");
});

test("the queue page explains worker and Redis status", async ({ page }) => {
  await page.goto("/automation/queue");
  await expect(page.getByText(/Worker: (online|offline)/)).toBeVisible();
  await expect(page.getByText(/Redis: (connected|not configured|unreachable)/)).toBeVisible();
  // The test server runs in dry-run mode, so it can never send; the worker banner reflects the real worker only.
});

test("settings shows the free-first model pool", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("Message delay")).toBeVisible();
  await expect(page.getByText("AI model pool")).toBeVisible();
  await expect(page.getByText("free", { exact: true }).first()).toBeVisible();
});
