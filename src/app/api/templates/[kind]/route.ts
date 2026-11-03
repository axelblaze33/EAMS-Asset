import { authorizeRoute } from "@/lib/route-auth";
import { fileResponse, toXlsx } from "@/lib/spreadsheet";

// Import templates: header row plus one example row the user overwrites.
const TEMPLATES = {
  employees: {
    permission: "employee:import",
    columns: {
      "Employee ID": "EMP2001",
      "Full Name": "Priya Sharma",
      Email: "priya.sharma@company.com",
      "Contact Number": "+91 98765 43210",
      Department: "Engineering",
      Designation: "Software Engineer",
      Branch: "Pune HQ",
      "Reporting Manager": "EMP1001",
      "Joining Date": "2026-01-15",
      Status: "Active",
    },
  },
  assets: {
    permission: "asset:import",
    columns: {
      "Asset Name": "Dell Latitude 7440",
      Category: "Laptop",
      Brand: "Dell",
      Model: "Latitude 7440",
      "Serial Number": "DL7440-ABC123",
      "Asset Tag": "TAG-9001",
      "Purchase Date": "2026-04-01",
      "Purchase Cost": 98500,
      Vendor: "Dell Technologies India",
      "Invoice Number": "INV/2026/0412",
      "Warranty Start": "2026-04-01",
      "Warranty Expiry": "2029-03-31",
      Condition: "New",
      Status: "Available",
      Branch: "Pune HQ",
      Department: "Engineering",
      Specifications: "CPU: i7-1365U; RAM: 16 GB; Storage: 512 GB SSD",
      Description: "",
    },
  },
} as const;

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[kind]">) {
  const { kind } = await ctx.params;
  const template = TEMPLATES[kind as keyof typeof TEMPLATES];
  if (!template) return Response.json({ error: "Unknown template" }, { status: 404 });

  const { denied } = await authorizeRoute(template.permission);
  if (denied) return denied;

  const entries = Object.entries(template.columns);
  const xlsx = await toXlsx(
    kind,
    entries.map(([header, example]) => ({ header, width: Math.max(14, header.length + 4, String(example).length + 2), value: () => example })),
    [null],
  );
  return fileResponse(xlsx, `eams-${kind}-template.xlsx`, "xlsx");
}
