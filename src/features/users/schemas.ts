import { z } from "zod";
import { passwordSchema } from "@/features/auth/schemas";

const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" || v === "none" ? null : v))
  .nullable()
  .optional();

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  roleId: z.string().min(1, "Choose a role"),
  employeeId: optionalId,
  password: passwordSchema,
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Enter the full name").max(120),
  roleId: z.string().min(1, "Choose a role"),
  employeeId: optionalId,
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const setActiveSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
