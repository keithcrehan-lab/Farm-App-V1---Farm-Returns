# Cattle Evidence & Rule Architecture — Build Skill

Use this skill for Cattle C0 and later evidence/rule work.

## Purpose

Build cattle intelligence so a recommendation can be independently reconstructed from canonical inputs, exact rule versions, authoritative/scientific evidence, explicit assumptions/unknowns and deterministic calculations.

This skill governs architecture. It does not itself authorise any cattle science, legal interpretation or veterinary treatment rule.

## Reuse first

Before adding a new primitive inspect the established Farm Return evidence/audit/integrity modules, especially:
- `src/domain/evidence.ts`
- `src/domain/source-register.ts`
- `src/domain/audit-trace.ts`
- `src/domain/assessment-integrity.ts`
- related tests/adapters/exporters

Reuse safe generic behaviour. Prefer additive wrappers/types over refactoring established domains.

STOP if making Cattle correct would require changing frozen/shared semantics, fingerprint inputs, canonicalisation behaviour, existing source identifiers or a scientific/regulatory contract used by slurry/fertiliser.

## Information classes

Keep these distinct:
- FACT
- OBSERVATION
- INTENT
- RULE
- DERIVED_VALUE
- PREDICTION
- OBLIGATION_OR_CONSTRAINT
- RECOMMENDATION

Do not promote an inference to a fact. Do not promote advice to law. Do not promote a missing value to zero.

## Rule classes

At minimum:
- LEGAL_REQUIRED
- LEGAL_CONDITIONAL
- SCHEME_CONDITIONAL
- VETERINARY_PROGRAMME
- SCIENCE_TARGET
- SCIENCE_CONSTRAINT
- FARMER_INTENT
- SYSTEM_INFERENCE

## Rule contract

A versioned executable rule needs enough structure to preserve:
- stable rule id
- rule version
- title/classification
- jurisdiction where applicable
- effective from/to
- applicability predicates
- required inputs
- deterministic evaluation outcome
- evidence/source ids and source versions/fingerprints
- assumptions
- limitations
- unknown/missing/conflict policy
- approval/review state
- supersession relationship

C0 may use synthetic/example rules only. Do not encode real bovine legal dates, vaccine schedules, medicine values, growth targets or regulatory interpretations in C0.

## Evidence source contract

An evidence source should preserve stable identity and enough metadata to answer:
- who published it?
- what is it?
- what kind of authority/evidence is it?
- what jurisdiction/context does it apply to?
- what version/content was actually used?
- when was it retrieved/checked?
- is it current, historical, superseded or review-required?

Source fingerprinting is change detection, not proof of legal authenticity and not a digital signature.

## Evaluation outcomes

Cattle evaluation must be able to represent at least:
- SUPPORTED / PASS
- BLOCKED / FAIL
- UNKNOWN / INSUFFICIENT_EVIDENCE
- NOT_APPLICABLE
- CONFLICTING_EVIDENCE
- UNSUPPORTED
- REVIEW_REQUIRED

Never collapse these into a boolean where meaning is lost.

## Effective dates

Historical evaluation must use the rule version effective for the evaluation context/date. Superseded versions remain available for audit; they are not deleted or silently rewritten.

## Review states

Support a lifecycle conceptually equivalent to:
RESEARCH -> DRAFT -> VALIDATED -> APPROVED -> PRODUCTION -> SUPERSEDED
with BLOCKED where evidence/sign-off is missing.

Scientific, legal and veterinary approvals are separate dimensions. Approval is version-bound.

## Recommendation Evidence Pack

Architecture must support a deterministic immutable pack containing, where applicable:
- recommendation id / engine version / generated timestamp
- target scope and scope snapshot
- production goal/intent
- canonical facts and observations with provenance
- missing/conflicting inputs
- exact rules evaluated + versions
- hard-gate/compliance results
- calculation trace/formula/substituted values/units/rounding
- evidence/source ids + versions/fingerprints
- assumptions and limitations
- candidate actions
- rejected alternatives + reasons
- selected action
- uncertainty/evidence state
- review/approval metadata
- deterministic integrity fingerprint

The same semantically identical material inputs and rule versions must produce the same content fingerprint under the selected canonicalisation contract. A material change must change it.

## AI boundary

No AI call is required for rule evaluation, source selection, calculation, hard-gate evaluation or evidence-pack generation.

LLM narrative, when added later, is non-authoritative and may only explain structured deterministic output. It may not introduce a diagnosis, legal duty, treatment, source or calculation absent from that output.

## Veterinary boundary

C0 must only model the boundary, not implement treatment logic.

Later cattle modules may represent health facts, observations, authorised product data, prescriptions and explicit veterinary programmes. They must not autonomously diagnose disease, prescribe a medicine or invent a dosage without an explicitly reviewed future contract.

## Hard-gate precedence

The architecture must allow legal/welfare/medicine/disease/movement gates to stop downstream optimisation. A favourable biological/economic score cannot override a failed or unknown hard gate.

## Source change behaviour

A changed authoritative source fingerprint must never silently mutate an approved production rule. It should produce review-required/change state. Historical recommendations remain bound to the exact source/rule version they used.

## Testing expectations

C0 tests should be adversarial and synthetic. Cover at least:
- deterministic source/rule fingerprints
- object-key insertion-order independence if using canonical JSON
- material mutation changes fingerprint
- rule effective-window selection
- no active version => fail closed
- missing required input => unknown, never zero/default unless explicitly modelled
- conflicting evidence remains conflicting
- superseded rule is historical-auditable but not selected for current context
- source content change => review required, no silent rule rewrite
- separate scientific/legal/veterinary approval state
- approval of v1 does not approve v2
- deterministic evidence pack reproduction
- pack mutation changes fingerprint
- no AI dependency

## Scope discipline for C0

Do not build:
- actual bovine identity/lifecycle records
- actual legal rules
- BVD/TB logic
- medicines or withdrawal calculations
- vaccine schedules
- weight/ADG/performance calculations
- production-goal recommendations
- cattle UI
- Plan integration
- live AIM/ICBF/NVPS/HPRA connectors
- migrations unless explicitly authorised

C0 is architecture and deterministic contracts only.