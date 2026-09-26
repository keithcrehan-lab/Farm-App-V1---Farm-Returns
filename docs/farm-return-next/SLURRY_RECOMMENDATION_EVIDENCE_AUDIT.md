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
     never matches a published row (2/4/6/7 %), so **the code fails every
     LESS allocation closed with `BLOCK_NO_INTERPOLATION`**. That holds even
     when the farmer has recorded a DM % for the store. The same call also
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
| spreadable area ha | R, V, E | MISSING_EXTERNAL_DATA_INTEGRATION | none | – | – | – | no | not without buffer geometry / EPA, GSI, DEM | **only gross area is defensible today** | geometry pipeline; interim: farmer-confirmed exclusion % flagged `farmer_adjusted` |
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
| previous slurry applications | R, C, V | DERIVABLE_FROM_EXISTING_DATA | `job_actuals.payload` (`SlurrySpreadingActual`: quantity, `m3\|gallons`, method, slurryType, fieldIds) | persisted → **consumed nowhere** except field-awareness activity lists | `ConfirmActualSheet.tsx:302` | farmer-confirmed | yes / – | yes | does not decrement tanks, release allocations or credit nutrients | derive ledger; link to allocations |
| previous slurry volume m³/ha | R | DERIVABLE_FROM_EXISTING_DATA | same (quantity ÷ confirmed area) | – | – | – | – | yes (gallons need a unit rule) | – | – |
| FYM / other organic manure | R, C | MISSING_REQUIRES_FARMER_ENTRY | none (`slurryType: "other"` only) | – | – | – | no | – | statutory FYM rates exist (`MANURE_TOTAL_NP`) | entry only when "yes" |
| organic N/P/K already applied | R, C | DERIVABLE_FROM_EXISTING_DATA | – | statutory ledger derivable (`statutoryManureNutrientValue`); agronomic ledger needs method/timing/DM | – | – | – | statutory yes / – | agronomic credit of past applications → §12 | derive the statutory ledger only |
| early-grazing N | R | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | batch confirm |
| early-grazing N credit | R | BLOCKED_BY_UNRESOLVED_SCIENCE | only the Green Book `wasGrazedPreviousYear` flag | – | – | – | – | – | spring-grazing credit not encoded | spec first |
| application dates | C, R | EXISTS_WEAK_PROVENANCE | `job_actuals.confirmed_at`; `job_sessions.active_intervals` | – | – | confirmation time ≠ application time | – | derivable from `active_intervals` | closed-period/season attribution off by the confirmation lag | derive from intervals |
| nutrient history completeness | R, C | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | annual attestation |
| farmer confirmation that no unrecorded inputs exist | R, C | MISSING_REQUIRES_FARMER_CONFIRMATION | none | – | – | – | no | – | – | one checkbox per plan run, persisted |

Answer to "can prior crop-cycle inputs be rebuilt from records?": **partially.**
Confirmed chemical applications made through GPS Job Mode can be rebuilt
(with the date and multi-field caveats above). Confirmed slurry spreading
can be rebuilt but is currently unused. Off-app applications, FYM and a
completeness attestation cannot. "Nutrient plans" are not persisted (they
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
| composition basis | R | EXISTS_WEAK_PROVENANCE | `slurry_composition_records.status` (`farmer_adjusted \| verified`); absence = `estimated` | `addSlurryComposition` → `currentSlurryCompositionByHousing` → `resolveEffectiveSlurryComposition` | `AddSlurryCompositionSheet`, `SlurryCompositionCard` | `verified` is **self-declared** (lab name enforced in UI only, not DB) | yes / – | – | – | keep; require a document for `verified` |
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
- **volume**, from rate × spreadable area, bounded by remaining store
  volume;
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
| Prior slurry per field | `job_actuals` `slurry_spreading` | RATE, statutory ledger, tank release |
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
| Volume to spread (m³) per field | `SlurryPlanForm.tsx:118–121` | no rate engine proposes a volume | field area (`fields.area_ha`), remaining store volume (`availableToPlanM3`) | engine proposes volume = rate × spreadable area, capped by the store; farmer accepts or edits |
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

**Farmer interactions theoretically achievable now:** once the §10 gaps
through Phase F are closed, a recurring run on a well-populated farm needs
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
10. **G10 – Finite allocation.** Wire `buildSlurryWholeFarmAllocation` with engine-generated candidates (from G9) against G2's remaining volume.
11. **G11 – Farmer override/reallocation.** Edits flow back through `validateNewSlurryAllocationPlan` + RPC and supersede records (`validateSupersession`).
12. **G12 – Spatial integrations** (LPIS, EPA, GSI, DEM, ISIS, OPW) → spreadable area. These are independent of G1–G11. Until they land, spreadable area = gross area, disclosed as such.
13. **G13 – Live end-to-end validation** on Dev at mobile and desktop sizes. This is also where the "requires live/runtime validation" claims in this audit get confirmed or refuted.

---

## 11. Recommended phased implementation sequence

| Phase | Contents (gaps) | Change vs the suggested A–H order and why |
|---|---|---|
| **A0 — Resource integrity** | G1 (done), G2 | **New, first.** The DB capacity invariant is applied on Dev, so, going by the code, the missing allocation lifecycle blocks there: a farmer who spreads cannot lower the fill level. (Confirmed from code; not yet observed at runtime.) Any TOTAL_VOLUME work built before this would rest on non-decreasing allocations. |
| **A — Evidence / provenance gaps** | G3, G4 | as suggested |
| **B — Safe derivations + wiring** | G5, G6 | wiring (G5) is folded in here. It is behaviour-changing but uses only evidence already captured, so it needs A's fingerprinting first |
| **C — Regulatory / farm-context completeness** | G7 | as suggested |
| **D — Minimal evidence-check UX** | G8 | as suggested |
| **E — Scientifically approved rate engine** | G9 | **gated on external peer review of §12**, not on code readiness |
| **F — Finite farm allocation** | G10 | as suggested |
| **G — Override / reallocation UX** | G11 | as suggested |
| **H — Live end-to-end validation** | G13 (+ G12 when available) | G12 runs as a parallel track. It does not gate E–G, because gross-area fallback is disclosed |

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
- any neat-slurry quantity;
- any derogation logic;
- any deemed-P-Index default;
- any available-nutrient credit for non-spring splashplate, late-summer
  timing or `incorporate_24h`/`other`;
- any automatic trafficability, frost or heavy-rain inference;
- any change to the existing Table 9-8 rate/DM handling (record, do not
  "fix");
- any reseed/clover/early-grazing adjustment.

