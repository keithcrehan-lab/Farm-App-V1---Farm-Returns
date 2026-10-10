# Task: Cattle Campaign Orchestrator

Task ID: cattle-campaign-orchestrator-20261010
Starting HEAD: 9cc32b894b15dc99eead622fc45309d62d9ca04b
Verify command: `bash scripts/tests/agent-run.test.sh && python3 scripts/tests/agent-context.test.py && npm run typecheck && npm run lint && npm run build`

# Cattle Engine v1 — Autonomous Campaign Orchestrator

## Objective

Build a safe, resumable campaign orchestrator above the existing Farm Return agent harness.

The orchestrator will eventually run Cattle Engine phases C2 through C10 sequentially without requiring the operator to manually paste remediation prompts after ordinary deterministic engineering findings.

It must preserve, not weaken, the engineering discipline used to close C0 and C1.

Canonical accepted state before this task:

C0 — Evidence & Rule Architecture
- FROZEN
- functional freeze SHA:
  61c1124d8f206fc4d442fe7814e010a2edb0a186

C1 — Canonical Animal Lifecycle
- FROZEN
- functional freeze SHA:
  c5b25f23aefbd11267fc9ef53d235548de84cc27
- closure docs commit:
  5363c2434b3302e261489c03e894669c8e58d2e9
- build-state normalisation commit:
  9cc32b894b15dc99eead622fc45309d62d9ca04b
- strict audit:
  .agent/history/audit-20261010T090912Z-74575.md
- audit:
  CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0

C2 is NOT_STARTED.

The orchestrator is the next authorised task.

==================================================
CORE PRINCIPLE
==================================================

AUTOMATE ENGINEERING.
ESCALATE JUDGEMENT.

The campaign must continue automatically through ordinary deterministic engineering defects.

It must STOP when a decision requires scientific, regulatory, veterinary, evidence, product, migration, frozen-contract or other human judgement.

Never continue merely because an agent claims confidence.

Every transition must be derived from explicit state, verification results, audit results and campaign policy.

==================================================
ARCHITECTURE
==================================================

Build a campaign layer ABOVE the existing agent harness.

Do not replace or weaken:

- scripts/agent-start
- scripts/agent-build
- scripts/agent-audit
- scripts/agent-fix
- scripts/agent-run
- scripts/agent-runstate.py
- immutable CURRENT_TASK boundaries
- verification gates
- independent Codex audits
- local checkpoint commit discipline

Reuse those primitives where safe.

New campaign tooling should conceptually include:

- scripts/agent-campaign-run
- deterministic campaign state/helper module if required
- campaign manifest
- campaign receipts
- campaign lock
- campaign status/dry-run support
- deterministic tests

Names may differ slightly if repository conventions strongly indicate a better naming pattern.

Do not build cattle-domain production code in this task.

==================================================
COMMAND
==================================================

Target operator command:

./scripts/agent-campaign-run cattle-engine-v1

Also support:

./scripts/agent-campaign-run cattle-engine-v1 --dry-run

and a read-only status mode, for example:

./scripts/agent-campaign-run cattle-engine-v1 --status

Exact CLI may be refined if needed, but the normal campaign must require only one operator command once phase briefs are ready.

==================================================
CAMPAIGN MANIFEST
==================================================

Create a tracked manifest for:

cattle-engine-v1

It must be capable of defining C2 through C10 in order.

Each phase entry must be able to bind at minimum:

- phase ID
- phase title
- phase order
- brief path
- domain(s)
- contracts
- verify command
- strict-freeze requirement
- automatic remediation budget/policy
- expected predecessor phase
- closure/freeze policy

Do not write substantive C2–C10 domain briefs in this task.

It is acceptable and preferred for the manifest to reference future:

C2_BRIEF.md
...
C10_BRIEF.md

and for campaign preflight to refuse to start until required briefs exist and validate.

The orchestrator build itself MUST NOT launch C2.

==================================================
PHASE STATE MACHINE
==================================================

A phase should conceptually progress through:

READY
→ BUILDING
→ VERIFYING
→ PRIMARY_AUDIT
→ FINDING_TRIAGE
→ REMEDIATING where permitted
→ VERIFYING_REMEDIATION
→ REAUDIT
→ STRICT_FULL_PHASE_AUDIT
→ FREEZE
→ CLOSURE_RECORD
→ COMPLETE

Then, and only then:

NEXT PHASE

Persist sufficient state so interruption does not cause completed model calls or verified steps to be repeated unnecessarily.

==================================================
PHASE START
==================================================

A phase may start only if:

- the campaign manifest is valid;
- all prior required phases have valid frozen receipts;
- the predecessor closing HEAD matches the current expected campaign HEAD;
- correct branch;
- clean working tree;
- no live campaign lock;
- no unresolved human gate;
- phase brief exists;
- phase brief passes structural validation;
- contracts exist;
- C2+ scope is not already partially present unexpectedly.

Record the exact phase base SHA before any build work.

Never guess a phase base.

==================================================
BUILD AND VERIFICATION
==================================================

Use the existing task/build harness rather than inventing a parallel builder.

After each build or remediation:

- phase verify command must pass;
- relevant targeted tests must pass;
- typecheck must pass where required;
- lint must pass where required;
- build must pass where required;
- any full-suite/freeze verification defined by campaign policy must pass.

Verification failures stop or enter only an explicitly safe remediation path.

Never convert failed verification to success.

==================================================
AUDIT POLICY
==================================================

Use an independent standard-tier audit during normal build/remediation cycles.

Before freezing every phase, perform a STRICT full-phase audit using:

GPT-6 Astra
high reasoning

against:

phase_base_SHA..candidate_freeze_SHA

The strict audit must review the whole phase, not merely the latest repair.

Freeze requirement:

CRITICAL = 0
HIGH = 0
MEDIUM = 0

LOW findings may be recorded in the phase receipt and may permit freeze unless the audit itself says they are blocking or a phase contract says otherwise.

UNASSESSED is never PASS.

A sandbox inability to run a test is not itself a pass; local deterministic verification must separately cover required tests.

==================================================
AUTOMATIC REMEDIATION POLICY
==================================================

The campaign is PRE-AUTHORISED to remediate deterministic engineering defects within the current phase contract.

Examples:

- boundary-condition bugs
- temporal projection bugs
- alias/mutation defects
- validation omissions
- deterministic ordering defects
- version/supersession bugs
- incorrect state-machine transitions
- idempotency bugs
- parser/normalisation defects
- tests exposing implementation behaviour that contradicts the existing phase contract
- Medium findings analogous to C1 F001–F004

A remediation must:

- use the exact audit finding;
- confirm reproduction first;
- make the minimum in-scope repair;
- add a regression test that fails without the repair;
- re-run verification;
- re-audit;
- preserve the original phase scope and STOP conditions.

Do not create broad free-form "improve everything" repair prompts.

==================================================
SEVERITY POLICY
==================================================

CRITICAL:
- ALWAYS STOP the entire campaign.
- Do not automatically repair.
- Human review required.

HIGH:
- May be automatically remediated only when:
  - reproducible;
  - clearly an implementation defect;
  - fix remains inside the current phase contract;
  - no STOP/judgement condition applies.
- Maximum 2 automatic repair attempts for the same/repeated High class.
- Repeated unresolved High => STOP.

MEDIUM:
- Automatically remediate when it is a deterministic in-scope engineering defect.
- Allow a bounded number of remediation cycles because strict full-phase audits can expose a new Medium after an earlier one is fixed.
- Default maximum: 4 automatic Medium remediation rounds per phase.
- Maximum 2 attempts for a materially identical finding signature.
- Exceeding either budget => STOP.

LOW:
- Record.
- Do not automatically refactor working code merely to remove Low findings.
- Low alone may permit phase freeze unless explicitly blocking.

The implementation may improve these mechanics, but it must not weaken them.

==================================================
FINDING SIGNATURE / REPEAT DETECTION
==================================================

Track enough information to identify materially repeated findings.

Prefer a deterministic signature derived from stable finding data such as:

- severity
- title
- file/path
- normalised problem/required-fix content

Do not rely only on F001/F002 numbering because finding IDs can change across independent audits.

A repeated unresolved finding must consume the repeated-finding budget.

==================================================
JUDGEMENT / HUMAN STOP GATES
==================================================

Automatic remediation is NOT authorised when work requires any of:

- SCIENTIFIC_DECISION_REQUIRED
- REGULATORY_INTERPRETATION_REQUIRED
- VETERINARY_DECISION_REQUIRED
- EXPERT_VALIDATION_REQUIRED
- EXTERNAL_EVIDENCE_REQUIRED
- SOURCE_PRECEDENCE_DECISION_REQUIRED
- PRODUCT_DECISION_REQUIRED
- MIGRATION_APPROVAL_REQUIRED
- FROZEN_CONTRACT_CHANGE_REQUIRED
- TASK_SCOPE_EXPANSION_REQUIRED
- DESTRUCTIVE_GIT_ACTION_REQUIRED
- PUSH_OR_DEPLOY_REQUIRED
- CONFLICTING_EVIDENCE requiring interpretation rather than implementation repair
- unsupported external API assumptions
- secrets/credentials
- production access

Reuse existing harness gate vocabulary where available.

Add campaign-only gate vocabulary only where necessary.

When a builder/fixer/auditor indicates one of these conditions:

STOP the campaign.

Do not move to the next phase.

Persist the reason and exact next required human action.

==================================================
AUDITOR STOP MARKERS
==================================================

Inspect the existing `has_stop_marker` / audit machinery.

Where compatible with existing architecture, support an explicit machine-readable audit STOP/gate marker for findings that require human judgement rather than code remediation.

Do not make narrative text parsing the sole safety mechanism if a structured/deterministic marker can be used.

Do not break historical audit artifacts.

==================================================
MEDIUM-ONLY REMEDIATION
==================================================

The current `agent-fix --all` includes Medium AND Low.

The campaign must NOT automatically refactor Low findings just because a Medium exists.

Provide a safe mechanism to remediate selected blocking findings/severities without opportunistically fixing Low findings.

This may be:

- a backward-compatible extension to agent-fix; OR
- a campaign-specific narrow remediation wrapper.

Requirements:

- existing agent-fix behaviour remains compatible;
- Medium-only remediation is possible;
- exact audit artifact/findings are pinned;
- stale audit / changed HEAD is refused;
- task/phase scope remains immutable;
- verification happens before commit;
- local commit only;
- no push.

Do not loosen the existing `--another-round` human protections outside campaign-policy-controlled execution.

==================================================
STRICT AUDIT FINDINGS
==================================================

The strict full-phase audit can itself discover a Medium/High not found by the standard audit.

The orchestrator must support:

strict full-phase audit
→ finding triage
→ permitted narrow remediation
→ deterministic verification
→ another strict full-phase audit from the SAME original phase base

Do not freeze based on a narrow remediation audit alone.

The final strict audit always covers:

phase_base..current_candidate_HEAD

==================================================
PHASE RECEIPT
==================================================

A phase may be considered frozen only after a deterministic receipt is created.

Receipt should bind at minimum:

- campaign ID
- phase ID
- phase title
- phase base SHA
- functional freeze SHA
- timestamp
- phase brief fingerprint
- contracts/fingerprints or references sufficient to detect drift
- verify command
- verification results
- full-suite result where applicable
- strict audit artifact
- strict audit counts
- remediation rounds
- finding signatures/history
- outstanding Low findings
- migration status
- frozen-contract status
- human-gate status
- whether push/deploy occurred (must be false)
- receipt schema version

Receipt must fail validation if:

- HEAD no longer matches expected freeze context;
- strict audit did not cover phase_base..functional_freeze_SHA;
- Critical/High/Medium are non-zero;
- required verification did not pass;
- required artifact is missing/unparseable;
- phase brief changed after execution without a new task;
- predecessor receipt/chain is invalid.

If suitable, include a deterministic receipt fingerprint using existing safe integrity primitives or a simple documented local canonical hash.

Do not call it a digital signature.

==================================================
CLOSURE DOCUMENTATION
==================================================

AGENTS.md requires build-state / implementation-log closure records.

Automate phase closure after the functional freeze audit.

The important distinction must remain:

FUNCTIONAL FREEZE SHA
!=
later docs-only closure commit SHA

A docs closure step may update:

docs/farm-return-next/BUILD_STATE.json
docs/farm-return-next/IMPLEMENTATION_LOG.md

using the existing schemas/conventions.

Prefer deterministic code if the current schema can be safely and narrowly updated.

If a generic deterministic updater cannot prove it understands the existing schema, STOP instead of corrupting build-state documentation.

Closure validation:

- only authorised docs changed;
- `git diff --check`;
- BUILD_STATE JSON validates;
- functional freeze SHA remains the audited SHA;
- docs commit is recorded separately where appropriate;
- next phase remains NOT_STARTED until closure commit is complete;
- clean tree after commit.

==================================================
NEXT-PHASE TRANSITION
==================================================

A next phase starts only after:

- valid predecessor receipt;
- strict freeze audit clean at required severities;
- required closure docs completed;
- clean tree;
- no STOP gate;
- manifest dependency satisfied.

The next phase base is the exact clean HEAD after authorised predecessor closure/tooling commits.

Record it explicitly.

Never derive it by assuming a previous functional freeze SHA equals repository HEAD.

==================================================
RESUMABILITY
==================================================

Campaign must survive:

- Ctrl-C
- terminal closure
- Mac sleep
- Claude quota exhaustion
- Codex quota exhaustion
- process timeout

Persist after every meaningful transition.

Rerunning:

./scripts/agent-campaign-run cattle-engine-v1

must resume from the next safe step.

It must not repeat a successful model call merely because the process was interrupted later.

If state and repository HEAD disagree:

STOP.

Never reset/rebase/stash/clean automatically.

==================================================
LOCKING
==================================================

Only one campaign runner may operate in the worktree.

Use a campaign lock comparable to the existing agent-run lock.

Handle stale/ambiguous locks fail-closed.

Do not kill another runner automatically.

==================================================
PUSH / DEPLOY / MIGRATIONS
==================================================

Campaign runner must NEVER:

- git push
- deploy
- touch production
- apply database migrations
- use destructive git operations
- alter secrets

A phase requesting a migration:

STOP:
MIGRATION_APPROVAL_REQUIRED

A phase requiring push/deploy:

STOP:
PUSH_OR_DEPLOY_REQUIRED

==================================================
C2–C10 DOMAIN BOUNDARY
==================================================

This orchestrator task does NOT author or execute C2–C10 domain work.

It only prepares the campaign infrastructure and manifest shell.

No:

- regulatory cattle rules
- BVD
- TB
- medicines
- vaccines
- weights
- ADG
- goals
- recommendations
- Plan integration
- Cattle UI

C2 remains NOT_STARTED when this task closes.

==================================================
STATUS UX
==================================================

Status output should be concise and useful.

Conceptually:

Cattle Engine v1

C0  FROZEN   61c1124
C1  FROZEN   c5b25f2
C2  READY / NOT_READY / BUILDING / STOPPED / FROZEN
C3  NOT_STARTED
...
C10 NOT_STARTED

If stopped:

STOPPED: C7
REASON: VETERINARY_DECISION_REQUIRED
DETAIL: ...
NEXT: human review

Do not claim a phase is FROZEN unless its receipt validates.

==================================================
TESTING — NO REAL MODEL CALLS
==================================================

Build deterministic harness tests using fixtures/mocks/stubs.

Tests must not spend Claude/Codex tokens.

At minimum test:

1. clean phase → verification → standard audit clean → strict audit clean → receipt → closure → next phase.
2. standard audit Medium → Medium-only remediation → verify → audit → strict clean.
3. strict audit discovers Medium → remediation → strict full-phase audit reruns from original phase base.
4. Low-only audit → recorded, not auto-fixed, phase may freeze.
5. Critical → immediate campaign STOP, no fixer called.
6. reproducible in-scope High → bounded automatic repair.
7. repeated unresolved High → STOP.
8. new Mediums discovered sequentially within budget → continue.
9. identical Medium beyond repeated-finding budget → STOP.
10. Medium remediation budget exhausted → STOP.
11. audit STOP marker / regulatory interpretation → STOP.
12. scientific decision gate → STOP.
13. veterinary decision gate → STOP.
14. migration detected/requested → STOP.
15. frozen-contract change required → STOP.
16. missing phase brief → NOT_READY / STOP before model call.
17. malformed manifest → STOP before model call.
18. wrong branch → STOP.
19. dirty tree → STOP.
20. predecessor receipt mismatch → STOP.
21. HEAD drift → STOP.
22. receipt audit range mismatch → receipt invalid.
23. receipt non-zero Medium → receipt invalid.
24. receipt missing verification → invalid.
25. interruption after successful build resumes without repeating build.
26. interruption after successful audit resumes without repeating audit.
27. quota exhaustion remains resumable.
28. campaign lock prevents second runner.
29. docs closure touches unauthorised file → STOP.
30. BUILD_STATE JSON corruption → STOP/rollback safe behaviour.
31. functional freeze SHA remains distinct from docs closure SHA.
32. C2 never starts during orchestrator build tests.
33. no command path contains push/deploy/migration execution.
34. campaign dry-run makes zero model calls.
35. status makes zero model calls.
36. existing agent-run / agent-fix tests remain green.
37. existing application/domain tests remain unaffected.

Add other adversarial cases warranted by the implementation.

==================================================
BACKWARD COMPATIBILITY
==================================================

Existing one-task workflows must continue to work.

Do not make `agent-run` require the campaign runner.

Do not make existing campaigns use new manifests.

Do not break current CLI invocations.

Any extension to shared harness scripts requires regression tests.

==================================================
DOCUMENTATION
==================================================

Document:

- command usage;
- state machine;
- severity/remediation policy;
- human gate policy;
- strict freeze audit;
- receipts;
- resumability;
- no push/deploy/migrations;
- how future C2–C10 briefs are wired into the manifest.

Update existing harness docs where appropriate rather than duplicating contradictory instructions.

Do not mark C2 started.

==================================================
ACCEPTANCE CRITERIA
==================================================

Task passes only if:

- orchestrator exists and is executable;
- dry-run works without models;
- status works without models;
- campaign state is deterministic and resumable;
- Critical always stops;
- Medium in-scope engineering defects can auto-remediate;
- Low is not opportunistically auto-fixed;
- judgement gates stop;
- strict full-phase audit required before freeze;
- strict audit can loop back through bounded remediation;
- exact phase receipts validate;
- docs closure is safe;
- next-phase transition is dependency-gated;
- push/deploy/migration execution impossible through normal campaign path;
- existing agent harness remains backward compatible;
- deterministic orchestrator tests pass;
- existing agent harness tests pass;
- typecheck/lint/build pass where relevant;
- no production cattle-domain code changed;
- C2 remains NOT_STARTED;
- independent audit has no Critical/High findings.

STOP after the orchestrator build.

Do not author C2–C10 briefs beyond manifest placeholders.
Do not run the cattle campaign.
Do not start C2.
Do not push.
Do not deploy.

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
