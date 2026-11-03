import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { ActionError } from "@/lib/action";

export const IMPORT_MAX_BYTES = 3 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "Serial Number" / "serial_number" / "SERIAL NO." all become "serialnumber". */
export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue); // formula
    if ("text" in value) return String(value.text); // hyperlink
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    return "";
  }
  return String(value).trim();
}

/**
 * Reads the first sheet of an .xlsx or a .csv into rows keyed by normalized
 * header. Blank rows are dropped. Row numbers match what the user sees in Excel.
 */
export async function readSpreadsheet(file: File) {
  if (!file || file.size === 0) throw new ActionError("Choose a file to import.");
  if (file.size > IMPORT_MAX_BYTES) throw new ActionError("The file is larger than 3 MB. Split it into smaller files.");

  const name = file.name.toLowerCase();
  let table: string[][];

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
    table = parsed.data.map((r) => r.map((c) => String(c ?? "").trim()));
  } else if (name.endsWith(".xlsx") || file.type === XLSX_MIME) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new ActionError("This file couldn't be read as an Excel workbook.");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new ActionError("The workbook has no sheets.");
    table = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = row.values as ExcelJS.CellValue[]; // 1-based
      table[rowNumber - 1] = Array.from({ length: Math.max(0, values.length - 1) }, (_, i) => cellToString(values[i + 1]));
    });
    table = Array.from(table, (r) => r ?? []);
  } else {
    throw new ActionError("Upload a .xlsx or .csv file.");
  }

  const [header, ...body] = table;
  if (!header?.length) throw new ActionError("The file is empty.");
  const keys = header.map((h) => normalizeHeader(h ?? ""));

  const rows = body
    .map((cells, i) => ({
      rowNumber: i + 2,
      values: Object.fromEntries(keys.map((k, c) => [k, (cells[c] ?? "").trim()])) as Record<string, string>,
    }))
    .filter((r) => Object.values(r.values).some(Boolean));

  if (rows.length === 0) throw new ActionError("No data rows found under the header row.");
  if (rows.length > IMPORT_MAX_ROWS) throw new ActionError(`Import at most ${IMPORT_MAX_ROWS} rows at a time.`);
  return { headers: keys, rows };
}

export type ExportColumn<T> = {
  header: string;
  width?: number;
  /** Excel number format, e.g. "#,##0.00" or "dd-mmm-yyyy". */
  numFmt?: string;
  value: (row: T) => string | number | Date | null | undefined;
};

export async function toXlsx<T>(sheetName: string, columns: ExportColumn<T>[], rows: T[], opts: { title?: string; subtitle?: string } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EAMS";
  // Optional title rows above the table; the header row stays frozen either way.
  const offset = opts.title ? (opts.subtitle ? 3 : 2) : 0;
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: offset + 1 }] });
  if (opts.title) {
    ws.getCell("A1").value = opts.title;
    ws.getCell("A1").font = { bold: true, size: 14 };
    if (opts.subtitle) {
      ws.getCell("A2").value = opts.subtitle;
      ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
    }
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.max(12, c.header.length + 4);
    if (c.numFmt) col.numFmt = c.numFmt;
  });
  const header = ws.getRow(offset + 1);
  header.values = columns.map((c) => c.header);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F7" } };
  for (const row of rows) ws.addRow(columns.map((c) => c.value(row) ?? ""));
  if (rows.length) ws.autoFilter = { from: { row: offset + 1, column: 1 }, to: { row: offset + 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV with a BOM so Excel opens UTF-8 correctly; cells are formula-injection safe. */
export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]) {
  const safe = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  return "﻿" + Papa.unparse({ fields: columns.map((c) => c.header), data: rows.map((r) => columns.map((c) => safe(c.value(r)))) });
}

export function fileResponse(body: Buffer | string, filename: string, format: "xlsx" | "csv") {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": format === "xlsx" ? XLSX_MIME : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
