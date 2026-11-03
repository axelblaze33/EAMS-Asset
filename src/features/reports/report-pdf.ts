import "server-only";
import { format } from "date-fns";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportColumn, ReportSummary } from "./types";
import { formatCell } from "./shared";

// Landscape A4 table. Standard PDF fonts only cover WinAnsi, so "₹" is written
// as "Rs" and any other unsupported character becomes "?".

const PAGE = { w: 841.89, h: 595.28 };
const M = 32;
const ROW_H = 15;
const INK = rgb(0.11, 0.12, 0.16);
const MUTED = rgb(0.42, 0.44, 0.5);
const LINE = rgb(0.88, 0.89, 0.92);
const BAND = rgb(0.95, 0.96, 0.98);
const BRAND = rgb(0.16, 0.39, 0.86);

const clean = (s: string) => s.replace(/₹\s?/g, "Rs ").replace(/[^\x20-\x7E -ÿ]/g, "?");

function fit(text: string, font: PDFFont, size: number, width: number) {
  const t = clean(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${t.slice(0, mid)}...`, size) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${t.slice(0, lo)}...`;
}

export async function reportPdf<R>(opts: {
  title: string;
  subtitle: string;
  company: string;
  columns: ReportColumn<R>[];
  rows: R[];
  summary: ReportSummary;
  generatedBy: string;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title);
  pdf.setCreator("EAMS");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Column widths proportional to their hints, filling the printable width.
  const cols = opts.columns;
  const totalHint = cols.reduce((a, c) => a + (c.width ?? 10), 0);
  const usable = PAGE.w - 2 * M;
  const widths = cols.map((c) => ((c.width ?? 10) / totalHint) * usable);
  const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const right = (c: ReportColumn<R>) => c.kind === "money" || c.kind === "number";

  let page: PDFPage;
  let y = 0;

  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: usable, height: ROW_H + 2, color: BAND });
    cols.forEach((c, i) => {
      const t = fit(c.header, bold, 7, widths[i]! - 6);
      const x = right(c) ? xs[i]! + widths[i]! - 3 - bold.widthOfTextAtSize(t, 7) : xs[i]! + 3;
      page.drawText(t, { x, y, size: 7, font: bold, color: MUTED });
    });
    y -= ROW_H + 2;
  };

  const newPage = (first: boolean) => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
    if (first) {
      page.drawRectangle({ x: 0, y: PAGE.h - 5, width: PAGE.w, height: 5, color: BRAND });
      page.drawText(clean(opts.company.toUpperCase()), { x: M, y, size: 8, font: bold, color: MUTED });
      y -= 20;
      page.drawText(clean(opts.title), { x: M, y, size: 16, font: bold, color: INK });
      y -= 15;
      page.drawText(fit(opts.subtitle, font, 8.5, usable), { x: M, y, size: 8.5, font, color: MUTED });
      y -= 22;
      // Summary figures
      let x = M;
      for (const s of opts.summary) {
        const value = clean(s.value);
        const w = Math.max(bold.widthOfTextAtSize(value, 11), font.widthOfTextAtSize(s.label, 7)) + 24;
        page.drawRectangle({ x, y: y - 14, width: w - 8, height: 30, borderColor: LINE, borderWidth: 0.7 });
        page.drawText(value, { x: x + 8, y: y + 2, size: 11, font: bold, color: INK });
        page.drawText(clean(s.label), { x: x + 8, y: y - 9, size: 7, font, color: MUTED });
        x += w;
      }
      y -= 34;
    } else {
      page.drawText(fit(`${opts.title} (continued)`, bold, 9, usable), { x: M, y, size: 9, font: bold, color: INK });
      y -= 18;
    }
    header();
  };

  newPage(true);
  if (opts.rows.length === 0) {
    page!.drawText("No records match these filters.", { x: M + 3, y, size: 9, font, color: MUTED });
  }
  for (const row of opts.rows) {
    if (y < M + 24) newPage(false);
    cols.forEach((c, i) => {
      const t = fit(formatCell(c.kind, c.value(row)), c.kind === "mono" ? font : font, 7.5, widths[i]! - 6);
      const x = right(c) ? xs[i]! + widths[i]! - 3 - font.widthOfTextAtSize(t, 7.5) : xs[i]! + 3;
      page!.drawText(t, { x, y, size: 7.5, font, color: INK });
    });
    page!.drawLine({ start: { x: M, y: y - 5 }, end: { x: PAGE.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
    y -= ROW_H;
  }

  const pages = pdf.getPages();
  const stamp = `Generated ${format(new Date(), "d MMM yyyy, HH:mm")} by ${opts.generatedBy}  |  ${opts.rows.length.toLocaleString("en-IN")} rows`;
  pages.forEach((p, i) => {
    p.drawText(clean(stamp), { x: M, y: 16, size: 7, font, color: MUTED });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: PAGE.w - M - font.widthOfTextAtSize(pn, 7), y: 16, size: 7, font, color: MUTED });
  });
  return pdf.save();
}
