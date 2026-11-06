// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

function runCase(changedPath: string, env: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "agent-verify-policy-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, ".agent/history"), { recursive: true });
  copyFileSync(path.join(repoRoot, "scripts/agent-lib.sh"), path.join(root, "scripts/agent-lib.sh"));
  writeFileSync(
    path.join(root, "scripts/quality-gate.sh"),
    "#!/usr/bin/env bash\ntouch .full-gate-ran\nexit 0\n",
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(root, ".agent/CURRENT_TASK.md"),
    "# Task: Verify policy fixture\nStarting HEAD: auto\nVerify command: `true`\n",
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  mkdirSync(path.dirname(path.join(root, changedPath)), { recursive: true });
  writeFileSync(path.join(root, changedPath), "base\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
  writeFileSync(path.join(root, changedPath), "changed\n");

  const script = "source scripts/agent-lib.sh; run_verify";
  const result = spawnSync("bash", ["-c", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, AGENT_CAMPAIGN_MODE: "1", ...env },
  });
  return {
    result,
    gateRan: existsSync(path.join(root, ".full-gate-ran")),
    state: readFileSync(path.join(root, ".agent/STATE.md"), "utf8"),
  };
}

describe("campaign checkpoint verification policy", () => {
  it("defers the full repository gate for phase-local campaign edits", () => {
    const { result, gateRan, state } = runCase("src/domain/schemes/local.ts");
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(gateRan).toBe(false);
    expect(state).toContain("full suite deferred to FREEZE");
  });

  it.each([
    "src/lib/farm-data/shared.ts",
    "src/domain/types.ts",
    "package.json",
    "scripts/agent-helper",
  ])("forces the full gate for high-blast-radius change %s", (changedPath) => {
    const { result, gateRan } = runCase(changedPath);
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(gateRan).toBe(true);
  });

  it("honours the explicit force-full-gate override", () => {
    const { result, gateRan } = runCase("src/domain/schemes/local.ts", {
      AGENT_CAMPAIGN_FORCE_FULL_GATE: "1",
    });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(gateRan).toBe(true);
  });
});
