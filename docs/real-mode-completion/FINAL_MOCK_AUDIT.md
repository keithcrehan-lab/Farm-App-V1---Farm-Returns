# Real Mode Completion Phase 31 — mock/placeholder adversarial sweep

Grepped the whole `src` tree for `mock|placeholder|indicative|sample|
hard-coded|arbitrary` and read every match in context (not just the
grep line) — this is a fresh sweep of the current, post-Phase-27 state,
not a re-listing of the prior session's `FINAL_MOCK_AUDIT.md` (that
document from the earlier `real-farm-v1` branch remains valid for what it
covered; this one is scoped to this brief's changes plus anything it
missed).

## Confirmed FIXED this build (real bugs, not just labelling gaps)

| Finding | File | Fix |
|---|---|---|
| `mockFarm.location.centroid` passed to weather cards regardless of the real signed-in farm | `/spreading` | Phase 27 — now uses `farm.location.centroid` |
| Fabricated `LivestockGroup.statusLabel` ("On Track") with no rule behind it | `farm-store.tsx`, `livestock.ts` | Phase 5 — omitted for real groups |
| `ScoreRing` rendering 100% mock "Planning Confidence" at full opacity, no disclosure | `/input-planner` | Phase 15 — muted, "Not yet available" |
| `BuyingOpportunityCard`'s mock regional demand/price/saving shown with the same confidence as the one real field | `/input-planner` | Phase 13 (prior session) — "(example)"/illustrative |
| `InputRequirementRow`'s Timing/Confidence columns styled identically to real requirement/cost | `/input-planner` | Phase 15 — "(example)", muted |
| `AlertsCard`'s dead `href="#"` "View all" and per-alert fallback | Dashboard | Phase 7 — removed; `FarmAlert.href` made required |
| Onboarding capturing fields/soil/housing/finance (brief said it shouldn't) | `/onboarding` | Phase 2/3 — redesigned to Farm + Livestock only |
| Duplicate-farm-creation bug on onboarding Back | `/onboarding` | Phase 2/3 — `updateFarmStep` vs `createFarmStep`, regression-tested |
| `/housing`, `/silage`, `/nutrients` crashing or blank-paging for a real farm with no data | respective pages | Phase 11 (prior session) + Phase 9 (this session) |
| `STEER_CONCENTRATE_PRICE_EUR_PER_TONNE`-class hardcoded prices | `livestock.ts`/`finance.ts` | Not rewired (see below) — motivated Phase 20's price-hierarchy build instead |

## Confirmed ALREADY HONEST — checked, not assumed

- `MarginHeroCard`/`CashflowCard`/`BestOpportunitiesCard`/`FinancialOverviewCard`/
  `LivestockValueCard` — all carry an explicit "Sample data" badge with a
  code comment naming exactly what's mock and why (no real sales-timing/
  recommendation engine exists).
- `SoilCoverageCard`/`BestSpreadingCard`/`FarmMapCard` — prior closure
  passes already replaced their mock scores/tints with real computed
  values or an honest "not yet available" state; re-confirmed via each
  file's own header comment plus a code read, not just the comment's word
  taken at face value.
- Dashboard's "Plan Confidence"/"Carbon Score" — real "Not yet available"
  state (Phase 15, prior session), matches the brief's own worked example
  for what NOT to fabricate.
- `Housing.slurryEstimate` — every new shed gets the same explicitly
  `"(mock)"`-version-tagged placeholder; never presented as measured.

## Fixed in a post-completion follow-up

**`MarketWatchCard`** (Dashboard summary): previously rendered every row
(real and still-mock alike) with identical visual weight — no per-row
status badge, unlike `NutrientRequirementCard`/`InputRequirementRow`
elsewhere in this app. Now each row carries a real `StatusBadge` (for a
row `withRealMarketPrices` matched to a real CSO series) or an explicit
muted "Sample data" pill (for a row that stayed mock) — the same
`price.status` field `/market-prices` already used, surfaced here too. 3
new `MarketWatchCard.test.tsx` assertions pin the fix.

## Hardcoded values — reviewed, classified

- `STEER_CONCENTRATE_PRICE_EUR_PER_TONNE`/`WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE`
  (`livestock.ts`, €350/t) — real, sourced from the same workbook every
  other concentrate-price figure in this app cites (not invented), but
  not farm-editable. This is precisely what motivated Phase 20's price-
  resolution hierarchy; wiring it through remains a distinct, larger
  follow-up (documented in Phase 14/20's build log entries), not silently
  left unexamined.
- `INDICATIVE_LIVEWEIGHT_EUR_PER_KG = 2.5` (`farm-store.tsx`,
  `livestock.ts`) — explicitly named "indicative," used only as a
  placeholder value for a newly-created livestock group until Finance
  prices it for real; consistent naming, not a hidden magic number.
- CSO reference series (`market.ts`) — real, sourced, versioned; not a
  fabricated constant, a legitimate reference-data category.

## No new arbitrary scores found

Grepped specifically for any remaining 0–100 `ScoreRing`/confidence-style
usage beyond the one fixed in Phase 15 — none found. The spreading
suitability score (the brief's own named example of what not to
resurrect) remains genuinely absent from every screen, re-confirmed this
pass.
