"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TONE_CLASS } from "@/lib/labels";
import type { ActionResult } from "@/lib/action-result";
import type { ImportSummary } from "@/lib/import-types";

export function ImportDialog({
  title,
  description,
  templateHref,
  action,
}: {
  title: string;
  description: string;
  templateHref: string;
  action: (formData: FormData) => Promise<ActionResult<ImportSummary>>;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setSummary(null);
    setOnlyErrors(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function run(mode: "preview" | "commit") {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSummary(result.data);
      if (result.data.committed) {
        toast.success(`Imported ${result.data.creates + result.data.updates} row(s)`);
      }
    });
  }

  const writable = summary ? summary.creates + summary.updates : 0;
  const rows = summary?.rows.filter((r) => !onlyErrors || r.action === "error") ?? [];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload />
        Import
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {!summary?.committed && (
            <div className="space-y-3">
              <a href={templateHref} className={cn(buttonVariants({ variant: "link" }), "h-auto px-0")}>
                <Download />
                Download the Excel template
              </a>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors hover:bg-muted/50"
              >
                <FileSpreadsheet className="size-6 text-muted-foreground" />
                {file ? (
                  <span className="font-medium">{file.name}</span>
                ) : (
                  <span className="text-muted-foreground">Choose a .xlsx or .csv file (max 3 MB, 2,000 rows)</span>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setSummary(null);
                  }}
                />
              </label>
            </div>
          )}

          {summary && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className={cn("rounded-full px-2.5 py-0.5", TONE_CLASS.success)}>
                  {summary.creates} {summary.committed ? "added" : "new"}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5", TONE_CLASS.info)}>
                  {summary.updates} {summary.committed ? "updated" : "to update"}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5", summary.errors ? TONE_CLASS.danger : TONE_CLASS.muted)}>
                  {summary.errors} with errors{summary.committed && summary.errors ? " (skipped)" : ""}
                </span>
                {summary.errors > 0 && (
                  <button type="button" className="ml-auto text-xs text-muted-foreground underline" onClick={() => setOnlyErrors((v) => !v)}>
                    {onlyErrors ? "Show all rows" : "Show only errors"}
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14 pl-3">Row</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="pl-3 align-top tabular-nums text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="align-top">{r.label}</TableCell>
                        <TableCell className="align-top whitespace-normal">
                          {r.action === "error" ? (
                            <ul className="space-y-0.5 text-destructive">
                              {r.errors.map((e, i) => (
                                <li key={i} className="flex gap-1.5">
                                  <XCircle className="mt-0.5 size-3.5 shrink-0" />
                                  {e}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <CheckCircle2 className="size-3.5 text-emerald-600" />
                              {r.action === "create" ? "New" : "Update existing"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            {summary?.committed ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : summary ? (
              <>
                <Button variant="outline" onClick={reset} disabled={pending}>
                  Choose another file
                </Button>
                <Button onClick={() => run("commit")} disabled={pending || writable === 0}>
                  {pending && <Loader2 className="animate-spin" />}
                  Import {writable} valid row{writable === 1 ? "" : "s"}
                </Button>
              </>
            ) : (
              <Button onClick={() => run("preview")} disabled={!file || pending}>
                {pending && <Loader2 className="animate-spin" />}
                Validate file
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
