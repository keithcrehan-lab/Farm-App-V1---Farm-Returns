# Task: Harness Phase 3 — automated task start and hands-off execution

TASK ID

harness-phase-3-agent-start-20261001

Starting HEAD: c3d0c1b
Verify command: `npm run typecheck && npm run build`

## Objective

Add `scripts/agent-start`: a deterministic, local task-initialisation layer above the frozen
runner v1. It generates `.agent/CURRENT_TASK.md` and `.agent/TASK.json` from a title and brief,
uses the current clean HEAD as base, validates, dry-runs `scripts/agent-run`, rolls back on
failure, and with `--run` hands off to `scripts/agent-run`. Zero model calls during setup.

## Scope

- `scripts/agent-start` (one entrypoint), its tests, tooling-test wiring, `.agent/README.md`.
- CLI: --title, --brief | --brief-file, --run, --verify, --domain, --expected-file, --contract,
  --force-new-task. Deterministic task ID (title slug + local YYYYMMDD).
- Preflight: Farm Return repo, allowed branch, clean tree, HEAD, required files, no live runner
  lock, previous task not active/incomplete (ACTIVE_TASK_EXISTS / PREVIOUS_TASK_STATE_AMBIGUOUS).
- Backup + atomic writes; restore on any failure before runner launch (RUNNER_DRY_RUN_FAILED).
- Lean TASK.json from the existing schema: task-specific fields replaced, global fields kept.

## Out of scope

- Runner v1 completion, model-call, audit, fix-loop, verification-category, lock and
  audit-provenance logic; HR-F006; HR-F007.
- Farm Return production code, science, Campaign C, migrations, push/deploy, secrets.

## Acceptance criteria

The user no longer edits CURRENT_TASK.md/TASK.json by hand; current clean HEAD is the base;
dry-run happens automatically; --run hands off to agent-run; setup makes zero model calls;
context is lean; failure restores previous task files; targeted tests and the quality gate pass.

## Required tests

The 20 agent-start cases in the task brief (fixture repos, fake CLIs), then
`bash scripts/tests/agent-run.test.sh`, `python3 scripts/tests/agent-context.test.py`,
`scripts/quality-gate.sh` once.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if this needs runner v1 behaviour changes, production code
changes, or scope materially expands.
