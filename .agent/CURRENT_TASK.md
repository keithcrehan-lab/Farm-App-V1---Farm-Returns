# Task: Schemes Adviser v1 campaign bootstrap

Task ID: schemes-adviser-v1-campaign-bootstrap-20261105
Starting HEAD: a5d049b144a9542fdfc4f20e588271c285acc8ec
Verify command: `npm run typecheck && npm run build`

# Schemes Adviser v1 — autonomous audited campaign bootstrap

## Objective
Create the repository-owned campaign specification that will implement the approved Farm Return Schemes Adviser scope through independently audited phases. This task is campaign scaffolding and governance only; do not implement new scheme business rules in this bootstrap task.

The user has approved the following product direction:
- one canonical source-pinned, database-backed Schemes architecture;
- migrate/retire the older parallel scheme eligibility implementation rather than expanding two systems;
- each scheme is implemented one at a time against a formal Scheme Implementation Standard;
- every material eligibility condition, obligation, deadline, payment rule, cap, exception, exclusion, reduction, penalty and evidence requirement must be represented in a Requirement Register or explicitly recorded as unsupported;
- canonical Farm/Fields/Cattle/Soil facts are reused; Schemes owns only scheme-specific facts;
- deterministic engines own eligibility, payment/value, deadlines and readiness; AI may explain but must never decide or override them;
- farmer-facing scheme detail should show overview, current eligibility, maximum/current/confirmed value where supported, requirements, actions/deadlines, missing information and source/provenance;
- missing canonical data must route to the exact owning workflow and return to the originating requirement;
- combined scheme value must distinguish recurring annual support, capital grants and other incomparable value types;
- opportunity discovery should be conservative and deterministic;
- AI Scheme Adviser uses retrieval over pinned scheme sources plus deterministic engine outputs and authorised farm context; no model memory as a rule source;
- scheme versions are year/version specific and historical results retain the version used;
- no scheme becomes LIVE until source completeness, requirement completeness, rule correctness, payment correctness and UI honesty are independently audited.

## Required campaign files
Create `.agent/campaigns/schemes-adviser-v1/` with:
- `CAMPAIGN.md` — approved scope, invariants, source hierarchy, definition of done, phase sequence and stop policy.
- `AUTONOMY.md` — explicit autonomous continuation policy described below.
- `campaign.json` — valid manifest for the existing `scripts/agent-campaign-run` harness.
- one READY brief per campaign phase.

## Required phase sequence
Design bounded phases that can be independently built, verified, strictly audited and frozen. Use this overall sequence, splitting further where needed to keep each phase reviewable:
1. S0 — Schemes Implementation Standard + canonical architecture/migration contract. Establish Requirement Register contract, source-pack contract, data ownership, value taxonomy, eligibility states, AI trust boundary, version/update process, and a safe migration plan away from the legacy registry. Do not delete legacy functionality merely to simplify S0.
2. S1 — SCEP 2026 source completeness + exhaustive atomic Requirement Register. Reconcile official/source-pinned material against every eligibility/payment/obligation/deadline/penalty/reduction/exception rule. Explicitly surface unsupported requirements rather than guessing.
3. S2 — SCEP deterministic completion. Complete rule/payment/action/readiness behaviour and canonical Farm/Cattle integration against S1. Do not allow farmer re-entry where canonical data safely exists. Preserve UNKNOWN semantics.
4. S3 — SCEP adviser experience + AI retrieval contract. Dedicated scheme detail experience, exact missing-data routing/return, source/provenance disclosure, and AI adviser interface that consumes deterministic results and pinned sources only. No AI-generated eligibility/payment decisions.
5. S4 — BISS source pack, requirement register, deterministic implementation and migration into the canonical architecture. Split into subphases if required by reviewability.
6. S5 — CRISS source pack + implementation.
7. S6 — Eco Scheme source pack + implementation.
8. S7 — ANC source pack + implementation, including authoritative designation/geographic evidence before eligibility/value claims.
9. S8 — TAMS 3 canonical implementation, including standard and Young Farmer paths; item/reference-cost capability only where authoritative source material is complete.
10. S9 — ACRES canonical implementation; preserve its programme complexity rather than collapsing it into one yes/no rule.
11. S10 — Young Farmer supports: National Reserve / CIS-YF or current equivalent supports, using shared canonical facts.
12. S11 — farm-level Schemes dashboard, defensible aggregate-value taxonomy, opportunity discovery and cross-scheme adviser queries after the underlying schemes are frozen.

A later phase may depend only on frozen predecessor contracts. If authoritative evidence needed for a phase is missing, the auditor/builder must STOP with EXTERNAL_EVIDENCE_REQUIRED or the appropriate regulatory/source-precedence token; never fill gaps from model memory.

## Autonomous Codex gate — mandatory
The user does NOT want to manually approve ordinary phase transitions. Use the existing campaign runner so each phase follows:
BUILD -> deterministic verification -> primary audit -> bounded remediation -> strict whole-phase Codex audit -> bounded remediation/re-audit -> freeze -> closure receipt -> AUTOMATICALLY START NEXT PHASE.

A phase may freeze only with strict audit `CRITICAL=0 HIGH=0 MEDIUM=0`, required verification passing, clean tree and valid receipt. Low findings may be recorded if non-blocking under the existing harness policy.

Codex is the independent reviewer. Builder completion reports are not evidence.

Automatic remediation should follow the existing defect-family discipline. Do not loop indefinitely. Repeated defect families stop according to the harness limits.

## Human stop policy
Do NOT stop merely for ordinary engineering defects. Repair and re-audit within campaign budgets.
Stop only when the existing audit vocabulary requires genuine judgement or authority, including regulatory interpretation, source precedence/conflicting evidence, external evidence, product decision, destructive migration, frozen-contract scope change, secrets/production access, or repeated Critical/High/Medium defect-family limits.

For scheme work specifically, any material requirement that cannot be confidently mapped to authoritative evidence must be a STOP, not an assumption.

## Audit focus additions for schemes
The campaign contract must require Codex to test, as applicable:
- source completeness and source-to-rule traceability;
- requirement-register completeness against the source pack;
- exact threshold/date boundaries;
- UNKNOWN/missing/conflicting evidence semantics;
- canonical data ownership and duplicate-data avoidance;
- payment/value maths, caps, reductions and classification as maximum/current/confirmed;
- version/year isolation and historical reproducibility;
- no stale or unsourced rule fallback;
- no UI/domain formula divergence;
- no AI path that can override or fabricate deterministic results;
- exact missing-data routing and return behaviour;
- source/version mismatch and source-fingerprint integrity.

## Scope guards
Authorise only the paths genuinely needed by each phase. Prefer additive/shared contracts over broad write access. The campaign files themselves and scheme-specific docs/tests/domain/data/UI paths may be allowed by the relevant phase. Existing cattle/fertiliser contracts are frozen unless a later phase explicitly demonstrates and obtains an allowed additive integration path.

## Verification
Bootstrap task itself: validate campaign JSON, run any campaign-manifest/tooling validation available in the repo, `npm run typecheck`, and scoped lint/tests if touched files require them. Run `scripts/agent-campaign-run schemes-adviser-v1 --dry-run` if the new manifest is structurally ready and doing so is non-destructive.

## Deliverable
A committed, internally coherent campaign specification that lets `./scripts/agent-campaign-run schemes-adviser-v1` execute/resume the approved build without requiring routine human phase approval. Do not start product implementation inside this bootstrap task.

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
