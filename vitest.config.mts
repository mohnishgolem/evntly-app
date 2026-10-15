import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js provides this at build time; tests run outside Next.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
