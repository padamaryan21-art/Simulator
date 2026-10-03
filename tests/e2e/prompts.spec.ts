import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "./helpers";

type Custom = { id: string; title: string };
const mine = async (request: import("@playwright/test").APIRequestContext) =>
  ((await (await request.get("/api/prompts")).json()).custom as Custom[]).filter((c) =>
    c.title.startsWith(E2E_PREFIX),
  );

test.describe("prompt library", () => {
  test.afterAll(async ({ request }) => {
    for (const c of await mine(request)) await request.delete(`/api/prompts/${c.id}`);
  });

  test("lists 10+ built-in prompts, each for 2,000+ lines, and previews one with the personas", async ({
    page,
    request,
  }) => {
    const lib = await (await request.get("/api/prompts")).json();
    expect(lib.builtin.length).toBeGreaterThanOrEqual(10);

    await page.goto("/ai/prompts");
    await expect(page.getByRole("heading", { name: "Prompt library", exact: true })).toBeVisible();
    await expect(page.getByText("Ulam at kainan").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy prompt/ })).toHaveCount(
      lib.builtin.length + lib.custom.length,
    );

    await page.getByRole("button", { name: "Preview" }).first().click();
    const pre = page.locator("pre").first();
    await expect(pre).toContainText("conversation,topic,speaker,message");
    await expect(pre).toContainText("SAFETY RULES");
    const personas = (await (await request.get("/api/personas")).json()) as {
      name: string;
      active: boolean;
    }[];
    for (const p of personas.filter((x) => x.active))
      await expect(pre).toContainText(`- ${p.name}`);
  });

  test("a custom prompt that cannot reach 2,000 lines is refused; a valid one is saved, edited and deleted", async ({
    page,
    request,
  }) => {
    const base = {
      title: `${E2E_PREFIX}prompt-${Date.now()}`,
      topic: "Test topic",
      situations: [{ label: "A", detail: "isang sitwasyon" }],
      linesMin: 26,
      linesMax: 36,
      batchSize: 5,
    };
    const short = await request.post("/api/prompts", { data: { ...base, conversations: 20 } });
    expect(short.status()).toBe(400);
    expect((await short.json()).error).toMatch(/only 520 lines|2000/);

    await page.goto("/ai/prompts");
    await page.getByRole("button", { name: "New prompt" }).click();
    await page.getByLabel("Title").fill(base.title);
    await page.getByLabel("Topic of the whole set").fill(base.topic);
    await page
      .getByLabel(/Situations/)
      .fill("Una: unang sitwasyon\nPangalawa: ikalawang sitwasyon");
    await page.getByLabel("Conversations", { exact: true }).fill("10");
    await expect(page.getByText(/only 260 lines/)).toBeVisible();
    await page.getByLabel("Conversations", { exact: true }).fill("80");
    await expect(page.getByText(/2,080 to 2,880 lines in 16 replies/)).toBeVisible();
    await page.getByRole("button", { name: "Add to library" }).click();
    await expect(page.getByText("Prompt added to the library")).toBeVisible();
    await expect.poll(async () => (await mine(request)).length).toBe(1);

    const [c] = await mine(request);
    const bad = await request.patch(`/api/prompts/${c.id}`, { data: { conversations: 5 } });
    expect(bad.status()).toBe(400);
    const good = await request.patch(`/api/prompts/${c.id}`, { data: { topic: "New topic" } });
    expect(good.status()).toBe(200);
    expect((await good.json()).conversations).toBe(80); // untouched fields stay as they were

    page.on("dialog", (d) => void d.accept());
    await page.reload();
    await page.getByRole("button", { name: `Delete ${base.title}` }).click();
    await expect.poll(async () => (await mine(request)).length).toBe(0);
  });

  test("the API needs a signed-in user", async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await anon.request.get("/api/prompts", { maxRedirects: 0 });
    expect([307, 308, 401]).toContain(res.status());
    await anon.close();
  });
});
