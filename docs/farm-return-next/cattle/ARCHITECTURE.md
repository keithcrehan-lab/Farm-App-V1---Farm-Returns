# Cattle shared architecture

The cross-cutting design every Cattle engine from C3 to C10 follows.
Invariant ids (CAT-INV-*) are defined in `INVARIANTS.md`.

## Pipeline

```
official / farm / device / API / database / caller data
  → adapter (materialisation)            — outside authoritative engines
  → canonical plain data (schema-valid)  — CAT-INV-001/002
  → knowledge-cutoff admission           — CAT-INV-003..006
  → validation (identity before validity) — CAT-INV-008
  → phase engine (deterministic, pure)   — owns one domain (PHASE_INTERFACES.md)
  → canonical, frozen, fingerprinted output
  → downstream phase / C8 sealed context / C9 Plan interface / C10 presentation
```

## Canonical input boundary (human architecture decision, 2026-10-12)

The binding text is in `CAMPAIGN.md`, "Canonical input contract". In
short:

- **Engines take canonical plain data.** Authoritative engines consume:
  - strings, finite numbers, booleans, `null` and `undefined`;
  - plain arrays and plain objects whose properties are enumerable data
    properties.

  The following must never decide an authoritative result:
  - getters and setters;
  - Proxy behaviour;
  - functions or symbols;
  - class instances;
  - hidden or symbol-keyed properties;
  - cycles;
  - values that change between reads.
- **Adapters materialise.** Connectors, API handlers, database readers and
  UI form handlers own the conversion into canonical data. They do it
  before any engine is called.
- **Entry points reject non-canonical input.** Every public entry point
  runs `toCanonicalPlainData` (C2 `canonical-input.ts`) on its whole input
  collection, not only on each element. Non-canonical input is rejected
  with a phase-specific `*_NON_CANONICAL` issue before any evaluation
  begins. C2 finding F008 is the lesson: a collection-level getter was
  executed because only the elements were checked.
- **Engines do not defend against hostile objects.** Past the boundary, an
  engine does not defend against adversarial JavaScript runtime
  behaviour. Audits judge engines against the contract, not against
  arbitrary caller objects outside it.
- **Predecessor outputs are untrusted until validated (CAT-INV-028).**
  A downstream phase validates every predecessor field it consumes —
  version, type, vocabulary, format, structure — at one consumption
  boundary before any authoritative use. A matching fingerprint proves
  integrity, never semantic validity. Stated cross-field consistency is checked
  too; a fully consistent forgery cannot be authenticated by the consumer
  and is the adapter's / C8 sealed context's responsibility (BLOCKERS
  CAT-B1).
- **Compose predecessors, never accept derived outputs (C7 architecture
  review 2026-10-14).** An authoritative consumer obtains predecessor
  results by invoking the frozen predecessor engines over canonical inputs
  (CAT-INV-023 delegation); a caller-supplied derived output is never
  authoritative input. C8's sealed context is constructed the same way.
- **Malformed canonical data still fails closed.** A canonical value with
  a bad shape, type, instant, unit or identity is rejected, or reported as
  INVALID or UNKNOWN. It is never repaired or coerced.
- **Inputs are detached.** The engine works on the deep-frozen copy that
  `toCanonicalPlainData` returns. It never retains caller references and
  never reads the caller's objects again. Outputs are rebuilt from known
  fields and deep-frozen.

## Trusted rule bindings (CAT-INV-016)

- **Executables come from code.** Executable rule logic (predicates,
  effect models, calculations) is code. It is registered in a trusted
  registry that code builds and brands, as C2's
  `createObligationImplementationRegistry` does.
- **Data only names an implementation.** Rule data names one by its C0
  `RuleImplementationRef` (id, version and logic fingerprint), and C0
  `evaluateCattleRule` checks that binding.
- **Callers never supply executables.** Catalogue, request or caller data
  never provides an `evaluate` function. An unknown or untrusted registry
  resolves to "no implementation", which fails closed (UNSUPPORTED or
  equivalent).
- **Production registries ship empty.** A phase that needs executable
  rules either copies the C2 registry pattern into its own directory, or
  imports a generic registry an earlier phase exported. It never changes
  a frozen registry.

## Status and evidence precedence (CAT-INV-009)

Every authoritative result is resolved in this order:

```
REQUIRED EVIDENCE RESOLUTION → APPLICABILITY / ELIGIBILITY → DOMAIN STATE → OPTIMISATION / RECOMMENDATION
```

- **Phases keep their own state vocabulary.** There is no single global
  enum ordering, because phase semantics differ. C2's 15 obligation
  states, C0's evaluation states and C8's outcomes are not
  interchangeable.
- **The shared invariant:** a resolved-looking downstream status never
  hides unresolved required evidence. Examples of resolved-looking states:
  NOT_APPLICABLE, SATISFIED, ELIGIBLE, ON_TRACK, ACTIONABLE, CLEAR,
  COMPLETED.
- **Each phase declares its required inputs.** For each authoritative
  outcome, the phase declares which inputs are REQUIRED.
- **Unresolved required inputs carry through.** If a required input is
  UNKNOWN, conflicting or INVALID, the outcome is an explicit unresolved
  state, never a resolved one. That includes applicability itself: "not
  applicable" requires the applicability inputs to be KNOWN. In C2, a C0
  NOT_APPLICABLE becomes an obligation NOT_APPLICABLE only when the
  obligation's anchor is resolved for the animal's whole life up to the
  query. Otherwise it becomes INVALID_EVIDENCE, EVIDENCE_CONFLICT or
  UNKNOWN, in that order of precedence.
- **Each phase documents and tests its own precedence list.** C2's is in
  the header comment of `obligation-engine.ts`.
- **Hard gates come before optimisation.** A FAIL, UNKNOWN, conflict,
  UNSUPPORTED or REVIEW_REQUIRED hard gate is never overridden by a
  favourable performance or economic result.

## Cattle evaluation context (C8; concept, not yet a type)

```
CattleEvaluationContext
  effectiveAt, knowledgeCutoff        — one historical viewpoint for every part
  animalState         C1 AnimalSnapshot (+ fingerprint)
  obligationState     C2 AnimalObligationEvaluation + hard-gate projection
  healthState         C3 health timeline + withdrawal gate projection
  weightState         C4 weight series / latest-known
  performanceState    C5 performance results
  productionGoalState C6 GoalSnapshotRef
  vetProgrammeState   C7 programme status
  economicContext     bound economic observations (below)
  ruleVersions        exact RuleVersionRefs used
  sourceVersions      exact SourceVersionRefs used
```

- **One sealed context.** Once C8 starts authoritative recommendation
  evaluation, it consumes exactly one sealed, deep-frozen context
  (CAT-INV-015). It never fetches or re-reads mutable raw inputs during
  evaluation.
- **One viewpoint.** Every part is projected at the context's own
  `effectiveAt` and `knowledgeCutoff`, and carries its fingerprint or ref.
- **Missing parts stay missing.** A part that is absent is recorded as
  missing and never defaulted.
- **C8 defines the type.** The concrete TypeScript type belongs to C8. C8
  composes the published C1–C7 outputs and does not redefine them.

## Economic context (CAT-INV-020)

- **Economic values are observations.** Any price, cost, margin input or
  exchange rate used authoritatively is a bound observation with:
  - a value, with explicit currency or unit;
  - its source;
  - when it was observed or retrieved;
  - when it became known (knowledge time), where applicable;
  - a version or fingerprint, where the source requires one.
- **No live lookups in evaluation.** Live price or market connectors
  belong at the adapter and ingestion boundary. C8 never calls a live
  source mid-evaluation, because the result could not be reconstructed.
- **Reuse existing calculations.** Economic calculations call existing
  Farm Return exports with supplied, sourced inputs. With no applicable
  export or no sourced input, the result is `VALUE_UNKNOWN`, never a
  constant.

## AI boundary (CAT-INV-017)

- **AI is never an input.** No AI-generated text or value takes part in an
  authoritative scientific, regulatory, veterinary or financial result.
- **Narratives explain only.** Any later narrative explains existing
  structured output and adds nothing to it.
- **Explanations are deterministic.** Recommendation explanations are
  rendered deterministically from evidence-pack fields.

## Veterinary boundary

- **No autonomous diagnosis or prescription.** There is no universal
  vaccine or medicine schedule. A product fact, such as a withdrawal
  period, is supplied data with provenance, never a constant in code.
- **Veterinary judgement is a human gate.** Behaviour that would need
  veterinary judgement stops at the veterinary decision gate named in
  each brief's stop conditions.
