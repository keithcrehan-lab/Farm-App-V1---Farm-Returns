# Farm Return — Pre-Code Adversarial Scientific & Calculation Audit
## Version 1.0 — 2026-08-26

## Executive conclusion

Version 2 was stress-tested as a **whole decision system**, not just as a library of formulas.

The audit contains:

- **20 realistic farm/system scenarios**
- **180 golden end-to-end tests**
- **18 material adversarial findings**
- **24 report-specific audit tests**
- new hard gates for commonage, LESS, soiled water, concentrate-feed P, seasonal concentrate CP, silage destination, fertiliser-product admissibility and local buffer overrides
- a mandatory immutable recommendation-audit trace

The purpose of these tests is to catch cases where an individual formula can be correct while the final recommendation is still wrong because another module, legal rule, input basis or source condition was missed.

---

# 1. Highest-risk failures found before implementation

## 1.1 Commonage cannot use ordinary grassland fertiliser logic
Current rules impose separate commonage controls. Farm Return therefore needs a field-level commonage attribute and a hard compliance gate before chemical-fertiliser recommendations.

**Failure prevented:** a scientifically plausible but legally prohibited chemical-fertiliser recommendation.

## 1.2 Slurry application method is part of the calculation context
LOW EMISSION SLURRY SPREADING requirements apply in specified current statutory situations. The same slurry nutrient-plan calculation cannot be detached from whether the planned application method is legally admissible.

**Failure prevented:** showing a nutrient value/recommendation that assumes LESS while the proposed method is non-compliant.

## 1.3 Soiled water is a rolling-window problem
A proposed soiled-water event must be checked against prior application in the statutory rolling period, not assessed in isolation.

**Failure prevented:** approving a single event that causes the cumulative application limit to be exceeded.

## 1.4 Feed planning can alter nutrient compliance
Concentrate feed can contribute statutory available phosphorus above the defined threshold. Feed optimisation therefore cannot be a stand-alone livestock module; it must feed the farm P compliance ledger.

**Failure prevented:** overstating remaining field P allowance because purchased feed P was ignored.

## 1.5 Feed optimisation also has a legal protein gate
The current seasonal crude-protein limit for relevant cattle at grass must be checked before a feed option can be described as compliant.

**Failure prevented:** a mathematically cheapest ration that is not legally admissible.

## 1.6 “Silage” needs destination context
A silage field intended for farm feed and a crop cut for sale can enter different current statutory N/P routes subject to explicit conditions/evidence.

Required field attribute:
`own_feed / sale / mixed / unknown`.

**Failure prevented:** selecting the wrong statutory N/P ceiling because both fields are simply labelled `silage`.

## 1.7 Fertiliser product matching needs formulation metadata
N-P-K analysis alone is insufficient for every current legal product route. Formulation, physical form, ureic-N and inhibitor status may matter.

**Failure prevented:** optimising to a product that satisfies the nutrient arithmetic but fails the applicable legal product condition.

## 1.8 National water buffers are not always the whole answer
Where an authoritative local buffer determination exists, it can supersede the national baseline for that water source.

**Failure prevented:** describing the national minimum as definitive compliance where a local restriction may apply.

---

# 2. Why 180 “golden” tests are different from ordinary unit tests

A unit test might verify:

`10 m3 cattle slurry × 2.4 kg N/m3 = 24 kg total N`.

A golden farm test verifies the whole decision chain:

1. correct field and manure context selected;
2. correct current ruleset resolved;
3. agronomic and statutory ledgers remain separate;
4. application method is legally permitted;
5. P index is current/valid;
6. buffer/ground/weather conditions pass;
7. remaining N/P allowance is calculated;
8. output units are correct;
9. recommendation is emitted or suppressed;
10. the report records every reason and source.

That is the level at which a farmer-facing decision can be trusted.

---

# 3. Golden test coverage

`validation/golden_farm_tests.csv` contains 180 tests across:

1. Morgan-P boundaries and literal source ambiguity
2. soil-test ageing/georeferencing/P4 persistence
3. dairy excretion and high-stock eligibility
4. P build-up eligibility
5. milking-platform boundaries
6. dual slurry ledgers and LESS
7. Zone A calendar boundaries
8. Zone B calendar boundaries
9. Zone C calendar boundaries
10. commonage/buffers/local override
11. mixed-herd winter fodder
12. silage own-feed versus sale
13. DairyBeef DMD feeding
14. twin-ewe feeding
15. dairy clover-N
16. drystock/red-clover scope
17. concentrate CP/P compliance
18. hold/sell economics
19. report/peer-review integrity
20. cross-module/version regression

The tests intentionally include:
- exact boundaries;
- one-step-over/under cases;
- missing data;
- wrong-scope attempts;
- stale data;
- source-version changes;
- unit mismatches;
- legal/advisory conflicts;
- overrides;
- blocked calculations.

---

# 4. Release philosophy

The application must be allowed to say:

`INSUFFICIENT_EVIDENCE`

`UNKNOWN`

`NOT_APPLICABLE`

`LEGAL_PROHIBITION`

Those are scientifically stronger outputs than filling a UI card with an invented number.

A calculation may be mathematically correct and still not be releaseable if:
- its source is stale;
- its eligibility condition is unproven;
- the farm input is missing;
- the legal route is wrong;
- its units/basis conflict;
- its scope differs from the source population.

---

# 5. Reports are now a scientific-control feature

The Reports section is not just an export function.

A production recommendation is valid only if an immutable trace exists showing:

**input → normalisation → classification → agronomic calculation → compliance checks → legal cap → alternatives → final decision → sources**

That trace is created **at calculation time**.

Do not regenerate the “why” later from current farm data, because:
- the soil test may have changed;
- the law may have changed;
- the source table may have changed;
- the farmer may have edited an assumption;
- the code itself may have changed.

Historical recommendations must remain reproducible using their original snapshot.

---

# 6. Peer-review workflow

Every decision receives a reviewer status:

- UNREVIEWED
- VERIFIED
- QUESTIONED
- REJECTED
- SUPERSEDED

A reviewer note is appended to the audit record. It never edits the original calculation.

This allows the owner/agronomist/scientific reviewer to:
- challenge a coefficient;
- flag a source interpretation;
- reject a recommendation;
- request a new measurement;
- compare the new calculation run against the original.

---

# 7. What remains intentionally fail-closed

The audit does not claim to remove uncertainty that inherently depends on external/farm-specific evidence.

Examples:
- a local authority buffer override that has not been sourced;
- an unsupported animal nutrition class;
- an unverified nitrates-derogation authorisation;
- an exact ration recommendation without relevant forage analysis;
- a fertiliser product with unknown inhibitor/formulation status;
- a sell/hold decision without current animal/farm data;
- future statutory amendments.

These are not hidden gaps. They are explicit release gates.

---

# 8. Required pre-merge evidence from Claude

Claude must demonstrate, before merge:

1. all supplied low-level acceptance tests pass;
2. all **180 golden farm tests** are implemented and pass;
3. all **24 report-audit tests** pass;
4. every numeric production output has a source ID and calculation trace;
5. every hard legal failure suppresses contradictory action;
6. every unsupported route fails closed;
7. historical report traces are immutable;
8. agronomic and compliance nutrient ledgers remain separate;
9. no LLM prose can alter calculation truth;
10. a sample audit report exists for:
   - one valid actionable recommendation;
   - one legal prohibition;
   - one blocked insufficient-evidence decision.

Only then should the recommendation engine be considered ready for the next scientific peer-review round.
