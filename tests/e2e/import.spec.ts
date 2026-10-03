import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { createTempGroup, deleteGroup, E2E_PREFIX } from "./helpers";

async function sheet(rows: string[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Chat");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.describe("import conversations", () => {
  let groupId = "";
  const label = `import-${Date.now()}`;
  const name = `${E2E_PREFIX}${label}`;
  let personaNames: string[] = [];

  test.beforeAll(async ({ request }) => {
    groupId = (await createTempGroup(request, label)).id;
    personaNames = ((await (await request.get("/api/personas")).json()) as { name: string }[]).map(
      (p) => p.name,
    );
  });
  test.afterAll(async ({ request }) => {
    const sessions = (await (await request.get("/api/history/sessions?pageSize=100")).json())
      .rows as { id: string; groupId: string }[];
    const mine = sessions.filter((s) => s.groupId === groupId).map((s) => s.id);
    if (mine.length) await request.post("/api/history/sessions/delete", { data: { ids: mine } });
    await deleteGroup(request, groupId);
  });

  test("upload, match speakers, flag risky lines, import as drafts (nothing is sent)", async ({
    page,
  }) => {
    const [a, b] = personaNames;
    const rows: string[][] = [["conversation", "topic", "speaker", "message"]];
    for (let c = 1; c <= 3; c++) {
      for (let i = 0; i < 8; i++)
        rows.push([
          `C${c}`,
          `E2E topic ${c}`,
          i % 2 ? b : a,
          `E2E linya ${c}-${i} tungkol sa ulam`,
        ]);
    }
    // one risky line in conversation 2
    rows.push(["C2", "E2E topic 2", a, "Nanalo ako ng 50,000 kagabi, sigurado panalo to"]);

    await page.goto("/ai/import");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name }).click();
    await page.getByLabel("Conversation file").setInputFiles({
      name: "e2e-chat.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: await sheet(rows),
    });
    await page.getByRole("button", { name: "Analyze file" }).click();

    // speakers were matched to personas automatically
    // The first preview can wait on a cold dev-server compile of the route, so allow for it.
    await expect(page.getByText("2. Check who is speaking")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/25 lines · 3 conversation\(s\)/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: `Persona for ${a}` })).toContainText(a);
    await expect(page.getByRole("combobox", { name: `Persona for ${b}` })).toContainText(b);

    // content check flags the winning claim and offers to leave it out
    await expect(page.getByText(/claims winning money: 1/)).toBeVisible();
    const leaveOut = page.getByRole("checkbox").first();
    await expect(leaveOut).toBeChecked();
    await expect(
      page.getByText(/24 lines will be imported|3 conversation\(s\) · 24 lines/),
    ).toBeVisible();

    await page.getByRole("button", { name: /Import 3 conversation/ }).click();
    await expect(page.getByText(/Imported 3 conversation\(s\)/).first()).toBeVisible();

    // drafts exist, are marked imported, nothing was sent, and the flagged line was left out
    const sessions = (
      (await (await page.request.get("/api/history/sessions?pageSize=100")).json()).rows as {
        groupId: string;
        source: string;
        mode: string;
        status: string;
        sent: number;
        total: number;
        topicTitle: string;
      }[]
    ).filter((s) => s.groupId === groupId);
    expect(sessions).toHaveLength(3);
    for (const s of sessions) {
      expect([s.source, s.mode, s.status, s.sent]).toEqual(["IMPORTED", "PREVIEW", "DRAFT", 0]);
    }
    expect(sessions.map((s) => s.total).sort()).toEqual([8, 8, 8]);
    const hits = (
      await (
        await page.request.get(
          `/api/history/messages?q=${encodeURIComponent("Nanalo ako ng 50,000")}&groupId=${groupId}`,
        )
      ).json()
    ).total;
    expect(hits).toBe(0);
  });

  test("a file of the wrong type is rejected with a clear message", async ({ page }) => {
    await page.goto("/ai/import");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name }).click();
    await page.getByLabel("Conversation file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Rodel: hi"),
    });
    await page.getByRole("button", { name: "Analyze file" }).click();
    await expect(page.getByText(/Unsupported file type/)).toBeVisible();
    await expect(page.getByText("2. Check who is speaking")).toHaveCount(0);
  });

  test("a renamed file is caught by its contents, not trusted by its name", async ({ page }) => {
    await page.goto("/ai/import");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name }).click();
    await page.getByLabel("Conversation file").setInputFiles({
      name: "fake.xlsx",
      mimeType: "application/vnd.ms-excel",
      buffer: Buffer.from("not a spreadsheet at all"),
    });
    await page.getByRole("button", { name: "Analyze file" }).click();
    await expect(page.getByText(/does not look like a real \.xlsx file/)).toBeVisible();
  });

  test("the template downloads and the AI prompt lists the personas", async ({ page }) => {
    await page.goto("/ai/import");
    const res = await page.request.get("/api/imports/template");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
    await expect(page.getByText("Prompt for the other AI")).toBeVisible();
    const promptBox = page.locator("pre", { hasText: "Write 50 separate casual" });
    await expect(promptBox).toContainText(personaNames[0]);
    await expect(promptBox).toContainText("no promotions");
  });
});
