import { z } from "zod";

// Field and validation definitions for each master-data entity. Shared by the
// server actions (validation) and the generic table + form UI.

export type MasterEntity = "categories" | "departments" | "designations" | "branches" | "vendors";

export type MasterField = {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "textarea";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Shown as a table column. */
  column?: boolean;
  mono?: boolean;
};

const text = (max = 120) => z.string().trim().max(max);
const optionalText = (max = 250) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,10}$/, "2–10 letters, digits or dashes");

export const MASTER = {
  categories: {
    label: "Asset categories",
    singular: "category",
    description: "Types of assets, with the useful life used for depreciation.",
    fields: [
      { name: "name", label: "Name", required: true, column: true, placeholder: "Laptop" },
      { name: "code", label: "Code", required: true, column: true, mono: true, placeholder: "LAP" },
      { name: "usefulLifeMonths", label: "Useful life (months)", type: "number", required: true, column: true, hint: "Used for straight-line depreciation." },
      { name: "salvagePercent", label: "Salvage value (%)", type: "number", required: true, hint: "Residual value at end of life." },
      { name: "description", label: "Description", type: "textarea" },
    ],
    schema: z.object({
      name: text().min(2, "Enter a name"),
      code,
      usefulLifeMonths: z.coerce.number().int().min(1, "At least 1 month").max(600),
      salvagePercent: z.coerce.number().min(0).max(100),
      description: optionalText(500),
    }),
    defaults: { usefulLifeMonths: 36, salvagePercent: 0 },
  },
  departments: {
    label: "Departments",
    singular: "department",
    description: "Used for employee records and department-wise reports.",
    fields: [
      { name: "name", label: "Name", required: true, column: true, placeholder: "Engineering" },
      { name: "code", label: "Code", required: true, column: true, mono: true, placeholder: "ENG" },
    ],
    schema: z.object({ name: text().min(2, "Enter a name"), code }),
    defaults: {},
  },
  designations: {
    label: "Designations",
    singular: "designation",
    description: "Job titles available on employee records.",
    fields: [{ name: "title", label: "Title", required: true, column: true, placeholder: "Software Engineer" }],
    schema: z.object({ title: text().min(2, "Enter a title") }),
    defaults: {},
  },
  branches: {
    label: "Branches",
    singular: "branch",
    description: "Office locations where employees work and assets are kept.",
    fields: [
      { name: "name", label: "Name", required: true, column: true, placeholder: "Pune HQ" },
      { name: "code", label: "Code", required: true, column: true, mono: true, placeholder: "PUN" },
      { name: "city", label: "City", column: true },
      { name: "address", label: "Address", type: "textarea" },
    ],
    schema: z.object({ name: text().min(2, "Enter a name"), code, city: optionalText(80), address: optionalText(500) }),
    defaults: {},
  },
  vendors: {
    label: "Vendors",
    singular: "vendor",
    description: "Suppliers and service providers for purchases and repairs.",
    fields: [
      { name: "name", label: "Name", required: true, column: true },
      { name: "contactPerson", label: "Contact person", column: true },
      { name: "email", label: "Email", type: "email", column: true },
      { name: "phone", label: "Phone" },
      { name: "gstNumber", label: "GST number", mono: true },
      { name: "address", label: "Address", type: "textarea" },
    ],
    schema: z.object({
      name: text().min(2, "Enter a name"),
      contactPerson: optionalText(120),
      // Trim before validating, so pasted values with stray spaces are accepted.
      email: z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
        .transform((v) => (v === "" ? null : v))
        .nullable()
        .optional(),
      phone: optionalText(30),
      gstNumber: optionalText(20),
      address: optionalText(500),
    }),
    defaults: {},
  },
} satisfies Record<
  MasterEntity,
  {
    label: string;
    singular: string;
    description: string;
    fields: MasterField[];
    schema: z.ZodObject;
    defaults: Record<string, unknown>;
  }
>;

export const MASTER_ENTITIES = Object.keys(MASTER) as MasterEntity[];

/** The display name column for each entity (name, or title for designations). */
export const displayField = (entity: MasterEntity) => (entity === "designations" ? "title" : "name");
