"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxField, Field, SelectField, type Option } from "@/components/shared/form-fields";
import { PRIORITY, REQUEST_TYPE } from "@/lib/labels";
import { createRequest } from "./actions";

export function RequestForm({ employees, categories, initialEmployeeId }: { employees: (Option & { hint?: string })[]; categories: Option[]; initialEmployeeId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState({
    employeeId: initialEmployeeId ?? "",
    categoryId: "",
    type: "NEW_ASSET" as keyof typeof REQUEST_TYPE,
    priority: "MEDIUM" as keyof typeof PRIORITY,
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit() {
    startTransition(async () => {
      const r = await createRequest(v);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => [k, m[0]!])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.push("/requests");
    });
  }

  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="For employee" error={errors.employeeId} className="sm:col-span-2">
          <ComboboxField value={v.employeeId} onChange={(x) => set("employeeId", x)} options={employees} placeholder="Search by name or employee ID" invalid={!!errors.employeeId} />
        </Field>
        <Field label="Asset category" error={errors.categoryId}>
          <ComboboxField value={v.categoryId} onChange={(x) => set("categoryId", x)} options={categories} placeholder="e.g. Laptop" invalid={!!errors.categoryId} allowClear={false} />
        </Field>
        <Field label="Type">
          <SelectField value={v.type} onChange={(x) => set("type", x as typeof v.type)} options={Object.entries(REQUEST_TYPE).map(([value, m]) => ({ value, label: m.label }))} />
        </Field>
        <Field label="Priority">
          <SelectField value={v.priority} onChange={(x) => set("priority", x as typeof v.priority)} options={Object.entries(PRIORITY).map(([value, m]) => ({ value, label: m.label }))} />
        </Field>
        <Field label="Reason" htmlFor="reason" error={errors.reason} className="sm:col-span-2" hint="Who asked, and why. e.g. Manager request by email on 3 Nov; joining the design team.">
          <Textarea id="reason" rows={3} value={v.reason} onChange={(e) => set("reason", e.target.value)} aria-invalid={!!errors.reason} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Log request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
