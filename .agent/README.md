# Task-scoped agent workflow

GLOBAL safety lives in AGENTS.md; CLAUDE.md imports it. DOMAIN context is selected by
TASK.json and expanded through actual dependencies. TASK context is CURRENT_TASK, the
complete diff inventory, relevant tests, and current findings. History is on demand.

## Start a task

Write CURRENT_TASK.md (title, explicit Starting HEAD, scope, acceptance, Verify command)
and TASK.json (new task_id, matching title, full base_sha, domains, expected file hints,
contracts/evidence/tests/prohibited areas). The first command pins the task ID/title/base and
task text in ignored history. A boundary cannot change mid-task; use a new task ID for a
new authorised scope. Contract/test/dependency hints may expand as dependencies are found;
they cannot override the pinned task scope. Missing manifests are bootstrapped for legacy tasks from Starting HEAD
(or HEAD once for `auto`); thereafter the pin is immutable. Prefer explicit SHAs.

TASK.json is the immutable declaration. `.agent/history/status-<task_id>.json` is its
runtime audit manifest: exact head, review ranges, status and finding-artifact references.
STATE.md is only a local execution receipt. BUILD_STATE.json remains current programme state.
Never put historical prose back into either state file.

```sh
./scripts/agent-build                       # implement, verify + full quality gate, local commit
./scripts/agent-audit --primary             # entire TASK_BASE..HEAD
./scripts/agent-fix                         # fix current Critical/High; verified local commit
./scripts/agent-audit --remediation F001     # finding + fix_base..HEAD + related regressions
./scripts/agent-audit --verify              # same narrow mode, all findings from preceding audit
./scripts/agent-audit --final               # complete final task delta; required to close
./scripts/agent-run                         # bounded build/primary/fix/verify/final sequence
```

`--full` remains a compatibility alias for **primary task** audit, never baseline-wide.
A final audit is separate even if primary passed, as required by this phase's policy.
If final finds High, stop, fix and narrowly verify it, then rerun final. Critical findings
stop the autonomous runner. `MAX_FIX_ROUNDS=0..10` bounds repairs (default 4).
Subsequent manual fix rounds require `--another-round`; invoking agent-run authorises its
bounded rounds. STOP, malformed output, unavailable review and Critical/High block closure.
Retry unavailable CLI calls; never replace independent review with self-review.

## Explicit broader and working-tree reviews

```sh
./scripts/agent-audit --campaign <campaign-base-SHA>
./scripts/agent-audit --release <release-base-SHA>
./scripts/agent-audit --repository <base-SHA>  # range AND full current tree/security
./scripts/agent-audit --release v1-baseline-2026-08-29  # deliberately broad
./scripts/agent-audit --primary --working-tree         # precommit review, never closure
./scripts/codex-audit.sh                               # same task default
```

Committed audits refuse **all** nonignored uncommitted/new files, including .agent files.
Working-tree mode inventories tracked working changes, staged changes and every untracked
file using NUL-safe Git enumeration, and fingerprints content. It must read untracked
contents separately. Ignored local secrets/generated outputs are not task source.
Final requires a clean committed tree. A changed snapshot or HEAD invalidates review.
Expected file hints NEVER filter the inventory. Include changed code, additions/deletions,
callers/callees, schema, tests, relevant contracts/evidence; widen context when necessary.
A remediation emits STOP if evidence calls for broader review; it cannot silently restart
an entire task or declare completion. Final independently checks all task findings.

Legacy codex-audit `--base`, `--uncommitted` and HEAD-only `--commit` map to explicit scopes.
Legacy autopilot now runs one explicit task; stale next_action prose and auto-push are retired.
`--dry-run` on build/audit/fix shows prompts without AI calls (may initialise local task pins).

## Verification and usage

`quality-gate.sh` keeps npm test/typecheck/lint/build, fail-fast. Success is one compact line;
Tests use one worker to avoid host-contention timeouts; assertions and product-test time limits are unchanged.
Full logs are in `.agent/history/quality-*`; failure prints a diagnostic tail and full path.
Before every non-documentation commit, run the gate. Task verification runs independently
and is followed by that gate unless the task verify command is exactly the gate itself.

Tests: `bash scripts/tests/agent-run.test.sh` (also in npm test),
`python3 scripts/tests/agent-context.test.py`, and shell `bash -n` checks.

CLI outputs are local ignored history. Codex JSONL turn usage and Claude JSON aggregate
usage feed `history/usage.jsonl`: task/base/head/mode/duration/change counts/findings/result.
Missing or malformed usage is UNKNOWN. Cached input is a subset, not added twice. Requested
model and observed model are distinct; configured Codex model may remain UNKNOWN. No token
count is guessed from characters. Failed/incomplete calls remain recorded, never accepted.
Build/fix telemetry describes the working snapshot before commit. Only a final passing
receipt denotes an accepted task; sum its task's usage for tokens per accepted task. Finding
IDs and audit artifacts allow analysis per resolved finding; do not invent attribution of
whole-run usage to individual findings.

Status, file extraction, scope, log formatting, pinning and summaries are deterministic.
Implementation, architecture, science and independent audit retain current CLI model
settings (`AGENT_CLAUDE_MODEL`, `AGENT_CODEX_MODEL` overrides); no automatic downgrade.
Jev implementation is absent at b24c266. Future routing can consume domains, scope size,
stage, prior results and an explicit risk classification. It must not choose a weaker
science/audit model merely because a diff is small. No Jev dependency is introduced.
