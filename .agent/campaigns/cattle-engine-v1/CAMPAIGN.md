# Cattle Engine v1 — Campaign Contract

## Purpose

Build Farm Return Cattle as the canonical animal-state, regulatory, scientific and performance vertical for bovines, with evidence strong enough to support auditable recommendations and later Plan orchestration.

Cattle owns animal facts, observations, lifecycle, health/compliance state, performance calculations and cattle-specific recommendation evidence. Plan may consume these outputs later but must not become a second cattle source of truth.

Target loop:

Official/farm/device data -> canonical cattle state -> legal/welfare gates -> scientific evaluation -> performance/economic interpretation -> recommendation + evidence pack -> farmer action -> new canonical observation -> re-evaluation.

## Campaign rules

- Work phase-by-phase. The next phase starts only through `scripts/agent-campaign-run`'s dependency-gated transition (valid predecessor receipt, docs closure committed, clean tree, READY brief), or manually after human review.
- C8–C10 are autonomous-by-default under `AUTONOMY.md`: normal build/audit/family-repair/freeze/closure transitions continue without human approval; human involvement is the exception path for explicit judgement/safety/repeated-defect stops.
- Every phase has an immutable task boundary, explicit starting SHA, acceptance criteria, verify command and STOP conditions.
- Use the existing Farm Return agent harness. C2–C10 run through the campaign orchestrator (`scripts/agent-campaign-run cattle-engine-v1`, manifest `campaign.json`), authorised 2026-10-10 by task `cattle-campaign-orchestrator-20261010`; it composes, never replaces, the one-task scripts. See `.agent/README.md`, "Campaign orchestrator".
- Normal loop: build -> deterministic verification -> standard audit -> bounded narrow repair of in-scope engineering High/Medium findings -> strict full-phase audit (phase base..HEAD; CRITICAL=HIGH=MEDIUM=0) -> freeze verification -> receipt -> docs closure commit. Critical findings and every judgement gate stop for human review.
- Low findings are recorded in the phase receipt and never trigger repair. Medium/High repair is pre-authorised only within the orchestrator's budgets for deterministic engineering defects inside the phase contract; anything beyond that needs explicit human authorisation.
- Follow plausible blast radius only. Escalate when evidence indicates a shared architectural, scientific, regulatory, veterinary, financial, security or canonical-data invariant may be affected.
- No push, merge to main, deploy, production connector activation or production migration unless explicitly authorised.
- UNKNOWN is never zero and missing evidence must never be silently replaced by a convenient assumption.
- CAT-INV-028 trust boundaries (human architecture decision 2026-10-15, binding for C8 onward): Validation must follow trust boundaries and contract ownership. Data entering the system across an external, persisted, imported, deserialised, user-controlled or otherwise untrusted boundary is untrusted and must be validated before use. An output returned directly in-process by an approved frozen engine is trusted to satisfy that engine's published domain contract. A downstream engine is not responsible for reimplementing every owner-specific invariant already guaranteed by a frozen predecessor. Phases validate untrusted boundaries, their own records, structural presence, the identity they rely on and shared cross-engine protocol; they never re-check a frozen predecessor's owner-specific invariants on its in-process output. See `docs/farm-return-next/cattle/INVARIANTS.md` CAT-INV-028.
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

### Canonical input contract (human architecture decision, 2026-10-12)

Binding for C2 and every later cattle phase (C3–C10):

- Cattle authoritative evaluation consumes **canonical plain-data inputs**. Runtime materialisation of arbitrary caller objects (API payloads, database rows, connector output) into canonical form is an **adapter responsibility**, performed before any cattle engine is invoked. Historical reproducibility is guaranteed over admitted canonical records.
- Canonical plain data: strings, finite numbers, booleans, `null`/`undefined`, plain arrays and plain objects of enumerable data properties. No functions, symbols, bigints, accessors (getters/setters), hidden or symbol-keyed properties, class instances, cycles or Proxy-dependent behaviour. Reuse `src/domain/cattle/regulatory/canonical-input.ts` (`toCanonicalPlainData`) at each engine's entry points; non-canonical input is rejected before evaluation. Engines do not defend against adversarial JavaScript objects past this boundary.
- **Executable rule implementations are trusted code bindings, never caller data.** Rule data names an implementation only by its C0 `RuleImplementationRef` (id, version, logic fingerprint); executables come from a trusted registry built by code (C2: `obligation-implementations.ts`) and C0 `evaluateCattleRule` checks the binding exactly as C0 defines. Do not materialise an `evaluate` function from catalogue or request objects.
- The historical guarantee is unchanged and mandatory: a canonical record first known after `knowledgeCutoff` never alters an earlier evaluation; relevance at a cutoff depends only on canonical records known by it. Effective/knowledge time, append-only history, provenance, deterministic reconstruction and UNKNOWN / conflict / invalid fail-closed behaviour are not weakened.
- Provenance is validated before authoritative use: knowledge and provenance times are strict-UTC instants (C1 instant contract) and fingerprints match the assessment-integrity representation (current schema version, `SHA-256`, 64 lowercase hex). Malformed provenance fails closed.
- Audits assess engines against this contract: canonical malformed records, cutoff leakage, provenance validation, identity collisions, implementation binding, unknown/conflict behaviour and historical determinism — not support for arbitrary hostile runtime objects outside it.

### Shared Cattle architecture & conformance (v1, 2026-10-12)

Binding for C3–C10: `docs/farm-return-next/cattle/` holds the shared invariant catalogue (CAT-INV-001…027), the phase ownership and interface contracts, the temporal/evidence, numeric/equality and fingerprint models, and the verification and finding-classification policy. Every C3–C10 brief opens with a phase contract that names its CAT-INV ids; read `docs/farm-return-next/cattle/index.md` first and load only the documents it routes you to. Shared conformance test helpers live in `src/tooling/cattle-conformance/` (tests only). This area records C0–C2's lessons; it does not change frozen C0/C1/C2 behaviour, and the frozen code and DOMAIN_CONTRACTS.md sections win on any conflict about it.

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

Under the orchestrator these are recorded in the phase receipt (`receipts/<phase>.json`) and the closure entries in BUILD_STATE.json / IMPLEMENTATION_LOG.md. The campaign then continues only when the next brief is READY; any stop is for human review.