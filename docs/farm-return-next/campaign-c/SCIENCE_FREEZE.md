# Campaign C — slurry recommendation science freeze

Base `29f787a8b9bc1a30613dc621e221ad79651c315f`, 2026-09-28. Campaign B remains
frozen at `b24c266`. Its regulatory behaviour is unchanged. This task changed no
product code. The only code added is a documentation-consistency test.

**Status (2026-09-29): AI_SCIENTIFIC_ADJUDICATION — EXPERT_VALIDATION_PENDING**
([AI_ADJUDICATION_2026-09-29.md](AI_ADJUDICATION_2026-09-29.md)).

- Only REPOSITORY_VERIFIED rules may change production.
- No production calculation changed in that task.
- The rule set stays DRAFT.

**Earlier status (superseded): SCIENCE FREEZE INCOMPLETE — STOPPED FOR HUMAN SCIENTIFIC REVIEW.**
Rule set `slurry-agronomy-ie-2026-v1` is **DRAFT**. Production implementation of the
Campaign C slurry recommendation engine is **not authorised**. STOP conditions 1, 2
and 8 are met (§14). Condition 7 cannot be excluded without runtime evidence (§13,
RISK-01).

## 1. Repository trace (what already exists)

| Area | Current implementation | Assessment |
|---|---|---|
| Spring LESS available N/P/K | `nutrients.ts` `SPRING_LESS_SLURRY_TABLE` (2/4/6/7% exact match), `slurryAvailableSpringLessKgHa` | Values match `CLM-OM-T2` (verified by test). Index 1/2 reduction (RISK-01) was not applied at this freeze; the production divergence identified as CC-B2 has since been corrected in `nutrient_engine_v1.1.0` (see §13) |
| Summer LESS | `SUMMER_LESS_SLURRY_TABLE` (6% only, N 0.6, P 0.5, K 3.5) | Matches `CLM-SP07-T2`. Index 1/2 reduction corrected in `nutrient_engine_v1.1.0` (CC-B2). Outside v1 |
| Splashplate | `SLURRY_TABLE_9_8`, rate interpolation, nearest-DM snapping, rate clamped to [11, 55] t/ha, fn3 factors | Values match `CLM-GB-9-8`. Snapping, extrapolation and clamping are unreviewed (RISK-02). Outside v1 |
| DM resolution | `resolveEffectiveSlurryComposition`: record DM or the 6.3% national average (`estimated`) | 6.3% default not allowed in v1 (GAP-06) |
| Timing | `slurry-timing.ts` (Carbon Navigator Jan–Apr / May–Jun / Jul–Oct) | CONF-04. January is treated as spring (RISK-03) |
| Method | `requireSlurryApplicationMethod`, `SlurryApplicationMethod` (`LESS`, `splashplate`, `incorporate_24h`, `other`) | LESS is one class (no trailing shoe/band/injection split) |
| Requirements | `nSilageKgHa`, `pBuildUpKgHa` + `pMaintenanceSilageKgHa`, `kSilageKgHa`, `calculateNutrientPlan` | Base values match the Green Book (verified by test). K Index 4 ignores fn5 (RISK-04). Early-grazing credit and < 4-year sward are not modelled |
| Soil P/K | `pIndexFromMgL`/`kIndexFromMgL`, `soil-index-provenance.ts` (lab vs farmer override), `soil-test-validity.ts` | Reusable. v1 requires a lab index |
| Peat | `soilOrganicMatterOver20Pct` (lab OM > 20% or mapped peat) | Reusable for OUT_OF_SCOPE detection |
| Statutory ledger | `statutory-manure-value.ts`, `checkNapCompliance`, Campaign B neat/origin evidence | Separate. Not touched. Never agronomic input |
| Prior inputs | `job_actuals` (`FertiliserSpreadingActual`, `SlurrySpreadingActual` with no DM), `getFieldRemainingFertiliserRequirement` | Chemical partly reusable. Slurry credit not derivable (no DM). No attestation |
| Rate / volume | None (farmer types volume; `calculateNutrientPlan` divides by gross area to describe the farmer's plan) | No recommendation engine exists. Campaign B spreadable area has no consumer |
| Economics | `slurry-direct-economic-assessment.ts`, `slurry-whole-farm-allocation.ts` (no production caller) | Consume the agronomic credit, so they inherit RISK-01/02 |
| Versioning | `NUTRIENT_ENGINE_VERSION`, per-table `ruleId`, `SOURCE_REGISTER`, `CURRENT_RULESET` (inert), `SLURRY_REGULATORY_RULESET`, `NAP_N_CATCHMENT_AMENDMENT_2028` (future-dated), `future_effective_rules.csv`, `dynamic_spreading_exception_events.csv` (empty) | Partial foundation (LIFECYCLE.md §12) |

## 2. Supported Campaign C v1 scenario (DRAFT)

All conditions must hold. Evidence for each boundary:

| Boundary | v1 rule | Evidence | Assessment |
|---|---|---|---|
| Material | Cattle slurry | `CLM-GB-9-1`, `CLM-OM-T2` | Supported |
| Land use | Irish grassland, first-cut silage | `CLM-GB-12-7`, `-13-4`, `-14-2` | Supported |
| Sward | Declared grass sward, clover < 20%, age ≥ 4 years | GB Table 12-6 note, `CLM-GB-12-7` fn3 | SUPPORTED_WITH_LIMITATIONS (GAP-07). "PRG-dominant" is not defined in any source |
| Timing | Planned application 1 Feb – 30 Apr, outside the statutory closed period (Campaign B gate) | `CLM-SP07-TIMING`, `CLM-CN-2016` | SUPPORTED_WITH_LIMITATIONS. January conflicts (CONF-04) |
| Method | LESS (trailing shoe, band spreader, trailing hose) | `CLM-GB-9-2`, `CLM-OM-T2` | Supported. Injection is not separately evidenced |
| Soil | Mineral (lab OM ≤ 20%), lab P and K Index 1–4, valid under the 4-year rule | `CLM-GB-13-2` | Supported. P Index 4 → NOT_RECOMMENDED_AGRONOMIC |
| Slurry evidence | Lab DM exactly 2, 4, 6 or 7%, sampled after the latest fill reading | `CLM-OM-T2` | Supported with limitations (GAP-02, GAP-05). The 6% row's P is in conflict (CONF-01) |
| Yield | Declared 5.0 t DM/ha | `CLM-GB-13-4`, `-14-2` | Other yields: GAP-03 |
| Prior inputs | Attested and known | `CLM-GB-12-7` fn2, GAP-08 | Unknown → UNKNOWN_REQUIRED_DATA |
| Regulation | Campaign B gates pass | Campaign B | Regulatory ledger separate |

**Boundary verification.** No evidence shows that the intended v1 scope is
scientifically inappropriate. STOP 6 is not met. The boundaries were verified, not
assumed. Two were narrowed without changing the intended scope: January, and
non-lab DM.

## 3. Excluded scenarios

| Scenario | Status | Reason |
|---|---|---|
| Pig slurry, poultry manure, FYM, dungstead, soiled water, digestate | OUT_OF_SCOPE | Different values (GB 9-5/9-6, OM PDF). Digestate has no source |
| Tillage, maize | OUT_OF_SCOPE | Different crop tables |
| Grazing swards, grazing optimisation, 2nd/3rd cut | OUT_OF_SCOPE | v1 is first cut only |
| Clover-rich (≥ 20%), red clover, multispecies | OUT_OF_SCOPE | N interaction unresolved (audit §12 item 12) |
| Reseeds < 4 years | OUT_OF_SCOPE | GAP-07 |
| Peat / high-organic (OM > 20%) | OUT_OF_SCOPE | `CLM-GB-13-2` fn2. Peat K bands not integrated |
| Autumn and late-summer slurry, any method | OUT_OF_SCOPE | No evidenced availability |
| Summer LESS for first cut | OUT_OF_SCOPE | Evidence exists (`CLM-SP07-T2`) but not for this crop stage |
| Splashplate at any timing | OUT_OF_SCOPE | Spring evidence exists (v2 candidate). Other timings unevidenced. LESS may be legally required |
| Incorporation / other method | OUT_OF_SCOPE | No grassland rule |
| Unknown P or K Index, farmer-estimated index, expired test | UNKNOWN_REQUIRED_DATA | Lab index required |
| Unknown prior inputs | UNKNOWN_REQUIRED_DATA | Never zero |
| Unresolved environmental or operational exclusions (buffers, commonage, closed period) | LEGALLY_BLOCKED or UNKNOWN (Campaign B) | Regulatory ledger |
| DM unknown, between points, or outside 2–7% | UNKNOWN_REQUIRED_DATA / OUT_OF_SCOPE | GAP-02, GAP-06 |
| Multi-store DM conflict | UNKNOWN_REQUIRED_DATA | Existing `SLURRY_COMPOSITION_SOURCES_UNRESOLVED` |
| Derogation farms | Regulatory (Campaign B) | Unaffected agronomically. Legal limits separate |

## 4. Slurry nutrient-value matrix (kg available per m³ as applied, spring LESS)

| DM % | N | P (Index 3/4) | P (Index 1/2) | K (Index 3/4) | K (Index 1/2) | Status |
|---|---|---|---|---|---|---|
| 2 | 0.4 | 0.21 | 0.105 | 1.4 | 1.26 | SUPPORTED_WITH_LIMITATIONS |
| 4 | 0.7 | 0.35 | 0.175 | 2.1 | 1.89 | SUPPORTED_WITH_LIMITATIONS |
| 6 | 1.0 | **0.5 / 0.6** | 0.25 / 0.3 | 3.5 | 3.15 | EVIDENCE_CONFLICT (P, CONF-01); N and K supported |
| 7 | 1.1 | 0.6 | 0.3 | 4.0 | 3.6 | SUPPORTED_WITH_LIMITATIONS |

- N = total N × 40% NFRV (`CLM-GB-9-2`, `CLM-OMPDF-CATTLE6` fn1). P and K are
  independent of method and timing (`CLM-OM-METHOD`).
- Denominator: SOURCES_AND_CLAIMS.md §3.
- DM rules:
  - Exact evidenced points only (GAP-02).
  - Between points → OUT_OF_SCOPE.
  - Outside 2–7% → OUT_OF_SCOPE.
  - Unknown → UNKNOWN_REQUIRED_DATA.
  - No interpolation and no snapping.
- `STATUTORY_DEEMED` values (S.I. 588/2025 2.4 kg N / 0.5 kg P per m³ neat) are never
  consumed.
- Measured total N/P/K and NH₄-N are not converted (audit §12 item 4). They stay
  recorded but unused.

## 5. Method × timing matrix (cattle slurry, grassland)

| Method | Feb–Apr | January | May–Jun | Jul–Oct | Nov–Dec |
|---|---|---|---|---|---|
| LESS | SUPPORTED_WITH_LIMITATIONS (v1) | EVIDENCE_CONFLICT (CONF-04) | SUPPORTED_WITH_LIMITATIONS, 6% DM only, OUT_OF_SCOPE for v1 | OUT_OF_SCOPE | OUT_OF_SCOPE (also closed period) |
| Splashplate | SUPPORTED_WITH_LIMITATIONS (GB 9-8/9-3/9-4), OUT_OF_SCOPE for v1 | EVIDENCE_CONFLICT | UNKNOWN (GB 9-2/9-3 give summer N at average composition only) | OUT_OF_SCOPE | OUT_OF_SCOPE |
| Incorporation / other | OUT_OF_SCOPE | OUT_OF_SCOPE | OUT_OF_SCOPE | OUT_OF_SCOPE | OUT_OF_SCOPE |

The splashplate economics and table code having numbers does not make these
combinations supported.

## 6. Soil P and K requirement matrix — first-cut silage, 5 t DM/ha, mineral soil

| Index | P build-up + maintenance | K | Slurry P factor | Slurry K factor |
|---|---|---|---|---|
| 1 | 20 + 20 = 40 | 185 | 0.5 | 0.9 |
| 2 | 10 + 20 = 30 | 155 | 0.5 | 0.9 |
| 3 | 0 + 20 = 20 | 125 | 1.0 | 1.0 |
| 4 | 0 (no chemical P; no slurry where other land is available) | 0 in the year of sampling, then Index 3 advice (125) | — | 1.0 |

- Yield: ±4 kg P and ±25 kg K per t DM from 5 t/ha (GAP-03 for range).
- N requirement: 125, or 100 if grazed last year. Early-grazing N credited at 20%.
- Three ledgers are kept separate:
  - (1) crop requirement (above);
  - (2) slurry supply (§4 × rate);
  - (3) remaining mineral requirement = (1) − prior credit − (2), signed.
- Oversupply is a negative balance that must be shown, never floored (CC-017, CC-005).
- The 90 kg K spring limit (CONF-02) and the Index 1/2 share caps (CONF-03) are
  unresolved.

## 7. Prior nutrient inputs

| Input | Credit | Status |
|---|---|---|
| Chemical N/P/K applied to this field for this crop, known product/quantity/date, single field or evidenced split | 100% available (fertiliser is the reference) | Creditable. `job_actuals` supplies it for GPS-confirmed single-field jobs |
| Chemical N applied for early grazing before closing | 20% of N (`CLM-GB-12-7` fn2) | Creditable |
| Slurry earlier the same spring, with method, date, rate and lab DM known | Same v1 rule as a new application (CC-006) | Creditable in principle. **Current `SlurrySpreadingActual` has no DM**, so UNKNOWN_REQUIRED_DATA in practice |
| Slurry in a previous season, FYM, other organic | Not credited (residual effects appear in the next soil test) | GAP-08 |
| Multi-field records with no split | Not credited | UNKNOWN_REQUIRED_DATA |
| No attestation that the record is complete | — | UNKNOWN_REQUIRED_DATA (CC-008) |
| Applications outside the GAP-08 window | — | EXPERT_REVIEW_REQUIRED |

## 8. RATE vs TOTAL VOLUME

- RATE: m³/ha from §4 and §6 under the (unresolved) GAP-01 objective, floored to
  0.1. It never depends on field area.
- TOTAL VOLUME: RATE × the Campaign B *recorded spreadable area*, floored to 0.1 m³.
  Unknown spreadable area blocks the total only (CC-015). Gross area is never
  substituted.
- Neither calculation is implemented.

## 9. Recommendation status taxonomy

Science-layer precedence runs from top to bottom: every reason is retained, and the
top one is displayed.

| Status | Exactly when |
|---|---|
| OUT_OF_SCOPE | Any input outside §2 (material, crop, sward, soil, method, timing, DM range or points, unsupported jurisdiction, no active rule version for the date) |
| UNKNOWN_REQUIRED_DATA | A required input is missing or not legally or scientifically sufficient: lab index, DM, yield, prior-input attestation, planned date. For TOTAL_VOLUME only: spreadable area |
| EVIDENCE_CONFLICT | A CONF- item affects a value used by this case |
| EXPERT_REVIEW_REQUIRED | A GAP- item affects this case, or overrides conflict at equal precedence (LIFECYCLE.md §5) |
| NOT_RECOMMENDED_AGRONOMIC | Evidence says no slurry here: P Index 4, zero remaining P and K, or a proposed rate that oversupplies |
| RECOMMENDED | A rate > 0 from an APPROVED/ACTIVE rule set with no open item affecting it |
| ELIGIBLE_NOT_SELECTED | RECOMMENDED at field level, but the whole-farm allocation (Campaign D) gave the slurry elsewhere |
| LEGALLY_BLOCKED | A Campaign B regulatory gate prohibits the application. Displayed above any science status. Never computed by the science layer |
| NOT_ACTIONABLE_NOW | Legal and recommended, but the actionability layer (weather/ground) says not now |

## 10. Uncertainty to disclose

| Kind | Where | Disclosure |
|---|---|---|
| Computational exactness | Decimal products, floor rounding | Exact. Rounding rule stated |
| Measurement uncertainty | Lab DM, lab P/K | Sample date and lab. No interval fabricated |
| Natural variability | Slurry composition varies up to tenfold (`CLM-GB-9-1` ranges) | Quote the published range. No confidence interval (none published) |
| Experimental variability | NFRV 15–40% depending on method, weather and timing (OM page) | State that N availability depends on weather at application |
| Model assumptions | Rate objective (GAP-01), DM points (GAP-02), yield baseline (GAP-03) | Listed per recommendation |
| Policy assumptions | Rounding, sample-after-fill, crediting window | Labelled FARM_RETURN_POLICY, never "Teagasc" |

## 11. Existing architecture already satisfying requirements

- `EngineOutcome` fail-closed reason codes.
- `EvidenceFact` known/missing/conflicting.
- `TrackedValue` provenance.
- Append-only evidence tables.
- `soil-index-provenance.ts`.
- Campaign B spreadable-area and neat-slurry evidence (separate ledgers).
- `assessment-integrity.ts` SHA-256 canonical fingerprints.
- `audit-trace.ts` `CalculationRun`/`DecisionRecord`.
- `decisions.calculation_version` / `inputs_snapshot` / `estimate_snapshot`.
- `SOURCE_REGISTER`, `SLURRY_REGULATORY_RULESET` stamping.
- Future-dated rule precedent (`NAP_N_CATCHMENT_AMENDMENT_2028`, `future_effective_rules.csv`).
- An override register seed (`dynamic_spreading_exception_events.csv`, empty).

## 12. Gaps requiring later implementation

1. Scientific review closing CONF-01..04 and GAP-01..08, then rule-set approval.
2. A versioned rule-set data module and resolver (LIFECYCLE.md §3, §10).
3. Replacement of RISK-01..07.
4. DM on slurry spreading actuals, and a prior-input attestation.
5. Declared yield, sward class and age, and season/cut plan (audit §2D).
6. Persisted recommendation records (migration, not authorised here).
7. The Campaign D allocator consuming field rates and spreadable area.
8. Override resolution wired into the Campaign B gates. This is a separate authorised
   task, because it would change Campaign B behaviour.

## 13. Existing production-code risk assessment

| ID | Code | Issue | Class |
|---|---|---|---|
| RISK-01 | `nutrients.ts` `resolveAvailableSlurryNutrients` LESS branches (`soilIndexAdjustmentApplied: { p: false, k: false }`) and the comment at `:953–955` | The source table carries an Index 1/2 note ("reduce P by 50% and K by 10%", `CLM-OM-T2-NOTE`). The code does not apply it and says the source has none. On P or K Index 1/2 fields with a LESS allocation and a recorded DM of exactly 2/4/6/7%, slurry P is overstated 2× and K by 11%. `calculateNutrientPlan` then lowers the chemical P/K shown on Nutrients, the Scientific Evidence Report and the What Matters economics | **UNSAFE_CURRENT_PRODUCTION_USE** (confirmed from code). Live exposure needs runtime validation: on 2026-09-19 Dev had zero `slurry_allocations`; production state is unknown. Not fixed here (the task forbids silent rewrites). **Priority blocker CC-B2** — since corrected in `nutrient_engine_v1.1.0` (CC-B2 resolved 2026-09-29, final audited commit `65bdedb`) |
| RISK-02 | `slurryAvailableAtIndex34` | Nearest-DM snapping (including outside 4–10%), rate clamping to [11, 55], linear rate interpolation | REQUIRES_CAMPAIGN_C_REPLACEMENT (disclosed; audit §12 items 2–3) |
| RISK-03 | `classifySlurryTiming` | January treated as SPRING | REQUIRES_CAMPAIGN_C_REPLACEMENT |
| RISK-04 | `kSilageKgHa` | Index 4 always returns 0 (ignores fn5); no early-grazing or young-sward N | NOT_CURRENTLY_USER_FACING (silage plans are mock-only; real silage fields block `MISSING_SILAGE_PLAN_DATA`) |
| RISK-05 | `calculateNutrientPlan` offset | An unsupported slurry context gives a 0 credit, so the chemical advice ignores the planned slurry (disclosed on the card) | REQUIRES_CAMPAIGN_C_REPLACEMENT |
| RISK-06 | `calculateNutrientPlan` `Math.max(0, gross − offset)` | Oversupply disappears | REQUIRES_CAMPAIGN_C_REPLACEMENT |
| RISK-07 | `calculateNutrientPlan` `asOfDate ?? new Date()` | Implicit clock in a scientific calculation | REQUIRES_CAMPAIGN_C_REPLACEMENT |
| RISK-08 | `resolveEffectiveSlurryComposition` 6.3% default + Table 9-8 | Default composition when none recorded (disclosed `estimated`) | REQUIRES_CAMPAIGN_C_REPLACEMENT |
| RISK-09 | Volume ÷ gross area | Describes the farmer's plan, not a recommendation | SAFE_EXISTING |
| RISK-10 | Statutory manure ledger (Campaign B) | Separate, neat-only | SAFE_EXISTING |
| RISK-11 | `slurry-whole-farm-allocation.ts` | No production caller | NOT_CURRENTLY_USER_FACING |

No production code presents a Campaign C slurry *rate* recommendation. RISK-01 is an
agronomic credit that disagrees with its own cited source. It is recorded as a STOP 7
priority issue because it cannot be excluded from real use.

**Update 2026-09-29 (CC-B2):** the RISK-01 production divergence has been corrected in
`nutrient_engine_v1.1.0` as a narrow implementation correction (LESS P × 0.50 / K × 0.90
on Index 1/2; N unchanged). This does not resolve CONF-01, CONF-02, CONF-03, CONF-04 or
GAP-01–GAP-08, and does not approve Campaign C; the rule set remains DRAFT.

## 14. STOP conditions

| # | Condition | Met? |
|---|---|---|
| 1 | Authoritative sources materially conflict on a core v1 rule | **Yes**: CONF-02, CONF-03 (and CONF-01 for 6% DM) |
| 2 | First-cut P/K requirements cannot be reconciled | **Yes, partly**: base requirements reconcile. K timing (CONF-02) and the low-index organic share (CONF-03) do not |
| 3 | Nutrient denominator ambiguous | No. kg per m³ as applied (DM-labelling question is GAP-02) |
| 4 | DM interpolation required without evidence | No. v1 refuses non-evidenced DM instead of interpolating |
| 5 | Code inseparably mixes statutory and agronomic values | No. Ledgers are separate (Campaign B) |
| 6 | Intended v1 scope indefensible | No |
| 7 | Production actively showing unsupported Campaign C recommendations | **Cannot be excluded**: RISK-01 |
| 8 | A numeric rule requires an invented assumption | **Yes**: the rate objective (GAP-01) |
| 9 | Lifecycle cannot preserve reproducibility | No (LIFECYCLE.md) |
| 10 | Overrides need Campaign B base mutation | No (LIFECYCLE.md §5) |

**Update 2026-09-29 (CC-B1 adjudication, [ADJUDICATION_CC-B1.md](ADJUDICATION_CC-B1.md)):**
condition 1 is still met through CONF-02 (UNRESOLVED_CONFLICT) and CONF-03
(INSUFFICIENT_EVIDENCE). CONF-01 is adjudicated RESOLVED_WITH_SCOPE (6% row P 0.5),
pending ratification. Condition 8 is still met (GAP-01, INSUFFICIENT_EVIDENCE). §4's 6%
row and §5's January cell keep their current status until ratification.

## 15. May Campaign C production implementation begin?

**No.** Three things must happen first:

1. A qualified reviewer (Teagasc adviser or agronomist) resolves CONF-01..03 and
   GAP-01, and the resolutions are recorded as claims.
2. The rule set is approved and the reference-case expectations are updated under
   review.
3. RISK-01 is triaged by the product owner.

Implementation of the non-scientific lifecycle scaffolding (LIFECYCLE.md) may be
authorised separately, because it does not depend on the open science.

After CC-B1 (2026-09-29), the answer is still **No**. Item 1 has narrowed:

- CONF-02, CONF-03 and GAP-01 still need reviewer rulings. The exact evidence requests
  are in ADJUDICATION_CC-B1.md.
- CONF-01 and CONF-04 need only ratification and SOURCES_AND_CLAIMS §4 re-verification.
