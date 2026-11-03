import { beforeAll, describe, expect, it } from "vitest";

// Smoke test of a running EAMS with the demo seed. Talks HTTP only, the way a
// browser without JavaScript would, so it works against any deployment.

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "Demo@12345";

async function login(email: string, password: string) {
  const html = await (await fetch(`${BASE}/login`)).text();
  // The login form is a server action; its hidden fields let it post without JS.
  const hidden = [...html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [
    m[1]!,
    (m[2] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
  ]);
  const form = new FormData();
  for (const [k, v] of hidden) form.append(k, v!);
  form.set("email", email);
  form.set("password", password);
  const res = await fetch(`${BASE}/login`, { method: "POST", body: form, redirect: "manual", headers: { origin: BASE } });
  return (res.headers.get("set-cookie") ?? "").match(/eams_session=[^;]+/)?.[0];
}

/** Status after following an in-page streamed redirect (e.g. to /forbidden). */
async function visit(cookie: string | undefined, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const streamed = body.match(/NEXT_REDIRECT;[a-z]+;([^;"]+)/)?.[1];
  return { status: res.status, location: res.headers.get("location") ?? streamed ?? null, body };
}

let it_: string | undefined;
let hr: string | undefined;

beforeAll(async () => {
  it_ = await login("it.admin@company.com", PASSWORD);
  hr = await login("hr@company.com", PASSWORD);
});

describe("authentication", () => {
  it("redirects signed-out visitors to the login page", async () => {
    const r = await visit(undefined, "/dashboard");
    expect(r.status).toBe(307);
    expect(r.location).toContain("/login");
  });
  it("rejects a wrong password", async () => {
    expect(await login("it.admin@company.com", "definitely-wrong")).toBeUndefined();
  });
  it("signs in the demo staff accounts", () => {
    expect(it_).toBeTruthy();
    expect(hr).toBeTruthy();
  });
  it("issues an httpOnly session cookie", async () => {
    const html = await (await fetch(`${BASE}/login`)).text();
    expect(html).toContain("Sign in");
  });
});

describe("pages by role", () => {
  const pages = ["/dashboard", "/assets", "/assignments", "/employees", "/maintenance", "/requests", "/clearance", "/reports", "/reports/inventory", "/notifications"];
  it.each(pages)("IT admin can open %s", async (path) => {
    const r = await visit(it_, path);
    expect(r.status).toBe(200);
    expect(r.location).toBeNull();
  });
  it.each(["/settings/users", "/settings/roles", "/maintenance/new", "/settings/audit"])("HR is kept out of %s", async (path) => {
    const r = await visit(hr, path);
    expect(r.location).toBe("/forbidden");
  });
  it("HR can hand over and return assets", async () => {
    expect((await visit(hr, "/assignments/new")).location).toBeNull();
  });
});

describe("security headers", () => {
  it("sets clickjacking, sniffing and CSP protections", async () => {
    const res = await fetch(`${BASE}/login`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("exports and endpoints", () => {
  it.each([
    ["/api/reports/inventory?format=xlsx", "spreadsheetml"],
    ["/api/reports/assigned?format=csv", "text/csv"],
    ["/api/reports/depreciation?format=pdf", "application/pdf"],
    ["/api/export/assets?format=csv", "text/csv"],
    ["/api/templates/assets", "spreadsheetml"],
  ])("%s downloads", async (path, type) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: it_! } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(type);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });
  it("refuses exports without a session", async () => {
    const res = await fetch(`${BASE}/api/reports/inventory?format=csv`, { redirect: "manual" });
    expect(res.status).toBe(307);
  });
  it("refuses the cron endpoint without the secret", async () => {
    expect((await fetch(`${BASE}/api/cron/daily`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/cron/daily`, { headers: { authorization: "Bearer guess" } })).status).toBe(401);
  });
});

describe("demo data", () => {
  it("shows the seeded inventory on the dashboard", async () => {
    const r = await visit(it_, "/dashboard");
    expect(r.body).toMatch(/Total assets/);
    expect(r.body).toMatch(/AST-0000\d\d|Needs attention/);
  });
});
