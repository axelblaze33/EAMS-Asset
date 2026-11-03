import { z } from "zod";
import { optionalDate } from "@/lib/dates";

export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "UNDER_MAINTENANCE", "DAMAGED", "LOST", "RETIRED", "DISPOSED"] as const;
export const ASSET_CONDITIONS = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

/** Statuses an admin may set directly. ASSIGNED only comes from the assignment workflow. */
export const MANUAL_STATUSES = ASSET_STATUSES.filter((s) => s !== "ASSIGNED");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const assetSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the asset name").max(150),
    categoryId: z.string().min(1, "Choose a category"),
    brand: optionalText(80),
    model: optionalText(120),
    serialNumber: optionalText(100),
    assetTag: optionalText(60),
    purchaseDate: optionalDate,
    purchaseCost: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (!v) return null;
        const n = Number(v.replace(/,/g, ""));
        if (!Number.isFinite(n) || n < 0 || n > 1e10) {
          ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
          return z.NEVER;
        }
        return Math.round(n * 100) / 100;
      }),
    vendorId: optionalId,
    invoiceNumber: optionalText(60),
    warrantyStart: optionalDate,
    warrantyExpiry: optionalDate,
    condition: z.enum(ASSET_CONDITIONS),
    status: z.enum(ASSET_STATUSES),
    branchId: optionalId,
    departmentId: optionalId,
    specifications: z
      .array(z.object({ key: z.string().trim().max(60), value: z.string().trim().max(250) }))
      .max(30)
      .optional()
      .transform((rows) => {
        const entries = (rows ?? []).filter((r) => r.key && r.value).map((r) => [r.key, r.value] as const);
        return entries.length ? Object.fromEntries(entries) : null;
      }),
    description: optionalText(2000),
  })
  .refine((v) => !v.warrantyStart || !v.warrantyExpiry || v.warrantyExpiry >= v.warrantyStart, {
    path: ["warrantyExpiry"],
    message: "Warranty expiry must be after the start date",
  });

export type AssetFormValues = {
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  purchaseDate: string;
  purchaseCost: string;
  vendorId: string;
  invoiceNumber: string;
  warrantyStart: string;
  warrantyExpiry: string;
  condition: (typeof ASSET_CONDITIONS)[number];
  status: (typeof ASSET_STATUSES)[number];
  branchId: string;
  departmentId: string;
  specifications: { key: string; value: string }[];
  description: string;
};

/** "CPU: i7; RAM: 16 GB" → {CPU: "i7", RAM: "16 GB"} (used by imports). */
export function parseSpecString(raw: string) {
  return raw
    .split(/[;\n]/)
    .map((part) => {
      const i = part.indexOf(":");
      return i < 0 ? { key: "", value: "" } : { key: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
    })
    .filter((s) => s.key && s.value);
}
