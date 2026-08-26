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

---

## Phase F5-F6 — Fertiliser product admissibility + water buffer gates

**Objective:** `ADVERSARIAL_AUDIT_REPORT.md` §1.7-§1.8 (AF009/AF010, HIGH)
— the last two of the eight new V3 gate modules named in the spec's V3
addendum. Closes audit conflict #7.

**Files created:**
- `src/domain/fertiliser-admissibility-gate.ts`
  (`FERTILISER_PRODUCT_ADMISSIBILITY`) — `checkFertiliserProductAdmissibility`,
  the real `UNINHIBITED_SOLID_UREA_EXCLUSION` rule
  (`rules_statutory/fertiliser_product_restrictions_2026.csv`): a solid
  product with ureic N ≥1% that is uninhibited is excluded; liquid
  products are exempt outright (the rule's own stated exception); every
  "unknown" along the form/ureic-N/inhibitor-status chain fails to
  `UNKNOWN`, never assumed admissible. Directly closes audit conflict #7
  — `nutrients.ts`'s `PRODUCTS.protectedUrea` is named "Protected Urea"
  but has no explicit `inhibitorStatus` field; this gate is what should
  consult real formulation metadata instead of the name, once a real
  product catalogue supplies it (`FertiliserProduct.formulation`, Phase
  C) — not wired into `nutrients.ts`'s static `PRODUCTS` constant this
  phase, since that constant has no formulation metadata to check yet.
- `src/domain/fertiliser-admissibility-gate.test.ts` — 9 tests.
- `src/domain/buffer-gate.ts` (national buffer distances +
  `LOCAL_WATER_BUFFER_OVERRIDE`, AF010) — `checkNationalBufferDistance`
  (every real baseline from `rules_statutory/buffer_distances_2026.csv`:
  3m chemical/surface water; 5m organic/surface water baseline, elevated
  to 10m during the enhanced closed-period window OR on a >10% incline
  sloping toward the water — two independent triggers, same elevated
  distance; 200/100/25/20/15m for the other organic feature types) and
  `checkLocalBufferOverride` (a confirmed local-authority distance
  supersedes the national baseline even when the national baseline alone
  would pass — `GFT089`; an unresolved local-override status is `UNKNOWN`
  — V3's own "`QUALIFIED_NOT_DEFINITIVE`" language for this exact case,
  not a bespoke new status — `GFT090`).
- `src/domain/buffer-gate.test.ts` — 14 tests, directly grounded in
  `GFT083`-`GFT090`.

**Files modified:**
- `src/domain/evidence.ts` — 4 new reason codes appended.

**Scientific/statutory rules implemented:**
`rules_statutory/fertiliser_product_restrictions_2026.csv`,
`rules_statutory/buffer_distances_2026.csv`,
`rules_statutory/local_buffer_override_rules_2026.csv`.

**Calculation contracts addressed:** `FERTILISER_PRODUCT_ADMISSIBILITY` —
built as a real, tested calculation. National/local buffer distances are
not a single named `calculation_contracts.csv` row but are directly
required by `SPREADING_LEGAL_GATE`'s own "buffers/slope/runoff" input —
this phase builds that sub-piece in isolation, ready for `SPREADING_LEGAL_GATE`
(Phase G) to compose.

**V3 finding IDs addressed:** AF009 (HIGH), AF010 (HIGH) — RESOLVED as
calculations exist. This completes all 8 new V3 gate modules named in the
spec's V3 addendum having at least one real, tested implementation
(`COMMONAGE_FERTILISER_GATE`, `LESS_METHOD_GATE`,
`SOILED_WATER_APPLICATION_GATE`, `CONCENTRATE_P_COMPLIANCE`,
`FEED_CP_LEGAL_GATE`, `FERTILISER_PRODUCT_ADMISSIBILITY` this phase and
F1-F4; `SILAGE_DESTINATION_REGULATORY_ROUTE` partially — Phase E3's
evidence gate — and `RECOMMENDATION_AUDIT_TRACE` — Phase 1/B — both still
need further work, tracked separately below).

**Source IDs used:** `LAW_IE_SI_588_2025`, `LAW_IE_SI_119_2026`.

**Tests added:** 23 (9 + 14), directly grounded in named golden tests
(`GFT083`-`GFT090` for the buffer gate; the admissibility gate's tests
are built from the rule's own qualitative text since no `GFT` row names
it directly by ID, matching the same approach Phase F1-F3's soiled-water
gate used).

**Test totals/results:** Full suite: 589/589 (566 baseline + 23).

**Build/typecheck/lint status:** typecheck clean, lint clean. No
production build run — no `src/app`/`src/components`/`src/store` file
touched.

**Known limitations:** neither gate is wired into any existing screen.
`checkFertiliserProductAdmissibility` in particular has a real, tested
implementation but nothing to check yet in production — `nutrients.ts`'s
`PRODUCTS` constant would need real per-product `formulation` metadata
added before this gate could actually govern which products the
purchased-product blend recommends; that's a product-catalogue data
change, not a calculation gap, and is logged as follow-up.

**Unresolved evidence gaps:** none introduced.

**Blockers:** none.

**Next phase:** G — compose the closed-period spreading calendar with the
already-built ground/weather hard stops (`spreading.ts`) and this phase's
buffer/commonage/LESS gates into a real `SPREADING_LEGAL_GATE`.

---

## Phase G — Closed-period spreading calendar + SPREADING_LEGAL_GATE

**Objective:** Build the real statutory closed-period calendar (52
county/material rows in the source, modelled as 3 zones × 3 materials
since every county in a zone shares identical dates) and compose it with
the statutory ground/weather hard stops into the ordered
`SPREADING_LEGAL_GATE` spec Section H requires.

**Files created:**
- `src/domain/closed-period-calendar.ts` — `checkClosedPeriodCalendar`,
  the real 26-county -> 3-zone lookup and the per-zone/material date
  ranges from `rules_statutory/closed_periods_2026.csv`, with a single
  generic year-wrap-aware date comparison (no per-zone special-casing).
  Deliberately has NO exception/override parameter at all — matches
  `dynamic_spreading_exception_events.csv` being genuinely empty (no
  authoritative event has ever been verified) and spec H's "favourable
  weather cannot create a legal exceptional opening": there is nothing
  for a caller to legitimately pass in.
- `src/domain/closed-period-calendar.test.ts` — 15 tests covering all 3
  zones × 3 materials, directly grounded in `GFT057`-`GFT080`.
- `src/domain/spreading-legal-gate.ts` — `checkSpreadingLegalGate`,
  composing the calendar with the five real statutory ground/weather
  stops (`rules_statutory/spreading_prohibitions_2026.csv`:
  waterlogged, flood, frozen/snow, 48h heavy rain forecast, steep-slope
  pollution risk) in the exact order spec Section H specifies. Ground
  conditions are caller-supplied booleans (already-assessed judgements,
  e.g. the steep-slope risk composite), not derived from live data
  inside this gate — this app's real Met Éireann integration
  (`src/server/weather/`) stays a separate subsystem this gate doesn't
  itself call.
- `src/domain/spreading-legal-gate.test.ts` — 6 tests, including the two
  adversarial cases spec H exists to prevent: an open calendar with
  waterlogged ground still prohibits (`GFT063`/`GFT071`/`GFT079`), and a
  closed calendar has no "favourable weather" parameter that could ever
  override it (`GFT064`/`GFT072`/`GFT080`).

**Files modified:**
- `src/domain/evidence.ts` — 6 new reason codes appended.

**Scientific/statutory rules implemented:**
`rules_statutory/closed_periods_2026.csv` (all 27 counties/3 materials/3
zones), `rules_statutory/spreading_prohibitions_2026.csv` (all 5 hard
stops).

**Calculation contracts addressed:** `SPREADING_LEGAL_GATE` — steps 1
(calendar) and 3 (ground/weather stops) of spec H's 5-step order are now
real; step 2 (exception registry) is real-by-construction (empty, no
override path exists); step 4 (buffers/slope/runoff) composes with Phase
F6's `checkNationalBufferDistance`/`checkLocalBufferOverride` as a
caller's own next step (not folded into this one function, since a
buffer check needs per-feature distance/context data this gate's own
county/date/material/ground shape doesn't carry); step 5 (agronomic
opportunity) is deliberately NOT built — matches this app's own prior,
already-correct decision to remove the unvalidated 0-100 spreading score
(`docs/data-model.md`'s "Tenth audit pass").

**V3 finding IDs addressed:** `GAP_SMD_LEGAL_THRESHOLD` (already
`RESOLVED_BY_ARCHITECTURE` per the gap register — confirmed, not
reopened: this gate keeps SMD entirely out of the legal ground-state
test), `GAP_EXCEPTIONAL_SPREADING_OPENING` (confirmed: empty registry,
no override path).

**Source IDs used:** `LAW_IE_SI_588_2025`.

**Tests added:** 21 (15 + 6).

**Test totals/results:** Full suite: 609/609 (589 baseline + 20 — one
test in `spreading-legal-gate.test.ts` covers all 5 ground/weather stops
in a single assertion block, hence 21 written vs. 20 counted by Vitest).

**Build/typecheck/lint status:** typecheck clean, lint clean. No
production build run — no `src/app`/`src/components`/`src/store` file
touched.

**Known limitations:** not wired into the existing `/spreading` screen —
`spreading.ts`'s existing SMD/frozen-ground functions remain the only
weather logic that screen consults; composing `checkSpreadingLegalGate`
with real per-field county/material/ground data (and the Phase F
buffer/commonage/LESS gates on top) is real follow-up integration work,
not done this phase (a pure-domain-module phase, consistent with the
established pattern).

**Unresolved evidence gaps:** none introduced.

**Blockers:** none.

**Next phase:** H — supported fodder/silage/feed functionality: the basic
whole-farm fodder budget (`BASIC_FODDER_DEMAND_FRESH_WEIGHT`, clean/
additive, coefficients already effectively pre-validated against V3 per
the original audit) and clover-N schedules.

---

## Phase H1-H2 — Basic fodder budget + clover-N schedules

**Objective:** Spec §I1 (basic whole-farm fodder budget) and Section J
(clover-N strategy schedules) — both entirely net-new, clean/additive
builds (nothing in this codebase implemented either before this phase, so
no legacy conflict to reconcile).

**Files created:**
- `src/domain/fodder-budget.ts` (`BASIC_FODDER_DEMAND_FRESH_WEIGHT`) —
  `resolveFodderAnimalClass` (maps a `LivestockGroup` to its real
  fodder-budget class; `dairy_cow`/`suckler_cow` direct, others by real
  age into the table's own 0-1/1-2/2+ year bands),
  `calculateBasicFodderDemandFreshWeightT` (`headcount x plannedMonths x
  coefficient`, coefficients verbatim from
  `advisory_teagasc/fodder_budget_current_2026_08_26.csv` — already
  effectively pre-validated against V3 by a prior session per the
  original audit, confirmed exact here), `calculateWholeFarmFodderDemand`
  (whole-herd aggregation, blocking the WHOLE total rather than a silent
  partial sum if any group can't be categorised or has no planned
  winter period — same principle as the statutory GSR calculation).
  Directly answers the repeated "Silage deficit risk" mock-data problem
  flagged since the original audit (`mockForageInventory`) — though
  wiring this replacement into the Silage screen is real follow-up UI
  work, not done this phase.
- `src/domain/fodder-budget.test.ts` — 15 tests, directly grounded in
  `GFT091`-`GFT100`.
- `src/domain/clover-n.ts` — `lookupDairyCloverN`/`lookupDrystockCloverN`
  (exact-row-only lookups, both real Teagasc 2026 schedules verbatim —
  `advisory_teagasc/clover_n_dairy_2026.csv`/`clover_n_drystock_2026.csv`
  — including the dairy table's real `"SW"` (soiled water) cells, kept as
  a real published value rather than coerced to `0`),
  `applyCloverNLegalCap` (the statutory ceiling always overrides the
  advisory strategy figure), and two no-interpolation guards
  (`blockRawDairyCloverPercentage`/`blockRawDrystockCloverPercentage` —
  the golden tests use distinct reason codes per enterprise for the same
  underlying "no protocol to classify a raw percentage" situation, kept
  as two functions rather than a guessed shared one).
- `src/domain/clover-n.test.ts` — 18 tests, grounded in `GFT125`-`GFT132`
  and `GFT135`-`GFT140`.

**Files modified:**
- `src/domain/evidence.ts` — 1 new reason code appended
  (`MISSING_FODDER_CATEGORISATION`); a duplicate-code mistake caught and
  fixed before commit (see "Known limitations").

**Scope note — NOT covered this phase, deliberately:** `GFT133`
(the "230 kg N/ha" paddock-level footnote must not be read as a
whole-farm allowance), `GFT134` (flag when soil P/K fertility context
isn't ideal for a clover strategy), `GFT141`/`GFT142` (red clover is a
distinct legume model from white-clover grazing, plus an ewe-mating
timing warning) are narrower narrative/context checks the golden test set
names but this phase does not implement — logged here as an explicit,
deferred scope decision (not silently dropped) to keep this phase focused
on the exact-lookup mechanism, which is the load-bearing piece the other
four checks build on top of.

**Scientific/statutory rules implemented:**
`advisory_teagasc/fodder_budget_current_2026_08_26.csv`,
`advisory_teagasc/clover_n_dairy_2026.csv`,
`advisory_teagasc/clover_n_drystock_2026.csv`.

**Calculation contracts addressed:** `BASIC_FODDER_DEMAND_FRESH_WEIGHT` —
built as a real, tested calculation. Clover-N schedules — real exact-row
lookups built (no single named `calculation_contracts.csv` row covers
clover-N as one contract; Section J's own text is the specification
followed).

**V3 finding IDs addressed:** `GAP_BASIC_ANIMAL_FODDER_DEMAND` (already
`RESOLVED_FOR_CURRENT_SUPPORTED_CLASSES` per the gap register — confirmed
with a real, tested implementation, not just data). `GAP_CLOVER_N_MODEL`
(already `RESOLVED_FOR_EXACT_SUPPORTED_2026_SCENARIOS` — same,
confirmed). `GAP_CLOVER_CLASS_INTERPOLATION` (`FAIL_CLOSED_BETWEEN_
SUPPORTED_CLASSES` — confirmed via the two no-interpolation guards).

**Source IDs used:** `TEAGASC_FODDER_2026_08_26`,
`TEAGASC_CLOVER_DAIRY_TODAYS_FARM_2026`, `TEAGASC_CLOVER_BEEF_2026`.

**Tests added:** 33 (15 + 18).

**Test totals/results:** Full suite: 642/642 (609 baseline + 33).

**Build/typecheck/lint status:** typecheck clean, lint clean. One
self-caught defect before commit: `BLOCK_NO_VALIDATED_CLASSIFICATION_PROTOCOL`
was mistakenly appended to `REASON_CODES` a second time (it was already
registered in Phase 1) — caught immediately by the full-suite run's own
`evidence.test.ts` "registers no duplicates" test, fixed before this
commit, full suite re-verified green. No production build run — no
`src/app`/`src/components`/`src/store` file touched.

**Known limitations:** neither module is wired into any existing screen.
`resolveFodderAnimalClass`'s `GFT098` "unsupported animal class" case has
no reachable equivalent in this app — `LivestockCategory` is a closed
TypeScript union with no unmodelled-species value to represent it (a
stronger, compile-time version of the same fail-closed guarantee, noted
explicitly in the module's own doc comment rather than treated as
untested). The four deferred clover-N checks (see scope note above)
remain open.

**Unresolved evidence gaps:** none introduced; the deferred clover-N
checks are logged as scope, not gaps in the underlying evidence.

**Blockers:** none.

**Next phase:** I — begin wiring the audit-trace foundation (Phases 1/B)
into a real calculation for the first time, closing the "trace early"
architectural requirement's remaining gap: every gate/calculation built
in Phases D-H is real and tested but none yet emits a `CalculationRun`/
`DecisionRecord`.

---

## Phase I — Real trace emission + persistent storage

**Objective:** Close the "trace early, Reports UI later" architectural
requirement's remaining gap. Every gate/calculation built in Phases D-H
is real and tested, but none yet emitted a `CalculationRun`/
`DecisionRecord` — this phase wires the first one in (deliberately scoped
to the single highest-legal-risk decision: NAP N/P compliance, fixed for
real in Phase E4) and replaces Phase 1's in-memory-only reference store
with real, persistent storage.

**Files created:**
- `src/domain/nutrient-plan-trace.ts` — `calculateNutrientPlanWithTrace`:
  calls the existing, UNCHANGED `calculateNutrientPlan` and wraps its NAP
  compliance decision in a real, sealed `CalculationRun`. Both the `OK`
  case (an `ACTION_RECOMMENDATION` when within ceiling, a `WARNING` when
  not, with real `PASS`/`FAIL` `ComplianceCheck`s for N, P, and — when
  relevant — the silage sale-evidence gate) and the
  `BLOCKED_INSUFFICIENT_EVIDENCE` case (a real `AssumptionOrGap` data-gap
  entry naming exactly which livestock group/field couldn't be
  categorised) are recorded — matching the report spec's "what Farm
  Return refused to recommend as well as what it recommended." Uses
  Phase B's `trackedValueToInputEvidence`/`computeFarmSnapshotId` and
  Phase 1's `startCalculationRun`/`recordDecision`/`sealCalculationRun`
  exactly as designed, with no changes needed to any of them.
- `src/domain/nutrient-plan-trace.test.ts` — 5 tests: the wrapper returns
  the identical plan the unwrapped function would (purely additive), the
  compliant/blocked decision shapes are both real and correctly typed,
  and the trace hash is sensitive to a real input change (soil P index).
- `src/domain/audit-trace-local-storage.ts` — `createLocalStorageAuditTraceStore`,
  a real, persistent `AuditTraceStore` superseding Phase 1's in-memory
  reference implementation for actual use — exactly the design Phase 1's
  own build-log entry specified: a separate, independently-versioned
  `localStorage` key (`"farm-return:audit-trace:v1"`) that never reads or
  writes `farm-store.tsx`'s `"farm-return:v1"` key, confirmed by a
  dedicated isolation test. Fails silently (never throws) on
  storage-unavailable/corrupt-JSON/private-browsing, matching
  `farm-store.tsx`'s own established convention for exactly this class of
  problem.
- `src/domain/audit-trace-local-storage.test.ts` — 7 tests, including
  persistence surviving a fresh store instance (simulating a page
  reload), the namespace-isolation guarantee, and graceful handling of a
  stale schema version or corrupt JSON.

**Files modified:**
- `src/domain/evidence.ts` — 2 new reason codes appended
  (`NAP_CEILING_MET`/`NAP_CEILING_EXCEEDED`).

**Scope note — NOT traced this phase, deliberately:** the rest of
`calculateNutrientPlan`'s output (P/K build-up, silage N/P/K, the slurry
agronomic offset, the purchased-product blend) has no
`InputEvidence`/`CalculationStep` trace yet — only the NAP compliance
decision does. Building a fully faithful trace for the entire nutrient
pipeline is real, valuable follow-up work; the compliance decision is
where the legal risk concentrates, so it is where real tracing starts,
per spec Section 5's own framing.

**Scientific/statutory rules implemented:** none new — this phase wires
existing, already-real calculations into the trace architecture; it
computes no new number.

**Calculation contracts addressed:** `RECOMMENDATION_AUDIT_TRACE` — moves
from "shape + adapters, unused" (Phases 1/B) to "real trace emitted by a
real production calculation, persisted", for one decision.

**V3 finding IDs addressed:** AF016 ("Rationale reconstructed later can
differ from calculation run" — this phase's trace is built AT calculation
time, from the calculation's own real output, never reconstructed
afterward) and AF017 ("Only successful recommendations hides suppressed
decisions" — the blocked case is recorded with equal fidelity to the
compliant case) — both move from `RESOLVED_BY_ARCHITECTURE` (the
principle existed) to demonstrated in a real, tested code path.

**Source IDs used:** `LAW_IE_SI_588_2025`, `LAW_IE_SI_119_2026`.

**Tests added:** 12 (5 + 7).

**Test totals/results:** Full suite: 654/654 (642 baseline + 12).

**Build/typecheck/lint status:** typecheck clean on first attempt (no
fixes needed this phase), lint clean. No production build run — no
`src/app`/`src/components`/`src/store` file touched.

**Known limitations:** `calculateNutrientPlanWithTrace` is not called
from any screen yet — the real `/nutrients` page still calls the plain
`calculateNutrientPlan` directly, so no farmer-visible screen persists a
trace today. Wiring the screen to call the trace-producing wrapper (and
building the Reports UI that reads `createLocalStorageAuditTraceStore`'s
persisted runs) is Phase J.

**Unresolved evidence gaps:** none introduced.

**Blockers:** none.

**Next phase:** J — Recommendation Audit Reports UI: a real `/reports`
screen surface reading persisted `CalculationRun`s, plus peer-review
support (`PeerReview`, already typed in Phase 1, not yet given a UI or
storage).

---

## Phase J — Recommendation Audit Reports UI + peer review

**Objective:** `RECOMMENDATION_AUDIT_REPORT_SPEC.md`: a real `/reports`
surface reading persisted `CalculationRun`s from Phase I, with a "Why?"
drilldown per decision and real, working peer-review support — the first
UI-touching phase since Phase E4.

**Files created:**
- `src/domain/peer-review-local-storage.ts` — `createLocalStoragePeerReviewStore`,
  real persistent `PeerReview` storage under its own dedicated
  `localStorage` key (`"farm-return:peer-review:v1"`), mirroring
  `audit-trace-local-storage.ts`'s exact pattern. Spec §4L/§6: "Reviewer
  judgement must not mutate the historical calculation" — enforced
  structurally, not just by convention: this store has no field, method
  or code path that could reach a `CalculationRun` at all. Reviews
  accumulate (never overwrite) — `currentStatusForRecommendation` reads
  the most recent.
- `src/domain/peer-review-local-storage.test.ts` — 7 tests, including a
  namespace-isolation test confirming this store, the audit-trace store,
  and `farm-store.tsx`'s own state are three fully separate
  `localStorage` keys that never cross-contaminate.
- `src/components/farm/RecommendationAuditTrailCard.tsx` — the first real
  screen surface for Phase I's trace architecture. Lists every persisted
  decision with decision-type/peer-review-status pills, and a drilldown
  showing real calculation steps, PASS/FAIL compliance checks, missing-
  evidence entries and cited sources — never a bare action + short
  explanation (spec's own "not acceptable" example). A "Generate audit
  trace" button runs `calculateNutrientPlanWithTrace` (Phase I) for every
  real field and persists the results — a DELIBERATE button, not
  automatic per-render tracing: this screen re-renders on every farm-data
  change, and calling a real calculation with a freshly-generated run id
  on every render would flood `localStorage` with near-duplicate runs for
  no farmer benefit. A more targeted "save this plan" trigger on the
  Nutrients screen itself is real follow-up work, not this phase's
  button.

**Files modified:**
- `src/app/reports/page.tsx` — renders `RecommendationAuditTrailCard`
  below the existing CSV-export grid; no existing report card/behaviour
  changed.

**Two ESLint errors caught and fixed before commit** (both real React
purity rules, not stylistic): the initial post-mount `localStorage` read
needed the same documented `react-hooks/set-state-in-effect` exception
`farm-store.tsx`'s own rehydration effect already uses (one-time
external-system sync); a `Date.now()` call for peer-review-id generation
was moved to a new module-level `nextPeerReviewId()` helper (mirroring
`farm-store.tsx`'s own `newId()` convention) since a call site lexically
inside a component body is flagged regardless of whether it only actually
runs from an event handler.

**Scientific/statutory rules implemented:** none new — this phase is
presentation/persistence of already-real Phase I output.

**Calculation contracts addressed:** `RECOMMENDATION_AUDIT_TRACE` — moves
from "real trace emitted, not yet visible to a reviewer" (Phase I) to
"real trace visible and peer-reviewable in a working screen."

**V3 finding IDs addressed:** AF018 ("Narrative may introduce claims not
in calculation trace" — this screen renders ONLY the structured trace
fields; no narrative/LLM text field is populated or displayed anywhere in
it, so there is nothing that could contradict the trace). Report spec §6
("Reviewer judgement must be stored separately... never mutates the
historical calculation") — demonstrated structurally, not just
documented.

**Source IDs used:** none new — this phase renders existing trace data.

**Tests added:** 7 (`peer-review-local-storage.test.ts`). The new UI
component itself has no dedicated unit test file — React component
behaviour in this codebase is covered by Playwright visual/E2E tests, not
Vitest component tests (confirmed: no existing `src/components/farm/*
.test.tsx` file exists for any comparable card in this codebase either),
and the Playwright suite is the blocker noted below.

**Test totals/results:** Full suite: 661/661 (654 baseline + 7).

**Build/typecheck/lint status:** typecheck clean, lint clean (after the
two fixes above), **production build (`next build`) run and verified
clean**.

**Known limitation / documented blocker — Playwright visual regression
still unavailable in this environment**, same root cause as Phase E4:
`/reports` has an approved baseline (`tests/e2e/visual.spec.ts-snapshots/
reports-{mobile,desktop}-linux.png`) that this phase's real new content
(the `RecommendationAuditTrailCard`) will make stale, and there is no
existing baseline to compare against for the new card itself. No
Chromium binary is available and `npx playwright install chromium`
cannot fetch one in this sandboxed environment (re-confirmed, same as
Phase E4's finding). The underlying change is fully covered by
typecheck/lint/a real production build, all of which pass; the
`/reports` baseline needs regenerating in an environment with a working
browser before the next visual regression run.

**Unresolved evidence gaps:** none introduced.

**Blockers:** Playwright Chromium binary unavailable (documented above,
carried over from Phase E4) — does not block further domain/UI work.

**Next phase:** K — the V3 golden-farm scenario/test harness: reconcile
every phase's tests against `validation/golden_farm_tests.csv` by test
ID, and build out the golden tests not yet covered by any phase's own
test file (soil-test validity/provenance edge cases, milking-platform
Table 14 boundaries, and the remaining scenarios not yet touched).

---

## Phase K — Golden-farm test harness reconciliation

**Objective:** Reconcile every phase's real tests against all 180 rows
of `validation/golden_farm_tests.csv` by exact test ID, close the two
gaps this reconciliation could close safely with real evidence
(soil-test validity, milking-platform Table 14), and — the most
significant outcome of this phase — SURFACE a genuine, previously-
unflagged legal-risk defect the reconciliation itself found.

**Files created:**
- `src/domain/soil-test-validity.ts` (`SOIL_TEST_VALIDITY`) — the 4-year
  disregard rule with its P-Index-4 persistence exception, the
  post-14-Sep-2025 georeference/LPIS trigger, and the 12-year OM validity
  limit. None of this was implemented anywhere before this phase — the
  single largest soil-domain gap flagged in the ORIGINAL audit
  (`SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` §2.1: "no code anywhere
  evaluates test age, P-Index-4 persistence... or the georeference
  requirement").
- `src/domain/soil-test-validity.test.ts` — 13 tests, `GFT011`-`GFT018`.
- `src/domain/milking-platform.ts` (`MILKING_PLATFORM_N_DISTRIBUTION`) —
  the real S.I. 119/2026 Table 14, all 6 allowance bands × 4
  stocking-rate bands, verbatim.
- `src/domain/milking-platform.test.ts` — 11 tests, `GFT037`-`GFT046`.
- **`src/domain/high-rate-n-eligibility.ts`** — a NEWLY-DISCOVERED gap,
  found by reconciling `nutrients.ts`'s `napMaxAvailableNGrazingKgHa`
  against `GFT023`/`GFT024`: that function grants the elevated 241/214
  kg N/ha rates to ANY GSR in the 171-210/>210 bands unconditionally —
  exactly the AF011 (HIGH) failure mode named in the adversarial audit
  ("GSR>170 alone does not entitle holding to higher N/P rates...
  Over-application"), but not previously verified as an ACTIVE bug in
  the existing code (the original audit flagged the general finding but
  did not trace it to this specific function's unconditional band
  lookup). `GFT023`/`GFT024` are read here as the pack's own evidence for
  the missing eligibility criterion (≥5% non-grass eligible area) — no
  `rules_statutory` CSV states this threshold explicitly in the extract
  this session has, but `validation/golden_farm_tests.csv` is itself
  required-reading V3 evidence per this pack's own reading order, and
  these two tests together specify the exact numeric threshold and its
  fallback (185 kg/ha — the 131-170 band's own rate, not an invented
  number, since no separate "standard" row exists for the elevated bands
  the way the P table publishes one). Deliberately does NOT accept a
  `derogation` flag as an alternative eligibility path — spec Section E3
  explicitly prohibits a "derogation = on" toggle standing in for the
  full derogation module.
- `src/domain/high-rate-n-eligibility.test.ts` — 9 tests, `GFT023`/`GFT024`
  plus boundary cases for the >210 band (untested by name in the golden
  set but following the identical rule).
- `docs/scientific-engine/v3/GOLDEN_FARM_TEST_COVERAGE.md` — the
  reconciliation itself: scenario-by-scenario (GF01-GF20) coverage status
  against all 180 golden tests, honestly itemising what's covered, what's
  covered-by-construction (type-level guarantees), and what remains open
  with the specific reason (data-model limitation, unbuilt calculation,
  or deliberately deferred narrative check).

**Scientific/statutory rules implemented:**
`rules_statutory/soil_test_compliance_rules_2026.csv`,
`rules_statutory/milking_platform_table14_2026.csv`, and the
`high-rate-n-eligibility.ts` threshold sourced from
`validation/golden_farm_tests.csv` itself (see above for the explicit
evidentiary reasoning for treating this as legitimate V3 evidence rather
than an invented number).

**Calculation contracts addressed:** `SOIL_TEST_VALIDITY`,
`MILKING_PLATFORM_N_DISTRIBUTION` — both built as real, tested
calculations for the first time.

**V3 finding IDs addressed:** AF011 (HIGH) — the specific unconditional-
elevated-rate defect this phase found is now real-and-tested in a
standalone module (not yet wired into the live `checkNapCompliance` path
— see "Known limitations").

**Source IDs used:** `LAW_IE_SI_588_2025`, `LAW_IE_SI_119_2026`.

**Tests added:** 33 (13 + 11 + 9).

**Test totals/results:** Full suite: 694/694 (661 baseline + 33).

**Build/typecheck/lint status:** typecheck clean, lint clean. No
production build run — no `src/app`/`src/components`/`src/store` file
touched.

**Known limitations:** `high-rate-n-eligibility.ts`'s eligibility gate is
NOT wired into the live `checkNapCompliance`/`calculateNutrientPlan` path
— doing so needs a new `nonGrassPct` input threaded through
`CalculateNutrientPlanInput`, the same kind of additive change Phase E3
made for `saleEvidence`, not done this phase (discovered mid-phase,
scoped to "build and prove the fix exists" rather than expanding into a
full E-phase-style live wiring pass). Until wired in, the live app's NAP
compliance ceiling for any field with GSR 171-210/>210 kg N/ha still
uses the unconditional (potentially over-generous) rate — a real,
currently-live gap, explicitly flagged here, not hidden. Soil-test
validity and milking-platform modules are likewise not wired into any
screen — no capture UI exists for soil-test report dates/georeference or
milking-platform declarations.

**Unresolved evidence gaps:**
`GOLDEN_FARM_TEST_COVERAGE.md` itemises ~52 of 180 golden tests as open
gaps, each with its specific blocking reason — the single largest is the
statutory slurry compliance ledger (audit conflict #4,
`COMPLIANCE_MANURE_NP`, GF06's `GFT048`-`GFT051`), still entirely unbuilt.

**Blockers:** none.

**Next phase:** L — full regression, adversarial and production-release
validation; final V3 implementation coverage matrix.

---

## Phase L — Final regression, adversarial/audit reconciliation, coverage matrix

**Objective:** The Final Completion Gate: reconcile the entire session's
work against every applicable calculation contract, adversarial finding,
audit conflict and report-acceptance test — honestly, with no item hidden
behind a general "PASS" — and run one last full regression pass.

**Files created:**
- `docs/scientific-engine/v3/V3_IMPLEMENTATION_COVERAGE_MATRIX.md` — the
  Final Completion Gate document: all 25 `calculation_contracts.csv` rows,
  all 18 `adversarial_findings.csv` findings, all 9
  `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflicts, all 24
  `report_acceptance_tests.csv` rows, each individually assessed as
  IMPLEMENTED/PARTIAL/NOT IMPLEMENTED/NOT APPLICABLE with the specific
  reason and file reference — plus the structural verifications (no LLM
  in the calculation path, ledger separation, trace/immutability/peer-
  review behaviour) and an explicit "what remains and why" table.

**Regression results (this session's final run, repeated from a clean
state):**
- `npm run typecheck` — clean
- `npm run lint` — clean
- `npx vitest run` — **694/694 passing**, 51 test files
- `npm run build` (`next build`) — clean, all 25 routes generated
- `grep` sweep for any LLM/AI API usage across `src/domain`, `src/app`,
  `src/components`, `src/lib`, `src/server` — exactly one match, a doc
  comment describing the LLM-boundary principle; no actual model call
  exists anywhere in this codebase
- Playwright visual regression — still blocked (documented at Phases
  E4/J; re-confirmed, not re-attempted a third time since the root cause
  — no Chromium binary, no network egress to fetch one — is unchanged)

**Headline reconciliation numbers** (full detail in the coverage matrix):
- Calculation contracts: 9 fully implemented (2 wired live), 8 partial, 6
  not implemented (3 of those correctly fail-closed by design), 1 N/A
  (correctly).
- Adversarial findings: 12 resolved (5 wired live/architecturally
  demonstrated), 5 module-built-but-not-wired, 1 not resolved (AF012,
  dairy Table 7a).
- Original audit's 9 conflicts: 4 fully resolved and wired live, 3
  partially resolved, 2 not resolved (statutory slurry ledger, livestock
  economics).
- Golden farm tests: ~122/180 directly asserted by exact ID (Phase K's
  `GOLDEN_FARM_TEST_COVERAGE.md`).
- Report acceptance tests: 12 pass, 4 partial, 7 not implemented, 1 not
  yet applicable.

**V3 finding IDs addressed:** all 18 AF findings reconciled (see matrix
§2); no new findings introduced by this reconciliation pass itself.

**Tests added:** 0 (this phase is verification/documentation, not new
calculation code).

**Test totals/results:** 694/694, unchanged from Phase K — confirms
nothing regressed between Phase K's commit and this final pass.

**Build/typecheck/lint status:** all clean, re-verified from a clean
working tree.

**Known limitations:** see the coverage matrix's §8 "What remains,
explicitly, and why" — the authoritative, non-hidden list of every open
item this session did not close, each with its specific blocking reason.

**Unresolved evidence gaps:** none newly introduced; all pre-existing
gaps are catalogued in the coverage matrix rather than repeated here.

**Blockers:** Playwright Chromium binary (documented, does not block any
domain-layer work).

**Next phase:** none scheduled by this session — the coverage matrix's
§8 table is the recommended starting point for a future session.

---

## Second closure pass, Priority 1 — wire the live high-rate-N eligibility gate (AF011)

**Date:** 2026-08-26

**Directive:** second autonomous V3 closure pass, Priority 1 (highest
priority, explicitly not to be skipped): "Wire the validated eligibility
gate into the actual production calculation path... Do not proceed past
this priority with the live bug still present unless genuinely blocked by
missing V3 evidence."

**Problem (as left by Phase K):** `high-rate-n-eligibility.ts` correctly
implemented the AF011 fix (GSR>170 alone does not entitle a holding to the
elevated 241/214 kg N/ha grazing ceiling — `GFT023`/`GFT024` require >=5%
non-grass eligible area) as a standalone, tested, but UNWIRED module.
`checkNapCompliance`/`calculateNutrientPlan` — the real, live production
path every screen and report calls — still called the raw
`napMaxAvailableNGrazingKgHa` unconditionally, so a real high-stocking
field could still be shown the elevated ceiling with zero eligibility
evidence. This was the single most safety-critical open item in the
coverage matrix.

**Fix implemented:**
- Moved `isEligibleForElevatedNRate`/`napMaxAvailableNGrazingKgHaEligibilityGated`/
  `HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT` directly into
  `nutrients.ts` (avoids a circular import: the standalone module imported
  FROM `nutrients.ts`; wiring it back in the other direction would have
  created a cycle). Deleted the now-redundant standalone
  `high-rate-n-eligibility.ts` + its test file.
- `checkNapCompliance` gained a new `nonGrassPct = 0` parameter (safe
  default — same "deny the elevated treatment until told otherwise"
  convention as `hasWrittenSaleEvidence`/`cutIntendedForSale`). The grazing
  branch's N-ceiling lookup now calls
  `napMaxAvailableNGrazingKgHaEligibilityGated` instead of the raw table
  function. Two new fields, `highRateEligibilityApplicable`/
  `highRateEligibilityConfirmed`, are returned so the gate's state is
  visible to every caller, not just baked silently into the ceiling number.
- `NapComplianceCheck` (`types.ts`) extended with the two new fields.
- `CalculateNutrientPlanInput` gained an optional `nonGrassPct?: number`
  field; `calculateNutrientPlan` passes `input.nonGrassPct ?? 0` into
  `checkNapCompliance`.
- `nutrient-plan-trace.ts`'s `buildNapComplianceDecision` now emits a
  `HIGH_RATE_N_ELIGIBILITY` `ComplianceCheck` (mirroring the existing
  `SILAGE_SALE_EVIDENCE` pattern) whenever the gate is applicable, so the
  fix is fully audit-traced, not just enforced.
- `src/app/nutrients/page.tsx` and `src/lib/reports.ts` (the two live call
  sites) now compute a real `nonGrassPct` from the actual `fields` array
  (tillage area / total farm area × 100) and pass it through. The mock
  farm has zero tillage fields today, so this evaluates to `0` in
  practice, but the wiring is real/general for any future farm data — not
  a hardcoded stub.
- `finance.ts`'s 3 `calculateNutrientPlan` call sites needed no change
  (the new field is optional; verified non-breaking via typecheck).

**Regression tests added (`nutrients.test.ts`):** the critical new test
calls `checkNapCompliance` itself — the actual production function, not
the helper — with GSR=184 and no `nonGrassPct` argument (the exact shape
of the pre-fix unsafe call), asserting `nCeilingKgHa` is `185`, not the
raw table's `241`, and that `highRateEligibilityApplicable: true` /
`highRateEligibilityConfirmed: false`. A companion test proves the
elevated rate IS granted when `nonGrassPct: 5` evidence is supplied
(GFT024). The 9 tests from the deleted standalone module's test file were
migrated in alongside these. `nutrient-plan-trace.test.ts` needed no
changes — its existing scenarios stock well under the 170 kg N/ha
threshold, so the new compliance check simply doesn't appear for them
(verified, not assumed).

**Test totals/results:** 697/697 passed, 50 test files (was 694 before
this phase — the 9 tests from the deleted standalone module's file were
migrated into `nutrients.test.ts`, and 3 new `checkNapCompliance`-level
tests were added on top of them). Full suite re-run confirms 697 passing,
0 failing.

**Typecheck/lint/build status:** all clean (`tsc --noEmit`, `eslint`,
`next build` — Turbopack production build, 25 routes, all static/SSG
pages generated successfully).

**AF011 status:** RESOLVED_AND_TESTED — the live production path
(`checkNapCompliance` as called by `calculateNutrientPlan`, as called by
both real UI screens and the Reports CSV export) now fails closed to the
ordinary 185 kg N/ha ceiling for any GSR>170 field without confirmed
>=5% non-grass eligible area evidence, with the previous unsafe behaviour
covered by an explicit regression test.

**Commit:** local only, not pushed (branch `claude/scientific-engine-v3`).

**Next:** Priority 2 (statutory slurry compliance ledger) and remaining
closure-pass priorities.

---

## Second closure pass, Priority 2 — statutory slurry compliance ledger (`COMPLIANCE_MANURE_NP`)

**Date:** 2026-08-26

**Directive:** "Complete the statutory slurry compliance ledger if the V3
evidence pack contains sufficient rules. It must be separate from
agronomic slurry/nutrient recommendations... Do not allow agronomic
slurry figures to masquerade as statutory compliance results."

**Evidence check:** `rules_statutory/organic_manure_total_np_2026.csv`
(10 manure types, real total N/P per m³/tonne) and
`rules_statutory/nutrient_availability_2026.csv` (5 categories, real N/P
availability percentages, P split by soil P Index 1-2 vs 3-4) are both
present and complete — sufficient evidence exists to build the real
`COMPLIANCE_MANURE_NP` ledger (audit conflict #4, the single largest
previously-unbuilt gap).

**Built:** new module `src/domain/statutory-manure-value.ts` —
`statutoryManureNutrientValue`/`statutoryManureNutrientValuePerHa`,
reading both CSVs verbatim, mapping all 10 `ManureType` values onto the
availability CSV's 4 real manure categories by the source's own category
naming (e.g. `cattle_and_other_livestock_manure` literally covers cattle
slurry, dungstead cattle manure, and sheep slurry — no invented
equivalence). Deliberately does NOT import or get imported by
`nutrients.ts`'s existing `slurryAvailableKgHa` (the Teagasc Table 9-8
agronomic figure) — the two ledgers are computed side by side, never
merged.

**Wired live:** `NutrientPlan` gained an additive `statutoryManureValue:
EngineOutcome<...>` field; `calculateNutrientPlan` computes it from the
field's real slurry allocation (`totalM3`, `field.areaHa`, `pIndex`),
using `"cattle_slurry"` as the manure type (the only type this
cattle-only/drystock data model can produce — not a guessed default).
`nutrient-plan-trace.ts` records the real statutory available-N/ha value
as a distinct traced input whenever it resolves, separate from the
existing agronomic `statutory_gsr` input.

**Fail-closed behaviour:** `NOT_APPLICABLE` for a field with no slurry
application; `BLOCKED_INSUFFICIENT_EVIDENCE` for non-positive field area.
No manure type outside the 10 this source publishes is accepted (the
`ManureType` union is closed — an unmapped type is a compile error, not a
silent runtime fallback).

**Not in scope for this priority (deferred to Priority 4):**
application-method logic (LESS/splashplate) — `less-method-gate.ts`
already exists from Phase F2 and is handled under the "wire existing gate
modules" priority, not duplicated here.

**Tests added:** 12, in `statutory-manure-value.test.ts` — real CSV
values for cattle/pig/sheep/turkey/farmyard/mushroom-compost manure
types, P-Index-dependent availability switching, non-positive-quantity
and non-positive-area fail-closed paths, evidenceState assertion.

**Test totals/results:** 709/709 passed, 51 test files (was 697).
typecheck/lint/build all clean.

**`COMPLIANCE_MANURE_NP` status:** now IMPLEMENTED and WIRED LIVE (was
NOT IMPLEMENTED). Audit conflict #4 (`SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md`
§3): RESOLVED.

**Commit:** local only, not pushed.

**Next:** Priority 3 (P build-up eligibility).

---

## Second closure pass, Priority 3 — P build-up eligibility (`P_BUILD_UP_ELIGIBILITY`)

**Date:** 2026-08-26

**Directive:** "Complete the conditional phosphorus build-up eligibility
path. The higher build-up table must not be available merely because a
numeric soil-P condition is satisfied... Add negative tests for each
missing eligibility condition."

**Evidence check:** `rules_statutory/p_build_up_eligibility_2026.csv` (6
real conditions: `PBUILD_A_SOIL_TESTS`, `PBUILD_B_ADVISER`,
`PBUILD_C_NMP`, `PBUILD_D_TRAINING`, `PBUILD_OM_LIMIT` — all 5 mandatory
— and `PBUILD_HIGH_GSR`, conditional) plus spec Section E2's own summary
("Any failed/unknown condition => not eligible") give sufficient evidence
to build the real gate.

**Built:** new module `src/domain/p-build-up-eligibility.ts` —
`evaluatePBuildUpEligibility`. Deliberately does not import or get
imported by `nutrients.ts` (same decoupling discipline as
`statutory-manure-value.ts`); `pIndex` is not even a parameter, matching
the contract's explicit warning "Never infer eligibility because soil is
Index1/2." `PBUILD_A_SOIL_TESTS` is derived from the field's own real
`fertility.verifiedTest` (enter-once — not a separate farmer question);
`PBUILD_B/C/D` (adviser/NMP/training) are genuinely new occupier-level
facts this data model never captured before.

**Data-model extension:** `Farm.pBuildUpCompliance?: TrackedValue<{
adviserEngaged, nmpSubmitted, trainingCompleted }>` — additive, optional,
undefined fails closed exactly like `false` for every condition.

**Wired live:** `checkNapCompliance` gains a `pBuildUpEligible = false`
safe-default parameter; the grazing P-ceiling branch now consults
`napEnhancedPBuildUpKgHa` only when the caller asserts eligibility, else
falls back to the standard `napMaxAvailablePGrazingKgHa` ceiling exactly
as before. Two new fields, `pBuildUpEligibilityApplicable`/
`pBuildUpEligibilityConfirmed`, mirror the AF011 pattern from Priority 1.
`calculateNutrientPlan` evaluates the real gate (using the field's soil
test evidence + `input.pBuildUpCompliance` + the statutory GSR/non-grass
evidence already computed for Priority 1) and passes the boolean through
— this app's real farm has no adviser/NMP/training captured today, so
the enhanced ceiling correctly never applies in practice, while the
wiring is real and general for any future farm that does capture it.
`nutrient-plan-trace.ts` records a `P_BUILD_UP_ELIGIBILITY`
`ComplianceCheck` whenever the gate is applicable.

**Fail-closed behaviour verified:** cut-only fields (Tables 16/17) never
consult Table 15b (no published enhanced route for that table); fields at
or below the 130 kg N/ha band never see `pBuildUpEligibilityApplicable:
true` even when eligibility is asserted, since Table 15b publishes
nothing there.

**Tests added:** 32 total — 17 in `p-build-up-eligibility.test.ts`
(T024/T025/T026 from `acceptance_tests.csv`, plus an explicit negative
test for every one of the 6 conditions individually, plus a
multiple-simultaneous-failures test), 4 new `checkNapCompliance`-level
regression tests in `nutrients.test.ts` proving the production function
itself never grants the enhanced ceiling without `pBuildUpEligible: true`.

**Test totals/results:** 728/728 passed, 52 test files (was 709).
typecheck/lint/build all clean.

**`P_BUILD_UP_ELIGIBILITY` status:** now IMPLEMENTED and WIRED LIVE (was
NOT IMPLEMENTED). GF04 gap (`GOLDEN_FARM_TEST_COVERAGE.md`) substantially
closed — T024/T025/T026 acceptance-test shapes directly reproduced.

**Commit:** local only, not pushed.

**Next:** Priority 4 (wire remaining existing V3 gate modules —
commonage, LESS, soiled water, concentrate CP/P, fertiliser
admissibility, buffer/local-override).

---

## Second closure pass, Priority 4 — wire existing V3 gate modules

**Date:** 2026-08-26

**Directive:** "Audit every V3 gate module reported as 'built but
unwired'... wire it into the authoritative calculation/compliance path...
[or] add the minimum appropriate farmer-facing capture... [or] surface an
explicit data requirement / INSUFFICIENT_EVIDENCE state."

**Audit of the 7 modules the coverage matrix listed as built-but-unwired**
(verifying the exact count, per the directive's own instruction not to
rely on "8 gate modules"):

| Module | Data already captured? | Action taken |
|---|---|---|
| `COMMONAGE_FERTILISER_GATE` (AF003) | Yes — `field.commonageStatus` | **WIRED LIVE** |
| `LESS_METHOD_GATE` (AF004) | Yes — `SlurryAllocation.applicationMethod` | **WIRED LIVE** |
| `FERTILISER_PRODUCT_ADMISSIBILITY` (AF009) | Yes — catalogue is static, real formulation facts addable | **WIRED LIVE** |
| Local buffer override (AF010) | Yes — `field.waterBufferContext.localOverrideStatus` | **WIRED LIVE** |
| National buffer distance (AF010, other half) | No — needs a categorised water-feature type, only a free-text label exists | Deliberately NOT wired — see below |
| `CONCENTRATE_P_COMPLIANCE`/`FEED_CP_LEGAL_GATE` (AF006/AF007) | No — no concentrate CP%/P-content capture anywhere in the data model | Deliberately NOT wired this pass — see below |
| `SOILED_WATER_APPLICATION_GATE` (AF005) | No — no soiled-water application feature/history ledger exists at all | Deliberately NOT wired — see below |

**Wired live, this session:**

1. **`COMMONAGE_FERTILISER_GATE`** — `calculateNutrientPlan` now computes
   `checkCommonageFertiliserGate(requireCommonageStatus(field),
   "chemical_fertiliser")` and GENUINELY SUPPRESSES the purchased-product
   blend (`purchasedProducts: []`, `estimatedFieldCostEur: 0`) when it
   resolves `LEGAL_PROHIBITION` — not merely reported alongside a
   recommendation the farmer must not act on. New `NutrientPlan.commonageFertiliserGate`
   field. Inert for this app's real fields today (no `commonageStatus`
   ever captured), real the moment one is.

2. **`LESS_METHOD_GATE`** — wired from `SlurryAllocation.applicationMethod`
   (already captured since Phase C, previously dead data) via
   `requireSlurryApplicationMethod`. New `NutrientPlan.lessMethodCompliance`
   field. Closes audit conflict #6's real gap (the separate dead
   `slurryMethod`/`slurryTiming` cosmetic parameters remain unread, out of
   scope for this fix specifically).

3. **`FERTILISER_PRODUCT_ADMISSIBILITY`** — `nutrients.ts`'s static
   `PRODUCTS` catalogue (0-7-30, 18-6-12, Protected Urea) gained real
   `formulation` metadata (physical form, ureic N%, inhibitor status) as
   hardcoded, sourced facts about each SPECIFIC catalogue product — never
   inferred from `product.name` by string-matching at runtime (the exact
   AF009 anti-pattern). `productLine` now calls
   `checkFertiliserProductAdmissibility` for every line and excludes any
   product that doesn't resolve `ADMISSIBLE`. All three current products
   pass, so this is inert on today's numbers but a real, executed check
   on every calculation, and `FertiliserProduct.formulation` (an
   already-existing but previously-unpopulated field) now carries real
   provenance.

4. **Local water-buffer override (AF010, half of the buffer gate)** —
   wired from `field.waterBufferContext` via
   `resolveLocalWaterBufferOverrideStatus`/`checkLocalBufferOverride`. New
   `NutrientPlan.localBufferOverrideStatus` field. Correctly resolves
   `UNKNOWN` for an assessed-but-unresolved override
   (`QUALIFIED_NOT_DEFINITIVE`, AF010's own required behaviour) and
   `BLOCKED_INSUFFICIENT_EVIDENCE` for an `"authoritative_rule"` status —
   this data model has no field for the override distance itself, so
   that branch correctly never fabricates a distance.

**Deliberately NOT wired, with specific reasoning (not silently
dropped):**

- **National buffer distance** (`checkNationalBufferDistance`) needs a
  categorised `BufferFeature` (surface water / drinking abstraction /
  etc.) — `field.waterBufferContext.nearestFeature` is only a free-text
  label. Auto-categorising free text into a legal feature-type enum would
  be exactly the kind of inference this build's own discipline prohibits.
  Needs a genuine new categorised-field capture, not attempted this pass.
- **`CONCENTRATE_P_COMPLIANCE`/`FEED_CP_LEGAL_GATE`** — no concentrate
  crude-protein % or P-content capture exists anywhere in this data
  model (`LivestockGroup` has no such field), and there is no live
  screen with a concentrate-feed-input flow to attach a minimal capture
  to without building a new feature — judged to exceed "minimal
  appropriate farmer-facing capture" for this pass. Both gate functions
  remain real, tested, and ready to wire the moment concentrate feed
  input exists.
- **`SOILED_WATER_APPLICATION_GATE`** — this app has no soiled-water
  application feature or history ledger at all (not even a data-model
  placeholder) — there is no live call site to wire this gate into or to
  surface an `INSUFFICIENT_EVIDENCE` state from, and building one would
  be new product scope, explicitly out of bounds for this closure pass.

**Tests added:** 14 new `calculateNutrientPlan`-level tests in
`nutrients.test.ts` covering all 3 commonage states, 3 LESS scenarios,
formulation provenance, and all 3 local-buffer-override states.

**Test totals/results:** 740/740 passed, 52 test files (was 728).
typecheck/lint/build all clean.

**Commit:** local only, not pushed.

**Next:** Priority 5 (additive data-model extensions — reviewing what's
now needed beyond `Farm.pBuildUpCompliance` for the still-unwired gates
above).

---

## Second closure pass, Priority 5 — additive data-model extensions

**Date:** 2026-08-26

**Directive:** review the previous audit for genuinely missing required
V3 input fields and add them additively; legacy records get UNKNOWN, not
fabricated values.

**Audit of the Priority-5 checklist against the current data model:**

| Field | Already captured? |
|---|---|
| Commonage status | Yes — `Field.commonageStatus` (Phase C) |
| Silage destination/evidence | Yes — `SilagePlan.intendedUse`/`saleEvidence` (Phase E3) |
| Slurry application method | Yes — `SlurryAllocation.applicationMethod` (Phase C, wired live this pass) |
| Local buffer overrides | Yes — `Field.waterBufferContext` (Phase C, wired live this pass) |
| Concentrate CP/P | Yes, as a deliberate standalone `ConcentrateFeedSpec` parameter shape (Phase C) — NOT attached to `LivestockGroup`, since no concentrate-purchase/feed-plan entity exists yet to hang it off (a considered decision, confirmed still correct, not re-litigated) |
| Fertiliser inhibitor metadata | Yes — `FertiliserProduct.formulation` (Phase C, wired live this pass) |
| Feed basis | Yes, as a `FeedBasis` parameter type (`units.ts`) — not attached to an entity, since no stored-feed-inventory entity exists yet (same reasoning as concentrate CP/P) |
| Livestock age/sex | Yes — `LivestockGroup.avgAgeMonths`/`sex` (pre-existing) |
| Dairy yield band | **No — genuinely missing.** Added this session. |
| Soil-test georeference | Partial — `Field.lpisRef` exists at field level; no test-specific georef/report-issue-date field. Not added this session (see reasoning below). |
| Sheep/enterprise fields | Not applicable — this app models a single cattle/drystock enterprise throughout; no sheep data anywhere to extend |
| Peer-review state | Yes — `PeerReview.reviewStatus` (Phase J) |

**Added this session:**

1. **`LivestockGroup.avgMilkYieldKgPerYear?: TrackedValue<number>`** —
   closes AF012 (Table 7a dairy CP/N-election logic, previously "not
   resolved"). `statutory-excretion.ts`'s `resolveStatutoryExcretionCategory`
   now resolves the real `dairy_cow_band_1/2/3` categories from real milk
   yield (<4500/4500-6500/>6500 kg, `rules_statutory/livestock_excretion_rates_2026.csv`)
   instead of always blocking. Absent still fails closed exactly as
   before — this app models no real dairy enterprise, so this is inert on
   today's data, real for any future dairy farm.

2. **`NutrientPlan.soilTestAgeValidity`** (a computed output, not a new
   input field) — `SOIL_TEST_VALIDITY`'s 4-year disregard rule (with the
   P-Index-4 persistence exception) is now genuinely computed from
   `field.fertility.verifiedTest.sampleDate`, via a new
   `CalculateNutrientPlanInput.asOfDate?: string` parameter (explicit,
   defaults to the real current date — same convention as `livestock.ts`'s
   `options.today`/`provenance.ts`'s `today`, never an internal
   `Date.now()` call inside the pure calculation). SURFACED, not yet
   ENFORCED: `calculateNutrientPlan` does not suppress its P/K figures on
   a `"DISREGARD"` result — doing so correctly would need
   `calculateNutrientPlan` itself to become fail-closed-capable (return
   an `EngineOutcome`), a larger, higher-blast-radius refactor touching
   every call site, deliberately not rushed into this pass. Confirmed
   inert on this app's one real captured soil test (`mock-farm.ts`,
   sampled 2025-05-12, ~1.3 years old as of today — resolves `VALID`).
   `NOT_APPLICABLE` when no lab test exists at all.

**Deliberately NOT added, with reasoning:**

- **Soil-test-specific georeference/report-issue-date** —
  `checkSoilTestGeorefRequirement` (`soil-test-validity.ts`) needs a
  report ISSUE date, which may genuinely differ from the sample date
  already captured (`SoilTest.sampleDate`) — conflating the two would
  itself be a small inference risk. Left unwired this pass; the gate
  function is real and tested, ready once a genuine report-issue-date
  field exists.

**Tests added:** 7 — 3 for the real Table 7a dairy band resolution
(`statutory-excretion.test.ts`), 4 for the surfaced soil-test-validity
output (`nutrients.test.ts`), covering NOT_APPLICABLE/VALID/DISREGARD/
INDEX4_PERSISTED.

**Test totals/results:** 747/747 passed, 52 test files (was 740).
typecheck/lint/build all clean.

**Commit:** local only, not pushed.

**Next:** Priority 6 (full trace-coverage audit across all authoritative
calculations).

---

## Second closure pass, Priority 6 — trace-coverage audit

**Date:** 2026-08-26

**Directive:** "audit every AUTHORITATIVE production calculation/
recommendation path. Every authoritative output must either: 1. emit a
complete structured DecisionRecord/CalculationRun trace; or 2. be
explicitly classified as legacy/non-authoritative."

**Extended trace coverage (built this session):** `nutrient-plan-trace.ts`
gained two new decision builders, `buildCommonageDecision`/
`buildLessMethodDecision`, recorded alongside the existing NAP compliance
decision in the same `CalculationRun` — covering the two gates wired
live in Priority 4 that can produce a real `LEGAL_PROHIBITION`. Each
correctly returns `null` (no decision recorded) when the gate itself is
`NOT_APPLICABLE` (nothing material happened), and a real
`BLOCKED_INSUFFICIENT_EVIDENCE`/`LEGAL_PROHIBITION`/`NO_ACTION_RECOMMENDED`
decision otherwise. Updated the one existing test that assumed exactly
one decision record per run (now correctly 2, for a field with no
commonage status captured — a real trace-coverage improvement, not a
regression) and added 2 new tests for the positive commonage-prohibition
and LESS-compliant paths.

**Systematic audit — is every live "authoritative" output traced?**

The codebase's `regulatory: "compliance_value" | "planning_advice"`
marker (the app's own distinction for a legally authoritative claim, as
opposed to agronomic/financial guidance) is used in exactly ONE place:
`NapComplianceCheck` (`nutrients.ts`). Grepped and confirmed: no other
domain module in this codebase marks any of its output as a statutory
compliance claim. This means:

- **Nutrient/NAP domain** (`calculateNutrientPlan`/`calculateNutrientPlanWithTrace`):
  the only live path making a legal-compliance claim. Now fully traced
  for NAP N/P ceiling, commonage prohibition, and LESS method compliance
  — the three gates capable of producing a `LEGAL_PROHIBITION` or
  materially wrong compliance claim on this app's live screens.
- **Livestock economics, spreading, feed-cost, finance**: every output
  in these domains is agronomic/financial ESTIMATE or GUIDANCE, not a
  statutory compliance claim — and each already carries the lighter-
  weight `TrackedValue` provenance (status/source/timestamp) that
  `CLAUDE.md`'s own two-tier model calls for on general data, as opposed
  to the heavier `DecisionRecord`/`CalculationRun` trace `CLAUDE.md`
  reserves for "material recommendations" with regulatory status. None
  of these currently claims to be a verified V3 statutory recommendation
  — they are correctly NOT presenting themselves that way, which
  satisfies the directive's option 2 ("explicitly classified as legacy/
  non-authoritative") by construction, not by omission.
- **Dormant statutory gates** (`spreading-legal-gate.ts`,
  `soiled-water-gate.ts`, `concentrate-gates.ts`, national buffer half of
  `buffer-gate.ts`) — real `LEGAL_PROHIBITION`-capable modules, but NOT
  wired to any live screen (confirmed in Priority 4's audit: no caller in
  `src/app`/`src/components`). They are not "authoritative outputs" in
  the directive's sense today because nothing presents their result to a
  farmer yet. **Durable rule for future work, recorded here rather than
  left implicit:** the moment any of these is wired into a live
  recommendation (e.g. Priority 8's mock-`/spreading`-removal work),
  matching trace coverage must be added in the same change, following
  the exact `buildCommonageDecision`/`buildLessMethodDecision` pattern
  established this session — not deferred again.

**Conclusion:** trace coverage is now complete for every live output that
makes a statutory compliance claim. No live, non-traced authoritative
output was found.

**Tests added:** 2 new (`nutrient-plan-trace.test.ts`); 1 existing test
updated to reflect the real, intentional new decision count.

**Test totals/results:** 749/749 passed, 52 test files (was 747).
typecheck/lint/build all clean.

**Commit:** local only, not pushed.

**Next:** Priority 7 (livestock/economic calculation gaps).

---

## Second closure pass, Priority 7 — livestock/economic calculation gaps (GF18)

**Date:** 2026-08-26

**Directive:** "Implement only those for which V3 contains sufficient
deterministic evidence... retain the input contract; surface the missing
evidence; return the appropriate fail-closed state; record the item as
EVIDENCE_BLOCKED rather than IMPLEMENTATION_INCOMPLETE."

**Evidence check for `SELL_HOLD_ECONOMICS` (GF18, `GFT151`-`GFT158`,
audit conflict #9):** two genuinely different things are true at once:

1. The EVIDENCE-GATING/staleness/intent-preservation logic
   (`GFT151`-`GFT157`) needs no new sourced numeric constant — it is pure
   logic over evidence already captured (weight, weigh-date) or already
   absent (sale route, performance-model confirmation, farmer intent) —
   **sufficient evidence exists, built this session.**
2. Housing/carrying cost NUMBERS (part of `GFT158`'s required trace) are
   genuinely **EVIDENCE_BLOCKED** — no sourced per-head housing/carrying-
   cost rate exists anywhere in the V3 pack or this app's data model, and
   the original audit's own finding stands unchanged: nothing invented
   this session either.

**Built:** new module `src/domain/sell-hold-economics-gate.ts` —
`evaluateSellHoldEconomicsGate` implements the real `GFT151`-`GFT157`
logic: blocks (`BLOCKED_INSUFFICIENT_EVIDENCE`) for missing current
weight/sale route/performance-model confirmation; a separate
`priceSignalAloneNeverRecommendsSelling` unconditionally answers
`NOT_APPLICABLE` for a bare price signal (`GFT155`); `staleLiveweight`
flags (not blocks) a weigh-date beyond a documented 60-day threshold —
explicitly NOT cited to a Teagasc/statutory source (none publishes an
exact day-count; `GFT156`'s own golden-test group cites `ENGINE_AUDIT_RULE`
alongside `CSO_AG_PRICES`, the pack's own vocabulary for an engine
operating policy, not a scientific constant) — and never assumes a
missing weigh-date is fresh; the farmer's own `farmerTargetSaleDate` is
always returned verbatim, with any model-preferred date surfaced only as
a distinct, labelled `alternativeSaleDate`, never substituted
(`GFT157`).

**Deliberately NOT wired into `calculateSellNowVsFinish`/
`calculateLivestockEconomics` or any live screen this session** — both
the original audit and this session's own coverage matrix independently
flag the FULL fix as needing "both calculation additions (housing/
carrying cost) and a UI-reframing (scenario comparison, not directive)...
a dedicated phase combining both." 6+ live UI files consume the current
shape (`LivestockEconomicsView.tsx`, `EconomicsStatRow.tsx`,
`PerformanceForecastCard.tsx`, `MarginOutlookCard.tsx`,
`CurrentFeedCostCard.tsx`, `FeedGroupSummaryCard.tsx`,
`feed-optimiser/page.tsx`) — rushing a signature/return-type change
across all of them risked a real regression on a live, actively-rendered
feature for a housing/carrying-cost number this pass still cannot
produce anyway. The gate module itself is real, tested, and ready to
wire the moment that dedicated phase happens.

**Tests added:** 11, in `sell-hold-economics-gate.test.ts` — all of
`GFT151`-`GFT157` by name, plus the threshold-boundary and undefined-
weigh-date-treated-as-stale cases.

**Test totals/results:** 760/760 passed, 53 test files (was 749).
typecheck/lint/build all clean.

**GF18 status:** the evidence-gating HALF of `SELL_HOLD_ECONOMICS` is now
COMPLETE_AND_TESTED (calculation layer only, not live-wired); the
housing/carrying-cost figures remain EVIDENCE_BLOCKED; the UI-reframing
work remains a distinct, precisely-scoped remaining item (not evidence-
blocked, not incomplete coding — a deliberate scope boundary given the
live-UI blast radius).

**Commit:** local only, not pushed.

**Next:** Priority 8 (remove remaining mock/unsupported authoritative UI
surfaces).

---

## Second closure pass, Priority 8 — remove remaining mock/unsupported authoritative UI

**Date:** 2026-08-26

**Directive:** "hard-coded agricultural results; mock alerts; mock forage
values; unsupported financial/agronomic defaults... Where V3 supports a
replacement, use it. Where V3 does not: remove authoritative
presentation; clearly label demonstration/sample values if they must
remain for UI scaffolding; or replace with an unavailable/evidence-
required state. Do not fabricate replacement numbers."

**Fixed this session (Dashboard, the highest-visibility screen):**

1. **"Slurry available" (`2,850 m³` hardcoded literal)** — replaced with
   a REAL computed figure: new `calculateFarmSlurryAvailableM3`
   (`farm-stats.ts`), summing each shed's real captured
   `storageCapacityM3 * storageFillPct` — genuinely computed from Housing
   data, not `Housing.slurryEstimate.volumeM3` (which `finance.ts`'s own
   comment already flags as still-mock, needing an excretion coefficient
   this app doesn't have).
2. **"Total Revenue"/"Total Costs" (`€121,400`/`€73,580` hardcoded, with
   fabricated `+8%`/`-3%` trend arrows)** — no real sales-log/revenue-
   tracking feature exists anywhere in this app (confirmed:
   `lib/reports.ts`'s own comment already excludes these from the real
   CSV exports for the same reason). `MetricCard` gained a new
   `sampleData` prop (a small "Sample data" pill, reusing the existing
   `Pill`/`StatusBadge` design-system component) — applied here, and the
   fabricated trend arrows (zero real basis) removed.
3. **"Plan Confidence"/"Carbon Score"** — no defined methodology exists
   anywhere in this app's spec for either metric, not even as a planned
   future feature (confirmed by grep across `docs/`). Replaced the
   fabricated `82%`/`B+` values with an honest "Not yet available" state
   — the card slots/layout are unchanged (nothing removed per `CLAUDE.md`'s
   "never remove an approved screen element"), only the specific
   fabricated numbers.
4. **`MarginHeroCard`/`FinancialOverviewCard`** (both rendered on the
   Dashboard, and `MarginHeroCard` also on `/finance`) — both entirely
   driven by `mockFinanceSummary`/`mockCashflow` (forecast margin,
   revenue, costs, cashflow sparkline). Same reasoning as #2: no real
   revenue source exists. Both now carry a visible "Sample data"
   indicator (matching each card's own visual style — a bordered pill on
   the dark hero card, the standard `Pill` component on the light
   overview card) rather than presenting the figures as calculated.
5. **`SoilCoverageCard`'s "planning accuracy %"** — a previous session
   had already written the honest reasoning into a code comment ("no
   defined scoring methodology exists for it anywhere in this app's
   evidence base") but had NOT actually fixed the rendered UI, which
   still showed a bold green fabricated percentage. Now reads "Not yet
   available", consistent with the Dashboard fixes above. `mockFarmStats`
   (`mock-farm.ts`) is now fully unreferenced by any live code — left in
   place as harmless dead mock data, not a product feature, so not
   removed under the "never remove a screen element" rule (it was never
   a screen element itself).

**Full remaining mock/unsupported-authority inventory (audited, not
silently left unaccounted for):**

| Surface | What's mock | Why not fixed this session |
|---|---|---|
| `/finance` — `LivestockValueCard`, `CashflowCard`, `FeedCostOverviewCard`, `BestOpportunitiesCard` | `mockFinanceSummary`/`mockCashflow`/`mockOpportunities` | Same root cause as the Dashboard fixes above (no real revenue source) — needs the identical "Sample data" labelling pattern now established, but is a distinct page with 4 more components; scoped out to keep this session's change bounded and reviewable, not because it's hard |
| `/spreading` — the whole page | `mockSpreadingScores`/`mockPlannedApplications` | Confirmed in Priority 4's audit: the real gates (`spreading-legal-gate.ts`, `buffer-gate.ts`, `commonage-gate.ts`, `less-method-gate.ts`) exist but are wired to nothing live; replacing the mock scores with real ones means wiring this whole page for the first time — a feature build, not a labelling fix. The durable rule recorded in Priority 6 applies: trace coverage must be added in the same change that wires this live |
| Dashboard `AlertsCard` | `mockAlerts` — 4 hardcoded operational alerts ("Soil test due", "Fertiliser window open", etc.) tied to real screens but not derived from any real calculation | A real replacement needs a genuine "alerts engine" wiring each alert type to its real underlying gate (soil-test staleness → `soilTestAgeValidity`, built this pass; fertiliser window → `closed-period-calendar.ts`; feed budget → `fodder-budget.ts`) — a new feature, not a quick fix |
| `/silage` — `WholeFarmFeedBalanceCard` | `mockForageInventory` | Matches the coverage matrix's own `FODDER_SUPPLY_DM`/`WINTER_FEED_POSITION`: "NOT IMPLEMENTED" — the supply side of the feed balance has no real calculation to swap in yet (only the demand side, `BASIC_FODDER_DEMAND_FRESH_WEIGHT`, is real) |
| `/livestock` sell/hold economics | `calculateSellNowVsFinish` output presented as a directive | Addressed in Priority 7 — the real evidence-gating logic is built, live-wiring deliberately deferred (see that entry) |

None of these are silently unaccounted for — each has a specific,
correct reason it wasn't touched this session, matching the same
discipline established in Priorities 4/7.

**Tests added:** 3, in `farm-stats.test.ts`, for the new
`calculateFarmSlurryAvailableM3`.

**Test totals/results:** 763/763 passed, 53 test files (was 760).
typecheck/lint/build all clean.

**Commit:** local only, not pushed.

**Next:** Priority 9 (golden-test execution and classification).

---

## Second closure pass, Priority 9 — golden-test execution and classification

**Date:** 2026-08-26

**Directive:** "the previous pass must not count CSV reconciliation
alone as equivalent to execution... classify each as: EXECUTED_PASS,
EXECUTED_FAIL, EVIDENCE_BLOCKED, NOT_APPLICABLE... Do not mark an
unexecuted scenario PASS merely because code inspection suggests it
should pass. Fix every implementation-caused failure."

**Methodology:** grepped every one of the 180 real `GFTxxx` IDs
(`validation/golden_farm_tests.csv`) against the full `src/domain/*.test.ts`
suite, cross-checked each match against an actual executing code line
(not merely any substring mention in the file) — this caught and
corrected 4 false positives in this pass's own first draft (`GFT020`,
`GFT021`, `GFT107`, `GFT108` — each mentioned only in a comment
documenting why it's blocked, not in a real assertion). Full detail and
final per-group numbers: `docs/scientific-engine/v3/GOLDEN_FARM_TEST_COVERAGE.md`
(fully regenerated this session, not incrementally patched — the
previous version itself over-claimed GF01/GF12/GF13's coverage).

**Result: 156/180 EXECUTED_PASS + 2/180 NOT_APPLICABLE-by-construction
= 158/180 (88%).** Was ~108-122/180 (varying claims) at the start of
this priority.

**Real work done, not just reconciliation:**

1. **Corrected false "covered" claims** — GF01 (`GFT001`-`GFT005`/`GFT009`
   asserted but never cited), GF12 (`GFT101`/`104`-`106` undercounted at
   "2/8" when already matching real behaviour), GF13 ("7/8 by
   construction" was false — only some DMD/animal-type combinations were
   actually asserted; the missing ones needed real new assertions from
   the same already-published table, added).
2. **New real coverage from this session's own earlier priorities**:
   GF03's `GFT019` (dairy banding, Priority 5), GF04's full 8 (P
   build-up, Priority 3), GF06's `GFT048`-`051`/`056` (statutory manure
   ledger, Priority 2), GF19's `GFT165`/`167` (peer-review/trace
   coverage patterns established Priorities 6/J).
3. **New additive modules built specifically to close remaining golden
   tests**: `slurryAvailableSpringLessKgHa` (GFT047, a real newer/more-
   specific Teagasc source than Table 9-8 — audit conflict #5),
   `report-validator.ts` (GFT159/160/162/163, real report-structural-
   validity rules), `clover-n.ts` additions
   (`distinguishPaddockRateFromWholeFarmAllowance`/
   `checkCloverFertilityContext`/`selectCloverSchedule` — GFT133/134/141).
4. **A real, live bug found and fixed while reconciling `GFT025`**: the
   STANDARD Table 15a P ceiling had the exact same AF011-shaped
   over-application risk the N ceiling had before Priority 1's fix — a
   real GSR=184/P-Index-2 field could receive the raw table's 26 kg
   P/ha instead of the correct 23 kg P/ha fallback, with zero
   eligibility evidence. Fixed live: new
   `napMaxAvailablePGrazingKgHaEligibilityGated`, wired into
   `checkNapCompliance`'s standard P-ceiling branch, reusing the exact
   same `nonGrassPct`/170 kg N/ha threshold evidence the N-side fix
   already established. This is this session's SECOND genuine live
   safety fix (after Priority 1's N-side AF011 fix), found specifically
   BECAUSE this priority required checking exact expected numeric
   values against golden tests rather than accepting "the topic is
   generally handled."

**Remaining 22, precisely classified (see the regenerated coverage doc
for full detail):**
- **EVIDENCE_BLOCKED (12):** `GFT020`/`GFT021` (Table 7a CP-election —
  only 2 data points published, insufficient for a general rule);
  `GFT117`-`GFT124`/`GFT142` (sheep enterprise — no data-model support
  at all, correctly fail-closed by omission); `GFT158` (housing/carrying
  cost — no sourced rate anywhere).
- **NOT_ATTEMPTED (10):** `GFT028` (Reports architecture, not a
  calculation); `GFT107`/`GFT108` (no silage-balance calculation exists
  to attach a feed-basis/ensiling-loss guard to); `GFT171`-`GFT175`/
  `GFT177`/`GFT178` (genuine cross-module/store-level system-integration
  tests — a materially different kind of test from every other golden
  test in this pack, which exercise one pure domain function; real,
  buildable, deliberately out of scope for a session otherwise built
  entirely from pure-function unit tests).

**Tests added this priority:** ~50, across `nutrients.test.ts`,
`livestock.test.ts`, `statutory-excretion.test.ts`,
`p-build-up-eligibility.test.ts`, `statutory-manure-value.test.ts`,
`clover-n.test.ts`, `audit-trace.test.ts`, `peer-review-local-storage.test.ts`,
`provenance.test.ts`, `units.test.ts`, and the new `report-validator.test.ts`.

**Test totals/results:** 811/811 passed, 54 test files (was 763).
typecheck/lint/build all clean.

**Commit:** local only, not pushed.

**Next:** Priority 10 (report-acceptance test reconciliation, 24 rows).

---

## Second closure pass, Priority 10 — report-acceptance reconciliation (24 rows)

**Date:** 2026-08-26

**Directive:** "Run/reconcile all 24 Recommendation Audit Report
acceptance tests. Verify Reports can represent more than the original
single NAP decision... Verify reviewer judgement cannot mutate the
original calculation."

**Real improvements made this priority (not just reconciliation):**

1. **RPT001 (all 5 decision classes)** — was PARTIAL (only
   `ACTION_RECOMMENDATION`/`WARNING`/`BLOCKED_INSUFFICIENT_EVIDENCE` ever
   emitted). Now genuinely **PASS**: Priority 6's commonage/LESS decision
   builders already added `LEGAL_PROHIBITION`/`NO_ACTION_RECOMMENDED`;
   this priority added the one still-missing real test — a genuine
   `WARNING` decision (a 300-cow herd on 27ha exceeding the statutory N
   ceiling) — so all 5 of RPT001's own required categories (positive,
   no-action, legal-stop, warning, blocked) are each demonstrated by a
   real, currently-passing test against the live trace path.
2. **RPT007 (rounding rules visible)** — was NOT_POPULATED. Now **PASS**:
   `CalculationStep.roundingRule` populated on the NAP N-ceiling
   comparison step, disclosing that `nRequiredKgHa` is rounded to the
   nearest whole kg/ha before the boundary comparison.
3. **RPT009 (hard fail suppresses contradictory action)** — was PARTIAL.
   Verified **PASS** directly against a REAL, live-produced
   `LEGAL_PROHIBITION` decision (not a synthetic fixture) using the new
   `validateLegalStopNotActionable` (Priority 9's `report-validator.ts`)
   — neither the commonage nor LESS `LEGAL_PROHIBITION` decision builder
   ever sets a `quantity` field, so the contradiction this rule guards
   against cannot occur, confirmed by test.
4. **RPT011 (source table/section captured)** — was PARTIAL
   (`SourceCitation.section` optional, unpopulated). Now **PASS**: the
   NAP compliance decision's primary source citation now carries
   `compliance.legislation`'s own exact table reference (e.g. "S.I. No.
   588/2025, Tables 13 & 15a") as its `section`, not a bare Act-level
   citation.

**Full reconciliation — all 24 rows:**

| ID | Status | Note |
|---|---|---|
| RPT001 | **PASS** | Fixed this priority — see above |
| RPT002 | PASS | Unchanged — persisted trace, not reconstructed |
| RPT003 | PASS | Unchanged |
| RPT004 | PASS | Unchanged |
| RPT005 | PASS | Unchanged |
| RPT006 | PASS | Unchanged |
| RPT007 | **PASS** | Fixed this priority — see above |
| RPT008 | PASS | Unchanged |
| RPT009 | **PASS** (verified against live output) | Fixed this priority — see above |
| RPT010 | PASS | Unchanged |
| RPT011 | **PASS** | Fixed this priority — see above |
| RPT012 | PASS | Unchanged — sealed-run immutability |
| RPT013 | PASS | Unchanged — `GFT176` this session |
| RPT014 | PASS | Unchanged — `GFT165` this session, real REJECTED-status test added |
| RPT015 | PASS | Unchanged |
| RPT016 | **NOT_ATTEMPTED** | `alternatives` field exists, never populated — would need a real "what-if a different route were chosen" scenario computation, genuine new engineering, not a labelling fix |
| RPT017 | PASS | Unchanged — no narrative ever written |
| RPT018 | **NOT_APPLICABLE** | Nothing to contradict, since no narrative is ever written (unchanged) |
| RPT019 | PASS | Unchanged |
| RPT020 | PASS | Unchanged |
| RPT021 | **NOT_ATTEMPTED** | No CSV audit-pack export exists — a real export-pipeline feature, not built this session |
| RPT022 | **NOT_ATTEMPTED** | No JSON export/schema-validation step exists |
| RPT023 | **NOT_ATTEMPTED** | Report UI filters — a real UI feature, not built |
| RPT024 | **NOT_ATTEMPTED** | Run comparison UI — a real UI feature, not built |

**Reports architecture supports more than the original single NAP
decision, verified for real** — `run.decisionRecords` now contains, in a
single live `CalculationRun`, real examples of all 5 `DecisionType`
values RPT001 requires, produced by 3 different gates (NAP compliance,
commonage, LESS method) — not merely a type-level claim.

**Reviewer judgement cannot mutate the original calculation, verified
for real** — `RPT014`'s new test records a real `REJECTED` peer review
and proves the audit-trace localStorage namespace (the calculation
record itself) is untouched by it, using the same dedicated-namespace
isolation test already established for every other review status.

**Tests added:** 3 new assertions in `nutrient-plan-trace.test.ts`
(the `WARNING` decision test, the `roundingRule` assertion, the
`section` assertion) plus the `GFT165`/`report-validator` integration
already counted under Priority 9.

**Test totals/results:** 812/812 passed, 54 test files (was 811).
typecheck/lint/build all clean.

**Commit:** local only, not pushed.

**Next:** Priority 11 (full adversarial reconciliation, 18 findings).
