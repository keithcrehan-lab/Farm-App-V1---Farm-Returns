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

**NAP ceilings: closed for grazing land, still open for cut-only.** The
gap above is now resolved for the two ceilings that matter most (grazing
N and P) — the user supplied a real extract of S.I. No. 588/2025 itself
(`farm_return_core_data_v4.xlsx`), and it told a real story: the Green
Book's N ceiling (206/282/250 kg/ha across 3 bands) turned out to be
**wrong**, not just uncited — the actual statutory schedule has 5 bands
and a non-monotonic 90/114/185/241/214 kg/ha shape. The P ceiling, by
contrast, came back **unchanged** — a genuine independent cross-check
that the Green Book's own figures (27/17/7/0 kg/ha etc.) already matched
the current regulation. Both are now `regulatory: "compliance_value"` in
`src/domain/nutrients.ts`, with a new `napEnhancedPBuildUpKgHa` (Table
15b, conditional on Article 17(6) soil testing — opt-in only, never a
default) and a dormant, dated `NAP_N_CATCHMENT_AMENDMENT_2028` (S.I.
119/2026, effective 2028, only for named-catchment derogation holdings —
exposed but not applied, since this app has no per-farm catchment/
derogation attribute to gate it correctly). **Still open:** the extract
doesn't cover cut-only grassland, so `napMaxAvailableNCutOnlyKgHa` and
`napMaxAvailablePCutOnlyKgHa` stay `"planning_advice"` — and even more
specifically, the P table's ambiguity is called out rather than guessed:
its new title ("...on Grassland", not "...grazing land") could mean the
2025 regulation merged the old grazing/cut-only split into one table, but
resolving that needs the regulation's actual article text, not a table
title. None of this is wired into any UI yet (no screen currently checks
a plan against these ceilings) — these functions were dormant, tested
utilities before and after this update; a compliance-check display on the
Nutrients/Spreading screens is a natural next step now that the
underlying numbers are real.

**The same workbook also contained real data for three other gaps this
README has flagged — not implemented this pass, to keep the change
scoped to what was asked, but worth naming so a future session doesn't
re-ask for them:** current 2026 Teagasc feed-cost benchmarks (closes the
silage/grass cost-driver gap in `FeedCostOverviewCard`), a continental
steer concentrate-response dataset (the same shape that made the Weanling
optimiser real — would close Continental Steers' still-mock strategy
comparison), and a Met Éireann SMD model specification for Phase 5. Two
things it does *not* contain, despite looking similar at first glance: the
CSO price catalogue is dataset IDs to ingest from an API, not actual
numeric time series (still blocked — no live CSO/network access from this
environment), and the bulk-buy supplier schema is explicitly
illustrative-only example rows, not real quotes.

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

**Three-strategy optimiser: real for Weanlings, still mock for Continental
Steers.** A third Teagasc-sourced workbook closed the specific gap flagged
above — a research dataset (t-stor.teagasc.ie, evidence class B) that
varies *observed ADG by concentrate level* rather than fixing one target
ADG per DMD row, the exact shape a genuine "faster costs more" comparison
needs. `src/domain/livestock.ts`'s `calculateWeanlingConcentrateStrategies`
uses it directly: the weanling group's three strategies (0 / 1.5 / 3
kg/head/day concentrate) each get a real, different daily gain (0.18 /
0.66 / 0.86 kg/day) and therefore a real, different days-to-target and
total cost — not three cosmetic variations of one assumed outcome. The
Feed Optimiser screen now has a group selector: Continental Steers keeps
its unchanged Phase 1 mock comparison (still no variable-ADG evidence
exists for finishing cattle), Weanlings gets the new real one, with its own
concentrate-ingredient breakdown from Teagasc's standard ration formulation
(rolled barley 86.2%, soya bean meal 6%, molasses 5%, minerals 2.8%) and no
cattle-price/margin footer, since a wintering weanling isn't being valued
for sale the way a finishing animal is.

Cross-validated two ways: `calculateWeanlingConcentrateStrategies`'s
"Balanced" (1.5kg/day) strategy lands at 128 days to the farm's real
335kg→420kg winter target — almost exactly the workbook's own 130-day
example. Separately, a dedicated `calculateWeanlingFirstWinterBudget`
(a distinct, more current DMD→concentrate table from the same source,
"Weanling_DMD_ADG") reproduces that worked example's own numbers exactly:
required ADG 0.6538kg/day, 1.25kg/day concentrate, 5.2t and €1,820 total
for 32 head.

**Known gap, one honest caveat left in the new data:** the variable-ADG
evidence was observed over a 122-day trial window; the "Lowest cost"
(0kg/day) strategy's ~0.18kg/day rate projects to ~483 days to reach the
same target weight — a real result worth showing a farmer (a near-zero-meal
strategy isn't a realistic single-winter plan), not a modelling error, but
it is an extrapolation past the observed time window even though the
concentrate rate itself stays within the evidence's published range.

**Whole-farm concentrate feed cost: now real.** The same v3 workbook
included suckler-cow winter feeding rules (`SUCKLER_COW_WINTER_RULES`,
sheet "Suckler_Cow_Rules") — this farm's suckler herd is a spring-calving
system (same assumption `nutrients.ts` already makes for N-timing), so the
"Dry spring-calving cows" rule applies: no concentrate specified on
moderate-quality silage, a real sourced zero rather than a missing table.
With steers, weanlings and suckler cows all covered, `src/domain/
finance.ts`'s new `calculateFarmConcentrateFeedCostEur` sums a genuine
whole-farm concentrate total (currently €5,301, live-recomputed from the
farm's actual headcounts and weights) and now drives the Finance screen's
"Concentrates" line — previously a static €23,650 mock figure. It's
deliberately partial: Silage/Grass/Minerals stay Phase 1 mock (no real
cost-per-tonne source in hand for those), and calves/replacement heifers
have no concentrate model yet, so this total is a floor on real spend, not
the whole farm's feed bill — the Concentrates row carries a visible
"Estimated" badge so this isn't overstated as a bookkeeping actual.

**Still not built, honestly:** silage/grass/minerals/bedding cost drivers,
and sales revenue/cashflow forecasting — no real source in hand for those
yet.

Next: gather sourced data for the remaining gaps above, or continue
elsewhere per `docs/product-requirements.md` § Delivery phases.
