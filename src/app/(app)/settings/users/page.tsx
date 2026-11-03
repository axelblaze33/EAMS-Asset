import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { listLinkableEmployees, listRoleOptions, listUsers } from "@/features/users/queries";
import { UsersTable } from "@/features/users/users-table";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requirePagePermission("user:manage");
  const [users, roles, employees] = await Promise.all([listUsers(), listRoleOptions(), listLinkableEmployees()]);

  return (
    <>
      <PageHeader title="Users" description="Who can sign in to EAMS, and with which role." />
      <UsersTable
        users={users}
        roles={roles.map((r) => ({ value: r.id, label: r.name }))}
        employees={employees}
        currentUserId={me.id}
      />
    </>
  );
}
