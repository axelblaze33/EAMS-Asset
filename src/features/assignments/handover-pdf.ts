import "server-only";
import { format } from "date-fns";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ACKNOWLEDGEMENT_METHOD, ASSET_CONDITION } from "@/lib/labels";
import type { Handover } from "./queries";

// A4 handover acknowledgement. Standard PDF fonts only cover WinAnsi, so text is
// sanitised to that set (e.g. "₹" never appears here).

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const INK = rgb(0.11, 0.12, 0.16);
const MUTED = rgb(0.42, 0.44, 0.5);
const LINE = rgb(0.86, 0.87, 0.9);
const BRAND = rgb(0.16, 0.39, 0.86);

const clean = (s: string | null | undefined) => (s ?? "").replace(/[^\x20-\x7E -ÿ]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = clean(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function handoverPdf(h: Handover, company: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Asset handover - ${h.employee.fullName}`);
  pdf.setCreator("EAMS");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (s: string, x: number, size = 10, f = font, color = INK) => page.drawText(clean(s), { x, y, size, font: f, color });
  const ensure = (needed: number) => {
    if (y - needed < M + 40) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };

  // Header
  page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: BRAND });
  text(company.toUpperCase(), M, 9, bold, MUTED);
  y -= 22;
  text("Asset Handover Acknowledgement", M, 18, bold);
  y -= 16;
  text(`Reference ${h.ref.slice(0, 8).toUpperCase()}  |  Issued ${format(h.assignedAt, "d MMM yyyy")} by ${h.assignedBy.name}`, M, 9, font, MUTED);
  y -= 24;

  // Employee block
  const col = (label: string, value: string, x: number) => {
    page.drawText(clean(label), { x, y, size: 8, font, color: MUTED });
    page.drawText(clean(value || "-"), { x, y: y - 13, size: 10, font: bold, color: INK });
  };
  page.drawRectangle({ x: M, y: y - 62, width: A4.w - 2 * M, height: 70, color: rgb(0.97, 0.975, 0.985), borderColor: LINE, borderWidth: 0.5 });
  y -= 10;
  const third = (A4.w - 2 * M - 24) / 3;
  col("Employee", h.employee.fullName, M + 12);
  col("Employee ID", h.employee.employeeCode, M + 12 + third);
  col("Department", h.employee.department?.name ?? "", M + 12 + 2 * third);
  y -= 30;
  col("Designation", h.employee.designation?.title ?? "", M + 12);
  col("Branch", h.employee.branch?.name ?? "", M + 12 + third);
  col("Return by", h.expectedReturnAt ? format(h.expectedReturnAt, "d MMM yyyy") : "Until further notice", M + 12 + 2 * third);
  y -= 46;

  // Asset table
  const cols = [
    { label: "Asset ID", x: M, w: 70 },
    { label: "Asset", x: M + 72, w: 160 },
    { label: "Serial number", x: M + 234, w: 95 },
    { label: "Condition", x: M + 331, w: 55 },
    { label: "Accessories", x: M + 388, w: A4.w - M - (M + 388) },
  ];
  text(`Assets handed over (${h.items.length})`, M, 11, bold);
  y -= 16;
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4.w - M, y: y + 4 }, thickness: 0.5, color: LINE });
  y -= 8;
  for (const c of cols) page.drawText(c.label, { x: c.x, y, size: 8, font: bold, color: MUTED });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.5, color: LINE });
  y -= 14;
  for (const item of h.items) {
    const name = [item.asset.name, item.asset.category.name].join(" - ");
    const nameLines = wrap(name, font, 9, cols[1]!.w);
    const accLines = wrap(item.accessories.join(", ") || "None", font, 9, cols[4]!.w);
    const rows = Math.max(nameLines.length, accLines.length);
    ensure(rows * 12 + 10);
    page.drawText(clean(item.asset.assetCode), { x: cols[0]!.x, y, size: 9, font: bold, color: INK });
    nameLines.forEach((l, i) => page.drawText(l, { x: cols[1]!.x, y: y - i * 12, size: 9, font, color: INK }));
    page.drawText(clean(item.asset.serialNumber ?? "-"), { x: cols[2]!.x, y, size: 9, font, color: INK });
    page.drawText(ASSET_CONDITION[item.conditionAtHandover].label, { x: cols[3]!.x, y, size: 9, font, color: INK });
    accLines.forEach((l, i) => page.drawText(l, { x: cols[4]!.x, y: y - i * 12, size: 9, font, color: INK }));
    y -= rows * 12 + 6;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4.w - M, y: y + 2 }, thickness: 0.4, color: LINE });
    y -= 12;
  }

  if (h.remarks) {
    ensure(40);
    text("Remarks", M, 9, bold, MUTED);
    y -= 13;
    for (const l of wrap(h.remarks, font, 9, A4.w - 2 * M)) {
      text(l, M, 9);
      y -= 12;
    }
    y -= 6;
  }

  // Terms
  const terms = [
    "I confirm that I have received the assets listed above in the condition stated, together with the listed accessories.",
    "These assets remain the property of the company. I will use them for company work, take reasonable care of them, and not lend, sell or modify them without approval.",
    "I will report loss, theft or damage to IT immediately, and return all assets and accessories when requested or when I leave the company. Loss or damage caused by negligence may be recovered as per company policy.",
  ];
  ensure(140);
  text("Declaration", M, 11, bold);
  y -= 16;
  terms.forEach((t, i) => {
    for (const [j, l] of wrap(t, font, 9, A4.w - 2 * M - 14).entries()) {
      if (j === 0) text(`${i + 1}.`, M, 9, font, MUTED);
      text(l, M + 14, 9);
      y -= 12;
    }
    y -= 4;
  });

  // Acknowledgement status + signatures
  y -= 8;
  ensure(90);
  const acked = h.items.every((i) => i.acknowledgement === "ACKNOWLEDGED");
  const ackItem = h.items.filter((i) => i.acknowledgedAt).sort((a, b) => b.acknowledgedAt!.getTime() - a.acknowledgedAt!.getTime())[0];
  const ackAt = ackItem?.acknowledgedAt;
  page.drawRectangle({
    x: M,
    y: y - 18,
    width: A4.w - 2 * M,
    height: 26,
    color: acked ? rgb(0.92, 0.98, 0.94) : rgb(1, 0.97, 0.9),
  });
  y -= 9;
  text(
    acked && ackAt
      ? `Acknowledged by ${h.employee.fullName} on ${format(ackAt, "d MMM yyyy")}${ackItem?.acknowledgementMethod ? ` (${ACKNOWLEDGEMENT_METHOD[ackItem.acknowledgementMethod].label.toLowerCase()})` : ""}${ackItem?.acknowledgedBy ? `, recorded by ${ackItem.acknowledgedBy.name}` : ""}`
      : "To be signed by the employee on receipt of the assets.",
    M + 10,
    9,
    bold,
    acked ? rgb(0.05, 0.45, 0.25) : rgb(0.6, 0.38, 0.02),
  );
  y -= 56;
  const sig = (label: string, x: number) => {
    page.drawLine({ start: { x, y: y + 14 }, end: { x: x + 200, y: y + 14 }, thickness: 0.6, color: MUTED });
    page.drawText(label, { x, y, size: 8, font, color: MUTED });
  };
  sig(`Employee signature & date  (${clean(h.employee.fullName)})`, M);
  sig(`Issued by  (${clean(h.assignedBy.name)})`, A4.w - M - 200);

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Generated by EAMS on ${format(new Date(), "d MMM yyyy")}  |  Page ${i + 1} of ${pages.length}`, { x: M, y: 24, size: 7, font, color: MUTED }),
  );

  return pdf.save();
}
