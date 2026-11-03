import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/lib/auth/dal";
import { getOrgOptions } from "@/features/master-data/queries";
import { listManagerOptions } from "@/features/employees/queries";
import { EmployeeForm } from "@/features/employees/employee-form";

export const metadata = { title: "Add Employee" };

export default async function NewEmployeePage() {
  await requirePagePermission("employee:create");
  const [org, managers] = await Promise.all([getOrgOptions(), listManagerOptions()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add employee" description="Create an employee record. Assets can be assigned once it exists." />
      <EmployeeForm
        defaults={{
          employeeCode: "",
          fullName: "",
          email: "",
          phone: "",
          departmentId: "",
          designationId: "",
          branchId: "",
          managerId: "",
          joiningDate: "",
          employmentStatus: "ACTIVE",
        }}
        options={{ departments: org.departments, designations: org.designations, branches: org.branches, managers }}
      />
    </div>
  );
}
