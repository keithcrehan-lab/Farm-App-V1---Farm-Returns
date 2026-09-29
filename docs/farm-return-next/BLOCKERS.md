# Active constraints and blocker index

## Current phase

- Campaign B is frozen at `b24c266`. Campaign C (base `29f787a`) is in its science freeze, which is **stopped for human scientific review** ([campaign-c/README.md](campaign-c/README.md)). Campaign C production implementation is not authorised.
- Campaign B Dev deployment remains outstanding; exact migration state and regulatory STOP boundaries: `SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md` §15. No migration is authorised here.
- Independent audit availability and all unresolved Critical/High findings block task closure. Never treat unavailable review as a pass.

## Domain-specific constraints

Before product/domain work, search [BLOCKER_INDEX.md](BLOCKER_INDEX.md) by the affected
area/symbol and read matching original sections and later updates. Its conservative entries
are not a claim that historical gaps remain current, and none was silently declared resolved.
The [complete historical record](history/BLOCKERS-through-b24c266.md) is byte-identical to
b24c266; explicitly resolved entries are in [the resolved index](history/BLOCKERS-index.md).
Harness-only work does not require that domain history. New active blockers go here with
ID, area, status and evidence; move resolved entries to history with a reference.

## Active blockers

| ID | Area | Status | Evidence |
|---|---|---|---|
| CC-B1 | Campaign C slurry agronomy: core v1 rate rule | BLOCKED_HUMAN (scientific review). CONF-02 (90 kg K spring limit vs slurry K), CONF-03 (Index 1/2 organic share), CONF-01 (LESS P 0.5 vs 0.6 kg/m³), GAP-01 (rate objective). STOP conditions 1, 2 and 8 | [campaign-c/CONFLICTS.md](campaign-c/CONFLICTS.md) |
| CC-B2 | `nutrients.ts` spring/summer LESS credit (`resolveAvailableSlurryNutrients`) | **RESOLVED 2026-09-29** (task `cc-b2-less-low-index-pk-correction-20260929`, base `d38561c`, final audited commit `65bdedb`). Original issue (RISK-01, pre-existing): the LESS nutrient credit did not apply the Index 1/2 note in its cited Teagasc table (P −50%, K −10%), so slurry P/K credit was overstated on low-index fields and reached Nutrients, the Scientific Evidence Report and What Matters economics. Correction: LESS branches apply P × 0.50 (P Index 1/2) and K × 0.90 (K Index 1/2); N unchanged; `CONFIRMED_PRODUCTION_PATH`; live exposure UNKNOWN. Implementation correction recorded by engine version `nutrient_engine_v1.0.0` (affected) → `nutrient_engine_v1.1.0` (corrected); stored v1.0.0 records are not rewritten. Audit findings F001 (missing index gave an OK placeholder-adjusted LESS assessment), F002 (engine version unchanged), F003 (missing P/K index erased the LESS N credit) and F004 (card showed the unsupported-DM explanation for a missing index) remediated. Final task audit `audit-20260929T101524Z-8042` over `d38561c..65bdedb`: 0 Critical / 0 High / 0 Medium / 0 Low. Does not approve Campaign C or resolve CONF-01..04 / GAP-01..08 | [campaign-c/SCIENCE_FREEZE.md](campaign-c/SCIENCE_FREEZE.md) §13 RISK-01; [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) |
| CC-B3 | Campaign C lifecycle persistence | DEFERRED: recommendation records and rule-set storage need a separately authorised migration | [campaign-c/LIFECYCLE.md](campaign-c/LIFECYCLE.md) §6, §12 |
| CC-B4 | `nutrients.ts` splashplate (Table 9-8) credit with a missing soil P/K index | OPEN (follow-up, pre-existing). When a field's soil P or K index is missing, `calculateNutrientPlan` substitutes an Index 1 stand-in and the splashplate path (`slurryAvailableKgHa`) may still reduce slurry P/K by the Index 1/2 factors and report an OK assessment. This behaviour pre-dates CC-B2 and was not introduced by the CC-B2 fix, which deliberately left Table 9-8 unchanged; CC-B2's F001 fail-closed handling covers the LESS path only. Needs its own scoped task | CC-B2 fix notes (`IMPLEMENTATION_LOG.md`); `nutrients.ts` `calculateNutrientPlan` |
