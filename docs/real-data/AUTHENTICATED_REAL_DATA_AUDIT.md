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
browser click-through of the real Dev farm was performed. Where a row
below states its data-loading code was read and its real-mode
branching verified, that inspection was real and specific (quoted or
referenced). **Codex audit round 1 correctly rejected an earlier
version of this sentence that claimed this was true for every row**: a
"zero direct `mock-farm` imports" signal alone is not equivalent to a
verified dependency graph — `feed-optimiser/page.tsx` had exactly this
gap (a real, indirect mock import the direct-grep check missed,
Critical, fixed — see its own row below). Every row marked with that
weaker "assumed from zero mock imports" caveat should be read as
genuinely `UNKNOWN` pending a full dependency-path check, not as
verified; only the rows stating a specific gate/selector was read carry
that stronger claim. For the reported mobile
symptom specifically, real, reproduced browser evidence obtained by
loading this dev server over the same LAN-IP origin a phone would use
(see `HOSTING_DIAGNOSIS.md`). Where a screen's real behaviour could only
be confirmed by an authenticated interactive session, this is stated
explicitly rather than asserted.

## Core Farm Return Next

| Screen | Route | Real farm-scoped? | Data source | Classification | Resolution |
|---|---|---|---|---|---|
| Today | `/today` | YES | `useFarm()`/`useFields()`/`useIsRealMode()` (farm-store, seeded server-side from real Postgres rows via `(app)/layout.tsx`); real Prompt producers | `REAL_DATA_WORKING` | **Codex audit round 2's own remedy applied**: not just zero direct `mock-farm` imports — every one of `today/page.tsx`'s own local (`@/`) imports was individually checked for its own `mock-farm` import too (`MapHero`, `WeatherHeroChip`, `NearbyFieldCard`, `use-one-shot-position`, `Sheet`, `PromptCard`, `ExpandedPromptSheet`, `AskAI`, `farm-store`, `orchestration/prompt/*`, `lib/status`) — none found. Genuinely real for the authenticated farm — will show 1 real mapped field, no jobs/decisions yet (real farm has 0 of each), a correct `HONEST_EMPTY_STATE` for those specific facts, not a bug. |
| Farm / Fields | `/fields` | YES | `useFields()` | `REAL_DATA_WORKING` | Same one-level check performed. One real, harmless finding: `FieldDrawer.tsx` (imported here) itself imports `mockSilagePlans` for the identical natural-no-match reason as Nutrients (real field UUIDs never match a mock plan's demo field id) — functionally correct, not a defect. Every other local import (`PageHeader`, `AskAI`, `Card`, `MapHero`, `FieldWindChip`, `FieldListRow`, `MapLegend`, `FieldBoundaryMapModal`, `ExpandedPromptSheet`, `farm-store`, `lib/status`, `lib/format`, `domain/field-boundary`, `orchestration/prompt/*`) checked clean. Real farm has 1 real mapped field (`area_ha: 0.62`, real polygon). |
| Field Detail | `/fields?field=<id>` (`FieldDrawer`) | YES | `useFieldById()` | `REAL_DATA_WORKING` | Shares Fields' own real data path; no separate route. Same `mockSilagePlans` no-op noted above. |
| Plan | `/plan` | YES | `useFarm()`/`useFields()`/`useIsRealMode()` | `REAL_DATA_WORKING` | Same one-level check performed (`PageHeader`, `Card`, `WeatherHeroChip`, `FarmSectionHeading`, `PromptCard`, `ExpandedPromptSheet`, `AskAI`, `farm-store`, `orchestration/prompt/*`, `lib/status`) — none touch `mock-farm`. Real Prompt list; honest "no jobs scheduled yet" state for 0 real jobs, per `IMPLEMENTATION_MATRIX.md`'s own documented Phase 5 status. |
| Records | `/records` | YES | `RecordsPageClient.tsx` | `HONEST_EMPTY_STATE` | Same one-level check performed (`PageHeader`, `AskAI`, `ActivityTimelineCard`, `lib/farm-data/{jobs,mappers,job-sessions}`) — none touch `mock-farm` (`mappers.ts` has one textual comment *mentioning* "mock-farm.ts", not an import — checked, not a false-positive miss). Real farm has 0 decisions, 0 jobs/job_sessions — this screen's own established "No activity yet" empty state applies honestly, not a defect. |
| Ask AI | overlay, all screens | YES | `AskAIContext` (real, caller-supplied facts; Phase C's evidence-tier tagging) | `REAL_DATA_WORKING`, `BLOCKED_EXTERNAL` (no LLM) | No AI provider configured in this repo (no API key, no server route) — the overlay states this and fails closed rather than fabricating a response, per its own established design. Not new to this phase. |

## Existing operational screens

| Screen | Route | Real farm-scoped? | Mock dependency | Classification | Resolution |
|---|---|---|---|---|---|
| Livestock (overview) | `/livestock` | YES | None (`LivestockPageClient.tsx`, zero mock imports) | `REAL_DATA_WORKING` | Real farm has 1 real livestock group (`suckler_cow`, 20 head, grazing). |
| Livestock economics | `/livestock/[groupId]` | YES | `mockMarketPrices` (Bord Bia beef €/kg carcass fallback price for non-weanling animal types only) | `REAL_DATA_PARTIAL` | **Codex audit round 1 (CRITICAL), fixed**: this screen originally fed a real farmer's real steer/heifer group's margin/recommendation through the mock €5.42/kg constant unconditionally — a generic "estimates" footer did not make that safe. Fixed: real mode now shows an honest "Market data is currently unavailable" state for that animal-type path instead of computing from the fabricated price; the weanling path (real CSO live-mart prices) is unaffected. Round 2 fixed a real regression in that same fix (an unsupported group's fallback animal-type default could reach the same message, misdiagnosing it). **Round 3 (MEDIUM), fixed**: added `LivestockEconomicsView.test.tsx` — real component tests for all four cases (real steer suppressed, real weanling unaffected, demo mode unaffected, unsupported group falls through to `notFound()`), not relying on manual source inspection alone as the finding correctly required. `generateStaticParams` in the sibling `page.tsx` seeds build-time static params from `mockLivestockGroups`, but `dynamicParams` is not disabled, so a real farm's own Postgres-UUID group id still renders on-demand (`SAFE_DEMO_ONLY`, verified: no `dynamicParams = false` anywhere in either file). |
| Housing | `/housing` | YES | None | `HONEST_EMPTY_STATE` | Real farm has 0 housing rows. The screen's own header comment documents a prior real crash fix (`useHousingList()[0]` on zero housing) — verified still correct: renders "No housing recorded yet" + an add-shed form, never blank. |
| Soil | `/soil` | YES | None | `REAL_DATA_WORKING` / `HONEST_EMPTY_STATE` (per tab) | Real field has P/K Index but no `verifiedTest` — "Mapped"/"Assumptions" tabs show the real field; "Verified Tests" tab correctly shows "No fields match this filter yet" rather than a fabricated result. |
| Nutrients / Fertiliser Plan | `/nutrients` | YES | `mockSilagePlans` (silage-plan lookup only) | `REAL_DATA_WORKING` | A real field's UUID can never match a mock silage-plan's demo field id, so `silagePlan` correctly resolves `undefined` for every real field — the identical outcome as if this used `[]` directly. No real silage-plan feature exists for any field (real or mock) yet, so this is functionally correct, if slightly confusingly sourced; not a farmer-visible defect. |
| Spreading | `/spreading` | YES | `mockPlannedApplications`/`mockSpreadingScores` | `REAL_DATA_WORKING` | Both suppressed to `[]` behind `isRealMode` (verified). |
| Silage | `/silage` | YES | `mockSilagePlans`/`mockForageInventory` | `NOT_IMPLEMENTED` (disclosed) | Screen's own header comment documents this is deliberate: no sourced yield/DM-conversion model exists (`BLOCKERS.md` carried-over blocker). A real farm's field never matches the one demo plan, so the screen correctly renders "No silage plan for this farm yet... a real sourced yield model doesn't exist yet" rather than blank — already fixed in a prior session, verified still correct. |
| Input Planner | `/input-planner` | YES | `mockBuyingOpportunities`/`mockInputPlannerSummary`/`mockInputRequirements`/`mockSilagePlans` | `REAL_DATA_WORKING` | All four suppressed/replaced behind `isRealMode` (verified: `silagePlans: isRealMode ? [] : mockSilagePlans`, summary/heading text branches on `isRealMode`). |
| Feed Optimiser | `/feed-optimiser` | YES | `CATTLE_PRICE_EUR_PER_KG_CARCASS` (re-imported from `LivestockEconomicsView.tsx`) | `REAL_DATA_PARTIAL` | **Codex audit round 1 (CRITICAL), fixed**: this screen's zero direct `mock-farm` imports were misleading — it imports the same mock-derived cattle-price constant indirectly and used it, unconditionally, for a real steer group's margin figure via `FeedGroupSummaryCard`. Fixed the same way as Livestock economics: real mode with a real steer group now shows an honest "Market data is currently unavailable" card instead. **Round 3 (HIGH), fixed**: that card's own new copy claimed the feeding strategies below it were "based on real concentrate cost" — `STEER_CONCENTRATE_PRICE_EUR_PER_TONNE` (350) is itself a sourced planning-budget constant (Steer_2026_Budget), not this farm's own recorded/current price, "an incorrect provenance label on real euro figures." Corrected to describe it plainly as a modelled concentrate-cost assumption, not yet farm-specific. **Round 4 (MEDIUM), fixed**: the screen's own introductory "strategies optimise forecast margin" line contradicted that exact honest state (which shows no margin) — made conditional. **Round 4 (MEDIUM), fixed**: an earlier round's log entry claimed test coverage for "both fixed screens" when only `LivestockEconomicsView` was actually tested — `feed-optimiser/page.test.tsx` added for real (real steer suppressed, demo mode unaffected). **Round 5 (HIGH), fixed**: the round-4 conditional copy's own new text ("real feed cost") repeated the identical provenance overclaim round 3 had already corrected elsewhere in this same file — fixed for real this time, reworded to match the adjacent card's own honest phrasing exactly. |
| Finance | `/finance` | YES | Cards individually gate `isRealMode` (`CashflowCard`, `BestOpportunitiesCard`, `MarginHeroCard`, `FeedCostOverviewCard`, `LivestockValueCard`, `FertiliserSlurryCard` — verified, every one) | `REAL_DATA_WORKING` | `finance/page.tsx` is a real Server Component: `getFarmForCurrentUser()` + `listFinancialAssumptionsForFarm(farm.id)` (real: 2 rows for the Dev farm) + `listSupplierQuotesForFarm` (fails open to `[]`, real: 0 rows). |
| Market Prices | `/market-prices` | YES (filtered) | `mockMarketPrices` | `REAL_DATA_WORKING` | `isRealMode` filters `allMarketPrices` to only `status !== undefined` entries (real-sourced ones), not shown as farm-specific data anyway (public commodity prices) — verified. |
| Reports | `/reports` | YES | `mockSilagePlans` (CSV export only) | `REAL_DATA_WORKING` | Same natural-no-match reasoning as Nutrients; `isRealMode` explicitly passed into the CSV builder and used to choose `[]` over the mock array. |
| Settings | `/settings` | YES | None | `REAL_DATA_WORKING` | Verified: reads `useFarm()`/`useFarmActions()` directly, no `mock-farm` import anywhere in its own dependency chain (checked, not merely grepped-and-assumed, after round 1's own Feed Optimiser finding). |

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
