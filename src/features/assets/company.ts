// An asset's company must operate under the asset's branch / HQ. Shared by the
// asset form action and the spreadsheet import so both apply the same rule.

export type CompanyRef = { id: string; name: string; branchId: string };

/**
 * Picking a company with no branch fills in the company's branch. A company
 * from a different branch is rejected rather than silently moving the asset.
 */
export function alignCompany(
  input: { branchId: string | null; companyId: string | null },
  company: CompanyRef | null | undefined,
): { ok: true; branchId: string | null; companyId: string | null } | { ok: false; error: string } {
  if (!input.companyId) return { ok: true, branchId: input.branchId, companyId: null };
  if (!company) return { ok: false, error: "Choose a company from the list." };
  if (!input.branchId) return { ok: true, branchId: company.branchId, companyId: company.id };
  if (input.branchId !== company.branchId) {
    return { ok: false, error: `${company.name} doesn't operate under this location. Pick its HQ or another company.` };
  }
  return { ok: true, branchId: input.branchId, companyId: company.id };
}
