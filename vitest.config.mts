import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest — unit tests for domain logic (CLAUDE.md: "versioned, pure
 * TypeScript domain modules under src/domain/ with unit tests"). Scoped to
 * src/ so it never picks up tests/e2e/*.spec.ts, which are Playwright
 * specs run via `npm run test:visual`, not Vitest — the two runners share
 * the *.spec.ts naming convention but are not interchangeable.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      // See test/server-only-mock.ts — the real `server-only` package
      // throws unless the "react-server" export condition is set, which
      // Vitest never sets (it doesn't bundle for the browser either way).
      "server-only": path.resolve(dirname, "./test/server-only-mock.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
