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
