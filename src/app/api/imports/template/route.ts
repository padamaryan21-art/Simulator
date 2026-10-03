import ExcelJS from "exceljs";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { route } from "@/lib/api";

/** A ready-to-fill Excel template using the real persona names. */
export const GET = route(async () => {
  const names = (
    await db.select({ name: personas.name }).from(personas).orderBy(asc(personas.createdAt))
  ).map((p) => p.name);
  const [a, b, c] = [names[0] ?? "Rodel", names[1] ?? "Jennelyn", names[2] ?? "Cecille"];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Conversations");
  ws.columns = [
    { header: "conversation", key: "conversation", width: 16 },
    { header: "topic", key: "topic", width: 24 },
    { header: "speaker", key: "speaker", width: 16 },
    { header: "message", key: "message", width: 80 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRows([
    {
      conversation: "1",
      topic: "Ulam ngayong gabi",
      speaker: a,
      message: "Anong ulam niyo ngayon? Wala pa akong maisip.",
    },
    {
      conversation: "1",
      topic: "Ulam ngayong gabi",
      speaker: b,
      message: "Sinigang yata, umuulan kasi eh 😅",
    },
    {
      conversation: "1",
      topic: "Ulam ngayong gabi",
      speaker: c,
      message: "Ay oo nga, bagay sa ulan. Pahingi hahaha",
    },
    {
      conversation: "2",
      topic: "Plano sa weekend",
      speaker: b,
      message: "May lakad ba kayo sa Sabado?",
    },
    {
      conversation: "2",
      topic: "Plano sa weekend",
      speaker: a,
      message: "Wala pa, pahinga muna ako. Pagod sa trabaho.",
    },
    {
      conversation: "2",
      topic: "Plano sa weekend",
      speaker: c,
      message: "Same. Netflix lang siguro.",
    },
  ]);
  const instructions = wb.addWorksheet("Instructions");
  instructions.getColumn(1).width = 110;
  [
    "One row per message, in the order they are sent.",
    "speaker: one of the persona names (" + names.join(", ") + ").",
    "conversation: rows with the same value belong to one conversation. Leave the column out and the file is cut into conversations automatically.",
    "topic: optional label shown in the history.",
    "Also accepted: .csv with the same columns, or a .pdf with lines like  Rodel: message  (headings like 'Conversation 3' start a new conversation).",
  ].forEach((t) => instructions.addRow([t]));

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="conversation-import-template.xlsx"',
    },
  });
});
