# Task: CC-B2 — correct low-index slurry P/K availability in existing LESS nutrient credit

Starting HEAD: d38561cef16e0e8cf90d193af9830065b214b59c

## Goal

Correct the pre-existing production divergence recorded as `CC-B2` / `RISK-01`.

For cattle slurry applied by LESS, the existing production nutrient-credit path does not
apply the already-recorded low-soil-index P/K availability adjustments for Index 1/2 soils.

This is a narrowly scoped correction of existing production behaviour.

It is NOT Campaign C science implementation.

Campaign C remains DRAFT and blocked for human scientific review.

Do not resolve or implement:

- CONF-01
- CONF-02
- CONF-03
- CONF-04
- GAP-01 through GAP-08

## Evidence boundary

Use only scientific evidence already recorded and traceable in the repository.

Relevant evidence includes:

- `docs/scientific-engine/v3/advisory_teagasc/cattle_slurry_available_npk_spring_LESS.csv`
- `docs/scientific-engine/v3/reference_greenbook_2020/`
- `docs/farm-return-next/campaign-c/SOURCES_AND_CLAIMS.md`
- `docs/farm-return-next/campaign-c/SCIENCE_FREEZE.md`
- `docs/farm-return-next/campaign-c/CONFLICTS.md`
- `docs/farm-return-next/BLOCKERS.md`
- `docs/evidence-register.md`

Do not claim fresh external retrieval, source-document verification, new fingerprints or
new scientific approval.

## Required repository trace

Before editing:

1. locate `resolveAvailableSlurryNutrients`;
2. locate `SPRING_LESS_SLURRY_TABLE`;
3. locate `SUMMER_LESS_SLURRY_TABLE`;
4. locate `soilIndexAdjustmentApplied`;
5. trace the relevant P and K soil-index inputs into the calculation;
6. identify direct callers;
7. identify existing tests for spring LESS, summer LESS and soil P/K indices;
8. establish from repository evidence whether the result reaches Nutrients, the Scientific
   Evidence Report or What Matters economics;
9. do not infer live-user exposure without runtime evidence.

## Frozen correction

For an existing supported cattle-slurry LESS nutrient-credit calculation:

### P availability

If soil P Index is 1 or 2:

`available P = existing LESS P value × 0.50`

If soil P Index is 3 or 4:

`available P = existing LESS P value`

### K availability

If soil K Index is 1 or 2:

`available K = existing LESS K value × 0.90`

If soil K Index is 3 or 4:

`available K = existing LESS K value`

### N availability

Do not alter N as part of CC-B2.

### Independence

P adjustment depends only on P Index.

K adjustment depends only on K Index.

Do not couple the two indices.

### Unknowns

Do not convert an unknown soil index to zero.

Do not silently assume a high or low index.

Preserve existing fail-closed / unknown semantics unless a narrowly scoped correction is
strictly necessary to fix CC-B2.

## Numerical regression example

For an existing LESS row:

- N = 1.0 kg/m³
- P = 0.5 kg/m³
- K = 3.5 kg/m³

Expected:

P1 / K1:
- N = 1.0
- P = 0.25
- K = 3.15

P1 / K3:
- N = 1.0
- P = 0.25
- K = 3.5

P3 / K1:
- N = 1.0
- P = 0.5
- K = 3.15

P3 / K3:
- N = 1.0
- P = 0.5
- K = 3.5

Do not introduce arbitrary rounding inside the scientific calculation.

## Required tests

Add or update deterministic regression tests proving:

1. spring LESS P Index 1 => 50% P;
2. spring LESS P Index 2 => 50% P;
3. spring LESS P Index 3 => unchanged P;
4. spring LESS P Index 4 => unchanged P in this availability calculation;
5. spring LESS K Index 1 => 90% K;
6. spring LESS K Index 2 => 90% K;
7. spring LESS K Index 3 => unchanged K;
8. spring LESS K Index 4 => unchanged K in this availability calculation;
9. mixed P/K indices apply independently;
10. N is unchanged;
11. supported summer LESS applies the equivalent P/K adjustments;
12. existing Index 3/4 results remain unchanged;
13. UNKNOWN is not converted to zero;
14. statutory/regulatory quantities are unaffected.

Where practical, demonstrate CC-B2 with a regression assertion that would fail against the
pre-fix implementation.

## Provenance metadata

Where the result carries `soilIndexAdjustmentApplied` or equivalent metadata, make it
truthfully reflect what happened.

Do not fabricate source provenance.

Do not mark Campaign C approved.

## Production reachability

Classify the corrected code path from repository evidence as exactly one of:

- `CONFIRMED_PRODUCTION_PATH`
- `NOT_PRODUCTION_REACHABLE`
- `REACHABILITY_UNCERTAIN`

If production reachability is confirmed, document the call path.

Live deployment/user exposure must remain UNKNOWN unless runtime evidence proves it.

## Documentation

Update only the minimum current-state documentation needed.

Expected areas:

- `docs/farm-return-next/BLOCKERS.md`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`
- `docs/farm-return-next/BUILD_STATE.json`
- relevant evidence/audit documentation only if necessary

If CC-B2 is corrected and independently verified:

- mark CC-B2 resolved;
- retain an auditable historical reference;
- do not close CC-B1;
- do not close CC-B3;
- do not mark Campaign C APPROVED.

## Prohibited work

Do not change or implement:

- Campaign C rate selection;
- CONF-01 0.5 vs 0.6 kg/m³ resolution;
- CONF-02 90 kg K/ha interpretation;
- CONF-03 organic share caps;
- CONF-04 timing interpretation;
- GAP-01 rate objective;
- GAP-02 through GAP-08;
- slurry DM interpolation or snapping;
- new DM classes;
- hydrometer calibration;
- first-cut yield-model expansion;
- prior-input credit-window policy;
- whole-farm slurry allocation;
- What Matters ranking policy;
- Campaign B regulatory behaviour;
- statutory NAP calculations;
- regulatory neat-slurry quantities;
- database migrations;
- UI redesign;
- production deployment.

## STOP conditions

Return `BUILD_RESULT: BLOCKED <reason>` if:

1. fixing CC-B2 requires resolving any Campaign C evidence conflict or GAP;
2. Campaign B regulatory behaviour would need to change;
3. a database migration is required;
4. P/K indices are unavailable and supplying them requires architectural expansion;
5. existing code intentionally implements a different traceable scientific rule;
6. the 50% P / 90% K availability factors prove internally conflicted;
7. the fix would silently broaden existing LESS applicability;
8. Campaign C DRAFT rules would have to change.

## Completion criteria

Complete only when:

- CC-B2 is reproduced or demonstrated against the pre-fix behaviour;
- the smallest valid production correction is implemented;
- spring LESS low-index P/K adjustment is correct;
- supported summer LESS low-index P/K adjustment is correct;
- N remains unchanged;
- P and K indices act independently;
- Index 3/4 behaviour remains unchanged;
- UNKNOWN semantics remain intact;
- provenance metadata is truthful;
- targeted tests pass;
- verification passes;
- Campaign C open science remains untouched;
- no migration is added;
- no recommendation-rate algorithm is added;
- documentation accurately records the correction.

## Audit flow

After a successful build:

`./scripts/agent-audit --primary`

For any required narrow correction:

`./scripts/agent-fix`

then:

`./scripts/agent-audit --remediation <finding-id>`

and finally:

`./scripts/agent-audit --final`

Do not run a baseline-wide historical audit.

Verify command: `npm run typecheck && npm run build`
