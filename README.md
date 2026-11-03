# EAMS: Enterprise Asset Management System

Tracks company assets (laptops, monitors, phones, access cards, licenses, …), which employee
holds each one, and everything that happens to them from purchase to disposal.

Next.js 16 · TypeScript · Tailwind + shadcn/ui · PostgreSQL + Prisma 7 · Supabase Storage · Vercel

- [Architecture, RBAC model and ER diagram](docs/ARCHITECTURE.md)
- [Deploying to Vercel + Supabase](docs/DEPLOYMENT.md)
- [Security notes](docs/SECURITY.md)

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Setup, full database schema, auth, RBAC, app shell, user and role management | ✅ Done |
| 2 | Dashboard charts, employees, master data, asset inventory | ✅ Done |
| 3 | Assignment, handover acknowledgement, returns | ✅ Done |
| 4 | Maintenance, asset requests | ✅ Done |
| 5 | Reports and Excel / CSV / PDF exports | ✅ Done |
| 6 | Exit clearance, notifications and daily reminders, audit log, asset history report | ✅ Done |
| 7 | Tests, security hardening, CI, deployment | ✅ Done (deploy: see docs/DEPLOYMENT.md) |

The database schema covered every module from the start; later phases have only needed small, additive migrations.

## Local development

Requirements: Node 20.19+.

```bash
npm install
cp .env.example .env
```

You need a Postgres database. Pick one:

- **Quickest:** `npx prisma dev --name eams --detach` starts a throwaway local Postgres and prints a
  `postgres://…` TCP URL. Use it for both `DATABASE_URL` and `DIRECT_URL`, and set `DB_POOL_MAX=1`.
- **Your own Postgres or a Supabase dev project:** paste its connection strings.

Then fill in `SESSION_SECRET` (`openssl rand -base64 48`) and `SEED_ADMIN_PASSWORD`, set
`SEED_DEMO_DATA="true"`, and run:

```bash
npm run db:deploy   # apply migrations
npm run db:seed     # roles, permissions, Super Admin, demo data
npm run dev         # http://localhost:3000
```

Demo logins (password `Demo@12345`, from `SEED_DEMO_PASSWORD`):

| Email | Role | Lands on |
|---|---|---|
| `SEED_ADMIN_EMAIL` | Super Admin | Dashboard, Users, Roles |
| `it.admin@company.com` | IT Administrator | Dashboard |
| `hr@company.com` | HR | Dashboard |

Only IT and HR staff have logins. Employees are records; staff record handover acknowledgements
and asset requests on their behalf.

> After `npm run db:migrate` or `npx prisma generate`, restart `npm run dev`. A running dev server keeps the
> database client it started with and will report "Unknown field" errors for new columns.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm test` | Unit and security tests (no database needed) |
| `E2E_BASE_URL=http://localhost:3000 npm run test:e2e` | End-to-end smoke test against a running app with demo data |
| `npm run db:migrate -- --name x` | Create a new migration from schema changes |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Seed roles, permissions and the Super Admin (idempotent) |
| `npm run db:studio` | Browse the database |
