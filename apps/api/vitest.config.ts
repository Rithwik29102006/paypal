import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: "file:./dev.db",
      PAYPAL_MODE: "mock",
    },
  },
});
