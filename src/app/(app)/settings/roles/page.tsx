import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { SYSTEM_ROLES, type Permission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { RolesMatrix, type RoleColumn } from "@/features/roles/roles-matrix";

export const metadata = { title: "Roles & Permissions" };

const ORDER: string[] = [SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.HR];

export default async function RolesPage() {
  await requirePagePermission("role:manage");

  const roles = await db.role.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      _count: { select: { users: true } },
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });

  const columns: RoleColumn[] = roles
    .sort((a, b) => (ORDER.indexOf(a.key) + 1 || 99) - (ORDER.indexOf(b.key) + 1 || 99))
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      userCount: r._count.users,
      locked: r.key === SYSTEM_ROLES.SUPER_ADMIN,
      permissions: r.permissions.map((rp) => rp.permission.key as Permission),
    }));

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Control what each role can see and do. Every action is also checked on the server."
      />
      <RolesMatrix roles={columns} />
    </>
  );
}
