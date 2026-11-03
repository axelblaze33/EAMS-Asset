# Security notes

What EAMS does to protect asset and employee data, how it's checked, and the known gaps.

## Controls

| Area | Control |
|---|---|
| Sign-in | bcrypt (cost 12) password hashes; generic "invalid email or password" errors; dummy hash compared for unknown emails so timing doesn't reveal accounts; 15-minute lockout after 5 failed attempts |
| Sessions | HS256-signed, httpOnly, `SameSite=Lax`, `Secure` in production, 12-hour expiry. Only the user id and a session version are stored. Role, permissions and active status are re-read on every request, so role changes and deactivation apply immediately. Password reset and deactivation invalidate existing sessions |
| Authorization | Every page calls `requireUser`/`requirePagePermission`, every server action calls `authorize(...)`, every API route calls `authorizeRoute(...)`. Hidden buttons are cosmetic only |
| Enforcement | `tests/unit/security.test.ts` fails CI if any server action, API route or page skips its check |
| Input | All writes validated with Zod on the server; enums, dates and amounts parsed strictly; list sorting limited to allow-listed columns |
| Database | Prisma parameterises queries; the few raw SQL queries use tagged templates. Critical flows (assign, return, clearance, maintenance) run in serializable transactions with conditional updates; a partial unique index makes double-assignment impossible |
| Files | Private Supabase bucket; uploads go browser → storage via one-time signed URLs; the server checks owner path, size and magic bytes before recording a file, and deletes mismatches; downloads use 5-minute signed URLs |
| Exports | CSV cells starting with `= + - @` are prefixed to stop spreadsheet formula injection; every export is written to the audit log |
| Audit | Append-only audit log of logins, edits (with before/after), assignments, returns, approvals, clearances and exports, with IP address |
| Headers | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, strict referrer policy, permissions policy, HSTS in production, `X-Powered-By` removed |
| Secrets | Server-only env vars (no `NEXT_PUBLIC_` secrets); `.env` is git-ignored; cron endpoint requires `CRON_SECRET`, compared in constant time |

## Known gaps / accepted risks

- **No IP-based rate limiting.** Lockout is per account. If the app is exposed publicly, add Vercel
  Firewall rate limiting on `/login`.
- **CSP allows inline scripts** (`'unsafe-inline'`), which Next.js needs without per-request nonces.
  Framing, plugins and foreign form posts are still blocked.
- **`npm audit` (production): moderate advisories in exceljs's transitive `minimatch` / `archiver`.**
  These are ReDoS issues in glob matching, which exceljs only uses internally with fixed patterns, never
  with user input. The fix needs a major version that exceljs's dependencies can't use. `uuid` was
  upgraded via an `overrides` entry; `tests/unit/security.test.ts` checks Excel export still works.
- **No two-factor authentication.** Consider SSO (Google Workspace / Microsoft Entra) if staff
  accounts grow.

## Reporting

Report suspected vulnerabilities privately to the IT administrator rather than in a public issue.
