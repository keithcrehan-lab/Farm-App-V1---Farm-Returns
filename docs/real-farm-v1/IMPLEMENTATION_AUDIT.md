# Real Farm V1 — Implementation Audit

Snapshot taken at the start of the Real Farm V1 build, branched from `main`
at `2170cfc` (Scientific Engine v3 merged, 58/58 test files / 881/881 tests
/ clean production build, verified before this branch was cut). This audit
looks at the repository through one lens only: **can a real, distinct
signed-up farmer use this today to persist and manage their own farm?**
It does not re-litigate Scientific Engine v3's calculation correctness —
that is independently and extensively documented in
`docs/scientific-engine/v3/` (`ADVERSARIAL_AUDIT_REPORT.md`,
`V3_IMPLEMENTATION_COVERAGE_MATRIX.md`, `RESEARCH_CLOSURE_REPORT.md`) and
is treated here as the trusted calculation foundation this build must not
weaken.

## Headline finding

**There is exactly one farm, and it belongs to nobody.** The entire
application — all 19 routes — reads and writes a single global
`FarmProvider` (`src/store/farm-store.tsx`) seeded from
`src/data/mock-farm.ts` and persisted to one unscoped `localStorage` key
(`farm-return:v1`) shared by every visitor to the browser it runs in.
There is no user account, no sign-in, no concept of "this farm belongs to
this user," and no server-side database of any kind. `src/app/page.tsx`
unconditionally `redirect("/dashboard")`s — there is no gate a farmer
could hit that would ask them to identify themselves. Two more
`localStorage` silos exist alongside it (`farm-return:audit-trace:v1`,
`farm-return:peer-review:v1`), equally unscoped.

This is not a defect in what's been built — the repo's own README and
`CLAUDE.md` are explicit that this is intentional, sequenced work
("Phase 2 — central farm data model (**mock persistence**)",
`farm-store.tsx`'s own header comment). It is exactly the gap Real Farm V1
exists to close.

## What is genuinely real today

This matters as much as the gaps: a substantial amount of this app is
**not** mock, and Real Farm V1 must not disturb it.

- **Domain calculation engines** (`src/domain/*.ts`, ~50 modules, 881
  tests): nutrient requirement engine (Teagasc Green Book + S.I. 588/2025
  NAP tables), statutory excretion/manure value, spreading legal gates and
  closed-period calendar, buffer/commonage/LESS-method/soiled-water gates,
  fodder budget, clover-N, livestock sell/finish economics, feed cost,
  finance aggregation, audit trace/evidence/provenance. These are pure,
  versioned, unit-tested TypeScript with sourced constants — exactly what
  CLAUDE.md requires. **Real Farm V1 must connect real farm data to these,
  not replace or re-derive them.**
- **Provenance system** (`src/domain/provenance.ts`, `types.ts`'s
  `TrackedValue<T>`): every enterable value already carries
  `status`/`source`/`sourceDate`/`calculationVersion`/`previous` (history
  chain). `farmerAdjust()`/`verify()` never overwrite — they chain. This is
  the correct foundation for Phase 17's provenance UI; it needs surfacing
  and persisting, not designing from scratch.
- **Real external data integration**: `src/server/weather/*` is a genuine
  Met Éireann EDR/forecast client with real parsers and fixtures (not
  fabricated — `edr-parser.real-fixtures.ts`), wired through
  `/api/weather/observations` and `/api/weather/forecast` into the
  Spreading screen. CSO cattle/fertiliser/price-index time series in
  `src/domain/market.ts` are real, sourced, versioned reference data.
- **Real write actions already exist** in `farm-store.tsx`: `addField`,
  `setFieldBoundary` (real Mapbox-drawn polygon → derived area/centroid via
  `field-boundary.ts`), `updateFieldIndex`, `addSoilTest` (real lab-value
  P/K-index classification with the documented statutory boundary-gap
  handling), `addLivestockGroup`, plus the V3 closure-pass farmer-capture
  actions (`updateFieldCommonageStatus`, `updateFieldWaterBufferContext`,
  `updateSlurryApplicationMethod`). These are the actions Real Farm V1's
  persistence layer must preserve semantics for, not reinvent.
- **Legal/statutory gates fail closed on real absent data** — confirmed in
  code, not just asserted: e.g. `commonageStatus`/`waterBufferContext`
  absent → `BLOCKED_INSUFFICIENT_EVIDENCE`, never inferred permissive.
  Real Farm V1 must not weaken this by defaulting persisted fields to
  permissive values.
- **Scientific Engine v3's own audit trail**: `docs/scientific-engine/v3/`
  contains an extensive, already-adversarially-reviewed record (golden
  farm test harness, coverage matrix, closure-pass history in `git log`).
  Treat this as authoritative; this build's job is plumbing, not physics.

## What is currently mock/demo and must not leak to a real farmer

`src/data/mock-farm.ts` (672 lines) is the single source for everything
`farm-store.tsx` doesn't yet compute for real: nutrient plan display
fallbacks, silage plans, spreading scores, most finance lines, market
price display rows, alerts/opportunities, dashboard timeline, farm stats
("Plan Confidence" style figures — deliberately never computed, per
`OVERNIGHT_LOG.md` Phase 1, because no sourced methodology exists), and
`Housing.slurryEstimate` (explicitly version-tagged
`"slurry_engine_v1.0.0 (mock)"` in the data itself — an honest label, not
a real engine). `OVERNIGHT_LOG.md` and the git history document a long,
disciplined series of passes progressively replacing pieces of this with
real calculations; the remaining static mock exports are exactly what's
left. Real Farm V1 (Phase 5) must classify every one of these against the
six-state taxonomy (real / external / reference / calculated / estimated /
unavailable) rather than assume "still mock" is a single bucket — some of
it (CSO series, sourced product prices) is real reference data that
happens to live as a static export; some of it (spreading score,
Housing.slurryEstimate, farm stats percentages) is genuinely invented and
must not survive onto a real farmer's screen unlabelled or at all.

## Persistence architecture — current state

| Concern | Current state |
|---|---|
| User accounts | **None.** No auth library, no session, no user table. |
| Farm ownership | **None.** One process-wide `Farm` object; `farmId` fields exist on `Field`/`LivestockGroup`/`Housing` but always equal the one seeded farm's id — never validated against a signed-in user. |
| Database | **None.** No Postgres/Supabase/ORM/schema anywhere in the repo (`grep -ri supabase` returns nothing outside this audit). |
| Farm/field/soil/livestock/housing/slurry state | `localStorage["farm-return:v1"]`, one browser-local blob, client-only, `STORAGE_VERSION = 1` with no migration path beyond "discard on version mismatch." |
| Audit traces (nutrient plan recommendation trace) | `localStorage["farm-return:audit-trace:v1"]` (`src/domain/audit-trace-local-storage.ts`) — separate silo, same scoping gap. |
| Peer review records | `localStorage["farm-return:peer-review:v1"]` (`src/domain/peer-review-local-storage.ts`) — same. |
| Nutrient plans, silage plans, spreading scores, most finance lines, market display rows, alerts, dashboard timeline, farm stats | Static `mock-farm.ts` exports (or computed on the fly from store state where a real engine exists — see above); **not persisted at all**, not farm-specific. |
| Financial assumptions (fertiliser/feed/contractor/livestock-sale/silage price) | No dedicated farmer-editable assumption entity. Product prices live inline in `nutrients.ts` domain data as reference constants; no UI to override them with a farmer's actual quote. |
| Row Level Security / access control | **None** — no server persistence exists yet for RLS to apply to. |
| Cross-device / cross-session continuity | **None.** A farmer's data lives in one browser's `localStorage`; a different device or a cleared browser sees the seed mock farm again, indistinguishable from a real empty state. |

## Route-by-route audit

All 19 routes share the one `FarmProvider` mounted in `src/app/layout.tsx`
and the one `AppShell`. None are behind an auth check (there is no auth to
check). None have loading/error boundaries beyond React's defaults — no
route has a dedicated `loading.tsx`/`error.tsx`.

| Route | Real farm-store data | Mock/static data | Functional gaps found |
|---|---|---|---|
| `/` | — | — | Immediately redirects to `/dashboard`; not a real landing/auth entry point. |
| `/dashboard` | Fields/livestock counts, `InputSummaryCard` (real aggregated fertiliser/feed requirement), real slurry nutrient value | Alerts, opportunities, timeline, some KPI cards (`mockFarmStats`) | No "what's missing to finish setup" guidance (Phase 15 requirement) — dashboard shows whatever mock/real mix exists, doesn't distinguish an empty real farm from a fully-seeded mock one. |
| `/fields` | Field list, boundaries (Mapbox draw), `FieldDrawer` edit | Thumbnail images for unmapped fields | Field creation and boundary drawing work; no field archive/delete action found in `FarmActions`. |
| `/soil` | Field fertility, verified test entry (`addSoilTest`) | `SoilCoverageCard`'s "planning accuracy %" (deliberately never computed — no sourced methodology, per `OVERNIGHT_LOG.md`) | Soil test validity/staleness (`soil-test-validity.ts`) is real and wired into the nutrient ceiling logic; UI-level "this test is now DISREGARD-status" surfacing should be checked for clarity, not just correctness. |
| `/nutrients` | Real `calculateNutrientPlan` per selected field (P/K index, NAP ceilings, all V3 gates) | none for the core numbers; supporting product price constants are reference data | Real and load-bearing already — the main integration risk here is field/soil data completeness once real farmers enter partial data, not calculation correctness. |
| `/spreading` | Real Met Éireann observations/forecast, real `spreading-legal-gate.ts`/closed-period calendar (per `git log` "Closure pass Priority 8: /spreading live-wires the real closed-period calendar") | — | **Re-checked, BUILD_LOG.md Phase 5: confirmed not a violation.** `mockSpreadingScores`' `slurryScore`/`fertiliserScore` fields still exist in the mock data but `SpreadingFieldRow` deliberately never reads or renders either — only real facts and the real calendar-gate pill are shown. |
| `/livestock`, `/livestock/[groupId]` | Group list, `addLivestockGroup`, real sell-now-vs-finish economics for weanlings/steers (CSO mart price + Bord Bia-style pricing) | Groups outside `FINISHING_OPTIONS` registry have no economics page (`notFound()`) | No livestock group edit/delete action in `FarmActions` — only add. |
| `/housing` | Housing list, `linkedGroupIds` | `Housing.slurryEstimate` (explicitly mock-tagged) | No housing create/edit action in `FarmActions` at all — housing is entirely `mock-farm.ts` seed data today; not even an `addHousing`. |
| `/silage` | Field use assignment feeds nutrient planning | Silage plans/forage inventory/expected yield | README/CLAUDE.md both flag this domain as still Phase-1-mock — "no real yield/inventory engine exists yet." Largest remaining domain gap for Phase 10. |
| `/feed-optimiser` | Real 3-strategy concentrate cost comparison for the (hardcoded) steer group | `STEER_GROUP_ID` hardcoded rather than farm-driven; forage inventory assumptions | Deliberately not "optimisation" — README already documents it as a real cost comparison, not a solver; matches what Phase 12 asks to confirm/label, already broadly true. |
| `/input-planner` | Real aggregated fertiliser/feed requirement (`withRealInputRequirements`) | `stockOnHandQty`, bulk-buy regional pricing/savings (confirmed blocked — no live commercial source) | Matches Phase 13's ask closely already; bulk-buy card needs explicit "blocked, no live source" labelling if it isn't already unambiguous. |
| `/market-prices` | Real CSO series (cattle, fertiliser, price indices) | — | Real reference data; needs source/date attribution check in UI (Phase 14/17 requirement), not new data. |
| `/finance` | Real slurry nutrient replacement value, real fertiliser/feed cost aggregation | Livestock sale values, expected revenue, cash-flow timing (README: "monthly cashflow/total-revenue gap needs a real sales-plan/sales-log data source from the user — not buildable from price history alone") | Central Phase 14 target. No farmer-editable "your actual price" override UI found for fertiliser/feed/contractor/silage costs — assumptions are baked into domain constants, not farm-scoped and editable. |
| `/reports` | Real audit trace / recommendation audit export (CSV/JSON, per `git log` "CSV Audit Data Pack + JSON trace + human-readable report exports") | — | Appears to already substantially satisfy Phase 16; needs re-verification once persistence moves server-side (exports currently read `localStorage`, not a database). |
| `/settings` | `updateFarmProfile` (name/owner/county) | — | This is a **farm-profile settings page, not an account/auth settings page** — no sign-out, no password change, no account deletion, because no account exists. |
| `/api/weather/forecast`, `/api/weather/observations` | Real Met Éireann proxy | — | Only two API routes in the entire app — confirms there is no server-side persistence API surface at all yet. |

## Buttons/actions confirmed present vs. confirmed absent

**Present and wired to real state changes:** Add Field, Draw/Save Field
Boundary, Edit Field P/K Index, Add Soil Test, Add Livestock Group, edit
Farm Profile (name/owner/county), farmer-capture actions for commonage
status / water buffer context / slurry application method (all V3
closure-pass additions).

**No corresponding action found in `FarmActions` (`farm-store.tsx`) for:**
edit/delete a field, edit/delete a livestock group, add/edit/delete
housing, edit a soil test after entry, create/edit a silage plan, set or
edit financial assumptions (any of it), sign up, sign in, sign out,
password reset, delete/export account data. Some of these may have
UI affordances that call nothing or that are visually present but
non-functional — each one needs a direct click-through check during
Phase 4/18 implementation rather than being assumed absent from this
static-code pass alone, but the store-level absence is confirmed.

## Where two screens could drift on "the same" concept

- **Slurry**: `Housing.slurryEstimate` (mock volume) vs.
  `SlurryAllocation` (real, farmer-linked to a field) vs. Finance's real
  slurry nutrient *value* calc — three related but distinct concepts
  already correctly kept separate in code and documented as such
  (`README.md`'s Finance section). Worth preserving this distinction
  explicitly in any new persistence schema rather than collapsing it.
- **Input requirement aggregation**: Dashboard's `InputSummaryCard` and
  `/input-planner` already share one real aggregation function
  (`withRealInputRequirements` family) rather than each computing its own
  — a good existing pattern to keep, not a gap.
- **Farm stats / "coverage" figures**: `src/domain/farm-stats.ts` computes
  real mapped-field/verified-test counts, but sits next to `mockFarmStats`
  fields for concepts with no defined methodology (planning accuracy,
  carbon grade). These live in the same object shape, so a careless
  future edit could blend a real count with a mock percentage in one card
  without either being flagged distinctly — worth a hard status-label
  boundary when persistence work touches this file.

## Labels implying more certainty than current evidence supports

Not exhaustively re-verified in this pass (Phase 25's job), but flagged for
that later adversarial audit based on what's visible here:
`statusLabel?: string` on `LivestockGroup` (free-text, e.g. "On Track" —
not derived from any rule); `mockFarmStats`' percentage-style fields if
still rendered without a "no defined methodology" caveat; any bulk-buying
"potential saving" figures on `/input-planner`/`/dashboard` that pair a
real demand number with a still-blocked regional price assumption (README
already flags this combination as a labelling risk, not just a data gap).

## Data lost on refresh / local-storage-only / no user separation

Confirmed for the whole app (see persistence table above) — this is not a
partial gap, it is the starting condition for every entity in the domain
model. Nothing survives a different browser, a different device, or
cleared site data, and nothing distinguishes "farmer A's data" from
"farmer B's data" because there is no farmer A or B, only the one process.

## Conclusion — what Real Farm V1 must build, in priority order implied by this audit

1. Real auth (Supabase) — nothing downstream can be farm-scoped without it.
2. A real database schema for Farm/Field/SoilTest/LivestockGroup/Housing/
   SlurryAllocation/FinancialAssumption, replacing the three `localStorage`
   silos, with RLS keyed on the authenticated user.
3. Adapters from persisted records to the existing, untouched domain-engine
   contracts (`calculateNutrientPlan`, `calculateSellNowVsFinish`, etc.) —
   not new engines.
4. Onboarding flow that creates a real, initially-near-empty farm rather
   than handing every new user the seeded mock farm.
5. Missing CRUD actions (edit/delete field, livestock, housing; financial
   assumptions) that today simply don't exist in `FarmActions`.
6. Silage domain (Phase 10) as the single largest remaining "real engine"
   gap, and Finance (Phase 14) as the single largest remaining "connect
   real data, stop implying precision that isn't there" gap.

This document is a snapshot; phases below will change several of these
rows as they land. `BUILD_LOG.md` in this same directory tracks what
changed, when, and why.
