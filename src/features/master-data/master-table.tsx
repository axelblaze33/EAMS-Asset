"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Loader2, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComboboxField, Field, applyFieldErrors, type Option } from "@/components/shared/form-fields";
import { cn } from "@/lib/utils";
import { MASTER, displayField, type MasterEntity, type MasterField, type MasterOptionSource } from "./config";
import { saveMasterRecord, setMasterArchived } from "./actions";

type Row = Record<string, unknown> & { id: string; deletedAt: Date | null; usage: number };
type SelectOptions = Partial<Record<MasterOptionSource, Option[]>>;

/** What a cell shows: the related record's name for select fields, else the value. */
const shown = (row: Row, f: MasterField) => row[f.display ?? f.name];

export function MasterTable({ entity, rows, options = {} }: { entity: MasterEntity; rows: Row[]; options?: SelectOptions }) {
  const cfg = MASTER[entity];
  const fields = cfg.fields as MasterField[];
  const columns = fields.filter((f) => f.column);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (showArchived || !r.deletedAt) &&
        (!q || fields.some((f) => String(shown(r, f) ?? "").toLowerCase().includes(q))),
    );
  }, [rows, query, showArchived, fields]);

  const archivedCount = rows.filter((r) => r.deletedAt).length;

  function toggleArchive(row: Row) {
    startTransition(async () => {
      const result = await setMasterArchived({ entity, id: row.id, archived: !row.deletedAt });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${cfg.label.toLowerCase()}…`} className="pl-8" aria-label="Search" />
          </div>
          {archivedCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id={`archived-${entity}`} checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor={`archived-${entity}`} className="font-normal text-muted-foreground">
                Show archived ({archivedCount})
              </Label>
            </div>
          )}
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus />
          Add {cfg.singular}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) => (
                <TableHead key={c.name} className={cn(i === 0 && "pl-4")}>
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="text-right">In use</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="h-24 text-center text-muted-foreground">
                  {rows.length === 0 ? `No ${cfg.label.toLowerCase()} yet.` : "Nothing matches your search."}
                </TableCell>
              </TableRow>
            )}
            {visible.map((row) => (
              <TableRow key={row.id} className={cn(row.deletedAt && "opacity-60")}>
                {columns.map((c, i) => (
                  <TableCell key={c.name} className={cn(i === 0 && "pl-4 font-medium", c.mono && "font-mono text-xs")}>
                    {String(shown(row, c) ?? "—")}
                    {i === 0 && row.deletedAt && <span className="ml-2 text-xs font-normal text-muted-foreground">Archived</span>}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums text-muted-foreground">{row.usage}</TableCell>
                <TableCell className="pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${String(row[displayField(entity)])}`} disabled={pending} />}
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-36">
                      <DropdownMenuItem onClick={() => setEditing(row)}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleArchive(row)}>
                        {row.deletedAt ? <ArchiveRestore /> : <Archive />}
                        {row.deletedAt ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Archived {cfg.label.toLowerCase()} are hidden from pickers but stay on existing records and in history.
      </p>

      <MasterFormDialog entity={entity} row={editing} options={options} onClose={() => setEditing(null)} />
    </div>
  );
}

function MasterFormDialog({
  entity,
  row,
  options,
  onClose,
}: {
  entity: MasterEntity;
  row: Row | "new" | null;
  options: SelectOptions;
  onClose: () => void;
}) {
  const cfg = MASTER[entity];
  const isNew = row === "new";
  const [pending, startTransition] = useTransition();

  const initial = Object.fromEntries(
    (cfg.fields as MasterField[]).map((f) => [
      f.name,
      String((row && row !== "new" ? row[f.name] : (cfg.defaults as Record<string, unknown>)[f.name]) ?? ""),
    ]),
  );
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(cfg.schema as never),
    values: initial,
  });

  function onSubmit() {
    startTransition(async () => {
      const result = await saveMasterRecord({ entity, id: isNew ? null : (row as Row).id, values: form.getValues() });
      if (result.ok) {
        toast.success(result.message);
        onClose();
      } else {
        applyFieldErrors(result.fieldErrors, form.setError);
        toast.error(result.error);
      }
    });
  }

  const errors = form.formState.errors;

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? `Add ${cfg.singular}` : `Edit ${cfg.singular}`}</DialogTitle>
          <DialogDescription>{cfg.description}</DialogDescription>
        </DialogHeader>
        <form id={`master-form-${entity}`} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {(cfg.fields as MasterField[]).map((f) => (
            <Field
              key={f.name}
              label={f.required ? f.label : `${f.label} (optional)`}
              htmlFor={`f-${f.name}`}
              error={errors[f.name]?.message}
              hint={f.hint}
            >
              {f.type === "select" ? (
                <Controller
                  control={form.control}
                  name={f.name}
                  render={({ field }) => (
                    <ComboboxField
                      id={`f-${f.name}`}
                      value={field.value}
                      onChange={field.onChange}
                      options={selectOptions(options[f.optionsFrom!] ?? [], row, f)}
                      placeholder={`Select ${f.label.toLowerCase()}`}
                      invalid={!!errors[f.name]}
                      allowClear={!f.required}
                    />
                  )}
                />
              ) : f.type === "textarea" ? (
                <Textarea id={`f-${f.name}`} rows={3} {...form.register(f.name)} aria-invalid={!!errors[f.name]} />
              ) : (
                <Input
                  id={`f-${f.name}`}
                  type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  step={f.type === "number" ? "any" : undefined}
                  placeholder={f.placeholder}
                  className={cn(f.mono && "font-mono uppercase")}
                  {...form.register(f.name)}
                  aria-invalid={!!errors[f.name]}
                />
              )}
            </Field>
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={`master-form-${entity}`} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {isNew ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Keep an archived choice visible when the record being edited still uses it. */
function selectOptions(opts: Option[], row: Row | "new" | null, f: MasterField): Option[] {
  if (!row || row === "new") return opts;
  const current = String(row[f.name] ?? "");
  if (!current || opts.some((o) => o.value === current)) return opts;
  return [...opts, { value: current, label: `${String(row[f.display ?? f.name] ?? current)} (archived)` }];
}
