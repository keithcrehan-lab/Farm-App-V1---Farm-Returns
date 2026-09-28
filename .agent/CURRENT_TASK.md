# Task: Tooling — fail closed on malformed audits and audit STOP markers

Starting HEAD: 8ef4663

## Goal

Finish hardening `scripts/agent-run` by fixing the two remaining CONFIRMED MEDIUM
findings from audit:

`.agent/history/audit-20260928T095039Z.md`

The autonomous runner must not be considered safe until these are resolved.

Do not modify Farm Return product/domain code.

## Finding 1 — malformed audit counts can produce CLEAN

Current defect:

An audit summary such as:

`CRITICAL=0oops HIGH=0oops MEDIUM=0oops LOW=0oops`

can be parsed as four zero values and the runner may declare CLEAN.

### Required behaviour

Accept severity counts only from a complete canonical audit summary with exactly:

`CRITICAL=<integer> HIGH=<integer> MEDIUM=<integer> LOW=<integer>`

Requirements:

- all four fields required;
- non-negative base-10 integers only;
- no suffix/prefix junk;
- no partial matches;
- no duplicate severity fields;
- no missing fields;
- no additional conflicting severity summary;
- canonical audit status/verdict must also be valid;
- malformed or ambiguous audit data => STOP/fail closed;
- never infer zero from malformed text.

Prefer reusing/extending existing harness parsing helpers rather than duplicating
parsing logic.

## Finding 2 — audit STOP markers are ignored

Current defect:

An audit artifact containing an explicit STOP/human-review condition can still be
accepted as CLEAN when severity counts are zero.

### Required behaviour

Before accepting an audit as clean OR starting an automatic repair:

- inspect the canonical audit artifact for an explicit STOP condition;
- STOP must take precedence over severity counts;
- `CRITICAL=0 HIGH=0` must never override an explicit STOP;
- return non-zero;
- record HUMAN REVIEW / STOP in the run summary;
- do not run a fix after an audit STOP;
- do not print CLEAN.

Use the existing harness's STOP semantics where possible.

Do not create an overly broad substring rule that treats harmless prose containing
the English word "stop" as a STOP unless that matches existing canonical harness
semantics.

## Preserve previous HIGH fix

Do not regress the task-integrity fix in `8ef4663`.

The runner must continue to:

- snapshot/hash `.agent/CURRENT_TASK.md`;
- reject task mutation after build/fix/audit phases;
- reject Verify command mutation;
- stop before accepting verification or further phases.

## Required regression tests

Add deterministic tests using the existing fake Claude/Codex harness.

At minimum prove:

A. exact canonical `CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0` => accepted;

B. `CRITICAL=0oops HIGH=0 MEDIUM=0 LOW=0` => STOP;

C. `CRITICAL=0 HIGH=0oops MEDIUM=0 LOW=0` => STOP;

D. duplicate severity summary => STOP;

E. missing severity field => STOP;

F. negative/non-integer severity => STOP;

G. valid zero-count audit with canonical STOP condition => STOP and no fix;

H. valid HIGH audit with canonical STOP condition => STOP and no automatic fix;

I. ordinary explanatory prose containing "stop" but not a canonical STOP marker does
   not false-positive, if consistent with existing harness semantics;

J. task-mutation regression test from `8ef4663` still passes;

K. normal HIGH -> fix -> clean path still works;

L. Medium/Low-only valid audit without STOP can still finish CLEAN under existing policy.

## Verification

Run the complete agent-run tooling test suite.

Then run full:

`npm test`

Verify command: `npm run typecheck && npm run build`

Do not report DONE if only the HIGH/task-mutation tests pass.

All new malformed-audit and audit-STOP regression tests must pass.

## Documentation/state

Update in the SAME commit as required by repo conventions:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record that this is tooling hardening only and changes no Farm Return product behaviour.

## Scope exclusions

Do NOT:

- alter Campaign B;
- change product/domain logic;
- modify Supabase;
- push;
- deploy;
- add migrations;
- weaken Critical handling;
- change audit severity policy;
- introduce unlimited repair rounds;
- redesign the runner.

Keep this narrowly focused on strict audit parsing and explicit audit STOP handling.

