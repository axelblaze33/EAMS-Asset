"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxField, Field, SelectField, applyFieldErrors, type Option } from "@/components/shared/form-fields";
import { ASSET_CONDITION, ASSET_STATUS } from "@/lib/labels";
import { saveAsset } from "./actions";
import { ASSET_CONDITIONS, MANUAL_STATUSES, assetSchema, type AssetFormValues } from "./schemas";

export function AssetForm({
  id,
  defaults,
  options,
  lockedStatus,
}: {
  id?: string;
  defaults: AssetFormValues;
  options: { categories: Option[]; vendors: Option[]; branches: Option[]; departments: Option[] };
  /** Set when the asset is assigned: status can only change through a return. */
  lockedStatus?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<AssetFormValues>({ resolver: zodResolver(assetSchema) as never, defaultValues: defaults });
  const specs = useFieldArray({ control: form.control, name: "specifications" });
  const errors = form.formState.errors;

  function onSubmit() {
    startTransition(async () => {
      const result = await saveAsset({ id, values: form.getValues() });
      if (result.ok) {
        toast.success(result.message);
        router.push(`/assets/${result.data.id}`);
      } else {
        applyFieldErrors(result.fieldErrors, form.setError);
        toast.error(result.error);
      }
    });
  }

  const text = (name: keyof AssetFormValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field label={label} htmlFor={name} error={errors[name]?.message as string | undefined}>
      <Input id={name} {...props} {...form.register(name)} aria-invalid={!!errors[name]} />
    </Field>
  );
  const combo = (name: "categoryId" | "vendorId" | "branchId" | "departmentId", label: string, opts: Option[]) => (
    <Field label={label} error={errors[name]?.message}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <ComboboxField value={field.value} onChange={field.onChange} options={opts} placeholder={`Select ${label.replace(" (optional)", "").toLowerCase()}`} invalid={!!errors[name]} allowClear={name !== "categoryId"} />
        )}
      />
    </Field>
  );

  const statusOptions = (lockedStatus ? (["ASSIGNED"] as const) : MANUAL_STATUSES).map((s) => ({ value: s, label: ASSET_STATUS[s].label }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
          <CardDescription>{id ? "The asset ID can't be changed." : "An asset ID like AST-000123 is generated when you save."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {text("name", "Asset name", { placeholder: "Dell Latitude 7440" })}
          {combo("categoryId", "Category", options.categories)}
          {text("brand", "Brand (optional)")}
          {text("model", "Model (optional)")}
          {text("serialNumber", "Serial number (optional)", { className: "font-mono" })}
          {text("assetTag", "Asset tag / barcode (optional)", { className: "font-mono" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status and location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Status"
            error={errors.status?.message}
            hint={lockedStatus ? "Assigned assets change status when they're returned." : "Assigned is set automatically when you assign the asset."}
          >
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => <SelectField value={field.value} onChange={field.onChange} options={statusOptions} disabled={lockedStatus} />}
            />
          </Field>
          <Field label="Condition" error={errors.condition?.message}>
            <Controller
              control={form.control}
              name="condition"
              render={({ field }) => (
                <SelectField value={field.value} onChange={field.onChange} options={ASSET_CONDITIONS.map((c) => ({ value: c, label: ASSET_CONDITION[c].label }))} />
              )}
            />
          </Field>
          {combo("branchId", "Location / branch (optional)", options.branches)}
          {combo("departmentId", "Owning department (optional)", options.departments)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase and warranty</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {text("purchaseDate", "Purchase date (optional)", { type: "date" })}
          {text("purchaseCost", "Purchase cost, ₹ (optional)", { inputMode: "decimal", placeholder: "98500" })}
          {combo("vendorId", "Vendor (optional)", options.vendors)}
          {text("invoiceNumber", "Invoice number (optional)")}
          {text("warrantyStart", "Warranty start (optional)", { type: "date" })}
          {text("warrantyExpiry", "Warranty expiry (optional)", { type: "date" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specifications</CardTitle>
          <CardDescription>Free-form details such as CPU, RAM, storage, screen size or IMEI.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {specs.fields.map((f, i) => (
            <div key={f.id} className="flex gap-2">
              <Input placeholder="e.g. RAM" aria-label="Specification name" className="w-1/3" {...form.register(`specifications.${i}.key`)} />
              <Input placeholder="e.g. 16 GB" aria-label="Specification value" {...form.register(`specifications.${i}.value`)} />
              <Button type="button" variant="ghost" size="icon" onClick={() => specs.remove(i)} aria-label="Remove specification">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => specs.append({ key: "", value: "" })}>
            <Plus />
            Add specification
          </Button>
          <Field label="Description / notes (optional)" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...form.register("description")} />
          </Field>
        </CardContent>
      </Card>

      {!id && (
        <p className="text-sm text-muted-foreground">You can attach an image, the invoice and other documents on the asset page after saving.</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {id ? "Save changes" : "Add asset"}
        </Button>
      </div>
    </form>
  );
}
