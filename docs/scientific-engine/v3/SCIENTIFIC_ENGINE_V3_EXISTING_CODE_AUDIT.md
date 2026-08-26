# Farm Return — Existing Code vs. Scientific Engine V3 Audit
## Audit date: 2026-08-26 · No production code changed in this pass

This audits every current calculation, recommendation, alert, opportunity
and hard-coded agricultural/financial/legal number in the Farm Return
codebase against `docs/scientific-engine/v3/`. It does not implement
fixes. Findings are grouped by domain module, each with: source
file/function, exact formula/constant, inputs, current tests, matching V3
calculation contract (if any), current evidence, V3 agreement, completeness,
replace/fail-closed verdict, and additional-data-needed verdict.

Legend used throughout:
- **Agrees** — matches the V3 contract/value with no material gap.
- **Partial** — same concept, but incomplete relative to V3 (missing
  eligibility gate, missing state, wrong scope, etc.).
- **Conflicts** — actively contradicts a V3 rule, test, or architecture
  principle (Section 3 lists these separately, ranked).
- **Missing** — V3 requires a calculation/control that does not exist in
  the codebase at all today.

---

# 1. Codebase inventory

Real (non-mock) calculation logic lives entirely in `src/domain/*.ts`,
consistent with `CLAUDE.md`'s "no formulas in components" rule — this
itself is confirmed compliant. The modules audited:

| File | Domain |
|---|---|
| `src/domain/nutrients.ts` | Soil P/K index, N/P/K requirement, NAP N/P ceilings, slurry agronomic offset, purchased-product blend |
| `src/domain/spreading.ts` | Weather/SMD-based ground-condition hard stops |
| `src/domain/livestock.ts` | DMD→concentrate lookups, finishing budgets, sell-vs-finish, feed-strategy comparisons |
| `src/domain/feed-cost.ts` | Grazed-grass/silage/mineral €/t DM benchmarks |
| `src/domain/finance.ts` | Whole-farm aggregation of the above |
| `src/domain/market.ts` | CSO cattle/fertiliser price trend series |
| `src/domain/farm-stats.ts` | Simple coverage counts (non-scientific) |
| `src/domain/provenance.ts` | `TrackedValue` history-chain helpers (infrastructure, not a calculation) |
| `src/lib/reports.ts` | CSV export builders (Reports section) |
| `src/data/mock-farm.ts` | Mock recommendation/alert/score data still rendered in production screens |

One violation of `CLAUDE.md`'s "no magic numbers in UI/components" rule was
found outside `src/domain/`: `CATTLE_PRICE_EUR_PER_KG_CARCASS` is declared
in `src/app/livestock/[groupId]/LivestockEconomicsView.tsx:20-21` (a page
component), with a silent hard-coded fallback (`?? 5.42`) if the mock price
row is absent. It should move into a domain module and lose the silent
fallback.

---

# 2. Domain-by-domain catalogue

## 2.1 Soil P/K index

### `pIndexFromMgL` — `src/domain/nutrients.ts:54-59`
- **Formula:** `mgL <= 3.04 → 1; <= 5.04 → 2; <= 8.0 → 3; else → 4`
- **Inputs:** `mgL: number` (Morgan's P, grassland only)
- **Tests:** `nutrients.test.ts` (boundary cases at 3.04/5.04/8.0)
- **V3 contract:** `SOIL_P_INDEX` (`calculation_contracts.csv`), rules in `rules_statutory/soil_phosphorus_index_2026.csv`
- **Evidence today:** Green Book Table 6-4/13-1, cross-checked against S.I. 588/2025 in the code comment
- **Agrees with V3:** **Conflicts.** V3's literal statutory table has three states in the 8.00–8.01 zone: Index 3 up to 8.00 inclusive, an explicit `AMBIGUOUS_SOURCE_BOUNDARY` for `(8.00, 8.01]`, and Index 4 only for `>8.01`. The current function silently returns `4` for any value `>8.0`, including the entire ambiguous micro-gap — it never emits `AMBIGUOUS_STATUTORY_BOUNDARY`. This directly fails `GFT006` (`Morgan_P_mg_L=8.01` must return `AMBIGUOUS_STATUTORY_BOUNDARY`, not `INDEX_4`).
- **Incomplete:** Yes — no `other_crop` crop-group column at all (grassland only; V3 requires both, with different Index 2/3 boundaries: 3.05–6.04 / 6.05–10.00).
- **Must be replaced:** Yes.
- **Must fail closed:** Yes, for the ambiguous zone and for `crop_group` not supplied.
- **Additional farm data required:** `crop_group` per field (grassland vs other crop) does not exist on `Field` today.

### `kIndexFromMgL` — `src/domain/nutrients.ts:62-67`
- **Formula:** `<=50→1; <=100→2; <=150→3; else→4`
- **V3 contract:** advisory only (`advisory_teagasc/soil_K_index_current.csv`), not a statutory gate
- **Agrees with V3:** Agrees, for `mineral` soils only. V3's table also defines separate `peat` soil ranges (0–100/101–175/176–250/>250) that the current function has no way to select — `MappedSoil.organicCarbonStatus` exists (`mineral|peat|high_organic`) but `kIndexFromMgL` never reads it.
- **Incomplete:** Yes — peat soils silently get the mineral-soil bands.
- **Must be replaced:** Yes, to branch on soil material.
- **Fail closed:** Not legally required (advisory only), but should not silently misclassify peat soils.

### Mg index — **Missing**
V3 supplies `advisory_teagasc/soil_Mg_index_current.csv`; nothing in `src/domain` computes an Mg index today, despite `SoilTest.mg` being captured. No screen surfaces it. Net-new, low-risk (advisory only).

### Lime requirement — **Missing (correctly fail-closed by omission)**
No lime t/ha calculation exists anywhere in the codebase. This happens to already match V3's `LIME_REQUIREMENT` contract ("No exact t/ha from pH alone; request lab LR") and `GAP_LIME_WITHOUT_LR` — but only because the feature was never built, not because a deliberate gate was implemented. When built, it must read a lab lime requirement (not derive from pH) and separately apply `rules_statutory/lime_programme_2026.csv`'s high-GSR trigger/timing rules — neither of which exist yet.

### Soil test validity (4-year rule, P4 persistence, georeference) — **Missing**
`Field.fertility.verifiedTest.sampleDate` is captured, but **no code anywhere evaluates test age, P-Index-4 persistence, OM 12-year validity, or the post-14-Sep-2025 georeference/LPIS requirement.** Every downstream soil-dependent calculation (`pIndexFromMgL`, the entire nutrient plan) trusts whatever `fertility.pIndex.value` currently holds, with no staleness check.
- **V3 contract:** `SOIL_TEST_VALIDITY` — `BLOCK regulated nutrient recommendation` if invalid/undated/stale-without-P4-exception/missing georef.
- **Verdict:** Missing entirely. Must be built and must fail closed (`GFT011`–`GFT018`) before any statutory nutrient output can be labelled compliant.

## 2.2 Agronomic P/K build-up & maintenance (Green Book tables)

`P_BUILDUP_KG_HA`, `P_GRAZING_MAINTENANCE_BANDS`, `P_SILAGE_*`,
`K_GRAZING_BASE_KG_HA`, `K_SILAGE_BASE_KG_HA` — `src/domain/nutrients.ts:76-173`.
- **Source:** Green Book (2020) Tables 13-2/13-3/13-4/14-1/14-2 — explicitly agronomic-advisory, not statutory.
- **V3 contract:** none of these appear in the V3 pack (V3 supplies no grazing/silage P&K *maintenance* advisory tables — only the statutory ceilings). They are legitimately outside V3's scope as the **agronomic ledger**, which V3's architecture (Section A2) explicitly requires to exist separately from the compliance ledger.
- **Agrees with V3:** Agrees in principle (agronomic ledger is allowed to use a Teagasc baseline). **Not superseded, but not reconciled against the V3 source register either** — should be added to a unified source register so a future audit can tell at a glance that these numbers were deliberately kept, not overlooked.
- **Must fail closed:** No — advisory only.

## 2.3 Nitrogen — grazing (agronomic table vs. statutory GSR) — **critical conflict**

### `N_GRAZING_SUCKLER_TO_BEEF_TABLE` / `nGrazingSucklerToBeefKgHa` — `src/domain/nutrients.ts:189-215`
Green Book Table 12-3, LU/ha → kg N/ha, **linearly interpolated** between rows.

### `calculateGrasslandStockingRateKgHa` — `src/domain/nutrients.ts:651-662`
```
stockingRateLUHa = totalLivestockUnits(groups) / farmGrasslandAreaHa
return nGrazingSucklerToBeefKgHa(stockingRateLUHa)   // <- Green Book agronomic curve
```
This function's return value is then passed everywhere as `orgNStockingRateKgHa` — **including straight into `checkNapCompliance`**, which uses it to select the statutory NAP N/P ceiling band.

- **V3 contract:** `GRASSLAND_STOCKING_RATE` (`calculation_contracts.csv`) — "sum statutory grazing-livestock N produced before exports / entire eligible grassland area", using the exact S.I. 119/2026 Table 7 excretion rate **per animal category and age/sex band** (`rules_statutory/livestock_excretion_rates_2026.csv`), never a generic Livestock Unit proxy.
- **Agrees with V3:** **Conflicts — this is the single most serious finding in this audit.** The figure that gates every field's statutory NAP N and P ceiling is not the statutory GSR at all; it is a Green Book agronomic N-requirement curve keyed off a generic LU conversion (`LIVESTOCK_UNITS_PER_HEAD`, itself a Green Book footnote, not S.I. 119/2026 Table 7). This is exactly the failure mode V3 Section G calls out by name: *"Never use the Teagasc agronomic available-N value as the legal N figure."* Here it happens in the *opposite* direction (an agronomic curve output is used as the compliance-ledger's stocking-rate input) but the effect — the two ledgers are not actually separate — is the same violation.
- **Incomplete:** Yes — `LivestockCategory` (`suckler_cow|dairy_cow|bull|calf|weanling|store|steer|heifer`) has no age-in-days or sex banding, so it cannot express Table 7's `calf_0_90_days` / `cattle_91_days_to_end_year1` / `cattle_female_1_2_years` / `cattle_male_1_2_years` / `cattle_over_2_years` distinctions, nor dairy milk-yield bands 1–3, nor the Table 7a CP-election path.
- **Must be replaced:** Yes — a real `GRASSLAND_STOCKING_RATE` function using `livestock_excretion_rates_2026.csv` must replace the LU-proxy entirely as the compliance-ledger input. The Green Book LU/Table 12-3 curve may remain, relabelled, as a genuinely separate *agronomic* N-requirement figure if still wanted — but must never again feed `checkNapCompliance`.
- **Must fail closed:** Yes, until real per-category/age/sex/yield-band livestock data exists.
- **Additional farm data required:** age-in-days or age band per group (not just `avgAgeMonths`, which is currently unused by any statutory calc), sex, and for dairy: milk-yield band + Table 7a CP-election/records status (`GFT019`–`GFT021`).

## 2.4 NAP N/P statutory ceilings

### `napMaxAvailableNGrazingKgHa` — `src/domain/nutrients.ts:371-382`
Bands: `≤85→90, ≤130→114, ≤170→185, ≤210→241, >210→214`.
- **V3 source:** `rules_statutory/grassland_available_n_max_2026.csv` — **identical values.**
- **Agrees with V3:** Agrees exactly on the numbers. **Feeds off the wrong stocking-rate input (2.3 above).**
- **Tests:** `nutrients.test.ts` covers band edges.
- **Must fail closed:** No, numerically correct — but effectively wrong today because of 2.3.

### `napMaxAvailablePGrazingKgHa` / `napEnhancedPBuildUpKgHa` — `src/domain/nutrients.ts:437-471`
Standard bands and "increased build-up" bands.
- **V3 source:** `rules_statutory/grassland_available_p_max_2026.csv` — **identical values for both the standard and `increased_build_up_CONDITIONAL` rows.**
- **Agrees with V3:** Agrees on the numbers. **Conflicts on eligibility:** `napEnhancedPBuildUpKgHa` is exported but **never called** from `calculateNutrientPlan` or `checkNapCompliance` today — so in the current production path it is inert (no false-positive risk yet). But it also has **no eligibility gate** implemented anywhere (V3's `P_BUILD_UP_ELIGIBILITY` requires adviser/NMP/training/OM-test/soil-test conditions, `rules_statutory/p_build_up_eligibility_2026.csv`). If a future change wires it in without that gate, it would violate V3 immediately (`GFT029`–`GFT036`).
- **Must be replaced:** The eligibility gate must be built *before* this function is ever called from a production path.

### `napMaxAvailableNCutOnlyKgHa` / `napMaxAvailablePCutOnlyKgHa` — `src/domain/nutrients.ts:419-490`
N: `85/70/30` by cut. P: `40/30/20/0` (1st cut) / `10/10/10/0` (2nd+) by index.
- **V3 source:** `rules_statutory/silage_for_sale_n_limits_2026.csv`, `silage_for_sale_p_limits_2026.csv` — **identical values.**
- **Eligibility today (`checkNapCompliance`):** `landUse === "cut_only" && cutIntendedForSale && orgNStockingRateKgHa <= 85`.
- **V3 contract:** `SILAGE_DESTINATION_REGULATORY_ROUTE` additionally requires **written evidence of sale** (`SILAGE_SALE_EVIDENCE` input, `required_input_fields.csv`) before the sale-route ceiling may be used at all (`GFT102` passes only `written_evidence:true`; `GFT103` — same GSR/eligibility but `written_evidence:false` — must NOT use the sale table).
- **Agrees with V3:** **Conflicts.** The current gate is missing the written-evidence condition entirely — any field with `SilagePlan.intendedUse: "sale"` and `orgNStockingRateKgHa <= 85` gets the higher ceiling with no evidence check.
- **Incomplete:** `SilagePlan.intendedUse` is `"own_livestock" | "sale" | "both"` — V3 wants `own_feed / sale / mixed / unknown`, with `unknown` as the safe default and `mixed` not automatically treated as `sale`-eligible. Today `"both"` is treated identically to `"sale"` (`cutIntendedForSale = intendedUse === "sale" || intendedUse === "both"`).
- **Must be replaced:** Yes — add the evidence field and gate; fix the `mixed`/`both` handling.
- **Must fail closed:** Yes, until evidence is captured.

## 2.5 Slurry — agronomic offset vs. statutory compliance ledger

### `SLURRY_TABLE_9_8` / `slurryAvailableKgHa` — `src/domain/nutrients.ts:273-336`
Green Book Table 9-8, DM%-column × rate-interpolated agronomic N/P/K availability.
- **V3 source (newer):** `advisory_teagasc/cattle_slurry_available_npk_spring_LESS.csv` — a flat per-m³ rate by DM% (spring/LESS method only), not rate-dependent. This is a **different, more current (2026)** Teagasc source than the 2020 Green Book table currently implemented.
- **Agrees with V3:** **Partial / needs reconciliation.** Both are legitimately "agronomic ledger" sources, but they are two different editions with two different models (rate-independent flat value vs. rate-interpolated grid) and V3's evidence precedence (Section A3) favours the more current Irish source. The current code does not reference or reconcile against the newer table at all.
- **Must be replaced:** Should be re-evaluated against the 2026 table; at minimum the source conflict must be logged in a source-conflict register (V3 already has `implementation/source_conflict_register.csv` for exactly this purpose — not yet checked against this file).

### Statutory compliance-ledger slurry values — **Missing entirely**
`rules_statutory/organic_manure_total_np_2026.csv` (e.g. cattle slurry 2.4 kg N/m³, 0.5 kg P/m³ total) and `rules_statutory/nutrient_availability_2026.csv` (e.g. 40% N availability for cattle manure, P availability by index) have **no implementation anywhere in the codebase.** `checkNapCompliance` checks the *agronomic gross requirement* (`grossN`/`grossP`, before the slurry offset) against the statutory ceiling — not "statutory total N/P actually applied" computed from the statutory deemed values. This is the same agronomic/compliance conflation pattern as 2.3, in the slurry ledger.
- **V3 contract:** `COMPLIANCE_MANURE_NP` — "statutory total nutrient value × statutory availability... Do not substitute a Teagasc agronomic replacement value into the legal ledger."
- **Must be replaced:** A genuine second (compliance) ledger must be built using the statutory tables; `checkNapCompliance` must check statutory applied N/P (organic, at statutory values, + chemical), not the Green Book gross requirement figure.
- **Must fail closed:** Yes, until built.

### LESS method gate — **Missing (dead parameter)**
`CalculateNutrientPlanInput.slurryMethod` and `slurryTiming` (`src/domain/nutrients.ts:647-648`) are declared but **never read inside `calculateNutrientPlan`** — confirmed by source inspection, they appear nowhere else in the file. No `LESS_METHOD_GATE` logic exists: no GSR≥100 trigger, no pig-slurry-always-LESS rule, no arable-24h-incorporation alternative, no steep-slope H&S exception.
- **V3 contract:** `LESS_METHOD_GATE` — "Do not certify slurry plan [without it]."
- **Must be replaced:** Yes — either wire the field through to a real gate or remove it until it does something, since an unused field currently gives the false impression the method is already considered.
- **Must fail closed:** Yes (`GFT052`–`GFT055`).

### Soiled water rolling-window compliance — **Missing entirely**
No 42-day cumulative volume ledger, no 5 mm/hour rate check, anywhere in the codebase.
- **V3 contract:** `SOILED_WATER_APPLICATION_GATE`. Must fail closed (`UNKNOWN`) until built.

### Slurry storage weeks (county minimum) — **Missing**
`Housing.storageCapacityM3`/`storageFillPct` exist but nothing checks against `rules_statutory/slurry_storage_weeks_2026.csv`'s county-based minimum (16/18/20/22 weeks) or the ≥20%-cross-county rule.

## 2.6 Spreading — weather/ground gate

### `assessWeatherHardStops`, `isGroundFrozen`, `isGroundSaturated`, `soilDrynessIndex` — `src/domain/spreading.ts`
- **Source:** Met Éireann SMD model (official), validated against 92 real Dunsany station days.
- **V3 contract:** partially corresponds to `SPREADING_LEGAL_GATE`'s ground/weather hard-stop checks (`SPREAD_STOP_WATERLOGGED`, `SPREAD_STOP_FROZEN_SNOW`) and to context-only use of SMD (`GAP_SMD_LEGAL_THRESHOLD` — "keep legal ground-state test separate from SMD advisory context").
- **Agrees with V3:** **Agrees, and is already well-aligned with V3's philosophy** — the module's own header explicitly refuses to invent a closed-period calendar, buffer logic, or an unvalidated 0–100 suitability score, for exactly the reason V3 states (`GAP_100_SCORE` — "arbitrary weights would create false scientific precision"). The Dashboard/Spreading UI already shows the composite score as "Under validation" (`BestSpreadingCard.tsx`) rather than presenting it as real. This is a rare case where existing engineering discipline pre-empted a V3 finding.
- **Incomplete:** Very — this module alone cannot produce `SPREADING_LEGAL_GATE`'s `PROHIBITED/PERMITTED/UNKNOWN` result. **Missing entirely:** the closed-period calendar (`closed_periods_2026.csv`), all buffer distances (`buffer_distances_2026.csv`), the commonage gate, LESS gate, soiled-water gate, heavy-rain-forecast-48h stop, steep-slope+runoff stop (`steep_slope_definitions_2026.csv`), and the (empty, correctly-so) dynamic exception-event registry. `isGroundFrozen`'s 10cm-soil-temp≤0°C proxy is a reasonable stand-in for the statutory "frozen or snow-covered" test but is not literally the same test (no snow-cover signal exists).
- **Must fail closed:** The overall spreading recommendation must fail closed (`UNKNOWN`) until the calendar/buffer/commonage/LESS layers exist — today there is no such overall gate function at all, only the two weather hard stops.
- **Additional farm data required:** field-level commonage status, water-feature proximity/type, slope, county/zone (for the closed-period calendar), local buffer override status.

`mockSpreadingScores` (`src/data/mock-farm.ts:472+`) is rendered per-field on `/spreading` via `SpreadingFieldRow` — honestly labelled `calculationVersion: "spreading_engine_v1.0.0 (mock)"` in its own `TrackedValue`, so it is not mislabelled as real, but it is still a live, farmer-facing per-field "score" built entirely from invented numbers while the composite headline score has already been pulled for the same reason. Worth resolving consistently — either both mock views are pulled/marked, or a real, scoped-down field-level gate replaces both together per V3.

## 2.7 Fodder / feed

### Basic whole-farm fodder budget — **Missing (but coefficients pre-validated)**
No `BASIC_FODDER_DEMAND_FRESH_WEIGHT` calculation exists in the codebase — `mockForageInventory` (`src/data/mock-farm.ts:355`) is fully mock, confirmed by prior session log ("Overnight Phase 4: whole-farm feed balance investigated, BLOCKED"). Notably, V3's `advisory_teagasc/fodder_budget_current_2026_08_26.csv` coefficients (dairy cow 1.6, suckler cow 1.4, cattle 0–1yr 0.7, 1–2yr 1.3, 2+yr 1.3, ewe 0.15 t fresh/animal/month) are **new to this codebase** — nothing pre-existing conflicts with them, so this is a clean, additive build, not a replacement.
- **V3 contract:** `BASIC_FODDER_DEMAND_FRESH_WEIGHT`. Must fail closed for unsupported classes/missing planned months (`GFT098`, `GFT100`) and enforce the fresh-weight/DM basis gate (`FEED_BASIS`, `ENGINE_UNIT_RULE`) — no basis-tagging mechanism exists anywhere in the type model today (`SilagePlan.expectedYieldTDMha` is implicitly DM; nothing marks it explicitly).
- **Additional farm data required:** `LivestockCategory` needs an `ewe`/sheep category (none exists — `LivestockCategory` is cattle-only today) and a farmer-entered planned winter months field.

### DMD → concentrate lookup — `CONCENTRATE_TABLE` / `concentrateKgPerDay` — `src/domain/livestock.ts:55-112`
- **Values:** weanling/finishing_steer/finishing_heifer rows at DMD 66/68/70/72/74/76 — **identical, cell-for-cell, to `advisory_teagasc/dairybeef_DMD_concentrate_lookup.csv`.**
- **Formula:** **linear interpolation** between adjacent DMD rows, clamped at range ends.
- **V3 contract:** `DMD_CONCENTRATE_GUIDANCE` — "exact lookup only... No interpolation... without validated evidence."
- **Agrees with V3:** **Conflicts, directly and testably.** V3's own worked example is this exact scenario: "DMD 73 does not automatically get interpolated between 72 and 74 in production" (Spec §I5), and `GFT115` requires `DMD:73 → BLOCK_EXACT_LOOKUP`. The current function would instead return `(0.9+0.6)/2 = 0.75` kg/day silently. This is the clearest, most concrete conflict in the whole audit — right values, wrong access method.
- **Must be replaced:** Yes — replace interpolation with exact-row lookup + `BLOCK_EXACT_LOOKUP` for any DMD not on the table, and add the animal-class scope check (`GFT116`).
- **Tests:** `livestock.test.ts` currently tests the *interpolated* behaviour as correct — those tests must be rewritten, not just extended (see §5).

### `weanlingFirstWinterConcentrateKgPerDay` (60/65/70/75 DMD table) — `src/domain/livestock.ts:505-527`
Same linear-interpolation pattern. **No corresponding table exists in the V3 pack** (sourced to a workbook outside the supplied V3 evidence set) — needs reconciliation with `sources/source_register.csv` before a V3 conflict/agreement verdict can even be assigned. Flag as **unverified against V3**, and, if kept, must drop interpolation for the same reason as above once/if a matching V3-registered exact table is confirmed.

### `WEANLING_VARIABLE_ADG_POINTS`, `STEER_VARIABLE_ADG_POINTS`, `SUCKLER_COW_WINTER_RULES` — `src/domain/livestock.ts`
Real Teagasc research-trial evidence (explicitly labelled "evidence class B", "not a universal recommendation" in the code's own comments) — **none of these three tables appear in the V3 pack's `advisory_teagasc/` set or `sources/source_register.csv`.** Not a conflict (nothing in V3 contradicts them), but outside V3's current authoritative evidence set. Should be reconciled into a unified source register (add to `source_register.csv` or an app-local equivalent) rather than left as a silent gap in cross-referencing.

### Sheep (twin-ewe DMD/concentrate) — **Out of scope, correctly**
`LivestockCategory` has no sheep category at all, so `TEAGASC_SHEEP_2026`'s twin-bearing ewe table (V3) has nothing to attach to. This is fail-closed by omission, not a bug — but flag as a data-model gap for whenever sheep enterprises are supported (`ewe`/`hogget`/`lamb` categories, litter-size field, silage form/DMD/stage).

### Clover-N — **Missing entirely**
No clover-content field on `Field`, no dairy/drystock clover-N schedule implementation. Net-new module per V3 Section J (`CLOVER_N` family) — exact-row-only, no interpolation, legal N ceiling always overriding, exactly as it must be built.

### Concentrate CP seasonal legal gate / concentrate-P compliance ledger — **Missing entirely**
No CP% field on any feed/concentrate model, no seasonal (15 Apr–30 Sep) gate for dairy cows/cattle ≥2yr, no P-content-of-concentrate ledger feeding the farm's remaining statutory P allowance.
- **V3 contracts:** `FEED_CP_LEGAL_GATE`, `CONCENTRATE_P_COMPLIANCE`. Both must fail closed until built — and until built, nothing in the codebase currently prevents a future "least-cost ration" feature from silently breaching the 14% CP cap, since no gate exists to consult.

## 2.8 Livestock sale economics

### `calculateSellNowVsFinish` / `calculateLivestockEconomics` — `src/domain/livestock.ts:202-361`
- **V3 contract:** `SELL_HOLD_ECONOMICS` — "scenario analysis... NEVER infer 'sell now' from market price alone", and requires a trace of `current_value/future_value/feed_cost/housing_cost/carrying_cost/assumptions/price_source` (`GFT158`).
- **Agrees with V3:** **Partial.** The comparison is grounded in real farm data (weight, target weight, real concentrate cost) — it is not a bare "price is high" trigger, so it does not fall into the worst failure mode V3 warns about. But:
  - `costBreakdown` includes only a `"Concentrates"` line — **no housing cost, no carrying cost** anywhere in the calculation, though V3's required trace explicitly lists both (`GFT158`).
  - The output is framed as a directive `recommendation: { title, description }` (e.g. *"Finishing is forecast to return more than selling now"*) rather than a neutral scenario comparison — softer than V3's "autonomous sell instruction" failure case, but still headline-framed rather than comparison-framed (V3 Spec K / `GFT157`: "COMPARE_SCENARIOS_DO_NOT_REWRITE_INTENT").
  - No staleness check on `avgWeightKg`'s source date — `GFT156` requires a stale-liveweight flag; `TrackedValue.sourceDate` exists on the type but nothing reads it for this purpose.
- **Must be replaced:** Add housing/carrying cost lines, reframe as scenario comparison, add staleness flagging.
- **Must fail closed:** For groups with no current weight, no target/route, or no performance model — this part already happens correctly today (`calculateLivestockEconomics` returns `undefined` if `avgWeightKg` is missing), which is good, existing fail-closed behaviour worth preserving.

## 2.9 Fertiliser product blend

### `PRODUCTS` / `allocatePurchasedProducts` — `src/domain/nutrients.ts:578-620`
Three fixed products (0-7-30 €480/t, 18-6-12 €620/t, Protected Urea 46-0-0 €555/t), prices manually copied from `mockMarketPrices`.
- **V3 contract:** `FERTILISER_PRODUCT_ADMISSIBILITY` — apply the uninhibited-solid-urea exclusion (`rules_statutory/fertiliser_product_restrictions_2026.csv`) before any product is offered; "Do not infer inhibitor status from product name."
- **Agrees with V3:** **Conflicts.** `FertiliserProduct` has no `formulation`/`physicalForm`/`ureicNPct`/`inhibitorStatus` fields at all — the code implicitly relies on the product being *named* "Protected Urea" to be safe from the exclusion rule, which is exactly the inference V3 prohibits.
- **Must be replaced:** Add explicit inhibitor/formulation metadata to `FertiliserProduct` and gate product selection on it, not the name string.
- **Must fail closed:** Yes, for any product with unknown inhibitor status once the field exists.
- Prices themselves are already honestly Phase-1-mock (documented as such in the file's own comment) — not a V3 conflict, just an open commercial-data gap.

## 2.10 Whole-farm aggregation (`finance.ts`)

All `calculateFarm*` functions in `finance.ts` are thin, versioned, real re-aggregations of the domain functions above (no new constants of their own) — they inherit every finding above (most importantly 2.3's stocking-rate conflation, since `calculateFarmFertiliserRequirement`/`Cost` call `calculateNutrientPlan` per field) rather than introducing new ones. No separate audit entries needed; fixing 2.1–2.9 upstream fixes these automatically once re-run.

## 2.11 Market price data (`market.ts`)

Real CSO series (cattle, fertiliser, agri input/output indices), correctly labelled `estimated`/`verified`, correctly kept separate from any farm-specific "sell now" instruction (feeds `SELL_HOLD_ECONOMICS`' `price_source` input only). No V3 conflict found. Not a "calculation" in the regulatory/agronomic sense V3 is concerned with — included here for completeness only.

## 2.12 Dashboard / mock recommendation surfaces

### `mockAlerts` — `src/data/mock-farm.ts:656-661`, rendered by `AlertsCard.tsx`
Four fully invented alert objects ("Soil test due", "Fertiliser window open", "Slurry spreading conditions", "Feed budget attention") shown under the heading **"Alerts & Recommendations"** on the live Dashboard — not derived from any calculation, compliance check, or `TrackedValue`.
- **V3 relevance:** every one of these alert types maps to a real V3 decision type (`DATA_REQUEST`, `SPREADING_LEGAL_GATE` output, `WARNING`, feed compliance) that must eventually be a real `DecisionRecord`. Today they are indistinguishable in the UI from a real recommendation. **Must be replaced** with real decision records once the underlying V3 modules exist; until then this card is presenting invented content as farm-specific advice, which V3's release philosophy (Section 4) exists specifically to prevent.

### Dashboard hard-coded literals — `src/app/dashboard/page.tsx:46-49, 76`
```
value={formatEur(121_400)}   // "Total Revenue"
value={formatEur(73_580)}    // "Total Costs"
value="2,850 m³"             // "Slurry available"
```
These are typed directly into JSX — not even routed through a named `mock-farm.ts` constant, let alone a domain module. This is a direct `CLAUDE.md` violation ("No magic numbers in UI/components... constants come from a controlled rules/data module") independent of V3, and should be corrected as part of the same pass since it sits on the same screen as the alerts above.

### `WholeFarmFeedBalanceCard` — real component, mock input
The component itself is a clean, real, versioned display of whatever `ForageInventory` it's given (`src/components/farm/WholeFarmFeedBalanceCard.tsx`) — the problem is entirely upstream: both `/silage` and (implicitly, via the same mock export) any other consumer pass `mockForageInventory`, so the "Silage deficit risk" `AlertBanner` it renders is a real UI reacting to fabricated numbers. Fixing 2.7's basic fodder budget resolves this without touching the component.

---

# 3. V3 conflicts — ranked

These are the findings above that **actively contradict** a V3 rule, test, or architecture principle (not just "missing"), in descending order of risk:

1. **Statutory GSR replaced by a Green Book agronomic LU curve** (§2.3) — the figure gating every field's NAP N/P ceiling is not the statutory Table 7 excretion calculation at all. Highest-risk finding: it silently affects every nutrient-plan/NAP-compliance number in the app today.
2. **DMD→concentrate lookup interpolates between exact table rows** (§2.7) — directly fails `GFT115` and the literal "no interpolation" instruction in `calculation_contracts.csv`.
3. **Soil P Index silently classifies the 8.00–8.01 ambiguous micro-gap as Index 4** (§2.1) — fails `GFT006`; a real farm with a lab result in that narrow band gets a false-definitive classification today.
4. **Statutory slurry compliance ledger does not exist; the agronomic gross requirement is checked against the NAP ceiling instead of statutory applied N/P** (§2.5) — same agronomic/compliance conflation pattern as #1, in a different ledger.
5. **Cut-only silage NAP ceiling has no written-sale-evidence gate** (§2.4) — fails `GFT103`.
6. **`slurryMethod`/`slurryTiming` accepted as input but never read** — gives the false impression method is already considered when it is not (§2.5).
7. **Fertiliser product admissibility inferred from product name ("Protected Urea"), not explicit inhibitor metadata** (§2.9).
8. **Reports section reconstructs figures live from current farm state on every export rather than persisting an immutable calculation-time trace** (§4) — fails `AF016`/`GFT164`/`RPT002`/`RPT012` at the architecture level.
9. **Livestock sell/hold output framed as a directive recommendation, missing housing/carrying cost and staleness flagging** (§2.8) — softer conflict, real data underneath but incomplete trace and directive framing.

---

# 4. Reports section vs. the Recommendation Audit Trace

Current state (`src/lib/reports.ts`, `src/app/reports/page.tsx`): three CSV
builders (`buildNutrientPlanReportCsv`, `buildSoilTestHistoryReportCsv`,
`buildFarmPlanSummaryReportCsv`), each of which **calls the live domain
engine at export time** and serialises whatever the farm's *current* state
produces. There is no persisted `CalculationRun`, no `DecisionRecord`, no
`InputEvidence`/`CalculationStep`/`ComplianceCheck`/`AssumptionOrGap`/
`SourceReference` model anywhere — no database/store table for any of
these — and no peer-review status field on anything.

Gap against `reports/RECOMMENDATION_AUDIT_REPORT_SPEC.md`, point by point:

| V3 requirement | Current state |
|---|---|
| Persist trace at calculation time (§1) | **Missing** — every export re-derives from live state |
| All 8 decision types reportable (§2) | **Missing** — no decision-type taxonomy exists; only "positive" nutrient/soil/farm-plan rows are exportable, nothing for no-action/legal-stop/warning/blocked |
| Mandatory report metadata: run ID, snapshot ID, ruleset ID/effective dates, source-check date, build SHA, unit-policy version, trace SHA-256 (§3) | **Missing** entirely |
| Decision / Why? / Input evidence / Calculation trace / Scientific rationale / Compliance checks / Assumptions / Evidence quality / Alternatives / Missing evidence / Sources / Peer review (§4 A–L) | **Missing** — CSVs contain final numbers only, no step trace, no evidence-state labels, no compliance-check list, no alternatives, no peer-review field |
| Reports-page UX: KPIs, filters, Why?/drilldown, run comparison (§5) | **Missing** — the page is a static list of 4 export buttons |
| Audit Data Pack (.zip of 8 joined CSVs) + JSON machine trace (§6) | **Missing** |
| Reproducibility SHA-256 fingerprint (§7) | **Missing** |
| LLM narrative boundary/labelling (§8) | **N/A today** — no LLM narrative is generated anywhere in the app yet, so there is nothing mislabelled; this becomes a live requirement the moment any narrative feature is added |
| Production release gate on missing provenance (§9) | **Missing** — nothing currently blocks a numeric output for lacking a decision ID/run ID/trace, because none of those concepts exist yet |

**Verdict:** this is a from-scratch build, not a refactor. All 24
`report_acceptance_tests.csv` tests and all `GFT159`–`GFT180`/reports-related
golden tests currently fail by absence (no code path produces the required
artefacts to test against). The one asset that *is* reusable: `lib/csv.ts`'s
CSV serialisation and the existing habit (already followed in
`reports.ts`'s own doc comment) of never exporting a number that isn't
already produced by a real, tested domain function — that discipline should
carry forward into the new `CalculationRun`/`DecisionRecord` persistence
layer.

---

# 5. Existing tests — adequacy review

Test suite: `src/domain/*.test.ts`, 3,366 lines across 13 files. All are
real unit tests against real domain functions (no test currently exercises
mock data as if it were a calculation) — a genuine strength to build on.
Specific inadequacies relative to V3:

- **`nutrients.test.ts`** — tests `pIndexFromMgL` boundaries at exactly
  3.04/5.04/8.0 but **not** the 8.00–8.01 ambiguous zone (`GFT005`–`GFT007`
  are not represented) and **not** the `other_crop` crop group at all
  (`GFT008`–`GFT010`). Tests `checkNapCompliance`'s ceiling-lookup logic
  correctly for the values it's given, but never tests it against a
  statutory-Table-7-derived stocking rate, because no such input path
  exists yet — the tests are internally consistent with the *current*
  (conflated) implementation, which is exactly the problem: they will
  need to be rewritten, not extended, once §2.3 is fixed, since their
  current "expected" values assume the LU-curve figure is correct.
- **`livestock.test.ts`** — explicitly tests and asserts the *interpolated*
  DMD concentrate value as correct behaviour (§2.7's conflict #2). These
  assertions must be replaced with exact-lookup + `BLOCK_EXACT_LOOKUP`
  assertions, not kept alongside new ones — the current passing test is
  itself evidence of the conflict, not a safety net against it.
- **No test file exists for:** soil test validity/staleness, commonage
  gate, LESS gate, soiled water gate, concentrate CP/P compliance, silage
  destination/evidence routing, fertiliser product admissibility, clover-N,
  the closed-period spreading calendar, buffer distances, or any Reports/
  trace/peer-review behaviour — because none of that production code
  exists yet. This mirrors §2/§4 exactly: test debt tracks implementation
  debt one-to-one here, there is no case of missing tests for code that
  does exist.
- **`spreading.test.ts`** — adequately covers what the module actually
  does (SMD rescale, frozen/saturated hard stops, trend) against the real
  Dunsany validation series. No inadequacy relative to the module's
  (deliberately narrow) current scope.
- **`finance.test.ts`, `feed-cost.test.ts`, `market.test.ts`,
  `farm-stats.test.ts`, `provenance.test.ts`** — adequate for what they
  cover; inherit the same upstream gaps as their domain modules (§2.10)
  rather than having independent inadequacies.

None of the 180 `golden_farm_tests.csv` scenarios are implemented in this
codebase's test suite today (confirmed by file-name/content search — no
`GFT0xx`/`GF0x` identifiers appear anywhere in `src/`). All 24
`report_acceptance_tests.csv` (`RPTxxx`) are likewise absent.

---

# 6. Summary

## 1. Calculation/recommendation count found
**~48 distinct calculation or recommendation surfaces** audited:
- 33 real, versioned domain functions/constant tables across `nutrients.ts`,
  `spreading.ts`, `livestock.ts`, `feed-cost.ts`, `finance.ts`, `farm-stats.ts`,
  `market.ts`.
- 1 page-level constant outside the domain layer (`CATTLE_PRICE_EUR_PER_KG_CARCASS`).
- 4 mock/live-rendered "recommendation" surfaces presented in production
  screens without a real calculation behind them (`mockAlerts`,
  `mockForageInventory`, `mockSpreadingScores`, dashboard's hard-coded
  Total Revenue/Total Costs/Slurry-available literals).

## 2. Unsupported constants found
- **12 constant tables** sourced to material outside the V3 pack's
  `sources/source_register.csv` and not yet reconciled against it: Green
  Book P/K build-up & maintenance bands (5 tables), Green Book N-grazing
  Table 12-3, Green Book slurry Table 9-8, the weanling first-winter DMD
  table, both variable-ADG evidence-point sets (weanling, steer),
  `SUCKLER_COW_WINTER_RULES`, and both feed-cost/mineral € benchmarks.
  None of these actively conflict with a V3 value — they simply have no
  corresponding entry in the V3 evidence set to be checked against, and
  should be added to a unified source register.
- **6 genuinely unsupported (mock/commercial) numbers** presented as if
  real in production UI: 3 fertiliser product prices, the `?? 5.42`
  cattle-price fallback, and the 4 items in the mock-recommendation list
  above.

## 3. V3 conflicts found
**9 direct conflicts**, ranked in §3 — most seriously, the statutory
Grassland Stocking Rate being replaced by a Green Book agronomic curve
(affects every field's NAP compliance number today), and the DMD
concentrate lookup silently interpolating where V3 mandates an exact-row
block.

## 4. Missing data fields
At minimum, to reach V3's `required_input_fields.csv` baseline:
`FIELD_COMMONAGE_STATUS`, `SILAGE_SALE_EVIDENCE`, a corrected
`SILAGE_DESTINATION` enum (`own_feed/sale/mixed/unknown`, not today's
`own_livestock/sale/both`), a working (currently dead)
`SLURRY_APPLICATION_METHOD`, `LOCAL_WATER_BUFFER_OVERRIDE`,
`CONCENTRATE_CP_PERCENT`, `CONCENTRATE_P_CONTENT`,
`FERTILISER_UREA_INHIBITOR_STATUS`, an explicit `FEED_BASIS` tag,
`RECOMMENDATION_REVIEW_STATE` — plus, to fix conflict #1: livestock
age-in-days/sex banding and dairy milk-yield band + Table 7a election/
records status; and to fix soil-test validity: report issue date,
georeference/LPIS linkage, and OM sample date, none of which are captured
distinctly from the existing `SoilTest` fields today.

## 5. Existing tests that are inadequate
- `nutrients.test.ts`'s NAP-ceiling and P-Index tests assume the current
  (non-V3-compliant) stocking-rate and P-Index-8.01 behaviour as correct
  — must be rewritten, not extended.
- `livestock.test.ts` asserts the interpolated DMD-concentrate value as
  correct — must be rewritten to assert exact-lookup + block behaviour.
- No test coverage exists for any of the 8 new V3 mandatory gate modules
  (`COMMONAGE_FERTILISER_GATE`, `LESS_METHOD_GATE`,
  `SOILED_WATER_APPLICATION_GATE`, `CONCENTRATE_P_COMPLIANCE`,
  `FEED_CP_LEGAL_GATE`, `SILAGE_DESTINATION_REGULATORY_ROUTE`,
  `FERTILISER_PRODUCT_ADMISSIBILITY`, `RECOMMENDATION_AUDIT_TRACE`) or for
  the closed-period spreading calendar, buffers, clover-N, or soil-test
  validity — because none of that code exists yet.

## 6. Proposed implementation sequence

1. **Fail-closed foundation first** — before any calculation change: add
   the missing `Field`/`LivestockGroup`/`SilagePlan`/`FertiliserProduct`
   data fields from §6.4, defaulting every new field to its safe/unknown
   state, and make every downstream function that needs one of them return
   a `BLOCKED_INSUFFICIENT_EVIDENCE`-equivalent state rather than silently
   assuming a default. This alone stops several current false-definitive
   outputs (commonage, LESS, silage-sale-evidence) without yet building
   the real logic behind them.
2. **Fix the two agronomic/compliance-ledger conflations** (ranked #1 and
   #4 in §3) — replace the LU-curve-based stocking rate with a real
   statutory-Table-7 `GRASSLAND_STOCKING_RATE`, and build the missing
   statutory slurry compliance ledger. These gate the most numbers in the
   app today, so fixing them first prevents rework of everything built on
   top afterward (NAP checks, Reports, Finance aggregation all consume
   this figure).
3. **Fix the two literal-boundary/interpolation conflicts** (#2 and #3) —
   `pIndexFromMgL`'s ambiguous-zone handling and the DMD concentrate
   exact-lookup — both are small, self-contained, high-value corrections
   with direct golden-test coverage (`GFT005`–`GFT010`, `GFT109`–`GFT116`).
4. **Build the new V3 gate modules** in the order the adversarial audit
   itself ranks them by risk (`ADVERSARIAL_AUDIT_REPORT.md` §1): commonage
   → LESS method → soiled water → concentrate-P → concentrate-CP →
   silage-destination/evidence → fertiliser-product-admissibility →
   local-buffer-override qualification. Each ships with its own golden
   tests from `validation/golden_farm_tests.csv` before moving to the next.
5. **Build the closed-period spreading calendar and buffer engine**,
   composing with the existing (already-compliant) weather/ground hard
   stops in `spreading.ts` rather than replacing them — this is the
   biggest single net-new module (52 zone/county/material rows) and
   depends on nothing else above except the commonage/LESS/soiled-water
   gates already being in place to compose into one `SPREADING_LEGAL_GATE`.
6. **Build the basic whole-farm fodder budget** (`BASIC_FODDER_DEMAND_FRESH_WEIGHT`)
   — clean, additive, coefficients already effectively pre-validated
   against V3 — and wire it to replace `mockForageInventory`, resolving
   the Silage-deficit-risk alert's mock-data problem as a side effect.
7. **Build clover-N and the seasonal feed CP/P legal gates** — net-new,
   no existing code to reconcile, straightforward exact-row implementations.
8. **Build the `RECOMMENDATION_AUDIT_TRACE` / Reports architecture** last,
   once the modules above exist to produce real `DecisionRecord`s worth
   persisting — building the trace layer before the decisions it traces
   exist would mean designing it against guesses rather than real
   `CalculationStep`/`ComplianceCheck` shapes. Replace `mockAlerts` and the
   Dashboard's hard-coded revenue/cost literals with real `DecisionRecord`-
   derived content in the same pass, since both depend on decision records
   existing.
9. **Reconcile the unsupported-but-not-conflicting constants** (§6.2) into
   a unified source register alongside `sources/source_register.csv`,
   and re-run/rewrite the two test files flagged in §6.5, throughout —
   not as a final step, but continuously as each numbered step above lands.
