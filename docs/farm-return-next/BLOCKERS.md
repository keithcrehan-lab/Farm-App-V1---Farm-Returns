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
| CC-B2 | `nutrients.ts` spring/summer LESS credit (`resolveAvailableSlurryNutrients`) | PRIORITY, pre-existing, not fixed (STOP 7 cannot be excluded). The Index 1/2 P −50% / K −10% note in the cited Teagasc table is not applied, so P/K credit is overstated on low-index fields. It reaches Nutrients, the Scientific Evidence Report and What Matters economics. Live exposure is unverified. Fixing it changes shipped advice and needs product-owner triage and an implementation-correction record | [campaign-c/SCIENCE_FREEZE.md](campaign-c/SCIENCE_FREEZE.md) §13 RISK-01 |
| CC-B3 | Campaign C lifecycle persistence | DEFERRED: recommendation records and rule-set storage need a separately authorised migration | [campaign-c/LIFECYCLE.md](campaign-c/LIFECYCLE.md) §6, §12 |
