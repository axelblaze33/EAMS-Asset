"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxField, Field, SelectField, type Option } from "@/components/shared/form-fields";
import { FilePicker, uploadStaged } from "@/components/shared/file-picker";
import { ASSET_STATUS, PRIORITY } from "@/lib/labels";
import { createTicket } from "./actions";
import { PRIORITIES } from "./schemas";

type AssetOpt = { id: string; assetCode: string; name: string; status: keyof typeof ASSET_STATUS; serialNumber: string | null };

export function TicketForm({
  assets,
  assignees,
  vendors,
  initialAssetId,
  currentUserId,
  today,
  storageReady,
}: {
  assets: AssetOpt[];
  assignees: Option[];
  vendors: Option[];
  initialAssetId?: string;
  currentUserId: string;
  today: string;
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assetId, setAssetId] = useState(initialAssetId && assets.some((a) => a.id === initialAssetId) ? initialAssetId : "");
  const [issue, setIssue] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState(assignees.some((a) => a.value === currentUserId) ? currentUserId : "");
  const [vendorId, setVendorId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [takeOut, setTakeOut] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const asset = assets.find((a) => a.id === assetId);
  const assigned = asset?.status === "ASSIGNED";

  function submit() {
    const errs: Record<string, string> = {};
    if (!assetId) errs.assetId = "Choose an asset";
    if (issue.trim().length < 5) errs.issue = "Describe the issue";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    startTransition(async () => {
      try {
        const documents = files.length ? await uploadStaged(files) : [];
        const r = await createTicket({ assetId, issue, priority, assigneeId, vendorId, startedAt, takeOutOfService: takeOut, documents });
        if (!r.ok) {
          setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v[0]!])));
          toast.error(r.error);
          return;
        }
        toast.success(r.message);
        router.push(`/maintenance/${r.data.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>What needs fixing?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset" error={errors.assetId} className="sm:col-span-2">
            <ComboboxField
              value={assetId}
              onChange={setAssetId}
              invalid={!!errors.assetId}
              placeholder="Search by asset ID, name or serial"
              options={assets.map((a) => ({
                value: a.id,
                label: `${a.assetCode} · ${a.name}`,
                hint: [ASSET_STATUS[a.status].label, a.serialNumber && `S/N ${a.serialNumber}`].filter(Boolean).join(" · "),
              }))}
            />
          </Field>
          <Field label="Issue" htmlFor="issue" error={errors.issue} className="sm:col-span-2">
            <Textarea id="issue" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. Battery drains within two hours; laptop shuts down at 20%" aria-invalid={!!errors.issue} />
          </Field>
          <Field label="Priority">
            <SelectField value={priority} onChange={(v) => setPriority(v as typeof priority)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label }))} />
          </Field>
          <Field label="Assigned to (optional)">
            <ComboboxField value={assigneeId} onChange={setAssigneeId} options={assignees} placeholder="Who is handling it" />
          </Field>
          <Field label="Service provider (optional)">
            <ComboboxField value={vendorId} onChange={setVendorId} options={vendors} placeholder="Vendor or repair shop" />
          </Field>
          <Field label="Work started (optional)" htmlFor="startedAt" hint="Leave blank if work hasn't started yet.">
            <Input id="startedAt" type="date" max={today} value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </Field>
          {asset && (
            <div className="sm:col-span-2">
              {assigned ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  This asset is assigned to an employee, so it stays assigned while the ticket is open (e.g. an on-site repair). Process a return first if it&apos;s coming back for repair.
                </p>
              ) : asset.status !== "UNDER_MAINTENANCE" ? (
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox checked={takeOut} onCheckedChange={(v) => setTakeOut(v === true)} className="mt-0.5" />
                  <span>
                    Mark the asset as <span className="font-medium">Under Maintenance</span> so it can&apos;t be assigned until the repair is done.
                    <span className="block text-xs text-muted-foreground">Currently {ASSET_STATUS[asset.status].label}.</span>
                  </span>
                </label>
              ) : null}
            </div>
          )}
          <Field label="Attachments (optional)" className="sm:col-span-2">
            <FilePicker files={files} onChange={setFiles} storageReady={storageReady} disabled={pending} label="Attach photos or quotes" />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Open ticket
        </Button>
      </div>
    </div>
  );
}

