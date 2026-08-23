# Farm Return

A free, premium-quality Irish farm management and financial intelligence
platform. See `docs/product-requirements.md` for the full product spec and
`CLAUDE.md` for the build rules — start there before changing anything.

## Development

```bash
npm install
npm run dev          # http://localhost:3000 (this repo's tooling defaults to -p 3100, see scripts below)
npm run typecheck
npm run lint
npm run test          # Vitest unit tests

# Manual QA (CLAUDE.md § Screen workflow)
npm run screenshot -- <url> <outDir>   # Playwright mobile+desktop screenshots
npm run check-overflow -- <url>        # flags elements wider than the viewport

# Automated visual regression (locks in the current, already-reviewed render)
npm run test:visual          # compare every screen against tests/e2e/visual.spec.ts-snapshots/
npm run test:visual:update   # re-baseline after a deliberate, reviewed visual change
```

`npm run test:visual` starts its own dev server on port 3100 if one isn't
already running. A failure means a code change altered an approved screen's
render — either fix the regression, or if the change is deliberate and has
been reviewed against `design/reference/`, re-baseline with
`test:visual:update` and commit the updated PNGs alongside the code change.

## Status

**Phase 1 — pixel-accurate UI prototype complete.** All 15 screens in
CLAUDE.md's build order are built on mock data with full navigation:
Dashboard, Fields, Soil, Livestock (+ Livestock Economics), Housing, Silage,
Nutrients, Spreading, Finance, Feed Optimiser, Input Planner, Market
Prices, Reports, Settings. Each was reviewed against its reference image in
`design/reference/` at both mobile and desktop viewports per `CLAUDE.md` §
Screen workflow, and the whole set is now locked in by the Playwright
visual regression suite above.

**Phase 2 — central farm data model complete.** `src/store/farm-store.tsx`
holds Farm/Field/Livestock/Housing/SlurryAllocation state behind a
Context+useState store (`FarmProvider`, mounted once in the root layout),
seeded from `src/data/mock-farm.ts` and persisted to `localStorage` with an
SSR-safe hydration pattern. `src/domain/provenance.ts`'s `farmerAdjust()`/
`verify()` implement "provenance is permanent" — an edit always chains the
prior `TrackedValue` under `previous` rather than overwriting it (unit
tested in `src/domain/provenance.test.ts`). Four write flows prove
enter-once end-to-end: Add Field (Fields page), Add Livestock Group
(Livestock page), Soil P/K index edit (Soil + Fertiliser Plan pages share
the same TrackedValue), and Farm Profile edit (Settings page, reflected
immediately in the sidebar/greeting). Domain-engine/external outputs
(nutrient plans, silage plans, spreading scores, finance lines, market
prices, alerts, timeline, ...) remain static `mock-farm.ts` exports — that
data starts arriving in Phase 3 onward.

**Phase 3 — soil/nutrient MVP: nutrient requirement engine live.**
`src/domain/nutrients.ts` (`nutrient_engine_v1.0.0`) replaces the static
mock nutrient plan with a real, sourced calculation — P/K index
classification, build-up/maintenance for grazing and silage, suckler-system
N advice, cattle-slurry organic offset, and the NAP nutrient ceilings —
built directly from named, numbered tables in Teagasc's *Major & Micro
Nutrient Advice for Productive Agricultural Crops* (5th Ed., 2020, the
"Green Book"); see `docs/evidence-register.md` for the full table-by-table
citation. 39 unit tests lock the exact published table values (the "known
test cases independently validated" exit gate). The Nutrients (Fertiliser
Plan) screen now computes a live plan for any of the farm's fields via a
field selector, reading current P/K assumptions and slurry allocation from
the Phase 2 store — so a farmer-adjusted soil index immediately changes the
computed requirement, not just the displayed assumption.

**Known gap, not yet closed:** the two NAP regulatory-ceiling tables used
(available N and P maximums) cite "S.I. 605 of 2017" in the source
document, which predates the S.I. No. 588/2025 regulation already in the
evidence register (effective 1 Jan 2026). Until re-verified against
588/2025's own schedule, those ceiling values are marked
`regulatory: "planning_advice"`, never `"compliance_value"` — see the
caution block at the top of `src/domain/nutrients.ts`.

**Verified soil test flow live.** "Add soil test" on the Soil page opens a
form (sample date, lab, sample ref, P/K in mg/l, pH, optional lime
requirement/organic matter %); saving it classifies P/K index from the
mg/l values via the same Green Book tables (6-4/6-5) and calls
`verify()` — a distinct provenance status (`verified`, sourced to the lab)
from a farmer's own `farmer_adjusted` tap, per `docs/data-model.md`'s
provenance rules. That closes out Phase 3's PRD line in full: "Irish soil
overlay, editable P/K assumptions, tests, slurry offset, product/cost
calculation."

Also fixed along the way: a real (if usually invisible) hydration-mismatch
bug in `MobileGreetingHeader` — its time-of-day greeting read
`new Date().getHours()` directly during render, which can differ between
server and client. Now seeded with a neutral value and swapped in a
client-only effect post-mount, the same pattern the Phase 2 store uses for
localStorage. Caught because the visual regression suite's clock is now
frozen (`tests/e2e/visual.spec.ts`) so the suite no longer flakes when run
in a different hour band than its baselines were captured in.

**Phase 4 — finance aggregation underway.** `src/domain/finance.ts`
(`finance_engine_v1.0.0`) computes the farm's first genuinely live
whole-farm total: chemical fertiliser spend, summed from the real
`nutrients.ts` engine's per-field cost across every field — grazing and
silage alike, using the current herd size (which drives every field's
stocking-rate-dependent N requirement). It's wired into both the Dashboard
and Finance screens, so they always agree, and both update immediately
when a field's soil assumptions, slurry allocation, or the herd changes —
proven with an end-to-end check: lowering one field's P index on the Soil
page raised the figure on both screens by the same amount, live. That's
Phase 4's exit gate, demonstrated for the one whole-farm number this
session had real, sourced inputs for.

**Known gap:** feed cost, livestock economics (ADG/days-to-finish/margin
outlook), silage yield forecasting, and sales revenue still need real
Teagasc finishing-beef nutritional data and CSO/Bord Bia price series this
session doesn't have in hand (same "can't fetch, won't fabricate"
constraint documented for Phase 3's evidence gaps) — those stay Phase 1
mock figures (`@/data/mock-farm`) rather than the live-computed treatment
fertiliser spend and livestock value now get.

**Livestock economics engine live.** `src/domain/livestock.ts`
(`livestock_engine_v1.0.0`) closes the gap flagged above — built from a
second real dataset the user supplied (a Teagasc-sourced Animal Nutrition
Database covering calves, weanlings, replacement heifers, suckler cows and
finishing cattle). Implements the finishing concentrate budget
(DMD-Concentrate table: concentrate kg/head/day by silage quality) and
`docs/feed-engine.md`'s sell-now-vs-finish comparison ("current market
value now vs forecast sale value at target date minus remaining cost to
finish") as a standalone pure function, per that doc's own requirement.
Validated against the source workbook's own worked example (a 520kg→650kg
continental steer at 72 DMD, €350/t concentrate: 130 days, 5kg/day,
€4,550 for 20 head — reproduced exactly). Wired into the Livestock
Economics screen (replacing its one static mock entry — €1,550 sell-now,
€1,710 net-if-finished vs the old mock's arbitrary €89/€236 margin
figures) and the Feed Optimiser screen's summary card, sharing one
`FINISHING_OPTIONS` registry so both agree on which groups have a real
model.

**Still not built, honestly:** the three-strategy optimiser (Lowest
cost/Balanced/Faster finish) stays Phase 1 mock — the source data only
publishes concentrate-by-DMD at one fixed target ADG per animal type, never
concentrate-by-*varying* ADG, so there's no real table to build a
faster-costs-more comparison from without extrapolating past what's
published. Also unbuilt: suckler-cow and weanling winter feed budgets,
silage/minerals/bedding cost drivers, and sales revenue/cashflow
forecasting — no real source in hand for those yet.

Next: gather sourced data for the remaining gaps above, or continue
elsewhere per `docs/product-requirements.md` § Delivery phases.
