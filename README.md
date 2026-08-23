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

Next: continue Phase 3 (Irish soil overlay refinement, verified soil-test
upload flow) or move to Phase 4 — silage/livestock/finance — per
`docs/product-requirements.md` § Delivery phases.
