"use client";

import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, SelectField, applyFieldErrors, type Option } from "@/components/shared/form-fields";
import { passwordSchema } from "@/features/auth/schemas";
import { createUser, updateUser } from "./actions";
import type { EmployeeOption, UserRow } from "./queries";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().pipe(z.email("Enter a valid email")),
  roleId: z.string().min(1, "Choose a role"),
  employeeId: z.string(),
  password: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

const NO_EMPLOYEE = "none";

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  roles,
  employees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this user; otherwise it creates one. */
  user?: UserRow | null;
  roles: Option[];
  employees: EmployeeOption[];
}) {
  const editing = Boolean(user);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(
      editing
        ? formSchema
        : formSchema.extend({ password: passwordSchema }),
    ),
    defaultValues: { name: "", email: "", roleId: "", employeeId: NO_EMPLOYEE, password: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: user?.name ?? "",
      email: user?.email ?? "",
      roleId: user?.role.id ?? "",
      employeeId: user?.employee?.id ?? NO_EMPLOYEE,
      password: "",
    });
  }, [open, user, form]);

  const employeeOptions: Option[] = [
    { value: NO_EMPLOYEE, label: "Not linked" },
    ...employees
      .filter((e) => !e.user || e.user.id === user?.id)
      .map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` })),
  ];

  // Picking an employee pre-fills name and email for new users.
  function onEmployeeChange(id: string) {
    form.setValue("employeeId", id);
    const emp = employees.find((e) => e.id === id);
    if (!editing && emp) {
      if (!form.getValues("name")) form.setValue("name", emp.fullName);
      if (!form.getValues("email")) form.setValue("email", emp.email);
    }
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = user
        ? await updateUser({ id: user.id, name: values.name, roleId: values.roleId, employeeId: values.employeeId })
        : await createUser(values);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        applyFieldErrors(result.fieldErrors, form.setError);
        toast.error(result.error);
      }
    });
  }

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit user" : "Create user"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change the role or employee link. Role changes apply on the user's next page load."
              : "Give an IT or HR team member access to EAMS. Share the temporary password with them securely."}
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Linked employee (optional)" hint="Link a staff login to their own employee record, if they have one.">
            <Controller
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <SelectField value={field.value} onChange={onEmployeeChange} options={employeeOptions} />
              )}
            />
          </Field>
          <Field label="Full name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...form.register("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" disabled={editing} {...form.register("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Role" error={errors.roleId?.message}>
            <Controller
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <SelectField value={field.value} onChange={field.onChange} options={roles} invalid={!!errors.roleId} placeholder="Choose a role" />
              )}
            />
          </Field>
          {!editing && (
            <Field
              label="Temporary password"
              htmlFor="password"
              error={errors.password?.message}
              hint="At least 10 characters with upper, lower case and a number."
            >
              <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={!!errors.password} />
            </Field>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
