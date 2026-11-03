import "server-only";
import { db } from "@/lib/db";

export async function listUsers() {
  return db.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      lockedUntil: true,
      role: { select: { id: true, key: true, name: true } },
      employee: { select: { id: true, employeeCode: true, fullName: true } },
    },
  });
}
export type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

export async function listRoleOptions() {
  return db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, key: true } });
}

/** Employees without a login yet, plus whoever is already linked (for edit forms). */
export async function listLinkableEmployees() {
  return db.employee.findMany({
    where: { deletedAt: null, employmentStatus: { not: "EXITED" } },
    orderBy: { fullName: "asc" },
    select: { id: true, employeeCode: true, fullName: true, email: true, user: { select: { id: true } } },
  });
}
export type EmployeeOption = Awaited<ReturnType<typeof listLinkableEmployees>>[number];
