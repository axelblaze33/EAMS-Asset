"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ComboboxField, Field, SelectField, applyFieldErrors, type Option } from "@/components/shared/form-fields";
import { EMPLOYMENT_STATUS } from "@/lib/labels";
import { saveEmployee } from "./actions";
import { EMPLOYMENT_STATUSES, employeeSchema, type EmployeeFormValues } from "./schemas";

export function EmployeeForm({
  id,
  defaults,
  options,
}: {
  id?: string;
  defaults: EmployeeFormValues;
  options: { departments: Option[]; designations: Option[]; branches: Option[]; managers: Option[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema) as never,
    defaultValues: defaults,
  });
  const errors = form.formState.errors;

  function onSubmit() {
    startTransition(async () => {
      const result = await saveEmployee({ id, values: form.getValues() });
      if (result.ok) {
        toast.success(result.message);
        router.push(`/employees/${result.data.id}`);
      } else {
        applyFieldErrors(result.fieldErrors, form.setError);
        toast.error(result.error);
      }
    });
  }

  const select = (name: "departmentId" | "designationId" | "branchId", opts: Option[], label: string) => (
    <Field label={`${label} (optional)`} error={errors[name]?.message}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <ComboboxField value={field.value} onChange={field.onChange} options={opts} placeholder={`Select ${label.toLowerCase()}`} />
        )}
      />
    </Field>
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Email must be unique. It is used to link the employee to a login.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID" htmlFor="employeeCode" error={errors.employeeCode?.message}>
            <Input id="employeeCode" className="font-mono uppercase" placeholder="EMP1025" {...form.register("employeeCode")} aria-invalid={!!errors.employeeCode} />
          </Field>
          <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
            <Input id="fullName" {...form.register("fullName")} aria-invalid={!!errors.fullName} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...form.register("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="Contact number (optional)" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" {...form.register("phone")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {select("departmentId", options.departments, "Department")}
          {select("designationId", options.designations, "Designation")}
          {select("branchId", options.branches, "Branch")}
          <Field label="Reporting manager (optional)" error={errors.managerId?.message}>
            <Controller
              control={form.control}
              name="managerId"
              render={({ field }) => (
                <ComboboxField value={field.value} onChange={field.onChange} options={options.managers} placeholder="Select manager" searchPlaceholder="Search by name or ID…" />
              )}
            />
          </Field>
          <Field label="Joining date (optional)" htmlFor="joiningDate" error={errors.joiningDate?.message}>
            <Input id="joiningDate" type="date" {...form.register("joiningDate")} aria-invalid={!!errors.joiningDate} />
          </Field>
          <Field label="Employment status" error={errors.employmentStatus?.message} hint={id ? "An employee holding assets can't be marked as exited." : undefined}>
            <Controller
              control={form.control}
              name="employmentStatus"
              render={({ field }) => (
                <SelectField
                  value={field.value}
                  onChange={field.onChange}
                  options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: EMPLOYMENT_STATUS[s].label }))}
                />
              )}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {id ? "Save changes" : "Add employee"}
        </Button>
      </div>
    </form>
  );
}
