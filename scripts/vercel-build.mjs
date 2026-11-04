// Vercel build entry (runs instead of `npm run build` because package.json has
// a "vercel-build" script). On production deployments only, it applies pending
// migrations and runs the idempotent seed (roles/permissions, first Super Admin),
// so preview builds from branches never change the live database.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npx prisma generate");

if (process.env.VERCEL_ENV === "production") {
  for (const key of ["DATABASE_URL", "DIRECT_URL", "SESSION_SECRET"]) {
    if (!process.env[key]) {
      console.error(`${key} is not set for Production in Vercel → Settings → Environment Variables.`);
      process.exit(1);
    }
  }
  run("npx prisma migrate deploy");
  // Safe to repeat: creates the Super Admin only if that email doesn't exist yet
  // (needs SEED_ADMIN_PASSWORD the first time), never overwrites role changes.
  run("npx prisma db seed");
} else {
  console.log(`Skipping migrations and seed for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`);
}

run("npx next build");
