# Task: Harness efficiency — Codex audit budget v2

Task ID: harness-efficiency-codex-audit-budget-v2-20261008
Starting HEAD: 4265e65835bd717b6ecaa9ee7fc95af7d2589ecf
Verify command: `npm run typecheck && npm run build`

# Harness efficiency — Codex audit budget v2

## Goal

Reduce ChatGPT/Codex allowance consumption materially while preserving the
independent Critical/High audit gate.

This is a HARNESS-ONLY change. Do not modify Farm Return production/domain/UI
code.

## Context

The existing harness already:
- performs deterministic verification outside Codex;
- uses changed-files-first auditing;
- makes the post-fix final audit focused on earlier findings/fix delta;
- does not auto-fix Medium/Low findings.

Preserve those properties.

The problem is that Codex auditing is consuming too much of the user's
five-hour allowance. A recent phase consumed roughly 70% of the window.

## Required changes

### 1. Standard audit tier

Make the default Codex audit configuration:

- model: `gpt-6.1-sol`
- reasoning effort: `medium`

Use the Codex CLI supported config form:
`--config model_reasoning_effort=<effort>`

Do not hard-code this in a way that prevents explicit overrides.

Support:
- `AGENT_CODEX_MODEL`
- `AGENT_CODEX_REASONING`

Explicit environment variables must win over defaults.

### 2. Strict audit tier

Add:

`AGENT_AUDIT_TIER=standard|strict`

Default: `standard`.

Standard:
- model `gpt-6.1-sol`
- reasoning `medium`

Strict:
- model `gpt-6-astra`
- reasoning `high`

Explicit `AGENT_CODEX_MODEL` and `AGENT_CODEX_REASONING` still override the tier.

Reject unknown tier values before making a model call.

The audit log / console preamble must clearly state the effective:
- tier
- model
- reasoning effort

Do not expose secrets.

### 3. Maximum two automatic Codex audits

Change the autonomous runner default so a normal task can make at most:

1. one primary Codex audit;
2. one focused final verification after one automatic fix.

Do NOT automatically enter a second fix + third audit cycle by default.

If the focused final audit still contains Critical or High findings:
- stop with HUMAN_DECISION_REQUIRED;
- preserve all state;
- explain that an additional remediation round requires explicit human action.

Retain an explicit opt-in mechanism for a second remediation round if the
existing `--max-fix-rounds 2` interface can safely support this.

Default should become one automatic fix round.

A clean primary audit must still close without an unnecessary second audit.

Medium/Low must remain non-blocking and must not cause another Codex call.

### 4. Quota-aware stopping

When Codex returns a usage-limit/quota error:
- classify it distinctly from a generic UNASSESSED audit;
- stop immediately;
- do not automatically retry;
- preserve run state at the current audit;
- surface the useful reset message from Codex if present;
- instruct the operator not to rerun until the reset/credits are available.

A later operator rerun must still resume at the same audit rather than rebuild.

Do not fabricate or calculate a reset time yourself.

### 5. Preserve audit quality

Do NOT weaken:
- Critical/High definitions;
- read-only Codex sandbox;
- complete changed-file inventory;
- UNKNOWN/zero safety rules;
- contract/evidence checks;
- task-base pinning;
- independent-auditor requirement;
- final finding-resolution evidence.

Do not remove the ability to run Astra strict audits.

### 6. No live Codex calls during implementation/testing

Do not invoke Codex while building or verifying this harness change.

Use deterministic/unit/shell tests with a stubbed/fake `codex` executable where
needed.

Tests must prove at minimum:

A. default tier resolves to gpt-6.1-sol + medium;
B. strict resolves to gpt-6-astra + high;
C. explicit model/reasoning overrides win;
D. invalid tier fails before a model call;
E. normal clean primary path needs one audit;
F. one C/H primary + fix + clean final needs two audits;
G. remaining C/H after final stops rather than automatically making audit #3;
H. quota error is classified as quota exhausted and run remains resumable;
I. existing resume/checkpoint safeguards remain intact.

Update comments/docs/help text to match the new behaviour.

## Verification

Run the existing deterministic harness tests relevant to:
- agent-audit
- agent-run
- agent-runstate

Run shell syntax checks on changed scripts.

Run the repository's appropriate targeted test command(s).

Do not run Codex.

## Completion report

Return:
- files changed;
- exact effective model/tier behaviour;
- automatic Codex-call budget before vs after;
- tests run/results;
- commit SHA;
- confirmation that no Codex call occurred;
- any remaining limitations.

## Scope

As stated in the task brief above; nothing beyond it.

## Out of scope

- unrelated Farm Return features;
- harness/runner changes unless explicitly named by the task;
- migrations unless explicitly authorised;
- pushes/deployments;
- secrets;
- external research unless explicitly allowed.

## Acceptance criteria

- The outcome stated in the task brief is delivered.
- The verify command passes.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

## STOP conditions

Stop with:

BUILD_RESULT: BLOCKED <reason>

if:

- task requires unsupported scientific interpretation;
- task requires external evidence not already available;
- task requires a migration without explicit authorisation;
- task requires frozen-contract changes not explicitly authorised;
- task scope materially expands;
- acceptance criteria contradict existing code/contracts;
- required files/context are unavailable.
