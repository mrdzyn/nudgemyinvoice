import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts", "apps/web/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
