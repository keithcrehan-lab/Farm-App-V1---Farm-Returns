// @vitest-environment node
/**
 * Tooling only (no product behaviour): runs the deterministic shell tests
 * for scripts/agent-run so `npm test` covers the autonomous runner. The
 * shell suite uses fake claude/codex CLIs; no real AI call is made.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

describe("scripts/agent-run", () => {
  it("passes its orchestration tests (cases A–N)", () => {
    const run = spawnSync("bash", [path.join(repoRoot, "scripts/tests/agent-run.test.sh")], {
      cwd: repoRoot,
      encoding: "utf8",
      // Primary + final review fixtures add subprocesses; retain every case.
      timeout: 1_180_000,
    });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output).toMatch(/agent-run tests: \d+ passed, 0 failed/);
    expect(run.status, output).toBe(0);
  }, 1_200_000);
});
