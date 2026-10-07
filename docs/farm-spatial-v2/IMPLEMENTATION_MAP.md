# Farm Spatial V2 — implementation map

Phase 1 output (task `farm-spatial-v2-design-authority-and-implementation-map-20261006`,
base `9da6e44`). It maps every element of the approved reference
(`design/reference/farm-spatial-v2/approved/farm_return_design_system_refined.html`)
to its real production source, or to **PLACEHOLDER / NOT IMPLEMENTED**. Later
phases use this file as their data-source authority; they must not guess a
source that is not listed here. Design authority:
`design/farm-spatial-v2/DESIGN_CONTRACT.md`.

No user-facing screen changed in Phase 1. The only code change is a block of
additive `--fr-v2-*` tokens in `src/app/globals.css`, which no screen uses yet.

## 0. Status vocabulary

| Status | Meaning |
|---|---|
| **REAL** | Persisted farm data or a canonical domain/orchestration output that exists today. Use it as named. |
| **REAL — needs wiring** | The source exists but this surface does not consume it yet. Wire the named export. Do not re-derive it. |
| **NEW PURE HELPER REQUIRED** | Simple non-scientific arithmetic over real data (a count or a sum) with no existing export. Add it to the named `src/domain/` module with a unit test. Never compute it inline in a component. |
| **NEW DOMAIN AGGREGATE REQUIRED** | A canonical nutrient or fertiliser aggregate that does not exist. It needs a scoped domain task under the `DOMAIN_CONTRACTS.md` protocol before any UI shows it. Until then the UI omits it or shows an honest "not yet available" state. |
| **PLACEHOLDER / NOT IMPLEMENTED** | No trustworthy production source exists. The UI must show a clearly labelled capability shell or omit the element. It must never show the reference's mock value. |

Every reference value (`Ballydoogan Farm`, `9 fields · 13.1 ha`, `12° Light rain`,
`P2 · K2`, `42 m³`, `15 Weanlings`, `18 Ewes`, `35`/`18`/`2`, `62/18/30`,
`31 m³`, `18-6-12 145 kg/ha 0.19 t`, `4.8 t`, `548/164/291`, `€2,310`,
`2.6 t`/`2.2 t`, `8 / 32 spaces`) is mock data. None may reach production.

## 1. Reference integrity

- `CHECKSUMS.json` records SHA-256 and byte sizes for `README.md`, the two PNGs and
  the HTML reference. They were committed with the reference in `9da6e44`.
- In this Phase 1 session the sandbox blocked the hashing tools (`shasum` and a
  Node `crypto` one-liner), so SHA-256 could not be recomputed. Instead,
  `git status --porcelain -- design/reference` was clean, so the files are
  byte-identical to the commit that recorded `CHECKSUMS.json`. **Open item:**
  the next session with hashing available must recompute SHA-256 and compare it
  with `CHECKSUMS.json` before Phase 2 relies on the reference.
- Inventory reconciliation task (2026-10-07): SHA-256 and byte size were
  independently recomputed for all four files listed in `CHECKSUMS.json` using
  Python `hashlib`; every value matched exactly. **REFERENCE INTEGRITY: PASS.**
  The checksum open item is closed and Phase 2 may rely on the approved reference pack.
- The reference directory is immutable inside build tasks. Changing it needs a
  separate design-reference task (reference `README.md`).

## 2. Current routes, landing and navigation (audited)

| Concern | Current production behaviour | Source |
|---|---|---|
| `/` | Server redirect to `/dashboard` | `src/app/page.tsx` |
| Post-sign-in default | `/dashboard` (sign-in `next` fallback, signed-in visit to `/sign-in`/`/sign-up`, auth callback, completed onboarding) | `src/app/actions/auth.ts`, `src/lib/supabase/proxy.ts`, `src/app/auth/callback/route.ts`, `src/app/onboarding/page.tsx` |
| `/dashboard` | Legacy card-grid dashboard (V1 IA), reachable under **More** | `src/app/(app)/dashboard/page.tsx` |
| `/today` | Primary nav item 1, "Today". This is the map-led control room: full-bleed `MapHero` with overlays. It is the closest existing surface to Farm Spatial V2. | `src/app/(app)/today/page.tsx` |
| `/fields` | Primary nav item 2, "Farm". Field list and bounded map, plus `?field=<id>` field detail (`FieldDrawer` tabs Now/Soil/Activity/Constraints), boundary-first Add Field and archived fields | `src/app/(app)/fields/page.tsx` |
| Primary nav | Today · Farm · Plan · Supports · Records, plus **More** (mobile) / desktop rail of every legacy screen | `src/components/shell/nav-items.ts`, `MobileBottomNav.tsx`, `DesktopSidebar.tsx`, `MoreSheet.tsx` |

**Approved navigation:** Farm · What Matters · Plan · Market · Finance.

| Approved item | Production destination | Status |
|---|---|---|
| Farm | The Farm Spatial V2 screen (Phase 2) | REAL route to build. **Recommendation:** build it on `/today`, which already owns `MapHero` and every Today producer, and point the "Farm" nav entry there. `/fields` stays the field list, field detail (`?field=`) and boundary editor. |
| What Matters | No route exists. The What Matters pilot renders only inside `/today` (`WhatMattersPilotCard`, `evaluateWhatMattersPilot`). | PLACEHOLDER / NOT IMPLEMENTED as a route. Phase 2 either shows a disabled nav item (as the reference does) or hosts the existing pilot and rail components on a new route without changing the producers. |
| Plan | `/plan`: real Prompts as opportunities, plus an honest empty "Planned work" state. Accepted fertiliser plans are real `Decision`s (`submitPromptDecisionAction`) but `/plan` does not list them yet. | REAL route; planned-work listing is REAL — needs wiring (see §7). |
| Market | `/quotes` (real persisted quote requests: `listMyQuoteRequestsAction`, `RequestQuoteSheet`) and `/market-prices` | REAL. Recommendation: Market → `/quotes`; `/market-prices` stays reachable. `/quotes` lists only the Managed Quote Pilot; the canonical fertiliser quote request is not persisted and cannot appear there (§7). |
| Finance | `/finance` (real-mode honest unavailable states) | REAL route |

**Decision for Phase 2 (not taken here):** whether `/` and the post-auth default
move from `/dashboard` to the Farm screen. Doing so changes
`src/lib/supabase/proxy.ts` behaviour and its test, `src/app/actions/auth.ts` and
onboarding. It must be an explicit, tested Phase 2 change, not a side effect.

**Must stay reachable after the nav change:** Supports (`/supports`), Records
(`/records`), Dashboard and every **More** entry (`moreNavItems`). Nothing in the
current nav may be dropped silently. Items move into More or the desktop rail.

## 3. Map canvas, fields and camera

| Approved element | Production source | Status |
|---|---|---|
| Real satellite map | `MapHero` (`src/components/farm/MapHero.tsx`): real Mapbox GL. Use `plain` for the label-free satellite style. If `NEXT_PUBLIC_MAPBOX_TOKEN` is missing it shows an honest neutral placeholder. | REAL |
| Field polygons | `Field.polygon` (farmer-drawn, `polygonSource: "farmer_drawn"`) via `useFields()` (active fields only). Unmapped fields render nothing. | REAL |
| Field names/numbers on map | `MapHero` marker per mapped field at `Field.centroid` with `Field.name`; `compactNeighbourLabels` | REAL |
| Map centre fallback | `MapHero center={farm.location.centroid}` | REAL |
| Field tap selects field | `MapHero onSelectField` + `selectedFieldId` | REAL. Today currently navigates to `/fields?field=`. V2 opens the in-place drawer instead (§5). |
| Camera flies to selection | `flyToSelection`, `flyToPadding` (per-side, so the drawer height can be reserved), `flyToMaxZoom` | REAL |
| Selected boundary strengthens | `glowSelection` | REAL |
| Neighbouring fields recede | `highlightedFieldIds={[selectedId]}` + `dimUnhighlighted` | REAL (reuse, no new prop needed) |
| Lens-coloured field markers ("P2 · K2 / Fertiliser required", "42 m³ slurry") | Values: see §5. Rendering: `MapHero` markers only take a name plus `getStatusLabel` text, and `getTone` maps to `MapTone`. | REAL data; **MapHero extension required** (Phase 3) for lens-specific marker content. It must be an additive prop and must not change Today/Fields behaviour. |
| User position dot | `userPosition` from `useOneShotPosition()` | REAL (keep) |
| Farm-topic focus highlight | `highlightedFieldIds` + `fitHighlightedFields` from the focused `TodayOpportunity.affectedFieldIds` | REAL (keep, §8) |
| Field-level priority colours | None. Today deliberately keeps markers neutral because no field-level priority model exists. | PLACEHOLDER / NOT IMPLEMENTED. Do not colour fields by priority. |
| Static aerial image / mock hotspots | n/a | Never in production |

## 4. Farm identity, header and conditions

| Approved element | Production source | Status |
|---|---|---|
| Brand "FARM RETURN" | `BrandMark` (`src/components/shell/BrandMark.tsx`) | REAL |
| Farm name | `useFarm().name` | REAL |
| Owner greeting (current Today) | `useFarm().ownerName` + post-mount greeting | REAL (preserve, §8) |
| Kicker "Farm Return · \<lens\>" | Active-lens UI state | UI state |
| "N fields" | Mapped count: `calculateFarmCoverageStats(fields).totalFieldsMapped` (`src/domain/farm-stats.ts`). Total active: `calculateFarmSetupProgress(...).totalFields`. | REAL. Label which count is shown ("mapped" vs total). |
| "13.1 ha" farm area | No client-side whole-farm area export. `farmGrasslandAggregates` covers grassland only. `FertiliserPlanOverview.totalAreaHaTotal` is server-side and fertiliser-scoped. | NEW PURE HELPER REQUIRED: `src/domain/farm-stats.ts`, sum of active fields' `areaHa` |
| "live nutrient state" | Static copy tied to the lens | UI copy |
| Weather pill "12° Light rain · SW" | `WeatherHeroChip` → `/api/weather/observations` (Met Éireann observations, freshness-classified by `classifyObservationFreshness`) | REAL. Show its own freshness/unavailable states. |
| "Farm nutrient plan →" link | Navigates to the whole-farm plan (§6) | REAL destination |
| Lens caption | Static copy per lens (DESIGN_CONTRACT §Five lenses) | UI copy |

## 5. Five lenses

Switching lens must not move the camera (DESIGN_CONTRACT: "preserving spatial orientation").

| Lens | Element | Production source | Status |
|---|---|---|---|
| Current | Field use | `Field.plannedUse` (TrackedValue; absent = unresolved, never "grazing"); `landUseLabel`/`landUseTone` (`src/lib/status.ts`) | REAL |
| Current | Livestock on fields | `LivestockGroup` has **no field/location attribute**: only `system: "grazing" \| "housed"` and `housingId` | PLACEHOLDER / NOT IMPLEMENTED. Never place a group chip on a field. |
| Current | Recent / planned work | Fertiliser plan Decisions (`submitPromptDecisionAction`, `listDecisionsForFarm`/`getDecisionById` in `src/lib/farm-data/decisions.ts`); job sessions (`src/lib/farm-data/job-sessions.ts`, `/job/[id]`); slurry allocations (`useSlurryAllocations`, lifecycle `loadSlurryPlanStateAction`); `JobHistoryCard`, `ActivityTimelineCard` | REAL — needs wiring |
| Grass | Cover, growth, readiness | No grass measurement exists. NDVI is blocked (BLOCKER_INDEX: Sentinel-2 credentials). `satellite-field-coverage.ts` and `field-awareness.ts` give observation availability and freshness only, and must never be presented as vegetation values. | PLACEHOLDER / NOT IMPLEMENTED. The lens may exist as a labelled capability shell. |
| Nutrients | Per-field P/K index | `Field.fertility.pIndex` / `kIndex` (TrackedValue with status); provenance `NutrientPlan.soilIndexProvenance` | REAL. Missing index shows "Unknown", never a default. |
| Nutrients | "Fertiliser required" / "Slurry planned" marker word | `NutrientPlan.purchaseStatus.status` (RECOMMENDED, RECOMMENDED_CREDIT_NOT_COUNTED, NONE_NEEDED, PROHIBITED, WITHHELD_MIXED_EVIDENCE, UNKNOWN, NOT_APPLICABLE) | REAL. Map each status to copy in a presentation helper (`src/lib/`), never inline. |
| Nutrients | Field slurry m³ | `NutrientPlan.organicApplication.totalM3`; allocations `resolveFieldSlurryAllocation(useSlurryAllocations(), fieldId)` | REAL |
| Soil | pH | `Field.fertility.pH` (TrackedValue) / `verifiedTest.pH` | REAL |
| Soil | P index, K index | as Nutrients | REAL |
| Soil | Soil type | `Field.mappedSoil` (`soilAssociation`, `texture`, `drainage`, `source`, `datasetVersion`; may carry `farmerOverride`) | REAL. Absent until resolved, so show "Not yet mapped". |
| Soil | Test age | `Field.fertility.verifiedTest.sampleDate`; validity `soilTestAgeValidityForFertility` (`nutrients.ts`) / `checkFieldSoilTestAgeValidity` (`field-soil-test-age.ts`) | REAL |
| Conditions | Rainfall | `/api/weather/observations` (rolling totals, `calculateRollingRainfallTotals`); `/api/weather/forecast` (`calculateForecastRainfallTotals`) | REAL |
| Conditions | Temperature | Observations; `forecastTemperatureRange` | REAL |
| Conditions | Wind | `FieldWindChip`; `strongestForecastWind` | REAL |
| Conditions | SMD | No production SMD source. `DUNSANY_VALIDATION_SERIES` is validation data only (`spreading-actionability-foundation.ts` header). | PLACEHOLDER / NOT IMPLEMENTED |
| Conditions | Workability / spreading suitability | Only the legal calendar exists: `promptForSpreadingWindow` (closed periods via `checkClosedPeriodCalendar`), and `buildRainfallWindowScore` as used by What Matters. No ground-trafficability verdict exists. | REAL for the legal calendar and the existing rainfall-window output only. Suitability is PLACEHOLDER / NOT IMPLEMENTED. Never invent a "Suitable" verdict. |

## 6. Field drawer, field nutrient plan, whole-farm plan, fertiliser plan

### 6.1 Canonical plan source and a reuse constraint

The per-field `NutrientPlan` comes from `calculateNutrientPlan`
(`src/domain/nutrients.ts`). `/nutrients` (`NutrientsPageClient.tsx` around L200–320)
assembles its input on the client: farm grassland aggregates, slurry allocation,
composition (`resolveFieldSlurryCompositionInput`), regulatory neat-slurry context and
`pBuildUpCompliance`. The server path is `recomputePromptByKind` with
`FERTILISER_RECOMMENDATION_PROMPT_KIND` (`getFieldFertiliserStatusAction`,
`getFertiliserPlanOverviewAction`).

**Phase 4 constraint:** the spatial drawer must not copy NutrientsPageClient's input
assembly. Either extract it unchanged into a shared, tested orchestration helper that
both callers use, or use a server action built on `recomputePromptByKind`. AGENTS.md
forbids duplicating a calculation or query in a new layer.

### 6.2 Field drawer (map overlay)

| Element | Source | Status |
|---|---|---|
| Field name | `Field.name` | REAL |
| Area | `Field.areaHa` (derived from polygon) | REAL |
| P / K index chips | `Field.fertility.pIndex/kIndex` | REAL |
| "Soil test 14 Feb 2026" | `Field.fertility.verifiedTest.sampleDate` (absent means "No lab test") | REAL |
| N / P / K remaining (kg/ha) | `NutrientPlan.fieldRemainingRequirement.{n,p,k}`. A KNOWN arm gives `kgHa`; UNKNOWN gives "Unknown" with `reasonCode`, never 0; NOT_APPLICABLE gives "Not applicable". | REAL |
| Organic allocation m³ | `NutrientPlan.organicApplication.totalM3` | REAL |
| "23 m³/ha · LESS" | `organicApplication.rateM3ha`; method `organicApplication.availableNutrientBasis.value.applicationMethod` with `assumedDefault` and `timingAssumed` flags (an assumed method must be labelled as assumed) | REAL |
| "Best window Wednesday–Friday · Suitable" | No source (see §5 Conditions) | PLACEHOLDER / NOT IMPLEMENTED. At most show the real legal calendar status ("Slurry · Open/Closed period"). |
| "Open nutrient plan" | Navigates to §6.3 | REAL destination |

**Two different "remaining" figures exist. Do not conflate them.**
(a) Remaining after organic contribution: `NutrientPlan.fieldRemainingRequirement`,
the planning figure in the reference. (b) Remaining after confirmed applications:
`getFieldFertiliserStatusAction(fieldId).remainingKgHa`, built from
`FertiliserRecommendationSummary.requirementKgHa` and confirmed Actuals. Before
labelling (b), Phase 4 must confirm from `fertiliser-recommendation.ts` whether
`requirementKgHa` is gross or net of the organic credit. The motion principle
"confirmed application changes remaining values in place" refers to (b).

### 6.3 Field nutrient plan page

| Element | Source | Status |
|---|---|---|
| "1.33 ha · grazing · P2 · K3" | `areaHa`, `fieldRequirement.cropContext.basis/plannedUse` (`plannedUseAssumed` flag must be shown), indices | REAL |
| Machine note "CALCULATED · soil test · …" | `NutrientPlan.calculationVersion`, `fieldRequirement.engineVersion`, `verifiedTest.sampleDate`, evidence states | REAL |
| Requirement row N/P/K | `NutrientPlan.fieldRequirement.{n,p,k}` (KNOWN `kgHa`, else reason) | REAL |
| Organic contribution row | `NutrientPlan.organicApplication.availableNutrientByNutrient.{n,p,k}` (OK `kgHa`; blocked/NOT_APPLICABLE shown honestly). Per-nutrient values and disclosure come from the existing presentation helpers in `src/lib/nutrient-card-presentation.ts` (`requirementCardPresentation`, `organicCardPresentation`), never a re-derivation. The `requirementProvisional` headline/detail is shown **only** under those helpers' conditional rules (e.g. `requirementCardPresentation(...).showProvisional`: `isProvisional` and the N credit arm is not `OK`/`NOT_APPLICABLE`). It is never shown unconditionally on `isProvisional`: a missing-K field is provisional yet keeps an assessed N/P slurry credit, and "Slurry nutrient credit not included" would contradict it. | REAL |
| Remaining row | `NutrientPlan.fieldRemainingRequirement.{n,p,k}` | REAL |
| Organic application band (m³, rate, method) | as §6.2. Name the contributing store (`Housing.shedName` via allocation `housingId`). The slurry type is persisted per store: `SlurryComposition.slurryType` (`src/domain/slurry-composition.ts`; `listSlurryCompositionRecordsForFarm`, `src/lib/farm-data/slurry-composition.ts`), selected for the allocation's `housingId` with `currentSlurryCompositionByHousing`. When that store has no composition record, the type is "not recorded"; it is never assumed to be cattle slurry. | REAL (store name; slurry type when a composition record exists) |
| Application window | as §6.2 | PLACEHOLDER / NOT IMPLEMENTED |
| Fertiliser solution product, kg/ha, field t | `NutrientPlan.purchasedProducts[]` (`name`, `npkAnalysis`, `rateKgHa`, `totalKg`), gated by `purchaseStatus`; tonnes via `roundKgUpToDisplayTonnes` (`fertiliser-plan.ts`). Strip `costEur` with `sanitiseRecommendedProduct`. | REAL |
| NAP / legal status | `NutrientPlan.napCompliance`, `commonageFertiliserGate`, `nationalBufferDistanceStatus`, `lessMethodCompliance` | REAL (must remain visible; currently on `/nutrients` `NapComplianceCard`) |
| Evidence chain | `nutrient-plan-trace.ts` (audit trace); `/evidence-report` | REAL |
| "Whole-farm nutrient plan →" | §6.4 | REAL destination |
| Plan this application | `FertiliserPlanSheet` → `submitPromptDecisionAction` (accepted/edited Decision) | REAL |

### 6.4 Whole-farm nutrient plan

| Element | Source | Status |
|---|---|---|
| "9 fields · 13.1 ha" | `FertiliserPlanOverview.fieldsTotal`, `totalAreaHaTotal`, `fieldsIncluded`, `totalAreaHaIncluded` (`getFertiliserPlanOverviewAction`) | REAL |
| Hero "4.8 t Still to buy" | "Still to buy" is the purchase **shortfall after recorded stock**, not the application requirement. `purchaseRequirementTonnes[].remainingTotalKg` subtracts confirmed applications but ignores stock (1,000 kg remaining with 1,000 kg recorded stock is 0 kg to buy), so it must not be the source. Per product the source is `FertiliserPlanOverview.stockColumns[]` (`buildFertiliserStockBand`, `src/domain/fertiliser-stock.ts`): a `"recorded"` band gives `shortfallKg`; a `"not_recorded"` band has unknown stock, so its `remainingRequirementKg` is the requirement, never a confirmed shortfall, and must be disclosed as "stock not recorded". There is no farm-wide all-products total. | NEW PURE HELPER REQUIRED in `src/domain/fertiliser-stock.ts`: sum recorded `shortfallKg` and count/list the `not_recorded` products separately (never treat unknown stock as zero), then `roundKgUpToDisplayTonnes`, with tests. Never sum rounded tonnes in React. It must be disclosed as a mixed-product mass. If any product's stock is not recorded, label the headline "Remaining requirement" (stock not recorded) rather than "Still to buy". |
| "6 fields need purchased inputs" | `aggregation.counts.included` (+ `provisional` shown separately) | REAL |
| Whole-farm requirement N/P/K kg | `FertiliserPlanOverview.nutrientRequirementKg` (`aggregateFarmNutrientRequirementKg`, with `fieldsIncluded`) | REAL (gross requirement) |
| Whole-farm **remaining** (after organic) N/P/K kg | No aggregate of `fieldRemainingRequirement.totalKg` across fields exists | NEW DOMAIN AGGREGATE REQUIRED (UNKNOWN arms excluded and counted, never zero). Until then show the gross requirement, labelled as such, or omit. |
| Field plan rows (name, status, t, product) | `aggregation.fields[]` (`purchaseClass`, `purchaseStatus`, `provisional`); per-field product kg via `aggregation.products[].contributions[]`; `FertiliserPlanOverview.fieldBreakdown[]` | REAL |
| Blocked / excluded disclosure | `fieldsWithBlockedEvidence`, `applicationsWithUnknownComposition`, `truncated`, `basket.excludedFields`, `basket.unresolvedFields` | REAL (must remain visible) |
| Lime | `getFarmLimeRequirementAction` / `FertiliserPlanOverview.lime` | REAL (preserve) |
| Stock on hand | `FertiliserPlanOverview.stockColumns`, `limeStockBand`, `addFertiliserStockRecordAction` | REAL (preserve) |
| Slurry storage | `FertiliserPlanOverview.slurry` / `buildFarmSlurryStorageOverview` | REAL |

### 6.5 Fertiliser purchase and application plan

| Element | Source | Status |
|---|---|---|
| "Purchased fertiliser required" t | Same as the §6.4 hero helper | NEW PURE HELPER REQUIRED |
| Product rows ("18-6-12 · Fields 2, 4, 5 · 2.6 t · 54%") | `aggregation.products[]` (`name`, `npkAnalysis`, `displayTonnes`, `contributions[].fieldName`, `catalogueVerified`); remaining per product `purchaseRequirementTonnes[]` | REAL. The share % is NEW PURE HELPER REQUIRED (or omit). |
| "€2,310 indicative benchmark" | `aggregation.estimatedTotalCostEur` (`null` when any product is unpriced, never a fake total), `knownCostSubtotalEur`, `productsWithUnknownCost`; costing basis `fertiliser-plan-cost.ts` | REAL. Show "price unavailable" when `null`. |
| Market handoff copy | Static | UI copy |

## 7. Plan and Market handoffs

| Element | Source | Status |
|---|---|---|
| Add to Plan (per field) | `FertiliserPlanSheet` → `submitPromptDecisionAction` (Decision outcome accepted/edited; no separate Plan table: "no new Plan table" architecture) | REAL |
| Add to Plan (whole farm, one action for many fields) | No multi-field plan action exists | PLACEHOLDER / NOT IMPLEMENTED. It needs a scoped task. Do not loop per-field Decisions silently from the UI. |
| Plan screen "Upcoming work" listing planned fertiliser | `/plan` shows only Prompts plus an empty planned-work state. Accepted fertiliser Decisions exist (`listDecisionsForFarm`), and `getMatchablePlanForFieldAction` / `getLinkedFertiliserPlanForJobSessionAction` read them. | REAL data; listing needs wiring |
| Start job from plan | `startJobSessionFromPlanAction`, `startManualJobSessionAction`, `/job/[id]` | REAL |
| Closed loop (complete job → confirmed Actual → remaining recalculated) | `confirmJobSessionActualAction`, `sumConfirmedFertiliserApplications`, `getFieldRemainingFertiliserRequirement` (`src/orchestration/fertiliser-plan`) | REAL |
| Send to Market / quote basket (canonical fertiliser quote flow) | `basket: FarmFertiliserQuoteBasket` (`buildFarmFertiliserQuoteBasket`, `isCompleteFarmRequirement`); draft `createFertiliserQuoteRequestDraft` (`src/domain/fertiliser-quote-request.ts`, carries `coverage` WHOLE_FARM / WHOLE_FARM_PROVISIONAL / PARTIAL, `unresolvedFields`, per-line `provisional`) + `FertiliserQuoteRequestFlow` (in `FarmFertiliserPurchaseRequirementCard` on `/nutrients`). Limitations: **not persisted** (client session state only, lost on reload); **no supplier delivery** (`FERTILISER_QUOTE_DELIVERY_CAPABILITY` `UNAVAILABLE`; ends at READY_TO_SEND, farmer copies the text). The handoff must open this flow, not `/quotes`. | REAL (session-only, undelivered) |
| Managed Quote Pilot (separate flow) | `submitQuoteRequestAction` via `RequestQuoteSheet`; prefill `getQuoteRequestPrefillContextAction` (`src/orchestration/quotes`); list `/quotes`. Persists `quote_requests` (one product per request, operator inbox) with provenance tied to `FarmInputDemand`, not the basket. It cannot show a canonical fertiliser quote request. | REAL, but a separate flow |
| Basket → persisted request bridge (canonical request shown on `/quotes`) | None. `DOMAIN_CONTRACTS.md` (Session 4 delivery and persistence boundary): bridging the pilot needs a schema decision; durable persistence and a delivery provider are each separately authorised. | PLACEHOLDER / NOT IMPLEMENTED |
| Supplier quote supersedes benchmark | `SupplierQuote` (`addSupplierQuoteAction`, `src/lib/farm-data/supplier-quotes.ts`); price hierarchy `price-resolution.ts` / `market-price-resolution.ts` | REAL. The scientific requirement is never altered by a quote. |

## 8. Object rail: livestock, sheds, individual animals

| Element | Source | Status |
|---|---|---|
| Cattle count | All `LivestockCategory` values are cattle. Head count is `calculateFarmSetupProgress(...).livestockHeadCount` or `useLivestockTotals().totalLivestockCount` (sum of `count.value`). | REAL |
| Cattle group list ("15 Weanlings") | `useLivestockGroups()` (`label`, `category`, `count`, `system`, `housingId`) | REAL |
| Group location "Field 4" | No field assignment is persisted on `LivestockGroup` | PLACEHOLDER / NOT IMPLEMENTED. Show "Grazing" / housed shed name only. |
| Move livestock → destination | No movement model; `updateLivestockGroupAction` can change `housingId`/`system` only | PLACEHOLDER / NOT IMPLEMENTED for field moves. Shed reassignment would be REAL but needs a scoped product decision. |
| Sheep count / list | `LivestockCategory` has no sheep category | PLACEHOLDER / NOT IMPLEMENTED: a "Sheep not yet supported" capability shell, no count |
| Sheds count | `useHousingList().length` / `calculateFarmSetupProgress(...).housingCount` | REAL |
| Shed name, type | `Housing.shedName`, `shedType` | REAL |
| Shed occupancy (head) | `Housing.linkedGroupIds` → linked groups' `count.value` | NEW PURE HELPER REQUIRED (`farm-stats.ts`) |
| Shed animal capacity / "spaces free" | No head-capacity column (`storageCapacityM3` is slurry storage) | PLACEHOLDER / NOT IMPLEMENTED |
| Shed slurry storage | `buildSlurryTankView` / `buildFarmSlurryStorageOverview`; `storageFillStatus` / `storageFillRecordedAt` provenance | REAL |
| Individual animals (tag, age, weight, target weight) | `IndividualAnimal` + `WeightObservation` exist (`listIndividualAnimalsForFarm`, `listWeightObservationsForFarm` in `src/lib/farm-data/individual-animals.ts`; `IndividualAnimalsCard` on `/livestock`; group detail `/livestock/[groupId]`): tag, DOB, sex, breed, weight history. **Target weight** has no individual-level field. `FutureIndividualAnimalLifecycleFields` is explicitly not persisted. | Tag, DOB and weight: REAL (link to `/livestock`). Target weight and lifecycle: PLACEHOLDER / NOT IMPLEMENTED. |
| Agricultural silhouettes | No approved production asset exists | Asset task in Phase 2/6. No crude SVGs or emoji (DESIGN_CONTRACT). |

## 9. Current Today / home capabilities that must survive

Presentation may change. These capabilities and their data paths must not be deleted.
If one is no longer visible on Farm, Phase 2 documents where it lives or keeps a safe
access path.

| # | Capability (current `/today`) | Producer / component |
|---|---|---|
| T1 | Owner greeting, farm name, mapped-field count | `useFarm`, post-mount greeting |
| T2 | Settings link | `/settings` |
| T3 | Weather chip | `WeatherHeroChip` |
| T4 | Chemical fertiliser and slurry legal calendar status (open n/N, closed period) | `promptForSpreadingWindow` via `buildAllRealPrompts` |
| T5 | GPS activity candidate (detected field work → job) | `GpsActivityCandidateCard` (`gps-activity-detection.ts`, `src/lib/location/gps-activity-candidate-controller.ts`) |
| T6 | Nearby field (one-shot position) and user position dot | `NearbyFieldCard`, `useOneShotPosition`, `MapHero userPosition` |
| T7 | What Matters pilot: evaluate, confirm conditions, contractor-rate one-time setup, view details, missing slurry details link, slurry planning entry, honest "unable to verify" failure state, sync-aware re-evaluation, request ordering | `WhatMattersPilotCard`, `ContractorCostRateInput`, `evaluateWhatMattersPilot`, `confirmWhatMattersPilotCondition`, `saveFarmerContractorCostRate`, `buildSlurryPlanningEntry`, `useSyncStatus` |
| T8 | Farm-topic opportunity rail (Slurry, Lime, Fertiliser, Soil) and category focus → map highlight | `buildTodayOpportunities`, `TodayControlRoomRail`, `MapHero highlightedFieldIds/dimUnhighlighted/fitHighlightedFields` |
| T9 | Priority HUD counts | `countTodayPriorities`, `TodayPriorityHud` |
| T10 | Opportunity → field breakdown → evidence drill-down | `TodayOpportunitySheet`, `ExpandedPromptSheet` (`canRecord` decisions / job start) |
| T11 | "Also worth a look" secondary Prompts with closed-period de-duplication: the **only** surface for `commonage_status` / `local_buffer_override` Prompts | `selectSecondaryPrompts` + local de-dup, `PromptListRow` |
| T12 | Farm lime requirement feed | `getFarmLimeRequirementAction` |
| T13 | Farm slurry storage overview | `buildFarmSlurryStorageOverview` |
| T14 | Ask AI with screen context | `AskAIButton` |
| T15 | Mobile opportunity sheet | `Sheet` + `TodayControlRoomRail` |
| T16 | Field tap → field detail | `/fields?field=<id>` |
| T17 | Honest "Working window · forecast view coming soon" placeholder | inline |
| T18 | Every current field drill-down path, not only map tap: Nearby field "Open", What Matters actionable "view details" (`handlePilotViewDetails`), opportunity-sheet field row (`onOpenField`). All go to `/fields?field=<id>`. | `NearbyFieldCard onOpen`, `WhatMattersPilotCard onViewDetails`, `TodayOpportunitySheet onOpenField`. Must remain on Farm. V2 may open the in-place drawer instead (§3), but each entry point keeps a path to the field. |
| T19 | Leading Prompt's field pre-selected on the map; the same Prompt feeds Ask AI's "Leading prompt" fact (evidence tier only when `basis.status === "OK"`) | `selectPrimaryPrompt(allPrompts)` → `MapHero selectedFieldId`; `askAIContext` facts (Farm, total Fields, Leading prompt). Must remain on Farm, or V2 documents what replaces the default selection. |
| T20 | Prompt detail actions: Start job (OK `spreading_window`) → `/job/[id]`; Accept / Not now recorded as a Decision; non-OK Prompts can only be dismissed; generic error copy | `ExpandedPromptSheet` → `startJobSessionFromPromptAction`, `submitPromptDecisionAction`. Must remain reachable from every Prompt opened on Farm (T10, T11). |
| T21 | Prompt evidence trace ("Evidence checked": `calculationVersion` and `inputsSnapshot`), evidence-tier and regulatory pills, and a Prompt-scoped Ask AI | `ExpandedPromptSheet` (`EVIDENCE_STATE_UI_LABEL`, `AskAIButton` with Prompt/Field context). Must remain reachable. The inspectable trace is a `SCIENTIFIC_RULES.md` requirement. |
| T22 | Demo/real-mode gating: decisions and job starts refuse in demo mode with an honest message (`canRecord={isRealMode}`); lime fetch and GPS detection run in real mode only | `useIsRealMode`, `ExpandedPromptSheet canRecord`, `getFarmLimeRequirementAction` effect, `GpsActivityCandidateCard`. Must remain on every surface that hosts these producers. |
| T23 | GPS candidate start links to a matching accepted fertiliser plan when one exists, otherwise starts a manual job | `GpsActivityCandidateCard` → `getMatchablePlanForFieldAction`, `startJobSessionFromPlanAction` / `startManualJobSessionAction` → `/job/[id]`. Must remain on Farm with T5. |
| T24 | Secondary-feed entry points on both breakpoints: desktop rail link and the link inside the mobile opportunity sheet ("View all today's items →"), five-item cap | `secondaryFeedPrompts`, `Sheet` "Also worth a look". Must remain reachable on desktop and mobile, because T11 Prompt kinds have no other surface. |
| T25 | What Matters links and disclosures: missing slurry details → `/fields` completion link; slurry planning entry → `/spreading/plan`; multi-source slurry fields disclosed with no completion link; contractor-rate save error kept beside the input, not replacing the section | `WhatMattersPilotCard` (`slurryDetailsHref`, `SLURRY_PLAN_HREF` in `src/lib/slurry-details-link.ts`, `MULTI_SOURCE_SLURRY_COPY`), `ContractorCostRateInput error`. Must remain with T7. |
| T26 | Hydration-safe first paint: Prompts, greeting, calendar strip and opportunities are computed only after mount; What Matters shows a loading skeleton until its first evaluation | `mounted` / `greetingText` post-mount effects in `src/app/(app)/today/page.tsx`. Must remain on Farm. Do not compute wall-clock producers during server render. |
| T27 | Priority HUD, working-window pill and mobile priority strip are shown only when the farm has mapped fields | `mappedFields.length > 0` gates in `src/app/(app)/today/page.tsx`. Must remain. Do not show zero-count HUDs for an unmapped farm. |

T18–T27 were added by the inventory reconciliation task
(`farm-spatial-v2-today-capability-inventory-reconciliation-20261007`) after an
audit of `src/app/(app)/today/page.tsx` and the components it renders directly
(`WhatMattersPilotCard`, `TodayControlRoomRail`, `TodayPriorityHud`,
`TodayOpportunitySheet`, `ExpandedPromptSheet`, `PromptListRow`, `AskAIButton`,
`NearbyFieldCard`, `GpsActivityCandidateCard`, `WeatherHeroChip`, `MapHero`).
Contextual Ask AI (T14, T21), mobile/tablet opportunity access (T15), secondary
feed (T11, T24) and field drill-down (T16, T18) are all now covered.

Also preserve `/fields` (field list, Add Field boundary-first, boundary editing
`FieldBoundaryMapModal`, archived fields and restore, `FieldDrawer` tabs,
`?complete=`/`?missing=` slurry-details links) and `/dashboard` (setup progress,
honest unavailable KPIs, under More). `/nutrients` and `/fertiliser-plan` stay
reachable until Phases 4–5 explicitly migrate their content, which must include
NAP compliance, organic nutrients, slurry plan lifecycle, stock records, lime and
quote flow.

## 10. STOP assessment

Every approved UI value is REAL, needs an explicit new helper or aggregate named
above, or can be a clearly labelled placeholder (grass lens, SMD, spreading
suitability or "best window", livestock field locations and moves, sheep, shed
head-capacity, target weight, whole-farm multi-field Add to Plan, What Matters
route, fertiliser basket → persisted quote request bridge). No value requires guessing, so the Phase 1 STOP condition is not triggered.
Phases that need a NEW DOMAIN AGGREGATE must stop and scope it first under the
`DOMAIN_CONTRACTS.md` change protocol.

## 11. Phase 2 shell placement (task `farm-spatial-v2-spatial-farm-shell-20261007`)

The Farm Spatial V2 shell is built on `/today` (`src/app/(app)/today/page.tsx`). Nav "Farm" points there.
No producer, data path or domain orchestration was deleted or rewritten. Only presentation moved.

- **Map overlays:** identity (lens kicker, farm name, mapped/total field count, active area from
  `calculateActiveFarmAreaHa`, owner greeting: T1), weather and calendar status (T3/T4), Settings (T2),
  GPS candidate and nearby field (T5/T6/T23), the active lens caption (`FarmLensContext`) and the
  five-lens control (`FarmLensControl`, `src/lib/farm-spatial-lenses.ts`). A lens change never moves the
  camera or alters marker tone/label. Markers stay neutral in every lens (§3). Lens-specific marker
  content is Phase 3.
- **Object rail** (`FarmObjectRail`): desktop column right of the map, mobile band under it. Cattle head
  and group counts and shed count come from `calculateFarmObjectRailCounts`, a pure mapping of the canonical
  `calculateFarmSetupProgress` counts (persisted groups/housing).
  Sheep is a "Not yet supported" shell with no count. No livestock is placed on a field. Asset strategy:
  no approved silhouette asset exists in the production tree, so the rail is typography-led with
  domain-colour rules. No crude SVG or emoji. Approved silhouettes are a follow-up asset task.
- **Desktop plane under the map:** What Matters pilot (T7/T25), farm topics (Ask AI T14, priority counts
  T9, working-window placeholder T17, opportunity rail T8, secondary feed link T24). These were moved off
  the map overlay. The mobile section (pilot, priority strip → opportunity sheet T15, Ask AI) is
  unchanged in behaviour.
- **Unchanged:** opportunity drill-down, Prompt detail and evidence (T10/T11/T20/T21), real-mode gating
  (T22), hydration-safe first paint (T26), mapped-field gates (T27), and every `/fields?field=` path
  (T16/T18). Map preselection still uses the leading Prompt (T19).
- **Navigation:** primary is Farm (`/today`) · What Matters (disabled placeholder, no route) · Plan
  (`/plan`) · Market (`/quotes`) · Finance (`/finance`). Fields (`/fields`), Supports and Records lead
  More. `/market-prices`, `/nutrients` and `/fertiliser-plan` stay in More.
- **Not changed in Phase 2:** `/` and the post-auth default still go to `/dashboard`. Moving them needs
  the explicit, tested change described in §2.

## 12. Phase 02B spatial shell visual refinement (task `farm-spatial-v2-spatial-shell-visual-refinement-20261007`)

Presentation only. Information architecture, routes, producers and §11 placement are unchanged.

- **Map dominance:** the global top/bottom black veil over `/today`'s map is gone. Two local scrims carry
  legibility: a radial one behind the identity (top-left) and a lower gradient behind the lens information.
  Field boundary paint is unchanged.
- **Field identity:** `MapHero` has a new opt-in `neighbourNameLabels` prop (with `compactNeighbourLabels`).
  Every non-selected field shows its real name as bare text beside a smaller neutral pin. It shows the name
  only, with no status, tone or invented value. The selected field keeps its full label. `/fields` does not
  opt in and is unchanged.
- **Instrumentation:** weather (T3) and the chemical/slurry calendar status (T4) form one flat strip with
  hairline separators, 2px corners and a 60% graphite plane. Settings (T2) is joined to it on desktop.
  Freshness and the unavailable behaviour are untouched (`WeatherHeroChip` still renders nothing when
  weather is unavailable, and the strip collapses when empty).
- **Lens band:** `FarmLensControl` is a flush band along the map's lower edge with a top rule, hairline
  dividers and strong type. The active lens shows full-strength text and a 3px underline in its domain colour
  (`accentClassName`; the filled `activeClassName` was removed). The colour mapping is unchanged:
  Current = white (neutral), Grass = teal, Nutrients = harvest, Soil = clay, Conditions = cobalt. A lens change
  still never moves the camera.
- **Lens information:** `FarmLensContext` is one editorial block: a domain-colour rule beside the caption, an
  optional real-facts line (Conditions calendar status), the honest unavailable note, and plain text links.
  No stacked pills. The copy and links come from `farm-spatial-lenses.ts` and are unchanged.
- **Object rail:** denser, left-aligned typographic rows (a domain-colour tick beside each label, serif count,
  muted detail) under an "On the farm" kicker. There are no centred cards and no large top padding. Counts,
  links and Sheep "Not yet supported" are unchanged. There is still no silhouette asset (see §11).
- **Desktop navigation:** `DesktopSidebar` is narrower (`w-52`) and lighter. The five primary items stay
  visible. Every `moreNavItems` destination sits behind one "More" disclosure (`aria-expanded`), which lists
  the same entries as mobile's `MoreSheet`, so nothing is removed. On a More route the closed control reads
  "More · <screen>". The mobile bottom nav and `MoreSheet` are unchanged.
- **Not changed:** any domain, science, regulatory, schema, migration or producer logic. Below-map planes
  (T7–T11, T14, T17, T24) and the mobile section are unchanged.
- **Visual verification:** the rendered 1440×900 / 390×844 comparison against
  `desktop-01-farm-default.png` was not performed in the build session (starting the app server was denied
  by session permissions). It remains open.

## 13. Phase 3 field exploration and lenses (task `farm-spatial-v2-field-exploration-and-lenses-20261007`)

- **Selection:** tapping a real mapped field on `/today` (boundary or marker, which is a keyboard-focusable
  button) selects it in place. It no longer navigates. The selected boundary strengthens and every other field
  recedes (`highlightedFieldIds=[id]` + `dimUnhighlighted`; dimmed, never hidden). Only a farmer's own selection
  moves the camera (`flyToSelection`, 320ms, 0 under reduced motion, zoom capped at 16.5 so neighbours stay in
  frame). The leading Prompt's preselection (T19) still sets `selectedFieldId` when nothing is selected, but it
  opens no drawer and moves no camera. Tapping the field again, open ground (new additive `MapHero`
  `onMapBackgroundClick`), the drawer's close button or Escape all deselect. An id with no mapped field
  resolves to no selection.
- **Drawer:** `FarmFieldDrawer` rises (~280ms, none under reduced motion) from the lens band, attached to
  the map. It is not a modal. Identity is `Field.name` and polygon-derived `Field.areaHa`. The facts are the
  active lens's `farmFieldLensView` (`src/lib/farm-spatial-field-lens.ts`), a presentation-only mapping of
  persisted `Field` values. A non-lab value carries its provenance ("Estimated", "Farmer entered",
  "Mapped"). A missing value reads "Unknown", "Not set", "Not yet mapped" or "No lab test". Every lens keeps a
  "Field detail" link to `/fields?field=<id>` (T16).
- **Lens content per field:** Current shows `plannedUse` (absent = "Not set") with an honest livestock note.
  Grass shows no value, only a "not measured" note. Nutrients shows P/K index, soil test date and the field's
  allocated slurry volume (`resolveFieldSlurryAllocation`), and links to `/nutrients?field=<id>` and
  `/fertiliser-plan`. The `NutrientPlan` requirement and purchase status are **not** shown: §6.1 forbids
  copying NutrientsPageClient's input assembly, so they wait for Phase 4. Soil shows pH, P/K index,
  `mappedSoil.soilAssociation` and test date. Conditions shows only the farm-wide legal calendar facts, with
  the SMD/workability note. No field-level suitability is shown.
- **Markers:** additive `MapHero` props `neighbourDetailLabels` (the lens marker text under each field
  name), `markerAccentColor` (one uniform domain colour per lens via `--fr-v2-*`; Current stays neutral) and
  `markerContentKey`. Tone is still neutral, so no field-level priority is implied. `/fields` does not opt in
  and is unchanged.
- **Not changed:** any domain, science, schema, migration or producer logic. Other drill-down paths (T18)
  still go to `/fields?field=<id>`.

## 14. Phase 4 real fertiliser field integration (task `farm-spatial-v2-real-fertiliser-field-integration-20261007`)

- **Plan source (§6.1):** `NutrientsPageClient`'s input assembly was extracted unchanged into
  `buildFieldNutrientPlan` (`src/orchestration/fertiliser-plan/field-nutrient-plan.ts`). It covers grassland
  aggregates, slurry allocation and per-store composition, regulatory neat slurry, the silage/grazing-only
  plans, the stale-evidence NAP block and the tillage/no-livestock gates. `/nutrients` calls it, and so does
  `useFieldNutrientPlan` (`src/lib/use-field-nutrient-plan.ts`, same farm-store records and the same silage
  source). There is no second copy.
- **Value trace** (`fieldNutrientPlanView`, `src/lib/field-nutrient-plan-presentation.ts`; it derives no number
  and never mutates the plan):
  | Displayed | Canonical source |
  |---|---|
  | Requirement N/P/K | `NutrientPlan.fieldRequirement.{n,p,k}` (KNOWN `kgHa`; UNKNOWN "Unknown" + reason; NOT_APPLICABLE "N/A") |
  | Organic contribution N/P/K | `organicApplication.availableNutrientByNutrient.{n,p,k}` (OK `kgHa`; NOT_APPLICABLE "None", no slurry; blocked "Unknown"). The paired, floored `offsetX` is never shown. |
  | Remaining N/P/K (drawer and page) | `fieldRemainingRequirement.{n,p,k}`, figure (a) of §6.2. Remaining after confirmed applications (b) is not shown here. |
  | Organic allocation m³, rate, method | `organicApplication.totalM3/rateM3ha`; method/`assumedDefault`/`timingAssumed` from `availableNutrientBasis` (OK only) |
  | Fertiliser solution | `purchaseStatusPresentation(purchaseStatus)`; products from `purchasedProducts` via `sanitiseRecommendedProduct`; field tonnes `roundKgUpToDisplayTonnes(totalKg)`; `nothingToBuyMessage` otherwise |
  | Provisional notice | `purchaseStatusPresentation(...).provisional`, or `requirementCardPresentation(...).showProvisional` (mixed). Never shown unconditionally on `isProvisional`. |
  | Mixed-index line | `requirementCardPresentation(plan).line` |
  | Legal status | `displayedNapCompliance` (stale-blocked) via the existing `NapComplianceCard` |
  | Evidence | `calculationVersion`, `fieldRequirement.engineVersion/cropContext`, KNOWN arms' `source/ruleRefs/limitations`, remaining `evidenceState`, `dmPct`/`dmPctEvidence`, `availableNutrientBasis.source` |
  | Identity line P/K | `fieldRequirement.p/k.soilIndex` |
- **Drawer:** in the Nutrients lens, `FarmFieldDrawer` shows remaining N/P/K as an N cobalt / P harvest / K plum
  strip, the first unknown reason, any provisional headline, a teal organic allocation band and an
  "Open nutrient plan" action. Tillage/no-livestock shows the honest message only. The `/nutrients` link is now
  labelled "Nutrient planner".
- **Field nutrient plan:** `/today/field/[fieldId]` follows the approved order: dense N/P/K table →
  organic application band (the application window is still PLACEHOLDER, "Not available yet") → fertiliser
  solution → legal status → evidence chain (link to `/evidence-report/field/<id>`). Actions are Farm map,
  "Plan in nutrient planner" (`/nutrients?field=`, where "Plan this application" lives) and "Whole-farm
  nutrient plan →" (`/fertiliser-plan`).
- **Return to spatial context:** `farmSpatialReturnHref` (`/today?lens=nutrients&field=<id>`) is read once after
  mount on `/today` (`parseFarmSpatialReturn`). It restores the lens and selection, and an unmapped id still
  resolves to none.
- **Not changed:** any fertiliser formula, constant, frozen contract, schema or migration. The contributing
  store name and slurry type (§6.3) are not shown yet.
