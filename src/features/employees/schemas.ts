import { z } from "zod";
import { optionalDate } from "@/lib/dates";

export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_NOTICE", "ON_LEAVE", "EXITED"] as const;

const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const employeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-_/]{2,20}$/, "2–20 letters, digits, - _ /"),
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: optionalText(30),
  departmentId: optionalId,
  designationId: optionalId,
  branchId: optionalId,
  managerId: optionalId,
  joiningDate: optionalDate,
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
});

export type EmployeeFormValues = {
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  departmentId: string;
  designationId: string;
  branchId: string;
  managerId: string;
  joiningDate: string;
  employmentStatus: (typeof EMPLOYMENT_STATUSES)[number];
};
