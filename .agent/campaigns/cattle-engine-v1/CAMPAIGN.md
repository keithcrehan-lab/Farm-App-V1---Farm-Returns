# Cattle Engine v1 — Campaign Contract

## Purpose

Build Farm Return Cattle as the canonical animal-state, regulatory, scientific and performance vertical for bovines, with evidence strong enough to support auditable recommendations and later Plan orchestration.

Cattle owns animal facts, observations, lifecycle, health/compliance state, performance calculations and cattle-specific recommendation evidence. Plan may consume these outputs later but must not become a second cattle source of truth.

Target loop:

Official/farm/device data -> canonical cattle state -> legal/welfare gates -> scientific evaluation -> performance/economic interpretation -> recommendation + evidence pack -> farmer action -> new canonical observation -> re-evaluation.

## Campaign rules

- Work phase-by-phase. Never start the next phase automatically.
- Every phase has an immutable task boundary, explicit starting SHA, acceptance criteria, verify command and STOP conditions.
- Use the existing Farm Return agent harness. Do not create or redesign a runner.
- Normal loop: build -> deterministic verification -> targeted audit -> targeted Critical/High repair if required -> final verification/audit -> freeze -> human review.
- Medium/Low findings are recorded and do not trigger broad repair without explicit human authorisation.
- Follow plausible blast radius only. Escalate when evidence indicates a shared architectural, scientific, regulatory, veterinary, financial, security or canonical-data invariant may be affected.
- No push, merge to main, deploy, production connector activation or production migration unless explicitly authorised.
- UNKNOWN is never zero and missing evidence must never be silently replaced by a convenient assumption.
- Do not invent scientific values, legal duties, veterinary treatment rules, medicine/product facts, regulatory dates, scheme requirements, market values or integration capabilities.
- A recommendation may validly be NO_RECOMMENDATION / INSUFFICIENT_EVIDENCE / BLOCKED.
- Farmer-facing legal imperatives require a versioned authoritative legal/operational source and the appropriate production approval state.
- Farmer-facing veterinary treatment recommendations must respect the Veterinary Practice boundary and cannot be fabricated by an AI layer.
- AI may explain deterministic evidence already produced by the engine; it must never become the authoritative reasoning layer.

## Locked architecture

### Canonical information classes

Keep these concepts distinct:

1. Fact — objective state such as DOB, sex, official identity.
2. Observation — dated measurement/observation such as weight or BCS.
3. Intent — farmer outcome such as breeding replacement or finish for slaughter.
4. Rule — versioned legal, scheme, veterinary-programme or scientific rule.
5. Derived value — deterministic calculation such as ADG or target weight.
6. Prediction — explicitly modelled future value.
7. Obligation/constraint — legal/welfare/product/scheme gate.
8. Recommendation — selected action supported by traceable evidence.

### Rule classes

At minimum support:
- LEGAL_REQUIRED
- LEGAL_CONDITIONAL
- SCHEME_CONDITIONAL
- VETERINARY_PROGRAMME
- SCIENCE_TARGET
- SCIENCE_CONSTRAINT
- FARMER_INTENT
- SYSTEM_INFERENCE

The system must never visually or semantically collapse law, applied science, veterinary programme, scheme condition and Farm Return inference into one generic confidence concept.

### Hard-gate principle

Legal, welfare, medicine-withdrawal, notifiable-disease and movement constraints take precedence over performance/economic optimisation. A blocked or unknown hard gate must not be bypassed by a favourable performance/economic result.

### Evidence and source lifecycle

Every production rule must preserve:
- stable rule id and version,
- classification,
- jurisdiction where relevant,
- effective-from/effective-to dates,
- applicability conditions,
- required inputs,
- deterministic evaluation/result,
- exact evidence/source ids and source versions/fingerprints,
- assumptions and limitations,
- explicit unknown policy,
- approval state,
- supersession history.

Historical rules and recommendation evidence remain auditable after supersession.

### Review separation

Scientific, legal and veterinary approvals are distinct. Approval of one rule version does not approve a later version.

### Recommendation evidence pack

Material recommendations must ultimately be reproducible from a structured evidence pack containing target scope, production goal, inputs/provenance, missing inputs, exact rule versions, compliance/hard-gate outcomes, calculation trace, candidate actions, rejected alternatives/reasons, selected action, assumptions, uncertainties, source fingerprints and an integrity fingerprint.

The deterministic evidence pack is authoritative. Any LLM narrative is explanatory only.

## Existing infrastructure reuse

This repository already has mature evidence/audit/integrity primitives including `src/domain/evidence.ts`, `src/domain/source-register.ts`, `src/domain/audit-trace.ts`, `src/domain/assessment-integrity.ts` and related tests/adapters.

Cattle phases must inspect and reuse those concepts where they genuinely fit.

Do not:
- duplicate generic canonicalisation/hash/audit concepts unnecessarily,
- rename/remove existing source ids,
- change existing scientific/regulatory/economic semantics to make Cattle cleaner,
- refactor frozen slurry/fertiliser contracts without an explicit human gate.

Additive source ids/types/wrappers are permitted when safe and verified. If a genuinely shared platform change would alter an existing domain contract or fingerprint semantics, STOP for human review.

## Veterinary boundary

Cattle may represent health facts, observations, authorised product data, prescriptions, treatment events and veterinary-programme rules. It may detect missing information or performance anomalies and recommend investigation or veterinary review when justified.

It must not autonomously diagnose disease, prescribe a veterinary medicine, invent a dosage, or convert a risk signal into a definitive diagnosis unless a future reviewed legal/veterinary contract explicitly authorises that behaviour.

Vaccination is not treated as a universal bovine schedule. Timing derives from applicable law/scheme conditions where present, an explicit veterinary programme and the authorised product information/SPC.

## External integrations

Architect for but do not assume open production access to:
- DAFM AIM / approved Farm Software Provider integration,
- ICBF service-provider/API data,
- NVPS partner integration,
- HPRA/EMA veterinary product data.

Exact production schemas, scopes, licensing and credentials must come from the relevant authority/provider. No phase may invent an undocumented API.

## Roadmap

### C0 — Evidence, Rule & Regulatory Architecture
Reuse/extend existing Farm Return evidence primitives to establish cattle-ready source provenance, rule versioning/effective windows, rule classifications, review states, source-change detection and reproducible Recommendation Evidence Packs. Use synthetic fixtures only; do not encode cattle science or law.

### C1 — Canonical Animal Lifecycle
Animal identity, stable internal id, external official identifiers, DOB/sex/breed facts, provenance, lifecycle state and event history. No broad AIM/ICBF connector yet.

### C2 — Regulatory Lifecycle Engine
Evidence-reviewed cattle identity/registration/BVD/TB/movement/procedure/welfare rule modules with effective dates, hard gates and fail-closed unknown handling.

### C3 — Health & Medicines Engine
Canonical treatment/prescription/medicine records, authorised-product binding, withdrawal calculation architecture and medicine ledger. No autonomous diagnosis/prescription.

### C4 — Weight Observations & Groups
Canonical dated weight observations, provenance/quality, group membership/history and dynamic scope.

### C5 — Performance Engine
ADG and evidence-backed goal-specific trajectories with explicit applicability/limitations and no universal cattle target.

### C6 — Production Goal Engine
Farmer-intent outcomes such as breeding replacement, finish for slaughter and sale pathways; goal-specific rule routing.

### C7 — Veterinary Health-Programme Engine
Selected herd/animal vaccination and health programmes driven by applicable programme rules, authorised product data and veterinary plan.

### C8 — Recommendation Engine
Generate candidate actions, hard-gate them, handle uncertainty/insufficient evidence, select supported next actions and emit immutable Recommendation Evidence Packs.

### C9 — Plan Interface
Expose cattle obligations, recommendations, target scopes, windows and completion evidence to the frozen Plan kernel without duplicating cattle truth.

### C10 — Cattle UX
Build the farmer-facing herd/group/animal performance experience over verified canonical engines.

## Campaign closure discipline

Each phase returns:
- starting SHA,
- ending SHA,
- changed contracts/files,
- tests added and run,
- verification result,
- audit result/findings,
- defects fixed,
- known limitations,
- acceptance criteria PASS/FAIL,
- any external evidence/sign-off gaps,
- exact manual checks where a UI/workflow exists.

Then STOP for human review.