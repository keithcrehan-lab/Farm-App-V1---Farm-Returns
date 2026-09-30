# Campaign C — slurry rate / allocation architecture and remaining-programme assessment

Task `campaign-c-remaining-programme-20260930`, base `465a523`. Campaign C remains
AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING and DRAFT. **No production output
changed.** The engine stays `nutrient_engine_v1.2.0`, and no frozen contract changed.
There were no WebFetch/WebSearch calls. Evidence is the stored sources only
([SOURCES_AND_CLAIMS §6](SOURCES_AND_CLAIMS.md)).

## 1. Architecture trace (before editing)

| # | Concern | Current home | Notes |
|---|---|---|---|
| 1 | Crop N/P/K requirement | `nutrients.ts` `calculateNutrientPlan` → `NutrientPlan.requirement` (`nSilageKgHa`, `pBuildUpKgHa` + `pMaintenance*`, `kSilageKgHa` / `kGrazingKgHa`) | One `TrackedValue<{n,p,k}>`, with one status. `unavailable` if either index is missing or the silage plan is missing |
| 2 | Slurry nutrient credit | `resolveAvailableSlurryNutrients` → `organicApplication.availableNutrientAssessment`, `offsetN/P/K` | Index 1/2 factors (P × 0.50, K × 0.90) are applied here (CC-B2, CC-B4A) |
| 3 | Chemical residual | `calculateNutrientPlan` `remaining* = max(0, gross − offset)` → `netRequirement` → `allocatePurchasedProducts` | `CLM-TGC-OM-BALANCE` is ALREADY_IMPLEMENTED |
| 4 | Slurry volume inputs | `SlurryAllocation.volumeM3` / field area → `rateM3ha`. Planned allocations are validated by `slurry-allocation-plan.ts` and lifecycle-tracked by `slurry-allocation-lifecycle.ts` | The rate is an **input**. Nothing chooses it |
| 5 | Economic allocation | `slurry-direct-economic-assessment.ts` (one action), `slurry-whole-farm-allocation.ts` (finite volume across candidates) | Selects among given candidate volumes. It never sets an agronomic rate |
| 6 | Paired P/K | `fertilityEvidence` (one outcome for both indices) plus the Index-1 placeholder guard | CC-B4A deliberately kept P and K paired |
| 7 | Provenance | `EngineOutcome` / `EvidenceState` (`evidence.ts`), `TrackedValue`, `soilIndexProvenance`, `dmPctEvidence` | — |
| 8 | Versioning | `NUTRIENT_ENGINE_VERSION`, per-module `*_VERSION` constants, `LIFECYCLE.md` rule-set model | — |
| 9 | Safe insertion point | A new pure layer that **consumes** a finished `NutrientPlan` | This does not duplicate 1–3. It does not overlap 5, which selects volumes on economic grounds |

## 2. Layer (Phase 2 — DONE, not wired to production)

`src/domain/slurry-rate-allocation.ts` (`slurry_rate_allocation_v0.1.0-draft`),
`buildSlurryRateAllocation({ plan, externalConstraints? })`. The layer keeps each concept
separate:

| Concept | Field | Source |
|---|---|---|
| CROP_REQUIREMENT | `cropRequirement` | `plan.requirement`, unmodified |
| AVAILABLE_SLURRY_NUTRIENT | `availableSlurryNutrient` | `availableNutrientAssessment` at the planned rate. The factors are applied upstream only |
| ORGANIC_SHARE_LIMIT | `organicShareLimit` | share × crop requirement (P, K) |
| ORGANIC_ALLOCATED_NUTRIENT | `organicAllocatedNutrient` | the production offset, `shareCapApplied: false` |
| REMAINING_CHEMICAL_REQUIREMENT | `remainingChemicalRequirement` | `plan.netRequirement`, unmodified |
| RATE_CONSTRAINT | `rateConstraints[]`, `bindingConstraintIds` | one record per constraint |
| FINAL_ALLOWED_RATE | `finalAllowedRate` | always `DEFERRED` |

Each constraint record carries these fields: `ruleId`, `evidenceClass`,
`sourceClaimIds`, `calculationVersion`, `upstreamCalculationVersion`, `input`, `limit`,
`output`, `binding`, `deferral` and `reason`. It also carries
`affectsProductionOutput: false`. Unknown values are `{status: "unknown", reason}` and
are never 0. "No slurry planned" is the only real zero. A missing index keeps slurry N
and withholds P and K together, which preserves CC-B2 F003 and CC-B4A. Share limits never
change slurry concentration or availability factors.

Named constraint kinds: `P_REQUIREMENT_LIMIT`, `K_REQUIREMENT_LIMIT`,
`ORGANIC_SHARE_LIMIT`, `K_SPRING_GUIDANCE_LIMIT`, `REGULATORY_LIMIT`, `TIMING_LIMIT`,
`WEATHER_LIMIT` and `OPERATIONAL_LIMIT`. Regulatory, timing, weather and operational
records are caller-supplied, and each keeps its own module's provenance. If a caller
does not supply one, the layer records it as `NOT_EVALUATED` (unknown, not absent). The
layer never re-derives Campaign B regulation.

The P/K requirement limits are evaluated from REPOSITORY_VERIFIED principles
(`CLM-TGC-OM-RATE`, `-EXCESS`, `-BALANCE`). The check is whether available slurry P or K
at the planned rate exceeds the crop requirement, reported in kg/ha. No kg-to-m³ rate
inversion is made: Table 9-8 is a non-linear grid, and the layer does not assert
proportionality.

## 3. Phase status

| Phase | Status | Production change | Engine impact | Deferred reason |
|---|---|---|---|---|
| 1 Follow-ups A/B/C | DONE (logged in BLOCKERS `CC-FU-A`, `CC-FU-B`, `CC-FU-C`) | None | None | — |
| 2 Allocation architecture | DONE (pure layer, unwired) | None | None | — |
| 3 Organic-share caps | DEFERRED_PROVISIONAL_RULE — `IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL` | None | None | Enforcing a cap requires comparing it with either factor-reduced available P/K or total slurry P/K. The stored source does not say which (`CLM-AIR-CONF03-SHARE`, AI_PROVISIONAL). The limit is recorded and computed; binding stays `UNDETERMINED` on Index 1/2. Index 3 (100 %, no factor) is evaluated. Index 4 is not addressed by the source |
| 4 Rate selector | DEFERRED_PROVISIONAL_RULE — `RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL` | None | None | The multi-constraint representation and binding exposure are done. No stored source gives a deterministic selector. The cereal source is P-led, and no min(P, K) rule is stated |
| 5 90 kg K spring | DEFERRED_PROVISIONAL_RULE — `RULE_RECORDED_IMPLEMENTATION_DEFERRED_PROVISIONAL` | None | None | Recorded as `K_SPRING_GUIDANCE_90` (`NOT_ENFORCED`). Whether slurry K counts toward the 90 kg is AI_PROVISIONAL (`CLM-AIR-CONF02-RECON`). Slurry K credit is not truncated |
| 6 N yield scaling | DEFERRED_EVIDENCE — `IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR` | None | None | See §4 |
| 7 Per-nutrient P/K | DEFERRED_ARCHITECTURE — `IMPLEMENTATION_DEFERRED_ARCHITECTURE` | None | None | See §5 |
| 8 CC-B3 persistence | READY_FOR_MIGRATION_TASK — `CC_B3_READY_FOR_MIGRATION_TASK` | None | None | No migration is authorised. Design: [CC_B3_PERSISTENCE_DESIGN.md](CC_B3_PERSISTENCE_DESIGN.md) |
| 9 Expert validation | EXPERT_VALIDATION_PENDING | None | None | The protocol, schema and template are prepared ([EXPERT_VALIDATION_PROTOCOL.md](EXPERT_VALIDATION_PROTOCOL.md)). No validation has taken place |
| 10A Card headline | DEFERRED_ARCHITECTURE | None | None | The headline is produced inside `calculateNutrientPlan` (a frozen contract) and consumed by several cards and reports. Changing it needs the contract-change protocol and a visual check. It is kept separate from this science task |
| 10B MEASURED label | DEFERRED_ARCHITECTURE | None | None | `slurryAvailableSpringLessKgHa` / `SummerLess` always return `MEASURED`. `resolveAvailableSlurryNutrients` receives only `dmPct`, not its `DataStatus` (`dmPctEvidence` sits beside it on the plan). A correct label needs a new resolver parameter, which is a frozen-contract signature change, plus a review of every consumer that branches on `evidenceState` |
| 10C January | NOT_APPLICABLE (unchanged) | None | None | The exact 1 February boundary is not REPOSITORY_VERIFIED. `classifySlurryTiming` is unchanged |

## 4. Phase 6 — N yield-scaling range investigation

Sources inspected locally:

- `TGC-YIELD-SCALE`: `raw/silage-yield-scaling.html`, Table 1 and footnotes 2–4.
- `TGC-K90`: `raw/first-cut-max-k.html`, Table 1, "(5t/ha DM)".
- The Green Book pack: `reference_greenbook_2020/All_Table_Rows.csv` Table 12-7 rows
  1–18, and `Page_Text.csv` p. 76.

Results:

- `TGC-YIELD-SCALE` gives the per-tonne statement (footnote 2) and only the 5 and
  6 t DM/ha rows.
- `TGC-K90` gives only the 5 t DM/ha case.
- Green Book Table 12-7 gives first cut 125 kg/ha, with footnotes on early-grazing N
  carry-over, reseeds, the grazed-previous-year rate of 100 and NAP totals. It has
  **no yield term and no yield range**.

No stored source states a supported yield range for the N per-tonne rule, or how it
applies to the 100 kg/ha grazed-previous-year rate. **IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR**
is confirmed. `nSilageKgHa` is unchanged, and P/K scaling is unchanged (existing
regression tests). No bounds were invented.

## 5. Phase 7 — independent per-nutrient P/K architecture assessment

GAP-04 is resolved scientifically: the P Index governs P and the K Index governs K. To
represent each nutrient independently, these would have to change:

1. **`NutrientPlan.fertilityEvidence`** (frozen `types.ts` shape) goes from one paired
   `EngineOutcome<{pIndex, kIndex}>` to per-nutrient outcomes. Consumers:
   `finance.ts`, `real-alerts.ts`, `nutrient-plan-trace.ts`, `lib/reports.ts`,
   `orchestration/prompt/fertiliser-recommendation.ts`, `app/actions/farm.ts`,
   `NutrientsPageClient.tsx`, `NutrientRequirementCard.tsx` and `PurchasedFertiliserCard.tsx`.
2. **`requirement` / `netRequirement`**: each is one `TrackedValue<{n,p,k}>` with a single
   status. A per-nutrient status is needed so that "P known, K unknown" is not read as
   fully available or fully unavailable. The same consumers are affected, plus the
   Scientific Evidence Report and `EvidenceReportPageClient.tsx`.
3. **The Index-1 placeholder** (`pIndex ?? 1`) must be removed per nutrient. Today it is
   harmless only because every output is gated on the pair.
4. **`resolveAvailableSlurryNutrients` / `availableNutrientAssessment`** is one outcome
   for N, P and K. Keeping the known nutrient needs a per-nutrient outcome. This is the
   same shape question CC-B2 F003 answered for N with a special case.
5. **`purchasedProducts`**: every catalogue product is a multi-nutrient blend (0-7-30
   brings P with K). Buying for the known nutrient would deliver the other nutrient
   against an unknown requirement. That is a product and science decision, not a
   refactor.
6. **`napCompliance` / `statutoryManureValue`**: these are statutory P outputs gated on
   both indices. Keeping P statutory output with K unknown needs Campaign B review, and
   statutory outputs are out of scope here.
7. **What Matters / slurry economics**: `slurry-direct-economic-assessment` treats the
   assessment as one supported or unsupported unit.

The four cases this assessment was asked to cover:

| Case | Required behaviour | Today (CC-B4A) |
|---|---|---|
| P known / K known | As today | As today |
| P known / K unknown | P requirement, P credit and P products usable; K unknown; N kept | P and K withheld; N kept |
| P unknown / K known | Mirror of the above | P and K withheld; N kept |
| Both unknown | P and K withheld; N kept | Same |

This is a broad change: frozen `types.ts`/`nutrients.ts` shapes, about 11 production
consumers, the blend purchasing model and statutory outputs. It would reopen CC-B4A's
paired guarantee. **IMPLEMENTATION_DEFERRED_ARCHITECTURE.** Recommended separate task
order:

1. A per-nutrient outcome type, added alongside the paired one.
2. The requirement status per nutrient.
3. The slurry assessment per nutrient.
4. A blend-purchasing decision, which is scientific and product work.
5. Statutory review, which is Campaign B work.
6. UI.

Each step follows the contract-change protocol and bumps the engine version. The new
allocation layer already stores per-nutrient known/unknown quantities, so it needs no
change when that happens.
