# Soil Sampling Architecture (Fertiliser Vertical V1)

Canonical, frozen object model for the soil-sampling chain. Short by
design — this is the seam future checkpoints (V2 smart zones, V3
learning, V4 validated adaptive sampling) build against without
rewriting V1. See `docs/farm-return-next/FERTILISER_VERTICAL_ARCHITECTURE.md`
for the already-shipped nutrient/regulatory/product-allocation vertical
this chain feeds into, and `DOMAIN_CONTRACTS.md` for the frozen-module
inventory this document adds to.

## Frozen object model

```
Field
 -> SamplingPlan
     -> SamplingZone (one or more)
         -> SamplingSession
             -> CoreObservation (many)
         -> CompositeSample (one, on confirmation)
             -> LabResult (Checkpoint 2)
                 -> SoilInterpretation (Checkpoint 2)
                     -> NutrientRequirement (existing, FERTILISER_VERTICAL_ARCHITECTURE.md)
                         -> ProductAllocation (existing)
                             -> FertiliserPlan (existing)
                                 -> Actual (existing, job_actuals)
                                     -> ScientificEvidenceReport (Checkpoint 4)
```

## What is a new persisted entity, and what is not

Real, working `decisions` / `job_sessions` / `job_actuals` infrastructure
already exists (Fertiliser Vertical campaign, closed). This checkpoint
reuses it rather than building a parallel "Plan"/"Session" system —
`CLAUDE.md`'s Farm Return Next never-rule ("never duplicate a
src/domain/src/lib/farm-data calculation or query — call the existing
export").

| Concept | Persisted as | Why |
|---|---|---|
| `SamplingPlan` | A `decisions` row (`calculation_kind = "soil_sampling_plan"`), `estimate_snapshot` = the real `EngineOutcome<SamplingPlan>` | Same "a decision row already IS the plan" decision `FERTILISER_VERTICAL_ARCHITECTURE.md` made for fertiliser recommendations. |
| `SamplingZone` | Not its own row — an entry in `SamplingPlan.zones`, referenced by `zoneId` string ("A", "B", ...) | A logical, proportionate division of the field's real mapped area, not a drawn sub-polygon (see "Deliberately not built" below). |
| `SamplingSession` | A `job_sessions` row, `activity_type = "soil_sampling"` | The universal Job Session every other real activity already uses — pause/resume/interruption-gap/offline-outbox machinery unchanged. One session per zone (one decision : one session, `job_sessions_decision_id_unique`). |
| `CoreObservation` | A new `soil_core_observations` row (child of `job_sessions`) | Real, independent, voluminous (20+ per sample) GPS evidence — too large/queryable to bury in a `job_sessions` jsonb column, per the V2-V4 data-preservation requirement. Insert-only, immutable. |
| `CompositeSample` | **Not a separate mutable row.** A confirmed `soil_sampling` job session (1:1 with its own `job_actuals` row) already *is* the permanent composite sample — its `job_sessions.id` is the permanent Sample ID, formatted for display as `FR-SOIL-<first 8 chars>`. | Structurally enforces "many cores -> one composite sample -> one lab result": a future `lab_results` row (Checkpoint 2) references this same `job_sessions.id` with a unique constraint — there is no foreign-key path from `lab_results` to an individual `soil_core_observations` row, ever. |
| `LabResult` | Checkpoint 2 — a new table referencing `job_sessions.id` | Not built in Checkpoint 1. |
| `SoilInterpretation` | Checkpoint 2 — derived from `LabResult`, versioned | Not built in Checkpoint 1. |

## Permanent Sampling Strategy interface

`src/domain/soil-sampling-plan.ts`'s `SamplingStrategy` interface is the
permanent extension seam:

```ts
interface SamplingStrategy {
  strategyId: string;
  version: string;
  buildPlan(input: SamplingStrategyInput): EngineOutcome<SamplingPlan>;
}
```

- **V1 (built this checkpoint)**: `StandardRepresentativeSamplingStrategy`
  — Teagasc's standard representative composite-sampling procedure.
- **V2 (interface only, not built)**: `SpatialAssistedSamplingStrategy` —
  would use mapped soils, terrain, management history to propose smarter
  zone boundaries.
- **V3 (interface only, not built)**: `AdaptiveMLSamplingStrategy`'s
  learning precursor — analyses relationships across accumulated
  SamplingPlans/CoreObservations/LabResults/Actuals/subsequent field
  observations. Analyses first; never automatically controls
  recommendations merely because a model exists.
- **V4 (interface only, not built)**: a validated adaptive strategy that
  may suggest an additional sample location — never permitted to override
  a mandatory statutory sampling requirement.

The rest of Farm Return calls `buildPlan` and consumes a `SamplingPlan`
— it must never know or care which strategy produced it.

## Deliberately not built in V1

- **Automatic sub-polygon geometry.** Farm Return has no validated
  in-field boundary-splitting engine. A multi-zone plan expresses zones
  as logical, proportionate divisions of the field's already-real mapped
  area (`Field.areaHa`) that a farmer walks and keeps physically
  separate — never invented boundary coordinates. This is the same class
  of honesty as the GPS-observation caveat below, applied to zone shape
  instead of a single point.
- Satellite/vegetation-informed zoning (V2).
- Any ML-based sampling recommendation (V3/V4).
- A separate `composite_samples`/`sampling_plans`/`sampling_sessions`
  table (see table above).

## GPS evidence — what a CoreObservation is and is not

A `CoreObservation` records that the phone reported being at an
approximate location, with a reported accuracy, at the moment the farmer
tapped "Record core." It does **not** prove the physical soil core
entered the sample container, and Farm Return never claims otherwise
(mirrors `LocationTrackingProvider`'s own "never claim a capability it
cannot deliver" rule, and the native-mobile-feasibility finding that
phone GPS is not survey-grade).

## Verified numeric rules (source: Teagasc)

Every constant lives in `src/domain/soil-sampling-plan.ts`, cited to
`TEAGASC_SOIL_SAMPLING` (`src/domain/source-register.ts`), re-verified
live 2026-09-12 against
<https://www.teagasc.ie/environment/soil/soil-fertility/soil-analysis/soil-sampling/>
plus a corroborating tillage/grassland sampling-area search:

- Minimum 20 cores per composite sample.
- One representative sample per 2-4 ha ideally; **5 ha hard ceiling**
  per sample (both tillage and grassland).
- Split into separate zones/samples for areas that differ in soil type,
  cropping history, slope/drainage, or persistently poor yield.
- Sampling depth: 10 cm (100 mm) uniform.
- Wait 3-6 months after P/K fertiliser/manure application; 2 years
  after lime application (advisory, not a hard gate — see
  `assessSamplingTimingReadiness`'s own doc comment for why).
- W-shaped walking pattern across the sampling area; avoid old fences,
  ditches, drinking troughs, dung/urine patches, and any spot where
  fertiliser/manure/lime has been heaped or spilled.
- Georeference/LPIS required on lab reports issued after 14 September
  2025 (already encoded, `soil-test-validity.ts`'s
  `SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE` — reused, not duplicated).
- Soil test validity: 4 years for nutrient content, 12 years for organic
  matter (already encoded, same module).

None of these numbers came from this campaign's own prompt text — every
one was checked live against the authoritative source before being
encoded, per the campaign's "verify before encoding, fail closed if
unverifiable" rule.

## V1 workflow (Checkpoint 1)

```
Field -> "Start Soil Sample" -> SamplingPlan (all zones) -> pick a zone
  -> SamplingSession (job_sessions, activity_type "soil_sampling")
    -> RECORD CORE (many) -> soil_core_observations rows
  -> Finish -> Confirm (whole/partial/did_not_happen + note)
    -> job_actuals row (SoilSamplingActual payload)
    -> CompositeSample view (derived, permanent Sample ID: FR-SOIL-<id>)
```

Entry point: Farm -> field detail drawer -> Soil tab -> "Start soil
sample" (`src/components/farm/FieldDrawer.tsx`), route
`/soil-sample/[fieldId]`.
