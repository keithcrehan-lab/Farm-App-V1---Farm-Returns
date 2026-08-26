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

---

## Phase D — Real statutory livestock excretion + Grassland Stocking Rate

**Objective:** Build the real `GRASSLAND_STOCKING_RATE` calculation
(S.I. 119/2026 Table 7) that audit conflict #1 identified as missing —
the highest-risk finding in the whole audit, since the figure currently
gating every field's NAP N/P ceiling is a Green Book agronomic curve, not
this. Built as a new, self-contained, not-yet-wired module first (this
phase), then wired into `checkNapCompliance` next phase (E) — split for
reviewability, per "split into smaller phases whenever doing so improves
safety/testability".

**Files created:**
- `src/domain/statutory-excretion.ts` — the full 31-row S.I. 119/2026
  Table 7 (`rules_statutory/livestock_excretion_rates_2026.csv`, copied
  verbatim — cattle rows are this app's only consumer today, but the full
  table is kept as real sourced data for any future sheep/horse/deer/pig/
  poultry enterprise); `resolveStatutoryExcretionCategory` (maps a
  `LivestockGroup` to its real Table 7 category, failing closed whenever
  age/sex/milk-band evidence this app doesn't yet capture is needed);
  `statutoryAnnualExcretionKgPerHead` (combines the `calf_0_90_days` +
  `cattle_91_days_to_end_year1` rows into one real first-year annual total,
  21 kgN/2.9 kgP — Table 7's own two-row structure for a calf's first
  year, not an invented blend); `calculateStatutoryGrasslandStockingRateKgHa`
  (the real GSR ratio, blocking the WHOLE calculation — not a silent
  undercount — if any group can't be categorised, since the NAP N ceiling
  schedule is non-monotonic and an undercount is not "conservatively
  safe" in either direction).
- `src/domain/statutory-excretion.test.ts` — 18 tests.

**Files modified:**
- `src/domain/evidence.ts` — 5 new reason codes appended to `REASON_CODES`.

**Scientific/statutory rules implemented:** S.I. 119/2026 Table 7 (all 31
categories), and the statutory GSR definition
(`rules_statutory/grassland_stocking_rate_definition_2026.csv`: numerator
before manure exports, never subtracted — `GFT022`).

**Calculation contracts addressed:** `GRASSLAND_STOCKING_RATE` (built for
real; not yet consumed by any existing calculation — that's Phase E).

**V3 finding IDs addressed:** none closed yet (this module isn't wired
into `nutrients.ts` until Phase E) — this phase is the real replacement
audit conflict #1 needs, ready to be substituted in.

**Source IDs used:** `LAW_IE_SI_119_2026` (Table 7).

**Tests added:** 18, including a test that mirrors this app's real
`mock-farm.ts` herd exactly (category/count only, matching every group's
real data) and confirms it correctly returns `BLOCKED_INSUFFICIENT_
EVIDENCE` today — no real farm in this app can yet produce a real
statutory GSR, because no group has `avgAgeMonths`/`sex` captured. This is
the correct, intended fail-closed outcome the audit called for, not a
regression to fix in this phase.

**Test totals/results:** 18/18 new tests pass; full suite 511/511
(493 baseline + 18).

**Build/typecheck/lint status:** typecheck clean; lint initially flagged
one unused import (`LivestockCategory`, not actually referenced in the
final implementation) — fixed before commit; both clean now.

**Known limitations:** `dairy_cow` always blocks (no milk-yield-band field
exists anywhere in this data model — matches `nutrients.ts`'s own existing
note that dairy isn't a modelled enterprise here). Every age-dependent
cattle category blocks until `avgAgeMonths` (and, for the 1-2 year band,
`sex`) is actually captured somewhere — no capture UI exists yet for
either field on the Livestock screens.

**Unresolved evidence gaps:** real per-animal age/sex/milk-yield-band data
for this farm's actual herd — flagged, not invented. Capturing it needs a
Livestock-screen UI change out of this phase's scope (a pure-domain-module
phase).

**Blockers:** none.

**Next phase:** E — wire this module's real statutory GSR into
`checkNapCompliance` as the compliance-ledger's stocking-rate input
(replacing the Green Book LU curve's role there, while that curve keeps
its own legitimate role as the agronomic grazing-N-requirement figure),
plus three more targeted audit-conflict fixes: the DMD exact-lookup fix,
the P-Index ambiguous-boundary fix, and the silage-sale-evidence gating
fix.

---

## Phase E1 — P-Index ambiguous boundary + K-Index peat-soil fix

**Objective:** Fix audit conflict #3 (§3, ranked #3): `pIndexFromMgL`
silently classified the entire literal `(8.00, 8.01]` statutory micro-gap
as Index 4, with no `other_crop` crop-group support at all. Bundled with
the adjacent, same-describe-block K-Index peat-soil gap (§2.1: peat soils
silently got the mineral-soil bands) — both are the same "Soil P/K Index
classification" section, both real, both low-blast-radius.

**Files modified:**
- `src/domain/nutrients.ts` — `pIndexFromMgL` now returns
  `EngineOutcome<SoilIndex>` (`"OK"` for a definite index, `"AMBIGUOUS"`
  for the literal micro-gap — never silently coerced), takes an optional
  `cropGroup: "grassland" | "other_crop"` (default `"grassland"`, backward
  compatible), and both crop groups' real statutory bounds
  (`rules_statutory/soil_phosphorus_index_2026.csv`) are now implemented.
  New `resolvePIndexConservatively(outcome)` — the spec B1 opt-in
  conservative-P4 treatment, explicit and separately flagged
  (`conservativeTreatment: boolean`), never silent. New
  `cropGroupForFieldUse(use)` — derives the crop group from the existing
  `FieldUse` field (`"tillage"` -> `other_crop`, everything else ->
  `grassland`; this app has no separate crop-group field to add).
  `kIndexFromMgL` now takes an optional `soilMaterial: "mineral" | "peat"`
  (default `"mineral"`, backward compatible) with peat's own real bands
  from `advisory_teagasc/soil_K_index_current.csv`. New
  `soilMaterialForOrganicCarbonStatus(status)` — derives the material from
  the existing `MappedSoil.organicCarbonStatus` field.
- `src/store/farm-store.tsx` — `addSoilTest` (the one production call
  site) updated: resolves the real crop group/soil material from the
  field's own data, applies `resolvePIndexConservatively`, and — when
  conservative treatment was applied — records that explicitly in the
  stored `TrackedValue`'s `source` text (spec B1: "explicitly recording
  that this is a conservative handling... not a fabricated literal
  classification"), rather than storing it indistinguishably from a real
  Index 4 lab result.
- `src/domain/nutrients.test.ts` — the two P-Index describe blocks that
  asserted the old plain-number return (and never tested the ambiguous
  case at all) are REWRITTEN, not merely extended, per the "do not
  preserve an existing test expectation... if V3 evidence demonstrates
  the behaviour is wrong" instruction — old assertions for definite
  classifications are kept (still correct), new assertions cover the
  ambiguous gap, `other_crop`, `resolvePIndexConservatively`,
  `cropGroupForFieldUse`, K-Index peat bands, and
  `soilMaterialForOrganicCarbonStatus`.

**Scientific/statutory rules implemented:**
`rules_statutory/soil_phosphorus_index_2026.csv` (both crop groups, the
literal ambiguous gap); `advisory_teagasc/soil_K_index_current.csv` (peat
bands).

**Calculation contracts addressed:** `SOIL_P_INDEX` (now real, both crop
groups, ambiguity-guarded).

**V3 finding IDs addressed:** audit conflict #3 (P-Index ambiguous
boundary) — RESOLVED. Audit §2.1's K-Index peat gap — RESOLVED.

**Source IDs used:** `LAW_IE_SI_588_2025` (P Index), `TEAGASC_SOIL_INDEX`
(K Index).

**Tests added/rewritten:** 2 old tests rewritten into 11 new/rewritten
tests (definite grassland boundaries, the ambiguous gap, post-gap Index 4,
`other_crop` boundaries + its own ambiguous gap, the crop-group default,
`resolvePIndexConservatively`'s two branches, `cropGroupForFieldUse`, K
peat vs mineral bands including the same-mgL-different-index confirmation,
`soilMaterialForOrganicCarbonStatus`).

**Test totals/results:** `nutrients.test.ts`: 53/53 (was 45; 2 rewritten
+ 8 net new). Full suite: 519/519 (511 baseline + 8 net new).

**Build/typecheck/lint status:** typecheck clean, lint clean, **production
build (`next build`) run and verified clean** — `farm-store.tsx` is used
across the whole app, so a full build was run this phase in addition to
the standard checks.

**Known limitations:** no farmer-facing UI change accompanies this fix —
the ambiguous-boundary/conservative-treatment provenance is recorded in
the `TrackedValue.source` string (visible in provenance history) but no
screen yet surfaces an explicit "ambiguous boundary" banner distinct from
an ordinary verified soil test. That's a Reports/UI-surfacing concern for
a later phase, not a data-correctness gap.

**Unresolved evidence gaps:** none introduced.

**Blockers:** none.

**Next phase:** E2 — DMD exact-lookup fix (`livestock.ts`'s
`concentrateKgPerDay` currently interpolates between DMD table rows,
directly contradicting V3 Spec I5 / `GFT115`'s "no interpolation" rule).

---

## Phase E2 — DMD exact-lookup fix (no interpolation)

**Objective:** Fix audit conflict #2 (§3, ranked #2 — "the highest-
confidence, most concretely-tested conflict in the whole audit"):
`concentrateKgPerDay` linearly interpolated between the DMD-Concentrate
table's published breakpoints and clamped outside its range, directly
contradicting `calculation_contracts.csv`'s `DMD_CONCENTRATE_GUIDANCE`
("exact lookup only... No interpolation") and Spec §I5's own worked
example ("DMD 73 does not automatically get interpolated between 72 and
74"). `GFT115` requires `DMD:73 -> BLOCK_EXACT_LOOKUP`.

**Files modified:**
- `src/domain/livestock.ts` — `concentrateKgPerDay` now returns
  `EngineOutcome<number>`: `"OK"` only for an exact published-row match;
  `"BLOCKED_INSUFFICIENT_EVIDENCE"` / `BLOCK_EXACT_LOOKUP` for anything
  else, including values that used to be silently clamped to a boundary
  row (a DMD below 66 or above 76 is equally absent from the table, not a
  defensible "nearest row" substitute). `calculateFinishingBudget` now
  returns `EngineOutcome<FinishingBudgetResult>`, propagating the DMD
  block rather than absorbing it into a budget computed from a guessed
  rate. `calculateLivestockEconomics` (the one screen-facing consumer)
  now also returns `undefined` when the budget outcome isn't `"OK"` —
  collapsing into the SAME `undefined` the screen already renders as
  "nothing to show" for a missing weight, rather than a new UI state (a
  distinct farmer-visible "DMD not on the validated table" message is a
  Reports/UI-surfacing follow-up, not this phase).
- `src/domain/finance.ts` — `calculateFarmConcentrateFeedCostEur` and
  `calculateFarmConcentrateFeedRequirement`'s two `calculateFinishingBudget`
  call sites updated: a group whose configured `silageDMD` isn't an exact
  table row is now excluded from the whole-farm total (matching this
  file's own pre-existing "deliberately partial... not filled with a
  guess" convention for groups with no real model at all), rather than
  contributing a number computed from an interpolated rate.
- `src/domain/livestock.test.ts` — the `concentrateKgPerDay` describe
  block's interpolation and clamping assertions are REWRITTEN (not
  extended) into `BLOCK_EXACT_LOOKUP` assertions, per "do not preserve an
  existing test expectation... if V3 evidence demonstrates the behaviour
  is wrong"; the `calculateFinishingBudget` block's assertions are
  adapted to the new `EngineOutcome` return shape (values unchanged, this
  farm's real steer group uses `silageDMD: 72`, an exact table row, so the
  worked-example numbers are identical) plus one new fail-closed test.
- `src/domain/finance.test.ts` — two call sites adapted to the new
  `EngineOutcome` return shape (same reasoning: `silageDMD: 72` is exact,
  so expected values are unchanged).

**Scope note — NOT changed in this phase, deliberately:**
`weanlingADGForConcentrateKgDay`/`steerADGForConcentrateKgDay` also
interpolate, but between real Teagasc TRIAL response points (evidence
class B/B-RESEARCH — an empirical dose-response curve), not a published
discrete advisory table — `DMD_CONCENTRATE_GUIDANCE`'s "no interpolation"
rule targets exact published lookup tables specifically
(`TEAGASC_DAIRYBEEF_DMD`-type sources), not trial dose-response
estimation, which is a different, legitimate scientific object already
correctly labelled as an estimate in the code/UI. Also NOT changed:
`weanlingFirstWinterConcentrateKgPerDay`/`WEANLING_FIRST_WINTER_MIDPOINT_TABLE`
— structurally the same interpolation problem, but this table's source
isn't in the V3 pack's `sources/source_register.csv` at all (flagged in
the original audit as "needs reconciliation before a V3 conflict verdict
can even be assigned"), and it is confirmed UNUSED by any production code
path (`grep` found zero callers in `src/app`/`src/components`) — so it
carries zero current legal/scientific risk and is left as a documented,
unresolved gap rather than expanded scope for this phase.

**Scientific/statutory rules implemented:** none new — this is a
correctness fix to how the existing `TEAGASC_DAIRYBEEF_DMD` table is
accessed, not a new rule.

**Calculation contracts addressed:** `DMD_CONCENTRATE_GUIDANCE` — RESOLVED
for `concentrateKgPerDay`/`calculateFinishingBudget`.

**V3 finding IDs addressed:** audit conflict #2 — RESOLVED for the one
real production call path. The two out-of-scope interpolating functions
above remain open items, explicitly logged (not silently left).

**Source IDs used:** `TEAGASC_DAIRYBEEF_DMD`.

**Tests added/rewritten:** `livestock.test.ts`: 4 old assertions rewritten
into exact-match `OK` assertions, 2 old assertions (interpolation, clamp)
rewritten into `BLOCK_EXACT_LOOKUP` assertions, 1 new fail-closed test on
`calculateFinishingBudget`. `finance.test.ts`: 2 call sites adapted, no
new tests (existing coverage was already sufficient once the shape
change was accounted for).

**Test totals/results:** Full suite: 520/520 (519 baseline + 1 net new).

**Build/typecheck/lint status:** typecheck clean, lint clean, production
build (`next build`) run and verified clean — `livestock.ts`/`finance.ts`
feed Dashboard, Finance, Feed Optimiser and Livestock Economics screens.

**Known limitations:** no farmer-visible UI message yet distinguishes "no
weight recorded" from "DMD not on the validated table" — both currently
render as the same blank/absent economics card. Real risk in practice is
low today: this farm's only two `FINISHING_OPTIONS` entries both use
`silageDMD: 72`, an exact table row, so nothing currently visible in the
app actually hits the block path — but the fix is real and general, not
specific to this farm's current mock data.

**Unresolved evidence gaps:** `weanlingFirstWinterConcentrateKgPerDay`'s
source table remains unreconciled against V3's source register (logged
above, unused in production so zero current risk).

**Blockers:** none.

**Next phase:** E3 — silage-sale-evidence gating fix (`checkNapCompliance`
currently grants the higher Table 16/17 sale-route NAP ceiling from
`intendedUse: "sale"` alone, with no written-evidence check — audit
conflict #5, `GFT103`).
