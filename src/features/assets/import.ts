"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { nextCode } from "@/lib/codes";
import { ok, runAction, type ActionResult } from "@/lib/action";
import { readSpreadsheet } from "@/lib/spreadsheet";
import type { ImportRowResult, ImportSummary } from "@/lib/import-types";
import { ASSET_CONDITION, ASSET_STATUS } from "@/lib/labels";
import { assetSchema, parseSpecString } from "./schemas";

const COLUMNS = {
  assetCode: ["assetid", "assetcode"],
  name: ["assetname", "name"],
  category: ["category", "assetcategory", "type"],
  brand: ["brand", "make", "manufacturer"],
  model: ["model"],
  serialNumber: ["serialnumber", "serialno", "serial", "sn"],
  assetTag: ["assettag", "tag", "barcode", "companyassettag"],
  purchaseDate: ["purchasedate", "dateofpurchase"],
  purchaseCost: ["purchasecost", "cost", "price", "amount"],
  vendor: ["vendor", "vendorname", "supplier"],
  invoiceNumber: ["invoicenumber", "invoiceno", "invoice"],
  warrantyStart: ["warrantystart", "warrantystartdate"],
  warrantyExpiry: ["warrantyexpiry", "warrantyexpirydate", "warrantyend"],
  condition: ["condition", "assetcondition"],
  status: ["status", "assetstatus"],
  branch: ["branch", "location"],
  department: ["department", "dept"],
  specifications: ["specifications", "specs"],
  description: ["description", "notes", "remarks"],
} as const;

const FIELD_LABEL: Record<string, string> = {
  name: "Asset Name",
  brand: "Brand",
  model: "Model",
  serialNumber: "Serial Number",
  assetTag: "Asset Tag",
  purchaseDate: "Purchase Date",
  purchaseCost: "Purchase Cost",
  invoiceNumber: "Invoice Number",
  warrantyStart: "Warranty Start",
  warrantyExpiry: "Warranty Expiry",
  specifications: "Specifications",
  description: "Description",
};

/** Schema field → spreadsheet column, where the names differ. */
const SOURCE_COLUMN: Record<string, keyof typeof COLUMNS> = {
  categoryId: "category",
  vendorId: "vendor",
  branchId: "branch",
  departmentId: "department",
};

function pick(values: Record<string, string>, field: keyof typeof COLUMNS) {
  for (const key of COLUMNS[field]) if (values[key]) return values[key]!;
  return "";
}

function enumFrom(meta: Record<string, { label: string }>, raw: string, fallback: string) {
  if (!raw) return fallback;
  const key = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (key in meta) return key;
  return Object.entries(meta).find(([, m]) => m.label.toLowerCase() === raw.toLowerCase())?.[0] ?? null;
}

export async function importAssets(formData: FormData): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const actor = await authorize("asset:import", "asset:create", "asset:update");
    const commit = formData.get("mode") === "commit";
    const { rows } = await readSpreadsheet(formData.get("file") as File);

    const [categories, vendors, branches, departments, existing] = await Promise.all([
      db.assetCategory.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
      db.vendor.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      db.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
      db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
      db.asset.findMany({ select: { id: true, assetCode: true, serialNumber: true, assetTag: true, status: true, deletedAt: true } }),
    ]);
    const map = (list: { id: string; name: string; code?: string }[]) => {
      const m = new Map<string, string>();
      for (const r of list) {
        m.set(r.name.toLowerCase(), r.id);
        if (r.code) m.set(r.code.toLowerCase(), r.id);
      }
      return m;
    };
    const catMap = map(categories);
    const vendorMap = map(vendors);
    const branchMap = map(branches);
    const deptMap = map(departments);
    const byCode = new Map(existing.map((a) => [a.assetCode, a]));
    const bySerial = new Map(existing.filter((a) => a.serialNumber).map((a) => [a.serialNumber!.toLowerCase(), a]));
    const byTag = new Map(existing.filter((a) => a.assetTag).map((a) => [a.assetTag!.toLowerCase(), a]));

    const seenSerial = new Map<string, number>();
    const seenTag = new Map<string, number>();
    const results: ImportRowResult[] = [];
    const writes: { data: Partial<ReturnType<typeof assetSchema.parse>>; existingId?: string }[] = [];

    for (const { rowNumber, values } of rows) {
      const errors: string[] = [];
      const lookup = (raw: string, m: Map<string, string>, what: string, required = false) => {
        if (!raw) {
          if (required) errors.push(`${what} is required.`);
          return "";
        }
        const id = m.get(raw.toLowerCase());
        if (!id) errors.push(`Unknown ${what.toLowerCase()} "${raw}". Add it in Master Data first.`);
        return id ?? "";
      };

      const code = pick(values, "assetCode").toUpperCase();
      const serial = pick(values, "serialNumber");
      const tag = pick(values, "assetTag");
      const current = (code && byCode.get(code)) || (serial && bySerial.get(serial.toLowerCase())) || undefined;
      if (code && !byCode.has(code)) errors.push(`Asset ID ${code} doesn't exist. Leave it blank for new assets.`);
      if (current?.deletedAt) errors.push(`${current.assetCode} is deleted. Restore it before updating.`);

      const status = enumFrom(ASSET_STATUS, pick(values, "status"), current?.status ?? "AVAILABLE");
      const condition = enumFrom(ASSET_CONDITION, pick(values, "condition"), "GOOD");
      if (!status) errors.push(`Unknown status "${pick(values, "status")}".`);
      if (!condition) errors.push(`Unknown condition "${pick(values, "condition")}".`);
      if (status && current && status !== current.status && (status === "ASSIGNED" || current.status === "ASSIGNED")) {
        errors.push("Assigned status can only change through the assign / return workflow.");
      } else if (status === "ASSIGNED" && !current) {
        errors.push("New assets can't be imported as Assigned. Import as Available, then assign.");
      }

      if (serial) {
        const k = serial.toLowerCase();
        if (seenSerial.has(k)) errors.push(`Serial number also appears on row ${seenSerial.get(k)}.`);
        seenSerial.set(k, rowNumber);
      }
      if (tag) {
        const k = tag.toLowerCase();
        if (seenTag.has(k)) errors.push(`Asset tag also appears on row ${seenTag.get(k)}.`);
        seenTag.set(k, rowNumber);
        const owner = byTag.get(k);
        if (owner && owner.id !== current?.id) errors.push(`Asset tag is already used by ${owner.assetCode}.`);
      }

      const parsed = assetSchema.safeParse({
        name: pick(values, "name"),
        categoryId: lookup(pick(values, "category"), catMap, "Category", true),
        brand: pick(values, "brand"),
        model: pick(values, "model"),
        serialNumber: serial,
        assetTag: tag,
        purchaseDate: pick(values, "purchaseDate"),
        purchaseCost: pick(values, "purchaseCost"),
        vendorId: lookup(pick(values, "vendor"), vendorMap, "Vendor"),
        invoiceNumber: pick(values, "invoiceNumber"),
        warrantyStart: pick(values, "warrantyStart"),
        warrantyExpiry: pick(values, "warrantyExpiry"),
        condition: condition ?? "GOOD",
        status: status ?? "AVAILABLE",
        branchId: lookup(pick(values, "branch"), branchMap, "Branch"),
        departmentId: lookup(pick(values, "department"), deptMap, "Department"),
        specifications: parseSpecString(pick(values, "specifications")),
        description: pick(values, "description"),
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? "");
          // Lookup failures were already reported with a clearer message above.
          if (["categoryId", "vendorId", "branchId", "departmentId"].includes(field)) continue;
          errors.push(`${FIELD_LABEL[field] ?? field}: ${issue.message}`);
        }
      }

      const label = [current?.assetCode ?? "New", pick(values, "name"), serial].filter(Boolean).join(" · ");
      if (errors.length || !parsed.success) {
        results.push({ rowNumber, label, action: "error", errors: [...new Set(errors)] });
        continue;
      }
      // Updates only touch columns that have a value; blank cells keep what's stored.
      const data = current
        ? (Object.fromEntries(
            Object.entries(parsed.data).filter(([key]) => pick(values, SOURCE_COLUMN[key] ?? (key as keyof typeof COLUMNS)) !== ""),
          ) as Partial<typeof parsed.data>)
        : parsed.data;
      writes.push({ data, existingId: current?.id });
      results.push({ rowNumber, label, action: current ? "update" : "create", errors: [] });
    }

    const summary: ImportSummary = {
      committed: false,
      total: results.length,
      creates: results.filter((r) => r.action === "create").length,
      updates: results.filter((r) => r.action === "update").length,
      errors: results.filter((r) => r.action === "error").length,
      rows: results,
    };
    if (!commit || writes.length === 0) return ok(summary);

    await db.$transaction(
      async (tx) => {
        for (const w of writes) {
          const data = { ...w.data, specifications: w.data.specifications ?? undefined };
          if (w.existingId) await tx.asset.update({ where: { id: w.existingId }, data });
          else {
            const full = data as ReturnType<typeof assetSchema.parse> & { specifications?: object };
            await tx.asset.create({ data: { ...full, assetCode: await nextCode(tx, "asset"), createdById: actor.id } });
          }
        }
        await writeAudit(
          {
            actorId: actor.id,
            action: "asset.import",
            entityType: "Asset",
            entityId: "bulk",
            summary: `Imported assets: ${summary.creates} added, ${summary.updates} updated`,
            after: { file: (formData.get("file") as File).name, creates: summary.creates, updates: summary.updates },
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );

    refresh();
    return ok({ ...summary, committed: true });
  });
}
