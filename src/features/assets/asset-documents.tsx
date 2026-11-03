"use client";

import { useRef, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, FileImage, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { DOCUMENT_TYPE } from "@/lib/labels";
import { attachAssetDocument, deleteAssetDocument, getAssetDocumentUrl, prepareAssetUpload } from "./documents";

type Doc = {
  id: string;
  type: keyof typeof DOCUMENT_TYPE;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: { name: string } | null;
};

type UploadType = "ASSET_IMAGE" | "INVOICE" | "OTHER";

const ACCEPT: Record<UploadType, string> = {
  ASSET_IMAGE: "image/jpeg,image/png,image/webp",
  INVOICE: "application/pdf,image/jpeg,image/png,image/webp",
  OTHER: "application/pdf,image/jpeg,image/png,image/webp",
};

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function AssetDocuments({
  assetId,
  documents,
  canEdit,
  storageReady,
}: {
  assetId: string;
  documents: Doc[];
  canEdit: boolean;
  storageReady: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<UploadType>("INVOICE");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(type: UploadType) {
    setUploadType(type);
    if (inputRef.current) {
      inputRef.current.accept = ACCEPT[type];
      inputRef.current.click();
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const meta = { assetId, type: uploadType, fileName: file.name, mimeType: file.type, size: file.size };
      const target = await prepareAssetUpload(meta);
      if (!target.ok) throw new Error(target.error);
      // Straight to storage: the file never passes through our server.
      const put = await fetch(target.data.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed. Please try again.");
      const attached = await attachAssetDocument({ ...meta, path: target.data.path });
      if (!attached.ok) throw new Error(attached.error);
      toast.success(attached.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function open(doc: Doc) {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await getAssetDocumentUrl({ documentId: doc.id });
      if (result.ok && tab) tab.location.href = result.data.url;
      else {
        tab?.close();
        toast.error(result.ok ? "Allow pop-ups to open files." : result.error);
      }
    });
  }

  function remove(doc: Doc) {
    if (!window.confirm(`Delete ${doc.fileName}? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteAssetDocument({ documentId: doc.id });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <>
          <input ref={inputRef} type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {storageReady ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy ? "Uploading…" : "Upload file"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuItem onClick={() => choose("ASSET_IMAGE")}>
                  <FileImage />
                  Asset image
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => choose("INVOICE")}>
                  <FileText />
                  Invoice / purchase document
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => choose("OTHER")}>
                  <FileText />
                  Other document
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              File uploads are off: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable them.
            </p>
          )}
        </>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2">
              {doc.mimeType.startsWith("image/") ? (
                <FileImage className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => open(doc)} className="block max-w-full truncate text-left text-sm font-medium hover:underline" disabled={pending}>
                  {doc.fileName}
                </button>
                <div className="text-xs text-muted-foreground">
                  {size(doc.sizeBytes)} · {doc.uploadedBy?.name ?? "Unknown"} · {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                </div>
              </div>
              <StatusBadge meta={DOCUMENT_TYPE} value={doc.type} className="hidden sm:inline-flex" />
              <Button variant="ghost" size="icon-sm" onClick={() => open(doc)} aria-label={`Open ${doc.fileName}`} disabled={pending}>
                <ExternalLink />
              </Button>
              {canEdit && (
                <Button variant="ghost" size="icon-sm" onClick={() => remove(doc)} aria-label={`Delete ${doc.fileName}`} disabled={pending}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
