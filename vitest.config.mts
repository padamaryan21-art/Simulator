import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests need the real database and are opt-in: npm run test:integration
    exclude: ["tests/integration/**", "node_modules/**"],
    environment: "node",
  },
});
