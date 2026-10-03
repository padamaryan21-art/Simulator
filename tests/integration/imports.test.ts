import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupAll, makeGroup } from "./fixtures";

beforeAll(cleanupAll);
afterAll(cleanupAll);

/** Builds a real (text) PDF: Helvetica, ASCII only, 45 lines per page. */
function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 45) pages.push(lines.slice(i, i + 45));
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  for (const pg of pages) {
    const stream = `BT /F1 10 Tf 40 780 Td 14 TL ${pg.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 800] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function xlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Chat");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function setup() {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const personas = await db.select().from(s.personas);
  const g = await makeGroup({
    name: `import-${Math.random().toString(36).slice(2, 7)}`,
    withParticipants: true,
  });
  return { g, personas, db, s };
}

const sessionsOf = async (groupId: string) => {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  return db
    .select()
    .from(s.conversationSessions)
    .where(eq(s.conversationSessions.groupId, groupId));
};

/** Maps each previewed speaker to its matched persona and flattens into a commit payload. */
function toCommit(
  groupId: string,
  preview: Awaited<ReturnType<typeof import("@/server/imports/service").previewImport>>,
  opts: { dropSevere?: boolean } = {},
) {
  const idOf = new Map(preview.speakers.map((sp) => [sp.name, sp.personaId]));
  return {
    groupId,
    conversations: preview.conversations.map((c) => ({
      title: c.title,
      messages: c.lines
        .filter(
          (l) =>
            idOf.get(l.speaker) &&
            !(opts.dropSevere && l.flags?.some((f) => preview.issues.severe.includes(f))),
        )
        .map((l) => ({ personaId: idOf.get(l.speaker)!, text: l.text })),
    })),
  };
}

describe("importing a 2,000+ line conversation file", () => {
  it("imports an Excel file with conversation labels into draft conversations", async () => {
    const { previewImport, commitImport } = await import("@/server/imports/service");
    const { g, personas, db, s } = await setup();
    const names = personas.map((p) => p.name);

    const rows: (string | number)[][] = [["conversation", "topic", "speaker", "message"]];
    for (let c = 1; c <= 70; c++) {
      for (let i = 0; i < 30; i++)
        rows.push([
          `C${c}`,
          `Topic ${c}`,
          names[(c + i) % names.length],
          `Mensahe ${c}-${i} tungkol sa araw ko`,
        ]);
    }
    expect(rows.length - 1).toBe(2100);

    const preview = await previewImport({
      groupId: g.id,
      filename: "chat.xlsx",
      data: await xlsx(rows),
      minSize: 15,
      maxSize: 35,
    });
    expect(preview.kind).toBe("xlsx");
    expect(preview.totalLines).toBe(2100);
    expect(preview.conversationCount).toBe(70);
    expect(preview.speakers).toHaveLength(personas.length);
    expect(preview.speakers.every((sp) => sp.personaId)).toBe(true); // names matched to personas automatically

    const result = await commitImport(
      toCommit(g.id, preview),
      "00000000-0000-0000-0000-000000000001",
    );
    expect(result).toEqual({ conversations: 70, lines: 2100 });

    const sessions = await sessionsOf(g.id);
    expect(sessions).toHaveLength(70);
    for (const sess of sessions) {
      expect([sess.mode, sess.status, sess.source, sess.environment]).toEqual([
        "PREVIEW",
        "DRAFT",
        "IMPORTED",
        "PRIVATE_SIMULATION",
      ]);
    }
    const { eq, asc } = await import("drizzle-orm");
    const first = sessions.find((x) => x.title === "C1")!;
    const msgs = await db
      .select()
      .from(s.conversationMessages)
      .where(eq(s.conversationMessages.sessionId, first.id))
      .orderBy(asc(s.conversationMessages.position));
    expect(msgs).toHaveLength(30);
    expect(msgs[0].content).toBe("Mensahe 1-0 tungkol sa araw ko");
    expect(
      msgs.every((m) => m.status === "GENERATED" && m.sentAt === null && m.approvedBy === null),
    ).toBe(true);
    expect(msgs.every((m) => m.telegramAccountId)).toBe(true); // ready for the scheduler to send
  });

  it("cuts a file without conversation labels into conversations of the chosen size", async () => {
    const { previewImport } = await import("@/server/imports/service");
    const { g, personas } = await setup();
    const rows = [
      ["speaker", "message"],
      ...Array.from({ length: 1000 }, (_, i) => [personas[i % personas.length].name, `linya ${i}`]),
    ];
    const preview = await previewImport({
      groupId: g.id,
      filename: "flat.xlsx",
      data: await xlsx(rows),
      minSize: 20,
      maxSize: 30,
    });
    expect(preview.totalLines).toBe(1000);
    expect(preview.conversations.every((c) => c.lines.length >= 20 && c.lines.length <= 60)).toBe(
      true,
    );
    expect(preview.conversations.reduce((n, c) => n + c.lines.length, 0)).toBe(1000);
  });

  it("reads a PDF with 'Speaker: message' lines and conversation headings", async () => {
    const { previewImport } = await import("@/server/imports/service");
    const { g, personas } = await setup();
    const lines: string[] = [];
    for (let c = 1; c <= 40; c++) {
      lines.push(`Conversation ${c}: Topic ${c}`);
      for (let i = 0; i < 12; i++)
        lines.push(`${personas[(c + i) % personas.length].name}: Linya ${c}-${i} sa PDF`);
    }
    const preview = await previewImport({
      groupId: g.id,
      filename: "chat.pdf",
      data: makePdf(lines),
      minSize: 15,
      maxSize: 35,
    });
    expect(preview.kind).toBe("pdf");
    expect(preview.totalLines).toBe(480);
    expect(preview.conversationCount).toBe(40);
    expect(preview.conversations[0].title).toBe("Conversation 1: Topic 1");
  });

  it("flags winning claims, promo wording and links, and can leave flagged lines out", async () => {
    const { previewImport, commitImport } = await import("@/server/imports/service");
    const { g, personas } = await setup();
    const [a, b] = personas.map((p) => p.name);
    const rows = [
      ["speaker", "message"],
      [a, "Kumusta kayo?"],
      [b, "Okay lang, pahinga muna."],
      [a, "Nanalo ako ng 50,000 kagabi, sigurado panalo to"],
      [b, "Sali na kayo, visit www.example.com para mag-register"],
      [a, "Ang daming bonus, 300% daw sa unang deposito"],
      [b, "Haha sige, kain muna tayo."],
    ];
    const preview = await previewImport({
      groupId: g.id,
      filename: "flags.xlsx",
      data: await xlsx(rows),
      minSize: 4,
      maxSize: 20,
    });
    expect(Object.keys(preview.issues.byCode)).toEqual(
      expect.arrayContaining(["win_claim", "link", "promo_language", "unverified_number"]),
    );
    const flagged = preview.conversations[0].lines.filter((l) => l.flags?.length).length;
    expect(flagged).toBeGreaterThanOrEqual(3);

    const kept = toCommit(g.id, preview, { dropSevere: true });
    const count = kept.conversations[0].messages.length;
    expect(count).toBeLessThan(6);
    expect(
      kept.conversations[0].messages.some((m) => /nanalo|www\.example|300%/i.test(m.text)),
    ).toBe(false);
    expect((await commitImport(kept, "00000000-0000-0000-0000-000000000001")).lines).toBe(count);
  });
});

describe("what is refused", () => {
  it("rejects a file whose content does not match its extension", async () => {
    const { previewImport, ImportError } = await import("@/server/imports/service");
    const { g } = await setup();
    await expect(
      previewImport({
        groupId: g.id,
        filename: "fake.xlsx",
        data: Buffer.from("this is just text"),
        minSize: 15,
        maxSize: 35,
      }),
    ).rejects.toBeInstanceOf(ImportError);
    await expect(
      previewImport({
        groupId: g.id,
        filename: "fake.pdf",
        data: Buffer.from("PK\x03\x04nope"),
        minSize: 15,
        maxSize: 35,
      }),
    ).rejects.toBeInstanceOf(ImportError);
    await expect(
      previewImport({
        groupId: g.id,
        filename: "macro.xlsm",
        data: Buffer.from("PK\x03\x04"),
        minSize: 15,
        maxSize: 35,
      }),
    ).rejects.toBeInstanceOf(ImportError);
    await expect(
      previewImport({
        groupId: g.id,
        filename: "empty.xlsx",
        data: Buffer.alloc(0),
        minSize: 15,
        maxSize: 35,
      }),
    ).rejects.toBeInstanceOf(ImportError);
  });

  it("refuses to import into the real community", async () => {
    const { previewImport, commitImport, ImportError } = await import("@/server/imports/service");
    const real = await makeGroup({ name: "real-import", type: "REAL_COMMUNITY" });
    const data = await xlsx([
      ["speaker", "message"],
      ["A", "hi"],
      ["B", "hello"],
    ]);
    await expect(
      previewImport({ groupId: real.id, filename: "x.xlsx", data, minSize: 15, maxSize: 35 }),
    ).rejects.toBeInstanceOf(ImportError);
    await expect(
      commitImport(
        {
          groupId: real.id,
          conversations: [
            {
              title: null,
              messages: [
                { personaId: "00000000-0000-0000-0000-000000000001", text: "a" },
                { personaId: "00000000-0000-0000-0000-000000000002", text: "b" },
              ],
            },
          ],
        },
        "u",
      ),
    ).rejects.toBeInstanceOf(ImportError);
    expect(await sessionsOf(real.id)).toHaveLength(0);
  });

  it("refuses lines assigned to a persona outside the group, and skips one-person 'conversations'", async () => {
    const { commitImport, ImportError } = await import("@/server/imports/service");
    const { g, personas, db, s } = await setup();
    const [outsider] = await db.insert(s.personas).values({ name: "ZZ-IT-outsider" }).returning();
    await expect(
      commitImport(
        {
          groupId: g.id,
          conversations: [
            {
              title: "x",
              messages: [
                { personaId: personas[0].id, text: "a" },
                { personaId: outsider.id, text: "b" },
              ],
            },
          ],
        },
        "u",
      ),
    ).rejects.toBeInstanceOf(ImportError);
    expect(await sessionsOf(g.id)).toHaveLength(0);

    const solo = await commitImport(
      {
        groupId: g.id,
        conversations: [
          {
            title: "solo",
            messages: [
              { personaId: personas[0].id, text: "a" },
              { personaId: personas[0].id, text: "b" },
            ],
          },
          {
            title: "duo",
            messages: [
              { personaId: personas[0].id, text: "a" },
              { personaId: personas[1].id, text: "b" },
            ],
          },
        ],
      },
      "u",
    );
    expect(solo.conversations).toBe(1);
  });

  it("refuses more lines than the limit", async () => {
    const { previewImport, ImportError } = await import("@/server/imports/service");
    const { g, personas } = await setup();
    const rows = [
      ["speaker", "message"],
      ...Array.from({ length: 20_001 }, (_, i) => [personas[i % 2].name, `m${i}`]),
    ];
    await expect(
      previewImport({
        groupId: g.id,
        filename: "big.xlsx",
        data: await xlsx(rows),
        minSize: 15,
        maxSize: 35,
      }),
    ).rejects.toBeInstanceOf(ImportError);
  });
});
