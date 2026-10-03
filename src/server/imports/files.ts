import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { LIMITS, linesFromRows, linesFromText, type ParsedLine } from "./parse";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PDF_PAGES = 500;
const MAX_SHEETS = 30;

export type FileKind = "xlsx" | "csv" | "pdf";

export class ImportError extends Error {}

/**
 * Decides the file type from BOTH the extension and the file's own first bytes, so a renamed or
 * disguised file is rejected rather than handed to a parser.
 */
export function detectKind(filename: string, bytes: Uint8Array): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
  const isPdf = startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

  if (ext === "xlsx" && isZip) return "xlsx";
  if (ext === "pdf" && isPdf) return "pdf";
  if (ext === "csv" && !bytes.subarray(0, 4096).includes(0)) return "csv";
  if (["xlsx", "pdf", "csv"].includes(ext)) {
    throw new ImportError(`The file does not look like a real .${ext} file.`);
  }
  throw new ImportError("Unsupported file type. Upload an .xlsx, .csv or .pdf file.");
}

const cellText = (cell: ExcelJS.Cell): string => {
  try {
    return cell.text ?? "";
  } catch {
    return "";
  }
};

function sheetRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  const maxCol = Math.min(ws.columnCount || 0, 12);
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > LIMITS.maxLines + 5) return; // hard stop on absurd sheets
    const cells: string[] = [];
    for (let c = 1; c <= maxCol; c++) cells.push(cellText(row.getCell(c)));
    rows.push(cells);
  });
  return rows;
}

/**
 * Some tools (Open XML SDK, ClosedXML, ...) write every XML tag with a namespace prefix ("<x:sheets>").
 * Excel opens that fine but ExcelJS cannot, so the prefix is stripped before parsing.
 */
async function withoutXmlPrefixes(data: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(data);
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const prefix = wbXml?.match(/<([A-Za-z0-9_]+):workbook[\s>]/)?.[1];
  if (!prefix) return data;
  const open = new RegExp(`<(/?)${prefix}:`, "g");
  const decl = new RegExp(`xmlns:${prefix}=`, "g");
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("xl/") || !name.endsWith(".xml")) continue;
    const xml = await zip.file(name)!.async("string");
    zip.file(name, xml.replace(open, "<$1").replace(decl, "xmlns="));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Reads every line out of the file. Never executes anything from the file (no macros, no formulas). */
export async function readLines(kind: FileKind, data: Buffer): Promise<ParsedLine[]> {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    if (pdf.numPages > MAX_PDF_PAGES)
      throw new ImportError(`The PDF has too many pages (limit ${MAX_PDF_PAGES}).`);
    const { text } = await extractText(pdf, { mergePages: true });
    return linesFromText(text);
  }

  const wb = new ExcelJS.Workbook();
  if (kind === "csv") await wb.csv.read(Readable.from(data));
  else await wb.xlsx.load((await withoutXmlPrefixes(data)) as unknown as ExcelJS.Buffer);

  const sheets = wb.worksheets.slice(0, MAX_SHEETS);
  const out: ParsedLine[] = [];
  for (const ws of sheets) {
    const lines = linesFromRows(sheetRows(ws));
    // With several sheets and no conversation column, each sheet is its own conversation.
    const labelled = lines.some((l) => l.conversation);
    for (const l of lines)
      out.push(!labelled && sheets.length > 1 ? { ...l, conversation: ws.name } : l);
  }
  return out;
}
