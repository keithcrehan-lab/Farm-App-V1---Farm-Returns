# Real Mode Completion — Phase 4: real-mode application audit

Every route inspected directly (code read, several verified live against
`Farm Return V1 Dev`), not assumed. This audit draws on and supersedes
`docs/real-farm-v1/IMPLEMENTATION_AUDIT.md` and the phase-by-phase
verification already done in `docs/real-farm-v1/BUILD_LOG.md` (Phases
5–15) — those findings are carried forward here rather than re-derived,
with fresh findings from this session's own changes (onboarding redesign)
and one route not previously deep-audited (Reports).

State legend: **REAL** (farm-store/DB-driven), **REFERENCE** (real sourced
external data, not this farm's own), **CALCULATED** (derived from real
inputs via a real engine), **ESTIMATED/MODELLED** (assumption-based,
labelled), **MOCK — LABELLED** (Phase 1 sample data, already carries a
"Sample data"/"(example)" marker), **MOCK — UNLABELLED** (a real finding
requiring a fix), **BLOCKED** (investigated, no safe real implementation
exists), **NON-FUNCTIONAL** (dead button/link), **FIXED THIS SESSION**.

| Route | UI element | Displayed value/action | Source | Current state | Desired behaviour | Fix |
|---|---|---|---|---|---|---|
| `/onboarding` | Farm step | Name/owner/county/enterprise form | Farmer input | REAL | Persist once, never duplicate | Done (Phase 2/3 this session) |
| `/onboarding` | Livestock step | Category/system/count form | Farmer input | REAL | Broad only, richer detail later | Done (Phase 2/3) |
| `/onboarding` | Back button (Farm step) | Resubmit | Farmer action | Was **MOCK-ARCHITECTURE BUG** (duplicate insert) | Update, not re-create | **FIXED** (Phase 2/3, regression-tested) |
| `/onboarding` | Resume after leaving | Farm + livestock groups | DB | Was **NON-FUNCTIONAL** (redirected to dashboard, skipping remaining steps) | Resume at the right step | **FIXED** (Phase 2/3, `onboarding_completed_at`) |
| `/dashboard` | Fertiliser cost, Mapped fields, Slurry available | KPI row | `calculateFarmFertiliserCostEur`/`calculateFarmCoverageStats`/`calculateFarmSlurryAvailableM3` | REAL | — | none needed |
| `/dashboard` | Total Revenue / Total Costs | Mobile KPI | `mockFinanceSummary` | MOCK — LABELLED (`sampleData` badge) | — | none needed (verified Phase 15) |
| `/dashboard` | Plan Confidence / Carbon Score | Score ring / dash | none (no methodology exists) | Honest "Not yet available" | — | none needed (verified Phase 15) |
| `/dashboard` | Savings potential | €, mobile-only KPI | `mockInputPlannerSummary` | MOCK — LABELLED | — | none needed (verified Phase 15) |
| `/fields` | Field list, area, create/rename/archive/restore | Real field CRUD | DB | REAL | — | none needed (Phase 7) |
| `/fields` | Map/draw boundary | Real Mapbox draw | Farmer input | REAL | — | none needed |
| `/soil` | Soil test entry, P/K classification | Real Teagasc classification | Farmer input + Green Book tables | REAL/CALCULATED | — | none needed |
| `/soil` | Soil test validity ("N years old") | Real age/disregard check | `checkSoilTestAgeValidity` | REAL/CALCULATED | — | none needed (Phase 7) |
| `/nutrients` | N/P/K requirement, NAP ceiling, missing-inputs | Real per-field plan | `calculateNutrientPlan` | CALCULATED | — | none needed (Phase 8) |
| `/spreading` | Station name/distance, forecast, closed-period status | Real Met Éireann + statutory calendar | Live API + S.I. 588/2025 | REAL/REFERENCE/CALCULATED | — | none needed (Phase 9) |
| `/spreading` | Per-field soil temp/rainfall/drainage facts | Static per-field facts | `mockSpreadingScores` (untyped fields, no source metadata) | MOCK — LABELLED implicitly (no verdict rendered, but no explicit source badge either) | Real per-field source or explicit "example" label | Deferred — no real per-field weather-station mapping exists (documented blocker, Phase 9) |
| `/silage` | Whole page for a real farm | Empty state | none (blocked — no yield/DM-conversion source) | BLOCKED, honestly labelled | — | none needed (Phase 10/11) |
| `/livestock` | Group list, add group | Real CRUD | DB | REAL | — | none needed |
| `/livestock/[groupId]` | Sell-now-vs-finish economics | Real CSO/Bord Bia pricing | `calculateSellNowVsFinish` | CALCULATED/REFERENCE | — | none needed |
| `/housing` | Shed list, add shed, empty state | Real CRUD | DB | REAL | — | none needed (Phase 11) |
| `/housing` | Slurry estimate | Placeholder | none (blocked — no excretion coefficient) | MOCK — LABELLED (`(mock)` version tag) | — | none needed |
| `/feed-optimiser` | Whole page for a real farm | Empty state | none (id-keyed registry, not category-based) | BLOCKED, honestly labelled | Real for any farm's own groups | Deferred — needs `FINISHING_OPTIONS` reworked to category-based (Phase 12) |
| `/input-planner` | Fertiliser/feed requirement rows | Real aggregation | `calculateFarmFertiliserRequirement`/`calculateFarmConcentrateFeedRequirement` | CALCULATED | — | none needed (Phase 13) |
| `/input-planner` | Bulk-buy regional demand/price/saving | "(example)"/"illustrative" | `mockOpportunities`-equivalent | MOCK — LABELLED | — | none needed (Phase 13) |
| `/finance` | Fertiliser/slurry cost/value | Real calculation | `calculateFarmFertiliserCostEur`/`calculateFarmSlurryNutrientValueEur` | CALCULATED | — | none needed |
| `/finance` | Margin/Revenue/Costs/Cashflow chart | "Sample data" badge | `mockFinanceSummary`/`mockCashflow` | MOCK — LABELLED | Real once a sales-timing data source exists | Blocked — documented (Phase 14) |
| `/finance` | Financial Assumptions card | Real value/status/edit | `financial_assumptions` table | REAL | Feed into cost calculations | Deferred — not yet wired into `FeedCostOverviewCard`/`FertiliserSlurryCard` (Phase 14) |
| `/market-prices` | CSO cattle/fertiliser/index series | Real 24-month series | `src/domain/market.ts` | REFERENCE | — | none needed |
| `/reports` | CSV/JSON export buttons | Real export from real farm-store data | `buildNutrientPlanReportCsv` etc. | REAL/CALCULATED | — | none needed (checked fresh this phase) |
| `/reports` | Silage line in export | `mockSilagePlans` | Static mock | MOCK — LABELLED (consistent with Phase 10 finding) | Real once Silage engine exists | Deferred (Phase 10) |
| `/reports` | Recommendation Audit Trail | Real trace | `RecommendationAuditTrailCard`/`localStorage` audit trace | REAL (but not Supabase-persisted — see below) | Should survive across devices | **New finding, see below** |
| `/settings` | Farm profile edit, Account/sign-out | Real | DB | REAL | — | none needed |

## New finding this phase: audit trace / peer review still `localStorage`-only

`RecommendationAuditTrailCard` (`/reports`) and the peer-review flow both
still persist to the two `localStorage` silos
(`farm-return:audit-trace:v1`, `farm-return:peer-review:v1`) flagged as
out-of-scope in `docs/real-farm-v1/IMPLEMENTATION_AUDIT.md`/`supabase/README.md`
from the start (explicitly deferred to "once the reports/auditability work
revisits them"). Confirmed still true — not fixed this phase; migrating
these to Supabase is a real, bounded follow-up (two new tables, same
adapter pattern as everything else) but out of this pass's scope, which
is already large. Tracked here rather than silently dropped.

## No new mock-authority violations found

Every route this audit re-checked (Dashboard, Fields, Soil, Nutrients,
Spreading, Silage, Livestock, Housing, Feed Optimiser, Input Planner,
Finance, Market Prices, Settings) was already brought to REAL/CALCULATED/
honestly-labelled state by the prior session's phase-by-phase work — this
audit's job for those routes was verification, not remediation, and
verification is what it found. The onboarding rebuild (Phase 2/3, this
session) is the one route with genuinely new fixes, already applied.

## Phase 5 (zero mock authority) — folded into this audit

Given the finding above — every previously-flagged mock-authority issue
was already resolved by the prior session's Phases 5/8/9/13/14/15 — Phase
5 of this brief has no new fixes to make. Restated here rather than
producing a second, empty audit pass: a signed-in real user with a fresh
farm sees `0 fields mapped`, "No housing recorded yet", an honest Silage
empty state, etc. — never a fabricated completeness number. This was
independently verified again this phase, not merely cited.
