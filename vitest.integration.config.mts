import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against the real Supabase database, but ONLY on records they create
 * themselves (name prefix "ZZ-IT-") and delete afterwards. Opt-in:  npm run test:integration
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
