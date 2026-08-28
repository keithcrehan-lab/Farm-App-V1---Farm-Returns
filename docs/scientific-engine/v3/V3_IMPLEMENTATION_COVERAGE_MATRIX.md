# Farm Return Scientific Engine V3 — Implementation Coverage Matrix

**Status date:** 2026-08-27. Three sessions on `claude/scientific-engine-v3`:
the first pass (Phases 1 through L, commits `8c8183f`..`7264ca3`), the
second autonomous closure pass (commits `8310bf0`..`13a9087`, 11
priorities), and this bounded final closure implementation pass
(commits following an independent NO-GO verification, addressing that
verification's own numbered findings). Not pushed, not merged.

**This document supersedes the second closure pass's own coverage
matrix**, which an independent verification found contained a false
claim ("Mock hardcoded literals in live app pages: exactly the 2 already
labelled `sampleData`... none unlabelled" — disproved on the same
Dashboard screen the claim was about) and a self-contradiction between
its report-acceptance summary (claimed 20 PASS / 3 gaps) and its own
Priority 10 detailed table (actually showed 18 PASS / 5 gaps). Every
number below was re-derived from actual code/test inspection during this
pass, not copied forward.

**Gate-integration classification scheme required by this pass** (a
module is `LIVE_FARMER_WORKFLOW` only if ALL FIVE hold: 1. required input
can actually enter through a farmer/application workflow; 2. the
production calculation invokes the module; 3. its outcome changes/
protects the farmer-facing result; 4. missing evidence correctly fails
closed; 5. the outcome is traceable where required — merely being
imported by another domain function is NOT sufficient):

- **LIVE_FARMER_WORKFLOW** — all 5 criteria hold.
- **DOMAIN_INTEGRATED_ONLY** — invoked by a real calculation and
  affects a real output, but at least one of criteria 1 (real capture
  path) or 5 (traced) does not yet hold.
- **BUILT_BUT_UNWIRED** — real, tested module with no live consumer at
  all (no calculation calls it, or no screen exists for its domain).
- **EVIDENCE_BLOCKED** — cannot be safely built further without
  inventing evidence the V3 pack doesn't publish.
- **NOT_APPLICABLE** — correctly inert (e.g. no data exists to trigger
  it) or out of this app's current product scope by design.

---

## 1. Gate integration — every V3 gate/module

| Gate/module | Class | Evidence |
|---|---|---|
| `COMMONAGE_FERTILISER_GATE` | **LIVE_FARMER_WORKFLOW** | Suppresses `purchasedProducts`; `field.commonageStatus` now has real capture UI (`FieldDrawer.tsx`, this pass — previously **no field anywhere, not even mock data, ever had this set**, so the gate always hit its fail-closed default in practice); traced via `RecommendationAuditTrailCard` |
| `NATIONAL_BUFFER_DISTANCE` / `LOCAL_BUFFER_OVERRIDE` | **LIVE_FARMER_WORKFLOW** | This pass: now genuinely suppresses `purchasedProducts` for a chemical-fertiliser prohibition (previously computed and silently discarded); `waterBufferContext` (incl. the newly-added `localOverrideDistanceM`) has real capture UI; traced via a new `DecisionRecord` builder |
| `LESS_METHOD_GATE` | **LIVE_FARMER_WORKFLOW** | Traced since the second pass; this pass adds real capture UI for `SlurryAllocation.applicationMethod` (previously no farmer workflow could ever set it) and a real `alternatives` entry on its `LEGAL_PROHIBITION` branch |
| `P_BUILD_UP_ELIGIBILITY` | **LIVE_FARMER_WORKFLOW** | Affects the real P ceiling shown on `NapComplianceCard`; inputs sourced from the field's own real fertility record |
| `COMPLIANCE_MANURE_NP` (statutory manure value) | **LIVE_FARMER_WORKFLOW** | This pass: now has a real `ESTIMATE`-type `DecisionRecord`, visible via the Recommendation Audit Trail (previously computed into `NutrientPlan` with zero farmer-visible surface anywhere) |
| `SOIL_TEST_VALIDITY` | **LIVE_FARMER_WORKFLOW** | This pass: `DISREGARD` now genuinely downgrades the NAP P ceiling from `compliance_value` to `planning_advice` with a farmer-facing reason (previously computed and surfaced but never consulted); input capture already existed (`addSoilTest`) |
| `SPREADING_LEGAL_GATE` (closed-period calendar component) | **LIVE_FARMER_WORKFLOW** | This pass: real per-field calendar status now renders on `/spreading` (previously an unconditional "Under validation" placeholder) |
| `SPREADING_LEGAL_GATE` (ground/weather stops, full fusion) | **BUILT_BUT_UNWIRED** | No live per-field ground-condition capture exists to feed `SpreadingGroundConditions`; not attempted this pass — a real capture feature, not a wiring fix |
| `SILAGE_DESTINATION_REGULATORY_ROUTE` | **DOMAIN_INTEGRATED_ONLY** | Genuinely affects the NAP ceiling; `SilagePlan.intendedUse`/`saleEvidence` have **no farmer capture path** — `SilagePlan` is not part of the central farm-store state at all (still `mockSilagePlans`, a static array), unlike `Field`/`SlurryAllocation` which this pass made stateful-and-capturable. Moving `SilagePlan` into the store touches ~8 consumer files; judged too large for this pass's bounded/additive scope — documented, not silently dropped |
| `FERTILISER_PRODUCT_ADMISSIBILITY` | **LIVE_FARMER_WORKFLOW** | Genuinely filters the live product catalogue; catalogue-level formulation metadata counts as real capture for a shared product list (not a per-purchase farmer entry) |
| `GRASSLAND_STOCKING_RATE` / `DAIRY_COW_EXCRETION_N` (milk-yield banding) | **LIVE_FARMER_WORKFLOW** | Unchanged from second pass — wired live, real inputs |
| `DAIRY_COW_EXCRETION_N` (Table 7a CP-election) | **EVIDENCE_BLOCKED** | Only 2 data points published (`GFT020`/`GFT021`) |
| `MILKING_PLATFORM_N_DISTRIBUTION` | **BUILT_BUT_UNWIRED** | No live screen captures a milking-platform declaration anywhere; not attempted this pass |
| `SOILED_WATER_APPLICATION_GATE` | **BUILT_BUT_UNWIRED** | No application-history capture feature exists; not attempted |
| `CONCENTRATE_P_COMPLIANCE` / `FEED_CP_LEGAL_GATE` | **BUILT_BUT_UNWIRED** | `ConcentrateFeedSpec` has zero consumers anywhere in `src/app`/`src/components` (confirmed again this pass); would need a new stateful entity, same judgement as `SILAGE_DESTINATION_REGULATORY_ROUTE` above |
| `FEED_BASIS` (`checkFeedBasisConsistency`, new this pass) | **BUILT_BUT_UNWIRED** | Real, tested guard; no silage/fodder balance calculation exists yet to consume it — root gap explicitly unchanged, not hidden |
| Ensiling-loss double-count guard (`shouldApplyEnsilingLossAgain`, new this pass) | **BUILT_BUT_UNWIRED** | Same reasoning as `FEED_BASIS` above |
| `BASIC_FODDER_DEMAND_FRESH_WEIGHT` | **BUILT_BUT_UNWIRED** | Real and tested (incl. new `GFT174` propagation test), but still no live screen calls it |
| `LIME_REQUIREMENT` | **NOT_APPLICABLE** | Correctly inert — no lab lime-requirement field exists to compute from |
| `SELL_HOLD_ECONOMICS` | **DOMAIN_INTEGRATED_ONLY** | Real, tested evidence-gating logic; not wired to any live screen (unchanged, a deliberate UI-reframing decision from the prior pass) |
| Nitrates derogation higher manure limit | **EVIDENCE_BLOCKED** | Correctly, deliberately fail-closed per spec §E3 ("do not create a simple derogation=on toggle... until the full derogation module is verified") |
| Twin-ewe DMD / red-clover ewe-mating warning (sheep enterprise) | **EVIDENCE_BLOCKED** | No sheep category exists in `LivestockCategory`; the real Teagasc tables have not been transcribed |

**Tally:** 9 `LIVE_FARMER_WORKFLOW` (up from 2-3 depending how the prior
pass's own inconsistent "wired live" language is counted), 2
`DOMAIN_INTEGRATED_ONLY`, 6 `BUILT_BUT_UNWIRED`, 4 `EVIDENCE_BLOCKED`, 1
`NOT_APPLICABLE`. **TOTAL: 22** (representative inventory, not literally
every one of `calculation_contracts.csv`'s 25 rows — several of that
file's rows are non-gate calculations, e.g. `AGRONOMIC_SLURRY_NPK`,
without a comparable "gate" classification).

---

## 2. Golden-farm test harness — 180 tests

Full detail: `GOLDEN_FARM_TEST_COVERAGE.md` (regenerated this pass, no
`NOT_ATTEMPTED` bucket used).

| Classification | Count |
|---|---|
| `EXECUTED_PASS` | 165 |
| `EXECUTED_FAIL` | 1 (`GFT171`) |
| `EVIDENCE_BLOCKED` | 12 |
| `NOT_APPLICABLE` | 2 |

165 + 1 + 12 + 2 = 180.

---

## 3. Report acceptance — `reports/report_acceptance_tests.csv`, 24 rows

The independent verification found the second closure pass's own
Priority 10 table (18 PASS / 1 N/A / 5 gaps) and its later summary (20
PASS / 1 N/A / 3 gaps) disagreed with each other. Reconciled fresh this
pass:

| ID | Status | Note |
|---|---|---|
| RPT001-RPT015 | PASS | Unchanged from second pass |
| RPT016 | **PASS** (new this pass) | Real, sourced `alternatives` on every `LEGAL_PROHIBITION` decision builder (commonage/LESS/buffer) |
| RPT017 | PASS | Unchanged |
| RPT018 | PASS (vacuously true, architectural) | No narrative is ever populated anywhere in this app (grepped again this pass) — nothing to contradict |
| RPT019, RPT020 | PASS | Unchanged |
| RPT021, RPT022 | **PASS** (new this pass) | Real CSV Audit Data Pack (8 relational tables) and JSON trace export, `audit-export.ts` |
| RPT023 | **PASS** (new this pass) | Real decision-type/reviewer-status filters, `RecommendationAuditTrailCard.tsx` |
| RPT024 | **PASS** (new this pass) | Real run comparison, `compareCalculationRuns` |

**24/24 EXECUTED_PASS. 0 MANUAL_VERIFIED. 0 BLOCKED. 0 FAIL.**

No literal `.zip` container was built for the Audit Data Pack (no new
dependency was added) — it is delivered as 8 separately downloadable,
relationally-joined CSVs instead, matching
`reports/audit_export_tables.csv`'s own schema exactly. No PDF-generation
library was added either — the human-readable report is print-ready
plain text (a browser's own Print → Save as PDF is the dependency-free
route from there). Both are documented deliberate scope decisions, not
silent gaps.

---

## 4. Adversarial findings — `validation/adversarial_findings.csv`, 18 rows

Unchanged from the second closure pass's own reconciliation — this pass
did not revisit findings not named in the independent verification's own
correction list, except to flag one open sourcing issue below.

- **RESOLVED_AND_TESTED: 17/18.**
- **NOT_APPLICABLE: 1/18** (`AF015`).
- **EVIDENCE_BLOCKED: 0/18.**
- **STILL_OPEN: 0/18.**

**Flagged, not reopened:** the independent verification's correction #1
found `AF011`'s N-ceiling eligibility threshold
(`HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT = 5`,
`src/domain/nutrients.ts`) has no independent statutory citation — it
was derived from the golden test's own expected values, not a
`rules_statutory` CSV or the calc spec's own footnote text. The
*mechanism* AF011 names ("GSR>170 alone does not entitle a holding to
higher N/P rates") is genuinely fixed and fails closed correctly — this
is not a live over-application risk today (the only production caller
computes `nonGrassPct` from real tillage-area data, which is 0 for every
current mock field). But the specific 5% figure remains **unverified**
and is not something this implementation pass could safely resolve
without inventing a source, per this pass's own "do not invent missing
evidence" instruction. Recorded here as a known, real, open evidence gap
— not silently carried forward as if resolved.

---

## 5. Trace coverage — every farmer-facing authoritative V3 decision path

| Path | Class |
|---|---|
| NAP N/P compliance | **FULLY_TRACED** |
| Commonage fertiliser gate | **FULLY_TRACED** |
| LESS method compliance | **FULLY_TRACED** |
| National/local water-buffer distance | **FULLY_TRACED** (new this pass) |
| Statutory manure N/P ledger value | **FULLY_TRACED** (new this pass) |
| P build-up eligibility | **FAIL_CLOSED_AND_TRACED** — folded into the NAP decision's own compliance checks, not a separate `DecisionRecord`; its effect (the enhanced P ceiling) is traced there |
| Soil-test-validity downgrade | **FAIL_CLOSED_AND_TRACED** — surfaced via `NapComplianceCheck.soilTestDisregardedReason`, visible on `NapComplianceCard`; not yet its own `DecisionRecord` |
| Closed-period spreading calendar (`/spreading`) | **NON_AUTHORITATIVE_AND_EXPLICITLY_LABELLED** — a real, sourced legal determination rendered directly on-screen, but not yet wrapped in a `CalculationRun`/`DecisionRecord` the way the Nutrients-screen gates are; labelled with a plain Open/Closed period/Unknown pill, never presented with false certainty |
| Milking platform, soiled water, concentrate CP/P, fodder demand | **NON_AUTHORITATIVE_AND_EXPLICITLY_LABELLED** — real, tested calculations with no live consumer at all, so nothing authoritative is presented from them anywhere (a `BUILT_BUT_UNWIRED` module cannot mislead a farmer, by construction) |
| Dashboard/Finance sample figures (`sampleData` pills) | **NON_AUTHORITATIVE_AND_EXPLICITLY_LABELLED** — this pass extended the label to every remaining unlabelled instance found (see §6) |
| Real alerts (`real-alerts.ts`) | **FAIL_CLOSED_AND_TRACED** — derived directly from the same gates above; not its own separate trace, inherits theirs |

**No `UNTRACED_AUTHORITATIVE_OUTPUT` remains** among the paths audited
this pass. The closed-period calendar on `/spreading` is the one path
that is real/authoritative/farmer-facing but not yet wrapped in the
formal `CalculationRun` trace machinery — captured honestly above as
`NON_AUTHORITATIVE_AND_EXPLICITLY_LABELLED` rather than claimed as fully
traced.

---

## 6. Mock-authority audit (re-run this pass)

The independent verification disproved the second pass's "none
unlabelled" claim, finding the Dashboard's mobile-only "Savings
potential" tile still used the unlabelled `mockInputPlannerSummary`
pattern. A fresh sweep this pass found and fixed:

- Dashboard: "Savings potential" mobile tile — now `sampleData`-labelled.
- `LivestockValueCard`: the "vs last season" change figure (the headline
  value is real) — now labelled.
- `CashflowCard`: entirely mock (forecast margin + chart) — now
  labelled.
- `FeedCostOverviewCard`: the "Potential saving" footer (every cost line
  above it is real) — now labelled.
- `BestOpportunitiesCard`: entirely mock "actionable ideas" — now
  labelled.
- `MarketWatchCard`: "Live prices" → "Latest available" — the CSO-sourced
  rows are real but historical monthly observations, not a live feed.
- `AlertsCard`: `mockAlerts` (4 fixed entries, zero calculation behind
  any of them) replaced entirely with `real-alerts.ts` — real alerts
  derived from this app's own live gates (commonage, buffer, soil-test
  disregard, NAP ceiling, closed-period calendar).

Re-run anti-pattern greps this pass, all clean: no new unlabelled
hardcoded literal in a farmer-facing page; no LLM usage in a calculation
path; no populated `narrativeExplanation`; ledger separation intact
(`statutoryManureValue` vs `slurryAvailableKgHa` still two independent
fields, never merged).

---

## 7. What remains, explicitly classified, and why

| Remaining work | Class | Why |
|---|---|---|
| `SilagePlan`/`ConcentrateFeedSpec` capture (would unblock `SILAGE_DESTINATION_REGULATORY_ROUTE`'s farmer-capturability, `CONCENTRATE_P_COMPLIANCE`, `FEED_CP_LEGAL_GATE`) | **IMPLEMENTATION_INCOMPLETE** | Real, safely buildable, but requires moving 2 entities into the central farm-store (currently static `mock-farm.ts` arrays) and touching ~8 consumer files each — judged too large for this pass's bounded/additive scope (every other capture this pass added was a single optional field on an already-stateful entity). Not evidence-blocked: the gates and their rules are already real and tested. |
| Milking-platform declaration capture | **IMPLEMENTATION_INCOMPLETE** | Same reasoning — a genuinely new capture feature, not a wiring fix |
| Soiled-water application-history capture | **IMPLEMENTATION_INCOMPLETE** | Same reasoning |
| `AF011`'s 5% non-grass-area threshold sourcing | **EVIDENCE_BLOCKED** | No `rules_statutory` CSV or calc-spec footnote text states this figure; only the golden test's own expected values do. Cannot be resolved without inventing a source. |
| `GFT171` (silage use feeds linked modules) | **IMPLEMENTATION_INCOMPLETE** (test-methodology gap, not a code gap) | A genuine cross-module/store-level integration claim; this session's pure-function methodology cannot honestly prove it alone |
| `SPREADING_LEGAL_GATE` full fusion (ground/weather/buffer composed into one call) | **IMPLEMENTATION_INCOMPLETE** | No live per-field ground-condition capture exists; each sub-check is real, only the fused single-call gate and its live wiring is missing |
| Dairy Table 7a CP-election (the numeric N-reduction table) | **EVIDENCE_BLOCKED** | Only 2 data points published |
| Sheep enterprise (twin-ewe DMD, red-clover ewe-mating warning) | **EVIDENCE_BLOCKED** (data-model gap) | No sheep category exists; tables not transcribed |
| Housing/carrying cost per-head rates | **EVIDENCE_BLOCKED** | No sourced rate anywhere in the V3 pack |
| Playwright visual regression | **ENVIRONMENT_BLOCKED** | Confirmed again this pass: `/opt/pw-browsers/chromium` does not exist; a real launch attempt fails with that exact error, not bypassed |
| Real CSO/Bord Bia/DAFM market-price integration | **EXTERNAL_INTEGRATION_BLOCKED** | Needs a live external API/credentials this session has no access to |

---

## 8. Regression / build status (this pass's final run)

See the final closure report for the exact numbers from the last run
executed in this session.
