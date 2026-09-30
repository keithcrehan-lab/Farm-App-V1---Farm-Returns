# Task: Harness Phase 2 — token-efficient autonomous agent runner

Harness Phase 2 — token-efficient autonomous agent runner

TASK ID

harness-token-efficient-runner-20260930

Verify command: `npm run typecheck && npm run build`

BASELINE

Use the current clean HEAD as the immutable task base.

The current repository state is known-good.

Do not alter production science, Campaign C behaviour, or any frozen scientific contract in this task.

PURPOSE

Create a thin autonomous orchestration layer above the existing Farm Return agent harness that:

- removes routine human copy/paste;
- minimises Claude/Codex calls;
- minimises prompt/context size;
- minimises repeated tests;
- preserves the existing safety guarantees;
- stops only when a genuine human decision is required.

The runner should prefer:

FEWER CALLS
SMALLER CONTEXT
NARROWER AUDITS
TARGETED TESTS
EARLY SUCCESSFUL TERMINATION

over exhaustive repeated review.

Do not weaken correctness gates for Critical/High findings.

--------------------------------------------------
CORE COMMANDS
--------------------------------------------------

Create:

./scripts/agent-run

and:

./scripts/agent-status

Do not create a second task system.

Use the existing:

.agent/CURRENT_TASK.md
.agent/TASK.json
.agent/history/
scripts/agent-build
scripts/agent-audit
scripts/agent-fix

--------------------------------------------------
DEFAULT MODEL-CALL BUDGET
--------------------------------------------------

Normal task with no defects:

1 Claude build call
1 Codex primary audit call
0 fix calls
0 final audit calls

Target:

2 total model calls.

Normal task with one defect round:

1 Claude build
1 Codex primary audit
1 Claude fix
1 Codex final audit

Target:

4 total model calls.

Maximum automatic task:

1 build
1 primary audit
2 fix calls
2 final audits

Maximum:

6 model calls.

Hard defaults:

MAX_BUILD_CALLS=1
MAX_PRIMARY_AUDITS=1
MAX_FIX_CALLS=2
MAX_FINAL_AUDITS=2

No automatic remediation audits.

--------------------------------------------------
PRIMARY FLOW
--------------------------------------------------

PRECHECK
→ BUILD
→ PRIMARY AUDIT

If primary audit has:

CRITICAL=0
HIGH=0

then:

CLOSE

Do NOT run a final audit merely to confirm a clean primary audit.

MEDIUM/LOW alone do not trigger another model call.

If primary audit has Critical/High:

FIX
→ FINAL AUDIT

If final audit is clean:

CLOSE

If final audit finds remaining/new Critical/High:

SECOND FIX
→ SECOND FINAL AUDIT

If still not clean:

HUMAN_DECISION_REQUIRED

Never loop beyond this.

--------------------------------------------------
TOKEN-EFFICIENCY PRINCIPLE
--------------------------------------------------

Every model call must answer a specific unresolved question.

Do not call a model merely because:

- a commit exists;
- a previous model call completed;
- documentation changed;
- a Medium/Low finding exists;
- tests already passed;
- the same code has already been audited cleanly.

If no unresolved Critical/High issue exists:

do not call another auditor.

--------------------------------------------------
PRECHECK
--------------------------------------------------

Before any model call, use shell/local checks only.

Verify:

- expected branch;
- clean/acceptable tree;
- TASK.json exists;
- CURRENT_TASK.md exists;
- immutable base lock valid;
- no active runner lock;
- task metadata parses;
- required scripts exist.

Do not use Claude/Codex for preflight checks that shell can answer.

If preflight fails:

AGENT_RUN_RESULT: HUMAN_DECISION_REQUIRED

No model call.

--------------------------------------------------
BUILD
--------------------------------------------------

Run the existing:

./scripts/agent-build

Do not change its internal safety model unless strictly necessary for orchestration compatibility.

Expected outcomes:

BUILD_RESULT: DONE
BUILD_RESULT: BLOCKED

If DONE:

continue.

If BLOCKED:

stop unless the blocker is purely mechanical and explicitly recoverable under existing harness rules.

Output:

AGENT_RUN_RESULT: HUMAN_DECISION_REQUIRED

Do not call an auditor on a genuinely blocked build.

--------------------------------------------------
AMBIGUOUS BUILD COMPLETION
--------------------------------------------------

The current harness has sometimes:

- completed useful work;
- left valid edits;
- passed checks;
- but failed to print BUILD_RESULT because a background process or permission wrapper ended oddly.

Handle this mechanically where possible.

If agent-build exits without BUILD_RESULT:

inspect locally:

- working-tree state;
- expected changed files;
- test/process completion;
- task-specific verify result;
- absence of obvious partial/conflicted edits.

If the state is clearly coherent:

- run the minimum required local checks;
- create the normal build checkpoint commit;
- record that BUILD_RESULT was inferred as:

DONE_RECOVERED

Do not call Claude again just to ask whether its work is complete.

If coherence cannot be established:

HUMAN_DECISION_REQUIRED
REASON: AGENT_OUTPUT_AMBIGUOUS

--------------------------------------------------
CONTEXT MINIMISATION — BUILD
--------------------------------------------------

Do not expand build context unnecessarily.

Claude should receive:

1. CURRENT_TASK.md;
2. TASK.json;
3. directly relevant files identified by the task;
4. directly relevant contracts/evidence.

Do not preload:

- unrelated campaign history;
- broad repository documentation;
- historical audits;
- unrelated source trees.

Allow the build agent to inspect additional files only when required by dependencies.

--------------------------------------------------
PRIMARY AUDIT SCOPE
--------------------------------------------------

The default Codex audit must be changed-files-first.

Audit:

1. diff from immutable task base to current checkpoint;
2. files directly depended on by those changes;
3. contracts directly affected;
4. source/evidence records explicitly cited by those changes.

Do NOT perform a broad repository audit.

Explicit auditor instruction:

"Review only the task delta and directly affected dependencies/contracts/evidence. Do not re-audit unchanged historical code unless necessary to establish a concrete finding."

Do not spend tokens summarising unchanged architecture.

--------------------------------------------------
AUDITOR OUTPUT FORMAT
--------------------------------------------------

Keep audit output compact.

If clean:

AUDIT_RESULT: CLEAN
CRITICAL=0
HIGH=0
MEDIUM=<n>
LOW=<n>

Optional:
- concise Medium/Low titles only.

If findings exist, each finding must contain only:

ID
SEVERITY
FILE:LINE
PROBLEM
WHY_IT_MATTERS
REQUIRED_FIX

Do not include long narrative summaries unless needed.

Do not restate the whole task.

--------------------------------------------------
FINDING POLICY
--------------------------------------------------

Automatic fix threshold:

CRITICAL
HIGH

Automatic non-fix threshold:

MEDIUM
LOW

Medium/Low:

- record in closeout;
- do not trigger agent-fix;
- do not trigger another audit;
- unless they materially imply a Critical/High safety failure.

Do not automatically "clean up" advisory findings.

--------------------------------------------------
FIX CALL
--------------------------------------------------

When Critical/High exists:

run:

./scripts/agent-fix

Provide only:

- open Critical/High findings;
- files implicated by findings;
- directly required contract/evidence context;
- exact task safety constraints.

Do not send the full audit history.

Fix instruction:

"Fix only the open Critical/High findings. Do not refactor unrelated code. Do not opportunistically resolve Medium/Low findings. Do not broaden scope."

--------------------------------------------------
FINAL AUDIT SCOPE
--------------------------------------------------

After fix, run one:

./scripts/agent-audit --final

Its scope should be:

- original changed files;
- fix diff;
- direct dependencies/contracts/evidence;
- confirmation that prior Critical/High findings are resolved;
- detection of new Critical/High regressions caused by the fix.

Do not re-run a broad baseline audit.

Do not run per-finding remediation audits automatically.

--------------------------------------------------
SECOND FIX ROUND
--------------------------------------------------

Only if final audit still has Critical/High.

Pass only the remaining/new findings.

Run:

agent-fix
→ final audit

After second final:

if Critical/High remains:

stop.

AGENT_RUN_RESULT: HUMAN_DECISION_REQUIRED
REASON: REPEATED_HIGH_FINDING

Do not start a third fix loop.

--------------------------------------------------
TEST EFFICIENCY POLICY
--------------------------------------------------

Do not run the full test suite by default.

Classify changed scope automatically.

CATEGORY A — DOCS ONLY

Run:

- git diff --check;
- JSON/schema validation where relevant;
- no full npm test;
- no build unless docs tooling requires it.

CATEGORY B — ISOLATED NON-PRODUCTION MODULE

Run:

- targeted tests;
- typecheck;
- lint for changed files/module where practical.

Do not run full npm test automatically.

CATEGORY C — UI-ONLY

Run:

- relevant UI/component tests;
- typecheck;
- build only if required to validate changed route/bundle.

Do not run unrelated domain tests.

CATEGORY D — PRODUCTION DOMAIN LOGIC

Run:

- targeted domain tests;
- directly dependent tests;
- typecheck;
- build.

Run full suite only if:
- shared behaviour changed materially;
- task explicitly requires it;
- dependency graph is broad/uncertain.

CATEGORY E — SHARED/FROZEN CONTRACT CHANGE

Run:

- targeted tests;
- dependent tests;
- full suite;
- typecheck;
- build;
- required contract governance checks.

CATEGORY F — MIGRATION/SCHEMA

Run only under an explicitly authorised migration task.

Use migration-specific validation.

--------------------------------------------------
TEST RESULT CACHING
--------------------------------------------------

Within a single agent-run, record:

- command;
- HEAD/diff fingerprint;
- pass/fail;
- timestamp.

If files relevant to a test command have not changed since that command passed:

do not rerun it automatically.

Example:

If typecheck passed after build and the fix changes only a markdown file:

do not rerun typecheck.

If targeted tests passed after a fix and final audit is read-only:

do not rerun the tests after audit.

--------------------------------------------------
DIFF FINGERPRINTING
--------------------------------------------------

Use a lightweight fingerprint of changed relevant files to determine whether cached verification remains valid.

Do not use model judgement for this.

Use git/file hashes locally.

--------------------------------------------------
FULL SUITE POLICY
--------------------------------------------------

The full suite is expensive and should be exceptional.

Run full npm test automatically only when one or more is true:

1. production domain logic changed broadly;
2. shared domain type/contract changed;
3. frozen contract changed;
4. migration changed generated/runtime types;
5. task explicitly demands full suite;
6. dependency impact cannot be bounded confidently.

Otherwise:

targeted tests are sufficient for automatic flow.

Record:

FULL_SUITE: NOT_REQUIRED

rather than treating it as missing verification.

--------------------------------------------------
BUILD POLICY
--------------------------------------------------

Do not run npm build repeatedly.

Run build only when:

- production source changed;
- app routing/build output may be affected;
- task explicitly requires it.

If build passed and subsequent fixes change only tests/docs:

reuse the prior build result.

--------------------------------------------------
LINT POLICY
--------------------------------------------------

Prefer changed-file/module lint where available.

Do not lint the whole repository after every narrow fix if existing tooling supports scoped lint.

If only global lint exists and is cheap enough under current repo conventions, it may run once per task, not once per phase.

--------------------------------------------------
GIT / COMMIT POLICY
--------------------------------------------------

Runner may create local commits required for audit boundaries.

Allowed:

Agent checkpoint (build): <task>
Agent fix: <finding summary>
Agent closeout: <task>

Never:

- push;
- force push;
- deploy;
- reset --hard;
- clean;
- rebase;
- stash;
- checkout another branch;
- amend unrelated history.

If a normal harness commit fails only because an automatic permission wrapper fails, but shell execution is otherwise authorised by existing workflow:

the runner may perform the same local commit command directly.

No push.

--------------------------------------------------
CLOSEOUT
--------------------------------------------------

After:

CRITICAL=0
HIGH=0

perform minimal closeout.

Do not call another model.

Use local deterministic edits only where the task/harness has a standard closeout format that can be safely derived.

If closeout requires substantive interpretation:

HUMAN_DECISION_REQUIRED

Do not ask Claude merely to rewrite a status file if the values can be deterministically populated.

Record:

task ID
base SHA
final HEAD
build result
audit result
fix rounds
verification commands actually run
verification commands reused from cache
production behaviour changed yes/no
engine version before/after if applicable
open Medium/Low findings
push status NO

--------------------------------------------------
STATUS COMMAND
--------------------------------------------------

Create:

./scripts/agent-status

It must be completely local/read-only.

Example:

Task: campaign-x
State: COMPLETE

Base: abc123
HEAD: def456

Model calls
  Build: 1
  Primary audit: 1
  Fix: 1
  Final audit: 1
  Total: 4

Audit
  Critical: 0
  High: 0
  Medium: 1
  Low: 2

Verification
  Targeted tests: PASS
  Typecheck: PASS
  Build: PASS
  Full suite: NOT_REQUIRED

Production changed: YES
Pushed: NO

Do not use an AI model to generate agent-status.

--------------------------------------------------
RUN SUMMARY
--------------------------------------------------

Create a concise machine-readable orchestration record under:

.agent/history/

Prefer JSON or similarly compact structured data.

Do not duplicate entire audit/build logs.

Reference their file paths.

Suggested fields:

run_id
task_id
base_sha
start_head
final_head
started_at
finished_at
model_calls:
  build
  primary_audit
  fix
  final_audit
verification:
  targeted_tests
  typecheck
  lint
  build
  full_suite
findings:
  critical
  high
  medium
  low
result
human_gate_reason
report_paths

--------------------------------------------------
TOKEN ACCOUNTING
--------------------------------------------------

Where the underlying Claude/Codex CLI exposes token or usage information, capture it.

Do not fail the run if token metrics are unavailable.

Record per-call where possible:

input_tokens
output_tokens
cached_tokens
model

agent-status may show:

Approx model usage:
Build: ...
Audit: ...
Fix: ...

Do not add another AI call to estimate token usage.

--------------------------------------------------
CONTEXT REUSE
--------------------------------------------------

Do not resend long static task history to agents when the required information already exists in repository files.

Prefer references such as:

"Read docs/.../SOURCES_AND_CLAIMS.md §8"

over embedding the entire section into generated prompts.

However:

the runner must not assume the agent knows information it has not been directed to inspect.

--------------------------------------------------
REPORT COMPRESSION
--------------------------------------------------

Build/fix/audit prompts should request:

- concise terminal result;
- detailed evidence in repository/history files where necessary.

Avoid multi-thousand-token console summaries.

The normal terminal output should fit comfortably on one screen.

--------------------------------------------------
HUMAN DECISION GATES
--------------------------------------------------

Stop immediately without extra model calls for:

SCIENTIFIC_DECISION_REQUIRED
EXTERNAL_EVIDENCE_REQUIRED
EXPERT_VALIDATION_REQUIRED
MIGRATION_APPROVAL_REQUIRED
FROZEN_CONTRACT_CHANGE_REQUIRED
REGULATORY_INTERPRETATION_REQUIRED
PUSH_OR_DEPLOY_REQUIRED
DESTRUCTIVE_GIT_ACTION_REQUIRED
TASK_SCOPE_EXPANSION_REQUIRED
REPEATED_HIGH_FINDING
AGENT_OUTPUT_AMBIGUOUS
CONFLICTING_EVIDENCE

Output:

AGENT_RUN_RESULT: HUMAN_DECISION_REQUIRED
REASON: <stable reason>
DETAIL: <maximum 3 concise lines>
NEXT_RECOMMENDED_ACTION: <one action>

Do not call another model to explain the stop.

--------------------------------------------------
AUTOMATIC DEFERRAL VS HUMAN STOP
--------------------------------------------------

A task does not always need to stop because one sub-item is deferred.

If CURRENT_TASK explicitly permits individual-phase deferral:

record the phase as deferred and continue.

Human stop is only required where proceeding with the remaining task would be unsafe or ambiguous.

--------------------------------------------------
LOCKING
--------------------------------------------------

Prevent concurrent agent-run instances.

Use a local lock compatible with current .agent conventions.

Do not use an AI model to resolve locks.

If lock is clearly live:

exit.

If stale status cannot be deterministically established:

HUMAN_DECISION_REQUIRED.

--------------------------------------------------
RECOVERY
--------------------------------------------------

Runner should be restartable.

Persist stage after each completed step:

PRECHECK_DONE
BUILD_DONE
PRIMARY_DONE
FIX_1_DONE
FINAL_1_DONE
FIX_2_DONE
FINAL_2_DONE
CLOSEOUT_DONE

If the process dies:

./scripts/agent-run

should inspect the saved state and resume from the next safe step rather than repeating successful model calls.

This is important for token efficiency.

Never rerun a successful model call solely because the wrapper process restarted.

--------------------------------------------------
DRY RUN
--------------------------------------------------

Support:

./scripts/agent-run --dry-run

It should print:

- task;
- base;
- expected flow;
- verification category;
- model-call budget;
- potential human gates;
- commands it would invoke.

It must not call Claude/Codex or mutate files.

--------------------------------------------------
OPTIONAL FLAGS
--------------------------------------------------

Support only a small number of useful overrides.

Examples:

--full-tests
--max-fix-rounds 1|2
--no-auto-commit
--dry-run

Do not create a large CLI surface.

--------------------------------------------------
BACKWARD COMPATIBILITY
--------------------------------------------------

These commands must continue to work independently:

./scripts/agent-build
./scripts/agent-audit --primary
./scripts/agent-audit --final
./scripts/agent-audit --remediation ...
./scripts/agent-fix

Do not require agent-run to use them manually.

--------------------------------------------------
TEST THE RUNNER WITHOUT LIVE MODEL COST
--------------------------------------------------

Use mocks/fixtures for orchestration tests.

Required scenarios:

1. Build clean / primary clean
Expected:
2 model calls
no final audit
COMPLETE

2. Primary High / fix / final clean
Expected:
4 model calls
COMPLETE

3. Primary Medium only
Expected:
2 model calls
Medium logged
COMPLETE

4. Final finds new High / second fix / second final clean
Expected:
6 model calls
COMPLETE

5. High remains after second final
Expected:
6 model calls
HUMAN_DECISION_REQUIRED

6. Build BLOCKED
Expected:
1 model call
stop
no audit

7. Preflight fails
Expected:
0 model calls

8. Restart after successful build
Expected:
do not repeat build call

9. Restart after primary audit
Expected:
do not repeat build or primary audit

10. Docs-only task
Expected:
minimal local verification
no full suite

11. Isolated non-production module
Expected:
targeted tests/typecheck only

12. Production shared contract
Expected:
full verification path

13. Concurrent runner
Expected:
0 model calls from second process

14. Permission wrapper prevents auto commit
Expected:
safe deterministic local recovery if allowed by current harness policy

15. No push
Verify no code path executes git push.

--------------------------------------------------
NON-GOALS
--------------------------------------------------

Do not:

- optimise scientific rules;
- modify Farm Return product behaviour;
- alter Campaign C calculations;
- introduce automatic web research;
- auto-approve migrations;
- auto-approve expert/scientific decisions;
- remove Critical/High audit gating;
- remove immutable task/base locking;
- replace Claude or Codex;
- add an LLM to orchestration decisions;
- push code.

The orchestration logic itself should be deterministic.

--------------------------------------------------
SUCCESS TARGET
--------------------------------------------------

For the common successful task:

User runs:

./scripts/agent-run

and does nothing else.

Expected result:

BUILD
→ PRIMARY AUDIT
→ COMPLETE

Two model calls.

For a normal defective task:

BUILD
→ PRIMARY
→ FIX
→ FINAL
→ COMPLETE

Four model calls.

User involvement should occur only for genuine decision gates.

--------------------------------------------------
VERIFY
--------------------------------------------------

Run:

- shell/static syntax validation;
- runner unit/integration tests using mocks;
- existing harness regression tests;
- any directly affected tooling tests.

Confirm:

- existing harness commands behave as before;
- no production/science code changed;
- no push occurred;
- default clean path uses exactly two model calls;
- default one-fix path uses exactly four model calls;
- no remediation audits occur automatically;
- successful stages are resumable without repeated model calls.

--------------------------------------------------
BUILD RESULT
--------------------------------------------------

If successful:

BUILD_RESULT: DONE

Report only:

- files changed;
- clean-path model calls;
- one-fix-path model calls;
- max model calls;
- test-policy summary;
- recovery/resume behaviour;
- human gates;
- tests;
- confirmation no Farm Return production code changed;
- confirmation nothing was pushed.

If existing harness architecture makes any requirement unsafe:

BUILD_RESULT: BLOCKED <specific reason>