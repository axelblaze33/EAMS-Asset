// Vercel build entry (runs instead of `npm run build` because package.json has
// a "vercel-build" script). Applies pending migrations only on production
// deployments, so preview builds from branches never change the live schema.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("npx prisma generate");

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL) {
    console.error("DIRECT_URL is not set; refusing to deploy without running migrations.");
    process.exit(1);
  }
  run("npx prisma migrate deploy");
} else {
  console.log(`Skipping migrations for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`);
}

run("npx next build");
