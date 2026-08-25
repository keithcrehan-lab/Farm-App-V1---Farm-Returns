# Overnight build log — `claude/overnight-farm-return-core`

Unattended sequential build session. Branched from `claude/app-discussion-dea2t1`
(clean tip). Per instruction: no upfront plan, no approval gate — phases are
defined and logged as each one starts, in the order surfaced by the most
recent "what's left" audit (small real-data wins first, then larger
buildable features), skipping anything blocked on external data/access and
recording the blocker instead. Quality checks (test/typecheck/lint/build)
run after every phase; each phase commits locally (no push) before moving
on.

Session start: see git log timestamps for exact times (not tracked here to
avoid drift between the shell clock and log edits).

---

## Phase 1 — Soil coverage: real field-mapped / verified-test counts

**Scope.** `SoilCoverageCard` (Soil screen) and the Dashboard's "Mapped
fields" metric currently read `mockFarmStats.totalFieldsMapped` (42 — a
generic placeholder that doesn't even match this farm's real 4 fields) and
`mockFarmStats.totalVerifiedTests` (12, static). Both are directly
computable from real store data already: `totalFieldsMapped` = fields with
a real drawn boundary (`Field.polygon` set, via the Mapbox field-boundary
feature), `totalVerifiedTests` = fields with a real lab-verified soil test
(`SoilFertility.verifiedTest` set, via `addSoilTest`).

**Deliberately left mock, and why.** `SoilCoverageCard`'s third stat
("planning accuracy %") and the Dashboard's "Plan Confidence"/carbon-grade
figures have no defined real methodology anywhere in this app's evidence
base — computing them would mean inventing a scoring formula, which
CLAUDE.md's "never invent a production number" rule forbids. Left as
`mockFarmStats` fields, untouched.

**Implementation.** `src/domain/farm-stats.ts` (new, tested):
`calculateFarmCoverageStats(fields)` — `totalFieldsMapped` =
`fields.filter(f => f.polygon !== undefined).length`, `totalVerifiedTests`
= `fields.filter(f => f.fertility.verifiedTest !== undefined).length`.
Wired into `SoilCoverageCard` (now a client component reading `useFields()`
directly) and the Dashboard's mobile-only "Mapped fields" `MetricCard`.
Also removed that card's hardcoded `changePct={2}` — a fabricated "+2%"
delta with no real historical basis, now sitting next to a real value
where it would have been actively misleading rather than just generically
mock.

**Verified.** Soil screen now shows **0 fields mapped** (correct and
interesting: none of this farm's 4 mock-seeded fields have had a real
boundary drawn via the Mapbox field-boundary tool yet — a real, honest
result, not a bug) and **1 verified tests** (matches River Field's real
12 May 2025 lab test exactly). Dashboard mobile "Mapped fields" card shows
the same real 0. Both screens visually confirmed at mobile/desktop, zero
console errors, no layout regression.

**Quality checks.** 4 new tests (`farm-stats.test.ts`) — 391/391 total
passing. typecheck clean. lint clean. Production build clean (all 25
routes generate, `/livestock/lg-weanlings` still included).

Status: **complete.** Committed locally.

---

## Phase 2 — Alerts & Recommendations / Best Opportunities: BLOCKED

**Investigated, not built.** Checked all 7 mock advisory items
(`mockAlerts` x4, `mockOpportunities` x3) individually against this app's
real evidence base rather than assuming a "rules engine" was uniformly
buildable:

- **"Soil test due" / Home Field** — needs a sourced soil-retest-interval
  (e.g. "every N years"). No such figure exists anywhere in this app's
  evidence register; picking one would be inventing a threshold, which
  CLAUDE.md's "never invent a production number" rule forbids.
- **"Fertiliser window open" / Back Field** — needs the real statutory
  spreading calendar (S.I. 588/2025 date ranges). Already a confirmed,
  named blocker (README/evidence-register.md) — no extract in hand.
- **"Slurry spreading conditions good for next 3 days"** — the underlying
  hard-stop checks are real (`isGroundFrozen`/`isGroundSaturated`,
  spreading.ts), but a real 3-day-ahead answer needs live forecast data,
  and the live Met Éireann connection is itself a confirmed, separate
  blocker in this sandboxed environment (no network egress to
  `opendata2.met.ie`).
- **"Feed budget attention" / Weanlings** — needs a real budget/plan
  baseline to compare actual spend against. No such baseline exists in
  the data model (there's no "planned feed budget" entity anywhere).
- **"Join fertiliser buying group — save up to €740"** — the demand side
  is real (Phase 6 work, this session), but the saving-per-unit figure it
  multiplies is still a mock regional-pricing assumption (same blocked
  bulk-buying gap as `/input-planner`). Presenting the product as "real"
  would mix one real number with one invented one under a single claim.
- **"Silage deficit risk — increase silage by 8%"** — needs a real forage-
  inventory-vs-required-winter-forage comparison. The whole Silage domain
  is still Phase 1 mock (no real yield/inventory engine exists yet) — see
  Phase 4 below for the full investigation of this specific gap.
- **"Optimise feed mix — save up to €1,120"** — the one case with a
  plausible real number (the cost difference between the real "Lowest
  cost" and "Balanced" concentrate strategies, `calculateWeanlingConcentrateStrategies`/
  `calculateSteerConcentrateStrategies`). Deliberately **not** built anyway:
  promoting "Lowest cost" as a headline savings opportunity, without the
  Feed Optimiser screen's own side-by-side days-to-finish context, risks
  steering a farmer toward the exact scenario this codebase's own comments
  already flag as unrealistic (the weanling zero-meal strategy's ~483-day
  timeline, "not a realistic single-winter plan"). This is a product
  judgement call about which comparison is safe to surface as unconditional
  "advice", not a data-availability gap — leaving it for an explicit human
  decision rather than making that call unattended.

**Net result: every one of the 7 mock advisory items is genuinely blocked
right now** — five on missing evidence/data access, two on a product
decision that shouldn't be made without a human in the loop. No code
changed this phase. Continuing to the next buildable item.

---

## Phase 3 — Reports: real CSV export for the 3 reports with a real engine

**Scope.** `/reports`' own Export button already carried the tooltip
"Report generation arrives once the relevant domain engine is live" —
true today for 3 of its 4 reports: Farm Plan Summary (Phase 2's real field
model), Nutrient Plan Report (`nutrients.ts`), and Soil Test History (the
real verified-soil-test flow). Financial Summary stays disabled — its
data (`mockFinanceSummary`/`mockCashflow`) is still the single biggest
known mock gap in the app (real revenue/cashflow needs a real sales-plan/
sales-log source, confirmed blocked).

**Implementation.**
- `src/lib/csv.ts` (new, tested): `toCsv`/`downloadCsv` — generic RFC
  4180-ish CSV serialisation + a real client-side Blob download. Browser
  utility, not a domain formula, so it lives in `lib/` not `domain/`.
- `src/lib/reports.ts` (new, tested): one CSV builder per real report,
  each calling the exact same real domain function the live screens
  already use (`calculateNutrientPlan`, the same call `/nutrients` makes)
  and serialising the real result — nothing here computes a new number,
  only formats already-real ones.
- `src/app/reports/page.tsx`: now a client component; Export is a real,
  functional button for the 3 real reports (downloads an actual CSV built
  from this farm's live store data) and stays disabled for Financial
  Summary, with an updated tooltip naming the specific blocker.

**Verified end-to-end** via a real Playwright download interception (not
just a click): clicking "Nutrient Plan Report" → Export produced a real
file (`nutrient-plan-2026-08-25.csv`) containing this farm's actual
per-field N/P/K requirement, organic offset, purchased-product
breakdown, real cost, and real NAP compliance status — e.g. "Home Field,
8.6,Grazing,142,20,11,...,18-6-12 1003.3kg (€622); Protected Urea
1547.6kg (€859),1481,Yes,Yes,compliance_value,nutrient_engine_v1.0.0".
Confirmed the Financial Summary button stays disabled and the other three
stay enabled. Visually verified at mobile/desktop, zero console errors,
no layout regression.

**Quality checks.** 10 new tests (`csv.test.ts` x5, `reports.test.ts` x5)
— 401/401 total passing. typecheck clean. lint clean. Production build
clean (25 routes).

Status: **complete.** Committed locally.

---

## Phase 4 — Whole-farm feed balance (Silage): investigated, BLOCKED

`WholeFarmFeedBalanceCard` (`/silage`) compares
`ForageInventory.totalDmTonnes` (silage the farm will produce) against
`requiredWinterForageDmTonnes` (silage the herd needs) to render a
surplus/deficit figure and, when negative, a "Silage deficit risk" alert
telling the farmer to consider a 2nd cut or buying feed.

The **supply** side is genuinely real and derivable right now — the exact
same `SilagePlan.expectedYieldTDMha x field.areaHa` calculation
`calculateFarmGrassAndSilageCostEur` (finance.ts) already does for real.
The **demand** side is not: it needs a real per-animal-type daily forage
DM-intake rate (kg/day or %bodyweight), and no such figure exists
anywhere in this app's evidence register — grep for DMI/intake-rate
sources came back empty.

**Why this isn't a "wire in what's real" case like Phases 1/3.** Making
only `totalDmTonnes` real while `requiredWinterForageDmTonnes` stays mock
wouldn't produce a partially-real card — the card's entire *purpose* is
the comparison between the two, and the deficit/surplus figure and alert
verdict are both direct functions of the still-invented required-forage
number. A real supply figure would lend false credibility to a
still-fabricated conclusion ("you're short of winter forage, consider
buying feed") — the same "mixing one real number with one invented one
under a single claim" problem Phase 2 already ruled out for the "silage
deficit risk" opportunity card, from the other direction. Splitting this
into a real "expected production" fact separate from a mock "required
forage" estimate would be a genuine UI reframing, not a data swap — a
design decision needing reference-image consideration per CLAUDE.md's
screen workflow, not something to redesign unattended.

Status: **blocked.** No code changed. Continuing.

---

## Session status

All discoverable "wire real data in without inventing anything or making
an unreviewed product-framing call" opportunities have been built (Phases
1 and 3). Every other candidate surfaced by a fresh, granular sweep of
this pass (Phase 2's 7 advisory items, Phase 4's feed balance, plus the
already-known large gaps: Dashboard/Finance hero cashflow, Housing/slurry
volume, Livestock's "vs last season" deltas, Continental Steers' real
sale price, the full multi-ingredient optimiser, the live Met Éireann
connection, spreading score/calendar, bulk-buying) is blocked on either
missing evidence/data access or a product decision that deserves a human,
not something to resolve unattended. Continuing to sweep for anything
missed; will append further phases here if found.
