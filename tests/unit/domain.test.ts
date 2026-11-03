import { describe, expect, it } from "vitest";
import { parseDateInput, toDateInput } from "@/lib/dates";
import { bookValue } from "@/lib/depreciation";
import { enumParam, hrefWith, parseList } from "@/lib/list-params";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { assetSchema, parseSpecString } from "@/features/assets/schemas";
import { assignSchema, acknowledgementSchema, returnSchema } from "@/features/assignments/schemas";
import { employeeSchema } from "@/features/employees/schemas";
import { categoryIcon } from "@/components/shared/category-icon";
import { Headphones, Package, Smartphone } from "lucide-react";

describe("parseDateInput", () => {
  it("accepts ISO and Indian day-first formats as UTC calendar dates", () => {
    expect(parseDateInput("2026-01-15")?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(parseDateInput("15/01/2026")?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(parseDateInput("15-01-2026")?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("31/04/2026")).toBeNull();
    expect(parseDateInput("not a date")).toBeNull();
  });
  it("handles leap years", () => {
    expect(parseDateInput("2028-02-29")).not.toBeNull();
    expect(parseDateInput("2027-02-29")).toBeNull();
  });
  it("round-trips to the date input format", () => {
    expect(toDateInput(parseDateInput("2026-07-04"))).toBe("2026-07-04");
    expect(toDateInput(null)).toBe("");
  });
});

describe("bookValue (straight-line depreciation)", () => {
  const purchaseDate = new Date(Date.UTC(2025, 0, 1));
  it("depreciates evenly to the salvage value", () => {
    const half = bookValue({ cost: 120_000, purchaseDate, usefulLifeMonths: 36, salvagePercent: 10, asOf: new Date(Date.UTC(2026, 6, 1)) });
    // 18 of 36 months: (120000 - 12000) * 0.5 = 54000 depreciated.
    expect(half).toMatchObject({ value: 66_000, accumulated: 54_000, monthsElapsed: 18, fullyDepreciated: false });
  });
  it("never goes below salvage after the useful life", () => {
    const end = bookValue({ cost: 120_000, purchaseDate, usefulLifeMonths: 36, salvagePercent: 10, asOf: new Date(Date.UTC(2030, 0, 1)) });
    expect(end?.value).toBe(12_000);
    expect(end?.fullyDepreciated).toBe(true);
  });
  it("returns null without a cost or purchase date", () => {
    expect(bookValue({ cost: null, purchaseDate, usefulLifeMonths: 36, salvagePercent: 0 })).toBeNull();
    expect(bookValue({ cost: 100, purchaseDate: null, usefulLifeMonths: 36, salvagePercent: 0 })).toBeNull();
  });
});

describe("list params", () => {
  it("clamps page size and page, and only allows known sort columns", () => {
    const f = parseList({ page: "-3", size: "9999", sort: "password", dir: "sideways" }, { sortable: ["name", "code"] as const, defaultSort: "name" });
    expect(f).toMatchObject({ page: 1, pageSize: 25, sort: "name", dir: "asc", skip: 0 });
    expect(parseList({ page: "3", size: "50" }, { sortable: ["name"] as const, defaultSort: "name" }).skip).toBe(100);
  });
  it("ignores values outside an enum", () => {
    expect(enumParam({ status: "ASSIGNED" }, "status", ["ASSIGNED", "AVAILABLE"] as const)).toBe("ASSIGNED");
    expect(enumParam({ status: "DROP TABLE" }, "status", ["ASSIGNED"] as const)).toBeUndefined();
  });
  it("builds hrefs that keep other params", () => {
    expect(hrefWith("/assets", { q: "dell", page: "2" }, { page: undefined, sort: "code" })).toBe("/assets?q=dell&sort=code");
  });
});

describe("default role permissions", () => {
  it("gives Super Admin everything and keeps user/role management Super Admin only", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(ALL_PERMISSIONS);
    for (const p of ["user:manage", "role:manage", "settings:manage"] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain(p);
      expect(DEFAULT_ROLE_PERMISSIONS.HR).not.toContain(p);
    }
  });
  it("lets HR handle handovers and returns but not repairs or approvals", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.HR).toEqual(expect.arrayContaining(["assignment:create", "assignment:return", "clearance:manage", "request:create"]));
    expect(DEFAULT_ROLE_PERMISSIONS.HR).not.toContain("maintenance:manage");
    expect(DEFAULT_ROLE_PERMISSIONS.HR).not.toContain("request:approve");
  });
  it("only grants permissions that exist", () => {
    for (const grants of Object.values(DEFAULT_ROLE_PERMISSIONS)) for (const p of grants) expect(ALL_PERMISSIONS).toContain(p);
  });
});

describe("asset validation", () => {
  const base = { name: "Dell Latitude", categoryId: "c1", condition: "NEW", status: "AVAILABLE" };
  it("parses Indian-formatted costs and drops blank spec rows", () => {
    const v = assetSchema.parse({ ...base, purchaseCost: "1,05,000.50", specifications: [{ key: "RAM", value: "16 GB" }, { key: "", value: "" }] });
    expect(v.purchaseCost).toBe(105000.5);
    expect(v.specifications).toEqual({ RAM: "16 GB" });
  });
  it("rejects a warranty that ends before it starts", () => {
    const r = assetSchema.safeParse({ ...base, warrantyStart: "2026-06-01", warrantyExpiry: "2026-05-01" });
    expect(r.success).toBe(false);
  });
  it("rejects negative costs", () => {
    expect(assetSchema.safeParse({ ...base, purchaseCost: "-5" }).success).toBe(false);
  });
  it("parses specification strings from imports", () => {
    expect(parseSpecString("CPU: i7-1365U; RAM: 16 GB\nNote without colon; URL: http://x:8080")).toEqual([
      { key: "CPU", value: "i7-1365U" },
      { key: "RAM", value: "16 GB" },
      { key: "URL", value: "http://x:8080" },
    ]);
  });
});

describe("assignment validation", () => {
  const item = { assetId: "a1", condition: "GOOD", accessories: ["Charger"] };
  it("rejects the same asset twice in one handover", () => {
    expect(assignSchema.safeParse({ employeeId: "e1", assignedAt: "2026-01-01", items: [item, item] }).success).toBe(false);
  });
  it("rejects a return-by date before the handover", () => {
    expect(assignSchema.safeParse({ employeeId: "e1", assignedAt: "2026-02-01", expectedReturnAt: "2026-01-01", items: [item] }).success).toBe(false);
  });
  it("requires at least one asset", () => {
    expect(assignSchema.safeParse({ employeeId: "e1", assignedAt: "2026-01-01", items: [] }).success).toBe(false);
  });
  it("only allows sensible next statuses after a return", () => {
    const r = { assignmentId: "x", returnedAt: "2026-01-01", condition: "GOOD" };
    expect(returnSchema.safeParse({ ...r, nextStatus: "AVAILABLE" }).success).toBe(true);
    expect(returnSchema.safeParse({ ...r, nextStatus: "ASSIGNED" }).success).toBe(false);
  });
  it("requires a known acknowledgement method", () => {
    expect(acknowledgementSchema.safeParse({ assignmentIds: ["x"], method: "SIGNED_FORM", acknowledgedOn: "2026-01-01" }).success).toBe(true);
    expect(acknowledgementSchema.safeParse({ assignmentIds: ["x"], method: "TELEPATHY", acknowledgedOn: "2026-01-01" }).success).toBe(false);
  });
});

describe("employee validation", () => {
  it("normalises codes and emails", () => {
    const v = employeeSchema.parse({ employeeCode: "emp1001", fullName: "Asha Rao", email: " Asha.Rao@Company.com ", employmentStatus: "ACTIVE" });
    expect(v.employeeCode).toBe("EMP1001");
    expect(v.email).toBe("asha.rao@company.com");
  });
});

describe("category icons", () => {
  it("matches headphones before phones", () => {
    expect(categoryIcon("Headphones")).toBe(Headphones);
    expect(categoryIcon("Mobile Phone")).toBe(Smartphone);
    expect(categoryIcon("Something new")).toBe(Package);
  });
});

describe("email inputs are trimmed before validation", () => {
  it("accepts pasted emails with surrounding spaces (e.g. from Excel)", async () => {
    const { loginSchema } = await import("@/features/auth/schemas");
    expect(loginSchema.parse({ email: "  IT.Admin@Company.com ", password: "x" }).email).toBe("it.admin@company.com");
    const { MASTER } = await import("@/features/master-data/config");
    expect(MASTER.vendors.schema.parse({ name: "Acme", email: " Sales@Acme.com " }).email).toBe("sales@acme.com");
    expect(MASTER.vendors.schema.parse({ name: "Acme", email: "" }).email).toBeNull();
    expect(MASTER.vendors.schema.safeParse({ name: "Acme", email: "nope" }).success).toBe(false);
  });
});
