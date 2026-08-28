# Claude Code — Farm Return Scientific Engine V3 Pre-Code Audit Implementation Prompt

DO NOT begin by changing UI components.

This V3 pack supersedes V2 wherever V3 adds or tightens a rule.

Read in order:
1. `ADVERSARIAL_AUDIT_REPORT.md`
2. `FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md`
3. `reports/RECOMMENDATION_AUDIT_REPORT_SPEC.md`
4. `validation/adversarial_findings.csv`
5. `validation/golden_farm_scenario_register.csv`
6. `validation/golden_farm_tests.csv`
7. `implementation/required_input_fields.csv`
8. `implementation/calculation_contracts.csv`
9. `implementation/production_release_gate.csv`
10. `implementation/gap_register.csv`
11. every file in `rules_statutory/`
12. relevant files in `advisory_teagasc/`
13. `sources/source_register.csv`
14. `reports/report_acceptance_tests.csv`

## Absolute rules

- Do not invent, interpolate, round away or silently default an agricultural/legal coefficient.
- Later statutory amendments override the base instrument.
- Agronomic and compliance nutrient ledgers remain separate.
- LLMs explain completed structured results; they do not calculate them.
- Missing evidence must return a structured fail-closed state.
- Exact lime t/ha from pH alone is forbidden.
- Universal `DMI = 2% liveweight` is forbidden.
- Fresh-weight feed and dry matter cannot be mixed.
- A legal spreading failure cannot be overridden by an opportunity score.
- Favourable weather cannot create an exceptional statutory opening.
- P build-up cannot use the higher table until all eligibility conditions are proven.
- A derogation toggle does not grant a higher organic-N limit.
- Clover tables are scenario-specific and cannot be interpolated without validated evidence.
- Literal P-index boundary ambiguity remains explicit.
- Legacy Green Book statutory tables cannot supply current legal values.
- Commonage cannot use the ordinary grassland fertiliser route.
- Applicable LESS rules must be checked before slurry recommendation.
- Feed optimiser must pass applicable concentrate crude-protein compliance.
- Concentrate-feed phosphorus must enter the statutory P ledger when the current threshold is exceeded.
- Special silage-for-sale N/P tables require destination and evidence eligibility.
- Fertiliser product optimisation requires formulation/inhibitor metadata where the legal route depends on it.
- Local buffer overrides must supersede national baseline where verified.
- Every production decision must have an immutable audit trace.

## Mandatory engineering sequence

A. Inventory all existing calculation code and every hard-coded numeric constant.

B. Map every existing recommendation to:
- calculation contract;
- source ID;
- ruleset/model version;
- required input schema.

C. Disable/fail-close any recommendation without a supported contract.

D. Implement current statutory ruleset resolution before agronomic optimisation.

E. Implement V3 hard gates:
- commonage;
- LESS;
- soiled water;
- feed CP;
- concentrate P;
- silage destination;
- fertiliser-product admissibility;
- local buffer override state.

F. Implement immutable:
`CalculationRun -> DecisionRecord -> InputEvidence -> CalculationStep -> ComplianceCheck -> Assumption/Gap -> SourceReference`

G. Make the Reports page consume these stored trace objects.

H. Preserve simple existing CSV exports but add:
- Recommendation Audit Report;
- audit relational CSV ZIP;
- exact JSON trace.

I. Implement all 180 golden farm tests as automated fixtures.

J. Implement all 24 report acceptance tests.

K. Run all existing project tests plus all scientific/regulatory tests.

## Reports-section mandatory output

For EVERY decision, including blocked/no-action:
- exact action/decision;
- scope;
- all raw and normalised inputs;
- units;
- timestamps/freshness;
- evidence state;
- overrides and original values;
- ordered formula/rule steps;
- source IDs and table/page/section where available;
- all applicable legal checks;
- assumptions/defaults;
- uncertainty/data gaps;
- rejected alternatives and reason;
- ruleset/model/code versions;
- peer-review status;
- SHA-256 trace fingerprint.

Do not reconstruct the rationale later using an LLM.

## Completion gate

Do not call a calculation complete unless:
- every numeric constant has a source ID;
- effective dates/amendment precedence are tested;
- units are explicit;
- provenance is returned;
- blocked routes fail closed;
- all low-level acceptance tests pass;
- all 180 golden farm tests pass;
- all 24 report-audit tests pass;
- all existing project tests pass;
- no code path silently upgrades ESTIMATED/UNKNOWN to MEASURED/LEGAL.

## Required completion report

List:
- files changed;
- constants removed/replaced;
- calculation IDs implemented;
- golden-test pass count;
- report-test pass count;
- remaining blocked routes;
- any new ambiguity.

Include concrete sample Recommendation Audit Reports for:
1. a normal actionable nutrient recommendation;
2. a legal spreading prohibition;
3. a blocked insufficient-evidence feed recommendation.

Do not push or merge until this scientific review is complete.
