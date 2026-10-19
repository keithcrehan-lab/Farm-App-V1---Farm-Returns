# Cattle phase ownership and interface contracts

Invariants CAT-INV-014 and CAT-INV-023 apply throughout.

- **Downstream phases consume upstream outputs.** A downstream phase may
  consume a canonical upstream output. It must not duplicate or
  reinterpret the upstream phase's raw evidence.
- **These are minimum contracts.** Type names marked *(proposed)* come
  from the phase briefs. The owning phase fixes the final names in its
  DOMAIN_CONTRACTS.md section.
- **Fields still need justifying.** A phase may add fields to its own
  outputs, but this list does not authorise any field the brief does not
  justify.

## Ownership

| Phase | Owns (single source of truth) | Directory |
|---|---|---|
| C0 | evidence sources, rule versions, review lifecycle, rule evaluation, evidence packs, cattle fingerprints | `src/domain/cattle/*.ts` (frozen) |
| C1 | canonical animal identity, lifecycle/state, external identity history, location/group/lifecycle history | `src/domain/cattle/animal-*.ts` (frozen) |
| C2 | regulatory/obligation lifecycle: applicability, due/status/fulfilment state, obligation hard gates | `src/domain/cattle/regulatory/` (frozen) |
| C3 | health event timeline, treatment/medicine administration facts, product binding, withdrawal state, health evidence | `src/domain/cattle/health/` |
| C4 | canonical weight observations; group-scope resolution over C1 group history (no new group truth) | `src/domain/cattle/weights/` |
| C5 | performance derivations (gain, ADG, coverage, target comparison) from C4 outputs | `src/domain/cattle/performance/` |
| C6 | production goals / farmer intent, goal snapshots, goal→rule routing | `src/domain/cattle/goals/` |
| C7 | veterinary/risk-based programme definitions and programme state | `src/domain/cattle/programmes/` |
| C8 | candidate actions, constraint-aware ranking, recommendation records, evidence packs (via C0) | `src/domain/cattle/recommendations/` |
| C9 | explicit interface exposing Cattle outputs to the frozen Plan kernel | `src/domain/cattle/plan-interface/` |
| C10 | presentation of canonical Cattle outputs | `src/domain/cattle/presentation/`, `src/components/cattle/`, `src/app/(app)/cattle/` |

Group membership truth stays in C1, as `MANAGEMENT_GROUP` assertions. C4
only resolves it at an instant.

## Common contract (every phase from C3 to C10)

These apply unless a phase section below says otherwise.

- **Times.**
  - `effectiveAt` is valid time: what was true on the farm at that
    instant.
  - `knowledgeCutoff` is knowledge time: only records received by then
    exist (see `TEMPORAL_EVIDENCE.md`).
  - Both are strict UTC instants.
- **Identity.** Each record has an opaque record id that is unique within
  its ledger. Same id with different content fails closed. The animal is
  identified by the C1 `FarmReturnAnimalId`.
- **Provenance.**
  - Every record carries provenance: a source category (C1
    `AnimalDataProvenance` categories) plus actor or role where relevant,
    and `receivedAt`.
  - Sources and product data carry a C0 `SourceVersionRef` and a
    fingerprint.
  - All of it is validated before use (CAT-INV-024).
- **Unknown.**
  - Missing information becomes UNKNOWN or INSUFFICIENT_EVIDENCE.
  - Conflicts become EVIDENCE_CONFLICT, or a phase-specific conflict
    state.
  - Malformed information becomes INVALID or is rejected.
  - None of these is ever zero, false, empty or a default.
- **Output.**
  - Output is deep-frozen and order-independent.
  - It carries a fingerprint with a new, distinct kind and payload
    version, through a phase-local wrapper (`FINGERPRINTS.md`).
  - It echoes the `effectiveAt` and `knowledgeCutoff` used.
- **Forbidden for every phase.**
  - Modifying an earlier phase's modules: only additive barrel exports
    are allowed.
  - Persistence, migrations, network calls, AI calls, clock reads, new
    npm dependencies.
  - Real science, legal, veterinary or economic content.
  - Importing `src/tooling/` from production code.

## C3 — Health & medicines

- **Owner:** C3. It owns the health timeline and the medicine
  administration ledger.
- **Inputs:**
  - C1 `AnimalLedger` and `AnimalSnapshot` (identity, presence, date of
    birth as projected);
  - canonical health records, all append-only:
    - observations, symptoms and sourced diagnoses;
    - veterinary events, treatments and medicine administrations;
    - prescriptions;
  - supplied authorised-product records *(proposed `AuthorisedProductRecord`)*,
    with source binding.
- **Outputs:**
  - a health timeline projection;
  - product binding state per administration;
  - withdrawal end per food product;
  - a withdrawal hard-gate projection *(per food product: clear, in
    withdrawal until an instant, unknown, or evidence conflict)*;
  - a medicine ledger view.
- **Gate shape:** the hard-gate output follows the C2 hard-gate
  projection and C0 pack shape.
- **Times:**
  - `effectiveAt` covers administration and event instants and
    withdrawal ends.
  - `knowledgeCutoff` applies to `receivedAt` on health records, and to
    product records via retrieved/checked time.
  - A product record revised later never changes a historical
    withdrawal.
- **Identity:**
  - each health record has a record id;
  - an administration is identified by record id, animal, product ref
    and administration instant;
  - product records are identified by product id and version.
- **Provenance:**
  - a diagnosis needs a veterinary or laboratory source;
  - a record from the farmer or the system is never a diagnosis.
- **Unknown:**
  - an unknown period, administration time or product binding gives
    UNKNOWN, never clear;
  - a multi-dose course with no supplied rule gives UNKNOWN.
- **Upstream:** C1, read through snapshots and ledger exports only.
- **Downstream consumers:**
  - C7 completion evidence and gates;
  - C8 hard gates and context;
  - C9 completion evidence;
  - C10.
- **Forbidden:**
  - diagnosis inference;
  - prescribing, dose or route choice;
  - universal vaccine or medicine sets;
  - SPC interpretation beyond the supplied structured fields;
  - re-deriving C1 identity;
  - C2 obligation logic.

## C4 — Weight observations & groups

- **Owner:** C4. It owns canonical weight observations and the
  group-scope resolver.
- **Inputs:**
  - canonical weight records *(proposed `WeightObservation`; distinct
    from the legacy `src/domain/types.ts` type)*;
  - C1 ledgers and snapshots for group membership;
  - an explicit animal set for herd scope.
- **Outputs:**
  - a historical weight series per animal;
  - the latest-known weight, with explicit NONE and conflict states;
  - per-observation method, provenance and quality;
  - a group-scope resolution: members, unknown, conflict and invalid
    sets, and history;
  - a C5 read contract.
- **Times:**
  - `effectiveAt` is the observation instant;
  - `knowledgeCutoff` applies to `receivedAt`;
  - group membership is projected at the same instants through C1.
- **Identity:**
  - an observation is identified by its record id;
  - two distinct live observations at the same instant are a conflict,
    never averaged.
- **Units:** values are stored in their recorded unit (CAT-INV-011). The
  canonical kilogram value is derived only by an exact, explicit
  conversion; otherwise the record is UNSUPPORTED (see
  `NUMERIC_SEMANTICS.md`).
- **Unknown:** an animal's group being unknown, conflicting or invalid is
  reported, never silently included or excluded.
- **Upstream:** C1.
- **Downstream consumers:** C5, C7 (group scope), C8, C9 (scope reality),
  C10.
- **Forbidden:**
  - ADG, trend or target logic;
  - creating group truth;
  - relabelling an estimate as a scale reading.

## C5 — Performance

- **Owner:** C5. It owns derived performance values.
- **Inputs:**
  - C4 weight series and quality metadata;
  - C4 group scopes;
  - supplied `PerformanceTarget` *(proposed)* records, with provenance
    and review state;
  - explicit trend and threshold policies, when supplied.
- **Outputs:**
  - interval gain in kg and ADG in kg/day as `DERIVED_VALUE`, each with a
    calculation trace;
  - series metrics and coverage;
  - target comparison: on track, behind, ahead, no target, target not
    applicable, target unverified, or insufficient evidence;
  - optional `PREDICTION`, clearly labelled;
  - scope aggregates over KNOWN results, with counts of unknown.
- **Times:**
  - `effectiveAt` bounds the observation window;
  - `knowledgeCutoff` is passed through to C4.
  - A target revised later never changes a historical comparison.
- **Identity:** a derived value is identified by its source observation
  ids plus a convention or version.
- **Unknown:**
  - fewer than two usable observations gives INSUFFICIENT_EVIDENCE;
  - zero or negative elapsed time gives INVALID;
  - conflicting input gives a conflict;
  - no target is a state, never a default.
- **Upstream:** C4 only. Goal-applicability matching arrives through C6.
- **Downstream consumers:** C6 (target applicability), C8, C10.
- **Forbidden:**
  - reading raw weight records;
  - universal targets;
  - the legacy `livestock.ts` constants used as per-animal targets;
  - rounding inside comparisons;
  - undocumented tolerances.

## C6 — Production goals

- **Owner:** C6. It owns farmer intent.
- **Inputs:** canonical goal declaration records (append-only), each
  with:
  - an actor and role;
  - an effective period;
  - `receivedAt`;
  - provenance;
  - a version.
- **Outputs:**
  - an active-goal projection: active goals, none, intent conflict, or
    invalid;
  - a full history;
  - a `GoalSnapshotRef` *(proposed)*;
  - goal→rule routing, from a registry supplied as data and empty by
    default;
  - target-applicability matching.
- **Times:**
  - `effectiveAt` is the declaration period;
  - `knowledgeCutoff` applies to `receivedAt`.
  - A goal changed later never rewrites a historical evaluation or
    recommendation.
- **Identity:** goal record id plus version.
- **Unknown:**
  - no goal means NONE, never a default goal;
  - a SYSTEM record is only ever a suggestion.
- **Upstream:** C1 for the subject's identity. C5 target records are
  matched by explicit ref or type only.
- **Downstream consumers:** C5, C7, C8, C9, C10.
- **Forbidden:**
  - inferring intent from behaviour;
  - a compatibility matrix beyond structural cases;
  - built-in science.

## C7 — Veterinary health programmes

- **Owner:** C7. It owns programme definitions and the programme state of
  each occurrence.
- **Inputs:**
  - programme definitions, versioned, declared by a veterinarian or
    farmer, with provenance and review state;
  - membership from C4 group scopes or explicit sets;
  - C3 administration and veterinary-event records, used as completion
    evidence;
  - C3 withdrawal gates and C2 hard gates, used as supplied gate data.
  - (C7 architecture review 2026-10-14: C3 / C2 results — including these
    gates — are composed by C7 from canonical C3 / C2 evidence through their
    frozen engines; derived C3 / C2 outputs are never accepted as input.)
- **Outputs:**
  - per-occurrence state;
  - programme status per animal or group;
  - a fingerprint;
  - output compatible with the C0 pack and the C2 hard-gate shape.
- **Times:**
  - definitions follow the same cutoff model as evidence;
  - a programme revision received later cannot contaminate historical
    programme state.
- **Identity:**
  - a programme is identified by id and version;
  - an occurrence id is derived deterministically, as C2's
    `obligationOccurrenceId` pattern does.
- **Unknown:**
  - an unknown anchor or membership gives UNKNOWN;
  - an unapproved programme gives REVIEW_REQUIRED.
- **Veterinary judgement:** anything needing it stops at the veterinary
  decision gate.
- **Upstream:** C1, C2 (gates), C3, C4, C6.
- **Downstream consumers:** C8, C9, C10.
- **Forbidden:**
  - universal vaccination schedules;
  - prescribing;
  - fuzzy matching of completion evidence;
  - re-deriving C3 withdrawal.

## C8 — Recommendations

- **Owner:** C8. It owns candidate actions, ranking, recommendation
  records and evidence-pack assembly, through C0
  `buildRecommendationEvidencePack`.
- **Inputs:**
  - one sealed `CattleEvaluationContext` (`ARCHITECTURE.md`), built only
    from published C1–C7 outputs plus bound economic observations;
  - a `CandidateActionDefinition` registry *(proposed)*, supplied as
    data.
  - (C8 preflight, 2026-10-15: "published C1–C7 outputs" means outputs
    C8 produces by passing canonical predecessor evidence to the frozen
    C1–C7 engines inside its one context-construction boundary. This is
    delegation under CAT-INV-023, not a raw-record read. Derived
    predecessor outputs are never accepted as input. See
    `C8_BRIEF.md`, "Pre-start clarifications".)
- **Outputs:**
  - per-animal recommendation records;
  - a herd ordering;
  - C0 evidence packs, verified.
- **Pipeline:** hard gates → eligibility → candidate actions → effect →
  supported economic value → ranking → evidence pack.
- **Times:** one `effectiveAt` and one `knowledgeCutoff` for the whole
  context. No mutable lookup happens mid-evaluation.
- **Identity:**
  - an action is identified by kind plus target scope;
  - the pack id comes from C0;
  - ties are broken by stable action identity.
- **Unknown:**
  - no effect model gives `EFFECT_UNKNOWN`;
  - no sourced value gives `VALUE_UNKNOWN`;
  - unknown never ranks as zero or as best;
  - NO_RECOMMENDATION, INSUFFICIENT_EVIDENCE and BLOCKED are valid
    outcomes.
- **Upstream:** C1–C7 outputs only.
- **Downstream consumers:** C9, C10.
- **Forbidden:**
  - reading raw upstream records;
  - live price or market calls;
  - new price, cost, probability or effect constants;
  - forking the C0 pack builder;
  - AI explanations.

## C9 — Plan interface

- **Owner:** C9. It owns only the translation from Cattle outputs into the
  Plan kernel input types, as frozen by the C8P1 Plan compatibility
  amendment (`DOMAIN_CONTRACTS.md`, "Plan compatibility amendment (C8P1,
  cattle campaign)").
- **Binding detail:** the "Binding design freeze (2026-10-19)" section of
  `.agent/campaigns/cattle-engine-v1/C9_BRIEF.md` (decisions B1–B6, D1–D4)
  governs C9; this section summarises it.
- **Inputs:** one canonical request built around C8's
  `CattleRecommendationRequest`, plus C4 group-scope references and the C8
  trusted inputs. C9 itself invokes the frozen C2, C4, C7 and C8 engines
  in-process (delegation, CAT-INV-023). It never accepts caller-supplied
  C2, C7 or C8 output records as authoritative input.
- **Outputs:** Plan inputs from the existing `src/domain/plan/` types only:
  - job proposals;
  - shared `PlanBlocker`s;
  - `ScopeReality`;
  - `CanonicalEvidence`;
  - action routes (`NONE` / `MANUAL_TASK`; no cattle workflow route exists).

  Each carries cattle output ids and fingerprints, projected from one
  canonical C9 object.
- **Subjects:** cattle animals are `CATTLE_ANIMAL` and C1 management groups
  `CATTLE_GROUP` — never the V1 `ANIMAL` / `ANIMAL_GROUP` ids.
- **Times:**
  - a cattle window is mapped to Plan timing;
  - a recommended window and a hard deadline stay distinct; a hard deadline
    cites a `VERSIONED_SOURCE` authority only where the frozen C2/C0
    contracts prove it uniquely, otherwise the proposal carries an UNKNOWN
    blocker instead;
  - an unknown window never becomes an invented date.
- **Identity:** deduplication follows the Plan kernel's
  `planJobIdentityKey`; a deterministic merge keeps every origin, and a
  multi-origin proposal is projected as `FARM_RETURN` / `COMPOSITE`.
- **Unknown:**
  - BLOCKED and UNKNOWN become Plan blockers and are never dropped;
  - unknown completion evidence is unavailable, never complete.
- **Frozen Plan contract:** any change to it stops at the frozen-contract
  gate.
- **Upstream:** C1–C8 engines (through delegation) and the C8P1-frozen Plan
  contract.
- **Downstream consumers:** the Plan kernel (not modified).
- **Forbidden:**
  - cattle calculations;
  - reinterpreting cattle evidence;
  - new Plan variants or routes;
  - modifying Plan code.

## C10 — Presentation

- **Owner:** C10. It owns view-models, screens and display formatting.
- **Inputs:** canonical outputs from C1–C8, plus evidence packs.
- **Outputs:**
  - display structures with honest status labels;
  - screens.
- **States:** every unknown, conflict, blocked, review-required,
  no-target and no-goal state gets its own display state. None renders as
  zero, blank-as-OK or a green tick.
- **Times:** C10 renders the `effectiveAt` and `knowledgeCutoff` it was
  given and never computes them.
- **Data honesty:**
  - a real account sees an honest empty state;
  - only demo mode with Supabase unconfigured may show `SYNTH-*` data,
    and only through the real engines.
- **Upstream:** C1–C8 outputs only.
- **Forbidden:**
  - formulas in components;
  - independent eligibility, ADG, obligation state or ranking;
  - rounding that feeds back into decisions;
  - mock data for real accounts.
