# Slurry Recommendation Evidence Audit

Audit of `farm-return-next` at `f2d95c7` against the proposed evidence contract
for an automatic cattle-slurry recommendation engine. This is an audit only:
no product logic, schema, migration or UI was changed.

Method: every item below was traced through its migration (table/column), row
type (`src/lib/farm-data/row-types.ts`), mapper (`src/lib/farm-data/mappers.ts`),
write path (data-layer function / RPC / server action), read path (domain or
orchestration consumer) and UI capture/display. The report does not rate an
item as trustworthy because a TypeScript interface declares it. All findings
come from static reading of the code. No live Dev database or UI session was
used. Where a claim is about runtime behaviour, it is marked **(static trace)**.

**Evidence basis.** Two kinds of claim appear in this document and are kept
distinct:

- **Confirmed from code**: what the repository's source, migrations and
  tests show a code path does. These findings are logically established by
  the repository, but only for the code as written at `f2d95c7`.
- **Requires live/runtime validation**: what that code path would produce
  for real farm data in a deployed environment (for example, how many live
  candidates are affected, or which records exist in Dev). This audit did not
  observe any runtime behaviour. A code-path finding here is not a proven
  live failure unless it says so explicitly.

**Environment state.** This audit did not query any Supabase project, so
the repository alone cannot establish what is deployed anywhere. The one
environment fact recorded here comes from outside the repository: the three
2026-09-25 slurry migrations
(`20260925000000_slurry_allocations_farmer_planned.sql`,
`20260925010000_create_farmer_planned_slurry_allocation_rpc.sql`,
`20260925020000_slurry_allocations_store_capacity_invariant.sql`) **have been
applied to `Farm Return V1 Dev` and independently verified as present**. An
earlier version of this audit said they were not applied. That was wrong,
and has been corrected throughout. No other statement about Dev, production
or deployed data is made. Where such a statement would be needed, the text
says the state cannot be established from repository evidence.

Layer abbreviations: **R** = RATE, **C** = COMPLIANCE, **V** = TOTAL_VOLUME,
**E** = ECONOMIC, **A** = ACTIONABILITY.

Evidence-kind vocabulary used throughout: **measured** (lab/instrument),
**farmer-declared** (typed or selected by the farmer), **derived** (computed
deterministically from other stored evidence), **assumed** (a default the
system substitutes when no evidence exists).

---

## 1. Executive summary

1. **Farm Return has a solid fail-closed and provenance *framework*. It is
   missing much of the slurry-specific *evidence*.** `EngineOutcome`
   (`src/domain/evidence.ts`), `TrackedValue` + `farmerAdjust`/`verify`
   (`src/domain/types.ts`, `src/domain/provenance.ts`), insert-only evidence
   tables (`slurry_composition_records`, `slurry_contractor_cost_declarations`,
   `lab_results`, `soil_interpretations`, `job_actuals`,
   `market_price_observations`), Phase 5–10 economic/actionability engines and
   the Phase 7.1 assessment fingerprint are all real and reusable. A second
   provenance system is not needed.

2. **The production What Matters code path
   (`src/app/actions/what-matters-pilot.ts`) drops evidence the farmer has
   already entered.** The wiring gaps below are confirmed from code; their
   effect on real farm data requires live/runtime validation:
   - `calculateNutrientPlan` is called **without `slurryComposition`**
     (lines 230–231). As written, every economic assessment on this path
     therefore uses the national-average 6.3 % DM, so a farmer's recorded
     DM % never reaches this ranking path. On the LESS path that DM value
     never matches a published row (2/4/6/7 %), so **positive-volume LESS
     allocations in the tested contexts remain blocked**. That holds even
     when the farmer has recorded a DM % for the store. The exact reason code
     depends on which input is unsupported: the unsupported DM class yields
     `BLOCK_NO_INTERPOLATION` (e.g. March and June at 6.3 %), while an
     unsupported timing context (e.g. September) yields
     `SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED` instead. The same call also
     omits `pBuildUpCompliance`, `nonGrassPct` and silage inputs.
   - `buildSpreadingActionabilityFoundation` is called **without
     `bufferInput` or `commonageStatus`** (lines 479–492). Both conditions
     therefore always resolve `UNKNOWN`. `evaluateSlurryActionability`
     (`slurry-actionability-policy.ts:386–388`) then returns
     `UNKNOWN_REGULATORY_EVIDENCE_INCOMPLETE` before the Rainfall Window
     Score or any farmer ground-condition confirmation is reached. **As
     wired in code, no candidate on this path can become `ACTIONABLE`.**
     This happens even though the farmer is asked for commonage status and
     water-buffer context on every field (`FieldDrawer.tsx:417–526`), so the
     existing commonage/water-buffer evidence is not forwarded. (Confirmed
     from code. Whether any live farm has so far reached this state requires
     runtime validation.)
   - `listFieldsForFarm` returns archived fields, and the pilot does not
     apply `activeFields()`. **Archived fields are therefore included: they
     inflate `farmGrasslandAreaHa` and can become candidates.** This breaks
     the rule stated in `types.ts:279–297`. (Confirmed from code. Its
     live impact depends on whether a farm has archived fields.)
   - No production caller of `buildAllRealPrompts` passes
     `slurryCompositionRecords` (`today/page.tsx:128`, `plan/page.tsx:68`,
     `fields/page.tsx:130`). Today/Plan/Fields fertiliser prompts also
     ignore recorded composition. Only the Nutrients screen uses it, and
     even there a multi-store field resolves to `housingId: "multiple"`,
     misses the lookup and falls back to 6.3 %.

3. **Physical, regulatory-neat and agronomic slurry are not kept distinct:**
   - *Physical volume* = `housing.storage_capacity_m3 × storage_fill_pct / 100`
     (`slurry-storage.ts:54`). Both inputs are farmer-declared. Capacity has
     no provenance. A blank fill level is stored as `0` / `estimated`.
   - *Regulatory neat slurry* is **not represented anywhere**.
     `statutoryManureNutrientValuePerHa("cattle_slurry", totalM3, …)`
     (`nutrients.ts:2067`) applies the statutory 2.4 kg N / 0.5 kg P per m³
     (neat cattle slurry, `organic_manure_total_np_2026.csv`) directly to the
     **physical allocated volume**. The code therefore implicitly assumes
     that the physical volume is undiluted neat slurry.
   - *Agronomic composition* is DM % only. Recorded total N/P/K are
     deliberately unused. NH₄-N is not captured.

4. **The allocation lifecycle is incomplete.** `slurry_allocations` has no
   planned/spread/cancelled state, and the app has no update-volume or
   delete path. The new DB invariant
   (`20260925020000_slurry_allocations_store_capacity_invariant.sql`)
   rejects lowering a store's volume below its allocations. After slurry is
   spread, a farmer who records a lower fill level is therefore blocked
   (`housing_store_volume_below_allocated`) and has no in-app way to release
   the spent allocation. Spread slurry (`job_actuals` `slurry_spreading`)
   is never linked back to allocations or tanks. (Confirmed from code and
   migrations.) All three 2026-09-25 slurry migrations, including
   `20260925010000_…rpc.sql` and `20260925020000_…invariant.sql`, **have
   been applied to `Farm Return V1 Dev` and verified outside this audit**
   (see Environment state above). The invariant is therefore in force on
   Dev, and this lifecycle gap is reachable there. Whether any Dev farm has
   actually hit `housing_store_volume_below_allocated` requires runtime
   validation.

5. **Soil evidence has one working P/K Index per field and no separation of
   measured from regulatory Index:**
   - `fields.fertility.pIndex/kIndex` hold one working `TrackedValue`. A
     farmer tap on the Soil screen's "P Index (assumption)" selector
     (`SoilFieldCard.tsx:129–140`, `updateFieldIndex`) overrides a lab-derived
     `verified` index. `calculateNutrientPlan` consumes the working value, and
     `checkNapCompliance` still labels the result `compliance_value`
     (`nutrients.ts:1381`).
   - A **regulatory / deemed P Index cannot be represented separately** from
     a measured one. The statutory "no valid test" defaults are in the rule
     CSV (`SOIL_HIGH_STOCKING_NO_TEST`, `SOIL_ARABLE_NO_TEST`) but not in
     code.
   - K Index peat bands never apply in practice. `mapped_soil` is always
     null because `resolveSoilForFieldPolygon` always returns
     `SOIL_DATASET_NOT_INTEGRATED`, so K Index silently uses mineral bands.
   - On the guided lab path, `lab_results.analysis_date` is written into
     `SoilTest.sampleDate` (`orchestration/lab-result/index.ts:217–218`), so
     the 4-year validity rule runs off the analysis date.

6. **The statutory GSR cannot resolve for a realistic cattle herd.**
   `createLivestockGroup` always writes `avg_age_months: null` and
   `sex: null` (`lib/farm-data/livestock.ts:56–58`), and no UI edits them.
   `calculateStatutoryGrasslandStockingRateKgHa` therefore blocks for every
   non-suckler-cow group. This in turn blocks NAP compliance and the LESS
   `LESS_GSR_100` trigger. Even when it resolves, it uses **current**
   headcount rather than the statute's previous-year figure, and it counts
   every group, including housed-system groups.

7. **Fields support gross area only; a defensible spreadable area cannot be
   calculated.** Buffers are one farmer-typed "nearest feature + distance"
   per field, applied as a whole-field prohibition. No water-feature, karst,
   slope, drainage, LPIS or flood dataset is integrated.

8. **Economic evidence is the strongest area.** Prices come from real,
   provenance-bearing CSO benchmarks for three products. Contractor cost is a
   persisted farmer declaration. Unknown values are kept separate from zero
   end to end. The production ranking code path, however, ranks farmer-entered allocations
   independently. The Phase 6 finite-resource optimiser
   (`buildSlurryWholeFarmAllocation`) exists but has **no production caller**.

9. **Farmer effort:** today a farmer builds a slurry plan by typing store,
   field, volume, method and date for each field (`SlurryPlanForm.tsx`).
   None of these values is proposed by the system. Several already-captured
   answers are then not used by the recommendation chain (commonage, buffer,
   composition). A "tap Build slurry plan → one batch confirmation →
   recommended plan" flow is **not achievable yet**. §9 lists the blockers.

10. **Scientific conflicts are recorded in §12 and none was resolved in
    code.** This audit found and recorded several more:
    - Table 9-8 rate clamping: rates below 11 m³/ha are credited as
      11 m³/ha.
    - Nearest-DM-column snapping on the splashplate path.
    - The P 0.5 vs 0.6 kg/m³ Signpost discrepancy.
    - Statutory neat coefficients applied to physical volume.

---

## 2. Full evidence matrix

Columns (all 18 contract items are present; some share a cell):

- **Evidence**: canonical name (1) · purpose (2)
- **Layers** (3)
- **Status** (4)
- **Persistence** (5): table.column, or TS type (6) where no column exists
- **Write → Read** (7, 8): persistence path → runtime read path
- **UI** (9): capture/display path
- **Provenance · freshness** (10, 11): what is retained, including the kind
  (measured / farmer-declared / derived / assumed)
- **Asked? / Re-asked?** (12, 13)
- **Derive? / External?** (14, 15)
- **Gap / risk** (16)
- **Acquisition → Interaction** (17, 18)

### A. Calculation identity / provenance

| Evidence | Layers | Status | Persistence (TS type) | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| recommendation_context_id · binds one plan run | all | DERIVABLE_FROM_EXISTING_DATA | none. Per-action ids only: `recordId`/`assessmentId`/`evaluatedActionId` (`what-matters-pilot.ts:179–186`) | built in memory per request → not persisted | none | derived id pattern `record-slurry-allocation-{field}-{housing}-{asOfDate}` | no / – | yes (deterministic) / no | no whole-plan identity; per-day id collides for re-runs on the same day | system-generated → none |
| farm_id | all | EXISTS_TRUSTWORTHY | every table `farm_id`, RLS + `*_same_farm` triggers (`20260828070000_cross_farm_integrity.sql`) | RLS-enforced → `getFarmForCurrentUser` | – | server-bound | no / – | – | `AuditedActionOpportunityRecord` carries `fieldId`, not `farmId` (farm is implicit in the request) | reuse |
| field_id | all | EXISTS_TRUSTWORTHY | `fields.id`; `slurry_allocations.field_id` | – | – | – | no | – | allocation row id is dropped by `rowToSlurryAllocation` (`mappers.ts:225`); action identity is field+housing | reuse |
| calculated_at | all | EXISTS_WEAK_PROVENANCE | `evaluatedAt`/`createdAt` in memory; `decisions.decided_at` for accepted prompts | `evaluateWhatMattersPilot(input?.evaluatedAt ?? new Date())` | – | derived; **client can echo back `evaluatedAt`** (exported server action) | no | – | not server-authoritative on re-evaluation; not persisted | server-stamp on persisted run → none |
| scientific_ruleset_version | R | EXISTS_WEAK_PROVENANCE | constants: `NUTRIENT_ENGINE_VERSION` (`nutrient_engine_v1.0.0`), `ruleId` on `availableNutrientAssessment`, `SLURRY_COMPOSITION_VERSION` | stamped on `NutrientPlan.calculationVersion` → Phase 5 snapshot | Audit trail card | version string only | no | – | `nutrient_engine_v1.0.0` did not change through several documented behaviour changes (Slurry Application Context V1, Timing Patch V1); no composite ruleset id | versioned ruleset manifest → none |
| regulatory_ruleset_version | C | EXISTS_WEAK_PROVENANCE | per-gate constants (`CLOSED_PERIOD_CALENDAR_VERSION`, `BUFFER_GATE_VERSION`, `LESS_METHOD_GATE_VERSION`, `STATUTORY_*_VERSION`); `CURRENT_RULESET` (`source-register.ts:365`) is **inert** | foundation conditions carry `ruleVersion` | – | source ids + checked dates in `SOURCE_REGISTER` | no | – | no run is stamped with `CURRENT_RULESET`; calendar is not year-bounded (`BLOCKERS.md`) | stamp `CURRENT_RULESET` → none |
| economic_ruleset_version | E | EXISTS_WEAK_PROVENANCE | `SLURRY_DIRECT_ECONOMIC_ENGINE_VERSION`, `AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION`, `OPPORTUNITY_RANKING_ENGINE_VERSION`, `RAINFALL_WINDOW_SCORE_VERSION`, `SLURRY_ACTIONABILITY_POLICY_VERSION` | on in-memory records | – | versioned | no | – | **audited records are never persisted** (no table) | persist records → none |
| evidence_snapshot_hash | all | EXISTS_WEAK_PROVENANCE | `assessmentFingerprint` (`assessment-integrity.ts`, SHA-256 of the Phase 5 payload); `CalculationRun.traceSha256` (`audit-trace.ts`) for the evidence report | computed per request | – | covers **outputs** (plans, prices) but not the raw input evidence (soil test id, livestock snapshot, composition record, tank state) | no | – | cannot prove which inputs produced a plan after the fact | extend the fingerprint payload to input evidence ids/values → none |
| engine_version | all | EXISTS_TRUSTWORTHY (in memory) | as above | – | – | – | no | – | not persisted | reuse |

Reusable provenance assets: `decisions.calculation_version` +
`decisions.inputs_snapshot` + `decisions.estimate_snapshot`
(`20260829010000_decisions_jobs_client_access.sql`);
`TrackedValue.previous` chains; insert-only evidence tables; `EngineOutcome`
reason codes; `audit-trace.ts` `CalculationRun`/`DecisionRecord`/`sealCalculationRun`;
`assessment-integrity.ts` fingerprints; `nutrient-plan-trace.ts`. The
`audit-trace-local-storage.ts` / `peer-review-local-storage.ts` stores are
**browser localStorage**, not server evidence.

### B. Farm regulatory context

| Evidence | Layers | Status | Persistence (TS type) | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| farm county · closed-period zone, storage weeks | C, A | EXISTS_WEAK_PROVENANCE | `farms.county text not null` (`Farm.location.county`) | onboarding `createFarm` → `normaliseCountyForZoneLookup` → `checkClosedPeriodCalendar` | `OnboardingWizard.tsx:212–222` (select **pre-set to `IRISH_COUNTIES[3]`**) | farmer-declared; no status/timestamp; the preselected default is indistinguishable from a deliberate choice | yes, once / no | yes, from field centroids (point-in-county) / county boundaries (OSi) | a default county can silently select the wrong closed-period zone; cross-county holdings (≥20 % rule, `slurry_storage_weeks_2026.csv`) not modelled | derive from mapped fields; confirm if it differs → one confirmation |
| holding area ha | C | DERIVABLE_FROM_EXISTING_DATA | Σ `fields.area_ha` (active); `support_profile_facts.declared_area_ha` (BISS declaration) | `farmGrasslandAggregates` (`nutrients.ts:97`) | Fields list | derived from farmer-drawn polygons; declared area is a separate farmer declaration | no (declared area asked in Supports) / – | yes / LPIS for the eligible area | mapped ≠ LPIS-eligible area; unmapped legacy fields carry typed area | derive; compare to declared area → confirm on mismatch |
| grassland area ha · GSR denominator | C, R | EXISTS_BUT_WRONG_SEMANTICS | derived | `farmGrasslandAggregates`: every field whose `plannedUse` ≠ `tillage` counts, **including unset and `other`**; **pilot passes archived fields** | – | derived | no | yes / LPIS land-use | overstated denominator → understated GSR → wrong LESS/NAP band | derive from active fields with confirmed grass use → batch-confirm unclassified fields |
| previous-year GSR kg N/ha · LESS_GSR_100, NAP band | C | EXISTS_BUT_WRONG_SEMANTICS | none (computed) | `calculateStatutoryGrasslandStockingRateKgHa(groups, area)` (`statutory-excretion.ts:233`) → `checkLessMethodGate`, `checkNapCompliance` | NAP card | derived from **current** headcount, every group (incl. `system: "housed"`), no residency/days-present | no | partial / AIM herd register | statute is previous-year, grazing livestock, before export (`less_requirements_2026.csv`, `grassland_stocking_rate_definition_2026.csv`); in practice BLOCKED (see next row) | previous-year animal-days from external register or farmer confirmation |
| livestock population by Table 7 category (age/sex band) | C | MISSING_REQUIRES_FARMER_CONFIRMATION | `livestock_groups.count` (TrackedValue), `avg_age_months`, `sex`, `avg_milk_yield_kg_per_year`; `livestock_individuals.date_of_birth/sex` | `createLivestockGroup` writes **age/sex null always**; `updateLivestockGroup` has no age/sex; count overwritten without a `previous` chain and labelled `verified` although farmer-typed | Livestock screen | farmer-declared count; age/sex absent | count yes / – | yes, from `livestock_individuals` DOB/sex where recorded / AIM/ICBF | GSR, excretion, LESS trigger all BLOCKED for any non-suckler-cow group | derive bands from individual animals; batch-confirm group age band + sex → one table screen |
| derogation status | C | MISSING_EXTERNAL_DATA_INTEGRATION | none | – | – | – | no | no / DAFM derogation application | `gap_register.csv` `GAP_DEROGATION_FULL_ELIGIBILITY`: never grant from a farmer toggle | external authorisation evidence; fail closed to non-derogation → none initially |
| applicable derogation limit | C | OUT_OF_INITIAL_SCOPE | none | – | – | – | no | – | full Schedule 5/geographic ruleset absent | initial engine: non-derogation farms only; derogation farms BLOCKED |
| manure imports N/P | C | MISSING_REQUIRES_FARMER_ENTRY | none | – | – | – | no | no / DAFM Record 3 (no API) | farm organic-N balance unknowable | "No imports this year" batch confirm; entry only when yes |
| manure exports N/P | C | MISSING_REQUIRES_FARMER_ENTRY | none | – | – | – | no | no / Record 3 | same | same |
| livestock manure production N | C, V | DERIVABLE_FROM_EXISTING_DATA | none (Table 7, `TABLE_7_LIVESTOCK_EXCRETION`) | `totalStatutoryNKg` inside the GSR result | – | derived, statutory | no | yes once categorised / – | blocked by missing age/sex | reuse `calculateStatutoryGrasslandStockingRateKgHa` → none |
| livestock manure production P | C | DERIVABLE_FROM_EXISTING_DATA | Table 7 `totalPKg` exists | **never summed** (the GSR sums N only) | – | – | no | yes / – | P balance absent | new pure function over the same categorisation → none |
| regulatory neat cattle slurry quantity | V, C | BLOCKED_BY_UNRESOLVED_SCIENCE | none. `Housing.slurryEstimate` is a **mock placeholder** (`housing.ts:17–25`, `volumeM3: 0`, source `slurry_engine_v1.0.0 (mock)`) | placeholder written on create → shown on Housing via `NutrientValueRow` | Housing "Estimated nutrient value" shows **"0 kg"** N/P/K for real farms | assumed placeholder | no | – / statutory weekly production rates not in repo (`evidence-register.md` "storage/excretion coefficients") | a real signed-in farm sees 0 kg as if real (breaks the UNKNOWN ≠ 0 rule) | record as blocked; do not derive from physical volume |
| nutrient-record completeness status | C | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | partial (job actuals count) / – | engine cannot tell a complete record from an unrecorded application | one annual attestation per farm |

### C. Field / spatial evidence

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| field ID / name | all | EXISTS_TRUSTWORTHY | `fields.id`, `fields.name` | `createField` → `listFieldsForFarm` | Fields | – | name yes / no | – | – | reuse |
| field polygon | V, C | EXISTS_TRUSTWORTHY | `fields.polygon`, `polygon_source='farmer_drawn'`, `polygon_captured_at` | `createField`/`setFieldBoundary` → `rowToField` | `FieldBoundaryMapModal` | farmer-drawn on imagery, timestamped | yes, once / no | LPIS parcels could pre-seed / LPIS | not LPIS-reconciled | reuse |
| gross area ha | R, V, E | EXISTS_TRUSTWORTHY | `fields.area_ha` | derived from polygon (`computeBoundaryGeometry`); editable **only** when there is no polygon (`updateFieldDetails`) | Field Detail | derived | no (mapped) / no | – | rate m³/ha divides by gross area (`nutrients.ts:1885`) | reuse |
| LPIS reference | C | MISSING_EXTERNAL_DATA_INTEGRATION | `fields.lpis_ref` (always `null`, `mappers.ts:150`; no UI) | – | – | – | no | – / DAFM LPIS | soil-test georef rule, LESS steep exception record | import from LPIS; farmer picks parcel once |
| field geolocation | A | EXISTS_TRUSTWORTHY | `centroid_lng/lat` (derived); farm centroid = county centre | – | – | derived | no | – | weather is queried at the field centroid (nearest station, not in-field) | reuse |
| mapped water features | C, V | MISSING_EXTERNAL_DATA_INTEGRATION | only `water_buffer_context.nearestFeature` (free text) | farmer-typed | `FieldDrawer` Constraints | farmer-declared | yes / – | – / EPA WFD rivers/lakes, OSi | no geometry | integrate dataset; farmer confirms per farm |
| surface-water buffer | C, V | EXISTS_BUT_WRONG_SEMANTICS | `fields.water_buffer_context` {featureType, distanceM, localOverrideStatus, localOverrideDistanceM} | `updateFieldWaterBufferContext` (`farmerAdjust`, **one history node per keystroke**, fabricated `estimated` "Farm Return assumption" first node) → `nutrients.ts:1946–1990`, **not passed to the pilot foundation** | `FieldDrawer.tsx:432–526` | farmer-declared | yes, per field / **answer unused by What Matters** | – / EPA | `checkNationalBufferDistance` returns a whole-field `LEGAL_PROHIBITION` when distance < buffer, instead of reducing spreadable area; one feature per field; `?? 0` default for `actualDistanceM` in the local-override call (`nutrients.ts:1947`) | geometry buffer → spreadable area; batch confirm |
| drinking-water buffer | C, V | EXISTS_BUT_WRONG_SEMANTICS | same object (`major_drinking_water_abstraction`, `drinking_water_abstraction`, `other_drinking_well_spring_borehole`) | same | same | same | same | – / EPA abstraction register (restricted) | same | same |
| karst / other exclusions | C, V | EXISTS_BUT_WRONG_SEMANTICS | same (`exposed_cavernous_or_karst_limestone_feature`, `lake_or_turlough_likely_to_flood`) | same | same | same | same | – / GSI karst | same | same |
| slope | C, A | MISSING_EXTERNAL_DATA_INTEGRATION | none (`NationalBufferInput.averageInclinePct`/`slopesTowardWater`, `SpreadingGroundConditions.steepSlopeSignificantPollutionRisk` are never supplied by any caller) | – | – | – | no | – / DEM (OSi/Copernicus) | 10 % buffer escalation and SPREAD_STOP_STEEP_RISK unevaluable | DEM integration; farmer flags "steep toward water" |
| drainage | A | MISSING_EXTERNAL_DATA_INTEGRATION | `fields.mapped_soil.drainage` (always null; `resolveSoilForFieldPolygon` → `SOIL_DATASET_NOT_INTEGRATED`) | – | Soil card shows "Unavailable" | – | no | – / Irish Soil Information System | trafficability can only come from the farmer | integrate ISIS → none |
| spreadable area ha | R, V, E | MISSING_EXTERNAL_DATA_INTEGRATION | none | – | – | – | no | not without buffer geometry / EPA, GSI, DEM | **only gross area is known today; effective spreadable area stays UNKNOWN** until supported by defensible spatial/exclusion evidence or an appropriately qualified explicit evidence source. Gross area may feed provisional illustrations only, never an executable total volume | geometry pipeline, or a qualified explicit exclusion-evidence source (not a disclosed gross-area assumption) |
| field access constraints | A | MISSING_REQUIRES_FARMER_ENTRY | none | – | – | – | no | – | – | optional note; out of rate scope |

### D. Crop / sward evidence

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| current field use | R, C | EXISTS_WEAK_PROVENANCE | `fields.planned_use` TrackedValue<FieldUse> (nullable) | `updateFieldDetails` (`farmerAdjust` chain) → `calculateNutrientPlan`, `cropGroupForFieldUse` | `FieldDrawer.tsx:172` | farmer-declared, dated; **no season/year scope** | yes, per field / no | – | stale year-over-year; unset use = assumed grazing on the agronomic ledger | season-scoped use; batch table |
| grass use (grazing/silage/mixed) | R | EXISTS_WEAK_PROVENANCE | same enum | same | same | same | same | – | – | same |
| first cut / second cut / grazing | R, C | EXISTS_BUT_WRONG_SEMANTICS | single-valued `silage_1st_cut \| silage_2nd_cut \| silage_3rd_cut \| grazing \| mixed` | same | same | same | same | – | a field cut twice in one season cannot be represented; slurry timing per cut is impossible | season plan with a cut sequence → batch confirm |
| cut number | R | EXISTS_BUT_WRONG_SEMANTICS | same | a silage-cut field with no `SilagePlan` → `MISSING_SILAGE_PLAN_DATA` (`nutrients.ts:2199`) | – | – | – | – | – | same |
| expected yield t DM/ha | R | MISSING_REQUIRES_FARMER_CONFIRMATION | `SilagePlan.expectedYieldTDMha` exists **only as mock** (`mockSilagePlans`, never matches real ids) | – | `FieldDrawer`, Nutrients (mock only) | – | no | Teagasc typical yields by cut (not encoded) / – | silage N/P/K blocked for real farms | proposed default per cut, farmer confirms |
| yield basis / provenance | R | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | carried with the yield |
| sward type | R | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | batch confirm "permanent grass / reseeded / clover" |
| reseed date | R | MISSING_REQUIRES_FARMER_ENTRY | none (no reseed activity type) | – | – | – | no | – | – | optional entry |
| reseed age | R | BLOCKED_BY_UNRESOLVED_SCIENCE | none | – | – | – | – | derivable from date | young-reseed/yield interaction unresolved (§12) | do not use until specified |
| clover status | R | MISSING_REQUIRES_FARMER_CONFIRMATION | none; `clover-n.ts` exists **with no production caller** | – | – | – | no | – | raw clover % is explicitly blocked (`blockRawDairy/DrystockCloverPercentage`) | class-based confirm |
| multispecies status | R | OUT_OF_INITIAL_SCOPE | none | – | – | – | no | – | no slurry rule | – |
| previous grazing | R | MISSING_REQUIRES_FARMER_CONFIRMATION | `nSilageKgHa(cut, wasGrazedPreviousYear)` input only; not persisted | – | – | – | no | partial from `livestock_work` actuals (no field id) / – | – | batch confirm |
| planned harvest window | R, A | MISSING_REQUIRES_FARMER_CONFIRMATION | `SilagePlan.targetCutWindow` (mock only) | – | – | – | no | default window from cut number (not encoded) | – | proposed default, confirm |

### E. Soil evidence

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| soil test ID | R, C | EXISTS_WEAK_PROVENANCE | legacy: `fields.fertility.verifiedTest.sampleRef` (jsonb, free text); guided: `lab_results.id`, `lab_report_ref` | `addSoilTestToField` (optimistic concurrency, `soil.ts:50`) / `insertLabResult` (insert-only) → `calculateNutrientPlan` | `SoilFieldCard` form; guided soil-sample job | farmer-typed | yes / **two entry paths for the same report** | – / lab APIs | – | single ingestion path |
| laboratory | C | EXISTS_WEAK_PROVENANCE | `verifiedTest.laboratory`; `lab_results.laboratory` | same | same | farmer-typed; stored as `verified` with no document | yes | – | "verified" means farmer-transcribed | attach report file (`reportFileUrl` exists, unused) |
| sample date | C | EXISTS_BUT_WRONG_SEMANTICS | legacy `verifiedTest.sampleDate`; guided path writes **`analysisDate` into `sampleDate`** (`lab-result/index.ts:218`) | → `checkSoilTestAgeValidity` | – | farmer-typed | yes | guided: derivable from `soil_core_observations.recorded_at` | 4-year rule computed from analysis date on the guided path | derive from core observations |
| analysis date | C | EXISTS_WEAK_PROVENANCE | `lab_results.analysis_date` (guided only) | – | – | farmer-typed | yes (guided) | – | absent on the legacy path | – |
| soil-test ↔ field linkage | R, C | EXISTS_TRUSTWORTHY | field-scoped jsonb; `lab_results.field_id` FK | – | – | – | – | – | one sample → one field only; multi-field sample (`SOIL_GEOREF_AFTER_2025_09_14`) not modelled | – |
| sample georeference | C | DERIVABLE_FROM_EXISTING_DATA | guided: `soil_core_observations.lat/lng/accuracy_m`; legacy: none | – | – | measured GPS (guided) | – | yes (guided) / – | `checkSoilTestGeorefRequirement` has **no production caller** | derive; legacy tests flagged |
| LPIS reference (soil) | C | MISSING_EXTERNAL_DATA_INTEGRATION | `fields.lpis_ref` null | – | – | – | – | – / LPIS | – | as C |
| sampling area | C | DERIVABLE_FROM_EXISTING_DATA | guided `SamplingZone` (`soil-sampling-plan.ts`), `soil_core_observations.sampling_zone_id`; legacy: whole field assumed | – | – | derived | – | yes | – | – |
| Morgan's P result | R, C | EXISTS_WEAK_PROVENANCE | `verifiedTest.p`; `lab_results.p_mg_l` | → `pIndexFromMgL` | – | farmer-transcribed raw mg/l | yes | – | – | – |
| measured P Index | R, C | EXISTS_BUT_WRONG_SEMANTICS | `fields.fertility.pIndex` (single working TrackedValue); `soil_interpretations.p_index_value` (guided) | `verify()` from lab / **`updateFieldIndex` farmer tap overrides it** → `calculateNutrientPlan` uses the working value | `SoilFieldCard.tsx:129` "P Index (assumption)" | status chain kept, but the engine reads only the head | yes (tap) / **can overwrite measured evidence** | – | a farmer tap produces a `compliance_value` NAP ceiling (`nutrients.ts:1381`) | keep measured and farmer estimate as separate slots; engine picks by rule |
| regulatory / deemed P Index | C | BLOCKED_BY_UNRESOLVED_SCIENCE | not representable (no slot separate from the measured index) | – | – | – | – | `SOIL_HIGH_STOCKING_NO_TEST`/`SOIL_ARABLE_NO_TEST` in the CSV only; grassland no-test default not in the ruleset | a missing test yields `MISSING_SOIL_FERTILITY_INDEX` (safe), but a farmer guess is treated as statutory | specify the deemed-Index rule set, then a distinct `regulatoryPIndex` |
| K result | R | EXISTS_WEAK_PROVENANCE | `verifiedTest.k`; `lab_results.k_mg_l` | – | – | farmer-transcribed | yes | – | – | – |
| K Index | R | EXISTS_BUT_WRONG_SEMANTICS | `fields.fertility.kIndex` | `kIndexFromMgL(k, soilMaterialForOrganicCarbonStatus(mappedSoil?.organicCarbonStatus))` → **mineral bands always** (mapped soil never resolved) | tap override as P | – | – | – / ISIS peat map | peat fields misclassified | derive material from lab OM > 20 % or ISIS |
| pH | R | EXISTS_WEAK_PROVENANCE | `fertility.pH`; `lab_results.ph` | – | – | farmer-transcribed | yes | – | – | – |
| organic matter | C | EXISTS_WEAK_PROVENANCE | `verifiedTest.organicMatterPct`; `lab_results.organic_matter_pct` (optional) | → `evaluatePBuildUpEligibility` | – | – | optional | – | `checkSoilOmValidity` (12-year rule) has no caller | – |
| peat / high-organic status | R, C | MISSING_EXTERNAL_DATA_INTEGRATION | `mapped_soil.organicCarbonStatus` (null) | – | – | – | no | from lab OM if present / ISIS | K bands, P special treatment (`SOIL_OM_OVER_20`) | derive → none |
| agronomic validity | R | DERIVABLE_FROM_EXISTING_DATA | none distinct | – | – | – | – | yes (date) | only the statutory age rule exists | – |
| regulatory validity | C | EXISTS_WEAK_PROVENANCE | computed `soilTestAgeValidity` (`checkSoilTestAgeValidity`) | → NAP downgrade on `DISREGARD` | validity badge | derived | – | – | georef and OM validity not enforced; guided path uses the analysis date | wire the existing checks |
| lime history / requirement | R | EXISTS_WEAK_PROVENANCE | lab `lime_requirement_t_ha` passthrough; no lime application history | → `aggregateFarmLimeRequirement` | Lime card | lab-reported | yes | – | lime history absent | out of slurry scope |

### F. Previous nutrient applications

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| chemical N/P/K applied kg/ha | R, C | EXISTS_WEAK_PROVENANCE | `job_actuals.payload` (`FertiliserSpreadingActual`: product, quantity, unit, fieldIds) | `confirm_job_session_actual` RPC → `getFieldRemainingFertiliserRequirement` (`orchestration/fertiliser-plan/index.ts:256`) | `ConfirmActualSheet`; Remaining requirement card | farmer-confirmed; scoped to the calendar year by **`confirmedAt`, not application date**; multi-field actuals excluded; product must be in the 3-product catalogue | only via GPS job flow / – | yes / – | **not an input to `calculateNutrientPlan` or the pilot**; applications made outside the app are invisible | reuse as the prior-input ledger; completeness attestation |
| previous slurry applications (physical record) | R, C, V | EXISTS_WEAK_PROVENANCE — **partially reusable evidence** | `job_actuals.payload` (`SlurrySpreadingActual`, `src/domain/job-actual.ts:68`: physical quantity, `m3\|gallons`, method, slurryType, fieldIds) | persisted → **consumed nowhere** except field-awareness activity lists | `ConfirmActualSheet.tsx:302` | farmer-confirmed **physical** quantity; no neat-slurry basis, dilution or DM evidence | yes / – | the fact, date, method and fields of an application are reusable; nutrient content is not | does not decrement tanks, release allocations or credit nutrients; the validator accepts several fields sharing one quantity with no per-field split | reuse the record (do not re-ask the farmer); link to allocations |
| previous slurry volume m³/ha per field | R | MISSING_REQUIRES_FARMER_CONFIRMATION (multi-field records only) | same | – | – | – | – | single-field records: quantity ÷ field area (gallons need a unit rule); **multi-field records: no defensible field-level split** | spreading a shared quantity pro-rata by area would be an assumption, not evidence | confirm the split only for multi-field records |
| FYM / other organic manure | R, C | MISSING_REQUIRES_FARMER_ENTRY | none (`slurryType: "other"` only) | – | – | – | no | – | statutory FYM rates exist (`MANURE_TOTAL_NP`) | entry only when "yes" |
| organic N/P/K already applied (statutory reconstruction) | C | BLOCKED_BY_UNRESOLVED_SCIENCE | – | **not safely derivable from the physical records alone.** `statutoryManureNutrientValue` uses neat-slurry coefficients; applying them to the recorded physical m³ would repeat the physical → neat assumption flagged in §1 item 3 and §12 item 6 | – | – | – | no / – | the material / neat-volume basis is absent from `SlurrySpreadingActual`; field-level allocation evidence is missing separately for multi-field records (row above) | do not convert recorded physical m³ into statutory N/P; resolve §12 item 6 first |
| organic N/P/K already applied (agronomic credit) | R | BLOCKED_BY_UNRESOLVED_SCIENCE | – | needs method/timing/DM per application; DM is not recorded on the actual | – | – | – | no / – | agronomic credit of past applications → §12 | spec first |
| early-grazing N | R | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | batch confirm |
| early-grazing N credit | R | BLOCKED_BY_UNRESOLVED_SCIENCE | only the Green Book `wasGrazedPreviousYear` flag | – | – | – | – | – | spring-grazing credit not encoded | spec first |
| application dates | C, R | EXISTS_WEAK_PROVENANCE | `job_actuals.confirmed_at`; `job_sessions.active_intervals` | – | – | confirmation time ≠ application time | – | derivable from `active_intervals` | closed-period/season attribution off by the confirmation lag | derive from intervals |
| nutrient history completeness | R, C | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | annual attestation |
| farmer confirmation that no unrecorded inputs exist | R, C | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | one checkbox per plan run, persisted |

Answer to "can prior crop-cycle inputs be rebuilt from records?": **partially.**
Confirmed chemical applications made through GPS Job Mode can be rebuilt
(with the date and multi-field caveats above). Confirmed slurry spreading
records are **partially reusable**: the fact, date, method and fields of an
application can be reused without asking the farmer again, but the recorded
quantity is physical slurry, not regulatory neat slurry. Historical
statutory or agronomic nutrient reconstruction from those records alone is
therefore **not safely derivable** (`BLOCKED_BY_UNRESOLVED_SCIENCE` while the
material/neat-volume basis is absent), and multi-field records additionally
lack field-level split evidence. Off-app applications, FYM and a
completeness attestation cannot be rebuilt. "Nutrient plans" are not persisted (they
are recomputed). `decisions` hold only accepted prompt snapshots.

### G. Slurry physical resource

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| housing / store ID | V | EXISTS_BUT_WRONG_SEMANTICS | `housing.id` (a **shed** is the store) | `createHousing` → `buildSlurryTankView` | Housing | – | yes | – | a shed with two tanks, or two sheds sharing one tank, cannot be represented | separate store entity (later) |
| slurry type | R, C | DERIVABLE_FROM_EXISTING_DATA | `slurry_composition_records.slurry_type` (`cattle_slurry` only); `housing.shed_type` (`slatted \| straw_bedded \| other`) | – | – | – | – | from shed type + linked group categories | straw-bedded produces FYM, not slurry; not used | derive, confirm on ambiguity |
| storage capacity m³ | V | EXISTS_WEAK_PROVENANCE | `housing.storage_capacity_m3 double not null` | `createHousing`/`updateHousing` | Housing form | farmer-typed; **no status/timestamp/source**; `tank_refinement.dimensions` never written | yes, once | from dimensions (not built) | – | add provenance |
| fill % | V | EXISTS_WEAK_PROVENANCE | `housing.storage_fill_pct` | same; **blank is stored as `0` + `estimated`** (`housing/page.tsx:116,125`) | Housing form | farmer-declared %-of-volume | yes, whenever it changes | – / tank sensors (none) | unknown fill = 0 m³ available (safe direction, but not UNKNOWN) | nullable fill |
| fill status / recorded_at | V | EXISTS_TRUSTWORTHY | `storage_fill_status`, `storage_fill_recorded_at` (server time) | `20260917000000_…` | tank visual | – | – | – | pre-migration rows honestly `estimated`/null | reuse |
| physical slurry volume | V | EXISTS_WEAK_PROVENANCE | derived `capacity × fill% / 100` | `buildSlurryTankView` | tank visual | derived from two farmer figures | – | – | – | reuse |
| currently allocated slurry | V | EXISTS_BUT_WRONG_SEMANTICS | Σ `slurry_allocations.volume_m3` per store; DB trigger `slurry_allocations_store_capacity` | RPC `create_farmer_planned_slurry_allocation`; triggers (applied to Dev and verified outside this audit) | form "m³ available" | server invariant | – | – | no lifecycle: spread/cancelled allocations count forever; no edit/delete path; lowering fill below allocations is rejected | allocation status + release on Confirm Actual |
| remaining slurry | V | EXISTS_BUT_WRONG_SEMANTICS | derived `max(0, volume − allocated)` | `availableToPlanM3` | form | – | – | – | inherits the lifecycle defect | – |
| neat slurry quantity | V, C | BLOCKED_BY_UNRESOLVED_SCIENCE | none | – | – | – | – | – | §12 | – |
| dilution | V, R | BLOCKED_BY_UNRESOLVED_SCIENCE | `TankDetail.dilutionWaterFactor` (type only, never written) | – | – | – | – | DM % is the measurable proxy | – | – |
| dirty-yard water | V | BLOCKED_BY_UNRESOLVED_SCIENCE | none (`soiled-water-gate.ts` is a separate material) | – | – | – | – | – | – | – |
| dairy washings | V | OUT_OF_INITIAL_SCOPE | none | – | – | – | – | – | no dairy enterprise modelled | – |
| rainfall contribution | V | BLOCKED_BY_UNRESOLVED_SCIENCE | none | – | – | – | – | – | – | – |
| source livestock groups | V, C | EXISTS_WEAK_PROVENANCE | `livestock_groups.housing_id` → `Housing.linkedGroupIds` | – | `AssignedGroupsCard` | current assignment only | yes | – | no housing-period history | – |
| resource snapshot timestamp | V | EXISTS_WEAK_PROVENANCE | `storage_fill_recorded_at`; `slurry_allocations.created_at/updated_at` | – | – | capacity undated | – | – | no single "tank state as of" | snapshot on plan run |

**What "available slurry" means today:** `unallocatedM3` =
farmer-declared capacity × farmer-declared fill % − Σ every allocation ever
created for that shed, floored at 0. Scientifically it is a **physical,
diluted, farmer-estimated volume**. It is not regulatory neat slurry. It
does not represent nutrient content beyond DM %. It never decreases when
slurry is actually spread.

### H. Slurry composition

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| composition basis | R | EXISTS_WEAK_PROVENANCE | `slurry_composition_records.status` (`farmer_adjusted \| verified`); absence = `estimated` | `addSlurryComposition` → `currentSlurryCompositionByHousing` → `resolveEffectiveSlurryComposition` | `AddSlurryCompositionSheet`, `SlurryCompositionCard` | `verified` is **self-declared**: the laboratory name is required/validated by UI and server-action validation for the relevant record state (`addSlurryCompositionRecordAction`, `src/app/actions/farm.ts:289`, calls `validateNewSlurryCompositionInput` and rejects a `verified` record with no laboratory), but the persistence layer does not independently verify the authenticity of the laboratory evidence | yes / – | – | – | keep; require a document for `verified` |
| slurry sample ID | R | EXISTS_WEAK_PROVENANCE | `sample_ref` (optional), row `id` | same | same | – | optional | – | – | – |
| sample date | R | EXISTS_WEAK_PROVENANCE | `sample_date not null` | same | same | farmer-typed; **no freshness policy** | yes | – | a result survives tank emptying/refilling | bind to tank fill cycle |
| DM % | R | EXISTS_WEAK_PROVENANCE | `dm_pct` (0,100] | → `calculateNutrientPlan` **only on Nutrients screen**; **ignored by the pilot and Today/Plan prompts**; multi-store fields miss it | Housing | – | yes / **answer unused downstream** | – | LESS path needs an exact 2/4/6/7 % match | wire through |
| hydrometer support | R | BLOCKED_BY_UNRESOLVED_SCIENCE | none (free-text `source` only) | – | – | – | – | – | hydrometer → DM/N conversion not encoded | – |
| total N | R, C | EXISTS_WEAK_PROVENANCE | `n_per_m3` (optional) | recorded, **not consumed** (by design) | same | – | optional | – | – | – |
| NH₄-N | R | MISSING_REQUIRES_FARMER_ENTRY | none | – | – | – | no | lab | – | lab field |
| total P | R, C | EXISTS_WEAK_PROVENANCE | `p_per_m3` | not consumed | – | – | optional | – | – | – |
| total K | R | EXISTS_WEAK_PROVENANCE | `k_per_m3` | not consumed | – | – | optional | – | – | – |
| available agronomic N | R | EXISTS_BUT_WRONG_SEMANTICS | computed `resolveAvailableSlurryNutrients` | Table 9-8 (splashplate, spring), spring LESS (2/4/6/7 %), summer LESS (6 %) | Organic nutrients card | assumed defaults disclosed (`assumedDefault`, `timingAssumed`) | – | – | Table 9-8 path: **rate clamped to [11, 55] t/ha** (`nutrients.ts:531`), so a 5 m³/ha plan is credited as 11 m³/ha; **nearest-DM-column snapping** (6.3 → 6 %) | freeze science first (§12) |
| available agronomic P | R | EXISTS_BUT_WRONG_SEMANTICS | same | footnote-3 low-Index factor on Table 9-8 only | – | – | – | – | same; P 0.5 vs 0.6 kg/m³ conflict | same |
| available agronomic K | R | EXISTS_BUT_WRONG_SEMANTICS | same | same | – | – | – | – | same | same |
| statutory / regulatory N | C | EXISTS_BUT_WRONG_SEMANTICS | computed `statutoryManureNutrientValuePerHa` (2.4 kg N/m³ × 40 %) | fed the **physical** allocated volume | NAP card | statutory coefficients | – | – | assumes physical = neat | §12 |
| statutory / regulatory P | C | EXISTS_BUT_WRONG_SEMANTICS | same (0.5 kg P/m³ × 50/100 % by working P Index) | – | – | – | – | – | also consumes the farmer-overridable P Index | – |
| evidence quality / source class | R | EXISTS_WEAK_PROVENANCE | `dmPctEvidence` {status, source, sourceDate, compositionRecordId} on `NutrientPlan` | – | – | – | – | – | – | reuse |
| evidence limitations | R | EXISTS_TRUSTWORTHY | `scientificBasisNote`, `requirementProvisional` | – | shown | – | – | – | – | reuse |

**What the current default coefficients represent:**
- `NATIONAL_AVG_SLURRY_DM_PCT = 6.3` is the Green Book Table 9-1 national
  average (assumed).
- `SLURRY_TABLE_9_8` gives spring splashplate available N/P/K (30 % NFRV)
  at P/K Index 3/4, with footnote-3 factors (P × 0.5, K × 0.9) for Index
  1/2.
- `SPRING_LESS_SLURRY_TABLE` comes from `advisory_teagasc/cattle_slurry_available_npk_spring_LESS.csv`
  (GFT047).
- `SUMMER_LESS_SLURRY_TABLE` comes from the Signpost Fact Sheet 07 summer
  6 % DM row.
- `MANURE_TOTAL_NP` and `MANURE_AVAILABILITY` are the S.I. 588/2025
  statutory totals and availability factors.
- All of these are versioned code constants with source comments. None is
  stored per farm or per field.

### I. Application scenario

| Evidence | Layers | Status | Persistence | Write → Read | UI | Provenance · freshness | Asked? / Re-asked? | Derive? / External? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|---|---|
| application method | R, C, E | EXISTS_WEAK_PROVENANCE | `slurry_allocations.application_method` TrackedValue | create via RPC (`farmerAdjust(undefined,…)`); edit via `updateSlurryApplicationMethod`, which **fabricates a prior `estimated "other" "Farm Return assumption"` node** when none existed (`slurry.ts:89–93`) → `requireSlurryApplicationMethod` | `SlurryPlanForm`, `FieldDrawer.tsx:551` | farmer-declared plan | yes, **per allocation, in two places** / yes | recommendable from legal trigger + farm capability | `incorporate_24h`/`other` have no available-nutrient table; conflicting methods → AMBIGUOUS | recommend; farmer confirms capability once |
| application date | R, C, A | EXISTS_WEAK_PROVENANCE | `slurry_allocations.application_date` TrackedValue | same fabricated-prior pattern (`slurry.ts:128–132`) | same | planned date, not actual | yes, per allocation | recommendable window | – | recommend |
| application season | R | DERIVABLE_FROM_EXISTING_DATA | – | `classifySlurryTiming` (SPRING Jan–Apr, SUMMER May–Jun, LATE_SUMMER Jul–Oct) | – | derived | – | yes | no date → SPRING assumed (disclosed) | derive |
| recommended method capability | R, C | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | once per farm: "methods you can use" |
| whether LESS is legally required | C | EXISTS_BUT_WRONG_SEMANTICS | computed `lessMethodCompliance` (`checkLessMethodGate`) | GSR input is current-year/blocked; arable trigger uses `plannedUse === "tillage"` | NAP/LESS card | derived | – | – | the pig trigger is inert (cattle only; fine) | fix the GSR basis |
| actual machinery / contractor method availability | R, E | MISSING_REQUIRES_FARMER_CONFIRMATION | none (the contractor rate is method-agnostic) | – | – | – | no | – | – | once per farm |
| sward height / cover | A | OUT_OF_INITIAL_SCOPE | none (no field-level vegetation signal; `field-awareness.ts` header) | – | – | – | no | – / PastureBase, Sentinel-2 (credentials blocked) | – | – |
| spreading timing evidence (calendar) | C | EXISTS_TRUSTWORTHY | `CLOSED_PERIOD_BY_ZONE_MATERIAL` | `checkSpreadingWindowGate` | spreading-window prompts | primary-source verified (`spreading-actionability-foundation.ts` header) | – | – | not year-bounded (`BLOCKERS.md`); depends on the weak county | – |
| method / date provenance | R, C | EXISTS_WEAK_PROVENANCE | `previous` chain | – | – | fabricated "Farm Return assumption" first node | – | – | pollutes history with a value nobody asserted | stop fabricating the prior node |

The system should infer or recommend rather than ask:
- **method**, from the legal trigger plus the farm's stated capability;
- **date/window**, from the closed period, the season table and forecast
  actionability;
- **volume**, from rate × defensible spreadable area, bounded by remaining
  store volume (while spreadable area is UNKNOWN, only the rate is
  recommendable; see §10a);
- **store**, from linked groups and proximity.

The farmer should confirm capability once per farm and approve the plan.

### J. Regulatory field constraints

| Evidence | Layers | Status | Implemented / derivable / missing / unresolved | Code | Notes |
|---|---|---|---|---|---|
| closed-period status | C, A | EXISTS_TRUSTWORTHY | **implemented** | `closed-period-calendar.ts`, `spreading-window-gate.ts`; per-field prompts via `build-all.ts:90–101`; pilot foundation uses the evaluation date | the pilot evaluates *today*, not the allocation's planned date |
| county rule | C | EXISTS_TRUSTWORTHY | implemented | `COUNTY_ZONE`, `normaliseCountyForZoneLookup` | input county is weak (B) |
| LESS requirement | C | EXISTS_BUT_WRONG_SEMANTICS | implemented, wrong GSR basis | `less-method-gate.ts` | steep-slope H&S exception input never supplied |
| surface-water buffer | C, V | EXISTS_BUT_WRONG_SEMANTICS | implemented (field-level) | `buffer-gate.ts` | not wired into the pilot foundation; no enhanced-period flag supplied |
| drinking-water buffer | C, V | EXISTS_BUT_WRONG_SEMANTICS | implemented (field-level) | same | – |
| slope restriction | C | MISSING_EXTERNAL_DATA_INTEGRATION | **implemented rule, missing input** | `buffer-gate.ts` incline, `spreading-legal-gate.ts` steep risk | `checkSpreadingLegalGate` has **no production caller** (deliberately, `spreading-actionability-foundation.ts:122–143`) |
| field eligibility | C | DERIVABLE_FROM_EXISTING_DATA | derivable (composition of the gates above) | `buildSpreadingActionabilityFoundation` | commonage/buffer inputs not passed by the pilot |
| current rule IDs / evidence versions | C | EXISTS_WEAK_PROVENANCE | implemented per gate | `SOURCE_REGISTER`, gate `*_VERSION` | `CURRENT_RULESET` inert |
| farm-level organic N limit (170 kg/ha livestock manure N) | C | DERIVABLE_FROM_EXISTING_DATA (input) | **rule missing** from code | – | needs categorised GSR + imports/exports; derogation out of scope |
| applicable available-N rules | C | EXISTS_WEAK_PROVENANCE | implemented | `napMaxAvailableN*`, `checkNapCompliance` | BLOCKED in practice by GSR |
| P accounting context | C | EXISTS_WEAK_PROVENANCE | implemented per field (Tables 15a/15b/17, Art. 17(6)) | `checkNapCompliance`, `p-build-up-eligibility.ts` | farm-level P balance and concentrate-P ledger (`GAP_CONCENTRATE_P_LEDGER`) not wired |
| P Index 4 handling | C | EXISTS_WEAK_PROVENANCE | implemented | `pIndexFromMgL` ambiguity → conservative P4; `SOIL_4Y_INDEX4_PERSISTS` | farmer tap can bypass; deemed Index unresolved |
| heavy-rain / waterlogged / flooded / frozen legal stops | C, A | see K | rule implemented, **not wired** (deliberate: no provenance on ground booleans) | `spreading-legal-gate.ts` | – |

### K. Weather / actionability

| Evidence | Layers | Status | Persistence | Write → Read | Provenance · freshness | Asked? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|
| historical rainfall | A | EXISTS_TRUSTWORTHY | none (fetched per request) | `getWeatherForField` (72 h rolling, `totalMm: null` when incomplete) → `historicalRainfallEvidence` | nearest Met Éireann station, `retrievedAt`, LIVE/STALE; **station data, never presented as in-field** | no | – | reuse |
| forecast rainfall | A | EXISTS_TRUSTWORTHY | none | `meteireannLocationForecastProvider` (Harmonie, 48 h tiling verified) | model run time, centroid-bound | no | – | reuse |
| Rainfall Window Score | A | EXISTS_TRUSTWORTHY (as model policy) | none | `buildRainfallWindowScore` → policy threshold 70 | **confirmed not scientific or legal**: `RAINFALL_WINDOW_SCORE_VERSION` header "Farm Return's own calibration choices… never presented as a Met Éireann or Teagasc rule"; `MINIMUM_RAINFALL_WINDOW_SCORE` "FARM_RETURN_MODEL_POLICY — not legislation" | no | unreachable today (regulatory UNKNOWN first) | reuse |
| weather station provenance | A | EXISTS_TRUSTWORTHY | – | station name in `WeatherEvidenceItem.source` | – | no | – | reuse |
| heavy-rain legal flag | C, A | BLOCKED_BY_UNRESOLVED_SCIENCE | none | `SPREAD_STOP_HEAVY_RAIN` exists; no numeric legal definition of "heavy rain"; Met Éireann warnings (`MET_WARNINGS_JSON` registered) not integrated | – | no | a favourable RWS must never be read as "no heavy rain legally" | define the rule, then integrate warnings |
| waterlogging | A, C | MISSING_REQUIRES_FARMER_CONFIRMATION | **not persisted**: declarations round-trip through the client (`what-matters-pilot.ts:124`) | `CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER` | farmer-declared, bound to `evaluatedAt` | per candidate, per evaluation | re-asked on every refresh | persist with a validity window; batch |
| flooding / likely to flood | C, A | MISSING_EXTERNAL_DATA_INTEGRATION | none | no confirmation code covers "likely to flood" | – | no | legal stop unevaluated | OPW flood maps + farmer flag |
| frost | A, C | MISSING_REQUIRES_FARMER_CONFIRMATION | not persisted | `CONFIRM_NOT_FROZEN_OR_SNOW_COVERED` | no air-temperature source in the production path | per evaluation | – | batch confirm |
| snow | A, C | MISSING_REQUIRES_FARMER_CONFIRMATION | same | same | – | same | – | same |
| trafficability | A | MISSING_REQUIRES_FARMER_CONFIRMATION | same | `CONFIRM_FIELD_TRAFFICABLE`; SMD/soil temp explicitly `SOURCE_UNAVAILABLE` | – | same | – | same |
| actionability evaluated timestamp | A | EXISTS_WEAK_PROVENANCE | none | `evaluatedAt` | client-echoable; strict binding checks | no | not persisted | server stamp |

### L. Economics

| Evidence | Layers | Status | Persistence | Write → Read | Provenance · freshness | Asked? | Gap / risk | Acquisition → Interaction |
|---|---|---|---|---|---|---|---|---|
| N replacement price | E | DERIVABLE_FROM_EXISTING_DATA | `market_price_observations` (CSO Urea 46 % N, `CATEGORY_BENCHMARK` for "Protected Urea") | `findObservationsByMappedProduct` → `resolveMarketReferencePrice` | CSO series, `knownAt`, resolution trace | no | no per-nutrient €/kg exists; the existing engine values the **actual plan-cost difference** instead (better; reuse) | reuse the plan-cost method |
| P replacement price | E | BLOCKED_BY_UNRESOLVED_SCIENCE | – | – | – | no | P/K from compounds is a joint-product allocation (methodology choice) | do not build; reuse the plan-cost difference |
| K replacement price | E | BLOCKED_BY_UNRESOLVED_SCIENCE | – | – | – | no | same | same |
| market-price evidence / provenance | E | EXISTS_TRUSTWORTHY | `market_price_observations` (insert-only, `-0` rejected) | CSO sync (`cso-fertiliser-sync.ts`) | national benchmark, not a supplier quote; **Dev sync cadence unconfirmed** (pilot header) | no | empty table → honest "unknown" | ops: scheduled sync |
| spreading cost €/ha | E | EXISTS_TRUSTWORTHY | `slurry_contractor_cost_declarations.rate_per_ha` | `saveFarmerContractorCostRate` → `getLatestContractorCostRateForFarm` → `resolveSlurryRealisationCostFromFarmerRate` | farmer-declared, server `created_at` | yes, **once per farm** / no | one rate for all methods; × gross area | optionally per method |
| contractor-rate provenance | E | EXISTS_TRUSTWORTHY | same (insert-only; server timestamp) | – | – | – | – | reuse |
| transport cost | E | OUT_OF_INITIAL_SCOPE | none | – | – | no | – | – |
| useful nutrient calculation | E, R | EXISTS_WEAK_PROVENANCE | computed `netRequirement` (floored at 0) | `calculateNutrientPlan` baseline vs intervention | inherits DM default / rate clamp / P-Index weaknesses | – | – | – |
| oversupply treatment | E | EXISTS_WEAK_PROVENANCE | implicit | surplus nutrients floor to 0 and have no value; no explicit oversupply flag | – | – | the allocator gets no signal that volume is wasted | explicit oversupply output |
| gross replacement value | E | EXISTS_TRUSTWORTHY | computed `directCostDifference` | `buildSlurryDirectEconomicAssessment` (science gate: only `OK` slurry science proceeds; counterfactual invariance) | – | – | – | reuse |
| net benefit | E | EXISTS_TRUSTWORTHY | computed `netEconomicResult` | unknown realisation cost → BLOCKED (never gross) | – | – | – | reuse |
| finite-resource ranking | E, V | EXISTS_BUT_WRONG_SEMANTICS | computed | production code path: `rankOpportunities` over **independent** farmer allocations (no volume optimisation); `buildSlurryWholeFarmAllocation` (Phase 6) has **no production caller** | – | – | the "best use of finite slurry" question is not answered by any production code path | wire Phase 6 with engine-generated candidates |

**Unknown vs zero in economics: preserved.** Evidence:
- `RealisationCostInput` is tri-state.
- `AvailableSlurryVolumeInput` is `known|unknown`.
- A missing price becomes `ECONOMIC_SLURRY_ASSESSMENT_MISSING_PRICE_INPUT`.
- Non-`OK` science blocks the whole assessment.
- A quantified €0 is distinct from blocked.
- Records carry `quantified: false`.

Exceptions found **outside** the economic layer:
- `NutrientPlan` zeroes `offsetN/P/K`, `purchasedProducts` and
  `estimatedFieldCostEur` when evidence is blocked. This is flagged by
  `fertilityEvidence`/`requirementProvisional`, but the numeric fields
  read 0.
- Housing `NutrientValueRow` shows placeholder "0 kg".
- A blank fill % is stored as 0.
- `checkNapCompliance` receives `gsr = 0` when GSR is blocked
  (`nutrients.ts:2109`). The result is discarded because `napCompliance`
  returns the blocked outcome, so no exposure was found.
- `localBufferOverrideStatus` receives `distanceM ?? 0`
  (`nutrients.ts:1947`).

---

## 3. Existing architecture that can be reused

| Need | Reuse (do not rebuild) |
|---|---|
| Fail-closed outcomes, reason codes | `src/domain/evidence.ts` (`EngineOutcome`, `blockedInsufficientEvidence`, `REASON_CODES`) |
| Value provenance + history | `TrackedValue`, `farmerAdjust`, `verify`, `provenanceHistory` |
| Append-only evidence tables | pattern of `slurry_composition_records`, `slurry_contractor_cost_declarations`, `fertiliser_stock_records`, `lab_results`, `soil_interpretations`, `market_price_observations` |
| Agronomic N/P/K requirement + slurry credit | `calculateNutrientPlan`, `resolveAvailableSlurryNutrients`, `resolveFieldSlurryAllocation`, `resolveEffectiveSlurryComposition` |
| Statutory ledgers | `statutory-excretion.ts`, `statutory-manure-value.ts`, `checkNapCompliance`, `less-method-gate.ts`, `p-build-up-eligibility.ts` |
| Soil | `pIndexFromMgL`/`resolvePIndexConservatively`/`kIndexFromMgL`, `interpretLabResult`, `soil-test-validity.ts`, `soil-test-history.ts`, guided sampling (`soil_core_observations`) |
| Physical store | `buildSlurryTankView`, `buildFarmSlurryStorageOverview`, `availableToPlanM3`, DB capacity triggers |
| Allocation write | `validateNewSlurryAllocationPlan`, `create_farmer_planned_slurry_allocation` RPC |
| Prior inputs | `job_actuals` + `getFieldRemainingFertiliserRequirement`, `sumConfirmedFertiliserApplications`, `validateSlurrySpreadingActual` |
| Economics | `buildSlurryDirectEconomicAssessment`, `buildSlurryWholeFarmAllocation`, `resolveMarketReferencePrice`, `resolveSlurryRealisationCostFromFarmerRate`, `money.ts`, `units.ts` |
| Audit | `createAuditedActionOpportunityRecord`, `assessment-integrity.ts` fingerprints, `rankOpportunities`, `audit-trace.ts` `CalculationRun`, `nutrient-plan-trace.ts`, `decisions.inputs_snapshot` |
| Actionability | `buildSpreadingActionabilityFoundation`, `buildRainfallWindowScore`, `evaluateSlurryActionability` (adaptive confirmations), `createActionabilityAssessment` |
| Presentation | `what-matters-presentation.ts`, `what-matters-no-recommendation.ts`, `WhatMattersPilotCard`, `SlurryPlanForm` |

---

## 4. Trust / provenance weaknesses (ranked by blast radius)

1. **Captured evidence not passed into the production recommendation chain**
   (pilot: composition, commonage, buffer, pBuildUp, nonGrassPct; prompts:
   composition; multi-store composition lookup). Consequences, confirmed
   from code: LESS is always unsupported on this path, ACTIONABLE is
   unreachable, and farmer answers are not used. The size of the effect on
   live farm data requires runtime validation.
2. **Measured and farmer-guessed P/K Index share one slot.** A farmer tap
   overrides a lab index and still yields `compliance_value`.
3. **Physical volume treated as neat slurry** in the statutory ledger.
4. **Allocation lifecycle absent.** Allocations never release, fill cannot
   be lowered below them, and spread actuals are unlinked.
5. **Archived fields included in pilot aggregates and candidates.**
6. **GSR basis** is current, not previous-year, includes housed groups, and
   is blocked by age/sex that the app never asks for.
7. **Fabricated "Farm Return assumption" prior nodes** are written into
   `application_method`, `application_date`, `commonage_status` and
   `water_buffer_context` histories (`slurry.ts:90,129`,
   `fields.ts:152,170`). The water-buffer distance writes one history node
   per keystroke.
8. **"verified" is self-declared** for soil tests, composition and livestock
   count, with no document attached. `SoilTest.reportFileUrl` exists but is
   unused.
9. **Guided soil path: analysis date stored as sample date.**
10. **Housing placeholder `slurryEstimate` rendered as "0 kg" N/P/K** on real
    farms. (Confirmed from code: the placeholder is written on create and
    rendered by `NutrientValueRow`. Not observed in a live session.)
11. **Unpersisted audit.** Audited records, farmer ground declarations and
    `evaluatedAt` live only in the request/client. Declarations are passed
    back by the client (`FarmerDeclarationEvidence[]` crosses the server
    action boundary; the policy rebinds them, but they have no server-side
    persistence).
12. **County preselected default**; capacity has no provenance; blank fill
    stored as 0.
13. **`CURRENT_RULESET` inert**; `nutrient_engine_v1.0.0` not bumped across
    behaviour changes.
14. *(Corrected.)* An earlier version listed migrations
    `20260925010000`/`20260925020000` as not applied to Dev. They, together
    with `20260925000000`, have been applied to `Farm Return V1 Dev` and
    verified outside this audit, so this is **not** a weakness. The
    capacity invariant is live on Dev, which is why item 4 is reachable
    there. Production deployment state cannot be established from
    repository evidence and is not assessed.

---

## 5. Missing derivations (data already in the repo)

| Derivation | From | Blocks |
|---|---|---|
| Livestock age band / sex per group | `livestock_individuals.date_of_birth/sex` | GSR, excretion, LESS trigger |
| Livestock manure P production | Table 7 `totalPKg` × categorised counts | P balance |
| Active-field grassland area | `activeFields(fields)` + confirmed grass use | GSR |
| Farm county | field centroids | calendar zone |
| Soil sample date + georef (guided) | `soil_core_observations.recorded_at/lat/lng` | 4-year rule, georef rule |
| Soil material (peat) | lab OM > 20 % | K bands, P OM rule |
| Slurry type | `housing.shed_type` + linked group categories | material |
| Prior chemical N/P/K per field per season | `job_actuals` (existing function) | RATE net of prior inputs |
| Prior slurry applications per field (fact, date, method, fields only; **not** nutrient content, and single-field records only for volume) | `job_actuals` `slurry_spreading` | RATE context, tank release. The statutory ledger is **not** derivable from these physical records (§2F) |
| Application dates | `job_sessions.active_intervals` | season attribution |
| Current composition for multi-store fields | per-allocation composition, not the `"multiple"` sentinel | DM % |
| Farm-level livestock manure N/ha vs 170 | GSR total + area (rule to be encoded) | COMPLIANCE |

---

## 6. Missing external-data integrations

| Integration | Evidence unlocked | Notes |
|---|---|---|
| DAFM LPIS parcels | `lpis_ref`, eligible area, georef rule, LESS steep exception | column exists, always null |
| AIM / ICBF herd register | previous-year cattle numbers, ages, sex | preferable to farmer re-entry |
| DAFM derogation / Record 3 | derogation status, manure import/export | no public API known; farmer-attested fallback |
| EPA WFD rivers/lakes + abstraction points | water features, buffers → spreadable area | abstraction data may be restricted |
| GSI karst | karst buffer | – |
| OSi / Copernicus DEM | slope, incline toward water | – |
| Irish Soil Information System | drainage, peat status | resolver stub ready (`soil-resolution.ts`) |
| OPW flood maps | "likely to flood" stop | – |
| Met Éireann warnings | heavy-rain legal flag (after a rule definition) | source registered (`MET_WARNINGS_JSON`) |
| Met Éireann SMD / soil temperature | trafficability, timing | `MET_SMD` registered; not integrated |
| CSO price sync (scheduled) | price freshness | code exists; cadence unconfirmed |

---

## 7. Genuine farmer-input gaps (cannot be reused, derived or fetched today)

Per farm (once, then carried forward until changed):
1. Spreading methods the farm can actually use (own/contractor LESS,
   splashplate, trailing shoe…).
2. Manure imports/exports this year (default "none", confirmed).
3. Annual "no nutrient inputs outside Farm Return" attestation, or entry of
   the exceptions.
4. Group age band + sex, only where individual animals are not recorded.

Per field (batch table, pre-filled):
5. Season land use including the cut sequence (replaces the single-valued
   `plannedUse`).
6. Expected yield per cut (pre-filled with a sourced default once one is
   encoded).
7. Sward type / clover class (optional; used only once a rule exists).

Per store:
8. Fill level when it changes (already asked); capacity once (already
   asked).
9. DM % (optional; improves the credit). Lab N/P/K/NH₄-N only as lab entry.

Per plan run (time-bound, persisted with validity):
10. Ground conditions: trafficable, no visible waterlogging, not frozen or
    snow-covered, and not flooded or likely to flood. One batch covers all
    candidate fields.

Everything else in §2 is either already held, derivable (§5) or external
(§6).

---

## 8. Farmer-effort audit

| Current question / input | Where shown | Why currently asked | Existing evidence elsewhere | Better UX |
|---|---|---|---|---|
| Volume to spread (m³) per field | `SlurryPlanForm.tsx:118–121` | no rate engine proposes a volume | field area (`fields.area_ha`), remaining store volume (`availableToPlanM3`) | engine proposes a rate; volume = rate × defensible spreadable area (not gross area), capped by the store, once that area is evidenced; farmer accepts or edits |
| Slurry store per field | `SlurryPlanForm.tsx:90–102` | allocation needs a `housing_id` | auto-selected only when exactly one store has slurry; `linkedGroupIds` | auto-assign; ask only when stores compete |
| Spreading method per allocation | `SlurryPlanForm.tsx:123–135` **and** `FieldDrawer.tsx:548–571` | no farm-level capability record | legal trigger (`checkLessMethodGate`) | ask capability once per farm; recommend a method per field |
| Planned date per allocation | `SlurryPlanForm.tsx:137–140`, `FieldDrawer.tsx:574–585` | pilot excludes allocations without a date (`what-matters-pilot.ts:178`) | closed period, season tables, forecast | engine proposes a window; farmer confirms the plan once |
| Field area | not asked when mapped (good); editable only for unmapped fields (`FieldDrawer.tsx:195`) | legacy fields | polygon | keep |
| Commonage status per field | `FieldDrawer.tsx:417–430` | NAP chemical prohibition | – | batch "none of my fields are commonage"; **and pass it into the pilot foundation (currently ignored)** |
| Water feature type / distance / local override per field | `FieldDrawer.tsx:432–526` | buffer gates | – (no dataset) | mapped-feature layer + batch confirm; persist on blur, not per keystroke; **currently unused by What Matters** |
| P / K Index tap "(assumption)" | `SoilFieldCard.tsx:129–140` | fallback when no test | lab test on the same card | lock lab-derived indices; separate "my estimate" slot used only for planning advice |
| Soil test manual entry | `SoilFieldCard` form **and** guided lab-result entry | two historical paths | same lab report | one ingestion path (upload + parse/confirm) |
| Slurry DM % | `AddSlurryCompositionSheet` | improves the credit | – | keep; **wire into pilot/prompts (currently ignored there)** |
| Contractor €/ha | `ContractorCostRateInput` on Today | net economics | persisted once per farm (good) | keep; optionally per method |
| Ground-condition confirmations (3 codes) | `WhatMattersPilotCard` via `confirmWhatMattersPilotCondition` | no sensor evidence | – | one batch screen for all candidate fields; persist with a validity window; add flood; **currently never reached** |
| Planned land use per field | `FieldDrawer.tsx:172` | NAP/crop group | – | batch season table with cut sequence |
| Livestock age/sex | **never asked**, yet required | – | `livestock_individuals` | derive; batch-confirm group bands |
| County | onboarding, with a preselected default | calendar zone | field polygons | derive; confirm once |
| Housing fill % | Housing form | physical volume | – | keep; after Confirm Actual (slurry), propose the new fill and release allocations |
| Previous chemical fertiliser | only via GPS Confirm Actual | prior inputs | job actuals | one "anything else applied this year?" confirmation per plan run |

---

## 9. Minimum-interaction target workflow (against the real architecture)

Target:
1. Farmer taps **Build slurry plan**.
2. The server silently gathers:
   - active fields, area, use, soil, and prior inputs (job actuals);
   - stores, fill, composition, and livestock (categorised);
   - county, calendar, buffers, commonage;
   - prices, contractor rate, weather.
3. The server shows one **batch evidence check** with only unresolved
   facts: method capability (first run only), unclassified field uses,
   ground conditions for candidate fields, and the "no unrecorded inputs /
   imports" attestation.
4. The server returns the recommended plan: per field volume, method and
   window, with RATE/COMPLIANCE/TOTAL_VOLUME/ECONOMIC/ACTIONABILITY states.
   The farmer approves or edits.

**Farmer interactions theoretically achievable now:** once the §11
sequence through step 9 is complete (including defensible spreadable-area
evidence, step 5), a recurring run on a well-populated farm needs
**3** interactions:
1. tap Build;
2. submit one batch confirmation (ground conditions + attestation);
3. approve.

A first run adds one farm-level capability screen, for **4**. No completion
percentage is claimed.

**What prevents it today** (confirmed from code):
- No rate engine proposes volumes: the farmer types every allocation, 5
  inputs per field.
- The pilot drops composition/commonage/buffer. LESS is always unsupported,
  and regulatory state is always UNKNOWN, so no ACTIONABLE result.
- GSR is blocked by uncaptured age/sex, which blocks LESS/NAP compliance.
- Allocations have no lifecycle.
- Effective spreadable area is UNKNOWN (only gross polygon area exists), so
  no executable total volume can be recommended.
- Phase 6 is not wired.
- Nothing about a plan run (declarations, records) is persisted.
- Silage-cut fields have no real `SilagePlan`, so those plans block.

**Data that needs genuinely new UI:**
- farm spreading-method capability;
- season land-use/cut table (batch);
- livestock age-band/sex batch confirm (only where not derivable);
- imports/exports + completeness attestation;
- persisted batch ground-condition confirmation;
- plan review/approve screen.

Everything else reuses existing screens.

---

## 10. Ranked build gaps (by dependency, not importance)

Each gap depends only on gaps above it.

1. **G1 – Slurry allocation migrations on Dev: DONE.** `20260925000000`, `20260925010000` and `20260925020000` have been applied to `Farm Return V1 Dev` and verified outside this audit. G1 is kept in the list so that the dependency order and G-numbers stay stable. Every later gap can assume that the capacity invariant is live on Dev.
2. **G2 – Allocation lifecycle.** Add planned/spread/cancelled state plus release on a `slurry_spreading` Confirm Actual, and an edit/delete path. G6 (remaining volume) and every TOTAL_VOLUME result depend on it.
3. **G3 – Stop fabricated provenance nodes; separate measured vs working P/K Index slots.** The RATE and COMPLIANCE layers need to know what is measured.
4. **G4 – Plan-run identity and persistence.** Add a `recommendation_context_id`, a persisted run with an input-evidence fingerprint (extend `assessment-integrity.ts`), server `calculated_at`, and persisted farmer declarations with a validity window. Every later layer writes into it.
5. **G5 – Wire already-captured evidence.** Pass composition (per allocation), commonage, buffer, pBuildUp, nonGrassPct and `activeFields` into the pilot. Pass composition records into `buildAllRealPrompts`. Depends on G4 so that the wired inputs are fingerprinted.
6. **G6 – Safe derivations (§5).** Livestock bands from individuals, soil sample date/georef, peat from OM, county from fields, prior inputs from job actuals, application dates from intervals.
7. **G7 – Regulatory farm context.** Previous-year GSR basis (grazing groups, residency), livestock batch confirm, imports/exports + attestation, farm-level 170 kg N rule, deemed-P-Index representation (after the rule spec). Depends on G6.
8. **G8 – Batch evidence-check UX** (§9 step 3). Depends on G4 (persist), G6 (pre-fill) and G7 (what to ask).
9. **G9 – Peer-reviewed rate engine** (RATE layer). Depends on the §12 resolutions, G3 (measured soil), G5 (composition) and G6/G7 (prior inputs, compliance ceilings).
10. **G10 – Finite allocation.** Wire `buildSlurryWholeFarmAllocation` with engine-generated candidates (from G9) against G2's remaining volume. Depends on G12: a candidate's total volume is executable only where its spreadable area is defensible.
11. **G11 – Farmer override/reallocation.** Edits flow back through `validateNewSlurryAllocationPlan` + RPC and supersede records (`validateSupersession`).
12. **G12 – Defensible spreadable-area evidence.** Spatial integrations (LPIS, EPA, GSI, DEM, ISIS, OPW) and/or an appropriately qualified explicit exclusion-evidence source → effective `spreadable_area_ha`, together with the §12 item 15 buffer-semantics resolution. Current geometry (`computeBoundaryGeometry`) returns the whole-polygon area and `calculateNutrientPlan` divides allocation volume by it; no exclusion geometry or buffer is subtracted. **Until G12 lands, effective spreadable area stays UNKNOWN.** Gross area may be used for provisional illustrations or research calculations only, never to produce an executable recommended total volume; disclosing the gross-area assumption does not make it evidence. G12 does not gate RATE work (G9), but it gates every executable TOTAL_VOLUME result (G10, G11, G13).
13. **G13 – Live end-to-end validation** on Dev at mobile and desktop sizes. This is also where the "requires live/runtime validation" claims in this audit get confirmed or refuted.

### 10a. Five-layer blocking model: spreadable area and prior slurry

Each layer blocks independently. An unknown input blocks only the layers
that actually consume it:

| Layer | Spreadable area UNKNOWN (gross area only) | Prior slurry records physical only (no neat basis / no field split) |
|---|---|---|
| **R** RATE (m³/ha) | **not blocked by area.** A scientifically valid m³/ha rate can exist independently of field area | agronomic credit of past slurry → `BLOCKED_BY_UNRESOLVED_SCIENCE` (§12); the application's fact/date/method is reusable context |
| **C** COMPLIANCE | field-level gates still evaluate; any per-field statutory quantity that needs area × rate stays blocked | statutory reconstruction of past slurry N/P → `BLOCKED_BY_UNRESOLVED_SCIENCE` (neat basis absent); multi-field records additionally missing field-level split evidence |
| **V** TOTAL_VOLUME (m³) | **BLOCKED.** Gross area × rate must not produce an executable recommended total volume; a gross-area figure may appear only as a labelled provisional illustration | past volume per field known only for single-field records |
| **E** ECONOMIC | per-ha economics may be illustrated; whole-field and whole-farm totals inherit the V block | inherits the R/C blocks |
| **A** ACTIONABILITY | cannot become an executable farm allocation while V is blocked | – |

---

## 11. Recommended phased implementation sequence

Dependency sequence. Each step depends only on the steps above it. No
executable farm allocation (TOTAL_VOLUME) is produced before step 5.

| Step | Contents (gaps) | Why here |
|---|---|---|
| **1 — Allocation lifecycle / reconciliation** | G1 (done), G2 | The DB capacity invariant is applied on Dev, so, going by the code, the missing allocation lifecycle blocks there: a farmer who spreads cannot lower the fill level. (Confirmed from code; not yet observed at runtime.) Any TOTAL_VOLUME work built before this would rest on non-decreasing allocations. |
| **2 — Evidence / provenance semantic corrections** | G3, G4 | stop fabricated prior nodes; separate measured vs farmer-estimated P/K Index; replace Housing placeholder zeros with UNKNOWN; plan-run identity and input fingerprinting |
| **3 — Existing-evidence wiring** | G5, G6 | behaviour-changing but uses only evidence already captured (composition/DM, commonage, buffer, `activeFields`, prior-application records as partially reusable evidence), so it needs step 2's fingerprinting first |
| **4 — Farm regulatory context + physical-vs-neat separation** | G7; representation of physical vs regulatory neat slurry (§12 item 6) | statutory calculations must stop consuming physical volume as neat; statutory reconstruction of past slurry stays blocked until the neat basis exists |
| **5 — Defensible spreadable-area evidence** | G12 | gates every executable TOTAL_VOLUME result; until then spreadable area is UNKNOWN and gross area is illustration-only |
| **6 — Minimal evidence-check UX** | G8 | asks only for facts steps 3–5 could not reuse or derive |
| **7 — Peer-reviewed / frozen scientific rate rules** | §12 resolutions | **gated on external peer review**, not on code readiness |
| **8 — Field rate calculation** | G9 | RATE layer (m³/ha); may be computed where area is unknown, but does not yield a total volume |
| **9 — Whole-farm finite-resource optimisation** | G10 | rate × defensible spreadable area against step 1's remaining volume |
| **10 — Farmer override / reallocation** | G11 | – |
| **11 — Actionability / live E2E validation** | G13 | on Dev at mobile and desktop sizes; confirms or refutes this audit's runtime claims |

Each phase is subject to BUILD_PLAN.md's quality gate and Codex audit.

---

## 12. Must NOT be built until the scientific specification is peer-reviewed

Scientific / regulatory boundaries recorded here and **not resolved in
code**:

1. The Teagasc 33 m³/ha first-cut example vs the 90 kg K/ha spring
   safeguard, and which governs a rate recommendation.
2. Interpolation between published slurry DM classes. This includes the
   existing Table 9-8 **nearest-DM-column snapping** (`nearestDmColumn`,
   `nutrients.ts:515`), which is itself an unreviewed class treatment, and
   the LESS tables' exact-match requirement against a 6.3 % default.
3. Table 9-8 **rate clamping to [11, 55] t/ha** (`nutrients.ts:531`). Below
   11 m³/ha the credit is overstated; above 55 m³/ha it is understated.
   Newly recorded.
4. Lab total-N (and NH₄-N) → available-N transformation. Recorded N/P/K stay
   unused.
5. The young-reseed / yield-adjustment interaction.
6. Regulatory neat slurry vs physical diluted slurry, including the current
   use of statutory neat coefficients on physical volume (`nutrients.ts:2067`),
   dilution, soiled water and rainfall contribution.
7. Spring LESS / summer LESS P = 0.5 vs 0.6 kg/m³ (the Signpost 2026
   discrepancy, `nutrients.ts:702–720`).
8. Splashplate outside spring, LATE_SUMMER/autumn for any method, and
   `incorporate_24h`/`other` availability (currently fail closed).
9. The regulatory/deemed P Index for grassland without a valid test.
10. Previous-year GSR computation basis (animal residency, housed vs
    grazing, calves).
11. Early/spring-grazing N credit.
12. Clover / multispecies N interaction with slurry N.
13. The heavy-rain legal threshold and flood-likelihood determination.
14. Per-nutrient replacement pricing for P/K from compound products (the
    existing plan-cost-difference method avoids this and should be kept).
15. Buffer semantics: field-level prohibition vs spreadable-area reduction.

Do not build before review:
- the rate engine (G9) beyond the existing, fail-closed tables;
- any use of recorded total N/P/K or hydrometer readings;
- any neat-slurry quantity, including statutory N/P reconstructed from
  recorded physical slurry quantities;
- any executable total volume from gross field area;
- any derogation logic;
- any deemed-P-Index default;
- any available-nutrient credit for non-spring splashplate, late-summer
  timing or `incorporate_24h`/`other`;
- any automatic trafficability, frost or heavy-rain inference;
- any change to the existing Table 9-8 rate/DM handling (record, do not
  "fix");
- any reseed/clover/early-grazing adjustment.

---

## 13. Campaign A completion — evidence foundation (starting HEAD `38b98df`)

Campaign A combined §11 step 2 (evidence/provenance semantic corrections)
and the evidence-wiring part of step 3. Every finding below was re-traced
against `38b98df` before it was changed; the audit text above is kept as
written at `f2d95c7`. No migration, no schema change and no data mutation
were needed or made.

### Findings and final status

| Finding (section above) | Status at `38b98df` | Final status |
|---|---|---|
| §1 item 2 / §4 item 5 — What Matters pilot passes archived fields (candidates, `farmGrasslandAreaHa`) | reproduced (`listFieldsForFarm` unfiltered in `what-matters-pilot.ts`) | **FIXED** — the pilot takes `activeFields` and grassland area from `buildSlurryEvidenceContext`; `computeFarmGrasslandAggregates` and `buildAllRealPrompts` now filter archived fields themselves. Archived fields' allocations/history are not touched. Tests: `slurry-evidence-context.test.ts` (A/Q), `what-matters-pilot.test.ts` (A/Q), `build-all.test.ts` |
| §1 item 2 — pilot calls `calculateNutrientPlan` without `slurryComposition` (recorded DM replaced by 6.3 %) | reproduced | **FIXED** — each field's recorded composition comes from the evidence context and reaches both plans. Tests: `what-matters-pilot.test.ts` (J/L) |
| §1 item 2 — Today/Plan/Fields prompts ignore composition; multi-store field resolves to `housingId: "multiple"` and falls back to 6.3 % | partly reproduced: `buildAllRealPrompts` accepts records but the `"multiple"` lookup always missed; the three pages still pass none | **FIXED (multi-store) / DEFERRED (page wiring)** — `resolveFieldSlurryCompositionInput` resolves per contributing store in `buildAllRealPrompts` and the Nutrients screen; a multi-store field with any recorded composition now blocks the slurry credit with `SLURRY_COMPOSITION_SOURCES_UNRESOLVED` (no rule combines per-store DM %) instead of silently using 6.3 %. Passing `useSlurryCompositionRecords()` from Today/Plan/Fields, and composition into `getFarmFertiliserDemand`/`recompute.ts`, is not done — those fertiliser paths still use the disclosed `estimated` 6.3 % default. Tests: `build-all.composition.test.ts`, `slurry-evidence-context.test.ts` (L/P) |
| §1 item 2 / §4 item 1 — commonage and water-buffer answers not reaching the slurry evidence path | reproduced | **FIXED (evidence) / DEFERRED (decision)** — both answers are carried, with provenance, in `FieldSlurryEvidence.commonageStatus`/`waterBufferContext`. They are **not** passed into `buildSpreadingActionabilityFoundation`: doing so changes the regulatory actionability decision, and the buffer gate's whole-field prohibition is the unresolved §12 item 15 buffer-semantics question → Campaign B. No duplicate ask exists today: the pilot's regulatory UNKNOWN asks the farmer nothing (`requiredConfirmations: []`) and the commonage/buffer prompts only invite confirmation when no farmer answer is on record. Tests: `slurry-evidence-context.test.ts` (G/H/I) |
| §1 item 5 / §4 item 2 — farmer P/K tap shares one slot with the lab index | reproduced: the chain keeps the lab node, but `SoilFieldCard` badged a farmer-overridden index "verified" whenever a lab test existed, and the 4-year soil-test rule (engine, `SoilFieldCard`, `FieldDrawer`) ran on the farmer's value — a farmer Index 4 could earn the lab-result persistence exception | **FIXED** — `soil-index-provenance.ts` separates laboratory / farmer override / effective value from the existing chain (nothing rewritten); `NutrientPlan.soilIndexProvenance` makes an override traceable downstream; `soilTestAgeValidityForFertility` judges the rule on the lab index (without a lab node, the 4-year limit still applies and the Index-4 exception is never granted). The effective index used by the nutrient science is unchanged. Tests: `soil-index-provenance.test.ts` (B/C/D) |
| §4 item 2 — a farmer-tapped index still yields a `compliance_value` NAP ceiling | still true | **DEFERRED → Campaign B** — deciding which index a statutory ceiling may use (and the deemed-P-Index rule, §12 item 9) is a regulatory interpretation. The override is now traceable on the plan. |
| §2B / §4 item 10 — Housing "Estimated nutrient value" shows **0 kg** N/P/K for the placeholder | reproduced | **FIXED** — `NutrientValueRow` reads `slurryEstimateNutrientEvidence`: the placeholder is "Unknown", a genuine calculated 0 stays representable. `SlurryStoreEvidence` keeps physical volume known while nutrient content stays missing. Tests: `slurry-evidence-context.test.ts` (E/F), `housing/page.test.tsx` |
| §2F / §2I — prior slurry applications / planned vs actual | Phase 1A lifecycle now canonical | **WIRED** — `plannedApplications` (planned only) and `completedApplications` (actual volume/date; the method is labelled `methodAsPlanned`, since completion never confirms a method). A past method is never offered for a new plan. Tests: N/O |
| §2F — `job_actuals` `slurry_spreading` records | not linked to allocations | **DEFERRED** — the identity of a job actual and an allocation cannot be established from stored data, and multi-field records have no per-field split; not wired, to avoid cross-field attribution. |
| §4 item 7 — fabricated "Farm Return assumption" prior nodes; per-keystroke buffer history | still true | **DEFERRED** — outside Campaign A's A1 list. The context reads only the chain head, so fabricated prior nodes never surface as evidence. |
| §4 item 9 — guided path writes analysis date as sample date | still true | **DEFERRED** (not in Campaign A scope). |
| §2G — blank fill stored as `0` / `estimated` | still true | **DEFERRED** — the store evidence reports it truthfully as a known `estimated` value, not farmer-recorded; making blank fill nullable needs a schema change (not required for Campaign A). |

### Final evidence-flow semantics

`buildSlurryEvidenceContext` (`src/domain/slurry-evidence-context.ts`,
`slurry_evidence_context_v1.0.0`) is the one canonical evidence boundary
for slurry planning, and the What Matters pilot uses it. It is pure and
only reads what the data layer already returns. Every fact is an
`EvidenceFact`:

- `known`: value, `status` (`DataStatus`), `source`, `recordedAt`,
  `recordId`, and `freshness: "NO_FRESHNESS_POLICY"` wherever no approved
  validity rule exists. No freshness rule was invented. Soil P/K keeps the
  existing 4-year rule (`soilTestAgeValidity` on the field evidence).
- `missing`: a reason code only. Unknown never becomes `0`, `false` or a
  default. A farmer choosing "unknown" for commonage stays missing, and an
  unset buffer distance stays `undefined`.
- `conflicting`: every candidate kept, none chosen (multi-store DM).
- Soil P/K: `SoilIndexProvenance` (`basis`, `effective`, `laboratory`,
  `farmerOverride`).

The science boundary is unchanged. Recorded DM % flows only into the
already-audited `resolveEffectiveSlurryComposition` → Teagasc table
selection, which is the existing approved contract. No DM → N/P/K
conversion, interpolation or table choice was added. Recorded total N/P/K
stay recorded and unused. Physical store volume is never converted to
regulatory neat slurry.

### Remaining dependencies

- **Campaign B:** feed commonage and buffer evidence into the actionability
  and regulatory decision (§12 item 15 buffer semantics first). Also:
  statutory index selection for farmer-overridden P (deemed P Index, §12
  item 9), physical vs neat slurry (§12 item 6), and spreadable area (G12).
- **Campaign C:** a DM-combination rule for multi-store fields (currently
  fails closed), DM interpolation and nearest-column snapping (§12 items
  2–3), a composition freshness policy (tank fill cycle), lab total-N/NH₄-N
  conversion (§12 item 4), and the P 0.5 vs 0.6 kg/m³ conflict (§12 item 7).
- **Wiring left open:** composition records into Today/Plan/Fields and the
  fertiliser demand/recompute paths, plus linking job actuals to
  allocations.


---

## 14. Campaign B completion — regulatory context, physical slurry identity, spreadable area, evidence checks (starting HEAD `06b229c`)

The text above (§1–§13) is kept as written. No migration, schema change or
Dev data mutation was needed or made. No slurry rate, total volume, ranking
or optimisation was added (Campaign D).

### Implemented

- **`src/domain/slurry-regulatory-context.ts`** (`slurry_regulatory_context_v1.0.0`)
  — `buildSlurryRegulatoryContext` wraps Campaign A's
  `buildSlurryEvidenceContext` (same `EvidenceFact` semantics) and adds:
  per-store `physicalVolumeM3` / `regulatoryNeatVolumeM3` / `composition`
  as three independent facts; `plannedRegulatoryNeatSlurryByField`;
  per-field `spreadableArea`; the farm regulatory context; and
  `evidenceChecks` (blockers by layer). It records the ruleset it was built
  against (`SLURRY_REGULATORY_RULESET`: S.I. No. 588/2025 as amended by
  S.I. No. 119/2026, `docs/scientific-engine/v3/rules_statutory/`, plus the
  statutory manure, statutory excretion, soil-index-provenance and
  soil-test-validity module versions), so a later rule change does not
  rewrite what an earlier context meant.
- **`calculateNutrientPlan`** (`nutrients.ts`) — the statutory manure N/P
  ledger (`statutoryManureNutrientValuePerHa`, S.I. 588/2025 cattle slurry
  2.4 kg N / 0.5 kg P per m³ × the Schedule availability factors) is
  computed only from the new optional `plannedRegulatoryNeatSlurry` input,
  never from the allocation's physical `volumeM3`.

### Findings and final status

| Finding | Status |
|---|---|
| §12 item 6 / §2H — statutory neat coefficients applied to physical allocated volume (`nutrients.ts` `statutoryManureNutrientValuePerHa("cattle_slurry", totalM3, …)`) | **FIXED** — with slurry planned and no evidenced neat volume, `statutoryManureValue` and `napCompliance` are `BLOCKED_INSUFFICIENT_EVIDENCE` `REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN`. The organic share is unknown, not zero. The agronomic Table 9-8 / LESS credit is unchanged. |
| B1 — physical vs neat vs composition | **FIXED (representation)** — a store's neat volume is `missing` unless explicit evidence is supplied; neat > physical is `conflicting`; a planned allocation gets a neat volume only when every contributing store is evidenced as wholly neat (neat = physical). No neat fraction is derived for a partly-diluted store. |
| B1 — persisting a farmer/source neat-slurry quantity | **DEFERRED (needs schema)** — no table/column holds neat volume or dilution evidence (`TankDetail.dilutionWaterFactor` is type-only). Production callers therefore always see neat volume as unknown, which is the truthful state. Minimal future change: a store-scoped, append-only neat-slurry evidence record (volume, basis, source, status, recorded_at, observation seq). |
| B2.1 — statutory vs agronomic ledgers | **NOT REPRODUCIBLE (already separate)** — `statutoryManureValue` and `organicApplication.offset*` remain separate outputs; neither feeds the other. |
| B2.2 — home-produced grazing-livestock manure counted as ordinary Table 15 P input (`actualAppliedNPKgHa` adds home slurry P to chemical P before comparison with Table 15a/15b) | **BLOCKED (conclusion fails closed)** — see "Unresolved regulatory questions". When evidenced neat slurry is planned, `napCompliance` is `BLOCKED_INSUFFICIENT_EVIDENCE` `HOME_PRODUCED_MANURE_P_ACCOUNTING_UNRESOLVED` instead of a verdict from the simplified sum. No `Table 15 allowance ÷ concentration = maximum slurry` calculation exists in the repo (searched `src/`); none was added. |
| B2.3 — organic-N / derogation context | **FIXED (evidence boundary)** — `farm.derogationStatus`, `manureImports`, `manureExports` are `missing`; `organicNLimit` is blocked (`ORGANIC_N_LIMIT_RULE_NOT_ADOPTED`); the existing statutory GSR is surfaced with `basis: "current_herd_record_not_previous_year"`. No derogation or generic limit is assumed. |
| §4 item 2 / B2.4 — a farmer-tapped P Index yields a `compliance_value` NAP ceiling | **FIXED** — when the working P Index is not a laboratory result (`resolveSoilIndexProvenance(...).basis !== "laboratory"`), the NAP check is downgraded to `planning_advice` with `pIndexNotLaboratoryReason` (card, trace and CSV show it), and the statutory manure P availability factor is blocked (`COMPLIANCE_P_INDEX_NOT_LABORATORY`). The override stays the effective agronomic value and the laboratory node is untouched. |
| B3 — gross area used as spreadable area | **FIXED (representation)** — `grossMappedAreaHa` is `known` (mapped boundary or typed area, labelled), `knownExcludedAreaHa` and `spreadableAreaHa` are `missing`. Commonage and water-buffer answers are carried as exclusion evidence; no buffer geometry is inferred (§12 item 15 unresolved). The spreadable-area check is `TOTAL_VOLUME_BLOCKING` only — never `RATE_BLOCKING`. `calculateNutrientPlan` still divides a farmer's planned physical volume by gross area to express the existing plan's m³/ha; that is not a recommendation and produces no total. |
| B3.4 — archived fields | **UNCHANGED** — excluded from every Campaign B output, as in Campaign A. |
| B4 — evidence checks | **FIXED (domain)** — `evidenceChecks` classifies each unresolved fact by `RATE_BLOCKING` / `COMPLIANCE_BLOCKING` / `TOTAL_VOLUME_BLOCKING` / `NON_BLOCKING` (economic/actionability inheritance is Campaign D/E), by state (`missing`, `declared_unknown`, `conflicting`, `stale`, `not_legally_sufficient`), and asks (`ask: true`) only where an existing capture path exists and no valid answer is held: store fill (Housing), commonage and water buffer (Field Detail), laboratory soil test (Soil). Farm-level facts appear once; field facts appear once per state with the fields named; answers are never copied between fields; a recorded "not sure" commonage answer is disclosed, not re-asked. Neat slurry, spreadable area and derogation have nowhere to be recorded, so they are disclosed, not asked. Messages are plain language. |
| B1/B3 — farmer capture of neat slurry and spreadable area (2026-09-28) | **IMPLEMENTED (migration unapplied on Dev)** — neat cattle slurry is recorded per store on the Housing & Slurry screen (`NeatSlurryEvidenceCard`), spreadable area per field on the field drawer's Constraints tab (`SpreadableAreaEvidencePanel`), both through the existing append-only tables and repository. Physical volume and gross area are shown beside them as different figures and never prefill or substitute; "no figure" is an unavailable record, distinct from an explicit 0; an area above the field's size is refused, never clamped; figures dated on or before the latest fill reading stay on record but not in use. The evidence checks now point at these screens (`housing_store`, `field_detail`) and ask only while nothing is on record. Spreadable area still has no calculation consumer (TOTAL_VOLUME work is later). See `IMPLEMENTATION_LOG.md`. |
| B4 — NAP card | **FIXED** — the blocked card explains the actual reason in plain language instead of listing internal input identifiers. |
| B4 — rendering `evidenceChecks` on a screen and the What Matters pilot consuming the new context | **DEFERRED** — no new screen was built (it needs the mobile + desktop review, and new answers for neat slurry / spreadable area need persistence first). The pilot still uses `buildSlurryEvidenceContext`; its behaviour is unchanged because neat volume is unknown for every real store. |

### Blocker semantics

| Unresolved fact | Layers |
|---|---|
| store physical volume | TOTAL_VOLUME |
| regulatory neat slurry | COMPLIANCE |
| spreadable area | TOTAL_VOLUME (not RATE) |
| derogation status | COMPLIANCE |
| commonage / water buffer | COMPLIANCE |
| soil P missing | RATE + COMPLIANCE |
| soil P farmer/estimate or disregarded (4-year rule) | COMPLIANCE |
| multi-store DM conflict | RATE |
| planned-manure origin (none, not sure, mixed, conflicting) | COMPLIANCE |

### Unresolved regulatory questions

1. **Home-produced grazing-livestock manure and the Table 15a/15b P maxima —
   RESOLVED 2026-09-27 (legal interpretation).** S.I. 588/2025 Art. 17(8)
   (not amended by S.I. 119/2026, the only listed amendment): the Tables
   13/15a/15b/16/17 maxima are in addition to the N/P in grazing livestock
   manure produced on the holding. Implemented as
   `HOME_GRAZING_MANURE_MAXIMA_RULE` v1.0.0 (`nutrients.ts`). It applies only
   to slurry whose origin is evidenced. Imported manure counts in full. At
   Index 4 the check is blocked on the Tables 15a/15b footnote 3 holding-wide
   surplus condition. Origin evidence (2026-09-28): origin is declared per
   planned spreading, bound to the plan's database-maintained revision
   (`slurry_allocation_origin_evidence_records`, `slurry-origin-evidence.ts`),
   never per store and never inferred. Only an applicable home-produced or
   imported declaration on every contributing plan reaches the engine;
   mixed, not sure, differing or conflicting origin and no declaration
   still fail closed (`PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED`). The
   migration is not yet applied to Dev. See `IMPLEMENTATION_LOG.md`. The earlier analysis is kept below
   for history. The adopted rule set (`rules_statutory/`) does not encode it. The only
   repo text is the Green Book 2020 summary of superseded S.I. 605/2017
   (`reference_greenbook_2020/Page_Text.csv`, Table 13-6 notes): the P
   maxima exclude "the recycled nutrient P in organic manures deemed to be
   produced during the required winter storage period on the holding", and
   such manure may go on Index 4 soils only once Index 1–3 needs are met.
   Needed: the current S.I. 588/2025 article text, how "deemed produced
   during the storage period" is quantified (storage weeks × statutory
   production rates, which are not in the repo), and how a surplus above
   that is counted.
2. **Farm-level livestock-manure organic-N limit** (170 kg N/ha, Article
   20(1) in the Green Book's S.I. 605/2017 citation) — not in the adopted
   rule set; depends on derogation status (external authorisation).
3. **Previous-year GSR basis** (§12 item 10) — surfaced as-is with its
   basis caveat.
4. **Neat-slurry basis** — whether any statutory rule or accepted evidence
   (e.g. a DM % threshold) defines the neat-equivalent of diluted slurry.
   Not assumed.
5. **Buffer semantics** (§12 item 15) — field-level prohibition vs
   spreadable-area reduction; needed before any exclusion area is derived.

### Campaign C dependencies (untouched)

DM composition table, DM interpolation/nearest-column snapping, Table 9-8
rate clamping, lab total-N/NH₄-N conversion, P 0.5 vs 0.6 kg/m³, the
33 m³/ha vs spring K-cap conflict, reseed/pH/clover adjustments and
confidence scoring. No Campaign B output chooses any of them.

---

## 15. Campaign B closure audit (starting HEAD `4f61f07`, 2026-09-28)

Traced against the production call chains, not against sub-task reports.
No migration was applied to Farm Return V1 Dev. No Campaign C science,
rate, optimiser or What Matters change was made.

### Requirement matrix

| Requirement | Canonical implementation | Persistence | Production caller(s) / capture | Status |
|---|---|---|---|---|
| Regulatory context (ruleset, farm facts, evidence checks) | `buildSlurryRegulatoryContext(FromRecords)` (`slurry-regulatory-context.ts`) | — (derived) | Nutrients, Scientific Evidence Report, `/housing`, `/fields` drawer (`useSlurryRegulatoryEvidence`) | COMPLETE |
| Physical volume vs regulatory neat quantity | `storeSlurryIdentity`, `resolveRegulatoryNeatSlurryVolume`; `calculateNutrientPlan` statutory ledger reads only `plannedRegulatoryNeatSlurry` | `slurry_store_neat_evidence_records` | Nutrients, Report; capture `NeatSlurryEvidenceCard` (`/housing`) | COMPLETE_BUT_MIGRATION_UNAPPLIED |
| Spreadable area vs gross area | `fieldSpreadableAreaEvidence`, `resolveSpreadableAreaHa` (never clamped, never defaulted from gross) | `field_spreadable_area_records` | context + `SpreadableAreaEvidencePanel` (`/fields` Constraints). No calculation consumer (see below) | COMPLETE_BUT_MIGRATION_UNAPPLIED (capture/representation); consumer OUT_OF_SCOPE_CAMPAIGN_C |
| Canonical immutable evidence | insert/select-only tables, DB-stamped `created_by`/`created_at`, corrections are new rows | both Campaign B migrations | repository `create*` paths | COMPLETE_BUT_MIGRATION_UNAPPLIED |
| Temporal integrity | neat date must follow the current fill observation and every deducted withdrawal; otherwise `NOT_COMPARABLE` (record untouched) | — | context | COMPLETE |
| Deterministic selection | `currentBy`: latest effective date → capture time; equivalent ties collapse by id, contradictory ties conflict; singleton ≠ tie | — | context, views | COMPLETE |
| Home-produced grazing vs imported manure (Art. 17(8)) | `HOME_GRAZING_MANURE_MAXIMA_RULE`, `nutrients.ts` | — | Nutrients, Report | COMPLETE |
| Peat / >20% OM P rules | `soilOrganicMatterOver20Pct` (lab OM > 20%, else mapped peat) → P ceiling cap + manure-P availability | — | Nutrients, Report | COMPLETE |
| Slurry-origin evidence | `slurry-origin-evidence.ts`, `fieldPlannedManureOrigin`, bound to `plan_revision` | `slurry_allocation_origin_evidence_records` + `slurry_allocations.plan_revision` | Nutrients, Report; capture on `/spreading/plan` | COMPLETE_BUT_MIGRATION_UNAPPLIED |
| Farmer capture of blocking evidence | neat (`/housing`), spreadable area (`/fields`), origin (`/spreading/plan`); NAP card names the capture location for neat (this audit) and origin | the three tables | as listed | COMPLETE_BUT_MIGRATION_UNAPPLIED |
| Live loading into regulatory calculations | `loadRegulatoryEvidenceRecordsForFarm` → `buildSlurryRegulatoryContextFromRecords` → `plannedRegulatoryNeatSlurryForNutrientPlan` → `calculateNutrientPlan` | — | Nutrients (layout → farm store), Report (loader) | COMPLETE |
| Provenance / auditability | records carry status, source, effective date, `recordedBy`, capture time; ruleset versions on the context | tables | views on `/housing`, `/fields` | COMPLETE |
| Fail-closed unknown/conflicting | `EvidenceFact` states; NAP/statutory ledger `BLOCKED_INSUFFICIENT_EVIDENCE` | — | every `calculateNutrientPlan` caller | COMPLETE |
| No physical → neat substitution | neat known only from evidence and only when equal to the plan's physical volume; no caller passes physical as neat | — | all callers (static guard in `regulatory-evidence-wiring.test.ts`) | COMPLETE |
| No gross → spreadable substitution | spreadable area `missing` unless recorded; forms never prefill; above-gross refused | — | `/fields` | COMPLETE |

### Production call-chain coverage

| Caller | Campaign B facts consumed | Receives |
|---|---|---|
| `/housing` (`NeatSlurryEvidenceCard`) | neat evidence, physical volume, temporal gate | canonical context + record view (status, provenance) |
| `/fields` drawer (`SpreadableAreaEvidencePanel`) | spreadable area, gross area | canonical context + record view |
| `/spreading/plan` (`SlurryPlanLifecycle`) | origin declaration per plan revision | record view |
| `/nutrients` (`NutrientsPageClient`) | neat, origin, OM/peat, lab P, Art. 17(8) | canonical context → `NutrientPlan` (reduced reason codes) |
| Scientific Evidence Report | same as Nutrients | `loadSlurryRegulatoryContextForFarm` → `NutrientPlan` |
| Today / Plan prompts (`promptForFertiliserRecommendation`), fertiliser-plan overview (`getFarmFertiliserDemand`), real alerts, reports CSV / audit trail, finance, What Matters pilot | none (no evidence input) | NAP/statutory ledger `BLOCKED_INSUFFICIENT_EVIDENCE` whenever slurry is planned — never a verdict from physical volume; agronomic requirement/products unchanged |

### Closure decisions

- **C — spreadable area.** No Campaign B calculation needs it. The
  statutory N/P maxima are per-hectare field allowances computed over the
  field's area; whether buffers/exclusions reduce that area is unresolved
  regulatory question 5, not a substitution. Spreadable area is required
  only to turn a Campaign C rate into a total recommended volume.
  **OUT_OF_SCOPE_CAMPAIGN_C** — no consumer invented.
- **D — Today / What Matters / fertiliser-plan overview.** None has a
  Campaign B correctness gap: What Matters reads no statutory output; the
  overview and prompts read the agronomic ledger, and their NAP output fails
  closed (no warning is issued from an unknown total; nothing claims
  compliance). Showing a resolved NAP verdict on those surfaces needs their
  frozen contracts widened with evidence inputs — belongs to the later
  recommendation layer (Campaign C/D), not Campaign B.
- **E — blocker reasons.** `NutrientPlan` reduces unavailable, not
  comparable and conflicting neat evidence to
  `REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN`; the precise state is shown where
  the farmer can act on it (`/housing` view: "not in use", "needs
  checking", "no figure"). Fail-closed is sufficient at the `NutrientPlan`
  layer, and no contract was widened. The one real gap found — the NAP
  card did not say where neat slurry can be recorded — is **FIXED** (it now
  points to the Housing & Slurry screen; test in `NapComplianceCard.test.tsx`).
- **Deferred with a regulatory STOP, not code:** derogation status, manure
  imports/exports and the farm-level organic-N limit (question 2: rule not
  adopted, external authorisation); a per-origin split for mixed material
  (no audited basis, engine takes one origin per field); the neat-equivalent
  of diluted slurry (question 4). All fail closed today.

### Migration / deployment state

| Migration | Purpose | Code depends on it | When absent |
|---|---|---|---|
| `20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql` | neat-slurry and spreadable-area evidence tables, actor/capture stamping, `EXCEEDS_GROSS_AREA` trigger | loader, both forms | loader maps `42P01`/`PGRST205` to no records (`evidenceTablesApplied: false`) → facts NOT_ESTABLISHED; forms say "nothing was saved"; other errors thrown |
| `20260928000000_slurry_allocation_origin_evidence.sql` | `slurry_allocations.plan_revision` + origin evidence table | loader, origin capture | origin records empty → NAP blocked `PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED`; `plan_revision` read as optional by the allocation mapper; capture refused as not available |

Neither is applied to Farm Return V1 Dev (not applied or re-checked in this
audit). Applying them, followed by a Dev validation of RLS/triggers (only
static SQL coverage exists), is the only remaining step and is operational.

### Historical / regulatory integrity (existing tests, re-run)

Immutability, tie handling, temporal gating, stale-not-current, actor and
effective-date provenance, small positive vs zero, completed/cancelled
origin history: `regulatory-evidence-records`, `slurry-regulatory-context`,
`slurry-origin-evidence`, `regulatory-evidence-declarations`,
`regulatory-evidence-wiring` and the evidence-UX component suites. Art. 17(8),
imported manure, chemical P, concentrate P, Index 4, >20% OM, peat mapping,
manure-P availability, livestock-manure N and unknown-evidence blocking:
`nutrients.test.ts` and the Scientific Evidence Report suites. All green; no
new gap found, so no new tests beyond the NAP card one.

### Final status

**Campaign B: COMPLETE IN CODE.** Deployment outstanding: the two migrations
above are unapplied on Farm Return V1 Dev. Spreadable-area consumption and
prompt/overview NAP resolution are Campaign C/D; derogation/organic-N limit,
mixed-origin split and diluted-slurry neat basis await regulatory adoption.
