import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Tests spawn real npm installs and MCP child processes.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Each test file manipulates FLUNE_HOME / env; keep files isolated.
    fileParallelism: false,
  },
});
