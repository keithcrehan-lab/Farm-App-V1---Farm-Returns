import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // apps/mobile-spike is its own separate sub-project (own
    // package.json/tsconfig.json/node_modules — a Capacitor native-shell
    // spike, not part of this Next.js app) whose checked-in native
    // build output and vendored bundle.js were never meant to be
    // linted by this config at all.
    "apps/**",
    // .claude/worktrees holds full, git-ignored (.git/info/exclude)
    // copies of this repo used by isolated agent worktree sessions —
    // tool-internal, ephemeral, never part of this project's own
    // source. ESLint's flat config does not consult .gitignore, so this
    // needs its own explicit entry. Found real (Fertiliser Vertical V1,
    // Checkpoint 1, 2026-09-12 — the actual, dominant source of the
    // ~2500 pre-existing errors/~38,000 warnings a project-wide
    // `npm run lint` run surfaced for this unrelated checkpoint's own
    // quality gate; `apps/**` above accounted for only a small share of
    // that total, not the true root cause).
    ".claude/**",
  ]),
  ...nextVitals,
  ...nextTs,
]);

export default eslintConfig;
