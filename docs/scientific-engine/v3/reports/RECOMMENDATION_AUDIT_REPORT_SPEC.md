# Farm Return — Recommendation Audit Report Specification
## Version 1.0 — mandatory Reports-section architecture

## Objective
Every recommendation, warning, legal stop, estimate and blocked calculation produced by Farm Return must be peer-reviewable.

For every decision the Reports section must answer:

1. What did Farm Return recommend or decide?
2. What exact farm data did it use?
3. Which values were measured, derived, live, or defaulted?
4. What calculation steps were performed, in order?
5. Which Irish scientific source or statutory rule supports each step?
6. Which compliance checks passed, failed, were unknown, or were not applicable?
7. What assumptions and uncertainty affected the result?
8. Which alternatives were considered or suppressed, and why?
9. What information was missing?
10. Can the result be reproduced exactly from the stored snapshot?

A report that only states an action and a short AI explanation is not acceptable.

# 1. Persist the trace when the decision is calculated

Do not reconstruct an old recommendation from current farm data.

At calculation time create an immutable:

`CalculationRun`
→ one or more `DecisionRecord`
→ `InputEvidence`
→ `CalculationStep`
→ `ComplianceCheck`
→ `AssumptionOrGap`
→ `SourceReference`
→ optional `NarrativeExplanation`

The Reports page serialises those stored records.

If an input, source, rule or model changes, create a new calculation run. Historical runs stay unchanged.

# 2. Every decision type is reportable

- ACTION_RECOMMENDATION
- NO_ACTION_RECOMMENDED
- LEGAL_PROHIBITION
- DATA_REQUEST
- ESTIMATE
- WARNING
- BLOCKED_INSUFFICIENT_EVIDENCE
- ALTERNATIVE_SCENARIO

The reviewer must see what Farm Return refused to recommend as well as what it recommended.

# 3. Mandatory report metadata

- report ID/version;
- calculation-run ID;
- farm snapshot ID;
- calculation timestamp/timezone;
- ruleset ID and effective dates;
- scientific-data-pack version;
- source-check date;
- application build/commit SHA where available;
- unit-policy version;
- farm data snapshot time;
- live-API observation/forecast times where used;
- trace SHA-256.

# 4. Mandatory detail for every recommendation or decision

## A — Decision
Show ID, category, scope, action/decision, quantity/unit/basis, timing, state, priority and superseded status.

## B — Deterministic “Why?”
Generate a concise summary from reason codes and the structured calculation. It must agree with the underlying trace.

## C — Input evidence
For every input:
- raw value;
- normalised value;
- unit;
- source kind: LAB / FARMER / MAP / API / IRISH_DEFAULT / DERIVED;
- evidence state;
- recorded date/time;
- freshness;
- override status;
- original pre-override value;
- source document/reference.

## D — Calculation trace
Every numeric/rule transformation gets an ordered row:
- step;
- formula/rule ID;
- description;
- formula expression;
- substituted values;
- result;
- unit;
- rounding rule;
- source IDs.

No hidden arithmetic or “magic” numbers.

## E — Scientific rationale
Show:
- authority;
- source title;
- date/edition;
- table/page/section;
- applicability conditions;
- why it applies to this field/animal;
- limitations on transferability.

## F — Compliance checks
List every relevant check, including passing checks:
- check ID;
- rule;
- evaluated value;
- PASS / FAIL / UNKNOWN / NOT_APPLICABLE;
- consequence;
- instrument;
- effective date.

A hard FAIL must explain why an action was suppressed.

## G — Assumptions/defaults
Show every default, value, reason it was needed, source, whether it can be replaced by measurement, and limitation.

A default can never be labelled measured.

## H — Evidence quality/uncertainty
Use categorical evidence states:
- MEASURED
- DERIVED
- IRISH_MODEL
- IRISH_DEFAULT
- INSUFFICIENT

Do not invent a numeric confidence percentage.

## I — Alternatives
If alternatives were evaluated, show action, effect, why selected/rejected, constraint and cost delta only where defensible.

## J — Missing evidence
For blocked outputs list the missing input, why it is needed, which output is blocked and how to resolve it.

## K — Sources
Clickable/source-linked register with source ID, authority, title, dates, URL, location and current/superseded status.

## L — Peer review
Store separately:
- UNREVIEWED
- VERIFIED
- QUESTIONED
- REJECTED
- SUPERSEDED

Capture reviewer note, timestamp, issue category and follow-up. Review never mutates the historical calculation.

# 5. Reports-page UX

Overview KPIs:
- all decisions;
- actionable recommendations;
- legal stops;
- estimates;
- blocked results;
- outputs using defaults;
- peer-review counts.

Filters:
field, animal group, module, date, decision type, evidence quality, reviewer status, ruleset/source version.

Every recommendation needs a `Why? / Audit trail` drilldown.

Add run comparison:
- input changes;
- rules/source changes;
- output delta;
- deterministic reason for the delta.

# 6. Exports

Keep existing simple CSV reports, and add:

## Recommendation Audit Report
Human-readable print/PDF-ready view generated from the trace.

## Audit Data Pack (.zip)
- run_metadata.csv
- recommendations.csv
- recommendation_inputs.csv
- calculation_steps.csv
- compliance_checks.csv
- assumptions_and_gaps.csv
- source_references.csv
- peer_review.csv

All tables join through `calculation_run_id` and `recommendation_id`.

## JSON
Exact machine-readable trace for debugging/reproduction.

# 7. Reproducibility fingerprint

Calculate SHA-256 over canonicalised:
- normalised inputs;
- ruleset/model versions;
- source-table versions;
- unit-conversion version;
- calculation-code version.

This is a reproducibility/change-detection fingerprint, not a legal digital signature.

# 8. LLM boundary

The structured deterministic trace is authoritative.

If an LLM creates a narrative:
- store separately;
- record model/version;
- label NARRATIVE_EXPLANATION;
- it cannot introduce a new coefficient, legal rule, source or calculation;
- a reviewer must be able to audit without the narrative.

# 9. Production release gate

A production numeric recommendation is invalid if missing:
- decision/recommendation ID;
- calculation run ID;
- input provenance;
- calculation/rule trace;
- applicable compliance checks;
- source IDs;
- ruleset/model version;
- evidence-state labels.

`INSUFFICIENT_EVIDENCE` is a valid result. An unexplained number is not.
