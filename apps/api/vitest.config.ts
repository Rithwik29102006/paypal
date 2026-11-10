import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./dev.db",
      PAYPAL_MODE: "mock",
    },
  },
});
