import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "./helpers";

test.describe("telegram accounts", () => {
  test("lists the connected accounts and never exposes session data", async ({ page }) => {
    const responses: string[] = [];
    page.on("response", async (r) => {
      if (r.url().includes("/api/telegram/accounts") && r.request().method() === "GET")
        responses.push(await r.text());
    });
    await page.goto("/telegram/accounts");
    await expect(page.getByRole("heading", { name: "Telegram Accounts" })).toBeVisible();
    await expect(page.getByText("Connected", { exact: true }).first()).toBeVisible();
    await expect.poll(() => responses.length).toBeGreaterThan(0);
    for (const body of responses) {
      expect(body).not.toContain("encryptedSession");
      expect(body).not.toMatch(/v1\.[A-Za-z0-9_-]{20,}/);
    }
  });

  test("the add-account form validates before anything is created", async ({ page }) => {
    await page.goto("/telegram/accounts");
    await page.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Telegram username").fill("ab");
    await page.getByLabel("Phone (optional)").fill("12345");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Telegram usernames are 5-32 letters, digits or _")).toBeVisible();
    await expect(page.getByText("Use international format, e.g. +639171234567")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("personas", () => {
  const name = `${E2E_PREFIX}persona-${Date.now()}`;

  test("create, toggle without losing the profile, edit, delete", async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    await page.goto("/ai/personas");

    // validation
    await page.getByRole("button", { name: "New persona" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".text-destructive").first()).toBeVisible();

    // create with a real profile
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Personality").fill("Mahilig magbiro at madaldal");
    await page.getByLabel(/^Interests/).fill("basketball\nkape");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(name)).toBeVisible();

    // REGRESSION: flipping Active used to reset the whole profile to defaults.
    await page.getByRole("switch", { name: `Toggle ${name} active` }).click();
    await expect
      .poll(async () => {
        const list = (await (await page.request.get("/api/personas")).json()) as {
          name: string;
          active: boolean;
          personality: string;
          interests: string[];
        }[];
        const p = list.find((x) => x.name === name)!;
        return `${p.active}|${p.personality}|${p.interests.join(",")}`;
      })
      .toBe("false|Mahilig magbiro at madaldal|basketball,kape");

    // edit through the UI and confirm the other fields survive
    await page.getByRole("button", { name: "Edit" }).last().click();
    await expect(page.getByLabel("Personality")).toHaveValue("Mahilig magbiro at madaldal");
    await page.getByLabel("Personality").fill("Seryoso na ngayon");
    await page.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(async () => {
        const list = (await (await page.request.get("/api/personas")).json()) as {
          name: string;
          personality: string;
          interests: string[];
        }[];
        const p = list.find((x) => x.name === name)!;
        return `${p.personality}|${p.interests.join(",")}`;
      })
      .toBe("Seryoso na ngayon|basketball,kape");

    // delete
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test.afterAll(async ({ request }) => {
    const list = (await (await request.get("/api/personas")).json()) as {
      id: string;
      name: string;
    }[];
    for (const p of list.filter((x) => x.name === name))
      await request.delete(`/api/personas/${p.id}`);
  });
});
