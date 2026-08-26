# Farm Return Scientific Calculation Pack V3 — Pre-Code Adversarial Audit
**Evidence/audit date:** 2026-08-26

Use **V3 instead of V2** before handing the work to Claude.

## Start here
1. `ADVERSARIAL_AUDIT_REPORT.md`
2. `FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md`
3. `reports/RECOMMENDATION_AUDIT_REPORT_SPEC.md`
4. `validation/golden_farm_tests.csv`
5. `CLAUDE_CODE_IMPLEMENTATION_PROMPT.md`

## Validation coverage
- 20 end-to-end farm scenarios
- 180 golden farm tests
- 18 adversarial findings
- 24 report-specific audit tests
- low-level V2 statutory/scientific acceptance tests retained

## Core governance rule
Every recommendation, legal stop, estimate and blocked calculation must expose:

`input -> normalisation -> calculation -> scientific evidence -> legal checks -> final decision`

The trace is persisted when the calculation is made and remains available for peer review.

Unsupported does not mean guessed. It means **fail closed**.
