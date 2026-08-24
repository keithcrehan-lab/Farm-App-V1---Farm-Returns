# Agronomy engine — soil, nutrients, slurry, spreading

Status: **Phase 3/5 concern.** Not implemented until the Phase 1 UI shell
and Phase 2 data model are approved (`CLAUDE.md` § Build order). This
document is the design contract that Phase 3/5 implementation must satisfy —
it is not itself the implementation.

## Scope

- Nutrient requirement engine (spec §5)
- Organic manure / slurry engine (spec §6)
- Spreading conditions engine (spec §10)

All three share `docs/evidence-register.md` as their evidence base and must
follow the provenance pattern in `docs/data-model.md`.

## Nutrient requirement pipeline (spec §5)

```
Field geometry + planned use
        ↓
Mapped soil/drainage + P/K working values   (mapped ≠ fertility — see rule below)
        ↓
Crop/grass/silage nutrient requirement (versioned Irish rule set)
        ↓
Organic manure available and allocated
        ↓
Remaining N/P/K requirement
        ↓
Candidate fertiliser products / least-cost valid combination
        ↓
Quantity + timing + estimated € cost
        ↓
Input Planner forecast
```

**Critical scientific rule (non-negotiable):** the 1:250,000 Irish Soil
Information System supplies *physical* soil context (association, series,
texture, drainage) only. It must never be used to infer an actual P or K
Index. P/K fertility starts as a Farm Return planning assumption
(`status: "estimated"`) and only becomes `"verified"` via an uploaded/entered
soil test, or `"farmer_adjusted"` via manual override.

### Inputs

- `Field.plannedUse`, `Field.mappedSoil`, `Field.fertility` (from
  `docs/data-model.md`).
- Livestock/housing slurry output (see below) allocated to this field.
- Rule set: Teagasc Green Book (5th Ed.) baseline nutrient advice tables by
  crop/grass type and P/K index, plus current-year factsheet adjustments
  (see `docs/evidence-register.md`).

### Outputs

- `TrackedValue<{n:number;p:number;k:number}>` gross requirement (kg/ha and
  total kg for the field).
- Organic contribution offset (from slurry allocation).
- Remaining chemical top-up requirement.
- Recommended product list with N-P-K analysis, rate (kg/ha), total
  quantity and estimated cost — least-cost valid combination that meets
  the remaining requirement within safe/regulatory bounds.

### Rule set versioning

Every output carries `calculationVersion` in the form
`nutrient_engine_v<major>.<minor>.<patch>`. A rule-set change (e.g. an
updated Green Book factsheet) is a version bump, not a silent value change —
existing `TrackedValue.previous` chains preserve what a farmer saw under
the old version.

## Organic manure / slurry engine (spec §6)

### Slatted shed logic (implementation order)

1. Link shed to existing `LivestockGroup`s — never re-ask headcount.
2. Estimate slurry volume from animal category × housing duration using
   the current regulatory/storage coefficient set (S.I. No. 588/2025
   storage/excretion coefficients — see evidence register). Mark
   `status: "estimated"`.
3. Optional refinement inputs (tank dimensions, observed fill level,
   dilution/soiled water, lab analysis) upgrade specific figures toward
   `"farmer_adjusted"` / `"verified"` without discarding the original
   estimate (provenance chain).
4. Convert volume → available N/P/K using a versioned organic-manure rule
   set (`slurry_engine_v<...>`), accounting for application method and
   timing (organic N availability differs by method: splash-plate vs.
   trailing-shoe vs. LESS).
5. Allocate slurry to fields by nutrient need and agronomic/regulatory
   constraint (closed periods, buffer zones, storage capacity limits, max
   application rate) — feeds `SlurryAllocation[]` — before the nutrient
   engine calculates the chemical top-up.

### Allocation priority

Ranked by: (a) fields with silage intention (P/K recycling priority, spec
§7), (b) nutrient index gap (lower index = higher priority within
regulatory limits), (c) proximity/logistics, (d) regulatory suitability —
a field with a spreading hard stop (see below) is never allocated to,
regardless of nutrient need.

## Spreading conditions engine (spec §10)

Two related but independently-thresholded scores per field per day:
**slurry/organic manure score** and **chemical fertiliser score**. Same
input set, different weights/thresholds.

### Hard-stop precedence

Hard stops are evaluated **before** the numeric score and, when triggered,
replace it entirely (UI shows "0 — Do not spread" + reason, never a low
number that reads as "just marginal"). Hard-stop conditions (versioned,
sourced from S.I. No. 588/2025 and current amendments):

- Closed period (calendar-based, category-specific).
- Waterlogged / flooded ground.
- Frozen ground.
- Heavy rainfall in progress or imminently forecast (regulatory
  forecast-window requirement).

### Score components (validate weights before production — spec explicitly flags these as indicative)

| Component | Source |
|---|---|
| Forecast rainfall | Met Éireann near-term forecast. |
| Soil moisture / trafficability | Met Éireann SMD model by drainage class + `Field.mappedSoil.drainage`. |
| Soil temperature & trend | Met Éireann agri-met data — **never** presented as an in-field sensor reading; label as "modelled" in the UI copy. |
| Crop/grass demand | Output of the nutrient requirement engine (uptake window). |
| Drainage/topographic/environmental risk | `Field.mappedSoil` + buffer-zone rules. |
| Application conditions | Wind forecast; relevant to spreading method. |

### Time horizons

- **Seasonal plan:** target weeks/quantity from the nutrient plan.
- **Near-term planner:** 5–10 day field score forecast (Met Éireann
  forecast horizon limit — confirm actual horizon at implementation).
- **Live action:** current best window; marking an application complete
  decrements `SoilFertility`/nutrient-requirement remaining balance and
  input stock (`InputRequirement.stockOnHandQty`).

## Testing requirement (spec §15, §16 exit gates)

Every rule (nutrient table lookup, slurry coefficient, hard-stop condition)
gets a deterministic unit test locking a known/verified example value
(Vitest, `tests/unit/`) before its output reaches a production screen. An
Irish agronomist/nutritionist review is required before launch (spec §15) —
track this as a Phase 3/5 exit-gate task, not a Phase 0 deliverable.
