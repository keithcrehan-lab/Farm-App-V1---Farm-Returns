# Fertiliser Vertical — End-to-End Real Workflow Campaign — Phase 0 findings

Baseline: branch `farm-return-next`, commit `9458ef5` (Field Awareness
campaign closed clean). This document is the required Phase 0 inspection
record, written before any implementation, per this campaign's own
instruction.

## A. What fertiliser calculations are genuinely real today

`src/domain/nutrients.ts`'s `calculateNutrientPlan` — a mature, real,
Teagasc Green Book (5th Ed., 2020) and S.I. 588/2025-sourced engine.
Every numeric constant is cited to a named table (see
`docs/evidence-register.md`). Computes, per field:

- P/K Soil Index classification (`pIndexFromMgL`/`kIndexFromMgL`),
  fail-closed (`AMBIGUOUS_STATUTORY_BOUNDARY`) for a real published
  micro-gap.
- Gross N/P/K requirement (grazing via the suckler-to-beef LU curve, or
  silage via Tables 12-7/13-4/14-2).
- Real cattle-slurry organic offset (Table 9-8, DM%-and-rate
  interpolated, Index-1/2 P/K availability adjustment).
- NAP statutory N/P compliance ceilings (S.I. 588/2025 Tables 13/15a/
  15b/16/17), with real eligibility gating (elevated-rate ≥5%
  non-grass-area test, P build-up Article 17(6), cut-only
  sale-evidence test) — not a bare GSR-band lookup.
- Commonage/buffer-distance legal-prohibition suppression of the
  purchased-product blend.
- A real, deterministic 3-product purchased-fertiliser blend (0-7-30,
  18-6-12, Protected Urea) with real per-product rate/total/cost.
- Soil-test-age disregard downgrade (`regulatory: "planning_advice"`
  when the backing test is legally disregarded).

This is a **pure, real-time calculation** — it is called fresh on every
page load (`NutrientsPageClient.tsx`, `src/lib/reports.ts`), never
persisted, never cached. There is no existing server action wrapping it.

## B. Which calculations are scientifically sourced and verified

All of the above. Every constant is annotated with its Green Book table
number or S.I. 588/2025 table number in `nutrients.ts`'s own comments,
cross-checked against `docs/evidence-register.md`. This campaign adds no
new agronomic constant — every real number this campaign's own new code
uses is read from `calculateNutrientPlan`'s own already-verified output.

## C. Which values are mock/demo only

- **`SilagePlan`** (`mockSilagePlans`, `src/data/mock-farm.ts`) — no
  `src/lib/farm-data/silage*.ts` exists; this is client-store-only mock
  data with no real persistence. `calculateNutrientPlan`'s own silage
  branch is real *science*, but no real, persisted silage plan exists to
  feed it today.
- **Fertiliser product prices** (`nutrients.ts`'s own `PRODUCTS`
  constant, and `mockMarketPrices`' "Fertiliser" category,
  `src/data/mock-farm.ts`) — the module's own header comment already
  discloses these as "Phase 1 mock market data pending the real
  Finance/Market Prices integration; kept in sync manually." Not a
  verified live price feed despite the `source: "CSO"` label on the
  market-prices mock rows.
- **`mockJobs`/similar Records-screen demo rows**, where present — none
  found feeding the *nutrient* calculation itself; the calculation's own
  inputs (`Field`, `LivestockGroup[]`, `SlurryAllocation`) are all real,
  farm-scoped, persisted records.

## D. What farmer-entered assumptions currently exist

`Field.fertility` (P/K Soil Index, verified lab test or farmer estimate),
`Field.plannedUse`, `Field.commonageStatus`, `Field.waterBufferContext`,
`SlurryAllocation` (real, persisted, `slurry_allocations` table) — all
real, farm-scoped, already feed `calculateNutrientPlan` today.

## E/F. Whether real planned fertiliser applications currently exist

**No.** There is no persisted "planned fertiliser application" entity
anywhere in this codebase. `NutrientsPageClient.tsx` shows a live,
always-recomputed recommendation with **no "Plan this application" CTA,
no persistence, and no connection to jobs/GPS at all**
(`PurchasedFertiliserCard.tsx` is a pure display table). This is the
central gap this campaign closes.

## G. Whether Confirm Actual can already represent fertiliser quantity/product

**Yes, already real.** `src/domain/job-actual.ts`'s `FertiliserSpreadingActual`
(`activityType: "fertiliser_spreading"`, `completionType`, `fieldIds`,
`product?: string` — free text, `quantity?: number`, `quantityUnit?: "kg"|"t"|"bags"`,
`areaHa?`, `note?`) is validated by `validateFertiliserSpreadingActual`
and persisted via the real, `VALIDATED_DEV`, 3-round-audited
`job_actuals` table/`confirm_job_session_actual` atomic RPC
(`supabase/migrations/20260902010000_job_actuals.sql` and siblings) —
insert-only, revision-chained, farm-scoped by trigger, RLS-protected.
`ConfirmActualSheet.tsx` already renders real product/quantity/quantityUnit
inputs for `fertiliser_spreading` — but **prefills nothing** from any
plan (there is no plan to prefill from today).

## H. How GPS Job Mode currently identifies fertiliser work

`GpsActivityCandidateCard.tsx` hardcodes
`const ASSUMED_ACTIVITY_TYPE = "fertiliser_spreading"` — every real
GPS-detected candidate today is assumed to be fertiliser spreading, and
`confirm()` calls `startManualJobSessionAction` with `origin: "detected"`,
always constructing a **synthetic** authorisation Decision
(`constructManualJobStartDecision`) — never looking up or linking to any
pre-existing plan. This is the exact gap item 10/11 of this campaign's
brief names.

## I. Whether actual fertiliser records currently update nutrient state

**No.** `calculateNutrientPlan` has no parameter for "previously
confirmed applications this season" — it computes only the gross
requirement and the organic offset, with no notion of a remaining
balance after real spreading has occurred. This campaign adds this as
new, additive domain logic (`src/domain/fertiliser-plan.ts`), reusing
`calculateNutrientPlan`'s own output, never re-deriving it.

## J. Whether farm-wide fertiliser demand currently derives from field requirements

**No** — no aggregation of any kind exists across fields today. New in
this campaign.

## K. Whether inventory is real, partial, mock or absent

**Absent.** No `inventory`/`stock` table, domain module, or UI surface
of any kind exists for fertiliser product. Per this campaign's own item
17, no inventory subsystem is built — an extension point is preserved
(a confirmed actual's real quantity/unit is available for a future
inventory feature to consume without re-deriving anything).

## L. Whether fertiliser costs are real, partial, mock or absent

**Mock, disclosed as such.** See finding C above. This campaign does not
build a new pricing/profitability engine (item 32) and does not invent a
verified price for a farmer-entered product it cannot corroborate
against the real 3-product catalogue.

## M. What can safely be reused

- `calculateNutrientPlan`/`NutrientPlan`/`FertiliserProduct` (`nutrients.ts`,
  `types.ts`) — the requirement/recommendation engine, unmodified.
- `Prompt`/`buildPrompt`/`describeBlockedBasis` (`orchestration/prompt/index.ts`).
- `decideAsFarmer`/`Decision` (`orchestration/decide/index.ts`) — already
  supports an `edits?: Record<string, unknown>` parameter, unused by any
  producer today.
- `submitPromptDecisionAction` (`app/actions/decisions.ts`) — the real,
  server-recompute-only, secure "Accept/Edit/Dismiss a Prompt" action.
- `job_sessions`/`job_actuals` (real tables, real atomic RPC,
  `VALIDATED_DEV`), `startJobSessionFromPrompt`/`createJobSessionFromDecision`
  (`orchestration/job-session/index.ts`) — `job_sessions.decisionId` is a
  real, indexed FK; `createJobSessionFromDecision` already accepts *any*
  real `Decision` object, not only a freshly-constructed one.
- `listConfirmedJobSessionsForFarm`/`listJobSessionDecisionIdsForFarm`
  (`lib/farm-data/job-sessions.ts`) — already exactly the farm-scoped
  reads needed to determine "planned but not yet started" and "confirmed
  applications for a field."
- `listSlurryAllocationsForFarm`/`listLivestockGroupsForFarm`/
  `listFieldsForFarm` — real, farm-scoped, already used by
  `calculateNutrientPlan`'s existing callers.
- `EngineOutcome<T>`/`isOk`/`TrackedValue`/`DataStatus` — the existing
  provenance/confidence vocabulary; no new one is introduced.

## N. What must not be duplicated

- The nutrient/NAP/slurry-offset science itself (`nutrients.ts`) — never
  re-derived; every new function in this campaign takes `NutrientPlan`
  (or a real confirmed Actual) as an input, never recomputes a table
  lookup.
- The spreading-window legal gate (`spreading-window-gate.ts`,
  `promptForSpreadingWindow`) — reused by reference, never re-implemented
  as a second "AI spreading score."
- The Job Session lifecycle state machine (`job-session-lifecycle.ts`) —
  the fertiliser vertical's own "status" is derived entirely from the
  existing Decision `outcome` + Job Session `status`, never a new,
  competing status enum.
- The Confirm Actual persistence/idempotency machinery
  (`confirmJobSessionActual`) — reused verbatim; no fertiliser-only
  completion engine is built.

## Architecture decision this Phase 0 makes possible: no new "Plan" table

Because `decisions` already carries `fieldId`, a full `estimateSnapshot`
(which can hold the entire real `NutrientPlan` recommendation, product
list, and cost), and a schemaless `edits` jsonb column, and because
`job_sessions.decisionId` already links a real Job Session back to
*any* real, pre-existing accepted Decision (not only one freshly
constructed at start time) — **the canonical "planned fertiliser
application" this campaign needs is a real, accepted `decisions` row of
a new kind, `fertiliser_recommendation`, with no new migration
required.** Its lifecycle is derived, not stored, from existing states:

| Conceptual state | Real, existing fact |
|---|---|
| Suggested | A live Prompt exists (real-time; never persisted) |
| Planned | An accepted `fertiliser_recommendation` Decision exists, with no `job_sessions` row yet (`listJobSessionDecisionIdsForFarm`) |
| Active | A `job_sessions` row exists, `status` in `ready`/`active`/`paused` |
| Completed — estimated | `job_sessions.status = completed_estimated` |
| Completed — actual | `job_sessions.status = confirmed_actual`, a real `job_actuals` row exists |
| Dismissed | Decision `outcome = "dismissed"` |

A planned date/window is stored inside the Decision's own `edits` (a
new, narrowly-scoped, allowlisted key — `plannedDate` — mirroring the
existing `MANUAL_JOB_START_RESERVED_OUTCOME_KEYS` discipline of a strict
allowlist, never free-form). This avoids a migration entirely, per this
campaign's own item 30 preference.

## Deliberate scope decisions (documented, not silent)

- **Silage-specific fertiliser plans are out of scope this campaign** —
  no real, persisted `SilagePlan` exists to plan against; the new
  fertiliser-recommendation Prompt always computes the real *grazing*
  branch of `calculateNutrientPlan` server-side. Silage recommendations
  remain visible on the existing (unmodified) Nutrients screen, using
  the existing mock `SilagePlan`, exactly as today — not extended into
  the new Plan → Job → Actual loop.
- **Fertiliser product cost is never treated as verified** — the 3
  known catalogue products' prices remain the existing, disclosed mock
  figures; no confirmed Actual computes or persists a monetary cost.
  Quantity/nutrient contribution are recorded honestly; monetary impact
  stays unavailable, per this campaign's own item 18.
- **Inventory is not built** — item 17.
- **A confirmed Actual's real nutrient contribution can only be computed
  when its farmer-entered `product` text matches one of the 3 real,
  known catalogue compositions** (0-7-30, 18-6-12, Protected Urea) —
  the only product compositions this app has ever verified. Any other
  farmer-entered product records a real, honest quantity but an
  honestly **unavailable** nutrient contribution (fail closed, per this
  campaign's own non-negotiable rule against inventing a product
  composition).
