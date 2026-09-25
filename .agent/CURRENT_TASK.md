# Task: Audit Farm Return against Slurry Recommendation Evidence Contract

## Objective

Perform a deep implementation audit of the current `farm-return-next` codebase against the proposed scientific evidence requirements for an automatic cattle-slurry recommendation engine.

This is an AUDIT task.

Do not build the recommendation engine.
Do not change product behaviour.
Do not add database migrations.
Do not redesign the UI.
Do not invent missing evidence.

The purpose is to establish exactly what Farm Return already knows, what it can safely derive, what has weak or incomplete provenance, and what genuinely needs to be captured from the farmer or an external Irish data source.

The final output must be sufficiently detailed that a subsequent build can be scoped without re-auditing the repository.

## Core principle

The future slurry recommendation workflow must minimise farmer effort.

Use this acquisition priority:

1. Reuse reliable existing Farm Return data.
2. Safely derive data from existing evidence.
3. Retrieve authoritative external data where appropriate.
4. Ask the farmer only when the required fact cannot otherwise be established.
5. Never ask the farmer twice for the same still-valid fact.
6. Never convert missing evidence to zero.
7. Never infer a scientific fact merely because a neighbouring field or similar farm has one.
8. Keep regulatory, agronomic, physical and economic evidence separate where they represent different concepts.

## Scientific recommendation layers

Audit evidence separately for these layers:

- RATE
- COMPLIANCE
- TOTAL_VOLUME
- ECONOMIC
- ACTIONABILITY

A missing value may block one layer without blocking the others.

Example:
- missing K Index may block RATE
- missing contractor cost may block ECONOMIC
- heavy rain may block ACTIONABILITY only

Do not treat recommendation readiness as a single boolean.

---

# Required classification

For every canonical evidence item below, classify the current implementation as exactly one of:

- `EXISTS_TRUSTWORTHY`
- `EXISTS_WEAK_PROVENANCE`
- `EXISTS_BUT_WRONG_SEMANTICS`
- `DERIVABLE_FROM_EXISTING_DATA`
- `MISSING_REQUIRES_FARMER_CONFIRMATION`
- `MISSING_REQUIRES_FARMER_ENTRY`
- `MISSING_EXTERNAL_DATA_INTEGRATION`
- `BLOCKED_BY_UNRESOLVED_SCIENCE`
- `OUT_OF_INITIAL_SCOPE`

Do not guess.

If a field appears to exist, trace its actual persistence and runtime use before classifying it as trustworthy.

---

# For every evidence item record

The audit matrix must include:

1. Canonical evidence name
2. Scientific / regulatory purpose
3. Blocking layer(s)
4. Current implementation status
5. Actual database table + column, if any
6. Actual TypeScript/domain type, if any
7. Persistence/write path
8. Runtime/read path
9. Current UI capture/display path
10. Source/provenance currently retained
11. Timestamp/freshness currently retained
12. Farmer currently asked? yes/no
13. Is the farmer unnecessarily asked for data already known?
14. Can Farm Return safely derive it?
15. Does it need external Irish data?
16. Gap / risk
17. Recommended acquisition method
18. Recommended farmer interaction, if any

Where possible include exact file paths, exported functions, server actions, database functions and migration names.

---

# Evidence areas to audit

## A. Calculation identity / provenance

Audit whether Farm Return can currently retain:

- recommendation_context_id
- farm_id
- field_id
- calculated_at
- scientific_ruleset_version
- regulatory_ruleset_version
- economic_ruleset_version
- evidence_snapshot_hash
- engine_version

Also inspect existing fingerprinting, evidence registry, provenance and audit architecture from previous phases and identify what can be reused.

Do not create a second provenance system if the repository already has one.

---

## B. Farm regulatory context

Audit:

- farm county
- holding area ha
- grassland area ha
- previous-year grassland stocking rate kg N/ha
- livestock population required to derive GSR
- derogation status
- applicable derogation limit
- manure imports N/P
- manure exports N/P
- livestock manure production N
- livestock manure production P
- regulatory neat cattle slurry quantity
- nutrient-record completeness status

Pay particular attention to whether Farm Return currently distinguishes:

- physical slurry volume
- regulatory neat slurry volume
- agronomic slurry composition

These must not be treated as synonyms.

---

## C. Field / spatial evidence

Audit:

- field ID
- field name
- field polygon
- gross area ha
- LPIS reference
- field geolocation
- mapped water features
- surface-water buffers
- drinking-water buffers where relevant
- karst / other regulated exclusions where relevant
- slope
- drainage information
- spreadable area ha
- known field access constraints

Inspect the existing field mapping, soil mapping and satellite/field-awareness work before declaring anything missing.

Determine whether Farm Return can presently calculate a defensible spreadable area or only gross field area.

---

## D. Crop / sward evidence

Audit:

- current field use
- grass use
- first cut / second cut / grazing
- cut number
- expected yield t DM/ha
- yield basis/provenance
- sward type
- reseed date
- reseed age
- clover status
- multispecies status
- previous grazing
- planned harvest window

Identify what already exists in field planning/history and what the farmer is currently asked elsewhere.

Look for opportunities for batch confirmation rather than per-field entry.

---

## E. Soil evidence

Audit:

- soil test ID
- laboratory
- sample date
- analysis date
- soil-test field linkage
- sample georeference
- LPIS reference
- sampling area
- Morgan's P result
- measured P Index
- regulatory P Index / deemed P Index
- K result
- K Index
- pH
- organic matter
- peat / high-organic status
- agronomic validity
- regulatory validity
- lime history / lime requirement where already captured

Trace the existing soil upload/manual-entry flows and the existing provenance model.

Pay particular attention to previous known issues around:
- derived vs farmer-adjusted P/K provenance
- soil-test geolocation
- "View test"
- field soil composition
- lime requirements

Determine whether a regulatory deemed P Index can currently be represented separately from a measured P Index.

---

## F. Previous nutrient applications

Audit:

- chemical N applied kg/ha
- chemical P applied kg/ha
- chemical K applied kg/ha
- previous slurry applications
- previous slurry volume m3/ha
- FYM / other organic manure
- organic N/P/K already applied
- early-grazing N
- early-grazing N credit
- application dates
- nutrient history completeness
- farmer confirmation that no unrecorded nutrient inputs exist

Inspect:
- fertiliser jobs
- nutrient plans
- GPS job mode
- confirmed job actuals
- fertiliser stock / applications
- slurry allocations
- any farm history/event ledger

Determine whether Farm Return can reconstruct previous crop-cycle nutrient inputs from existing records rather than asking the farmer again.

---

## G. Slurry physical resource

Audit:

- housing/store ID
- slurry type
- storage capacity m3
- fill %
- fill status
- fill recorded at
- physical slurry volume
- currently allocated slurry
- remaining slurry
- neat slurry quantity
- dilution
- dirty-yard water
- dairy washings
- rainfall contribution
- source livestock groups
- resource snapshot timestamp

Reuse the recently completed slurry capacity invariant work.

Confirm what the current `available slurry` calculation actually means scientifically and regulatorily.

Do not assume physical available slurry is regulatory neat slurry.

---

## H. Slurry composition

Audit:

- composition basis
- slurry sample ID
- sample date
- DM %
- hydrometer support if any
- total N
- NH4-N
- total P
- total K
- available agronomic N
- available agronomic P
- available agronomic K
- statutory/regulatory N
- statutory/regulatory P
- evidence quality/source class
- evidence limitations

Inspect existing `slurry_composition_records` and the audited slurry-science engine.

Determine precisely what current default coefficients represent and their evidence provenance.

Do not implement the new recommendation rules.

Mark unresolved scientific transformations as `BLOCKED_BY_UNRESOLVED_SCIENCE`.

---

## I. Application scenario

Audit:

- application method
- application date
- application season
- recommended method capability
- whether LESS is legally required
- actual machinery / contractor method availability
- sward height / cover if captured
- spreading timing evidence
- method/date provenance

Trace the existing constraints editor and the current post-allocation "add spreading details" workflow.

Identify which items Farm Return should infer/recommend rather than ask the farmer to choose.

---

## J. Regulatory field constraints

Audit whether the system currently has or can derive:

- closed-period status
- county rule
- LESS requirement
- surface-water buffer
- drinking-water buffer
- slope restriction
- field eligibility
- current regulatory rule IDs/evidence versions
- farm-level organic N limits
- applicable available N rules
- P accounting context
- P Index 4 handling

Do not expand the legal engine beyond what exists.

Clearly distinguish:
- implemented
- derivable
- missing
- legally/scientifically unresolved

---

## K. Weather / actionability

Audit:

- historical rainfall used
- forecast rainfall
- Rainfall Window Score
- weather station provenance
- heavy-rain legal flag
- waterlogging
- flooding
- frost
- snow
- trafficability
- actionability evaluated timestamp

Reuse Phase 11A / 11B work.

Confirm that Rainfall Window Score is not represented as a scientific or legal rule.

---

## L. Economics

Audit:

- N replacement price
- P replacement price
- K replacement price
- market-price evidence/provenance
- spreading cost €/ha
- contractor-rate provenance
- transport cost if any
- useful nutrient calculation
- oversupply treatment
- gross replacement value
- net benefit
- finite-resource ranking

Reuse existing economic-opportunity, slurry direct economic assessment, finite-resource allocation and opportunity-ledger work.

Verify whether economic calculations already preserve unknown vs zero.

---

# Farmer-effort audit

This is a critical section.

Inspect the existing UI and identify every point where a farmer is currently asked for information that:

1. Farm Return already has elsewhere;
2. could be safely derived;
3. could be batch-confirmed;
4. could be replaced with a confirmation instead of free entry.

Produce a table:

| Current question/input | Where shown | Why currently asked | Existing evidence elsewhere | Better UX |

Examples to specifically examine:

- manually entering slurry volume per field
- selecting spreading method when the system may know the method available
- entering field area already known from the map
- crop/use questions repeated field-by-field
- previous nutrient history repeated despite recorded jobs
- contractor cost once already declared

---

# Minimal farmer interaction simulation

Using the real current architecture, describe the minimum interaction required for a well-populated farm.

Target ideal:

1. Farmer taps `Build slurry plan`
2. Farm Return silently gathers existing evidence
3. System batch-confirms only genuinely uncertain facts
4. Farm Return produces the recommended plan

Explicitly state:

- number of farmer interactions theoretically achievable now
- what currently prevents that
- which missing data needs genuinely new UI

Do not invent a fake completion percentage.

---

# Output file

Create:

`docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`

The report must contain:

1. Executive summary
2. Full evidence matrix
3. Existing architecture that can be reused
4. Trust/provenance weaknesses
5. Missing derivations
6. Missing external-data integrations
7. Genuine farmer-input gaps
8. Farmer-effort audit
9. Minimum-interaction target workflow
10. Ranked build gaps by dependency, NOT by subjective importance
11. Recommended phased implementation sequence
12. Explicit list of things that must NOT be built until the scientific specification is peer-reviewed

---

# Implementation sequence section

Do not code it, but propose the sequence.

Prefer dependencies such as:

Phase A — evidence/provenance gaps
Phase B — safe derivations from existing data
Phase C — regulatory/farm-context completeness
Phase D — minimal evidence-check UX
Phase E — scientifically approved rate engine
Phase F — finite farm allocation integration
Phase G — farmer override/reallocation UX
Phase H — live end-to-end validation

Do not assume this exact sequence if repository evidence indicates another dependency order. Explain any changes.

---

# Important scientific boundaries

Do NOT resolve these in code:

- current Teagasc 33 m3/ha first-cut example versus 90 kg K/ha spring safeguard
- interpolation between published slurry DM classes
- lab total-N → available-N transformation unless already scientifically frozen
- unresolved young-reseed/yield adjustment interaction
- regulatory neat slurry versus physical diluted slurry beyond currently evidenced logic
- any other source conflict discovered during audit

Record them.

---

# Acceptance criteria

The audit is complete only if:

- every canonical evidence category above is traced against real code/schema;
- no field is marked trustworthy based only on a TypeScript interface;
- persistence and read paths are checked;
- existing provenance architecture is identified and reused;
- the report distinguishes measured, farmer-declared, derived and assumed evidence;
- blocking is separated by RATE / COMPLIANCE / TOTAL_VOLUME / ECONOMIC / ACTIONABILITY;
- the report identifies exactly what the farmer truly needs to enter;
- no product logic is changed;
- no migrations are created;
- no scientific conflicts are silently resolved;
- the report is detailed enough to create later build tasks without repeating this audit.

Verify command: `npm run typecheck && npm run build`