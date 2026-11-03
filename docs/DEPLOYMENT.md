# Deploying EAMS to Vercel

Stack in production: **Vercel** (app) + **Supabase** (PostgreSQL + Storage).
Neon works too for the database; you'd then still need Supabase (or another bucket) for files.

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**. Choose a region close to your users
   (e.g. Mumbai `ap-south-1`) and save the database password somewhere safe.
2. **Project → Connect** gives you two connection strings:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`, and append `?pgbouncer=true`
   - **Session pooler** (port `5432`) → `DIRECT_URL` (used only by migrations and the seed)
3. **Project Settings → API**: copy the **Project URL** (`SUPABASE_URL`) and the
   **service_role** secret (`SUPABASE_SERVICE_ROLE_KEY`). This key bypasses Row Level Security,
   so it must only ever be set as a server-side env var. Never prefix it with `NEXT_PUBLIC_`.
4. **Storage → New bucket**: name it `eams-documents`, and leave **Public bucket OFF**.
   The app serves files through 5-minute signed URLs.

## 2. Create the schema and the first Super Admin

From your machine, with `.env` pointing at the Supabase database:

```bash
cp .env.example .env            # then fill in the values from step 1
openssl rand -base64 48         # paste as SESSION_SECRET
npm install
npm run db:deploy               # applies prisma/migrations
npm run db:seed                 # roles, permissions, Super Admin (SEED_ADMIN_*)
```

Keep `SEED_DEMO_DATA="false"` for production. Sign in with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`, then create real users under **Users**.

## 3. Push the code to GitHub

```bash
git add .
git commit -m "EAMS phase 1"
git branch -M main
git remote add origin https://github.com/<your-org>/asset-management.git
git push -u origin main
```

`.env` is git-ignored. Check with `git status` that it isn't staged before you push.

## 4. Import the repository into Vercel

1. <https://vercel.com/new> → **Import** the GitHub repository. Vercel detects Next.js.
2. Leave **Build Command** as the default. Vercel runs the `vercel-build` script from
   `package.json`, which:
   - generates the Prisma client,
   - runs `prisma migrate deploy` **only when `VERCEL_ENV=production`** (preview deployments
     from branches never change the live schema),
   - runs `next build`.
3. **Environment Variables**: add these for **Production** (and Preview if you want previews
   to work against a separate database):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler URL + `?pgbouncer=true` |
   | `DIRECT_URL` | Supabase session pooler URL |
   | `DB_POOL_MAX` | `5` |
   | `SESSION_SECRET` | output of `openssl rand -base64 48` |
   | `SUPABASE_URL` | `https://<project>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role secret |
   | `SUPABASE_STORAGE_BUCKET` | `eams-documents` |
   | `APP_URL` | `https://assets.yourcompany.com` (used in QR codes) |
   | `COMPANY_NAME` | printed on asset labels and PDFs |
   | `CRON_SECRET` | random string (`openssl rand -hex 24`); required for daily reminders |

   Don't set `SEED_*` variables in Vercel. The seed is run from your machine.
4. Click **Deploy**. Later pushes to `main` deploy to production automatically, and other
   branches get preview URLs.

## 5. Daily reminders (Vercel Cron)

`vercel.json` schedules `GET /api/cron/daily` at 03:30 UTC (09:00 IST). It checks warranties expiring
within 30 days, returns due or overdue, handovers not acknowledged after 7 days, exit clearances
due within 3 days, and repairs open more than 14 days, then posts in-app notifications. Each
reminder is sent once (de-duplicated), so re-running is safe.

- Vercel sends `Authorization: Bearer $CRON_SECRET`; requests without it get 401.
- Check runs under Vercel → Project → **Settings → Cron Jobs**. A Super Admin can also run the
  checks on demand from **Notifications → Run reminder checks**.

## 6. Running migrations safely

- Schema changes are created locally with `npm run db:migrate -- --name <change>`. This writes
  a new folder under `prisma/migrations/`, which you commit.
- On merge to `main`, the production build applies it with `prisma migrate deploy`, which only
  runs migrations that haven't been applied yet and never resets data.
- Before a risky migration, take a backup: Supabase → **Database → Backups**.
- If you'd rather apply migrations by hand, remove the migrate step from
  `scripts/vercel-build.mjs` and run `npm run db:deploy` with production credentials before
  you deploy.

## 7. Custom domain

1. Vercel → Project → **Settings → Domains** → add `assets.yourcompany.com`.
2. At your DNS provider, add the record Vercel shows (usually `CNAME assets → cname.vercel-dns.com`).
3. HTTPS certificates are issued automatically. Session cookies are `Secure` in production, so
   always use the `https://` URL.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build fails: `DIRECT_URL is not set` | Add `DIRECT_URL` to the Production environment in Vercel. |
| `prepared statement "s0" already exists` | `DATABASE_URL` points at the transaction pooler without `?pgbouncer=true`. |
| `too many connections` / timeouts under load | Use the pooled URL for `DATABASE_URL` and keep `DB_POOL_MAX` at 5 or lower. |
| `P1001 Can't reach database server` during migrate | Wrong host/port, or the Supabase project is paused (free tier pauses after inactivity). |
| Everyone is signed out after a deploy | `SESSION_SECRET` changed between deploys. Keep it fixed. |
| Login redirects back to `/login` on a custom domain | You're using `http://`. The cookie is `Secure`, so use `https://`. |
| "File storage is not configured" | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are missing in Vercel. |
| Upload fails with a 4xx from Supabase | The bucket name doesn't match `SUPABASE_STORAGE_BUCKET`, or the bucket doesn't exist. |
| Import fails with "Body exceeded 4mb limit" | Import files are capped at 3 MB. Split the spreadsheet. (File uploads go straight to Supabase and aren't affected.) |
| QR labels point at a `*.vercel.app` URL | Set `APP_URL` to your custom domain and reprint. |
| A user can't sign in, "Too many failed attempts" | The account locks for 15 minutes after 5 failures. A Super Admin can reset the password to clear it. |
| Reminders never appear | `CRON_SECRET` missing in Vercel, or the cron job is disabled under Settings → Cron Jobs. |
| Lost the only Super Admin password | Run `npm run db:seed` with a different `SEED_ADMIN_EMAIL` to create another Super Admin. |
