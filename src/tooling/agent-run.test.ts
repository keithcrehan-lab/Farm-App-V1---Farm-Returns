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
// An enclosing agent-run's state must never leak into the fixtures.
const env = { ...process.env };
delete env.AGENT_RUN_STATE;
delete env.AGENT_PHASE;

describe("scripts/agent-run", () => {
  it("harness scripts pass shell and python syntax validation", () => {
    const shell = ["agent-lib.sh", "agent-build", "agent-audit", "agent-fix", "agent-run", "agent-status", "codex-audit.sh", "tests/agent-run.test.sh", "tests/agent-start.test.sh"];
    for (const f of shell) {
      const run = spawnSync("bash", ["-n", path.join(repoRoot, "scripts", f)], { encoding: "utf8" });
      expect(run.status, `${f}: ${run.stderr}`).toBe(0);
    }
    const py = spawnSync("python3", ["-c", "import ast,sys\nfor f in sys.argv[1:]: ast.parse(open(f).read(), f)",
      ...["agent-context.py", "agent-runstate.py", "agent-start", "tests/agent-context.test.py"].map((f) => path.join(repoRoot, "scripts", f))], { encoding: "utf8" });
    expect(py.status, py.stderr).toBe(0);
  });

  it("passes the harness boundary/usage tests (agent-context.test.py)", () => {
    // The worker may pass on an ignored SIGTERM; the timeout test needs the default disposition.
    const script = path.join(repoRoot, "scripts/tests/agent-context.test.py");
    const boot = "import runpy,signal,sys\nsignal.signal(signal.SIGTERM, signal.SIG_DFL)\nsignal.signal(signal.SIGINT, signal.SIG_DFL)\nsys.argv=[sys.argv[1]]\nrunpy.run_path(sys.argv[0], run_name='__main__')";
    const run = spawnSync("python3", ["-c", boot, script], {
      cwd: repoRoot, encoding: "utf8", env, timeout: 300_000,
    });
    expect(run.status, `${run.stdout ?? ""}${run.stderr ?? ""}`).toBe(0);
  }, 320_000);

  it("passes the task-start tests (agent-start.test.sh: setup, rollback, guards, hand-off)", () => {
    const run = spawnSync("bash", [path.join(repoRoot, "scripts/tests/agent-start.test.sh")], {
      cwd: repoRoot, encoding: "utf8", env, timeout: 600_000,
    });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output).toMatch(/agent-start tests: \d+ passed, 0 failed/);
    expect(run.status, output).toBe(0);
  }, 620_000);

  it("passes its orchestration tests (budget, resume, verification policy, gates)", () => {
    const run = spawnSync("bash", [path.join(repoRoot, "scripts/tests/agent-run.test.sh")], {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      // Grows with the suite; under full `npm test` load it exceeded 1180 s (2026-10-01).
      timeout: 2_400_000,
    });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output).toMatch(/agent-run tests: \d+ passed, 0 failed/);
    expect(run.status, output).toBe(0);
  }, 2_420_000);
});
