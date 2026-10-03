import { expect, test, type Page } from "@playwright/test";
import { createTempGroup, deleteGroup, E2E_PREFIX } from "./helpers";

type ScheduleView = {
  schedule: {
    id: string;
    groupName: string;
    enabled: boolean;
    weeklyPattern: Record<string, { type: string }>;
    dateOverrides: Record<string, { type: string }>;
  };
};
const views = async (page: Page) =>
  (await (await page.request.get("/api/schedules")).json()) as ScheduleView[];

test.describe("scheduler", () => {
  let id = "";
  const label = `sched-${Date.now()}`;
  const name = `${E2E_PREFIX}${label}`;

  test.beforeAll(async ({ request }) => {
    id = (await createTempGroup(request, label, { automationEnabled: false })).id;
  });
  test.afterAll(async ({ request }) => {
    await deleteGroup(request, id);
  });

  test("nothing runs by default: an empty duty calendar is called out", async ({ page }) => {
    await page.goto("/automation/scheduler");
    const card = page.locator('[data-slot="card"]').filter({ hasText: name }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText(/No shifts are set, so nothing will run/)).toBeVisible();
    await expect(card.getByText("Off duty")).toBeVisible();
    const v = (await views(page)).find((x) => x.schedule.groupName === name)!;
    expect(v.schedule.enabled).toBe(false);
    expect(v.schedule.weeklyPattern).toEqual({});
  });

  test("the schedule cannot be enabled while the group's automation is off", async ({ page }) => {
    await page.goto("/automation/scheduler");
    const card = page.locator('[data-slot="card"]').filter({ hasText: name }).first();
    await card.getByRole("switch", { name: "Enable schedule" }).click();
    await expect(page.getByText(/Turn on Automation for this group/).first()).toBeVisible();
    const v = (await views(page)).find((x) => x.schedule.groupName === name)!;
    expect(v.schedule.enabled).toBe(false);
  });

  test("a night shift and a date override are saved and survive a reload", async ({ page }) => {
    await page.goto("/automation/scheduler");
    const card = page.locator('[data-slot="card"]').filter({ hasText: name }).first();

    await card.getByRole("combobox", { name: "Monday shift" }).click();
    await page.getByRole("option", { name: /Night shift/ }).click();
    await card.getByRole("combobox", { name: "Tuesday shift" }).click();
    await page.getByRole("option", { name: /Day shift/ }).click();

    await card.getByLabel("New override date").fill("2031-01-15");
    await card.getByRole("button", { name: "Add date" }).click();
    await card.getByRole("button", { name: "Save duty calendar" }).click();

    await expect
      .poll(async () => {
        const v = (await views(page)).find((x) => x.schedule.groupName === name)!;
        return `${v.schedule.weeklyPattern["1"]?.type}|${v.schedule.weeklyPattern["2"]?.type}|${v.schedule.dateOverrides["2031-01-15"]?.type}`;
      })
      .toBe("NIGHT|DAY|OFF");

    await page.reload();
    const again = page.locator('[data-slot="card"]').filter({ hasText: name }).first();
    await expect(again.getByRole("combobox", { name: "Monday shift" })).toContainText(
      "Night shift",
    );
  });

  test("volume settings are validated and capped", async ({ page }) => {
    await page.goto("/automation/scheduler");
    const card = page.locator('[data-slot="card"]').filter({ hasText: name }).first();
    const quota = card.getByLabel("Messages per account per 12h shift");
    await quota.fill("5000");
    await card.getByRole("button", { name: "Save volume settings" }).click();
    await expect(page.getByText(/Too big|less than or equal to 1000|<=1000/).first()).toBeVisible();
    await quota.fill("400");
    await expect(card.getByText(/very high volume/)).toBeVisible();
  });
});

test.describe("history", () => {
  test("conversation search reports when nothing matches", async ({ page }) => {
    await page.goto("/history/conversations");
    await page.getByPlaceholder("Search topic or message text…").fill("zzzz-no-such-text-zzzz");
    await expect(page.getByText("No conversations match.")).toBeVisible();
  });

  test("message search treats % as a literal character, not a wildcard", async ({ page }) => {
    await page.goto("/history/messages");
    await page.getByPlaceholder("Search message text…").fill("%zzzz-no-such-zzzz%");
    await expect(page.getByText("No messages match.")).toBeVisible();
  });

  test("the logs page lists events and filters by level", async ({ page }) => {
    await page.goto("/automation/logs");
    await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
    await page.getByRole("combobox", { name: "Any level" }).click();
    await page.getByRole("option", { name: "error" }).click();
    await expect(page.getByText(/No log entries match|error/).first()).toBeVisible();
  });
});

test.describe("knowledge and topics", () => {
  test("the knowledge page states that only confirmed facts are used", async ({ page }) => {
    await page.goto("/content/knowledge");
    await expect(page.getByText("The AI only uses Confirmed facts")).toBeVisible();
    await page.getByRole("tab", { name: "Sources" }).click();
    await expect(page.getByText("https://www.laki.ph/")).toBeVisible();
  });

  test.describe("topics", () => {
    // A temporary topic, so these tests can never change one of the real topics.
    let topicId = "";
    const title = `${E2E_PREFIX}topic-${Date.now()}`;

    test.beforeAll(async ({ request }) => {
      const { categories } = await (await request.get("/api/topics")).json();
      const res = await request.post("/api/topics", {
        data: {
          categoryId: categories[0].id,
          title,
          description: "e2e description",
          promptSeed: "e2e seed",
          priority: 2,
          cooldownMinutes: 720,
        },
      });
      topicId = (await res.json()).id;
    });
    test.afterAll(async ({ request }) => {
      if (topicId) await request.delete(`/api/topics/${topicId}`);
    });

    const fetchTopic = async (page: Page) =>
      (
        (await (await page.request.get("/api/topics")).json()).topics as {
          id: string;
          active: boolean;
          priority: number;
          cooldownMinutes: number;
          description: string;
          promptSeed: string;
        }[]
      ).find((t) => t.id === topicId)!;

    test("the topic form validates before saving", async ({ page }) => {
      await page.goto("/content/topics");
      await page.getByRole("button", { name: "New topic" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.locator(".text-destructive").first()).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
    });

    test("toggling a topic off and on changes only its active flag (regression)", async ({
      page,
    }) => {
      await page.goto("/content/topics");
      const row = page.getByRole("row").filter({ hasText: title });
      const sw = row.getByRole("switch");
      await expect(sw).toBeChecked();

      await sw.click();
      await expect(sw).not.toBeChecked(); // wait for the UI to reflect the saved state before clicking again
      expect((await fetchTopic(page)).active).toBe(false);

      await sw.click();
      await expect(sw).toBeChecked();
      const after = await fetchTopic(page);
      expect(after.active).toBe(true);
      expect([after.priority, after.cooldownMinutes, after.description, after.promptSeed]).toEqual([
        2,
        720,
        "e2e description",
        "e2e seed",
      ]);
    });
  });
});
