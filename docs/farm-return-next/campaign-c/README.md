# Campaign C — slurry science freeze and peer-review pack

Task `campaign-c-slurry-science-freeze-v2-20260928`, base
`29f787a8b9bc1a30613dc621e221ad79651c315f`. Campaign B remains frozen at `b24c266`.

**Status: STOPPED FOR HUMAN SCIENTIFIC REVIEW.**

- Rule set `slurry-agronomy-ie-2026-v1` is DRAFT.
- Production implementation is **not authorised**.
- Core open items: CONF-02 (the 90 kg K spring limit), CONF-03 (organic P/K share on
  Index 1/2), CONF-01 (LESS P 0.5 vs 0.6 kg/m³), and GAP-01 (the rate objective).
- A pre-existing production divergence, RISK-01, is a priority blocker.

## For reviewers

| Reviewer | Start with | Then |
|---|---|---|
| Teagasc adviser / agronomist | [CONFLICTS.md](CONFLICTS.md): the questions you are asked to rule on | [SOURCES_AND_CLAIMS.md](SOURCES_AND_CLAIMS.md) (every number with page/table locator), [SCIENCE_FREEZE.md](SCIENCE_FREEZE.md) §2–§7 |
| Agricultural scientist | [SCIENCE_FREEZE.md](SCIENCE_FREEZE.md) §4–§10 (matrices, uncertainty) | [REFERENCE_CASES.md](REFERENCE_CASES.md) |
| Software auditor | [LIFECYCLE.md](LIFECYCLE.md), [SCIENCE_FREEZE.md](SCIENCE_FREEZE.md) §1, §13 | the JSON and `src/domain/campaign-c-reference-cases.test.ts` |

No application code needs to be read to challenge a number.

## Required output map

| # | Output | Location |
|---|---|---|
| 1–2 | Supported scenario, exclusions | SCIENCE_FREEZE §2–3 |
| 3–4 | Source register, claims/locators | SOURCES_AND_CLAIMS |
| 5–8 | Nutrient matrix, DM rules, method/timing, P/K matrix | SCIENCE_FREEZE §4–6 |
| 9–10 | Prior inputs, uncertainty | SCIENCE_FREEZE §7, §10 |
| 11 | Conflicts | CONFLICTS |
| 12 | Status taxonomy | SCIENCE_FREEZE §9 |
| 13 | Reference cases | REFERENCE_CASES + JSON |
| 14–19 | Source, claim, scientific/regulatory rule-set, override, provenance schemas | LIFECYCLE §2–6 |
| 20–22 | Update workflow, correction workflow, reference-case versioning | LIFECYCLE §7–8, REFERENCE_CASES "Versioning" |
| 23–26 | Effective dates, change detection, archive, cadence | LIFECYCLE §9–11 |
| 27 | Documentation structure | LIFECYCLE §12 |
| 28–30 | Existing architecture, gaps, production risks | SCIENCE_FREEZE §11–13 |
| 31 | May implementation begin? | SCIENCE_FREEZE §15: **No** |
