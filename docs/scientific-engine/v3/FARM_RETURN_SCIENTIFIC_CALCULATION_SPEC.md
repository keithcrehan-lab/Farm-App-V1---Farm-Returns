# Farm Return — Scientific Calculation & Regulatory Evidence Specification
## Version 2.0 — pre-upload validation pack
**Evidence checked:** 2026-08-26

## Purpose
This is the authoritative pre-implementation specification for the Farm Return calculation engine. It supersedes Version 1.0 in this pack.

The objective is not to make every screen return a number. The objective is to ensure that **every number the application does return is traceable, scoped, unit-safe, legally current and scientifically defensible**.

A claim of “zero possible flaws forever” would not be credible because Irish law, Teagasc guidance, farm circumstances and live datasets change. The production standard is therefore:

> **No known unresolved scientific or legal gap is permitted to produce an unqualified definitive calculation. Unknown, ambiguous, stale or unsupported cases must fail closed.**

---

# A. Non-negotiable engine architecture

1. **Deterministic rules engine first.** The LLM never decides a fertiliser rate, legal status, intake coefficient or ration.
2. **Two nutrient ledgers.**
   - Agronomic ledger = expected plant-available nutrient contribution/need.
   - Compliance ledger = current statutory N/P accounting and ceilings.
   They must never overwrite each other.
3. **Evidence precedence.**
   - measured farm/lab data;
   - current Irish scientific model / validated Irish lookup;
   - official live Irish data;
   - current Irish planning default;
   - generic fallback only if separately approved.
4. **Law is a hard gate.** Current statute overrides advisory material for compliance.
5. **Every result carries provenance:** source IDs, rule/model version, effective date, input values/units, measurement/default status and calculation timestamp.
6. **Every regulated rule is effective-dated.** Base S.I. 588/2025 must be resolved through S.I. 119/2026 amendments.
7. **No magic numbers in UI/components.** Numeric constants come from a controlled rules/data module.
8. **No silent interpolation.** Published lookup tables are discrete unless a validated interpolation model is separately sourced.

---

# B. Corrections made after Version 1

## B1. Soil P boundary
The current statutory table literally specifies:
- grass Index 3: 5.05–8.00; Index 4: >8.01;
- other crop Index 3: 6.05–10.00; Index 4: >10.01.

This leaves a tiny literal source gap. Version 1 incorrectly asserted exact 8.01 = Index 4.

**Version 2 rule:** preserve raw lab precision. Values in `(8.00, 8.01]` for grass or `(10.00, 10.01]` for other crops return:
`AMBIGUOUS_STATUTORY_BOUNDARY`.

For compliance safety, the engine may apply the conservative **P4 allowance treatment** while explicitly recording that this is a conservative handling of source ambiguity, not a fabricated literal classification.

## B2. Four-year soil test rule
Version 1 treated an exactly four-year-old test as universally invalid.

**Current rule:** a result four years old or older is disregarded **except where it indicated P Index 4, in which case the Index 4 result persists**.

## B3. 2026 amendment precedence
Current Table 7 livestock excretion and Tables 13–14 must come from S.I. 119/2026 where amended. Do not use a December 2025 base-table value where the April 2026 amendment replaced it.

---

# C. Soil module

## C1. Sampling and validity
Implement `rules_statutory/soil_sampling_protocol_2026.csv` and `soil_test_compliance_rules_2026.csv`.

Critical controls include:
- representative sample area;
- 20-core composite;
- 100 mm sampling depth;
- timing after P fertiliser / ground limestone;
- report date;
- four-year rule with P4 persistence;
- OM validity;
- georeference/LPIS requirement for reports issued after 14 September 2025.

An undated test cannot silently support a regulated recommendation.

## C2. P Index
Use only `rules_statutory/soil_phosphorus_index_2026.csv` for current legal P classification.
Do not round a source value to make it fit.

## C3. K and Mg
Current Teagasc advisory index tables are supplied separately in:
- `advisory_teagasc/soil_K_index_current.csv`
- `advisory_teagasc/soil_Mg_index_current.csv`

## C4. Lime
Exact lime t/ha requires a laboratory lime requirement / buffering-capacity result.
pH may indicate status/target, but **pH alone never produces tonnes/ha**.

The statutory high-stocking lime programme and the 2026 transitional rule are stored in `rules_statutory/lime_programme_2026.csv`.

---

# D. Stocking rate and livestock nutrient excretion

## D1. Grassland Stocking Rate
Statutory GSR:
`total N produced by grazing livestock before exports / entire eligible grassland area`.

Do not subtract exports from the numerator.

## D2. Current livestock excretion
Use current S.I. 119/2026 Table 7 values in `livestock_excretion_rates_2026.csv`.

## D3. Dairy crude-protein election
`dairy_cow_excretion_table7a_2026.csv` contains the lower statutory N excretion values available only where the current Table7a option is validly elected and prescribed evidence/records exist.

If eligibility cannot be proved, use ordinary current Table 7. Do not “optimise” the legal N figure from a user-entered crude-protein percentage.

---

# E. N and P ceilings

## E1. Grassland N
Use the current amended Table 13 data. High-rate rows have footnotes/eligibility; those must be encoded rather than ignored.

## E2. P build-up
Higher build-up Table15b is **conditional**. `p_build_up_eligibility_2026.csv` makes the four core Article17(6) requirements explicit:
- current P/OM evidence;
- approved adviser;
- submitted detailed NMP;
- required training;
plus relevant table footnotes.

Any failed/unknown condition => not eligible for increased build-up table.

## E3. Derogation
Do not create a simple “derogation = on” toggle.

A higher livestock-manure N ceiling requires valid current authorisation and all applicable Schedule 5 / Ministerial / geographic conditions. Until the full derogation module is verified, the engine remains fail-closed to the ordinary ceiling.

---

# F. Milking-platform nutrient distribution

S.I. 119/2026 Table 14 is now encoded in `milking_platform_table14_2026.csv`.

Do not substitute whole-holding stocking rate for the defined milking-platform stocking rate.

Effective-dated future reductions must not be activated in 2026.

---

# G. Slurry and organic manure

Maintain separate ledgers.

## Agronomic
Use current Teagasc replacement values, ideally measured composition/DM where available.

## Compliance
Use current statutory deemed total N/P and availability rules.

Never:
- use Teagasc agronomic available-N value as the legal N figure;
- use a statutory deemed value as though it were measured fertiliser replacement;
- mix units/bases.

---

# H. Spreading engine

Order:
1. current ruleset;
2. closed-period baseline;
3. authoritative exceptional-event registry;
4. ground/weather hard stops;
5. buffers/slope/runoff;
6. only then agronomic opportunity.

`dynamic_spreading_exception_events.csv` is intentionally empty until an authoritative event is verified.

**Favourable weather cannot create a legal exceptional opening.**

SMD and soil temperature are advisory/context variables. Do not invent a legal SMD threshold or universal `>6°C = spread` gate.

Use:
- `PROHIBITED`
- `PERMITTED`
- `UNKNOWN`

Only after `PERMITTED` may an agronomic opportunity rating be shown.

No unvalidated “scientific 0–100 probability”.

---

# I. Fodder and feed — now substantially unblocked

## I1. Current basic whole-farm fodder budget
Teagasc guidance published 26 August 2026 gives current planning coefficients in tonnes fresh pit silage per animal per month:

- dairy cow 1.6
- suckler cow 1.4
- cattle 0–1 year 0.7
- cattle 1–2 year 1.3
- cattle 2+ years 1.3
- ewe 0.15

Formula:
`fresh_weight_demand_t = headcount × farmer_planned_months × source_coefficient`.

This is a **planning model**, not an individual energy/protein equation.

The application must show that winter length, liveweight, forage quality, wastage and meal feeding can change actual use.

## I2. Beef refinement
Current July 2026 Teagasc beef guidance supplies:
- class-specific monthly pit/bale planning rates;
- DMD suitability by animal class;
- 15–20% additional reserve guidance;
- warning that ensiling/feed-out DM losses may range 15–30%.

Do not subtract a generic ensiling loss from feed already measured in the pit/bales and then add it again as wastage.

## I3. Unit/basis gate
A feed balance must be entirely on:
- fresh-weight planning basis, OR
- dry-matter basis.

**Never subtract t DM from t fresh weight.**

## I4. Exact nutrition
Exact performance/ration modelling remains more demanding than the basic fodder budget.

For exact nutrition:
- animal class/stage;
- liveweight;
- target ADG/production;
- forage DMD/DM and preferably energy/protein;
- concentrate spec;
- validated matching model/lookup.

The July 2026 650 kg suckler cow / 350 kg weanling values are valid scenario references, not universal equations.

## I5. DairyBeef
Use exact DMD table rows only.
DMD 73 does not automatically get interpolated between 72 and 74 in production.

## I6. Sheep
The 2026 twin-bearing lowland ewe table is valid for the matching late-pregnancy/chop/DMD scenario only.

---

# J. Clover and N — supported scenarios now available

Version 1 left clover-N largely unresolved.

Version 2 includes:
- current 2026 dairy grazing N schedules by April clover-content class;
- current 2026 drystock grazing schedule at the stated reference stocking rate.

These are **strategy tables**, not a generic “clover credit”.

Rules:
- exact enterprise/system scope;
- no blending dairy and drystock tables;
- no mathematical interpolation between source clover classes;
- legal N ceiling overrides advisory rate;
- insufficient fertility/establishment context must be surfaced where source strategy requires it.

---

# K. Livestock sale economics

Official market prices are inputs to scenarios, not sale instructions.

The application requires farm-specific:
- current weight + weigh date;
- animal group/type;
- intended sale route/specification;
- target period;
- projected performance;
- feed/housing/carrying costs.

Then calculate incremental hold-vs-sell scenarios.

Never turn “price is high” into an autonomous sell instruction.

---

# L. Units and conversions

Use `implementation/unit_registry.csv`.

Critical:
- fresh forage != dry matter;
- elemental P != P2O5;
- elemental K != K2O;
- Morgan mg/L values are method-specific;
- area/unit conversion is deterministic code with tests.

No unit conversion by LLM.

---

# M. Provenance and confidence

Do not show fake percentages such as “82% confidence” unless statistically calibrated.

Use evidence-state labels:
- MEASURED
- DERIVED
- IRISH_MODEL
- IRISH_DEFAULT
- INSUFFICIENT

Every numeric output must retain a complete audit trail.

---

# N. Production release logic

Use `implementation/production_release_gate.csv`.

A calculation may be:
- READY
- READY_CONDITIONAL
- FRAMEWORK_READY_INPUT_DEPENDENT
- PARTIAL
- BLOCKED_UNTIL_AUTHORISED_MODULE

The user should never see a definitive answer from a blocked route.

---

# O. Testing

`implementation/acceptance_tests.csv` now contains 52 initial tests.

Claude must add:
- thresholds ± one representable unit;
- null/negative/unit failures;
- amendment-precedence tests;
- stale ruleset tests;
- cross-ledger isolation;
- source-provenance tests;
- mixed fresh/DM feed-basis rejection;
- dynamic exception-event tests;
- no-interpolation tests;
- authorisation tests.

No implementation is complete merely because the UI renders.

---

# P. Known remaining constraints

These are not “secret assumptions”; they are explicit fail-closed boundaries:

1. Literal statutory P boundary micro-gap — guarded conservatively and flagged.
2. Higher derogation limits — require full verified authorisation/rules module.
3. Exact animal nutrition for unsupported classes/stages — blocked until validated.
4. Exact ration optimisation without forage analysis — blocked.
5. Market-derived sale action without farm data — blocked.
6. Future legal amendments — handled through effective-dated ruleset revalidation.

No other known calculation gap in this scope is permitted to be silently filled.

---

# Q. Claude implementation principle

**When a coefficient is not in a versioned source table or validated model, Claude must not invent it.**

If in doubt:
`INSUFFICIENT_EVIDENCE`.

That is a successful engine response, not a failure.

**Version 2 supersedes Version 1.**


---

# VERSION 3 PRE-CODE AUDIT ADDENDUM — MANDATORY
**Audit date:** 2026-08-26

Version 3 adds system-level controls discovered by adversarial whole-farm testing.

## New mandatory calculation/control modules
- `COMMONAGE_FERTILISER_GATE`
- `LESS_METHOD_GATE`
- `SOILED_WATER_APPLICATION_GATE`
- `CONCENTRATE_P_COMPLIANCE`
- `FEED_CP_LEGAL_GATE`
- `SILAGE_DESTINATION_REGULATORY_ROUTE`
- `FERTILISER_PRODUCT_ADMISSIBILITY`
- `RECOMMENDATION_AUDIT_TRACE`

## New mandatory data capture
See `implementation/required_input_fields.csv`, including:
- commonage status;
- silage destination and sale evidence;
- slurry application method;
- local buffer override status where relevant;
- concentrate CP and P information;
- fertiliser formulation/inhibitor metadata;
- feed fresh-weight vs dry-matter basis.

## End-to-end validation
`validation/golden_farm_tests.csv` contains **180** pre-code golden tests across 20 farm scenarios.

They are mandatory in addition to lower-level acceptance tests.

## Reports / peer review
`reports/RECOMMENDATION_AUDIT_REPORT_SPEC.md` is part of the scientific engine specification.

Every production decision — including no-action, legal prohibition, estimate and blocked result — must have an immutable calculation-time trace.

The authoritative report is the deterministic structured trace. Any LLM narrative is optional and non-authoritative.
