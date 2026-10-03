import { expect, test } from "@playwright/test";
import { createTempGroup, deleteGroup, E2E_PREFIX } from "./helpers";

test.describe("simulator", () => {
  test("selecting the real community shows the warning and blocks automatic mode", async ({
    page,
  }) => {
    await page.goto("/ai/simulator");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "LakiPH Community" }).click();
    await expect(page.getByText("Messages require human approval before sending.")).toBeVisible();

    // Mode list: automatic must be disabled for a real community.
    await page.getByRole("combobox").nth(2).click();
    await expect(page.getByRole("option", { name: /Automatic/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test.describe("preview, edit and approval flow", () => {
    test.describe.configure({ retries: 1 }); // free AI models occasionally fail a generation
    let groupId = "";
    const label = `sim-${Date.now()}`;
    const name = `${E2E_PREFIX}${label}`;

    test.beforeAll(async ({ request }) => {
      groupId = (await createTempGroup(request, label, { automationEnabled: false })).id;
    });
    test.afterAll(async ({ request }) => {
      // sessions reference the group, so remove them first
      const sessions = (await (await request.get("/api/history/sessions?pageSize=100")).json())
        .rows as { id: string; groupId: string }[];
      const mine = sessions.filter((s) => s.groupId === groupId).map((s) => s.id);
      if (mine.length) await request.post("/api/history/sessions/delete", { data: { ids: mine } });
      await deleteGroup(request, groupId);
    });

    test("generate a preview, edit, enable sending, approve; approval is revoked by an edit; nothing is sent", async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.goto("/ai/simulator");
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: name }).click();
      await page.getByRole("button", { name: "Generate conversation" }).click();

      // If every free AI model is rate-limited or out of credit, that is an environment limit, not a
      // bug in the app: skip with the real message instead of reporting a false failure.
      const unavailable = page.getByText(/All AI models are unavailable right now/).first();
      const navigated = page
        .waitForURL(/\/ai\/simulator\/[0-9a-f-]{36}/, { timeout: 180_000 })
        .then(() => "ok" as const);
      const blocked = unavailable.waitFor({ timeout: 180_000 }).then(() => "blocked" as const);
      if (
        (await Promise.race([navigated, blocked.catch(() => new Promise<never>(() => {}))])) ===
        "blocked"
      ) {
        test.skip(true, `AI models are rate-limited right now: ${await unavailable.textContent()}`);
      }

      // Generation uses the free AI models and can take a while.
      await page.waitForURL(/\/ai\/simulator\/[0-9a-f-]{36}/, { timeout: 180_000 });
      await expect(page.getByText("Preview only")).toBeVisible();
      const bubbles = page.locator(".rounded-2xl");
      await expect.poll(() => bubbles.count()).toBeGreaterThan(3);

      // Preview mode offers no approve/send controls at all.
      await expect(page.getByRole("button", { name: /Send approved/ })).toHaveCount(0);

      // Edit a message in place.
      await page.getByRole("button", { name: "Edit" }).first().click();
      await page.locator("textarea").first().fill("ZZ-E2E edited by test");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("ZZ-E2E edited by test")).toBeVisible();

      // Switch to manual: now approval exists, but nothing is approved or sent yet.
      await page.getByRole("button", { name: "Enable sending" }).click();
      const total = await bubbles.count();
      await expect(page.getByRole("button", { name: /Send approved \(0\)/ })).toBeDisabled();

      await page.getByRole("button", { name: /Approve all/ }).click();
      await expect(
        page.getByRole("button", { name: new RegExp(`Send approved \\(${total}\\)`) }),
      ).toBeEnabled();
      await expect(page.getByText(`${total} approved`)).toBeVisible();

      // Editing an approved message revokes its approval.
      await page.getByRole("button", { name: "Edit" }).first().click();
      await page.locator("textarea").first().fill("ZZ-E2E changed after approval");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText(`${total - 1} approved`)).toBeVisible();
      await expect(page.getByText("Edited · needs approval")).toBeVisible();

      // Nothing has been sent at any point.
      await expect(page.getByText("0 sent")).toBeVisible();
      const detail = await (
        await page.request.get(`/api/conversations/${page.url().split("/").pop()}`)
      ).json();
      expect(detail.messages.filter((m: { status: string }) => m.status === "SENT")).toHaveLength(
        0,
      );
    });
  });
});
