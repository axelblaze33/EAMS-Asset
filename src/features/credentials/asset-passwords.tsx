"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Copy, Eye, EyeOff, History, KeyRound, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-fields";
import { cn } from "@/lib/utils";
import { deleteCredential, revealCredential, saveCredential } from "./actions";

type HistoryRow = { id: string; event: "CREATED" | "UPDATED" | "DELETED"; username: string | null; reason: string | null; changedAt: Date; changedBy: { name: string } | null; hasSecret: boolean };
type Entry = { id: string; label: string; username: string | null; notes: string | null; updatedAt: Date; updatedBy: { name: string } | null; history: HistoryRow[] };

const HIDE_AFTER_MS = 30_000;
const LABELS = ["Windows login", "macOS login", "BIOS / UEFI", "Local admin", "Disk encryption (BitLocker)", "Phone PIN"];
const EVENT_LABEL = { CREATED: "Set", UPDATED: "Changed", DELETED: "Removed" } as const;

function generatePassword(length = 16) {
  // No look-alike characters (0/O, 1/l/I) so it can be read off a screen.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** Reveals a password via the server (audited) and hides it again after 30 seconds. */
function useReveal() {
  const [shown, setShown] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const hide = (key: string) =>
    setShown((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });

  function fetchValue(id: string, historyId?: string) {
    return revealCredential({ id, historyId }).then((r) => {
      if (!r.ok) {
        toast.error(r.error);
        return null;
      }
      return r.data.password;
    });
  }

  function toggle(key: string, id: string, historyId?: string) {
    if (shown[key] !== undefined) return hide(key);
    startTransition(async () => {
      const value = await fetchValue(id, historyId);
      if (value === null) return;
      setShown((s) => ({ ...s, [key]: value }));
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => hide(key), HIDE_AFTER_MS);
    });
  }

  function copy(key: string, id: string, historyId?: string) {
    startTransition(async () => {
      const value = shown[key] ?? (await fetchValue(id, historyId));
      if (value === null) return;
      await navigator.clipboard.writeText(value);
      toast.success("Password copied", { description: "Paste it where you need it; your clipboard isn't cleared automatically." });
    });
  }

  return { shown, toggle, copy, pending };
}

export function AssetPasswords({ assetId, entries, canManage, enabled }: { assetId: string; entries: Entry[]; canManage: boolean; enabled: boolean }) {
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const reveal = useReveal();

  if (!enabled) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        Password storage is off. Set <span className="font-mono text-xs">CREDENTIALS_ENCRYPTION_KEY</span> to enable it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No passwords saved for this asset.</p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((e) => {
            const value = reveal.shown[e.id];
            return (
              <li key={e.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{e.label}</span>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Actions for ${e.label}`} />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-40">
                            <DropdownMenuItem onClick={() => setEditing(e)}>
                              <Pencil />
                              Edit / change
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setRemoving(e)}>
                              <Trash2 />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {e.username && (
                      <div className="text-xs text-muted-foreground">
                        User: <span className="font-mono text-foreground">{e.username}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <code className={cn("min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm", value === undefined && "tracking-widest text-muted-foreground")}>
                        {value ?? "••••••••••"}
                      </code>
                      <Button variant="ghost" size="icon-sm" onClick={() => reveal.toggle(e.id, e.id)} disabled={reveal.pending} aria-label={value === undefined ? "Reveal password" : "Hide password"} title={value === undefined ? "Reveal (logged)" : "Hide"}>
                        {value === undefined ? <Eye /> : <EyeOff />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => reveal.copy(e.id, e.id)} disabled={reveal.pending} aria-label="Copy password" title="Copy (logged)">
                        <Copy />
                      </Button>
                    </div>
                    {e.notes && <p className="text-xs whitespace-pre-line text-muted-foreground">{e.notes}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        Updated {formatDistanceToNow(new Date(e.updatedAt), { addSuffix: true })}
                        {e.updatedBy && ` by ${e.updatedBy.name}`}
                      </span>
                      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setHistoryOpen(historyOpen === e.id ? null : e.id)}>
                        <History className="size-3.5" />
                        History ({e.history.length})
                      </button>
                    </div>
                    {historyOpen === e.id && (
                      <ol className="mt-1 space-y-1.5 border-l pl-3">
                        {e.history.map((h, i) => {
                          const key = `${e.id}:${h.id}`;
                          const hv = reveal.shown[key];
                          return (
                            <li key={h.id} className="text-xs">
                              <div className="flex flex-wrap items-center gap-x-1.5">
                                <span className="font-medium text-foreground">{EVENT_LABEL[h.event]}</span>
                                {i === 0 && h.event !== "DELETED" && <span className="rounded bg-brand-soft px-1 text-[10px] text-primary">current</span>}
                                <span className="text-muted-foreground">
                                  by {h.changedBy?.name ?? "Unknown"} · {format(new Date(h.changedAt), "d MMM yyyy, HH:mm")}
                                </span>
                              </div>
                              {(h.username || h.reason) && (
                                <div className="text-muted-foreground">
                                  {h.username && <>User {h.username}</>}
                                  {h.username && h.reason && " · "}
                                  {h.reason && <>Reason: {h.reason}</>}
                                </div>
                              )}
                              {h.hasSecret && (
                                <div className="mt-0.5 flex items-center gap-1">
                                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{hv ?? "••••••"}</code>
                                  <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={reveal.pending} onClick={() => reveal.toggle(key, e.id, h.id)}>
                                    {hv === undefined ? "Show" : "Hide"}
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus />
          Add password
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Passwords are encrypted. Every view and copy is recorded in the audit log.</p>

      <CredentialDialog key={editing === "new" ? "new" : (editing?.id ?? "closed")} assetId={assetId} entry={editing} onClose={() => setEditing(null)} />
      <RemoveDialog entry={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

function CredentialDialog({ assetId, entry, onClose }: { assetId: string; entry: Entry | "new" | null; onClose: () => void }) {
  const isNew = entry === "new";
  const current = entry && entry !== "new" ? entry : null;
  // Mounted with a key per entry (see AssetPasswords), so state starts fresh each time.
  const [label, setLabel] = useState(current?.label ?? "");
  const [username, setUsername] = useState(current?.username ?? "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [reason, setReason] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await saveCredential({ assetId, id: current?.id, label, username, password, notes, reason });
      if (r.ok) {
        toast.success(r.message);
        onClose();
      } else toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0]![0]! : r.error);
    });
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Save a password" : `Edit ${current?.label}`}</DialogTitle>
          <DialogDescription>
            {isNew ? "Stored encrypted. Only people allowed to view passwords can reveal it." : "Leave the password empty to keep the current one. Changes are kept in the history."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="What is it for?" htmlFor="cred-label">
            <Input id="cred-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Windows login" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {LABELS.map((l) => (
                <button key={l} type="button" onClick={() => setLabel(l)} className="rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Username (optional)" htmlFor="cred-user">
            <Input id="cred-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className="font-mono" />
          </Field>
          <Field label={isNew ? "Password" : "New password (optional)"} htmlFor="cred-pass">
            <div className="flex gap-1.5">
              <Input
                id="cred-pass"
                type={visible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide password" : "Show password"}>
                {visible ? <EyeOff /> : <Eye />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setPassword(generatePassword());
                  setVisible(true);
                }}
                aria-label="Generate a strong password"
                title="Generate a strong password"
              >
                <RefreshCw />
              </Button>
            </div>
          </Field>
          {!isNew && (
            <Field label="Reason for change (optional)" htmlFor="cred-reason">
              <Input id="cred-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reassigned to new employee" />
            </Field>
          )}
          <Field label="Notes (optional)" htmlFor="cred-notes">
            <Textarea id="cred-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Not secret. Shown to anyone who can see passwords." />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !label.trim() || (isNew && !password)}>
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={!!entry}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setReason("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {entry?.label}?</DialogTitle>
          <DialogDescription>It disappears from this asset. Its history, including old values, stays available to auditors.</DialogDescription>
        </DialogHeader>
        <Field label="Reason (optional)" htmlFor="rm-reason">
          <Input id="rm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Device wiped" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteCredential({ id: entry!.id, reason });
                if (r.ok) {
                  toast.success(r.message);
                  onClose();
                  setReason("");
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
