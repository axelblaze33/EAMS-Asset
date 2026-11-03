"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/dal";
import { writeAudit } from "@/lib/audit";
import { ok, runAction, type ActionResult } from "@/lib/action";
import { readSpreadsheet } from "@/lib/spreadsheet";
import type { ImportRowResult, ImportSummary } from "@/lib/import-types";
import { EMPLOYMENT_STATUS } from "@/lib/labels";
import { EMPLOYMENT_STATUSES, employeeSchema } from "./schemas";

// Accepted header spellings (normalized: lowercase, alphanumerics only).
const COLUMNS = {
  employeeCode: ["employeeid", "employeecode", "empid", "empcode", "id"],
  fullName: ["fullname", "name", "employeename"],
  email: ["email", "emailaddress", "workemail"],
  phone: ["contactnumber", "phone", "mobile", "phonenumber"],
  department: ["department", "dept"],
  designation: ["designation", "title", "jobtitle"],
  branch: ["branch", "location", "branchlocation", "office"],
  manager: ["reportingmanager", "manager", "managerid", "reportingmanagerid"],
  joiningDate: ["joiningdate", "dateofjoining", "doj", "joindate"],
  status: ["employmentstatus", "status"],
} as const;

const FIELD_LABEL: Record<string, string> = {
  employeeCode: "Employee ID",
  fullName: "Full Name",
  email: "Email",
  phone: "Contact Number",
  joiningDate: "Joining Date",
  employmentStatus: "Status",
};

/** Schema field → spreadsheet column, where the names differ. */
const SOURCE_COLUMN: Record<string, keyof typeof COLUMNS> = {
  departmentId: "department",
  designationId: "designation",
  branchId: "branch",
  employmentStatus: "status",
};

function pick(values: Record<string, string>, field: keyof typeof COLUMNS) {
  for (const key of COLUMNS[field]) if (values[key]) return values[key]!;
  return "";
}

const byNameOrCode = (rows: { id: string; name: string; code?: string }[]) => {
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.name.toLowerCase(), r.id);
    if (r.code) map.set(r.code.toLowerCase(), r.id);
  }
  return map;
};

function parseStatus(raw: string) {
  if (!raw) return "ACTIVE";
  const n = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if ((EMPLOYMENT_STATUSES as readonly string[]).includes(n)) return n;
  const byLabel = Object.entries(EMPLOYMENT_STATUS).find(([, m]) => m.label.toLowerCase() === raw.toLowerCase());
  return byLabel?.[0] ?? null;
}

/**
 * mode=preview validates and reports what would happen. mode=commit re-reads and
 * re-validates the same file on the server, then writes only the valid rows in
 * one transaction. Nothing from the browser is trusted between the two steps.
 */
export async function importEmployees(formData: FormData): Promise<ActionResult<ImportSummary>> {
  return runAction(async () => {
    const actor = await authorize("employee:import");
    const commit = formData.get("mode") === "commit";
    const { rows } = await readSpreadsheet(formData.get("file") as File);

    const [departments, designations, branches, existing] = await Promise.all([
      db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
      db.designation.findMany({ where: { deletedAt: null }, select: { id: true, title: true } }),
      db.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
      db.employee.findMany({
        where: { deletedAt: null },
        select: { id: true, employeeCode: true, email: true, employmentStatus: true, _count: { select: { assignments: { where: { status: "ACTIVE" } } } } },
      }),
    ]);
    const deptMap = byNameOrCode(departments);
    const desigMap = byNameOrCode(designations.map((d) => ({ id: d.id, name: d.title })));
    const branchMap = byNameOrCode(branches);
    const existingByCode = new Map(existing.map((e) => [e.employeeCode, e]));
    const codeByEmail = new Map(existing.map((e) => [e.email, e.employeeCode]));

    const fileCodes = new Map<string, number>();
    const fileEmails = new Map<string, number>();
    type Parsed = ReturnType<typeof employeeSchema.parse>;
    const valid: { rowNumber: number; data: Parsed; updateData: Partial<Parsed>; managerCode: string; existingId?: string }[] = [];
    const results: ImportRowResult[] = [];

    for (const { rowNumber, values } of rows) {
      const errors: string[] = [];
      const code = pick(values, "employeeCode").toUpperCase();
      const email = pick(values, "email").toLowerCase();
      const name = pick(values, "fullName");

      const lookup = (raw: string, map: Map<string, string>, what: string) => {
        if (!raw) return "";
        const id = map.get(raw.toLowerCase());
        if (!id) errors.push(`Unknown ${what} "${raw}". Add it in Master Data first.`);
        return id ?? "";
      };
      const departmentId = lookup(pick(values, "department"), deptMap, "department");
      const designationId = lookup(pick(values, "designation"), desigMap, "designation");
      const branchId = lookup(pick(values, "branch"), branchMap, "branch");
      const status = parseStatus(pick(values, "status"));
      if (!status) errors.push(`Unknown status "${pick(values, "status")}". Use Active, On Notice, On Leave or Exited.`);

      const parsed = employeeSchema.safeParse({
        employeeCode: code,
        fullName: name,
        email,
        phone: pick(values, "phone"),
        departmentId,
        designationId,
        branchId,
        managerId: "",
        joiningDate: pick(values, "joiningDate"),
        employmentStatus: status ?? "ACTIVE",
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? "");
          errors.push(`${FIELD_LABEL[field] ?? field}: ${issue.message}`);
        }
      }

      if (code) {
        if (fileCodes.has(code)) errors.push(`Employee ID ${code} also appears on row ${fileCodes.get(code)}.`);
        else fileCodes.set(code, rowNumber);
      }
      if (email) {
        if (fileEmails.has(email)) errors.push(`Email also appears on row ${fileEmails.get(email)}.`);
        else fileEmails.set(email, rowNumber);
        const owner = codeByEmail.get(email);
        if (owner && owner !== code) errors.push(`Email is already used by employee ${owner}.`);
      }

      const current = existingByCode.get(code);
      if (current && status === "EXITED" && current.employmentStatus !== "EXITED" && current._count.assignments > 0) {
        errors.push(`Still holds ${current._count.assignments} asset(s); can't be marked exited.`);
      }

      const label = [code, name].filter(Boolean).join(" · ") || "(blank)";
      if (errors.length || !parsed.success) {
        results.push({ rowNumber, label, action: "error", errors });
        continue;
      }
      // Updates only touch columns that have a value; blank cells keep what's stored.
      const updateData = Object.fromEntries(
        Object.entries(parsed.data).filter(([key]) => key !== "managerId" && pick(values, SOURCE_COLUMN[key] ?? (key as keyof typeof COLUMNS)) !== ""),
      ) as Partial<typeof parsed.data>;
      valid.push({ rowNumber, data: parsed.data, updateData, managerCode: pick(values, "manager").toUpperCase(), existingId: current?.id });
      results.push({ rowNumber, label, action: current ? "update" : "create", errors: [] });
    }

    // Managers may be existing employees or other rows in this file.
    for (const v of valid) {
      if (v.managerCode && !existingByCode.has(v.managerCode) && !fileCodes.has(v.managerCode)) {
        const r = results.find((x) => x.rowNumber === v.rowNumber)!;
        r.action = "error";
        r.errors.push(`Reporting manager ${v.managerCode} not found.`);
      } else if (v.managerCode === v.data.employeeCode) {
        const r = results.find((x) => x.rowNumber === v.rowNumber)!;
        r.action = "error";
        r.errors.push("An employee can't report to themselves.");
      }
    }
    const writable = valid.filter((v) => results.find((r) => r.rowNumber === v.rowNumber)!.action !== "error");

    const summary: ImportSummary = {
      committed: false,
      total: results.length,
      creates: results.filter((r) => r.action === "create").length,
      updates: results.filter((r) => r.action === "update").length,
      errors: results.filter((r) => r.action === "error").length,
      rows: results,
    };
    if (!commit || writable.length === 0) return ok(summary);

    await db.$transaction(
      async (tx) => {
        const idByCode = new Map(existing.map((e) => [e.employeeCode, e.id]));
        for (const v of writable) {
          const exitDate = (status: string | undefined) => (status === "EXITED" ? new Date() : status ? null : undefined);
          const saved = await tx.employee.upsert({
            where: { employeeCode: v.data.employeeCode },
            create: { ...v.data, exitDate: exitDate(v.data.employmentStatus) },
            update: { ...v.updateData, exitDate: exitDate(v.updateData.employmentStatus) },
            select: { id: true },
          });
          idByCode.set(v.data.employeeCode, saved.id);
        }
        for (const v of writable) {
          if (!v.managerCode) continue;
          await tx.employee.update({ where: { employeeCode: v.data.employeeCode }, data: { managerId: idByCode.get(v.managerCode) } });
        }
        await writeAudit(
          {
            actorId: actor.id,
            action: "employee.import",
            entityType: "Employee",
            entityId: "bulk",
            summary: `Imported employees: ${summary.creates} added, ${summary.updates} updated`,
            after: { file: (formData.get("file") as File).name, creates: summary.creates, updates: summary.updates },
          },
          tx,
        );
      },
      { timeout: 120_000 },
    );

    refresh();
    return ok({ ...summary, committed: true });
  });
}
