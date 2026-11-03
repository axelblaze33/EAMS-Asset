"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePicker, uploadStaged } from "@/components/shared/file-picker";
import { getAssetDocumentUrl } from "@/features/assets/documents";
import { attachHandoverDocuments } from "./actions";

/** Lists stored documents (opened via short-lived links); optionally attaches handover copies. */
export function HandoverFiles({
  assignmentId,
  documents,
  canAttach,
  storageReady,
  emptyText = "No signed copy attached yet.",
}: {
  assignmentId: string;
  documents: { id: string; fileName: string }[];
  canAttach: boolean;
  storageReady: boolean;
  emptyText?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();

  function attach() {
    startTransition(async () => {
      try {
        const staged = await uploadStaged(files);
        const result = await attachHandoverDocuments({ assignmentId, documents: staged });
        if (!result.ok) throw new Error(result.error);
        toast.success(result.message);
        setFiles([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  function open(id: string) {
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const r = await getAssetDocumentUrl({ documentId: id });
      if (r.ok && tab) tab.location.href = r.data.url;
      else {
        tab?.close();
        toast.error(r.ok ? "Allow pop-ups to open files." : r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {documents.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {documents.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => open(d.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{d.fileName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
      {canAttach && (
        <div className="space-y-2">
          <FilePicker files={files} onChange={setFiles} storageReady={storageReady} disabled={pending} label="Choose signed copy" />
          {files.length > 0 && (
            <Button size="sm" onClick={attach} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Upload />}
              Upload {files.length} file{files.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
