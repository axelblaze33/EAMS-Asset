import { z } from "zod";
import { optionalDate, requiredDate } from "@/lib/dates";

const CONDITIONS = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

/** Statuses an asset can go to after a return. */
export const RETURN_NEXT_STATUSES = ["AVAILABLE", "UNDER_MAINTENANCE", "DAMAGED", "RETIRED"] as const;

/** Suggested accessories per category keyword; free text is also allowed. */
export function accessorySuggestions(categoryName: string) {
  const c = categoryName.toLowerCase();
  if (/laptop|notebook/.test(c)) return ["Charger", "Laptop bag", "Mouse", "USB-C dock", "Headset"];
  if (/phone|mobile|tablet/.test(c)) return ["Charger", "Cable", "Case", "Screen protector", "SIM card"];
  if (/monitor/.test(c)) return ["Power cable", "HDMI cable", "DisplayPort cable", "Stand"];
  if (/desktop/.test(c)) return ["Keyboard", "Mouse", "Power cable", "Monitor cable"];
  if (/head/.test(c)) return ["Case", "USB dongle", "Charging cable"];
  return ["Cable", "Case", "Manual"];
}

const staged = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

const accessory = z.string().trim().min(1).max(60);

export const assignSchema = z
  .object({
    employeeId: z.string().min(1, "Choose an employee"),
    assignedAt: requiredDate,
    expectedReturnAt: optionalDate,
    remarks: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => v || null),
    items: z
      .array(
        z.object({
          assetId: z.string().min(1),
          condition: z.enum(CONDITIONS),
          accessories: z.array(accessory).max(20),
        }),
      )
      .min(1, "Choose at least one asset")
      .max(25, "Assign at most 25 assets at a time"),
    requestId: z.string().optional().nullable(),
    documents: z.array(staged).max(6).default([]),
  })
  .refine((v) => !v.expectedReturnAt || v.expectedReturnAt >= v.assignedAt, {
    path: ["expectedReturnAt"],
    message: "Must be on or after the assignment date",
  })
  .refine((v) => new Set(v.items.map((i) => i.assetId)).size === v.items.length, {
    path: ["items"],
    message: "The same asset was selected twice",
  });
export type AssignInput = z.input<typeof assignSchema>;

export const accessoriesSchema = z.object({
  items: z
    .array(
      z.object({
        assignmentId: z.string().min(1),
        accessories: z.array(accessory).max(20),
      }),
    )
    .min(1)
    .max(25)
    .refine((v) => new Set(v.map((i) => i.assignmentId)).size === v.length, "The same assignment was selected twice"),
});

/** Same accessories, ignoring order. */
export function sameAccessories(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export const returnSchema = z.object({
  assignmentId: z.string().min(1),
  returnedAt: requiredDate,
  condition: z.enum(CONDITIONS),
  missingAccessories: z.array(accessory).max(20).default([]),
  damageNotes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
  deductionAmount: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1e8) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    }),
  deductionNotes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
  remarks: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
  nextStatus: z.enum(RETURN_NEXT_STATUSES),
  photos: z.array(staged).max(8).default([]),
});
export type ReturnInput = z.input<typeof returnSchema>;

export const ACKNOWLEDGEMENT_METHODS = ["SIGNED_FORM", "EMAIL", "IN_PERSON", "OTHER"] as const;

export const acknowledgementSchema = z.object({
  assignmentIds: z.array(z.string().min(1)).min(1).max(50),
  method: z.enum(ACKNOWLEDGEMENT_METHODS),
  acknowledgedOn: requiredDate,
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});
