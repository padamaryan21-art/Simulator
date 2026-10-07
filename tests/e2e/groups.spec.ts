import { expect, test, type Page } from "@playwright/test";
import { createTempGroup, deleteGroup, E2E_PREFIX } from "./helpers";

const card = (page: Page, text: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: text }).first();

type ApiGroup = {
  id: string;
  name: string;
  purpose: string;
  active: boolean;
  automationEnabled: boolean;
  participantIds: string[];
};
const getGroup = async (page: Page, id: string) =>
  ((await (await page.request.get("/api/groups")).json()) as ApiGroup[]).find((g) => g.id === id)!;

test("the real community is flagged, locked, and cannot be automated from the UI", async ({
  page,
}) => {
  await page.goto("/telegram/groups");
  const real = card(page, "AllYono Community");
  await expect(real.getByText("REAL COMMUNITY").first()).toBeVisible();
  await expect(real.getByText("Messages require human approval before sending.")).toBeVisible();
  await expect(real.getByRole("switch", { name: /Automation/ })).toBeDisabled();
});

test("choosing the real-community type in the add dialog shows the warning", async ({ page }) => {
  await page.goto("/telegram/groups");
  await page.getByRole("button", { name: "Add group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "REAL COMMUNITY" }).click();
  await expect(dialog.getByText("Messages require human approval before sending.")).toBeVisible();
});

test.describe("a private group", () => {
  let id = "";
  const name = `${E2E_PREFIX}groups-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    id = (await createTempGroup(request, name.replace(E2E_PREFIX, ""))).id;
  });
  test.afterAll(async ({ request }) => {
    await deleteGroup(request, id);
  });

  test("flipping Active and Automation keeps participants and purpose (regression)", async ({
    page,
  }) => {
    const before = await getGroup(page, id);
    expect(before.participantIds.length).toBeGreaterThan(1);

    await page.goto("/telegram/groups");
    const c = card(page, name);
    await c.getByRole("switch", { name: "Active" }).click();
    await expect.poll(async () => (await getGroup(page, id)).active).toBe(false);
    await c.getByRole("switch", { name: /Automation/ }).click();
    await expect.poll(async () => (await getGroup(page, id)).automationEnabled).toBe(true);

    const after = await getGroup(page, id);
    expect(after.participantIds.sort()).toEqual(before.participantIds.sort());
    expect(after.purpose).toBe("e2e test group");
  });

  test("the edit dialog changes the name and participants and nothing else", async ({ page }) => {
    const before = await getGroup(page, id);
    await page.goto("/telegram/groups");
    await card(page, name).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(`${name}-renamed`);
    // untick one participant
    await dialog.getByRole("checkbox").first().click();
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect.poll(async () => (await getGroup(page, id)).name).toBe(`${name}-renamed`);
    const after = await getGroup(page, id);
    expect(after.participantIds.length).toBe(before.participantIds.length - 1);
    expect(after.purpose).toBe(before.purpose);
    expect(after.automationEnabled).toBe(before.automationEnabled);
  });
});

test("a group that still has conversation history is not deleted, and says why", async ({
  request,
}) => {
  const group = await createTempGroup(request, `delete-${Date.now()}`);
  const personas = (await (await request.get("/api/personas")).json()) as { id: string }[];
  const lines = Array.from({ length: 4 }, (_, i) => ({
    personaId: personas[i % 2].id,
    text: `E2E linya ${i}`,
  }));
  await request.post("/api/imports/commit", {
    data: { groupId: group.id, conversations: [{ title: "E2E delete test", messages: lines }] },
  });

  const refused = await request.delete(`/api/groups/${group.id}`);
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toMatch(/still has 1 conversation in History/);

  // Once its history is removed, the group can go.
  const sessions = (await (await request.get("/api/history/sessions?pageSize=100")).json())
    .rows as { id: string; groupId: string }[];
  const mine = sessions.filter((s) => s.groupId === group.id).map((s) => s.id);
  await request.post("/api/history/sessions/delete", { data: { ids: mine } });
  const ok = await request.delete(`/api/groups/${group.id}`);
  expect(ok.status()).toBe(200);
  const left = (await (await request.get("/api/groups")).json()) as { id: string }[];
  expect(left.some((g) => g.id === group.id)).toBe(false);
});
