# Fertiliser Vertical — End-to-End Real Workflow campaign

Baseline: branch `farm-return-next`, commit `9458ef5` (Farm Awareness /
Satellite Field Intelligence campaign closed clean, round 11). Phase 0
findings: `docs/farm-return-next/FERTILISER_VERTICAL_PHASE0.md` (read
first — this document assumes it).

## Objective

Make fertiliser the first genuinely complete Farm Return vertical: prove
the product can carry a scientific estimate all the way through
**Estimated → Planned → Prompted → Performed → Confirmed → Actual →
Updated future state**, using the shared Farm Return orchestration model
(Observe→Estimate→Prompt→Decide→Act→Confirm→Actual→Learn), not a
fertiliser calculator sitting beside the rest of the app.

## Architecture decision: no new "Plan" table

Restated from the Phase 0 doc, since every other decision in this
campaign depends on it. `decisions` already carries `fieldId`, a full
`estimateSnapshot` (which can hold an entire `NutrientPlan` recommendation
snapshot), and a schemaless `edits` jsonb column; `job_sessions.decisionId`
already links a real Job Session back to *any* real, pre-existing
accepted Decision. So the canonical planned fertiliser application is a
real, accepted/edited `decisions` row of kind `fertiliser_recommendation`
— **no new table, no migration.**

| Conceptual state | Real, existing fact |
|---|---|
| Suggested | A live `fertiliser_recommendation` Prompt exists (real-time, never persisted) |
| Planned | An accepted/edited `fertiliser_recommendation` Decision exists, with no `job_sessions` row yet (`listJobSessionDecisionIdsForFarm`) |
| Active | A `job_sessions` row exists, `status` in `ready`/`active`/`paused` |
| Completed — estimated | `job_sessions.status = completed_estimated` |
| Completed — actual | `job_sessions.status = confirmed_actual`, a real `job_actuals` row exists |
| Dismissed | Decision `outcome = "dismissed"` |

A planned date/window lives inside the Decision's own `edits` jsonb
(`plannedDate`) — one of exactly three keys a strict allowlist
(`validateFertiliserPlanEdits`) ever permits.

## What was built, module by module

### Domain (`src/domain/`, pure, no I/O)

- **`nutrients.ts`** gained one additive export,
  `knownFertiliserProductComposition(productName)` — looks up one of the
  three real, verified catalogue products' own N/P/K composition by
  exact name. `undefined` for anything else, never a fuzzy match.
  `calculateNutrientPlan`/`allocatePurchasedProducts` themselves are
  entirely unmodified.
- **`fertiliser-plan.ts`** (new module) —
  - `nutrientContributionFromFertiliserActual` — a confirmed Actual's
    real nutrient contribution, fail-closed (`BLOCKED_INSUFFICIENT_EVIDENCE`)
    for a missing product/quantity, an unrecognised product, or a
    `"bags"`-unit quantity (no verified bag weight exists anywhere in
    this app).
  - `sumConfirmedFertiliserApplications` — sums real applications,
    honestly disclosing how many could not be resolved rather than
    silently dropping them.
  - `calculateRemainingFertiliserRequirement` — `max(0, requirement −
    confirmed)` per nutrient, per hectare; fails closed on a missing/
    invalid field area rather than fabricating a total (campaign item 6).
  - `aggregateFarmFertiliserRecommendation` — sums real
    `NutrientPlan.purchasedProducts` across fields, by product.
  - `totalProductQuantityKgByProduct`/`aggregateFarmFertiliserDemand`/
    `toFarmInputDemand` — the farm-wide **recommended/planned/confirmed/
    remaining** demand totals by product, and the `FarmInputDemand`
    read-model shape a future commercial demand-aggregation system can
    consume without reinterpreting fertiliser science (item 20).

### Orchestration (`src/orchestration/`, real farm-scoped I/O + Prompt producers)

- **`prompt/fertiliser-recommendation.ts`** — `promptForFertiliserRecommendation`,
  the fifth real Prompt producer, now fanned out per field by
  `buildAllRealPrompts` alongside the existing four. Classifies
  `calculateNutrientPlan`'s own real output into `BLOCKED_INSUFFICIENT_EVIDENCE`
  (no soil index), `NOT_APPLICABLE` (`NO_FERTILISER_CURRENTLY_RECOMMENDED`
  — a real recommendation of zero products, whether from Index 4 soil or
  a commonage/buffer legal suppression), or `OK` (a real
  `FertiliserRecommendationSummary`). Also exports
  `validateFertiliserPlanEdits` — the narrow `plannedProduct`/
  `plannedQuantityKg`/`plannedDate` allowlist "Plan this application"
  edits must pass through, checked against the real, server-recomputed
  recommendation, never trusted verbatim from the client.
- **`prompt/build-all.ts`** — gained `computeFarmGrasslandAggregates`
  (extracted, not duplicated) so both `buildAllRealPrompts` and
  `recompute.ts`'s server-side single-field recompute use the identical
  real farm-wide grassland-area/non-grass-% figures.
  `buildAllRealPrompts`'s own signature grew two required parameters
  (`livestockGroups`, `slurryAllocations`) — every real call site
  (Today, Plan, Fields) updated.
- **`prompt/recompute.ts`** — `RecomputablePromptKind` gained
  `"fertiliser_recommendation"`; recomputing it needs the farm's full
  field list (for the farm-wide aggregate) plus real livestock/slurry
  data, supplied by the caller (`decisions.ts`, `job-sessions.ts`).
- **`fertiliser-plan/index.ts`** (new module) —
  `getFieldRemainingFertiliserRequirement` (real confirmed
  `fertiliser_spreading` Actuals for one farm+field, summed and
  converted to remaining kg/ha) and `getFarmFertiliserDemand` (the same
  three-column real aggregation — recommended from every field's
  `NutrientPlan`, planned from every real explicit farmer edit,
  confirmed from every real farm-wide confirmed Actual — combined by the
  pure domain function above).
- **`job-session/index.ts`** gained `startJobSessionFromPlan` — starts a
  Job Session from an **already-existing, already-persisted, accepted**
  plan Decision. Deliberately never calls `insertDecision` (the plan was
  already inserted at "Plan this application" time — inserting it again
  would fabricate a second historical decision event for the same real
  plan, violating item 25's "do not overwrite history"). `origin: "plan"`
  on `job_sessions` existed at the schema level before this campaign but
  had no real, distinct caller; `startJobSessionFromPrompt`'s own
  `origin` was narrowed to the literal `"prompt"` in the same change so
  the two meanings — "a fresh Decision was constructed at Start" vs.
  "this session's Decision already existed" — can never be conflated.
- **`ai-context/index.ts`** — `FarmContext` gained a `fertiliserDemand`
  field (item 21), populated from `getFarmFertiliserDemand`. No LLM
  reads this yet — this module still connects to nothing beyond its own
  read boundary.

### Server actions (`src/app/actions/`)

- **`decisions.ts`** — `submitPromptDecisionAction` extended (additive)
  to fetch livestock/slurry data and pass the farm's full field list
  when recomputing a `fertiliser_recommendation` Prompt, and to accept
  an optional `edits` object for `outcome: "edited"`, validated via
  `validateFertiliserPlanEdits` against the real, server-recomputed
  recommendation before ever reaching `insertDecision`. Every existing
  promptKind's behaviour is unchanged.
- **`job-sessions.ts`** — `startJobSessionFromPromptAction`'s own
  `origin` narrowed to `"prompt"` (see above); its recompute branch
  extended the same way `decisions.ts`'s was for a
  `fertiliser_recommendation` promptKind.
- **`fertiliser-plan.ts`** (new file) —
  - `getMatchablePlanForFieldAction(fieldId)` — the GPS-plan-matching
    lookup (item 10/11). "Matchable" means: this field,
    `fertiliser_recommendation`, outcome `accepted`/`edited`, not already
    linked to any job session. Returns `"none"`/`"ambiguous"`/`"matched"`
    — never auto-selects among multiple real candidates.
  - `startJobSessionFromPlanAction` — validates farm ownership (via a
    fresh farm-scoped read, never trusting a caller-supplied farm id),
    outcome, calculationKind, field match, and no-existing-link before
    calling `startJobSessionFromPlan`.
  - `getLinkedFertiliserPlanForJobSessionAction(jobSessionId)` — Confirm
    Actual prefill (item 12): the real planned product/quantity/date
    behind a `"plan"`-origin session, or `null` when there is genuinely
    nothing to prefill from.
  - `getFieldFertiliserStatusAction(fieldId)` — the real remaining-
    requirement read (item 14), recomputing the field's live
    recommendation server-side and combining it with real confirmed
    Actuals via `getFieldRemainingFertiliserRequirement`.
  - `getFarmFertiliserDemandAction()` — the farm-wide `FarmInputDemand[]`
    read (items 19/20).

### UI (`src/components/farm/`, `src/app/(app)/`)

- **`FertiliserPlanSheet.tsx`** (new) — "Plan this application", wired
  into the Nutrients screen. Two distinct real actions: **Accept as
  recommended** (`outcome: "accepted"`, no edits at all) and **Save my
  plan** (`outcome: "edited"`, the farmer's own chosen product/quantity/
  date) — matching item 4's "must not collapse into one mutable value".
  Shows the field's own real, current spreading-window status
  (`promptForSpreadingWindow`'s title/description — the same real,
  calendar-only legal gate Today/Plan already surface) so a farmer sees
  genuine timing context at the moment of planning, without a second,
  invented "spreading suitability" score (item 7).
- **`RemainingFertiliserRequirementCard.tsx`** (new) — the real
  remaining-requirement UI, Nutrients screen. Renders nothing outside
  real mode or when genuinely `NOT_APPLICABLE`; shows the honest blocked
  reason otherwise, or the real requirement/applied/remaining per
  nutrient.
- **`GpsActivityCandidateCard.tsx`** — before offering to confirm a
  detected candidate, looks up a matchable plan for the candidate field.
  A single unambiguous match links the new job session to it
  (`startJobSessionFromPlanAction`, disclosed in the card's own copy);
  ambiguous/none falls back to the pre-existing unlinked "detected"
  origin path, unchanged.
- **`ConfirmActualSheet.tsx`** — gained an optional `linkedPlan` prop.
  Prefills `product`/`quantity` exactly once, the first time real plan
  data arrives, using the functional-update form so a farmer who has
  already started typing is never overwritten regardless of timing.
  Discloses "Planned: X kg Y" alongside the existing "Farm Return
  observed" panel when a plan is linked.
- **`ActiveJobSessionView.tsx`** — fetches the linked plan for a
  `"plan"`-origin session and passes it through to `ConfirmActualSheet`.
- **`NutrientsPageClient.tsx`** — wires `FertiliserPlanSheet`/
  `RemainingFertiliserRequirementCard` in below the existing
  `PurchasedFertiliserCard`, computing the same spreading-window Prompt
  Today/Plan already compute (client-side, no duplication).

## Recommendation vs Plan vs Actual — kept genuinely distinct

- **Recommendation** — `calculateNutrientPlan`'s own live output,
  re-derived fresh every time; never persisted on its own.
- **Plan** — a real, persisted, accepted/edited Decision whose
  `estimateSnapshot` is a frozen copy of the recommendation *at
  acceptance time*, and whose `edits` (when present) carry the farmer's
  own explicitly chosen product/quantity/date — a materially different
  value from the recommendation is fully representable and never
  silently overwrites the frozen `estimateSnapshot`.
- **Actual** — a real, confirmed `job_actuals` row, farm/field-scoped,
  timestamped, immutable/revision-chained per the existing Confirm
  Actual contract. Its own nutrient contribution
  (`nutrientContributionFromFertiliserActual`) is computed independently
  of what was recommended or planned — a farmer who applies materially
  different quantities than either shows exactly that discrepancy, never
  a silently reconciled number.

Nothing in this campaign ever merges these three into one mutable field.

## GPS integration and plan matching (items 10/11)

Flow: a farmer plans an application (`FertiliserPlanSheet`) → later
enters the field → the existing, unmodified GPS Activity Candidate
detector (`gps-activity-detection.ts`, untouched) reaches
`candidate_start` → `GpsActivityCandidateCard` looks up a matchable plan
for that field → if exactly one real, unlinked, accepted/edited
`fertiliser_recommendation` Decision exists for that field, the card
discloses the match and links to it on confirm
(`startJobSessionFromPlanAction`); otherwise it falls back to the
pre-existing unlinked path, unchanged. No existing GPS detection
heuristic was modified. Farmer confirmation remains required for both
Start and Finish, exactly as before.

## Spreading-window connection (item 7)

`FertiliserPlanSheet` shows the field's real, current, calendar-only
statutory spreading-window status (`promptForSpreadingWindow` — the same
Prompt Today/Plan already surface per field) as a "Timing" panel. This
answers "is this planned application currently well timed?" using only
inputs the existing spreading engine already verifies (the statutory
closed-period calendar) — no ground/weather composition, since (per
`spreading-window.ts`'s own long-standing, unmodified header comment)
this app has no live per-field weather/ground-condition capture wired to
any screen. No new "spreading suitability" score was invented; the
spreading engine itself is completely untouched.

## Remaining requirement (item 14)

`RemainingFertiliserRequirementCard` shows, per nutrient: the field's
real requirement (kg/ha), real confirmed-applied (kg/ha, from every real
confirmed `fertiliser_spreading` Actual for that field whose product/
quantity resolves to a known catalogue composition), and the real
remaining figure (`max(0, requirement − confirmed)`, never negative).
Genuinely un-resolvable applications (an unrecognised product, or a
`"bags"` unit) are disclosed by count, never silently folded into either
number. A missing/invalid field area fails the whole conversion closed,
showing the honest reason rather than a fabricated total.

**Projected vs confirmed remaining, honestly**: this campaign's own
remaining-requirement figure is built entirely from *confirmed* Actuals
— a planned-but-unconfirmed application never reduces it (matching the
brief's own instruction not to let planned applications count as
performed). A dedicated "projected remaining" (accounting for an
in-flight plan) was considered and deliberately not built this campaign
— the architecture supports adding it later without changing this
figure's own meaning.

## Farm-wide demand and the future demand-aggregation hook (items 19/20)

`getFarmFertiliserDemandAction` returns a `FarmInputDemand[]` — one row
per product, each carrying `totalRequirementKg` (recommended, from every
field's real `NutrientPlan`), `plannedRequirementKg` (from every real,
explicit farmer plan edit — see the judgement call below),
`confirmedRequirementKg` (from every real confirmed Actual farm-wide),
`remainingRequirementKg`, `unit: "kg"`, and `confidence: "estimated"`.
No supplier marketplace, RFQ engine, or purchasing functionality is
built — this is a read-only summary a future commercial demand-planning
campaign can aggregate across farms without reinterpreting fertiliser
science itself.

**Disclosed product judgement call**: a plain `accepted` Decision (no
explicit `edits.plannedProduct`/`plannedQuantityKg`) is excluded from
the **planned** total, though it still counts toward **recommended** —
when more than one product is recommended for a field, a bare acceptance
doesn't by itself say which product/quantity the farmer means to plan,
and guessing would be exactly the kind of fabricated interpretation this
campaign's brief forbids. Full rationale: `docs/evidence-register.md`.

## REAL / DERIVED / ESTIMATED / SIMULATED / MOCK / UNAVAILABLE (item 29)

| Capability | Classification |
|---|---|
| N/P/K requirement, product blend, NAP compliance | **REAL** — `nutrients.ts`, unmodified, Teagasc/S.I. 588/2025-sourced |
| A planned application's product/quantity/date | **REAL** (farmer-entered, once "Plan this application" is used) or **DERIVED** (the raw recommendation, if accepted as-is) |
| A confirmed Actual's product/quantity | **REAL** — farmer-confirmed, immutable/revision-chained |
| A confirmed Actual's nutrient contribution | **DERIVED** when the product matches the 3-product catalogue; **UNAVAILABLE** (fails closed) otherwise |
| Remaining requirement (per field) | **DERIVED** — real requirement minus real confirmed-applied |
| Farm-wide demand totals | **DERIVED** — real per-field/per-Decision/per-Actual data, aggregated |
| GPS-to-plan match | **REAL** (deterministic filter over real, farm-scoped rows) — never a probabilistic/fabricated score |
| Spreading-window timing status | **REAL** — unmodified statutory calendar gate |
| Fertiliser product price / monetary cost of a confirmed Actual | **MOCK** (unchanged from before this campaign) / **UNAVAILABLE** — never computed or persisted for a real Actual |
| Silage-branch server-side recommendation | **UNAVAILABLE** — no real persisted `SilagePlan` exists; the new Prompt producer always computes the grazing branch |
| Farm-wide demand exposed to a purchasing/supplier system | **Not built** — the read model exists (`FarmInputDemand`), nothing consumes it yet |

No farmer-facing production workflow in this campaign depends silently
on mock data — every mock/unavailable case above is either disclosed in
the UI (an honest blocked/unavailable state) or simply not built.

## Deliberately NOT built (documented, not silent)

- Supplier marketplace, RFQ engine, supplier emails, payments (item 32).
- A new inventory subsystem — no real, mature inventory model exists to
  connect to (item 17); the confirmed Actual's real quantity/unit is
  available for a future inventory feature without re-deriving anything.
- A new profitability engine or unverified fertiliser prices (item 18).
- Silage-branch server-side Prompt/recommendation — no real, persisted
  `SilagePlan` exists (Phase 0 finding C).
- New GPS heuristics, background GPS, native mobile packaging — out of
  this campaign's scope per its own "do not build" list.
- A farm-wide demand *UI* surface (beyond the new server action and
  `FarmContext` field) — the read model is real and tested; a dedicated
  screen was judged out of scope for "one complete, trustworthy loop"
  over "the number of fertiliser features".
- A "projected remaining" figure that discounts an in-flight, unconfirmed
  plan — see the Remaining requirement section above.

## Known limitations

- Only 3 real, verified fertiliser products exist app-wide (0-7-30,
  18-6-12, Protected Urea) — a confirmed Actual's free-text `product`
  field only yields a real nutrient contribution on an exact match; any
  other product (including any `"bags"`-unit quantity) fails closed.
- GPS plan matching has no time-window narrowing — the only real
  "planned date" this app has is the optional `edits.plannedDate`; a
  farmer with two genuinely unlinked plans for the same field (rare, but
  possible) sees `"ambiguous"`, not an automatic resolution.
- The planned/confirmed farm-wide demand totals only recognise an
  *explicit* farmer plan edit for the planned column (see the judgement
  call above) — a bare "accepted" recommendation with multiple products
  contributes to recommended but not planned.
- **Pre-existing, disclosed `job_sessions` schema limitation** (found
  during Codex audit round 3, not introduced by this campaign): the
  database's own `unique(decision_id)` constraint means a plan Decision
  can only ever be linked to *one* job session, ever — including a
  cancelled one. A farmer who starts a job from a real plan and then
  cancels it can never link that exact same plan to a fresh job session
  again; a genuinely new job (and, if desired, a fresh plan) is needed.
  Farm-wide demand correctly still counts such a cancelled-and-abandoned
  plan as "planned" (round 3's own fix), so the farmer sees it as still
  outstanding — but the UI does not yet surface "this plan's own job was
  cancelled, start a new one" as a distinct message. Changing the
  underlying constraint is outside this campaign's authority (a frozen,
  independently-audited GPS Job Mode contract).
- **`submitPromptDecisionAction` has no retry-idempotency, for any real
  Prompt kind** (found during Codex audit round 4, not introduced by
  this campaign — a real, pre-existing property of shared infrastructure
  used by all five Prompt producers). A network failure after a genuine
  insert succeeds, or a farmer accepting the same live recommendation
  twice before the Nutrients screen's own "already planned" disclosure
  (round 4's own real, in-scope mitigation) catches up, can create two
  real accepted plan Decisions for the same field. `getMatchablePlanForFieldAction`
  correctly reports `"ambiguous"` rather than guessing between them
  (never a false GPS link), and only an explicit farmer plan edit
  contributes to farm-wide *planned* demand (a bare double-acceptance
  does not inflate it) — but a genuine idempotency fix would need a
  stable client/action idempotency key threaded through
  `submitPromptDecisionAction`/`decideAsFarmer`/`insertDecision`, a
  cross-cutting change to code four other Prompt kinds also depend on.
  Deliberately not attempted in this campaign (item 24: reuse an
  existing idempotency pattern, never invent a brittle one-off) —
  flagged here as a real, disclosed gap for a future cross-cutting pass.
- No caching layer exists for the new remaining-requirement/demand reads
  — each call recomputes from a fresh farm-scoped read, matching every
  other real orchestration function in this app; acceptable at today's
  real data volumes, a candidate for future optimisation if it ever
  isn't.

## Codex audit round 1 — 2 Critical, 6 High, 2 Medium: 9 fixed, 1 rejected

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5` (this campaign's own baseline), tailored to this campaign's
own 18-point focus list (fabricated science, unit conversions, planned-
vs-actual conflation, remaining-requirement correctness, cross-farm
access, GPS-matching safety, idempotency, stale React state, migration
safety, mock-data leakage, price usage, provenance, Today/Prompt
duplication, farm-wide aggregation, FarmContext leakage, regression,
documentation accuracy, ordinary correctness).

- **CRITICAL, fixed** — an unresolved-composition confirmed application
  was summed as zero and the remaining figure presented as exact. Fixed:
  `RemainingFertiliserRequirementCard` now shows "at least"/"at most"
  bounds whenever `applicationsWithUnknownComposition > 0`, with the
  caveat moved above the figures, not a footnote.
- **CRITICAL, fixed** — `listConfirmedJobSessionsForFarm`'s own real
  `truncated` flag (200-row cap) was silently discarded, understating
  applied totals with no indication anything was missing. Fixed:
  `truncated` now flows through `getFieldRemainingFertiliserRequirement`/
  `getFarmFertiliserDemand`/both actions to the UI.
- **HIGH, fixed** — no season/accounting-period boundary: a confirmed
  application from a prior year would permanently suppress a freshly
  recomputed current-year requirement. Fixed: scoped to the current
  calendar year (`startOfCalendarYearIso`) — the same annual cadence
  S.I. 588/2025's own NAP ceilings and closed-period calendar already
  use, disclosed as a product judgement call, not a new scientific rule.
- **HIGH, fixed** — field attribution used `job_sessions.primaryFieldId`
  (where work *started*) instead of the confirmed Actual's own
  authoritative `payload.fieldIds` — the identical class of bug Field
  Awareness's own campaign already found and fixed for its own
  confirmed-activity matching. Fixed: matches by `payload.fieldIds`; a
  multi-field Actual (no real per-field allocation evidence) is now
  excluded from field-level remaining rather than double-counted or
  guessed, disclosed via a new `applicationsExcludedMultiField` count.
- **HIGH, fixed** — the farm-wide demand aggregator only ever iterated
  `recommended`, so a real planned/confirmed product no field currently
  recommends silently vanished from the report. Fixed:
  `aggregateFarmFertiliserDemand` now includes every such product with
  an honest `recommendedTotalKg: 0`. The deeper "different product,
  equivalent nutrient" cross-substitution question remains a disclosed,
  documented limitation (see "Deliberate scope decisions" above) — this
  campaign does not invent a cross-product nutrient-equivalence rule.
- **HIGH, fixed** — `getMatchablePlanForFieldAction` ignored both real
  reads' own `truncated` flags, so a hidden extra/hidden-already-linked
  candidate could turn a genuinely ambiguous match into a false
  `"matched"`. Fixed: either truncation now fails the whole lookup to
  `"ambiguous"`.
- **HIGH, fixed** — `startJobSessionFromPlanAction` accepted
  `ActivityType | string` and passed it straight through, so a direct
  caller could link a real fertiliser plan to an unrelated job type.
  Fixed: narrowed to the literal `"fertiliser_spreading"`, checked at
  runtime.
- **HIGH, rejected (verified, not reachable)** — claimed `linkedPlan`
  React state could leak from one job session to another. Verified
  against `job/[id]/page.tsx`'s own existing `key={id}` on
  `ActiveJobSessionView` (added in the GPS Job Mode campaign's own round
  7, specifically to guarantee a fresh instance per distinct job session
  id) plus the database's own `job_sessions.origin`/`decision_id`
  immutability-after-insert trigger: within one mounted instance, the
  new effect's own dependency array (`session?.id`, `session?.origin`)
  can never change to a different value, so it can neither leak into nor
  out of a different session. No code change; documented here as the
  verification, not merely asserted.
- **MEDIUM, fixed** — `plannedDate` validation checked only the
  `YYYY-MM-DD` shape, accepting a non-existent date like `2026-02-31`.
  Fixed: reuses `isValidIsoUtcDateTime`'s own real, leap-year-aware
  calendar validation.
- **MEDIUM, fixed** — `FertiliserPlanSheet`'s product/quantity state
  seeded once at mount, stale if the selected field changed while the
  sheet remained mounted. Fixed: `key={field.id}` on its render call
  site forces a fresh instance per field.

Quality gate after round 1: 1915/1915 tests (145/145 files), typecheck/
lint/build all pass — up from 1904/1904 (145/145), +11 new tests.

## Codex audit round 2 — 0 Critical, 3 High, 2 Medium: all 5 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to (1) independently verify round 1's own fixes rather
than trust the architecture doc's description, (2) re-evaluate the
round-1 rejected `linkedPlan` finding for a genuinely new angle, and
(3) look specifically for a new issue introduced by round 1's own
fixes. Round 1's fixes were all confirmed correct and present; the
`linkedPlan` rejection was independently re-confirmed sound (no new
angle found). Every genuine finding this round was a real gap in round
1's own fixes, not a pre-existing issue round 1 missed:

- **HIGH, fixed** — round 1's calendar-year season boundary was applied
  only to `getFieldRemainingFertiliserRequirement` (field-level), not
  `getFarmFertiliserDemand` (farm-wide) — a prior-year confirmed
  application could still silently reduce this year's farm-wide
  remaining total. Fixed: the identical boundary now applies to both.
- **HIGH, fixed** — `getFarmFertiliserDemand`'s own `plannedTotalKg`
  summed every accepted/edited Decision indefinitely, including one
  already linked to a job session — contradicting this campaign's own
  documented lifecycle ("Planned" = accepted Decision with no
  `job_sessions` row *yet*). A performed plan was therefore counted as
  both planned and confirmed simultaneously, forever. Fixed: a plan
  already present in `listJobSessionDecisionIdsForFarm` is now excluded
  from the planned total.
- **HIGH, fixed** — a confirmed `completionType: "did_not_happen"`
  fertiliser Actual (whose own real product/quantity are genuinely
  absent, not merely unrecognised — `FertiliserSpreadingActual`'s own
  doc comment) passed the activity/field filters and was then
  miscounted as an "unknown composition" application, making the UI
  imply a real application occurred when the authoritative record says
  it didn't. Fixed: `did_not_happen` is now excluded before any
  counting, in both the field-level and farm-wide functions.
- **MEDIUM, fixed** — `getFarmContextForCurrentUser` destructured only
  `demand` from `getFarmFertiliserDemand`'s result, discarding its real
  `truncated` flag — `FarmContext` could present an incomplete
  planned/confirmed total as an ordinary, complete estimate. Fixed:
  `FarmContext` gained `fertiliserDemandTruncated`, threaded through
  from the same real read.
- **MEDIUM, fixed** — Confirm Actual prefill
  (`getLinkedFertiliserPlanForJobSessionAction`) searched
  `listDecisionsForFarm`'s own capped, most-recent-first 200-row read; a
  real plan Decision older than that window silently resolved to "no
  plan found", indistinguishable from a session with genuinely nothing
  to prefill from. Fixed: a new, real, single-row, uncapped, farm-scoped
  `getDecisionById(farmId, decisionId)` (`src/lib/farm-data/decisions.ts`)
  looks the plan up directly by the job session's own real `decisionId`
  — no cap possible on a single-row lookup.

Quality gate after round 2: 1925/1925 tests (145/145 files), typecheck/
lint/build all pass — up from 1915/1915 (145/145), +10 new tests.

## Codex audit round 3 — 0 Critical, 2 High, 0 Medium: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 2's fixes by reading real code and
specifically look for a new issue round 2's own fixes might have
introduced (the same pattern that produced round 2's own findings).
Both real findings this round were exactly that — a new gap introduced
by round 2's own "exclude an already-linked plan from planned" fix:

- **HIGH, fixed** — round 2's fix excluded a plan from the farm-wide
  planned total whenever its Decision id appeared in
  `listJobSessionDecisionIdsForFarm` — which returns a decision linked
  to **any** job session, including a **cancelled** one. A cancelled
  session produces no real Actual, so the plan behind it is genuinely
  still outstanding — round 2's own fix made it vanish from both planned
  and confirmed permanently (compounded by the database's own real
  `unique(decision_id)` constraint, which means that exact plan can
  never be linked to a second job session either — a real, disclosed,
  pre-existing limitation of the `job_sessions` schema this campaign
  does not change; see "Known limitations" below). Fixed:
  `getFarmFertiliserDemand` now excludes a plan only when its Decision
  id appears in `listActiveJobSessionsForFarm` (ready/active/paused/
  completed_estimated) or the real confirmed-session read — never a
  cancelled one, which appears in neither.
- **HIGH, fixed** — the same fix's own `truncated` computation ignored
  truncation of the `listJobSessionDecisionIdsForFarm` read it depended
  on; once that read exceeded its own 5,000-row cap, an omitted linked
  Decision could be double-counted as still "planned" while the result
  claimed completeness. Fixed as a natural consequence of the fix above:
  `listActiveJobSessionsForFarm`'s own real `truncated` flag now feeds
  the overall result.

Quality gate after round 3: 1928/1928 tests (145/145 files), typecheck/
lint/build all pass — up from 1925/1925 (145/145), +3 new tests.

## Codex audit round 4 — 1 Critical, 2 High, 1 Medium: all 4 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 3's fix and do a genuinely fresh, full
re-read of the whole diff rather than only the areas rounds 1-3 already
touched. Every finding this round was real and none had been raised
before:

- **CRITICAL, fixed** — `FertiliserPlanSheet`'s default product/quantity
  were seeded from `NutrientsPageClient`'s own `plan`, which includes
  the silage branch (using this app's existing mock `SilagePlan` data)
  for any field with one. `validateFertiliserPlanEdits` only checks that
  a submitted `plannedQuantityKg` is positive and its `plannedProduct`
  matches one of the *server's own real, grazing-only* recommendation's
  products — it never cross-checks the submitted *quantity* against the
  server's own figure (by design — item 4 explicitly allows a planned
  quantity to differ from the recommendation). A farmer who accepted the
  sheet's own default without editing it could therefore have a real,
  persisted plan seeded from mock silage data, for any product also
  present in the grazing blend. Fixed: `NutrientsPageClient` now
  computes a separate, real `grazingOnlyPlan` (the identical
  `calculateNutrientPlan` call, `silage` explicitly omitted — never a
  fabricated number) whenever the field has a mock `SilagePlan`, and
  feeds *that* to `FertiliserPlanSheet` and the "Plan this application"
  gating — exactly matching what the server will actually recompute and
  validate against. A real, direct regression test (`NutrientsPageClient.test.tsx`)
  proves the sheet's own default now matches the real grazing-only
  figure and diverges from the (still shown elsewhere, unmodified)
  silage-inclusive one for this exact fixture.
- **HIGH, fixed** — a bare `"accepted"` Decision whose real recommendation
  named more than one product was still GPS-matchable as if it were one
  unambiguous, single-executable job. Confirming against it would
  misrepresent that one job as satisfying the whole multi-product blend,
  and (per the database's own real `unique(decision_id)` constraint)
  permanently exhaust the Decision's only allowed job-session link
  before its other products were ever addressed. Fixed: a plan is only
  ever GPS-matchable when it unambiguously represents exactly one
  product — either the farmer's own explicit `edits.plannedProduct`
  (always single, by `validateFertiliserPlanEdits`'s own construction),
  or a bare acceptance whose own real recommendation snapshot named only
  one product (`isUnambiguouslySingleProductPlan`, applied in both
  `getMatchablePlanForFieldAction` and, as defense in depth,
  `startJobSessionFromPlanAction`).
- **HIGH, accepted as a disclosed, deliberately narrower fix** —
  `submitPromptDecisionAction` has no retry-idempotency for *any* Prompt
  kind (a real, pre-existing architectural property shared by all five
  Prompt producers, not introduced or worsened by this campaign beyond
  its consequence for fertiliser specifically: a lost-response retry, or
  a farmer accepting the same live recommendation twice, creates two
  real accepted plan Decisions for one field). A full idempotency-key
  redesign of `submitPromptDecisionAction`/`decideAsFarmer`/`insertDecision`
  — cross-cutting, shared by every other Prompt kind — is deliberately
  out of this campaign's scope (campaign item 24: "reuse existing
  idempotency patterns; do not invent brittle client-only guards" — no
  existing pattern for this exists to reuse). What *is* fixed, in scope:
  the Nutrients screen now looks up whether a real, unexecuted plan
  already exists for the selected field (reusing the same, already-
  audited `getMatchablePlanForFieldAction` lookup) and discloses it
  before a farmer taps "Plan this application" again — a real, honest
  mitigation for the "nuisance duplicate" half of this finding (campaign
  item 8), deliberately not a hard block (item 15 requires supporting
  genuine split/multiple applications). The concurrent-double-submission
  race itself remains a real, disclosed, pre-existing limitation — see
  "Known limitations" below.
- **MEDIUM, fixed** — two round-1 fixes were previously asserted as
  tested in the architecture doc without a real test exercising the
  *actual* regression case. Fixed: added a real
  `plannedDate: "2026-02-31"`/`"2026-13-01"` test (the genuine round-1
  regression, not just a shape/type check) plus a real leap-year
  boundary case, and a real `NutrientsPageClient.test.tsx` render test
  proving a field switch gives `FertiliserPlanSheet` a genuinely fresh
  instance (a farmer's own typed value in one field never leaks into
  another field's default).

Quality gate after round 4: 1935/1935 tests (146/146 files), typecheck/
lint/build all pass — up from 1928/1928 (145/145), +7 new tests, +1 new
test file.

## Testing

New/changed test files (see `git log`/`git diff` for the exact list):
`src/domain/nutrients.test.ts` (additive), `src/domain/fertiliser-plan.test.ts`
(new), `src/orchestration/prompt/fertiliser-recommendation.test.ts` (new),
`src/orchestration/prompt/build-all.test.ts` (updated signature),
`src/orchestration/fertiliser-plan/index.test.ts` (new),
`src/orchestration/job-session/index.test.ts` (additive —
`startJobSessionFromPlan`/`startJobSessionFromPrompt`),
`src/orchestration/ai-context/index.test.ts` (additive — `fertiliserDemand`),
`src/app/actions/decisions.test.ts` (additive — fertiliser edits path),
`src/app/actions/fertiliser-plan.test.ts` (new),
`src/components/farm/GpsActivityCandidateCard.test.tsx` (additive — plan
matching), `src/components/next/ConfirmActualSheet.test.tsx` (additive —
linked-plan prefill), `src/app/(app)/job/[id]/ActiveJobSessionView.test.tsx`
(additive — linked-plan fetch), `src/components/farm/FertiliserPlanSheet.test.tsx`
(new), `src/components/farm/RemainingFertiliserRequirementCard.test.tsx`
(new). Coverage includes: scientific/domain (recommendation preserved,
plan distinct from recommendation, actual distinct from plan, unit
correctness, remaining requirement, never-negative balances), ownership
(cross-farm plan access/mutation/matching/aggregation all denied via
farm-scoped reads), planning (accept/edit/dismiss, ambiguous plans never
auto-selected), GPS (matched/ambiguous/none all exercised, existing
unplanned GPS behaviour intact), Confirm Actual prefill (once-only,
never overwrites a farmer edit), aggregation (farm-wide totals correct,
excluded-bare-acceptance judgement call tested), and regression (every
pre-existing test file remains green, unmodified in behaviour).

Quality gate at campaign completion: **1904/1904 tests, 145/145 files**,
typecheck/lint/build all pass — up from 1790/1790 (139/139) at baseline,
+114 new tests, +6 new test files.

## Final product test

*"Can a farmer start with a real Farm Return fertiliser recommendation,
turn it into a real plan, perform the job through the existing Farm
Return GPS workflow, confirm what they actually spread, and then see
Farm Return's remaining requirement update from the confirmed actual?"*

**YES.** The real data path: `promptForFertiliserRecommendation` (live,
`calculateNutrientPlan`-backed) → farmer taps "Save my plan" in
`FertiliserPlanSheet` → `submitPromptDecisionAction` validates the edits
and persists a real, accepted `decisions` row (kind
`fertiliser_recommendation`) → farmer later enters the field →
`GpsActivityCandidateCard` calls `getMatchablePlanForFieldAction`, finds
the one real unlinked plan, and on confirm calls
`startJobSessionFromPlanAction` → `startJobSessionFromPlan` links a real
`job_sessions` row to that exact Decision (`origin: "plan"`, no second
Decision inserted) → the farmer works the field under the existing,
unmodified Active Tracking/Finish flow → `ActiveJobSessionView` fetches
the linked plan and passes it to `ConfirmActualSheet`, which prefills
product/quantity from the real plan → farmer confirms (corrects only
what differed) → `confirmJobSessionActualAction` persists a real,
immutable `job_actuals` row → `RemainingFertiliserRequirementCard` (or
any future caller of `getFieldFertiliserStatusAction`) recomputes the
field's remaining requirement from that real confirmed Actual, showing a
genuinely updated `remainingKgHa` next time the Nutrients screen is
opened for that field.
