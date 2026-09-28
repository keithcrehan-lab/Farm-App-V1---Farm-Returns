# Task: Tooling — add safe autonomous build/audit/fix runner

Starting HEAD: 3bd125c

## Goal

Add a safe orchestration command:

`./scripts/agent-run`

that autonomously executes the existing Claude -> Codex -> Claude repair loop for a
single CURRENT_TASK, while preserving the existing human safety boundaries.

The purpose is to remove repetitive manual execution of:

- `./scripts/agent-build`
- `./scripts/agent-audit`
- `./scripts/agent-fix`
- `./scripts/agent-audit`
- subsequent repair rounds

The runner must STOP and return control to the human whenever a real judgement,
safety boundary, failed verification or unexpected repository state is reached.

Do not weaken any existing agent-build, agent-audit or agent-fix safeguards.

## Required workflow

Given a valid `.agent/CURRENT_TASK.md`:

1. Validate repository/task state using existing harness helpers.
2. Run the normal build phase.
3. If build fails or returns anything other than a valid DONE state:
   STOP.
4. Run a full Codex audit.
5. Parse the actual audit result from the canonical audit artifact.
6. If:
   - CRITICAL = 0
   - HIGH = 0

   finish successfully.

7. If CRITICAL > 0:
   STOP immediately for human review.
   Never auto-fix a Critical finding.

8. If HIGH > 0:
   run the normal Claude fix phase.

9. After the first fix, run a focused verification audit.

10. If the focused audit has:
    - CRITICAL = 0
    - HIGH = 0

    finish successfully.

11. If HIGH remains:
    run another repair round using the existing explicit later-round mechanism
    equivalent to:

    `./scripts/agent-fix --another-round`

12. Continue focused fix -> audit rounds up to a finite configurable ceiling.

Default ceiling:

`MAX_FIX_ROUNDS=4`

This means at most four Claude repair rounds after the original build.

13. If the ceiling is reached and Critical/High findings remain:
    STOP for human review.

## Safety boundaries

The autonomous runner must NEVER:

- push to GitHub;
- deploy;
- apply Supabase migrations;
- mutate Farm Return V1 Dev;
- run destructive git commands;
- reset/rebase/force checkout;
- suppress failed tests;
- reinterpret a STOP condition as permission to continue;
- automatically broaden CURRENT_TASK scope;
- auto-fix CRITICAL findings;
- continue after an invalid/malformed audit result;
- continue after an unexpected dirty working tree unless the dirty files are
  recognised harness state explicitly permitted by the existing scripts.

Existing agent script safeguards remain authoritative.

If an underlying script refuses to proceed, agent-run must STOP rather than bypass it.

## Explicit STOP detection

The runner must stop for human review when any phase indicates:

- `BUILD_RESULT` is not DONE;
- CRITICAL > 0;
- a documented `STOP` condition;
- verification/test/typecheck/build failure;
- audit result cannot be parsed reliably;
- task or HEAD lineage becomes inconsistent;
- unexpected working-tree changes;
- underlying script exits non-zero in a way not explicitly handled;
- maximum fix rounds exhausted.

Do not try to infer how to repair these situations.

## Audit parsing

Do not parse human-facing terminal prose if a canonical structured/state artifact
already exists.

Inspect the existing harness and reuse its current audit/state parsing helpers where
possible.

The authoritative values must remain:

- CRITICAL
- HIGH
- MEDIUM
- LOW
- audit status/verdict
- audit range
- build/fix result

Do not duplicate existing parsing logic unnecessarily.

## Repair-round semantics

The runner should respect the existing harness distinction between:

- first `agent-fix`
- later `agent-fix --another-round`

Do not remove the existing manual third-round safety mechanism globally.

`agent-run` is an explicit opt-in command by the human, so it may invoke later rounds
within this one bounded autonomous run.

Other scripts must retain their current behaviour.

## Output

Keep terminal output concise but make progress visible.

Example:

------------------------------------------------------------
AGENT RUN
Task: Campaign B ...
Start: abc1234
Max fix rounds: 4
------------------------------------------------------------

[1] BUILD
PASS -> def5678

[2] AUDIT
0C / 1H / 0M / 0L

[3] FIX ROUND 1
PASS -> 123abcd

[4] VERIFY AUDIT
0C / 0H / 1M / 0L

AGENT RUN COMPLETE
Status: CLEAN
Start: abc1234
Final: 123abcd
Fix rounds: 1
Tests/verification: PASS
Remaining: 0 Critical / 0 High / 1 Medium / 0 Low

Medium/Low findings do not prevent CLEAN unless existing harness policy says otherwise.

## Persistent run record

Create a run summary under `.agent/history/`.

Suggested name:

`run-<timestamp>.md`

It should record at minimum:

- task title;
- starting HEAD;
- final HEAD;
- each build/fix commit;
- each audit artifact;
- each audit severity result;
- repair round count;
- final status;
- reason for STOP if stopped;
- verification result if available.

Do not copy huge Claude/Codex logs into this summary. Link/reference their existing
history files instead.

## Exit codes

Use meaningful shell exit codes:

- 0 = CLEAN / completed successfully
- non-zero = human intervention required or execution failed

Document them briefly in the script or tooling docs.

## Interrupt handling

If the user presses Ctrl+C:

- exit cleanly;
- do not delete history;
- do not attempt another operation;
- print the current phase and tell the user to run `./scripts/agent-status`.

Do not leave a fake CLEAN state.

## Idempotence / restart

Do not pretend a partially completed autonomous run can safely resume unless the
existing harness can prove the required state.

A fresh invocation should inspect current task/HEAD/history using existing rules and
either:

- safely start from the established state; or
- refuse and explain what human action is required.

Do not invent resume semantics.

## Configuration

Support:

`MAX_FIX_ROUNDS`

as an environment variable.

Example:

`MAX_FIX_ROUNDS=2 ./scripts/agent-run`

Validate that it is a sensible non-negative integer.

Default = 4.

Do not add a mode for unlimited repair rounds.

## Existing scripts

Prefer composing the existing scripts rather than duplicating their Claude/Codex
implementation.

Inspect:

- `scripts/agent-build`
- `scripts/agent-audit`
- `scripts/agent-fix`
- `scripts/agent-status`
- `scripts/agent-lib.sh`
- `AGENTS.md`
- `.agent/` state/history conventions

before implementation.

The existing commands must continue to work independently exactly as they do now.

## Testing

Add deterministic tests for the orchestration logic without making real Claude/Codex
calls.

At minimum cover:

A. build clean + first audit clean -> exits 0, no fix;

B. build clean + 1 HIGH -> first fix -> verification clean;

C. HIGH survives first fix -> `--another-round` is used;

D. CRITICAL in audit -> immediate STOP, no fix;

E. build failure -> STOP, no audit/fix;

F. malformed/unparseable audit -> fail closed;

G. fix verification failure -> STOP;

H. maximum fix rounds exhausted -> STOP;

I. Medium/Low only -> CLEAN;

J. Ctrl+C/interruption path does not claim CLEAN;

K. invalid MAX_FIX_ROUNDS rejected;

L. underlying dirty-tree/task guard is not bypassed;

M. no code path invokes push, deploy or migration commands.

Use stubs/fakes/fixtures for subprocess behaviour rather than invoking live agents.

## Documentation

Update the appropriate tooling documentation and:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record that this is tooling only and does not alter Farm Return product behaviour.

Include usage:

`./scripts/agent-run`

and:

`MAX_FIX_ROUNDS=2 ./scripts/agent-run`

Explain that Critical findings, STOP conditions, failed verification and exhausted
repair rounds still require human review.

## Scope exclusions

Do NOT:

- modify Farm Return domain/product logic;
- work on Campaign B;
- change Supabase;
- push;
- deploy;
- apply migrations;
- change existing audit severity policy;
- auto-resolve Medium/Low findings unless the existing scripts already do so;
- introduce background daemons/services;
- add external dependencies unless genuinely necessary.

Keep this a small shell/tooling orchestration layer over the existing harness.

## Verification

Run tooling-specific tests.

Then full `npm test` if the repo tooling conventions require it.

Verify command: `npm run typecheck && npm run build`

Only report DONE if:

- autonomous clean path works;
- bounded repair path works;
- Critical/STOP path fails closed;
- existing manual commands still work;
- tests and verification pass.

