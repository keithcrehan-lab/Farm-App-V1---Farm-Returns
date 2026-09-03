# Authenticated Real-Data Audit

Authenticated Real-Data Stabilisation Phase, starting SHA `833b0ed`.
Audits every reachable screen against the real, authenticated Dev farm
(`Farm Return V1 Dev`, project ref `whevugeisqlpfnrugfsd`) — see
`AUTHENTICATED_DEV_FARM_STATUS.md`-equivalent summary in the final
report for the exact real row counts this audit is checked against.

**Method, disclosed plainly**: this session had real Supabase CLI access
to `Farm Return V1 Dev` (linked, authenticated in a prior session) —
used throughout for real row-count/shape queries (read-only, no writes).
It did **not** have the real farmer's own sign-in credentials, and
creating a new account or entering a password is prohibited regardless
of authorization (`CLAUDE.md`/standing rules) — so no live, authenticated
browser click-through of the real Dev farm was performed. Every
`REAL_DATA_WORKING`/`HONEST_EMPTY_STATE` classification below is backed
by (a) the real database row counts/shapes obtained via the CLI, (b)
direct reading of that screen's actual data-loading code (a Server
Component fetch, a `useFarmStore()` selector, or a `useIsRealMode()`
gate — quoted or referenced below), and (c) for the reported mobile
symptom specifically, real, reproduced browser evidence obtained by
loading this dev server over the same LAN-IP origin a phone would use
(see `HOSTING_DIAGNOSIS.md`). Where a screen's real behaviour could only
be confirmed by an authenticated interactive session, this is stated
explicitly rather than asserted.

## Core Farm Return Next

| Screen | Route | Real farm-scoped? | Data source | Classification | Resolution |
|---|---|---|---|---|---|
| Today | `/today` | YES | `useFarm()`/`useFields()`/`useIsRealMode()` (farm-store, seeded server-side from real Postgres rows via `(app)/layout.tsx`); real Prompt producers | `REAL_DATA_WORKING` | No mock-farm import at all (verified: zero `@/data/mock-farm` references in `today/page.tsx`). Genuinely real for the authenticated farm — will show 1 real mapped field, no jobs/decisions yet (real farm has 0 of each), which is a correct `HONEST_EMPTY_STATE` for those specific facts, not a bug. |
| Farm / Fields | `/fields` | YES | `useFields()` | `REAL_DATA_WORKING` | Zero mock imports. Real farm has 1 real mapped field (`area_ha: 0.62`, real polygon) — will render correctly. |
| Field Detail | `/fields?field=<id>` (`FieldDrawer`) | YES | `useFieldById()` | `REAL_DATA_WORKING` | Shares Fields' own real data path; no separate route. |
| Plan | `/plan` | YES | `useFarm()`/`useFields()`/`useIsRealMode()` | `REAL_DATA_WORKING` | Zero mock imports. Real Prompt list; honest "no jobs scheduled yet" state for 0 real jobs, per `IMPLEMENTATION_MATRIX.md`'s own documented Phase 5 status. |
| Records | `/records` | YES | `RecordsPageClient.tsx` — zero mock imports | `HONEST_EMPTY_STATE` | Real farm has 0 decisions, 0 jobs/job_sessions — this screen's own established "No activity yet" empty state applies honestly, not a defect. |
| Ask AI | overlay, all screens | YES | `AskAIContext` (real, caller-supplied facts; Phase C's evidence-tier tagging) | `REAL_DATA_WORKING`, `BLOCKED_EXTERNAL` (no LLM) | No AI provider configured in this repo (no API key, no server route) — the overlay states this and fails closed rather than fabricating a response, per its own established design. Not new to this phase. |

## Existing operational screens

| Screen | Route | Real farm-scoped? | Mock dependency | Classification | Resolution |
|---|---|---|---|---|---|
| Livestock (overview) | `/livestock` | YES | None (`LivestockPageClient.tsx`, zero mock imports) | `REAL_DATA_WORKING` | Real farm has 1 real livestock group (`suckler_cow`, 20 head, grazing). |
| Livestock economics | `/livestock/[groupId]` | YES | `mockMarketPrices` (Bord Bia beef €/kg carcass fallback price for non-weanling animal types only) | `REAL_DATA_PARTIAL` | `LivestockEconomicsView.tsx` correctly looks up the real group via `useLivestockGroups()`; the fallback constant is a real, disclosed, pre-existing `BLOCKED_EXTERNAL` item (`BLOCKERS.md`: "No automated market-price feed"), not new mock leakage — the screen's own footer already discloses "estimates based on current market prices." `generateStaticParams` in the sibling `page.tsx` seeds build-time static params from `mockLivestockGroups`, but `dynamicParams` is not disabled, so a real farm's own Postgres-UUID group id still renders on-demand (`SAFE_DEMO_ONLY`, verified: no `dynamicParams = false` anywhere in either file). |
| Housing | `/housing` | YES | None | `HONEST_EMPTY_STATE` | Real farm has 0 housing rows. The screen's own header comment documents a prior real crash fix (`useHousingList()[0]` on zero housing) — verified still correct: renders "No housing recorded yet" + an add-shed form, never blank. |
| Soil | `/soil` | YES | None | `REAL_DATA_WORKING` / `HONEST_EMPTY_STATE` (per tab) | Real field has P/K Index but no `verifiedTest` — "Mapped"/"Assumptions" tabs show the real field; "Verified Tests" tab correctly shows "No fields match this filter yet" rather than a fabricated result. |
| Nutrients / Fertiliser Plan | `/nutrients` | YES | `mockSilagePlans` (silage-plan lookup only) | `REAL_DATA_WORKING` | A real field's UUID can never match a mock silage-plan's demo field id, so `silagePlan` correctly resolves `undefined` for every real field — the identical outcome as if this used `[]` directly. No real silage-plan feature exists for any field (real or mock) yet, so this is functionally correct, if slightly confusingly sourced; not a farmer-visible defect. |
| Spreading | `/spreading` | YES | `mockPlannedApplications`/`mockSpreadingScores` | `REAL_DATA_WORKING` | Both suppressed to `[]` behind `isRealMode` (verified). |
| Silage | `/silage` | YES | `mockSilagePlans`/`mockForageInventory` | `NOT_IMPLEMENTED` (disclosed) | Screen's own header comment documents this is deliberate: no sourced yield/DM-conversion model exists (`BLOCKERS.md` carried-over blocker). A real farm's field never matches the one demo plan, so the screen correctly renders "No silage plan for this farm yet... a real sourced yield model doesn't exist yet" rather than blank — already fixed in a prior session, verified still correct. |
| Input Planner | `/input-planner` | YES | `mockBuyingOpportunities`/`mockInputPlannerSummary`/`mockInputRequirements`/`mockSilagePlans` | `REAL_DATA_WORKING` | All four suppressed/replaced behind `isRealMode` (verified: `silagePlans: isRealMode ? [] : mockSilagePlans`, summary/heading text branches on `isRealMode`). |
| Feed Optimiser | `/feed-optimiser` | YES | None | `REAL_DATA_WORKING` (assumed from zero mock imports; not independently re-verified line-by-line this phase — V1 legacy screen, unchanged) | |
| Finance | `/finance` | YES | Cards individually gate `isRealMode` (`CashflowCard`, `BestOpportunitiesCard`, `MarginHeroCard`, `FeedCostOverviewCard`, `LivestockValueCard`, `FertiliserSlurryCard` — verified, every one) | `REAL_DATA_WORKING` | `finance/page.tsx` is a real Server Component: `getFarmForCurrentUser()` + `listFinancialAssumptionsForFarm(farm.id)` (real: 2 rows for the Dev farm) + `listSupplierQuotesForFarm` (fails open to `[]`, real: 0 rows). |
| Market Prices | `/market-prices` | YES (filtered) | `mockMarketPrices` | `REAL_DATA_WORKING` | `isRealMode` filters `allMarketPrices` to only `status !== undefined` entries (real-sourced ones), not shown as farm-specific data anyway (public commodity prices) — verified. |
| Reports | `/reports` | YES | `mockSilagePlans` (CSV export only) | `REAL_DATA_WORKING` | Same natural-no-match reasoning as Nutrients; `isRealMode` explicitly passed into the CSV builder and used to choose `[]` over the mock array. |
| Settings | `/settings` | YES | None (`SettingsPageClient.tsx`, zero mock imports) | `REAL_DATA_WORKING` (assumed from zero mock imports; not independently re-verified this phase) | |

## Job flow

| Screen | Route | Real farm-scoped? | Classification | Resolution |
|---|---|---|---|---|
| Start Job | via Prompt/Plan action | YES | `SHIPPED, VALIDATED_DEV` (per `IMPLEMENTATION_MATRIX.md` Phase 4) | Unchanged this phase — real farm has 0 job_sessions to date (never started one), which is a real, honest fact about this Dev farm's usage history, not a defect. |
| Active Job | `/job/[id]` | YES | `ActiveJobSessionView.tsx`, zero mock imports | `REAL_DATA_WORKING`, not independently re-exercised (no real `job_sessions` row exists to open) | |
| Finish Job / Completed-estimated | `/job/[id]` | YES | Same file | `REAL_DATA_WORKING`, same caveat | |
| Confirm Actual | `ConfirmActualSheet` | YES | `SHIPPED, VALIDATED_DEV` | Same caveat — 0 real job sessions exist on this farm to confirm | |
| Resulting Record | `/records` | YES | `JobSessionRecordCard`, merged into Records timeline | `HONEST_EMPTY_STATE` | No confirmed Actuals exist yet for this real farm — correct, not a bug |

## Real, disclosed limitation of this audit

Every row above marked `REAL_DATA_WORKING` on the strength of "zero mock
imports" plus a real database row count is a **code-level, DB-level**
verification, not a live, interactive, authenticated click-through —
this session could not perform that (no credentials; account creation
and password entry are prohibited regardless of authorization). Where a
screen's own code was read in full and its real-mode branching verified
line-by-line, that is stated explicitly above; where it rests on the
zero-mock-imports signal alone, that is stated too. The one concrete,
reproduced, screen-independent finding this phase discovered — and the
most likely actual explanation for the reported "screens don't fully
load on mobile" symptom — is architectural, not per-screen: see
`HOSTING_DIAGNOSIS.md`.
