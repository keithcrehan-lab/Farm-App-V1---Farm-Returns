# Task: Harness v3 — autonomous low-usage execution

Task ID: harness-v3-autonomous-low-usage-execution-20261008
Starting HEAD: ebe9b4bdab5f06d83c42a9073c45e5c0671c3fa0
Verify command: `npm run typecheck && npm run build`

# Harness v3 — autonomous low-usage execution

## Goal

Restore the hands-off user experience of the original Farm Return harness while
preserving the lower Codex usage introduced by audit-budget v2.

Normal operator experience must be:

    ./scripts/agent-start ... --run

Then no human intervention unless there is a genuine substantive blocker.

This is a HARNESS-ONLY task.
Do not modify Farm Return product/domain/UI behaviour.

## Preserve from v2

Keep all existing v2 guarantees:

- default audit tier:
  - gpt-6.1-sol
  - medium reasoning
- strict audit tier:
  - gpt-6-astra
  - high reasoning
- explicit AGENT_CODEX_MODEL / AGENT_CODEX_REASONING overrides
- invalid audit config fails before a model call
- maximum one primary Codex audit by default
- maximum one automatic fix
- maximum one focused final Codex audit
- Medium/Low do not trigger remediation
- quota exhaustion stops immediately and remains resumable
- task base pinning
- read-only independent Codex auditing
- UNKNOWN/zero protections
- no publishing/deploy/database actions

Normal phase maximum:
- 1 Codex call if primary passes
- 2 Codex calls if one Critical/High remediation is required

Do not increase that budget.

## Problem to solve

The v2 harness is too eager to return HUMAN_DECISION_REQUIRED for deterministic
verification failures that can safely be diagnosed and recovered without AI.

Recent real example:

- complete repository suite:
  4,817 tests passed
  1 tooling timeout test failed
- failing test:
  test_timeout_cleanup_needs_no_process_enumeration
- isolated rerun passed
- harness wrapper rerun passed
- targeted product tests passed
- typecheck/lint/build passed

The human then had to perform several manual recovery steps.

The old harness was more user friendly because it handled the phase end-to-end.

## Required behaviour

### 1. Deterministic verification recovery

When verification fails, do not immediately hand control to the human.

First classify the failure mechanically.

For test failures:

A. Capture the exact failing test file(s) and test name(s).

B. Only attempt automatic flaky recovery when:
- the failure set is small and bounded;
- maximum 2 failing test files;
- there is no crash, OOM, syntax error, compile error, assertion indicating a
  known product correctness failure, or other clearly deterministic failure;
- the failure is reproducible as an individual test target.

C. Retry each failing test target exactly ONCE in isolation.

D. If any isolated retry fails:
- stop HUMAN_DECISION_REQUIRED;
- preserve all work and diagnostics;
- do not disguise the failure as flaky.

E. If all isolated retries pass:
- record FLAKY_RECOVERED;
- preserve the original failure and isolated rerun evidence;
- continue with the remaining deterministic gates automatically.

Do not delete or hide the original failure.

### 2. Continue skipped quality gates automatically

If the normal quality gate stopped after tests and therefore skipped:
- typecheck
- lint
- build

then after a valid FLAKY_RECOVERED test result, run those skipped gates.

Only continue if all of them pass.

### 3. Build/fix checkpoint recovery

If Claude reports BUILD_RESULT: DONE but verification initially failed because
of a subsequently recovered deterministic flake:

- verify the working tree coherently;
- create the normal local checkpoint commit;
- update run state exactly as if normal verification had passed;
- continue automatically to the primary audit.

The operator must not need to manually git add/commit.

Apply the same behaviour after agent-fix.

### 4. No extra AI calls for recovery

All flaky recovery and verification retry logic must be deterministic shell /
Python / test-runner logic.

Do not invoke Claude or Codex merely to diagnose a verification failure.

### 5. Codex flow

Normal autonomous flow:

BUILD
→ deterministic verification
→ optional deterministic FLAKY_RECOVERED recovery
→ PRIMARY AUDIT (Sol medium)
→ if 0 C/H: COMPLETE

If C/H:
→ one Claude fix
→ deterministic verification
→ optional deterministic FLAKY_RECOVERED recovery
→ one focused FINAL AUDIT (Sol medium)
→ if 0 C/H: COMPLETE
→ otherwise HUMAN_DECISION_REQUIRED

Never automatically run audit #3.

### 6. Quota behaviour

If Codex returns usage/quota exhausted:

- stop immediately;
- reason = QUOTA_EXHAUSTED;
- preserve exact audit stage;
- preserve useful Codex-provided reset text;
- no automatic retry;
- later rerunning ./scripts/agent-run resumes at that audit;
- never rebuild or refix unnecessarily.

### 7. Observability

Final run report must show, where applicable:

Verification:
- tests: PASS / FAIL / FLAKY_RECOVERED
- isolated retries performed
- typecheck
- lint
- build

Model calls:
- build
- primary
- fix
- final
- total

Codex:
- effective tier
- model
- reasoning

If flaky recovery occurred, final COMPLETE report must explicitly say so.

### 8. Safety constraints

Automatic flaky recovery must be conservative.

It must NOT convert a genuine failing assertion into PASS simply because another
broad rerun happens to pass.

Prefer exact test-name/file reruns.

Maximum one isolated retry.

If reliable extraction of the exact failing target is impossible:
HUMAN_DECISION_REQUIRED.

No arbitrary repeated retries.

### 9. Tests

Add deterministic tests proving at minimum:

A. normal clean phase remains one-command autonomous;
B. single test timeout/failure that passes exact isolated retry becomes
   FLAKY_RECOVERED and proceeds;
C. isolated retry failure stops for human;
D. >2 failing test files stops for human;
E. typecheck/lint/build continue after recovered test flake;
F. build work is checkpointed automatically after recovered verification;
G. fix work is checkpointed automatically after recovered verification;
H. primary clean audit closes with one Codex audit;
I. primary C/H + fix + clean final closes with two Codex audits;
J. remaining final C/H stops without audit #3;
K. quota exhaustion remains resumable;
L. no recovery path invokes extra Claude/Codex calls.

Use fake/stub Codex and Claude processes where required.

Do NOT make live Codex calls while implementing or testing this harness task.

### 10. Documentation

Update harness docs/help comments so the intended operator workflow is clear:

    ./scripts/agent-start ... --run

should normally be sufficient.

Document FLAKY_RECOVERED and the conservative retry policy.

## Completion report

Return:

- files changed;
- exact autonomous flow;
- deterministic recovery policy;
- model-call budget;
- tests run and results;
- commit SHA if committed;
- explicit confirmation that no live Codex call occurred;
- any circumstances that still require human intervention.

## Scope

As stated in the task brief above; nothing beyond it.

## Out of scope

- unrelated Farm Return features;
- harness/runner changes unless explicitly named by the task;
- migrations unless explicitly authorised;
- pushes/deployments;
- secrets;
- external research unless explicitly allowed.

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
