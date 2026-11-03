import Link from "next/link";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/list-controls";
import { requirePagePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/dates";
import { param, parseList } from "@/lib/list-params";
import type { Prisma } from "@/generated/prisma/client";
import { AuditDateFilter } from "@/features/audit/audit-date-filter";

export const metadata = { title: "Audit Log" };

const PATH = "/settings/audit";
const ENTITY_LABEL: Record<string, string> = {
  Asset: "Assets",
  Employee: "Employees",
  User: "Users",
  Role: "Roles",
  AssetRequest: "Requests",
  EmployeeExitClearance: "Exit clearance",
  AssetCategory: "Categories",
  Department: "Departments",
  Designation: "Designations",
  Branch: "Branches",
  Vendor: "Vendors",
  Report: "Report exports",
  System: "System",
};
const ENTITY_LINK: Record<string, string> = { Asset: "/assets", Employee: "/employees", EmployeeExitClearance: "/clearance" };
const IGNORED = new Set(["updatedAt", "createdAt", "id", "passwordHash"]);

/** Field-level differences between two audit snapshots. */
function diff(before: unknown, after: unknown) {
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before)) return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const show = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.join(", ").slice(0, 80) : "—";
    const s = String(v);
    // Snapshots store dates as ISO strings; calendar dates are UTC midnight.
    if (/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(s)) return s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16).replace("T", " ");
    return s.slice(0, 80);
  };
  // Embedded related records (e.g. an included asset) aren't fields of this record.
  const nested = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
  return Object.keys({ ...b, ...a })
    .filter((k) => !IGNORED.has(k) && !nested(b[k]) && !nested(a[k]) && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .slice(0, 15)
    .map((k) => ({ field: k, from: show(b[k]), to: show(a[k]) }));
}

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  await requirePagePermission("audit:read");
  const sp = await searchParams;
  const f = parseList(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultDir: "desc" });
  const entity = param(sp, "entity");
  const actor = param(sp, "actor");
  const from = param(sp, "from") ? parseDateInput(param(sp, "from")!) : null;
  const to = param(sp, "to") ? parseDateInput(param(sp, "to")!) : null;

  const where: Prisma.AuditLogWhereInput = {
    entityType: entity && entity in ENTITY_LABEL ? entity : undefined,
    actorId: actor,
    createdAt: from || to ? { ...(from && { gte: from }), ...(to && { lt: new Date(to.getTime() + 86_400_000) }) } : undefined,
    ...(f.q && { OR: [{ summary: { contains: f.q, mode: "insensitive" } }, { action: { contains: f.q, mode: "insensitive" } }] }),
  };
  const [rows, total, users] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: f.skip, take: f.pageSize, include: { actor: { select: { name: true } } } }),
    db.auditLog.count({ where }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Audit log" description="Every change made in EAMS: who did it, when, and what changed. Entries can't be edited or deleted." />
      <ListToolbar
        searchPlaceholder="Search action or description…"
        filters={[
          { key: "entity", label: "Record types", options: Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label })) },
          { key: "actor", label: "Users", options: users.map((u) => ({ value: u.id, label: u.name })) },
        ]}
      >
        <AuditDateFilter />
      </ListToolbar>

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries match" />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40 pl-4">When</TableHead>
                  <TableHead className="w-36">User</TableHead>
                  <TableHead>What happened</TableHead>
                  <TableHead className="hidden w-28 lg:table-cell">IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const changes = diff(r.before, r.after);
                  const link = ENTITY_LINK[r.entityType] && r.entityId !== "bulk" ? `${ENTITY_LINK[r.entityType]}/${r.entityId}` : null;
                  return (
                    <TableRow key={r.id} className="align-top">
                      <TableCell className="pl-4 text-sm">
                        {format(r.createdAt, "d MMM yyyy")}
                        <div className="text-xs text-muted-foreground">{format(r.createdAt, "HH:mm:ss")}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.actor?.name ?? <span className="text-muted-foreground">System</span>}</TableCell>
                      <TableCell className="max-w-xl whitespace-normal">
                        <div className="text-sm">
                          {link ? (
                            <Link href={link} className="hover:text-primary hover:underline">
                              {r.summary ?? r.action}
                            </Link>
                          ) : (
                            (r.summary ?? r.action)
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{r.action}</div>
                        {changes.length > 0 && (
                          <details className="mt-1.5 text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              {changes.length} field{changes.length === 1 ? "" : "s"} changed
                            </summary>
                            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2">
                              {changes.map((c) => (
                                <div key={c.field} className="contents">
                                  <dt className="font-mono text-muted-foreground">{c.field}</dt>
                                  <dd className="min-w-0 break-words">
                                    <span className="text-destructive line-through decoration-destructive/40">{c.from}</span> → <span>{c.to}</span>
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{r.ipAddress ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination total={total} page={f.page} pageSize={f.pageSize} pathname={PATH} sp={sp} />
        </div>
      )}
    </>
  );
}
