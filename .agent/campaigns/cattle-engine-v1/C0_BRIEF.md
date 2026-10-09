# Cattle C0 — Evidence, Rule & Regulatory Architecture

Campaign: `.agent/campaigns/cattle-engine-v1/CAMPAIGN.md`
Build skill: `.agent/skills/cattle-evidence-rules.md`
Audit skill: `.agent/skills/targeted-audit.md`

## Objective

Build the smallest pure, deterministic, tested evidence/rule architecture required for later cattle regulatory, scientific, veterinary-programme and recommendation engines.

C0 is infrastructure only. It must prove that Farm Return can preserve exact evidence provenance, version rules over time, fail closed on missing/conflicting information, separate legal/scientific/veterinary authority, detect source change without silently changing approved logic, and generate a deterministic recommendation evidence record/fingerprint.

Do not encode real cattle science or law in C0. Use synthetic fixtures and obviously fictional rule/source ids in behavioural tests where needed.

## Existing infrastructure to inspect first

Before writing new primitives, inspect the existing Farm Return scientific/audit/integrity architecture, especially:
- `src/domain/evidence.ts`
- `src/domain/source-register.ts`
- `src/domain/audit-trace.ts`
- `src/domain/assessment-integrity.ts`
- their relevant tests/adapters/exporters
- `docs/farm-return-next/DOMAIN_CONTRACTS.md`

Reuse mature generic primitives where they genuinely satisfy C0. Prefer additive Cattle-specific contracts/wrappers over modifying frozen/shared semantics.

If C0 would require changing existing fingerprint/canonicalisation semantics, deleting/renaming an existing source id, changing an existing evidence state meaning, or changing a frozen slurry/fertiliser/scientific contract, STOP for human review.

## Scope

Implement Cattle-ready architecture for:

1. Evidence/source identity and version binding
   - stable source identity
   - authority/type/jurisdiction/context metadata where relevant
   - retrieval/check timestamp
   - explicit content/source version or fingerprint binding
   - active/historical/superseded/review-required lifecycle
   - deterministic change detection

2. Rule definitions and versions
   - stable rule id + explicit version
   - classification
   - jurisdiction where relevant
   - effective-from/effective-to
   - applicability conditions
   - required input descriptors
   - assumptions/limitations
   - explicit unknown/conflict policy
   - source/evidence bindings
   - supersession relationship
   - production/review state

3. Rule authority classifications
   - `LEGAL_REQUIRED`
   - `LEGAL_CONDITIONAL`
   - `SCHEME_CONDITIONAL`
   - `VETERINARY_PROGRAMME`
   - `SCIENCE_TARGET`
   - `SCIENCE_CONSTRAINT`
   - `FARMER_INTENT`
   - `SYSTEM_INFERENCE`

4. Evaluation-state vocabulary adequate to preserve meaning, including support for:
   - supported/pass
   - blocked/fail
   - unknown/insufficient evidence
   - not applicable
   - conflicting evidence
   - unsupported
   - review required

   Reuse an existing vocabulary where it truly covers these semantics. Do not force a lossy mapping merely to avoid a new cattle-specific type.

5. Version/effective-date resolution
   - deterministic selection of the rule version effective for a supplied evaluation date/context
   - no active/effective version must fail closed
   - superseded versions remain addressable for historical audit

6. Separate review/approval dimensions
   - scientific review state
   - legal review state
   - veterinary review state
   - approval is bound to the exact rule version
   - approving v1 never implicitly approves v2

7. Source-change behaviour
   - changed material source fingerprint/version produces review-required/change state
   - an approved rule is not silently rewritten or automatically re-approved
   - historical evidence remains bound to the previous source/rule version

8. Recommendation Evidence Pack contract
   Build the smallest deterministic structured record capable of later preserving:
   - recommendation/evaluation id
   - engine/ruleset version
   - target scope reference/snapshot reference
   - farmer intent/production goal reference where applicable
   - facts/observations with provenance references
   - missing/conflicting inputs
   - exact rules evaluated + versions
   - hard-gate/compliance outcomes
   - calculation steps
   - source/evidence refs + fingerprints/versions
   - assumptions/limitations/uncertainty
   - candidate actions and rejected alternatives/reasons
   - selected action or explicit no-recommendation/blocked outcome
   - review metadata
   - deterministic integrity fingerprint

   C0 does not need a farmer-facing narrative or recommendation-selection engine. Synthetic evidence packs are sufficient to prove the contract.

9. Deterministic integrity
   Reuse established canonicalisation/hash behaviour if safe. The evidence-pack fingerprint is a reproducibility/change-detection fingerprint, not a digital signature.

## Information boundaries

Keep these concepts separable in types/contracts:
- fact
- observation
- intent
- rule
- derived value
- prediction
- obligation/constraint
- recommendation

Do not promote inference to fact or advisory science to law.

## Veterinary/legal boundary

C0 models authority and review states only.

Do not implement:
- disease diagnosis
- medicine choice
- dosage
- prescription behaviour
- vaccination schedules
- product SPC interpretation
- BVD/TB/movement rules
- any real legal deadline

The architecture must allow later legal/welfare/medicine/disease/movement gates to block downstream optimisation, but C0 must use synthetic fixtures to prove that precedence.

## Unknown/conflict policy

Missing required evidence must never become zero or a convenient default unless an explicitly modelled future rule declares a sourced default.

Conflicting evidence must remain visible as conflict rather than silently choosing a winner in C0.

The architecture must be able to produce an explicit `NO_RECOMMENDATION`, `INSUFFICIENT_EVIDENCE` or `BLOCKED` outcome.

## AI boundary

No AI/model call is allowed or required for deterministic rule resolution, evaluation-state selection, evidence-pack generation or fingerprinting.

Any future LLM explanation is non-authoritative and downstream of structured deterministic output.

## Required tests

Add focused adversarial tests proving at least:

1. semantically identical source/evidence material yields deterministic fingerprinting under the selected established canonicalisation contract;
2. object-key insertion order does not change the canonical fingerprint where the reused contract says it must not;
3. material source/evidence mutation changes the fingerprint;
4. rule versions select correctly at effective-date boundaries;
5. no effective rule version fails closed;
6. missing required input remains unknown/insufficient, never zero;
7. conflicting input remains conflicting;
8. superseded rule is available for historical audit but not selected as current when a successor is effective;
9. source fingerprint/version change produces review-required behaviour without silently mutating/approving the rule;
10. scientific/legal/veterinary review dimensions remain separate;
11. approval of rule v1 does not approve v2;
12. the same deterministic evidence-pack content reproduces the same integrity fingerprint;
13. a material evidence-pack mutation changes the fingerprint;
14. explicit blocked/no-recommendation/insufficient-evidence outcomes are representable;
15. a synthetic hard gate can prevent a downstream synthetic recommendation from being treated as actionable without embedding real cattle law;
16. no AI dependency exists in the deterministic path.

Also run the relevant existing evidence/audit/integrity regression suites to prove C0 did not change established semantics.

## Acceptance criteria

C0 passes only if:
- the implementation is pure domain architecture with focused tests;
- no real cattle scientific/legal/veterinary value is introduced;
- no existing fertiliser/slurry/scientific output changes;
- exact source/rule versions can be bound to an evaluation/evidence pack;
- effective-date version resolution is deterministic and fail-closed;
- source change can require review without silently rewriting production logic;
- scientific/legal/veterinary approvals are distinct and version-bound;
- unknown/conflicting evidence is explicit;
- deterministic recommendation evidence packs can be reproduced and fingerprinted;
- historical/superseded material remains auditable;
- typecheck, lint, build and relevant tests pass;
- targeted audit returns no open Critical/High finding.

## Out of scope

Do NOT build:
- cattle register or animal persistence;
- actual bovine identity/lifecycle model;
- animal groups;
- weight observations or ADG;
- replacement-heifer or finishing targets;
- real legal/regulatory rules;
- BVD/TB/movement logic;
- medicines, prescriptions, withdrawals or vaccine programmes;
- production-goal recommendation logic;
- economics;
- Plan integration;
- cattle UI;
- AIM/ICBF/NVPS/HPRA live connectors;
- migrations/new database schema;
- external network research during the build;
- deployment/merge to main.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>` rather than improvising if:
- a shared/frozen contract must change materially;
- safe reuse requires changing established fingerprint or canonicalisation semantics;
- existing evidence states cannot represent C0 without a cross-domain semantic migration;
- a migration/database schema is required;
- a real scientific, legal or veterinary rule/value would be needed to satisfy C0;
- external evidence or a production connector is required;
- task scope expands into C1+;
- the existing evidence architecture contains contradictory ownership/contracts that cannot be resolved additively.

## Human gate

When C0 is complete, STOP. Do not start C1. Return a compact close-out with starting/ending SHA, changed files/contracts, reuse decisions, tests, verification, audit findings/fixes, known limitations, acceptance PASS/FAIL and any shared-architecture concern requiring human review.