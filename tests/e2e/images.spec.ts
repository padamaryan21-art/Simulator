import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { createTempGroup, deleteGroup, E2E_PREFIX } from "./helpers";

let seed = 0;
const jpeg = (label: string) =>
  sharp({
    create: {
      width: 480,
      height: 320,
      channels: 3,
      background: { r: (seed += 53) % 256, g: (seed * 3) % 256, b: (seed * 7) % 256 },
    },
  })
    .jpeg()
    .toBuffer()
    .then((b) => ({ name: `${E2E_PREFIX}${label}.jpg`, mimeType: "image/jpeg", buffer: b }));

type Img = {
  id: string;
  filename: string;
  status: string;
  topicId: string | null;
  personaId: string | null;
  caption: string;
  enabled: boolean;
};
const library = async (request: APIRequestContext) =>
  ((await (await request.get("/api/images")).json()) as Img[]).filter((i) =>
    i.filename.startsWith(E2E_PREFIX),
  );

test.describe("image library", () => {
  let topicId = "";
  let topicTitle = "";
  let personaId = "";
  let personaName = "";

  test.beforeAll(async ({ request }) => {
    const { categories } = await (await request.get("/api/topics")).json();
    topicTitle = `${E2E_PREFIX}topic-${Date.now()}`;
    topicId = (
      await (
        await request.post("/api/topics", {
          data: { categoryId: categories[0].id, title: topicTitle },
        })
      ).json()
    ).id;
    const p = (
      (await (await request.get("/api/personas")).json()) as { id: string; name: string }[]
    )[0];
    personaId = p.id;
    personaName = p.name;
  });

  test.afterAll(async ({ request }) => {
    for (const i of await library(request)) {
      await request.post(`/api/images/${i.id}/reset`); // free any draft holding it first
      await request.delete(`/api/images/${i.id}`);
    }
    await request.delete(`/api/topics/${topicId}`);
  });

  const choose = async (page: Page, label: string, option: string) => {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };

  test("upload with a topic and sender, refuse duplicates, bad captions and fake files; edit, disable, delete", async ({
    page,
    request,
  }) => {
    await page.goto("/content/images");
    await expect(page.getByText("How pictures are used")).toBeVisible();

    const first = await jpeg("one");
    await choose(page, "Topic for new pictures", topicTitle);
    await choose(page, "Persona for new pictures", personaName);
    await page.getByLabel("Pictures to upload").setInputFiles([first, await jpeg("two")]);
    await page.getByRole("button", { name: /Upload 2 picture/ }).click();
    await expect(page.getByText("Uploaded 2 picture(s)").first()).toBeVisible();

    const imgs = await library(request);
    expect(imgs).toHaveLength(2);
    expect(
      imgs.every(
        (i) => i.status === "AVAILABLE" && i.topicId === topicId && i.personaId === personaId,
      ),
    ).toBe(true);

    // The library lists newest first, so look the picture up by name rather than by position.
    const one = imgs.find((i) => i.filename === `${E2E_PREFIX}one.jpg`)!;

    // the identical picture again is refused
    await page
      .getByLabel("Pictures to upload")
      .setInputFiles([{ ...first, name: `${E2E_PREFIX}one-again.jpg` }]);
    await page.getByRole("button", { name: /Upload 1 picture/ }).click();
    await expect(page.getByText(/already in the library/).first()).toBeVisible();
    expect(await library(request)).toHaveLength(2);

    // a disguised file is refused by its contents
    await page.getByLabel("Pictures to upload").setInputFiles([
      {
        name: `${E2E_PREFIX}fake.jpg`,
        mimeType: "image/jpeg",
        buffer: Buffer.from("definitely not a picture"),
      },
    ]);
    await page.getByRole("button", { name: /Upload 1 picture/ }).click();
    await expect(page.getByText(/Only JPG or PNG pictures are accepted/).first()).toBeVisible();

    // captions with winning claims are refused by the server
    const bad = await request.patch(`/api/images/${one.id}`, {
      data: { caption: "Nanalo ako ng 50,000 sigurado panalo" },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toMatch(/caption/i);

    // edit the caption inline
    // Find the card by its Delete button (the picture's alt text changes once it has a caption).
    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("button", { name: `Delete ${E2E_PREFIX}one.jpg` }) })
      .first();
    await card.getByLabel("Caption").fill("ayan oh");
    await card.getByLabel("Caption").blur();
    await expect
      .poll(async () => (await library(request)).find((i) => i.id === one.id)!.caption)
      .toBe("ayan oh");

    // disable, then delete
    await card.getByRole("switch", { name: /Enable/ }).click();
    await expect
      .poll(async () => (await library(request)).find((i) => i.id === one.id)!.status)
      .toBe("DISABLED");
    page.on("dialog", (d) => void d.accept());
    await card.getByRole("button", { name: /Delete/ }).click();
    await expect.poll(async () => (await library(request)).length).toBe(1);
  });

  test("the file route is private and only returns pictures to a signed-in user", async ({
    request,
    browser,
  }) => {
    const [img] = await library(request);
    test.skip(!img, "needs the picture left by the previous test");
    const ok = await request.get(`/api/images/${img.id}/file`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/jpeg");
    expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await anon.request.get(`/api/images/${img.id}/file`, { maxRedirects: 0 });
    expect([307, 308, 401]).toContain(res.status());
    await anon.close();
  });
});

test.describe("pictures inside a conversation", () => {
  let groupId = "";
  let topicId = "";
  let sessionId = "";
  let imageId = "";
  let personaId = "";
  const label = `img-conv-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    groupId = (await createTempGroup(request, label)).id;
    const { categories } = await (await request.get("/api/topics")).json();
    topicId = (
      await (
        await request.post("/api/topics", {
          data: { categoryId: categories[0].id, title: `${E2E_PREFIX}topic-conv-${Date.now()}` },
        })
      ).json()
    ).id;
    const personas = (await (await request.get("/api/personas")).json()) as {
      id: string;
      name: string;
    }[];
    personaId = personas[0].id;

    // a ready-made conversation through the import API (no AI needed)
    const lines = Array.from({ length: 6 }, (_, i) => ({
      personaId: personas[i % 2].id,
      text: `E2E linya ${i}`,
    }));
    await request.post("/api/imports/commit", {
      data: { groupId, conversations: [{ title: "E2E image conversation", messages: lines }] },
    });
    const sessions = (await (await request.get("/api/history/sessions?pageSize=100")).json())
      .rows as { id: string; groupId: string }[];
    sessionId = sessions.find((s) => s.groupId === groupId)!.id;

    const up = await request.post("/api/images", {
      multipart: { files: await jpeg("conv"), topicId, personaId, kind: "PHOTO", caption: "" },
    });
    imageId = (await up.json()).results[0].id;
  });

  test.afterAll(async ({ request }) => {
    await request.post("/api/history/sessions/delete", { data: { ids: [sessionId] } });
    await request.post(`/api/images/${imageId}/reset`);
    await request.delete(`/api/images/${imageId}`);
    await request.delete(`/api/topics/${topicId}`);
    await deleteGroup(request, groupId);
  });

  test("attach a picture to its sender's message: shown in the bubble, approval revoked, nothing sent", async ({
    page,
    request,
  }) => {
    await page.goto(`/ai/simulator/${sessionId}`);
    await page.getByRole("button", { name: "Enable sending" }).click();
    await page.getByRole("button", { name: /Approve all/ }).click();
    await expect(page.getByText(/6 approved/)).toBeVisible();

    // Attach to the first message (written by the image's persona).
    await page.getByRole("button", { name: "Attach image" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`Attach ${E2E_PREFIX}conv`) }).click();
    await expect(page.getByText("Picture attached").first()).toBeVisible();

    await expect(page.locator(`img[src="/api/images/${imageId}/file"]`)).toBeVisible();
    await expect(page.getByText(/5 approved/)).toBeVisible(); // editing revoked that message's approval
    await expect(page.getByText("Edited · needs approval")).toBeVisible();

    const img = (await library(request)).find((i) => i.id === imageId)!;
    expect(img.status).toBe("RESERVED"); // held by this draft, so no other conversation can take it

    // Remove it again: the picture is free for others.
    await page.getByRole("button", { name: "Remove image" }).first().click();
    await expect
      .poll(async () => (await library(request)).find((i) => i.id === imageId)!.status)
      .toBe("AVAILABLE");

    const detail = await (await request.get(`/api/conversations/${sessionId}`)).json();
    expect(detail.messages.filter((m: { status: string }) => m.status === "SENT")).toHaveLength(0);
  });

  test("a picture cannot be attached to another persona's message", async ({ request }) => {
    const detail = await (await request.get(`/api/conversations/${sessionId}`)).json();
    const other = detail.messages.find((m: { personaId: string }) => m.personaId !== personaId);
    const res = await request.patch(`/api/conversation-messages/${other.id}`, {
      data: { imageId },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/belongs to/);
  });
});
