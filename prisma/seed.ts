/**
 * Seeds roles, permissions and the first Super Admin (always, idempotent), plus
 * realistic demo data when SEED_DEMO_DATA=true and the database has no assets yet.
 *
 *   npx prisma db seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type AssetCondition,
  type AssetStatus,
  type EmploymentStatus,
} from "../src/generated/prisma/client";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  permissionModule,
  type Permission,
  type SystemRole,
} from "../src/lib/auth/permissions";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL! }),
});

const ROLE_META: Record<SystemRole, { name: string; description: string }> = {
  SUPER_ADMIN: { name: "Super Admin", description: "Full access, including users, roles and settings" },
  ADMIN: { name: "IT Administrator", description: "Manages assets, assignments, returns and maintenance" },
  HR: { name: "HR", description: "Employee records, handovers, returns and exit clearance" },
};

// Deterministic PRNG so every demo seed produces the same data.
let state = 20261103;
function rand() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const daysAgo = (days: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
};
const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

async function seedAccessControl() {
  const known = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const added = new Set<string>();
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    if (!known.has(key)) added.add(key);
    await db.permission.upsert({
      where: { key },
      create: { key, description, module: permissionModule(key as Permission) },
      update: { description, module: permissionModule(key as Permission) },
    });
  }
  // Permissions removed from the code are removed from every role.
  const pruned = await db.permission.deleteMany({ where: { key: { notIn: Object.keys(PERMISSIONS) } } });
  if (pruned.count) console.log(`• Removed ${pruned.count} obsolete permission(s)`);
  const permissionIds = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));

  for (const [key, meta] of Object.entries(ROLE_META) as [SystemRole, (typeof ROLE_META)[SystemRole]][]) {
    const existing = await db.role.findUnique({ where: { key } });
    const role = await db.role.upsert({
      where: { key },
      create: { key, ...meta, isSystem: true },
      update: { isSystem: true, description: meta.description },
    });
    // New roles get all their defaults; existing roles only get permissions that
    // were introduced since the last seed. Grants edited in the UI are kept.
    const grants = !existing || key === "SUPER_ADMIN" ? DEFAULT_ROLE_PERMISSIONS[key] : DEFAULT_ROLE_PERMISSIONS[key].filter((p) => added.has(p));
    if (grants.length) {
      await db.rolePermission.createMany({
        data: grants.map((p) => ({ roleId: role.id, permissionId: permissionIds.get(p)! })),
        skipDuplicates: true,
      });
    }
  }

  // Employees no longer sign in: retire the old self-service role when unused.
  const legacy = await db.role.findUnique({ where: { key: "EMPLOYEE" }, select: { id: true, _count: { select: { users: true } } } });
  if (legacy && legacy._count.users === 0) {
    await db.role.delete({ where: { id: legacy.id } });
    console.log("• Removed the unused Employee role");
  } else if (legacy) {
    console.warn(`! ${legacy._count.users} user(s) still have the retired Employee role and no permissions. Reassign or deactivate them in Users.`);
  }
}

async function seedSuperAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@company.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Super Admin ${email} already exists, left unchanged`);
    return;
  }
  if (!password || password.length < 10) {
    throw new Error("Set SEED_ADMIN_PASSWORD (min 10 chars) to create the first Super Admin.");
  }
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  await db.user.create({
    data: { email, name: process.env.SEED_ADMIN_NAME ?? "System Administrator", roleId: role.id, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`• Created Super Admin ${email}`);
}

async function seedDemoData() {
  if ((await db.asset.count()) > 0) {
    console.log("• Assets already exist, skipping demo data");
    return;
  }
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Demo@12345";
  const demoHash = await bcrypt.hash(demoPassword, 12);

  const departments = await Promise.all(
    [
      ["Engineering", "ENG"],
      ["Product", "PRD"],
      ["Sales", "SAL"],
      ["Marketing", "MKT"],
      ["Finance", "FIN"],
      ["Human Resources", "HR"],
      ["Operations", "OPS"],
      ["Customer Success", "CS"],
    ].map(([name, code]) => db.department.create({ data: { name: name!, code: code! } })),
  );

  const designations = await Promise.all(
    [
      "Software Engineer",
      "Senior Software Engineer",
      "Engineering Manager",
      "Product Manager",
      "UX Designer",
      "Sales Executive",
      "Account Manager",
      "Marketing Specialist",
      "Financial Analyst",
      "HR Business Partner",
      "Operations Associate",
      "Support Specialist",
      "IT Administrator",
    ].map((title) => db.designation.create({ data: { title } })),
  );
  const designation = (title: string) => designations.find((d) => d.title === title)!;

  const branches = await Promise.all(
    [
      ["Pune HQ", "PUN", "Pune"],
      ["Mumbai Office", "BOM", "Mumbai"],
      ["Bengaluru Office", "BLR", "Bengaluru"],
    ].map(([name, code, city]) => db.branch.create({ data: { name: name!, code: code!, city } })),
  );

  const vendors = await Promise.all(
    [
      ["Dell Technologies India", "Rohit Sharma", "enterprise@dell.example"],
      ["HP India Sales", "Neha Kulkarni", "b2b@hp.example"],
      ["Lenovo India", "Arjun Mehta", "corporate@lenovo.example"],
      ["Apple Authorised Reseller", "Kavya Iyer", "business@reseller.example"],
      ["Logitech Distributors", "Sameer Joshi", "orders@logi.example"],
      ["TechCare Services", "Pooja Desai", "service@techcare.example"],
    ].map(([name, contactPerson, email]) => db.vendor.create({ data: { name: name!, contactPerson, email } })),
  );
  const vendor = (prefix: string) => vendors.find((v) => v.name.startsWith(prefix))!;

  const categoryDefs = [
    ["Laptop", "LAP", 36],
    ["Desktop", "DSK", 48],
    ["Monitor", "MON", 60],
    ["Mobile Phone", "MOB", 24],
    ["Keyboard", "KBD", 36],
    ["Mouse", "MOU", 24],
    ["Headphones", "HDP", 24],
    ["Printer", "PRN", 60],
    ["Networking Equipment", "NET", 60],
    ["Access Card", "ACC", 60],
    ["Software License", "SWL", 12],
    ["Other", "OTH", 36],
  ] as const;
  const categories = Object.fromEntries(
    await Promise.all(
      categoryDefs.map(async ([name, code, life]) => [
        name,
        await db.assetCategory.create({ data: { name, code, usefulLifeMonths: life, salvagePercent: 5 } }),
      ]),
    ),
  ) as Record<(typeof categoryDefs)[number][0], { id: string }>;

  // ── Employees ──────────────────────────────────────────────────────────────
  const people: [string, string, string][] = [
    ["Aarav Patel", "Engineering", "Engineering Manager"],
    ["Diya Sharma", "Engineering", "Senior Software Engineer"],
    ["Vihaan Reddy", "Engineering", "Software Engineer"],
    ["Ananya Iyer", "Engineering", "Software Engineer"],
    ["Ishaan Gupta", "Engineering", "Software Engineer"],
    ["Saanvi Nair", "Product", "Product Manager"],
    ["Kabir Malhotra", "Product", "UX Designer"],
    ["Myra Kapoor", "Sales", "Account Manager"],
    ["Reyansh Joshi", "Sales", "Sales Executive"],
    ["Aadhya Menon", "Sales", "Sales Executive"],
    ["Arjun Bhatt", "Marketing", "Marketing Specialist"],
    ["Kiara Desai", "Marketing", "Marketing Specialist"],
    ["Vivaan Chopra", "Finance", "Financial Analyst"],
    ["Navya Pillai", "Finance", "Financial Analyst"],
    ["Rohan Kulkarni", "Human Resources", "HR Business Partner"],
    ["Prisha Shetty", "Operations", "Operations Associate"],
    ["Ayaan Verma", "Operations", "IT Administrator"],
    ["Sara Khan", "Customer Success", "Support Specialist"],
    ["Dhruv Agarwal", "Customer Success", "Support Specialist"],
    ["Meera Rao", "Engineering", "Senior Software Engineer"],
    ["Krish Saxena", "Engineering", "Software Engineer"],
    ["Tara Banerjee", "Product", "UX Designer"],
    ["Advik Mishra", "Sales", "Account Manager"],
    ["Riya Thakur", "Customer Success", "Support Specialist"],
  ];

  const employees = [];
  for (const [i, [fullName, deptName, title]] of people.entries()) {
    const status: EmploymentStatus = i === 23 ? "ON_NOTICE" : i === 22 ? "ON_LEAVE" : "ACTIVE";
    employees.push(
      await db.employee.create({
        data: {
          employeeCode: `EMP${String(1001 + i)}`,
          fullName,
          email: `${fullName.toLowerCase().replace(/\s+/g, ".")}@company.com`,
          phone: `+91 9${String(800000000 + i * 7919).slice(0, 9)}`,
          departmentId: departments.find((d) => d.name === deptName)!.id,
          designationId: designation(title).id,
          branchId: branches[i % branches.length]!.id,
          joiningDate: daysAgo(between(90, 1500)),
          employmentStatus: status,
        },
      }),
    );
  }
  // Reporting lines: engineers → Aarav, everyone else → their department's first member.
  for (const emp of employees.slice(1)) {
    const firstInDept = employees.find((e) => e.departmentId === emp.departmentId && e.id !== emp.id);
    if (firstInDept && employees.indexOf(firstInDept) < employees.indexOf(emp)) {
      await db.employee.update({ where: { id: emp.id }, data: { managerId: firstInDept.id } });
    }
  }

  // ── Demo logins: one per role, linked to employees ─────────────────────────
  const roleId = async (key: SystemRole) => (await db.role.findUniqueOrThrow({ where: { key } })).id;
  const demoUsers: [number, string, SystemRole][] = [
    [16, "it.admin@company.com", "ADMIN"],
    [14, "hr@company.com", "HR"],
  ];
  for (const [idx, email, role] of demoUsers) {
    await db.user.create({
      data: { email, name: employees[idx]!.fullName, roleId: await roleId(role), employeeId: employees[idx]!.id, passwordHash: demoHash },
    });
  }
  const itAdmin = await db.user.findUniqueOrThrow({ where: { email: "it.admin@company.com" } });

  // ── Assets ─────────────────────────────────────────────────────────────────
  type Model = { cat: keyof typeof categories; brand: string; model: string; cost: [number, number]; vendor: string; specs?: Record<string, string> };
  const models: Model[] = [
    { cat: "Laptop", brand: "Dell", model: "Latitude 7440", cost: [95000, 120000], vendor: "Dell", specs: { cpu: "Intel Core i7-1365U", ram: "16 GB", storage: "512 GB SSD", display: '14"' } },
    { cat: "Laptop", brand: "Lenovo", model: "ThinkPad T14 Gen 4", cost: [88000, 110000], vendor: "Lenovo", specs: { cpu: "AMD Ryzen 7 PRO 7840U", ram: "16 GB", storage: "512 GB SSD", display: '14"' } },
    { cat: "Laptop", brand: "Apple", model: "MacBook Pro 14 M3", cost: [169000, 199000], vendor: "Apple", specs: { cpu: "Apple M3 Pro", ram: "18 GB", storage: "512 GB SSD", display: '14.2"' } },
    { cat: "Desktop", brand: "HP", model: "EliteDesk 800 G9", cost: [65000, 78000], vendor: "HP", specs: { cpu: "Intel Core i5-12500", ram: "16 GB", storage: "512 GB SSD" } },
    { cat: "Monitor", brand: "Dell", model: "P2423D 24\" QHD", cost: [18000, 22000], vendor: "Dell", specs: { size: '24"', resolution: "2560×1440" } },
    { cat: "Monitor", brand: "LG", model: "27UP850 27\" 4K", cost: [32000, 38000], vendor: "Dell", specs: { size: '27"', resolution: "3840×2160" } },
    { cat: "Mobile Phone", brand: "Samsung", model: "Galaxy S23", cost: [62000, 72000], vendor: "Dell", specs: { storage: "128 GB" } },
    { cat: "Mobile Phone", brand: "Apple", model: "iPhone 15", cost: [72000, 79000], vendor: "Apple", specs: { storage: "128 GB" } },
    { cat: "Keyboard", brand: "Logitech", model: "MX Keys S", cost: [9500, 11000], vendor: "Logitech" },
    { cat: "Mouse", brand: "Logitech", model: "MX Master 3S", cost: [8500, 9900], vendor: "Logitech" },
    { cat: "Headphones", brand: "Jabra", model: "Evolve2 65", cost: [17000, 21000], vendor: "Logitech" },
    { cat: "Printer", brand: "HP", model: "LaserJet Pro MFP 4104fdw", cost: [42000, 48000], vendor: "HP" },
    { cat: "Networking Equipment", brand: "Cisco", model: "Catalyst 1000-24T", cost: [55000, 65000], vendor: "HP" },
    { cat: "Access Card", brand: "HID", model: "iCLASS SE", cost: [450, 600], vendor: "TechCare" },
  ];
  const plan: [number, number][] = [
    [0, 10], [1, 8], [2, 5], [3, 4], [4, 12], [5, 5], [6, 4], [7, 3], [8, 8], [9, 10], [10, 6], [11, 3], [12, 2], [13, 12],
  ];

  let seq = 0;
  const assets: { id: string; status: AssetStatus; categoryCat: string; purchaseDate: Date }[] = [];
  for (const [modelIdx, qty] of plan) {
    const m = models[modelIdx]!;
    for (let n = 0; n < qty; n++) {
      seq++;
      const purchaseDate = daysAgo(between(20, 1100));
      const status: AssetStatus =
        m.cat === "Printer" || m.cat === "Networking Equipment"
          ? "AVAILABLE"
          : pick<AssetStatus>(["ASSIGNED", "ASSIGNED", "ASSIGNED", "ASSIGNED", "AVAILABLE", "AVAILABLE", "UNDER_MAINTENANCE", "DAMAGED", "RETIRED"]);
      const condition: AssetCondition =
        status === "DAMAGED" ? "DAMAGED" : status === "RETIRED" ? "POOR" : pick<AssetCondition>(["NEW", "EXCELLENT", "GOOD", "GOOD", "FAIR"]);
      const asset = await db.asset.create({
        data: {
          assetCode: `AST-${String(seq).padStart(6, "0")}`,
          name: `${m.brand} ${m.model}`,
          categoryId: categories[m.cat].id,
          brand: m.brand,
          model: m.model,
          serialNumber: `${m.brand.slice(0, 3).toUpperCase()}${(1e9 + seq * 7_654_321).toString(36).toUpperCase()}`,
          assetTag: `TAG-${String(5000 + seq)}`,
          purchaseDate,
          purchaseCost: between(m.cost[0], m.cost[1]),
          vendorId: vendor(m.vendor).id,
          invoiceNumber: `INV/${purchaseDate.getUTCFullYear()}/${String(between(100, 9999)).padStart(4, "0")}`,
          warrantyStart: purchaseDate,
          warrantyExpiry: addMonths(purchaseDate, m.cat === "Access Card" ? 60 : pick([12, 24, 36])),
          condition,
          status,
          branchId: pick(branches).id,
          specifications: m.specs,
          createdById: itAdmin.id,
          createdAt: purchaseDate,
        },
      });
      assets.push({ id: asset.id, status, categoryCat: m.cat, purchaseDate });
    }
  }
  await db.counter.upsert({ where: { key: "asset" }, create: { key: "asset", value: seq }, update: { value: seq } });

  // ── Assignment history: active ones for ASSIGNED assets, returned ones for others
  const activeEmployees = employees.filter((e) => e.employmentStatus !== "EXITED");
  let empCursor = 0;
  for (const a of assets) {
    // Past, closed assignment for roughly a third of assets.
    if (rand() < 0.35 && a.status !== "ASSIGNED") {
      const start = new Date(Math.max(a.purchaseDate.getTime(), daysAgo(400).getTime()));
      const returned = daysAgo(between(5, 60));
      if (returned > start) {
        const assignment = await db.assetAssignment.create({
          data: {
            assetId: a.id,
            employeeId: pick(activeEmployees).id,
            assignedAt: start,
            conditionAtHandover: "GOOD",
            accessories: a.categoryCat === "Laptop" ? ["Charger", "Laptop bag"] : [],
            status: "RETURNED",
            acknowledgement: "ACKNOWLEDGED",
            acknowledgedAt: start,
            acknowledgementMethod: "SIGNED_FORM",
            acknowledgedById: itAdmin.id,
            assignedById: itAdmin.id,
          },
        });
        await db.assetReturn.create({
          data: {
            assignmentId: assignment.id,
            returnedAt: returned,
            conditionAtReturn: a.status === "DAMAGED" ? "DAMAGED" : "GOOD",
            damageNotes: a.status === "DAMAGED" ? "Cracked display hinge reported on return" : null,
            nextStatus: a.status === "RETIRED" ? "RETIRED" : a.status,
            processedById: itAdmin.id,
          },
        });
      }
    }
    if (a.status === "ASSIGNED") {
      const emp = activeEmployees[empCursor++ % activeEmployees.length]!;
      // Spread handovers over the past year so monthly charts look realistic.
      const assignedAt = new Date(Math.max(a.purchaseDate.getTime() + 86_400_000 * 3, daysAgo(between(3, 330)).getTime()));
      const acknowledged = rand() < 0.8;
      await db.assetAssignment.create({
        data: {
          assetId: a.id,
          employeeId: emp.id,
          assignedAt,
          conditionAtHandover: "GOOD",
          accessories: a.categoryCat === "Laptop" ? ["Charger", "Laptop bag"] : a.categoryCat === "Mobile Phone" ? ["Charger", "Case"] : [],
          remarks: a.categoryCat === "Laptop" ? "Standard onboarding kit" : null,
          status: "ACTIVE",
          acknowledgement: acknowledged ? "ACKNOWLEDGED" : "PENDING",
          acknowledgedAt: acknowledged ? assignedAt : null,
          acknowledgementMethod: acknowledged ? "SIGNED_FORM" : null,
          acknowledgedById: acknowledged ? itAdmin.id : null,
          assignedById: itAdmin.id,
        },
      });
    }
  }

  // ── Maintenance tickets for assets under maintenance ───────────────────────
  let mnt = 0;
  for (const a of assets.filter((x) => x.status === "UNDER_MAINTENANCE")) {
    mnt++;
    await db.maintenanceRequest.create({
      data: {
        ticketCode: `MNT-${String(mnt).padStart(6, "0")}`,
        assetId: a.id,
        issue: pick(["Battery drains within two hours", "Keyboard keys unresponsive", "Display flickering", "Overheating under load", "Charging port loose"]),
        priority: pick(["LOW", "MEDIUM", "HIGH"] as const),
        status: pick(["OPEN", "IN_PROGRESS", "PENDING_PARTS"] as const),
        vendorId: vendor("TechCare").id,
        assigneeId: itAdmin.id,
        reportedById: itAdmin.id,
        startedAt: daysAgo(between(1, 14)),
        previousStatus: "AVAILABLE",
      },
    });
  }
  await db.counter.upsert({ where: { key: "maintenance" }, create: { key: "maintenance", value: mnt }, update: { value: mnt } });

  // ── Pending asset requests ─────────────────────────────────────────────────
  const reqs: [number, keyof typeof categories, string, "LOW" | "MEDIUM" | "HIGH"][] = [
    [4, "Monitor", "Second monitor for frontend development work", "MEDIUM"],
    [9, "Laptop", "Current laptop is over four years old and very slow", "HIGH"],
    [11, "Headphones", "Needed for client calls from the open office", "LOW"],
  ];
  for (const [i, [empIdx, cat, reason, priority]] of reqs.entries()) {
    await db.assetRequest.create({
      data: {
        requestCode: `REQ-${String(i + 1).padStart(6, "0")}`,
        employeeId: employees[empIdx]!.id,
        categoryId: categories[cat].id,
        type: cat === "Laptop" ? "REPLACEMENT" : "NEW_ASSET",
        reason,
        priority,
        requestedById: (await db.user.findUnique({ where: { email: "hr@company.com" }, select: { id: true } }))?.id,
      },
    });
  }
  await db.counter.upsert({ where: { key: "request" }, create: { key: "request", value: reqs.length }, update: { value: reqs.length } });

  console.log(`• Demo data: ${employees.length} employees, ${assets.length} assets, ${mnt} maintenance tickets, ${reqs.length} requests`);
  console.log(`• Demo logins (password "${demoPassword}"): it.admin@company.com, hr@company.com`);
}

/** Audit history for the demo records, so dashboards and timelines aren't empty. */
async function seedDemoActivity() {
  if (await db.setting.findUnique({ where: { key: "demo_activity_seeded" } })) return;
  const actor = await db.user.findUnique({ where: { email: "it.admin@company.com" }, select: { id: true } });
  const [assets, assignments] = await Promise.all([
    db.asset.findMany({ select: { id: true, assetCode: true, name: true, createdAt: true } }),
    db.assetAssignment.findMany({
      select: {
        assetId: true,
        assignedAt: true,
        asset: { select: { assetCode: true } },
        employee: { select: { fullName: true } },
        return: { select: { returnedAt: true, nextStatus: true } },
      },
    }),
  ]);
  // Business hours on the record date, but never in the future.
  const at = (d: Date, hour: number) => new Date(Math.min(d.getTime() + hour * 3_600_000, Date.now()));
  const rows = [
    ...assets.map((a) => ({
      actorId: actor?.id,
      action: "asset.create",
      entityType: "Asset",
      entityId: a.id,
      summary: `Added ${a.assetCode} ${a.name}`,
      createdAt: at(a.createdAt, 10),
    })),
    ...assignments.flatMap((x) => [
      {
        actorId: actor?.id,
        action: "assignment.create",
        entityType: "Asset",
        entityId: x.assetId,
        summary: `Assigned ${x.asset.assetCode} to ${x.employee.fullName}`,
        createdAt: at(x.assignedAt, 11),
      },
      ...(x.return
        ? [
            {
              actorId: actor?.id,
              action: "assignment.return",
              entityType: "Asset",
              entityId: x.assetId,
              summary: `${x.asset.assetCode} returned by ${x.employee.fullName}`,
              createdAt: at(x.return.returnedAt, 15),
            },
          ]
        : []),
    ]),
  ];
  await db.$transaction([
    db.auditLog.createMany({ data: rows }),
    db.setting.create({ data: { key: "demo_activity_seeded", value: true } }),
  ]);
  console.log(`• Demo activity: ${rows.length} audit entries`);
}

async function main() {
  await seedAccessControl();
  console.log("• Roles and permissions up to date");
  await seedSuperAdmin();
  if (process.env.SEED_DEMO_DATA === "true") {
    await seedDemoData();
    await seedDemoActivity();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
