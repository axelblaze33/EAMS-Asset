import { z } from "zod";
import { optionalDate } from "@/lib/dates";

export const MAINTENANCE_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING_PARTS", "COMPLETED", "CANCELLED"] as const;
export const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING_PARTS"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
/** Where the asset goes when a repair is completed. */
export const AFTER_REPAIR = ["AVAILABLE", "DAMAGED", "RETIRED"] as const;

const staged = z.object({ path: z.string().min(1), fileName: z.string().min(1).max(200), mimeType: z.string().min(1), size: z.number().int().positive() });
const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const money = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 1e9) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

export const createTicketSchema = z.object({
  assetId: z.string().min(1, "Choose an asset"),
  issue: z.string().trim().min(5, "Describe the issue").max(2000),
  priority: z.enum(PRIORITIES),
  assigneeId: optionalId,
  vendorId: optionalId,
  startedAt: optionalDate,
  /** Move the asset to Under Maintenance (not applied to assigned assets). */
  takeOutOfService: z.boolean().default(true),
  documents: z.array(staged).max(6).default([]),
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(MAINTENANCE_STATUSES),
    priority: z.enum(PRIORITIES),
    assigneeId: optionalId,
    vendorId: optionalId,
    cost: money,
    startedAt: optionalDate,
    completedAt: optionalDate,
    resolutionNotes: optionalText(2000),
    afterStatus: z.enum(AFTER_REPAIR).default("AVAILABLE"),
    documents: z.array(staged).max(6).default([]),
  })
  .refine((v) => v.status !== "COMPLETED" || v.completedAt, { path: ["completedAt"], message: "Enter the completion date" })
  .refine((v) => !v.startedAt || !v.completedAt || v.completedAt >= v.startedAt, { path: ["completedAt"], message: "Can't be before the start date" });
export type UpdateTicketInput = z.input<typeof updateTicketSchema>;
