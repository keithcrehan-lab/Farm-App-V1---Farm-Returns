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

Next: Phase 2 — central farm data model (mock persistence, enter-once
dependencies proven end-to-end) per `docs/product-requirements.md` §
Delivery phases.
