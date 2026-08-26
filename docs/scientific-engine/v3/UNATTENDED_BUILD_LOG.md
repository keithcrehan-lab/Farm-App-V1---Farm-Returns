# Farm Return Scientific Engine V3 — Unattended Build Log

Chronological record of every phase in the autonomous V3 build, per the
authorised unattended-execution instructions. Each entry is written at the
end of its phase, before that phase's commit. Nothing in this log is
retroactively edited once a later phase begins — a correction to an
earlier entry is recorded as a new note in the current phase, not a rewrite
of history (the same immutability principle the engine itself enforces).

---

## Phase 1 — V3 foundation primitives

**Objective:** Additive, currently-unused TypeScript foundation:
`EvidenceState`, fail-closed `EngineOutcome<T>`, source IDs/ruleset
versions, units, and the `CalculationRun`/`DecisionRecord`/`InputEvidence`/
`CalculationStep`/`ComplianceCheck`/`AssumptionOrGap`/`SourceReference`/
`PeerReview` record shapes — designed and approved in a dedicated plan-mode
session before any implementation began.

**Files created:**
- `src/domain/evidence.ts`, `evidence.test.ts`
- `src/domain/units.ts`, `units.test.ts`
- `src/domain/source-register.ts`, `source-register.test.ts`
- `src/domain/audit-trace.ts`, `audit-trace.test.ts`
- `src/domain/audit-trace-store.ts`, `audit-trace-store.test.ts`

**Files modified:** none (pre-existing production code untouched).

**Scientific/statutory rules implemented:** none — this phase is pure
vocabulary/shape, no calculation logic.

**Calculation contracts addressed:** `RECOMMENDATION_AUDIT_TRACE` (shape
only, not yet wired to any real calculation).

**V3 finding IDs addressed:** none directly — this is the prerequisite
infrastructure for every later fix.

**Source IDs used:** all 20 rows of `sources/source_register.csv` plus 3
engine-internal ids (`ENGINE_AUDIT_RULE`, `ENGINE_UNIT_RULE`,
`ENGINE_FAIL_CLOSED`) registered as typed metadata (bibliographic only, no
numeric values).

**Tests added:** 61 (`evidence.test.ts` 12, `units.test.ts` 22,
`source-register.test.ts` 9, `audit-trace.test.ts` 13,
`audit-trace-store.test.ts` 6 — final counts after the units.ts test fix
below).

**Test totals/results:** 61/61 new tests pass; full existing suite 463/463
unchanged.

**Build/typecheck/lint status:** typecheck clean, lint clean, no
production build run this phase (no UI change).

**Known limitations:**
- `computeTraceSha256`/`sealCalculationRun` are `async` (Web Crypto), a
  deliberate deviation from the plan's sketched synchronous signature —
  documented in-code and to the user at hand-off.
- One test bug found and fixed during self-verification (not a design
  defect): a generic "every conversion identity-converts its canonical
  unit" test in `units.test.ts` used the CSV's descriptive `canonicalUnit`
  label text (e.g. `"kg nutrient/ha"`) instead of the actual native/first
  accepted unit string (`"kg/ha"`) — fixed to assert against
  `acceptedInputUnits[0]` instead, since the mismatch was in the test's
  own assertion, not in `units.ts`'s data (which is a faithful, verified
  copy of `unit_registry.csv`).

**Unresolved evidence gaps:** none introduced by this phase.

**Blockers:** none.

**Next phase:** B — audit-trace integration foundation (adapters bridging
the existing `TrackedValue` provenance model to `InputEvidence`, plus a
deterministic farm-snapshot fingerprint), so Phase E onward's real fixes
can emit a real trace from day one rather than reconstructing one later.

---

## Phase B — Audit-trace integration foundation

**Objective:** Per the "TRACE EARLY, REPORTS UI LATER" architectural
requirement — build the remaining glue Phase 1's types need before a real
calculation can emit a real `DecisionRecord`, so Phase E's fixes are traced
from the moment they're built, not retrofitted afterward.

**Files created:**
- `src/domain/audit-trace-adapters.ts` — `trackedValueToInputEvidence`
  (bridges `TrackedValue<T>` → `InputEvidence`, with `evidenceState`/
  `sourceKind` always caller-supplied, never inferred — same "don't guess
  the evidence-quality mapping" principle Phase 1's plan recorded),
  `computeFarmSnapshotId` (deterministic SHA-256 fingerprint of the exact
  inputs a calculation consumed), `nextStepSequence` (ordering helper for
  `CalculationStep[]`).
- `src/domain/audit-trace-adapters.test.ts` — 11 tests.

**Files modified:**
- `src/domain/audit-trace.ts` — refactored `computeTraceSha256`'s inline
  hashing logic into a new exported `canonicalSha256(value)` primitive, so
  `computeFarmSnapshotId` reuses the identical canonicalisation/hashing
  implementation rather than a second hand-written copy. Backwards
  compatible: `computeTraceSha256`'s own signature/behaviour is unchanged
  (re-verified by rerunning Phase 1's `audit-trace.test.ts` unmodified —
  all still pass).

**Scientific/statutory rules implemented:** none — still pure
infrastructure.

**Calculation contracts addressed:** `RECOMMENDATION_AUDIT_TRACE` (moves
from "shape only" to "shape + a bridge from existing provenance data",
still not wired to any real calculation).

**V3 finding IDs addressed:** none directly.

**Source IDs used:** none new.

**Tests added:** 11 (`audit-trace-adapters.test.ts`).

**Test totals/results:** 11/11 new tests pass; full suite 474/474
(463 pre-existing + 11 new — Phase 1's 61 were already counted in the 463
baseline reported at hand-off, confirmed by rerunning the full suite).

**Build/typecheck/lint status:** typecheck clean, lint clean.

**Known limitations:** `computeFarmSnapshotId` hashes a caller-supplied
record of "the inputs this calculation actually used", not a versioned
"farm state as of time T" concept — this app has no versioned farm-state
history (`farm-store.tsx` holds one current state only), so a content
fingerprint of what was actually consumed is the honest, evidence-based
choice rather than inventing a snapshot-versioning system with no V3 basis.

**Unresolved evidence gaps:** none introduced by this phase.

**Blockers:** none.

**Next phase:** C — required V3 input/evidence model (additive optional
fields on `Field`/`LivestockGroup`/`SilagePlan`/`FertiliserProduct` per
`required_input_fields.csv`) and the fail-closed input gates that read
them.

---

## Phase C — Required input/evidence model + fail-closed input gates

**Objective:** Add every field `required_input_fields.csv` names as new,
purely additive/optional properties on the existing farm-model types, and a
gate function per field that resolves it to an `EngineOutcome`, failing
closed when the evidence is genuinely absent.

**Files created:**
- `src/domain/input-gates.ts` — 8 gate/resolver functions, one per
  required-input row not already covered by Phase 1's `PeerReview` type
  (`RECOMMENDATION_REVIEW_STATE`) or already a required, always-populated
  field (`SILAGE_DESTINATION`, deferred to the phase that fixes its
  enum/eligibility logic — audit conflict #5).
- `src/domain/input-gates.test.ts` — 19 tests.

**Files modified (all additive — 0 deleted lines, confirmed via
`git diff | grep -c "^-[^-]"`):**
- `src/domain/types.ts` — new optional fields: `Field.commonageStatus`,
  `Field.waterBufferContext`, `SlurryAllocation.applicationMethod`,
  `SilagePlan.saleEvidence`, `FertiliserProduct.formulation`; new
  standalone `ConcentrateFeedSpec` interface (no stored entity for
  concentrate purchases exists yet, so this is a parameter shape, not a
  new field on an existing entity).
- `src/domain/evidence.ts` — 7 new reason codes appended to `REASON_CODES`.
- `src/domain/units.ts` — new `FeedBasis` type (`"fresh_weight" |
  "dry_matter"`), alongside the `FEED_DRY_MATTER`/`FRESH_FORAGE_MASS`
  quantities it tags.

**Scientific/statutory rules implemented:** one real statutory default —
`STATUTORY_CONCENTRATE_P_DEFAULT_KG_PER_100KG = 0.5`, sourced to
`rules_statutory/concentrate_feed_compliance_2026.csv`'s
`CONC_P_DEFAULT_CONTENT` row (`LAW_IE_SI_588_2025`) — used only as a
fallback when supplier/known P content is absent, never overriding known
content (`GFT149`).

**Calculation contracts addressed:** input preconditions for
`COMMONAGE_FERTILISER_GATE`, `LESS_METHOD_GATE`, `SILAGE_DESTINATION_
REGULATORY_ROUTE`, `FEED_CP_LEGAL_GATE`, `CONCENTRATE_P_COMPLIANCE`,
`FERTILISER_PRODUCT_ADMISSIBILITY` — the gates themselves (Phase F) are
not yet built; this phase only ensures each has real evidence (or a real
fail-closed block) to consult once built.

**V3 finding IDs addressed:** none of the 9 audit conflicts directly yet
(no existing calculation reads these new fields); this phase is the
prerequisite for fixing conflicts #5–#9 (silage evidence, slurry method,
fertiliser inhibitor metadata, and the new-gate conflicts) in later phases.

**Source IDs used:** `LAW_IE_SI_588_2025` (the one real statutory
default), `ENGINE_FAIL_CLOSED`-class internal gating logic for the rest.

**Design note — `resolveLocalWaterBufferOverrideStatus` and
`resolveConcentratePContentKgPer100kg` are deliberately NOT "require"
gates:** per AF010/`GFT090`, a water-buffer override status of
`"unknown"` (assessed, but unresolved) must produce `QUALIFIED_NOT_
DEFINITIVE`, not a hard block — only a field never assessed at all blocks.
Per `CONC_P_DEFAULT_CONTENT`'s own `fail_if_missing` text, missing
concentrate P content resolves to the statutory 0.5 kg/100kg default, not
a block. Both are implemented to match their specific V3 rule rather than
reusing the generic "absent = blocked" pattern the other 6 gates use.

**Design note — narrow, documented `DataStatus -> EvidenceState` mapping:**
`evidenceStateForDirectAssertion` maps `verified`/`farmer_adjusted` ->
`MEASURED` and `estimated`/`mapped` -> `IRISH_DEFAULT`, but ONLY for the
category every gate in this file shares — a farmer's/document's direct
declaration of a discrete categorical fact about their own land/records.
This is explicitly scoped in its own doc comment as distinct from, and not
a reversal of, Phase 1's "no blind generic `DataStatus -> EvidenceState`
mapper" decision — a farmer's *estimate* of a continuous lab quantity
(e.g. a guessed P-index) is a different kind of claim and must never route
through this helper.

**Tests added:** 19 (`input-gates.test.ts`), covering both the block case
and the OK case (with correct `evidenceState`) for all 8 gates, plus the
two non-blocking "unknown is valid"/"default is valid" special cases.

**Test totals/results:** 19/19 new tests pass; full suite 493/493
(474 baseline + 19).

**Build/typecheck/lint status:** typecheck clean, lint clean.

**Known limitations:** no existing screen captures any of these new
fields yet (no farmer-facing UI for commonage status, water-buffer
context, slurry method, silage sale evidence, or fertiliser formulation),
so every gate in this file will return `BLOCKED_INSUFFICIENT_EVIDENCE` for
every real field/product in `mock-farm.ts` today — correct, intended
fail-closed behaviour, not a bug, until capture UI exists.

**Unresolved evidence gaps:** none introduced; this phase is entirely
about making existing gaps *visible and structured* rather than silent.

**Blockers:** none.

**Next phase:** D/E combined — separate the agronomic and statutory
nutrient ledgers for real, starting with the highest-risk audit conflict
(the Green Book LU-based "stocking rate" standing in for the statutory
Grassland Stocking Rate that gates every NAP ceiling today).
