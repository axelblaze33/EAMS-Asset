"use client";

import { useRef } from "react";
import { FileImage, FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareStagedUpload } from "@/features/uploads/actions";
import type { StagedFile } from "@/lib/storage-types";

const MAX_BYTES = 10 * 1024 * 1024;

/** Local file list; nothing is uploaded until the form is submitted. */
export function FilePicker({
  files,
  onChange,
  accept = "application/pdf,image/jpeg,image/png,image/webp",
  label = "Attach files",
  max = 6,
  disabled,
  storageReady,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  label?: string;
  max?: number;
  disabled?: boolean;
  storageReady: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  if (!storageReady) {
    return <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">File uploads are off until Supabase Storage is configured.</p>;
  }
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((f) => f.size > 0 && f.size <= MAX_BYTES);
          onChange([...files, ...picked].slice(0, max));
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={disabled || files.length >= max}>
        <Paperclip />
        {label}
      </Button>
      {files.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              {f.type.startsWith("image/") ? <FileImage className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} disabled={disabled}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">PDF, JPG, PNG or WebP, up to 10 MB each.</p>
    </div>
  );
}

/** Uploads files straight to storage; returns references for the server action to verify. */
export async function uploadStaged(files: File[], opts: { imagesOnly?: boolean } = {}): Promise<StagedFile[]> {
  const out: StagedFile[] = [];
  for (const file of files) {
    const target = await prepareStagedUpload({ fileName: file.name, mimeType: file.type, size: file.size, imagesOnly: opts.imagesOnly });
    if (!target.ok) throw new Error(target.error);
    const put = await fetch(target.data.signedUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
    if (!put.ok) throw new Error(`Uploading "${file.name}" failed. Please try again.`);
    out.push({ path: target.data.path, fileName: file.name, mimeType: file.type, size: file.size });
  }
  return out;
}
