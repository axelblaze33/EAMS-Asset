import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/spreadsheet";
import { decryptSession, encryptSession } from "@/lib/auth/session";

const SRC = join(__dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "generated" || name === "node_modules") return [];
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Exported async functions in a file, with the source of each body. */
function exportedFunctions(source: string) {
  const out: { name: string; body: string }[] = [];
  const re = /export async function (\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const next = source.indexOf("\nexport ", m.index + 1);
    out.push({ name: m[1]!, body: source.slice(m.index, next === -1 ? undefined : next) });
  }
  return out;
}

describe("authorization coverage", () => {
  // Server actions and route handlers are public HTTP endpoints. Every one must
  // check the session/permissions itself; hiding a button is not security.
  const PUBLIC = new Set(["src/features/auth/actions.ts#login", "src/features/auth/actions.ts#logout", "src/app/api/cron/daily/route.ts#GET"]);

  it("every server action authorizes", () => {
    const actions = files(SRC).filter((f) => /^["']use server["'];/m.test(readFileSync(f, "utf8")));
    expect(actions.length).toBeGreaterThan(5);
    for (const file of actions) {
      for (const fn of exportedFunctions(readFileSync(file, "utf8"))) {
        const id = `${relative(join(SRC, ".."), file).replaceAll("\\", "/")}#${fn.name}`;
        if (PUBLIC.has(id)) continue;
        expect(/\bauthorize\(/.test(fn.body), `${id} must call authorize()`).toBe(true);
      }
    }
  });

  it("every API route handler authorizes", () => {
    const routes = files(join(SRC, "app/api")).filter((f) => f.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(3);
    for (const file of routes) {
      const src = readFileSync(file, "utf8");
      for (const fn of exportedFunctions(src)) {
        const id = `${relative(join(SRC, ".."), file).replaceAll("\\", "/")}#${fn.name}`;
        if (id === "src/app/api/cron/daily/route.ts#GET") {
          expect(fn.body).toMatch(/CRON_SECRET/);
          expect(fn.body).toMatch(/timingSafeEqual/);
          continue;
        }
        expect(/authorizeRoute\(|getCurrentUser\(/.test(fn.body), `${id} must check the session`).toBe(true);
      }
    }
  });

  it("every app page checks the session", () => {
    const pages = files(join(SRC, "app")).filter((f) => f.endsWith("page.tsx") && !f.includes(`${join("(auth)", "login")}`));
    for (const file of pages) {
      const src = readFileSync(file, "utf8");
      if (/redirect\(|EmptyState/.test(src) && !/export default async/.test(src)) continue; // static pages (e.g. forbidden)
      expect(/requirePagePermission\(|requireUser\(/.test(src), `${relative(SRC, file)} must call requireUser/requirePagePermission`).toBe(true);
    }
  });

  it("no client component imports server-only modules", () => {
    for (const file of files(SRC)) {
      const src = readFileSync(file, "utf8");
      if (!/^["']use client["'];/m.test(src)) continue;
      expect(src, `${relative(SRC, file)} imports the database from a client component`).not.toMatch(/from "@\/lib\/(db|storage|audit|action)"/);
    }
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formula injection and adds a UTF-8 BOM", () => {
    const csv = toCsv([{ header: "Name", value: (r: { n: string }) => r.n }], [{ n: "=HYPERLINK(\"http://evil\")" }, { n: "+1" }, { n: "@SUM(A1)" }, { n: "Laptop" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'@SUM");
    expect(csv).toContain("Laptop");
  });
});

describe("session tokens", () => {
  it("round-trips and rejects tampering", async () => {
    const token = await encryptSession({ sub: "user_1", ver: 3 });
    expect(await decryptSession(token)).toEqual({ sub: "user_1", ver: 3 });
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", ver: 3, exp: 9999999999 })).toString("base64url");
    expect(await decryptSession(`${h}.${forged}.${s}`)).toBeNull();
    expect(await decryptSession(`${h}.${p}.${s}x`)).toBeNull();
    expect(await decryptSession(undefined)).toBeNull();
  });
});

describe("Excel export", () => {
  it("writes a readable workbook (guards the exceljs/uuid override)", async () => {
    const { toXlsx } = await import("@/lib/spreadsheet");
    const ExcelJS = (await import("exceljs")).default;
    const buf = await toXlsx("Assets", [{ header: "Asset ID", value: (r: { id: string; cost: number }) => r.id }, { header: "Cost", numFmt: "#,##0", value: (r: { id: string; cost: number }) => r.cost }], [{ id: "AST-000001", cost: 98500 }], { title: "Inventory", subtitle: "All records" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buf).buffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getCell("A1").value).toBe("Inventory");
    expect(ws.getRow(4).values).toEqual([, "Asset ID", "Cost"]); // title, subtitle, spacer, header
    expect(ws.getRow(5).values).toEqual([, "AST-000001", 98500]);
  });
});
