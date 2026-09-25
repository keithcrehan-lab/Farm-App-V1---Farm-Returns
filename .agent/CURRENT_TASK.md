# Task: (none — replace with a short task title)

<!--
Reusable template. Copy it over, fill in every section, then run
./scripts/agent-build. Keep it short: agents read it on every stage.
The "Task:" title, "Starting HEAD:" and "Verify command:" lines are read by
the scripts, so keep their exact prefixes.
-->

Starting HEAD: auto
<!-- "auto" = HEAD when agent-build starts. Or pin a full SHA: the build
refuses to run unless that SHA is HEAD or an ancestor of HEAD, and the
audit uses it as the baseline. -->

Verify command: `npm run typecheck && npm test`
<!-- The command the scripts run after build/fix. Claude's report is not
trusted, so this runs independently before any checkpoint commit. Narrow it
to targeted tests where that's enough, e.g.
`npm run typecheck && npx vitest run src/domain/foo.test.ts` -->

## Objective

One or two sentences: what must be true when this task is done.

## Scope

- Files, modules or screens this task may change.

## Out of scope

- What must not change (e.g. frozen contracts, unrelated screens,
  migrations).

## Acceptance criteria

- [ ] Observable, testable outcomes.

## Required tests

- New or updated unit tests (name the files).
- Regression tests for any defect fixed.

## STOP conditions

Stop, make no further changes, and end with `BUILD_RESULT: BLOCKED`
explaining why if:

- the task needs a number with no documented, sourced rule;
- it would change a frozen contract, a migration against a non-dev DB,
  `main`, secrets, or Claude/Codex settings or hooks;
- it needs files outside Scope;
- the acceptance criteria are ambiguous or contradict the code.
