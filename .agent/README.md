# Task-scoped agent workflow

GLOBAL safety lives in AGENTS.md; CLAUDE.md imports it. DOMAIN context is selected by
TASK.json and expanded through actual dependencies. TASK context is CURRENT_TASK, the
complete diff inventory, relevant tests, and current findings. History is on demand.

## Start a task

```sh
./scripts/agent-start --title "..." --brief "..."              # task files + dry run → READY
./scripts/agent-start --title "..." --brief-file brief.md --run # ... then hand off to agent-run
```

`agent-start` is local and deterministic (no model call). It refuses unless the tree is
clean, the branch is not main, no live runner holds the lock and the previous task is
complete (runner COMPLETE, or a clean committed primary/final audit at HEAD); a stopped or
not-started task needs `--force-new-task`, which never overrides a running task, a live
lock or a dirty tree. It uses the current HEAD as base, derives the task ID from the title
slug and local date (`cc-fu-b-...-20261001`), keeps the brief's own sections and adds the
standard Scope/Out of scope/Acceptance/Tests/STOP sections it lacks, and writes a lean
TASK.json (schema fields kept, task fields replaced; domains from simple keywords or
`--domain`; migration authority only ever from an explicit `--domain`). Options: `--verify`,
`--domain`, `--expected-file`, `--contract` (repeatable). Both files are backed up and
written atomically; a failed `agent-run --dry-run` restores them exactly.

Manual alternative: write CURRENT_TASK.md (title, explicit Starting HEAD, scope, acceptance, Verify command)
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
./scripts/agent-run [--dry-run] [--full-tests] [--max-fix-rounds 1|2] [--no-auto-commit]
./scripts/agent-status                      # local, read-only run/model-call/verification status
```

`--full` remains a compatibility alias for **primary task** audit, never baseline-wide.
Manually, a final audit is separate; if it finds High, fix, narrowly verify, rerun final.
Subsequent manual fix rounds after a verification audit require `--another-round`.
STOP, malformed output, unavailable review and Critical/High block closure.
Retry unavailable CLI calls; never replace independent review with self-review.

## Autonomous runner (token budget)

`agent-run` is deterministic orchestration over the scripts above; no model decides flow.
PRECHECK (shell only) → build → primary audit → CLOSE when CRITICAL=0 HIGH=0: 2 calls.
Critical/High → fix → focused `--final` → CLOSE: 4 calls. By default that is the limit:
at most **two automatic Codex audits** (`--max-fix-rounds 1`). Still Critical/High →
HUMAN_DECISION_REQUIRED (REPEATED_HIGH_FINDING), state kept. Another remediation round is
explicit human action: `--max-fix-rounds 2` at start, or on a rerun of that stop (authorises
exactly one more fix + final; max 6 calls / 3 audits), or fix manually.
Medium/Low are recorded, never fixed or re-audited automatically; no remediation audits.
A clean primary audit reviewed the complete task delta at the closing HEAD, so it *is*
the task's final audit and is not repeated. The fix receives only open Critical/High
findings (`*.open-findings.md`); the final audit covers the original files, fix diff and
earlier findings. Stage is saved after every step in `history/run-state-<task_id>.json`;
rerunning resumes and never repeats a successful call (an unrecorded completed audit of the
same kind/HEAD is adopted). A run whose build/fix ended without `BUILD_RESULT` (or whose
harness commit failed) but left coherent, verified work is committed as DONE_RECOVERED;
`--no-auto-commit` turns that into a human stop. Terminal human stops are kept until you
delete the run-state file; UNASSESSED audits and Ctrl+C resume on rerun. A Codex
usage-limit/quota error is QUOTA_EXHAUSTED (agent-audit exit 4): distinct from UNASSESSED,
never retried; the stop quotes Codex's own reset message (none is computed). Do not rerun
until the limit resets or credits exist; the rerun resumes at that audit, no rebuild. One runner per
worktree (`history/agent-run.lock`; a dead same-host owner is stale, anything else stops).
Stops print `AGENT_RUN_RESULT`, `REASON`, `DETAIL`, `NEXT_RECOMMENDED_ACTION`; each run
writes `history/run-<run_id>.json` (calls, findings, verification, usage, report paths).

Runner verification is by changed-path category (base..working tree, highest wins):
A docs → diff check/JSON only · B scripts/tests/tooling → targeted tests + typecheck +
scoped lint · C UI → related tests + typecheck (+ build for `src/app`) · D production logic
→ related tests + typecheck + scoped lint + build · E shared/frozen contract, config or
unknown path → full `quality-gate.sh` · F migration → human gate unless the task's domains
authorise migrations. `--full-tests` or TASK.json `"full_suite": true` forces E. A command
whose relevant files (docs excluded for typecheck/lint/build) are unchanged since it passed
in this run is reused, not rerun. `FULL_SUITE: NOT_REQUIRED` is recorded, not a gap.

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
and is followed by that gate unless the task verify command is exactly the gate itself
(under agent-run: followed by the category plan above instead).

Tests (all three also run in npm test via `src/tooling/agent-run.test.ts`):
`bash scripts/tests/agent-run.test.sh` (mock CLIs), `python3 scripts/tests/agent-context.test.py`,
and shell `bash -n` / Python syntax checks.

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
Implementation, architecture and science retain current CLI model settings
(`AGENT_CLAUDE_MODEL` override); no automatic downgrade. Codex audits use an explicit tier,
`AGENT_AUDIT_TIER=standard|strict` (default standard): standard = `gpt-6.1-sol`, reasoning
`medium`; strict = `gpt-6-astra`, reasoning `high` (passed as `-m <model> --config
model_reasoning_effort=<effort>`). Explicit `AGENT_CODEX_MODEL` / `AGENT_CODEX_REASONING`
override the tier. An unknown tier/malformed value is rejected before any model call; the
console preamble, audit artifact (`auditor:` line) and usage telemetry state the effective
tier/model/reasoning. Audit rules, read-only sandbox and the C/H gate are tier-independent.
Jev implementation is absent at b24c266. Future routing can consume domains, scope size,
stage, prior results and an explicit risk classification. It must not choose a weaker
science/audit model merely because a diff is small. No Jev dependency is introduced.
