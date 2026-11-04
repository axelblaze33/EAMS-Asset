# Deploying EAMS to Vercel

Stack in production: **Vercel** (app) + **Supabase** (PostgreSQL + file storage).
You don't need to run any database commands yourself: production deploys apply migrations and
seed roles, permissions and the first Super Admin automatically.

## 1. Create the Supabase project

1. <https://supabase.com> → **New project**. Pick the region closest to your users
   (e.g. **South Asia (Mumbai)**) and save the database password.
2. Click **Connect** at the top of the project page and copy two connection strings:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Session pooler** (port `5432`) → `DIRECT_URL`

   In both, replace `[YOUR-PASSWORD]` and add `?sslmode=require` to the end.
   Don't use the "Direct connection" host: it's IPv6-only and Vercel's build can't reach it.
3. **Project Settings → API Keys**: copy the **service_role** secret (`SUPABASE_SERVICE_ROLE_KEY`),
   and from **Project Settings → Data API** the **Project URL** (`SUPABASE_URL`). The service_role key
   bypasses Row Level Security, so only ever set it as a server-side variable. Never prefix it with
   `NEXT_PUBLIC_`.
4. **Storage → New bucket** named `eams-documents`, with **Public bucket OFF**. Files are served
   through short-lived signed URLs.
5. Optional, recommended: **Project Settings → Database → SSL Configuration → Download certificate**,
   and paste its contents into `DATABASE_CA_CERT`. With it, the app verifies the database's identity;
   without it, connections are encrypted but not verified.

## 2. Code on GitHub

The code lives at <https://github.com/axelblaze33/EAMS-Asset> (`main` branch); `.env` is never committed.
CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit and security tests, a production build, and
an end-to-end smoke test against a throwaway Postgres on every push.

## 3. Import into Vercel and deploy

1. <https://vercel.com/new> → **Import** `axelblaze33/EAMS-Asset`. Framework preset: Next.js (detected).
   Leave the build command as is: Vercel runs the `vercel-build` script, which on **production**
   generates the Prisma client, applies migrations (`prisma migrate deploy`), runs the idempotent
   seed, then builds. Preview deploys skip the database steps.
2. **Environment Variables** (environment: Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler URL, ending `?sslmode=require` |
   | `DIRECT_URL` | Supabase session pooler URL, ending `?sslmode=require` |
   | `SESSION_SECRET` | `openssl rand -base64 48`. Keep it fixed; changing it signs everyone out |
   | `CRON_SECRET` | `openssl rand -hex 24` |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role secret |
   | `SUPABASE_STORAGE_BUCKET` | `eams-documents` |
   | `COMPANY_NAME` | shown on labels, handover forms and report PDFs |
   | `APP_URL` | the final site URL, e.g. `https://eams-asset.vercel.app` (used in QR codes) |
   | `SEED_ADMIN_EMAIL` | the first Super Admin's email |
   | `SEED_ADMIN_NAME` | their name |
   | `SEED_ADMIN_PASSWORD` | a strong temporary password (10+ characters) |
   | `DATABASE_CA_CERT` | optional, see step 1.5 |
   | `DB_POOL_MAX` | `5` |

   Leave `SEED_DEMO_DATA` unset in production.
3. **Deploy.** The first production build creates all tables, roles, permissions and the Super Admin.
   Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then:
   - change that password (Users → Reset password) and **delete `SEED_ADMIN_PASSWORD` from Vercel**;
     it's only needed until the account exists;
   - set up Master Data (categories, departments, designations, branches, vendors), import employees
     and assets from Excel, and create logins for your IT and HR colleagues.
4. Every push to `main` redeploys production; other branches get preview URLs.

## 4. Daily reminders (Vercel Cron)

`vercel.json` schedules `GET /api/cron/daily` at 03:30 UTC (09:00 IST). It checks warranties expiring
within 30 days, returns due or overdue, handovers not acknowledged after 7 days, exit clearances
due within 3 days, and repairs open more than 14 days, then posts in-app notifications. Each
reminder is sent once (de-duplicated), so re-running is safe.

- Vercel sends `Authorization: Bearer $CRON_SECRET`; requests without it get 401.
- See runs under Vercel → Project → **Settings → Cron Jobs**. A Super Admin can also run the
  checks on demand from **Notifications → Run reminder checks**.

## 5. Running migrations safely

- Schema changes are created locally with `npm run db:migrate -- --name <change>`. This writes
  a new folder under `prisma/migrations/`, which you commit.
- On merge to `main`, the production build applies it with `prisma migrate deploy`, which only
  runs migrations that haven't been applied yet and never resets data.
- Before a risky migration, take a backup: Supabase → **Database → Backups**.

## 6. Custom domain

1. Vercel → Project → **Settings → Domains** → add e.g. `assets.yourcompany.com`.
2. At your DNS provider, add the record Vercel shows (usually `CNAME assets → cname.vercel-dns.com`).
3. HTTPS is automatic. Update `APP_URL` to the new domain and redeploy so QR codes use it.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build fails: `DATABASE_URL` / `DIRECT_URL` / `SESSION_SECRET is not set` | Add it in Vercel → Settings → Environment Variables (Production), then redeploy. |
| Build fails at `prisma migrate deploy` with `P1001` | `DIRECT_URL` uses the IPv6-only "Direct connection" host, or the password is wrong. Use the Session pooler (port 5432). |
| Build fails: `Set SEED_ADMIN_PASSWORD` | The first deploy needs `SEED_ADMIN_PASSWORD` until the Super Admin exists. |
| `self-signed certificate in certificate chain` | The URL uses `sslmode=verify-full`, or `DATABASE_CA_CERT` holds the wrong certificate. Use `sslmode=require`, or re-download the CA from Supabase. |
| `too many connections` / timeouts under load | `DATABASE_URL` must be the transaction pooler (6543); keep `DB_POOL_MAX` at 5 or lower. |
| `P1001 Can't reach database server` at runtime | Wrong host/port, or the Supabase project is paused (free projects pause after a week without activity). |
| Everyone is signed out after a deploy | `SESSION_SECRET` changed. Keep it fixed. |
| "File storage is not configured" | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are missing in Vercel. |
| Upload fails with a 4xx from Supabase | The bucket name doesn't match `SUPABASE_STORAGE_BUCKET`, or the bucket doesn't exist. |
| Import fails with "Body exceeded 4mb limit" | Import files are capped at 3 MB. Split the spreadsheet. (File uploads go straight to Supabase and aren't affected.) |
| QR labels point at a `*.vercel.app` URL | Set `APP_URL` to your custom domain and reprint. |
| A user can't sign in, "Too many failed attempts" | The account locks for 15 minutes after 5 failures. A Super Admin can reset the password to clear it. |
| Reminders never appear | `CRON_SECRET` missing in Vercel, or the cron job is disabled under Settings → Cron Jobs. |
| Lost the only Super Admin password | Set `SEED_ADMIN_EMAIL` to a new address and `SEED_ADMIN_PASSWORD` in Vercel, then redeploy: the seed creates another Super Admin. |
