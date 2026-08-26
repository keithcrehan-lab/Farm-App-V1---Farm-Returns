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

---

## Phase E3 — Silage-sale-evidence gating fix

**Objective:** Fix audit conflict #5: `checkNapCompliance` granted the
higher Table 16/17 sale-route NAP ceiling from `intendedUse: "sale"`/
`"both"` alone — Table 16/17's own eligibility text additionally requires
WRITTEN EVIDENCE OF SALE, with no gate for it at all. `GFT103`: same
GSR/eligibility, `written_evidence: false` -> must NOT use the sale
table.

**Files modified:**
- `src/domain/types.ts` — `NapComplianceCheck` gains two new required
  fields: `saleEvidenceRequired`/`saleEvidenceConfirmed` — whether the
  sale-route ceiling was even a candidate, and whether evidence was
  actually confirmed, distinct from just the resulting ceiling number
  (confirmed the only production constructor is `checkNapCompliance`
  itself, so making these required rather than optional is safe).
- `src/domain/nutrients.ts` — `checkNapCompliance` takes a new
  `hasWrittenSaleEvidence = false` parameter (safe default, matching
  `cutIntendedForSale`'s own existing convention); eligibility now
  requires it alongside the existing conditions.
  `CalculateNutrientPlanInput.silage` gains `saleEvidence?: {
  hasWrittenEvidence: boolean }`; `calculateNutrientPlan` reads it and
  passes it through.
- `src/app/nutrients/page.tsx`, `src/lib/reports.ts` — the two production
  call sites that already pass `intendedUse` now also pass
  `saleEvidence` from the real `SilagePlan.saleEvidence` field (Phase
  C). The other 3 `calculateNutrientPlan` call sites in `finance.ts`
  never passed `intendedUse` in the first place (already safe — never
  sale-eligible) and are unmodified, out of scope for this fix.
- `src/lib/reports.ts` — Nutrient Plan Report CSV gains a "Silage sale
  evidence" column (`Not applicable` / `Required, not confirmed` /
  `Confirmed`) — a reviewer needs to see WHY the ordinary ceiling
  applied (no sale route claimed vs. sale route claimed but
  unevidenced), not just the pass/fail numbers.
- `src/components/farm/NapComplianceCard.tsx` — a new neutral-toned note
  appears when `saleEvidenceRequired && !saleEvidenceConfirmed`,
  explaining the ordinary ceiling applied for lack of confirmed evidence.
- `src/domain/nutrients.test.ts` — 3 pre-existing tests that passed
  `cutIntendedForSale: true` with no evidence and asserted the sale-route
  ceiling applied are REWRITTEN (this was exactly the `GFT103` failure
  mode, not a legitimate case) to pass real evidence confirmation for the
  positive case; 4 new tests added covering the negative case (intent
  without evidence falls back correctly), the landUse/cutIntendedForSale
  gating of `saleEvidenceRequired` itself, and the same fix at the
  `calculateNutrientPlan` orchestration level.

**Real-farm impact today:** this farm's only real `SilagePlan`
(`mock-farm.ts`) has `intendedUse: "own_livestock"` — `saleEvidenceRequired`
is `false` for it either way, so nothing currently visible on `/nutrients`
changes for this farm's actual data. The fix is real and general, not
specific to today's mock data (same pattern as E1/E2).

**Scientific/statutory rules implemented:** the written-evidence
eligibility condition from `rules_statutory/silage_for_sale_n_limits_2026.csv`/
`..._p_limits_2026.csv`, already partially implemented (GSR≤85, cut
number) but missing this one condition.

**Calculation contracts addressed:** `SILAGE_DESTINATION_REGULATORY_ROUTE`
— partially advanced (written-evidence gate now real; the `intendedUse`
enum's own naming mismatch with V3's `own_feed/sale/mixed/unknown`
vocabulary remains open, see below).

**V3 finding IDs addressed:** audit conflict #5 — RESOLVED for the
written-evidence gate specifically.

**Source IDs used:** `LAW_IE_SI_588_2025`.

**Design note — `intendedUse` enum NOT renamed in this phase:** Phase C's
build log flagged that `SilagePlan.intendedUse`'s enum
(`own_livestock`/`sale`/`both`) still differs from V3's
`own_feed`/`sale`/`mixed`/`unknown`. This phase deliberately does not
rename it — the actual legal-risk gap (both `"sale"` and `"both"`
auto-qualifying without evidence) is now closed by the evidence gate
regardless of the label used, since the gate applies identically to both
values. A pure string-rename is lower-value churn than the behavioural
fix and is left as an open, explicitly logged cosmetic gap rather than
expanded scope.

**Tests added/rewritten:** 3 rewritten, 4 new (`nutrients.test.ts`).

**Test totals/results:** Full suite: 524/524 (520 baseline + 4 net new).

**Build/typecheck/lint status:** typecheck clean, lint clean, production
build (`next build`) run and verified clean.

**Known limitations:** the `intendedUse` enum naming mismatch (see design
note above) remains open. No UI exists yet to actually capture
`SilagePlan.saleEvidence` (Phase C's field) — a farmer can't yet mark a
cut as sold with evidence through any screen, so `saleEvidenceRequired`
can currently only ever be satisfied by editing mock data directly, not
through the live app.

**Unresolved evidence gaps:** none new; the `intendedUse` enum gap is
carried forward, explicitly.

**Blockers:** none.

**Next phase:** F — begin the new V3 statutory gate modules in
`ADVERSARIAL_AUDIT_REPORT.md` §1's own risk order: commonage fertiliser
gate first (§1.1 — "a scientifically plausible but legally prohibited
chemical-fertiliser recommendation").

---

## Phase E4 — Statutory GSR wiring (closes audit conflict #1)

**Objective:** Complete audit conflict #1 — the highest-risk finding in
the whole audit. Phase D built the real statutory GSR calculation but did
not yet wire it in; `checkNapCompliance` still received the Green Book
agronomic LU curve as its "stocking rate" input. This phase makes the
real statutory figure the one that actually gates every field's NAP N/P
ceiling.

**Files modified:**
- `src/domain/nutrients.ts` — `calculateGrasslandStockingRateKgHa`'s doc
  comment now states its role precisely: AGRONOMIC ledger only (feeds
  `grossN`/`grossP`/`grossK`, the fertiliser recommendation), never the
  compliance ceiling. `calculateNutrientPlan` now calls
  `calculateStatutoryGrasslandStockingRateKgHa` (Phase D) and only calls
  `checkNapCompliance` — passing the REAL statutory `gsrKgNHa`, not the
  agronomic curve — when that resolves `"OK"`; otherwise `napCompliance`
  IS the `BLOCKED_INSUFFICIENT_EVIDENCE` outcome directly. The agronomic
  ledger (`requirement`, `purchasedProducts`, `estimatedFieldCostEur`) is
  computed exactly as before and is NOT gated by whether the compliance
  ledger resolves — the two ledgers never gate each other (spec Section
  A2), confirmed by a new test.
- `src/domain/types.ts` — `NutrientPlan.napCompliance` is now
  `EngineOutcome<NapComplianceCheck>`, not a bare `NapComplianceCheck`.
- `src/components/farm/NapComplianceCard.tsx` — handles both branches: a
  new neutral "Insufficient evidence" card state lists the real
  `missingInputs` (e.g. which specific group needs an age/sex) when the
  statutory GSR can't be resolved, instead of rendering a ceiling number
  computed from the wrong figure.
- `src/lib/reports.ts` — the Nutrient Plan Report CSV writes
  `"INSUFFICIENT_EVIDENCE"` into the ceiling/regulatory/sale-evidence
  columns for a blocked field rather than a blank cell or a number
  computed from the agronomic curve — the gap must be visible in the
  export, not silently absent.
- `src/domain/nutrients.test.ts` — 4 `calculateNutrientPlan` orchestration
  tests that accessed `plan.napCompliance.<field>` directly are REWRITTEN
  to unwrap the `EngineOutcome` first; the one test that compared
  `orgNStockingRateKgHa` against the Green Book agronomic curve is
  corrected to compare against the real statutory GSR instead (now a
  genuinely different number — confirmed by the test itself: 20 suckler
  cows over 27ha statutory GSR ≈48.15 kgN/ha vs. the agronomic curve's
  clamped ≈35 kgN/ha, a real, visible divergence, not a rounding
  difference). One new test added proving the fail-closed path (a
  weanling group with no `avgAgeMonths` blocks the compliance ledger
  while the agronomic/fertiliser-cost ledger keeps producing a real
  number).

**Real-farm impact today — a genuine, intended behaviour change, not a
regression:** this farm's real `mock-farm.ts` herd has NO group with
`avgAgeMonths`/`sex` captured except `suckler_cow` (which resolves
directly). Every OTHER real group (`weanling`, `heifer`, `bull`, `steer`)
now makes `napCompliance` resolve to `BLOCKED_INSUFFICIENT_EVIDENCE`
whenever it contributes to a field's stocking rate — so the real
`/nutrients` screen, for this farm's real current data, now shows
"Insufficient evidence" instead of a NAP ceiling number for most fields.
This is the CORRECT, INTENDED consequence of fixing audit conflict #1 —
the previous ceiling numbers were being computed from the wrong figure
(an agronomic curve, not the statutory GSR) and were not actually
legally reliable; showing them fail closed instead of masking the gap is
exactly what the master build instructions require ("fail closed when
required evidence is missing... UNKNOWN and INSUFFICIENT_EVIDENCE are
valid scientific outputs and must not be concealed merely to populate the
UI"). Closing this gap for real needs a Livestock-screen UI change
(capturing `avgAgeMonths`/`sex`) that is out of this phase's scope (a
domain/compliance-ledger phase).

**Scientific/statutory rules implemented:** none new this phase — this is
the wiring of Phase D's already-real S.I. 119/2026 Table 7 calculation
into the point that actually needed it.

**Calculation contracts addressed:** `GRASSLAND_STOCKING_RATE` — fully
RESOLVED (real calculation, built Phase D, now the actual input to every
NAP ceiling determination).

**V3 finding IDs addressed:** audit conflict #1 — RESOLVED.

**Source IDs used:** `LAW_IE_SI_119_2026`.

**Tests added/rewritten:** 4 rewritten, 1 new (`nutrients.test.ts`).

**Test totals/results:** Full suite: 525/525 (524 baseline + 1 net new).

**Build/typecheck/lint status:** typecheck clean, lint clean, production
build (`next build`) run and verified clean.

**Known limitation / documented blocker — Playwright visual regression
suite could not be run this phase.** `tests/e2e/visual.spec.ts` has an
approved baseline screenshot for `/nutrients` (mobile + desktop) that
this phase's real behaviour change (see "Real-farm impact" above) WILL
make stale — the card's rendered content genuinely differs now. Attempted
to run/update it (`npx playwright test -g nutrients`, `npx playwright
install chromium`): the sandboxed environment has no Chromium binary at
the fixed path Playwright expects (`/opt/pw-browsers/chromium`) and the
install command could not fetch one (no working network egress to the
Playwright CDN in this environment, consistent with the network
restrictions already documented elsewhere in this codebase's own
`docs/evidence-register.md` for external hosts). This is a genuine,
isolated TOOLING blocker, not an evidence/architecture gap: the
underlying fix is fully covered by Vitest (unit-level, 525/525 passing),
typecheck, lint and a real production build, all of which pass. The
`/nutrients` visual baseline (`tests/e2e/visual.spec.ts-snapshots/
nutrients-{mobile,desktop}-linux.png`) needs regenerating in an
environment with a working Chromium binary before the next full visual
regression run — flagged here rather than silently left to fail in CI
later.

**Unresolved evidence gaps:** real per-animal age/sex data for this
farm's herd (already logged in Phase D) is now the ACTIVE blocker on
`/nutrients` showing real compliance numbers, not just a latent gap.

**Blockers:** Playwright Chromium binary unavailable in this environment
(documented above) — does not block any further domain-layer phase, only
this one visual-regression check. Continuing with Phase F.

**Next phase:** F — begin the new V3 statutory gate modules in
`ADVERSARIAL_AUDIT_REPORT.md` §1's own risk order: commonage fertiliser
gate first.

---

## Phase F1-F3 — New statutory gates, batch 1 (commonage, LESS method, soiled water)

**Objective:** Build the first three new V3 gate modules in
`ADVERSARIAL_AUDIT_REPORT.md` §1's own adversarial-risk order (§1.1-§1.3).
All are additive, self-contained modules on Phase C's input-evidence
gates and Phase 1's `EngineOutcome` vocabulary — none are wired into any
existing screen or calculation yet (no production chemical-fertiliser or
slurry-plan flow currently checks commonage/LESS/soiled-water status at
all, so there's nothing yet for these to be wired into without also
building the capture UI for their inputs — logged as follow-up work, not
silently skipped).

**Files created:**
- `src/domain/commonage-gate.ts` (`COMMONAGE_FERTILISER_GATE`, AF003
  CRITICAL) — `checkCommonageFertiliserGate` (chemical fertiliser
  `PROHIBITED` on commonage, `GFT081`/`GFT082`), `checkCommonageOrganicNAllowanceKgHa`
  (real 50 kg organic-N/ha cap, `rules_statutory/commonage_rules_2026.csv`).
  Built on Phase C's `requireCommonageStatus`.
- `src/domain/commonage-gate.test.ts` — 9 tests.
- `src/domain/less-method-gate.ts` (`LESS_METHOD_GATE`, AF004 HIGH — also
  closes audit conflict #6, the dead `slurryMethod` parameter) —
  `checkLessMethodGate`, all three real independent statutory triggers
  from `rules_statutory/less_requirements_2026.csv` (GSR≥100 kg N/ha,
  any pig slurry, any arable application), the arable 24h-incorporation
  alternative, and the documented steep-slope H&S exception (only
  satisfied when both required records — LPIS parcel, spreading dates —
  are actually confirmed, not merely claimed). `GFT052`-`GFT055`.
- `src/domain/less-method-gate.test.ts` — 10 tests.
- `src/domain/soiled-water-gate.ts` (`SOILED_WATER_APPLICATION_GATE`,
  AF005 HIGH) — `checkSoiledWaterApplicationGate`, both real statutory
  limits from `rules_statutory/soiled_water_application_limits_2026.csv`
  (50,000 litres/ha cumulative over a rolling 42-day window — checked
  against prior application history, never the proposed event in
  isolation, per AF005's own framing; 5 mm/hour application rate).
  Returns `UNKNOWN` (never assumes zero) when prior 42-day history isn't
  known — this app has no application-history ledger yet, so this will
  always be `UNKNOWN` until one exists.
- `src/domain/soiled-water-gate.test.ts` — 7 tests.

**Files modified:**
- `src/domain/evidence.ts` — 13 new reason codes appended.

**Scientific/statutory rules implemented:**
`rules_statutory/commonage_rules_2026.csv`,
`rules_statutory/less_requirements_2026.csv`,
`rules_statutory/soiled_water_application_limits_2026.csv`.

**Calculation contracts addressed:** `COMMONAGE_FERTILISER_GATE`,
`LESS_METHOD_GATE`, `SOILED_WATER_APPLICATION_GATE` — all three built as
real, tested calculations for the first time.

**V3 finding IDs addressed:** AF003 (CRITICAL), AF004 (HIGH), AF005
(HIGH) — all RESOLVED as calculations exist. Audit conflict #6 (dead
`slurryMethod` parameter) — the real gate that parameter should have fed
now exists; wiring `nutrients.ts`'s dead parameter into it is a follow-up
once the LESS-relevant inputs (method, land use, GSR) are available at
that call site.

**Source IDs used:** `LAW_IE_SI_588_2025` (all three).

**Tests added:** 26 (9 + 10 + 7), all grounded in named `GFT`/`AF`
references where the golden test set covers this gate directly
(commonage, LESS method); the soiled-water gate's tests are built
directly from `calculation_contracts.csv`'s own contract text since no
`GFT` row in the golden set names this gate specifically.

**Test totals/results:** Full suite: 551/551 (525 baseline + 26).

**Build/typecheck/lint status:** typecheck clean, lint clean. No
production build run this batch — no `src/app`/`src/components`/`src/store`
file touched (confirmed via `git status`), so a full Next.js build adds
no verification value beyond what typecheck already confirms.

**Known limitations:** none of the three gates are wired into any
existing screen or calculation — no production flow currently gathers
commonage status, slurry application method, or soiled-water application
history at all. Wiring each in is real, valuable follow-up work but needs
its own capture-UI phase first (per the "implement the gate contract,
document what's missing, continue" instruction for genuinely unbuilt
capture surfaces).

**Unresolved evidence gaps:** none introduced; the soiled-water gate's
`UNKNOWN` default (no application-history ledger exists) is the correct,
explicit fail-closed behaviour, not a gap needing resolution before this
gate can be considered "done" — a ledger is separate follow-up work.

**Blockers:** none.

**Next phase:** F4 — concentrate CP legal gate (`FEED_CP_LEGAL_GATE`) and
concentrate-P compliance ledger (`CONCENTRATE_P_COMPLIANCE`), continuing
`ADVERSARIAL_AUDIT_REPORT.md` §1's risk order (§1.4-§1.5).

---

## Phase F4 — Concentrate CP legal gate + concentrate-P compliance

**Objective:** `ADVERSARIAL_AUDIT_REPORT.md` §1.4-§1.5 (AF007/AF006,
HIGH): the seasonal concentrate crude-protein cap and the concentrate-feed
phosphorus contribution to a farm's statutory P allowance — both entirely
missing before this phase.

**Files created:**
- `src/domain/concentrate-gates.ts` — `checkFeedCpLegalGate`
  (`FEED_CP_LEGAL_GATE`: 14% CP cap for dairy cows/cattle ≥2 years at
  grass, 15 Apr-30 Sep only; two distinct `NOT_APPLICABLE` reason codes
  for wrong animal class vs. outside the seasonal window, matching the
  golden tests' own vocabulary exactly) and `checkConcentratePCompliance`
  (`CONCENTRATE_P_COMPLIANCE`: the real 300kg-per-92kg-manure-N threshold
  ratio derived directly from the golden tests' own worked numbers —
  `rules_statutory/concentrate_feed_compliance_2026.csv` states the rule
  qualitatively but the exact ratio is only fully specified by
  `GFT146`-`GFT148`'s worked values; excess concentrate above the scaled
  threshold contributes available P, counted against the farm's
  compliance-ledger P allowance, never mixed with the agronomic ledger).
- `src/domain/concentrate-gates.test.ts` — 15 tests, directly grounded in
  `GFT026`/`GFT027`/`GFT143`-`GFT150`.

**Scientific/statutory rules implemented:**
`rules_statutory/concentrate_feed_compliance_2026.csv` (all three rows:
`CONC_CP_GRASS_SEASON`, `CONC_P_THRESHOLD`, `CONC_P_DEFAULT_CONTENT` — the
last already implemented in Phase C's `resolveConcentratePContentKgPer100kg`,
reused here via the `pContentKgPer100kg` input rather than re-implemented).

**Calculation contracts addressed:** `FEED_CP_LEGAL_GATE`,
`CONCENTRATE_P_COMPLIANCE` — both built as real, tested calculations.

**V3 finding IDs addressed:** AF006 (HIGH), AF007 (HIGH) — RESOLVED as
calculations exist.

**Source IDs used:** `LAW_IE_SI_588_2025`.

**Tests added:** 15, one per named golden test (`GFT026`/`GFT027`/
`GFT143`-`GFT150`) plus boundary/zero-excess cases.

**Test totals/results:** Full suite: 566/566 (551 baseline + 15).

**Build/typecheck/lint status:** typecheck clean, lint clean. No
production build run — no `src/app`/`src/components`/`src/store` file
touched.

**Known limitations:** not wired into any existing screen — no feed
optimiser flow currently captures concentrate CP%, P content, or
livestock-manure N to consult these gates. `checkConcentratePCompliance`'s
threshold ratio (300kg/92kgN) is derived from the golden tests' worked
numbers rather than a literal numeric row in
`concentrate_feed_compliance_2026.csv` (that CSV states the rule
qualitatively, "threshold=300kg concentrate per92kg manure-N" appears
verbatim in `calculation_contracts.csv`'s own `equation_or_rule` column,
confirming the ratio, not inventing it) — noted for full traceability.

**Unresolved evidence gaps:** none introduced.

**Blockers:** none.

**Next phase:** F5 — fertiliser product admissibility gate
(`FERTILISER_PRODUCT_ADMISSIBILITY`, AF009), closing audit conflict #7
(inhibitor status inferred from product name).
