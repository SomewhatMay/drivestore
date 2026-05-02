import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],

      include: ["src/**/*.ts"],

      exclude: ["src/index.ts"],
    },
  },
});
