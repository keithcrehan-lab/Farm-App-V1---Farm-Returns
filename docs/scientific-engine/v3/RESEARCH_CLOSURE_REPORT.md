# Research Closure Report — Version 2
**Checked:** 2026-08-26

## What changed before VS Code upload

### Closed / materially improved
- Whole-farm basic fodder demand: now has current 26-Aug-2026 Teagasc coefficients for six major livestock classes.
- Clover N: current 2026 dairy and drystock strategy tables are included for exact supported scenarios.
- P build-up: Article17(6) eligibility conditions are explicit rather than leaving the feature blocked.
- Dairy statutory N excretion: Table7a crude-protein election values and eligibility behaviour added.
- Milking platform: current amended Table14 distribution table added.
- Statutory GSR: formula and “before exports” definition added.
- Soil-test expiry: corrected to preserve old P Index 4 result.
- Soil-test georeference effective date: corrected to “issued after 14 September 2025”.
- Exceptional spreading: replaced a vague blocker with a dynamic authoritative-event registry architecture.
- Rule changes: effective-dated rules and future-rule table added.
- Feed unit safety: hard gate prevents fresh-weight/DM mixing.
- No-score policy: unvalidated 0–100 scientific probability removed from release path.

### Newly discovered and guarded
- Literal statutory/current published P-index micro-gap at 8.01/10.01.
- Full nitrates-derogation authorisation/Schedule-5 route requires a dedicated complete module; simple toggles are prohibited.
- Clover strategy rows are discrete; interpolation is not evidence-backed.
- Old Green Book statutory tables must never supply 2026 compliance constants.

## Bottom line
The pack is now suitable to give Claude **before implementation**, because the unresolved items are explicit, machine-readable fail-closed conditions rather than hidden assumptions.

The remaining blocked items are not missing homework that Claude should guess. They require:
- farm measurements/intent;
- a complete external authorisation state;
- a future legal clarification/amendment;
- or an additional validated scientific model.

Claude must leave those blocked until the evidence arrives.
