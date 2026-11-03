import { defineConfig } from "vitest/config";

// Runs against a live server with demo data (npm run db:seed with SEED_DEMO_DATA=true):
//   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
