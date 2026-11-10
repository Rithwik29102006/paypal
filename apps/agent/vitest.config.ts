import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Unit tests never call an LLM or the network.
    env: { DETECTOR_LLM: "off", MOCK_API: "1" },
  },
});
