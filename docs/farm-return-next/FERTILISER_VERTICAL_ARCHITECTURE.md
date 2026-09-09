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
- **Offline-queued fertiliser starts can be rejected at sync time**
  (round 33's own fix, `applyQueuedManualJobSessionStartAction`): a
  farmer who starts a manual/detected fertiliser-spreading job while
  offline has that start re-verified (closed-period calendar, live
  recommendation basis) against the real, disclosed `decision.decidedAt`
  once the device reconnects — genuinely correct for a start that was
  never legitimate, but it also means a start that WAS legitimate at the
  time can be rejected if the field's real evidence genuinely changed
  before sync (a new soil test landing, the calendar rolling into the
  closed period between the queued time and sync). Codex's own
  suggested complete fix — preserve the farmer's raw observation
  separately from an "authorised start" record when this happens — is a
  materially larger feature (a new, non-authoritative record type and
  its own UI) outside this round's scope; today, a rejected sync simply
  fails, surfacing as a sync error the farmer must resolve manually.
  Every other manual-start activity type is entirely unaffected — this
  is scoped to `"fertiliser_spreading"` only.

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

## Codex audit round 5 — 1 Critical, 1 High, 1 Medium, 1 Low: all 4 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 4's fixes and do a genuinely fresh,
full re-read of the whole diff (including files rounds 1-4 never
touched) rather than only the areas already audited. Every finding this
round was real and none had been raised before:

- **CRITICAL, fixed** — `nutrients.ts`'s own `PRODUCTS` constant prices
  are disclosed mock market data (pre-existing, frozen, unmodified —
  used elsewhere only for the existing, unmodified
  `PurchasedFertiliserCard`'s own display). This campaign's own new
  `fertiliser-recommendation.ts` propagated the resulting
  `estimatedFieldCostEur` into a real, persisted Prompt/Decision surface
  — `FertiliserRecommendationSummary`, the Prompt's own description
  text ("...estimated cost €X for the field"), and the Decision's
  `estimateSnapshot` — presenting a mock number as if it were a real
  recommendation figure with the same evidentiary weight as the real
  N/P/K requirement and product blend next to it. Fixed:
  `estimatedFieldCostEur` removed entirely from
  `FertiliserRecommendationSummary`, `describeFertiliserRecommendationOk`,
  and the Prompt's `ok(...)` construction — this vertical's own new
  surfaces (`FertiliserPlanSheet`'s recommendation prop, the Prompt
  description, the persisted snapshot) never carry it. The pre-existing,
  frozen `PurchasedFertiliserCard` usage on the Nutrients screen is left
  untouched (out of scope — it already discloses the figure as mock
  market data, and retroactively fixing a frozen V1 surface is outside
  this campaign's authority). New negative assertions
  (`fertiliser-recommendation.test.ts`) prove the summary never carries
  the property and the Prompt description never mentions cost/€.
- **HIGH, fixed** — `computeFarmGrasslandAggregates`'s own
  `farmGrasslandAreaHa` (the LU/ha stocking-rate denominator, Teagasc
  Table 12-3) was set to the farm's whole area, including tillage
  ground — a real, pre-existing bug (traced via `git show 9458ef5` to
  predate this campaign, originating in `NutrientsPageClient.tsx`'s own
  original inline computation) that this campaign's new function
  faithfully reproduced and then widened in blast radius, since the new
  server-side recompute path now feeds it into Today/Plan/Fields and
  every persisted Decision, not just the one screen. Fixed:
  `farmGrasslandAreaHa` is now `totalFarmAreaHa` minus the real area of
  every field whose `plannedUse` is `"tillage"` — never the whole farm
  on a mixed grassland/tillage farm. `NutrientsPageClient.tsx`'s own
  separate, identically-buggy inline computation is removed entirely in
  favour of calling this one corrected, shared function (CLAUDE.md's own
  "never duplicate a calculation" rule, applied here in the fix rather
  than skipped — `computeFarmGrasslandAggregates` is new orchestration
  code this campaign owns, not a frozen `src/domain` export, so
  correcting and consolidating it is in scope). Three new tests
  (`build-all.test.ts`) prove tillage exclusion, whole-area-as-grassland
  when there is none, and a real, honest zero for an empty field list.
- **MEDIUM, fixed** — round 4's own "already planned" disclosure
  (`existingPlan`) only ever refetched on a real field/mode change —
  immediately after a farmer's own successful "Save my plan"/"Accept as
  recommended" submission, it stayed stale (still showing "Plan this
  application", no disclosure of the plan that had just been created),
  letting the exact nuisance duplicate the mitigation exists to
  discourage happen anyway. Fixed: a new `planRefreshToken` counter,
  included in the fetch effect's own dependency list, is bumped by
  `FertiliserPlanSheet`'s `onPlanned` callback to force a genuine
  refetch after every real save. A new regression test
  (`NutrientsPageClient.test.tsx`) proves the button only reads "Plan
  another application" once the save has actually completed and the
  refetch has actually run — never before, and never just the original
  stale pre-save read.
- **LOW, fixed** — this document's own "Quality gate at initial
  implementation" line (1904/1904 tests) was never updated after round
  1 and had gone stale by round 5, reading as if it were the current
  total. Fixed: reworded to state explicitly that it is superseded by
  each "Codex audit round N" section's own line above it.

Quality gate after round 5: 1939/1939 tests (146/146 files), typecheck/
lint/build all pass — up from 1935/1935 (146/146), +4 new tests.

## Codex audit round 6 — 3 Critical, 0 High, 0 Medium, 0 Low: all 3 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 5's fixes were actually complete (read
the real code, not just the doc claims) and do a genuinely fresh, full
re-read of the whole diff. All three findings were real, and two of them
were genuine gaps in round 5's own two CRITICAL fixes — not new
regressions round 5 introduced, but round 5 not going far enough:

- **CRITICAL, fixed — round 5's mock-price fix was incomplete.** Round 5
  removed the field-total `estimatedFieldCostEur`, but
  `FertiliserRecommendationSummary.products` still copied
  `plan.purchasedProducts` in verbatim — and *every* `FertiliserProduct`
  already carries its own real `costEur` (`nutrients.ts`'s
  `allocatePurchasedProducts`, the identical disclosed mock `PRODUCTS`
  prices). The per-product mock cost was still reaching this Prompt's
  `basis.value`, every persisted Decision's `estimateSnapshot`, and
  `getLinkedFertiliserPlanForJobSessionAction`'s own client-facing
  response — undoing round 5's stated intent for exactly the reason that
  fix existed. Fixed: `FertiliserRecommendationSummary.products` is now
  `FertiliserRecommendationProduct[]` (`FertiliserProduct` minus
  `costEur`), and a new, exported `sanitiseRecommendedProduct` is the one
  real place that strips it — applied both inside
  `promptForFertiliserRecommendation` and, proactively (this campaign's
  own self-check for round 5's own class of gap), in
  `NutrientsPageClient.tsx`'s separate client-side `FertiliserPlanSheet`
  recommendation prop, which builds its own product list directly from
  `calculateNutrientPlan` rather than through this Prompt producer and
  would otherwise have carried the identical mock figure through a
  second, un-audited path.
- **CRITICAL, fixed — a tillage field could receive and persist a
  grazing-based recommendation.** This app has no tillage N/P/K
  recommendation table anywhere — every number `calculateNutrientPlan`
  produces is a grassland figure (Table 12-3's grazing curve, or the
  silage tables this producer never calls). `buildAllRealPrompts` fans
  `promptForFertiliserRecommendation` out over every field with no
  land-use filter, so a tillage field silently received a real,
  actionable, persistable "Fertiliser recommended" Prompt/Decision — a
  fabricated number for a land use this engine was never sourced for,
  not merely an omission. Fixed: `promptForFertiliserRecommendation`
  gates first, before `calculateNutrientPlan` is even called, on
  `field.plannedUse?.value === "tillage"`, returning a real
  `NOT_APPLICABLE("TILLAGE_FIELD_NOT_SUPPORTED")` — genuinely nothing
  this Prompt kind can ever say for that land use, not a fixable
  evidence gap. `NutrientsPageClient.tsx`'s own client-side "Plan this
  application" gating is updated identically (`canPlanFertiliserApplication`),
  so a tillage field never even shows the button rather than showing it
  and failing only on submit — the same client/server gating-mismatch
  class round 4's own CRITICAL fixed for silage, applied here
  proactively before Codex could catch it as a second instance.
- **CRITICAL, fixed — an empty, un-evidenced herd produced a concrete,
  actionable 35 kg N/ha recommendation instead of failing closed.**
  `calculateGrasslandStockingRateKgHa` divides the farm's total
  livestock units by `farmGrasslandAreaHa`, and `nGrazingSucklerToBeefKgHa`
  *clamps* any stocking rate at or below its lowest defined row
  (1.0 LU/ha) to that row's own 35 kg N/ha — Table 12-3 has no real
  "0 LU/ha" row (an earlier round of this campaign's own test comment
  wrongly assumed one existed; corrected as part of this fix). This
  app's data model has no way to distinguish "this farm has confirmed
  zero livestock" from "livestock has simply never been entered" — an
  empty `livestockGroups` read is genuinely ambiguous between the two,
  and presenting the clamped 35 kg N/ha as a real recommendation for the
  ambiguous case is exactly the extrapolation-presented-as-fact this
  campaign's own fail-closed rule forbids. Fixed:
  `promptForFertiliserRecommendation` now returns
  `BLOCKED_INSUFFICIENT_EVIDENCE("MISSING_LIVESTOCK_DATA")` for the
  branch that would otherwise become `OK` when `livestockGroups.length
  === 0` — deliberately only that branch, so a field already
  `NOT_APPLICABLE` for an unrelated real reason (Index 4 soil, a
  commonage/buffer legal prohibition) stays that way regardless of
  livestock evidence, since no amount of livestock data would change
  that outcome (test-enforced: the round-2 commonage `NOT_APPLICABLE`
  fixture deliberately keeps `noGroups` and still resolves correctly).
  `NutrientsPageClient.tsx`'s own client-side gating updated identically,
  for the same client/server parity reason as the tillage fix above.

Quality gate after round 6: 1941/1941 tests (146/146 files), typecheck/
lint/build all pass — up from 1939/1939 (146/146), +2 new tests (plus
expanded assertions inside existing tests, and several existing
fixtures updated from an empty `livestockGroups: []` — no longer a
realistic "live, recommendable field" fixture — to a real, non-empty
herd).

## Codex audit round 7 — 3 Critical, 1 High, 0 Medium, 0 Low: all 4 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 6's fixes were genuinely correct and
complete, look specifically for a *second* instance of round 6's own
class of gap (a fix that removes one instance of a problem but misses a
second), and do a fresh, full re-read of the whole diff. All four
findings were real; three were genuine gaps in round 6's own fixes
(round 6 fixing the field-level Prompt producer but missing a second,
independent code path over the same real data), not new regressions:

- **CRITICAL, fixed — `getFarmFertiliserDemand` bypassed both of round
  6's fail-closed gates.** This function is a *second*, independent
  aggregation over the same real fields (farm-wide demand, not the
  per-field Prompt) — it called `calculateNutrientPlan` directly for
  every field unconditionally, including a tillage field or a farm with
  no recorded livestock, then summed the result into the real,
  disclosed farm-wide "recommended" total. Round 6's own gates live
  inside `promptForFertiliserRecommendation`, which this function never
  calls. Fixed: a tillage field, and every field when the farm has no
  recorded livestock, are now excluded from this aggregation entirely
  before `calculateNutrientPlan` is ever called — the identical two
  rules, applied to a second real code path rather than left to
  silently diverge from the first.
- **CRITICAL, fixed — round 6's mock-price fix was itself incomplete
  for previously persisted Decisions.** `getLinkedFertiliserPlanForJobSessionAction`
  and `getMatchablePlanForFieldAction` both read a real, already-
  persisted Decision's own frozen `estimateSnapshot` and forward its
  `products` to the client — a Decision persisted *before* round 6's
  `sanitiseRecommendedProduct` fix existed can still carry a real
  per-product mock `costEur` inside that frozen snapshot (its own
  historical record is never rewritten — provenance is permanent). Both
  actions previously forwarded that snapshot verbatim. Fixed: both now
  sanitise defensively at the read boundary — `sanitiseRecommendedProduct`
  applied to `getLinkedFertiliserPlanForJobSessionAction`'s own
  `recommendedProducts`, and a new `sanitiseDecisionRecordForClient`
  applied to `getMatchablePlanForFieldAction`'s own returned
  `DecisionRecord` — regardless of whether the specific stored snapshot
  predates or postdates round 6 (stripping an absent field is a no-op,
  so an already-clean product is unaffected).
- **CRITICAL, fixed — a plan persisted before round 6's gates existed
  remained fully executable.** A Decision accepted/edited before this
  campaign recognised a tillage field or missing livestock as invalid
  still carries a real, frozen `"OK"` `estimateSnapshot` — and neither
  `getMatchablePlanForFieldAction` nor `startJobSessionFromPlanAction`
  ever re-checked whether the field's *current* live recommendation
  still supports it before treating the plan as matchable/startable.
  Such a plan could still be GPS-matched, started, and used to prefill
  a real Confirm Actual, continuing to act on a since-recognised-
  fabricated basis. Fixed: a new `isPlanStillCurrentlyRecommendable`
  reruns the identical real, current recompute
  `submitPromptDecisionAction`'s own accept/edit path already requires
  before persisting a *new* Decision, in both
  `getMatchablePlanForFieldAction` (excludes such a candidate from
  matching, `"none"`, never `"ambiguous"`) and, as defense in depth,
  `startJobSessionFromPlanAction` (throws). The underlying Decision row
  and its own historical `estimateSnapshot` are never rewritten — only
  whether it is still treated as an *active*, executable plan going
  forward changes.
- **HIGH, fixed — the farm-wide "Planned" total stayed zero for a real,
  genuinely unambiguous accepted plan.** Round 2's own product judgement
  call (a bare `"accepted"` Decision with no explicit `edits` is
  excluded from "Planned", since a multi-product recommendation gives no
  way to say which product the farmer means) was never reconciled with
  round 4's own later refinement: `isUnambiguouslySingleProductPlan`
  already recognises a bare acceptance of a *single*-product
  recommendation as fully unambiguous, safe enough to GPS-match and
  start a real job from — yet `getFarmFertiliserDemand`'s own "Planned"
  computation still unconditionally required explicit `edits`, so that
  exact single-product bare acceptance counted toward *recommended* but
  never *planned*, even after a farmer's own real "Accept as
  recommended" tap. Fixed: `getFarmFertiliserDemand` now also counts a
  bare-accepted Decision's own real single-product recommendation
  snapshot toward "Planned" — the identical reasoning
  `isUnambiguouslySingleProductPlan` already applies, reused rather than
  reinvented. A genuinely ambiguous multi-product bare acceptance
  remains excluded, unchanged.

Quality gate after round 7: 1949/1949 tests (146/146 files), typecheck/
lint/build all pass — up from 1941/1941 (146/146), +8 new tests.

## Codex audit round 8 — 2 Critical, 2 High, 0 Medium, 0 Low: all 4 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 7's fixes were genuinely correct and
complete and specifically look for a *third* instance of round 7's own
class of gap ("the same fix needed applying to a second, independent
code path"). All four findings real; two were exactly that third
instance, one closed the architectural drift risk at its source, one
was a genuinely new gap in a pre-existing, cross-cutting action this
campaign's own new Prompt kind newly reaches:

- **CRITICAL, fixed — a third unsanitised legacy-Decision path.**
  `src/app/(app)/records/page.tsx` reads every real `DecisionRecord`
  for the farm via `listDecisionsForFarm` and passes it straight into
  `RecordsPageClient` — a real client component. Round 7 sanitised the
  two fertiliser-specific actions
  (`getLinkedFertiliserPlanForJobSessionAction`/
  `getMatchablePlanForFieldAction`) but not this generic Records read
  path, which this campaign's own new `fertiliser_recommendation`
  Decision kind now also flows through. A Decision persisted before
  round 6's `sanitiseRecommendedProduct` fix existed can still carry a
  real per-product mock `costEur` inside its own frozen
  `estimateSnapshot`; the current row rendering does not display it,
  but it still crosses the production client boundary. Fixed:
  `sanitiseDecisionRecordForClient` — moved out of `src/app/actions/
  fertiliser-plan.ts` (a real Next.js `"use server"` module, whose
  every export becomes a callable Server Action requiring an async
  function — this plain, synchronous sanitiser could not be exported
  from there) into `src/orchestration/fertiliser-plan/index.ts` and
  exported — is now applied to every decision `records/page.tsx` reads,
  the same one real, authoritative copy `fertiliser-plan.ts`'s own two
  actions already use.
- **CRITICAL, fixed — historical plans no longer recommendable still
  contributed concrete "Planned" demand.** `getFarmFertiliserDemand`'s
  own "Planned" computation classified every unlinked accepted/edited
  fertiliser Decision by outcome/edits alone, never checking whether
  its own field is *currently* recommendable — the third active/
  executable interpretation path round 7 didn't yet cover (round 7 only
  gated `getMatchablePlanForFieldAction`/`startJobSessionFromPlanAction`
  and the "Recommended" side of this same function). A legacy plan
  those two actions now correctly refuse to match/start could still
  produce a real, concrete `plannedRequirementKg` here and through AI
  context — presenting a quantity derived from a basis now known to be
  unsupported. Fixed: every "Planned" quantity is now gated on the
  identical, real, current field-eligibility set the "Recommended"
  total already computes.
- **HIGH, fixed — a live Prompt could authorise an unrelated activity
  type.** `startJobSessionFromPromptAction` (`src/app/actions/
  job-sessions.ts`, pre-existing, cross-cutting — not written by this
  campaign) never validated `activityType` against `promptKind` at all.
  This campaign's own addition of `fertiliser_recommendation` to
  `RecomputablePromptKind` newly routes a real fertiliser recommendation
  through this action, so a direct caller could submit
  `activityType: "slurry_spreading"` (or any other value) alongside it,
  producing a real accepted fertiliser Decision linked to a
  semantically unrelated job — the exact mismatch
  `startJobSessionFromPlanAction`'s own round-1 fix already closed for
  the plan-specific path, never propagated here since this action
  predates the campaign. The UI never offers this combination, but that
  does not secure the callable server action itself. Fixed: a narrow
  check requiring `activityType === "fertiliser_spreading"` whenever
  `promptKind === "fertiliser_recommendation"` — scoped to only the one
  Prompt kind this campaign introduced; the other four kinds' own
  activityType semantics predate this campaign and are out of its
  authority to redesign.
- **HIGH, fixed — round 7's own tillage/missing-livestock filter was
  duplicated, not reused, recreating the exact drift risk responsible
  for rounds 6 and 7.** `getFarmFertiliserDemand` re-derived
  `field.plannedUse?.value !== "tillage"`/`livestockGroups.length === 0`
  inline rather than calling `promptForFertiliserRecommendation`'s own
  authoritative rules — meaning any *future* fail-closed gate added to
  that Prompt producer would again be silently absent from farm-wide
  demand until manually, separately duplicated there, the identical
  mechanism that produced two prior rounds of real findings. Fixed:
  `fertiliser-recommendation.ts` now exports `isTillageField`/
  `hasNoRecordedLivestock` — the one real, authoritative home for both
  predicates — and `getFarmFertiliserDemand` (plus
  `NutrientsPageClient.tsx`'s own client-side gating, proactively
  aligned in the same change) calls them directly instead of
  re-deriving the rule. The two predicates stay separate rather than
  fused into one combined check, since `promptForFertiliserRecommendation`
  itself reacts to them with different Prompt outcomes (tillage is
  always `NOT_APPLICABLE`; missing livestock is only
  `BLOCKED_INSUFFICIENT_EVIDENCE` once everything else about the field
  would otherwise be `OK`).

Quality gate after round 8: 1958/1958 tests (146/146 files), typecheck/
lint/build all pass — up from 1949/1949 (146/146), +9 new tests.

## Codex audit round 9 — 2 Critical, 2 High found; 2 Critical + 1 High fixed, 1 High rejected

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, explicitly asked to hunt for a *fourth* instance of the
"second/third independent code path forgot the gate" pattern rounds
6→7→8 each found once, before declaring it closed. It found one — a
real, genuinely new fourth instance, confirming the hunt was worth
running — plus a real gap in round 8's own "Planned" fix, and one HIGH
this campaign rejects with a documented reason:

- **CRITICAL, fixed — a fourth independent eligibility-gate bypass, in
  a real downloadable export.** `src/lib/reports.ts`'s
  `buildNutrientPlanReportCsv` (pre-existing V1/V3 report generator,
  never touched by this campaign until now) calls
  `calculateNutrientPlan` directly for every field, with its own
  separate, duplicated `farmGrasslandAreaHa` computation — the
  identical tillage-inclusive bug round 5 fixed in `build-all.ts`,
  never propagated here. A tillage field was labelled `"Grazing"` and
  given a real grassland N/P/K recommendation in a real, signed-in
  farmer's downloaded CSV; an empty `livestockGroups` could produce the
  clamped, presented-as-real 35 kg N/ha. Fixed: reuses
  `computeFarmGrasslandAggregates` for the denominator and
  `isTillageField`/`hasNoRecordedLivestock` for the same two gates, with
  a tillage field now labelled `"Tillage"` and exporting
  `"NOT_APPLICABLE"` for the affected columns, and an un-evidenced empty
  herd exporting `"INSUFFICIENT_EVIDENCE"` — the identical sentinel
  convention this report already used for missing soil evidence.
- **CRITICAL, fixed — the same real, downloadable report also exported
  mock fertiliser prices.** `buildNutrientPlanReportCsv` serialised
  every `FertiliserProduct.costEur` and `NutrientPlan.estimatedFieldCostEur`
  into the CSV — `nutrients.ts`'s own disclosed mock catalogue prices,
  reaching a real signed-in farmer's real downloaded file. Rounds 5-8
  removed this figure from every Prompt/Decision/Plan-sheet/Records/
  linked-plan/demand-action/AI-context boundary but never reached this
  report. Fixed: the "Estimated cost (EUR)" column is removed entirely
  and `productsSummary` now lists only product name and quantity —
  matching this file's own pre-existing stated principle for why
  "Financial Summary" has no report builder at all ("a real export of
  [mock figures] would just be exporting invented numbers with a CSV
  wrapper"), simply never applied to this report's own cost columns
  until now.
- **HIGH, fixed — round 8's own "Planned"/"Recommended" eligibility gate
  was not equivalent to a full recompute.** Round 8 checked only the two
  named tillage/missing-livestock cases via `isTillageField`/
  `hasNoRecordedLivestock`. A field that newly lost its soil evidence,
  moved to Index 4, or came under a new commonage/buffer prohibition
  would still count toward both Recommended and Planned, since neither
  narrow predicate covers those cases. Fixed: `getFarmFertiliserDemand`
  now calls `promptForFertiliserRecommendation` itself, per field, and
  uses its real `basis.status === "OK"` as the one authoritative
  eligibility signal — the identical test `isPlanStillCurrentlyRecommendable`
  already applies for GPS matching/starting — so this farm-wide
  aggregation can never again drift from whatever gate that Prompt
  producer enforces, present or future, without a human forgetting to
  duplicate a change. `calculateNutrientPlan` still produces the actual
  Recommended quantity (unchanged, already-verified arithmetic); only
  which fields may contribute is now decided by the real Prompt.
- **HIGH, rejected — `isPlanStillCurrentlyRecommendable` checking only
  `basis.status === "OK"`, not whether the stored plan's own specific
  product/quantity still matches the live recommendation.** Real
  concern, but conflicts with a design decision this campaign made
  explicitly and documents in two places: `validateFertiliserPlanEdits`'s
  own doc comment states a farmer's `plannedQuantityKg` may legitimately
  differ from the live recommendation's own figure ("by design — item 4
  explicitly allows a planned quantity to differ from the
  recommendation"), and campaign item 4 itself requires
  Recommended/Planned/Actual never collapse into one value — a farmer's
  own Plan is a frozen decision, deliberately independent of later
  drift in the underlying recommendation, not a live re-read of it.
  `isPlanStillCurrentlyRecommendable`'s own real, narrow purpose (per
  its own round-7 doc comment) is "does *any* real recommendation still
  exist for this field at all" — now answered by a genuinely full
  recompute (round 9's other fix above extends the identical full-basis
  check to `getFarmFertiliserDemand` too) — not "does the plan's own
  specific numbers still match today's recommendation," a fundamentally
  different, stronger question this campaign has already explicitly
  decided not to enforce. Implementing it would require new
  product/quantity-tolerance rules and likely a farmer-facing "this
  plan may be stale, please review" flow — a real, larger scope
  decision for a future campaign, not a one-round audit fix.

Quality gate after round 9: 1962/1962 tests (146/146 files), typecheck/
lint/build all pass — up from 1958/1958 (146/146), +4 new tests.

## Codex audit round 10 — 3 Critical, 2 High: all 5 fixed; round 9's rejection withdrawn

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to hunt for a *fifth* instance of the fail-closed-gate-
bypass pattern (found once each in rounds 6, 7, 8, 9) and to
independently re-assess round 9's own rejected finding with fresh eyes
rather than defer to it. It found a real fifth instance, a real gap in
round 9's own CSV fix, a real display-layer gap this campaign had
carried since round 6, and — correctly — disagreed with round 9's
rejection on a narrower, valid point this campaign now accepts:

- **CRITICAL, fixed — the primary Nutrients screen's own display never
  applied the tillage/missing-livestock gates, only the "Plan this
  application" button did.** Round 6's own fix (`canPlanFertiliserApplication`)
  gated the button, but `NutrientRequirementCard`/`NapComplianceCard`/
  `OrganicNutrientsCard`/`PurchasedFertiliserCard` kept rendering
  `calculateNutrientPlan`'s own real output regardless — a tillage field
  still showed a real grassland N/P/K recommendation, and a farm with no
  recorded livestock still showed the clamped, presented-as-real
  35 kg N/ha. Fixed: these four cards are now gated on the same real
  `isTillageField`/`hasNoRecordedLivestock` checks, replaced with an
  honest "No fertiliser recommendation available" disclosure (naming the
  real reason) when either applies — this app's own primary, signed-in
  screen for this exact figure had been showing fabricated agronomy
  since round 6 for these two specific cases.
- **CRITICAL, fixed — a fifth independent fail-closed-gate-bypass path,
  reaching Dashboard/Finance/Input Planner.** `src/domain/finance.ts`'s
  `calculateFarmFertiliserRequirement`/`calculateFarmSlurryNutrientValueEur`
  (pre-existing Phase 4/6 domain code, well before this campaign) called
  `calculateNutrientPlan` for every field with the identical tillage-
  inclusive `farmGrasslandAreaHa` bug rounds 5/9 already fixed elsewhere,
  and no tillage/missing-livestock gate at all. Fixed: the underlying
  grassland-area arithmetic now lives in exactly one place — a new
  additive `farmGrasslandAggregates` export in `src/domain/nutrients.ts`
  itself (the correct, lowest layer for it, since `src/domain/finance.ts`
  cannot import from the orchestration layer) — with
  `build-all.ts`'s own `computeFarmGrasslandAggregates` now delegating to
  it rather than keeping a second copy. Both `finance.ts` functions now
  exclude a tillage field, and a *grazing* field when the farm has no
  recorded livestock, from the aggregation — deliberately *not* a silage
  field with no livestock, since silage N/P/K never depends on
  `livestockGroups` at all. **Rejected in part**: removing the same
  functions' own disclosed mock `costEur`/`estimatedFieldCostEur` figures
  — these are a real, pre-existing, already-disclosed limitation of this
  whole-farm Finance/Input Planner surface (`docs/evidence-register.md`),
  the same class as `PurchasedFertiliserCard.tsx`'s own pre-existing
  display of the identical mock figure this campaign has consistently
  left alone since round 5 — out of this campaign's scope, not a new
  surface it built.
- **HIGH, fixed — round 9's own CSV eligibility fix left the products
  cell ambiguous for a genuinely `NOT_APPLICABLE` field.** A field with
  complete real evidence at Index 4, or under a commonage/buffer legal
  prohibition, has a real, correct N/P/K requirement (not fabricated —
  `calculateNutrientPlan`'s own genuine output) but a genuinely empty
  `purchasedProducts` — round 9's fix rendered that as an empty string,
  identical to how missing/blocked data reads. Fixed: the products cell
  now says `"NOT_APPLICABLE"` explicitly whenever real evidence exists
  but no purchase is currently recommended, distinct from
  `"INSUFFICIENT_EVIDENCE"` (tillage/no-livestock/missing-index) — the
  numeric N/P/K/organic-offset columns are unchanged, since those figures
  remain genuinely real in the `NOT_APPLICABLE` case.
- **HIGH, fixed — round 9's rejection is withdrawn; a narrower, valid
  point survives from it.** Codex's own independent re-assessment
  distinguished two different questions round 9's rejection had
  conflated: "must a stored plan's *quantity* match the live
  recommendation" (no — round 9's own point, genuinely still correct,
  campaign item 4) and "must a stored plan's *product* still be among
  the live recommendation's real products at all" (yes — a real, narrower
  check that does not collapse Planned into Recommended, since nothing
  about quantity is compared). Fixed: `isPlanStillCurrentlyRecommendable`
  is now `getCurrentFertiliserRecommendation` (returns the live
  recommendation itself, not just a boolean) plus a new, pure
  `isPlanProductStillRecommended`, applied to every candidate in
  `getMatchablePlanForFieldAction` and as defense in depth in
  `startJobSessionFromPlanAction` — a stored plan whose own selected
  product (`edits.plannedProduct` or its frozen single-product snapshot)
  is no longer among the field's current live recommendation is excluded
  from matching/starting, even though the field's basis is still
  genuinely `OK`. The underlying Decision and its own historical
  `estimateSnapshot` are never rewritten — only whether it remains an
  *active*, executable plan changes.

Quality gate after round 10: 1976/1976 tests (146/146 files), typecheck/
lint/build all pass — up from 1962/1962 (146/146), +14 new tests.

## Codex audit round 11 — 1 Critical, 1 High: both fixed (sixth and seventh independent gate-bypass paths)

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to hunt for a *sixth* instance of the fail-closed-gate-
bypass pattern (found once each in rounds 6-10) and to independently
verify round 10's own 5 fixes. It confirmed all 5 as correct and
complete, and found both a sixth and a seventh genuinely new instance:

- **CRITICAL, fixed — "Generate audit trace" is a sixth independent
  recommendation path, and the first one that *persists* its fabricated
  output.** `RecommendationAuditTrailCard.tsx` summed every field's own
  real area unconditionally (the identical tillage-inclusive bug rounds
  5/9/10 already fixed elsewhere) and ran `calculateNutrientPlanWithTrace`
  for every field with no tillage/missing-livestock gate at all. Unlike
  every other fixed call site, this one writes a real `CalculationRun`
  to `localStorage`, which a farmer can then peer-review and export as
  CSV/JSON/text — a tillage field getting a real, *persisted,
  exportable* grassland-based "audit trail" is a fabricated real record,
  not a transient display. Fixed: reuses the one real, shared
  `farmGrasslandAggregates`, and skips a tillage field, or a grazing
  field when the farm has no recorded livestock, entirely before
  generating a run — a silage field is never skipped for missing
  livestock, since silage N/P/K never depends on it (the same real
  distinction round 10 already established for `finance.ts`).
- **HIGH, fixed — Dashboard alerts are a seventh independent path, but
  only one of its four alert types was actually affected.** `src/domain/real-alerts.ts`'s
  `deriveRealAlerts` used the identical tillage-inclusive
  `farmGrasslandAreaHa` (which `checkNapCompliance`'s own real statutory
  stocking-rate ledger divides by) and computed a full `NutrientPlan`
  for every field with no gate. Three of its four alert types
  (commonage, water-buffer distance, soil-test age) are real properties
  of the field itself, genuinely independent of land use or livestock —
  those remain fully intact for every field, tillage included. Only the
  fourth, "Planned application exceeds NAP ceiling", is actually built
  from the grazing/agronomic ledger this vertical's own gates protect —
  fixed by reusing `farmGrasslandAggregates` for the shared denominator
  and gating only that one alert on the same real
  `field.plannedUse !== "tillage"`/`livestockGroups.length > 0` checks,
  never suppressing the other three.

Quality gate after round 11: 1982/1982 tests (146/146 files), typecheck/
lint/build all pass — up from 1976/1976 (146/146), +6 new tests.

## Codex audit round 12 — 0 Critical, 1 High: fixed (round 11's own buffer-alert reasoning had a gap)

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to hunt for an eighth instance of the fail-closed-gate-
bypass pattern and to independently verify round 11's own claim that
the water-buffer alert's whole condition is field-intrinsic. It found
that claim was half-wrong — a real, genuine gap in round 11's own
reasoning, not a new independent path:

- **HIGH, fixed — round 11 treated the water-buffer alert as entirely
  field-intrinsic; only half of it actually is.** `deriveRealAlerts`'s
  buffer alert combines `plan.nationalBufferDistanceStatus` and
  `plan.localBufferOverrideStatus`. `checkLocalBufferOverride` genuinely
  reads only `field.waterBufferContext` — field-intrinsic, independent
  of land use or livestock, exactly as round 11 reasoned. But
  `nationalBufferDistanceStatus` is not: `nutrients.ts`'s own
  `bufferMaterial` selects `"chemical_fertiliser"` whenever the grazing/
  agronomic ledger's `allocatedProducts` is non-empty — a tillage field
  or an un-evidenced empty herd can fabricate that non-empty blend and
  trigger a real "Water-buffer distance not met" alert checked against
  the wrong regulatory material (chemical fertiliser's own distance
  minimum, not organic/soiled-water's). Fixed: the national-buffer half
  of the condition is now gated on the same `ledgerDependentAlertsEligible`
  check the NAP-ceiling alert already uses (extracted as one shared,
  named variable both now read); the local-override half is
  deliberately left ungated, since it is genuinely independent.

Quality gate after round 12: 1984/1984 tests (146/146 files), typecheck/
lint/build all pass — up from 1982/1982 (146/146), +2 new tests.

## Codex audit round 13 — 0 Critical, 3 High, 1 Medium: all 4 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9458ef5`, asked to verify round 12's own fix, do one more exhaustive
sweep for the tillage/missing-livestock pattern, and step back for a
genuinely broad review of the whole campaign unrelated to that specific
pattern. Round 12's fix confirmed correct; one further real instance of
the pattern remained (the CSV's own NAP columns), and three genuinely
different issues surfaced from the broader review:

- **HIGH, fixed — the Nutrient Plan CSV's own NAP compliance columns
  were the one remaining unclosed instance of the pattern.**
  `buildNutrientPlanReportCsv` correctly replaces the recommendation/
  nutrient/offset/product columns with `NOT_APPLICABLE`/
  `INSUFFICIENT_EVIDENCE` for a tillage or un-evidenced-herd row, but
  its four NAP columns (`N within NAP ceiling`, `P within NAP ceiling`,
  `Regulatory status`, `Silage sale evidence`) still read
  `plan.napCompliance` directly — `checkNapCompliance` has no knowledge
  of tillage/missing-livestock at all, so a tillage row could still
  export a real-looking "Yes"/"No" and regulatory classification
  derived from the identical fabricated ledger. Fixed: all four columns
  now gate on the same `nRecommendable` the other columns already use.
- **HIGH, fixed — farm-wide "Planned" demand never applied round 10's
  own product-still-recommended rule.** `getFarmFertiliserDemand`'s
  planned-decision filter checked only whether the field currently has
  *some* `OK` recommendation, then included the stored product without
  verifying it is still among that recommendation's own real products —
  the identical `isPlanProductStillRecommended` check
  `getMatchablePlanForFieldAction`/`startJobSessionFromPlanAction`
  already apply (round 10) was never extended here. A historical
  `18-6-12` plan could remain in `plannedTotalKg` after current
  evidence shifted the live recommendation to Protected Urea only, even
  though the campaign now refuses to match/start that exact plan.
  Fixed: this function now captures each currently-recommendable
  field's own real `FertiliserRecommendationSummary` (not just an
  eligibility flag), and every planned quantity is checked against it
  before counting.
- **HIGH, fixed — `GpsActivityCandidateCard.tsx`'s Confirm button never
  waited for its own real matchable-plan lookup to settle.** The
  Confirm button was disabled only while the farmer's own submission
  was pending, never while the async `getMatchablePlanForFieldAction`
  lookup was still in flight — a quick tap could fall straight through
  to the unlinked manual-start branch even when a real, unambiguous
  plan existed, silently abandoning the exact GPS-to-plan link campaign
  item 10 exists to make. Fixed: a new `matchablePlanLoading` state
  (tracked separately from the lookup's own result, which conflated
  "no lookup running" with "still in flight") disables Confirm and
  shows "Checking…" until the lookup genuinely settles — a failure
  still resolves to the same, unchanged manual-start fallback, not an
  indefinite block.
- **MEDIUM, fixed — the Nutrients screen's "already planned" copy
  overclaimed for a truncation-caused ambiguous result.**
  `getMatchablePlanForFieldAction` returns `"ambiguous"` both for two
  or more genuine candidates and whenever either underlying capped read
  truncates (round 1) — the latter can carry a `candidateCount` of 0 or
  1, for which "You already have more than one planned application"
  is a real, unsupported factual claim; the true condition is "matching
  could not be determined safely". Fixed: the copy now checks
  `candidateCount >= 2` before making that specific claim, falling back
  to an honest "couldn't safely check" disclosure otherwise.

Quality gate after round 13: 1990/1990 tests (146/146 files), typecheck/
lint/build all pass — up from 1984/1984 (146/146), +6 new tests.

## Codex audit round 14 — 0 Critical, 3 High, 2 Medium: all 5 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`f1c87e6`, explicitly asked to re-read the entire campaign diff as if it
were the first audit round (not a targeted pattern-hunt), and to
fresh-eyes re-review the two prior WITHDRAWN/REJECTED findings on
record. All five findings were real and are fixed; the two prior
withdrawn/rejected findings were both re-confirmed correct (no new
issue found in either).

- **HIGH, fixed — a recommendation's own statutory NAP-ceiling breach
  never reached the Prompt, persisted Decision, GPS revalidation, or
  remaining-requirement surfaces.** `promptForFertiliserRecommendation`
  classified a field's recommendation from `fertilityEvidence`/
  `purchasedProducts.length`/livestock alone — `plan.napCompliance`
  (already computed by `calculateNutrientPlan`) was discarded entirely.
  Per spec Section A2 the agronomic and statutory ledgers must never
  *gate* each other (a real, deliberate design choice — a ceiling breach
  correctly does not suppress `purchasedProducts`), so the fix is
  disclosure, not suppression: `FertiliserRecommendationSummary` now
  carries the real `napCompliance: EngineOutcome<NapComplianceCheck>`
  verbatim, and the Prompt's own description gains a warning sentence
  whenever the recommended blend exceeds the ceiling
  (`nWithinCeiling`/`pWithinCeiling` false). The finding's other two
  named gates (`commonageFertiliserGate`/buffer statuses) were
  deliberately NOT given the same warning treatment after verifying
  `calculateNutrientPlan`'s own control flow: a genuine
  `LEGAL_PROHIBITION` on either already empties `purchasedProducts`
  entirely (this Prompt can never reach `OK` while one is active), and
  the residual `BLOCKED_INSUFFICIENT_EVIDENCE` case is — by this app's
  own real data model — the state of literally every field today (no
  field anywhere in this app has ever captured `commonageStatus`/
  `waterBufferContext`), so a warning there would be 100% noise on every
  farm, not a real disclosure of anything actionable. Fixed narrowly on
  the one genuinely actionable case; the other two gates remain
  correctly fail-closed at the point that actually matters (suppressing
  the blend), just not additionally narrated in this Prompt's copy.
- **HIGH, fixed — real farm-level Article 17(6) evidence
  (`Farm.pBuildUpCompliance`) never reached this vertical at all.**
  `promptForFertiliserRecommendation` had no parameter for it and never
  passed it to `calculateNutrientPlan`, forcing every farmer — including
  one with recorded adviser engagement, NMP submission, and training
  completion — down the "not proven" Table 15a P route regardless of
  their actual recorded compliance; Table 15b's real enhanced ceiling
  was unreachable from this vertical's own Prompt/Decision/GPS/
  remaining-requirement/farm-demand surfaces. Fixed: `pBuildUpCompliance`
  is now a trailing optional parameter, threaded through from the real
  `Farm` record at all five real call sites — `build-all.ts`
  (`buildAllRealPrompts`, whose own `farm` parameter type had to widen
  from `Pick<Farm, "id" | "location">`), `recompute.ts`
  (`recomputePromptByKind`, which already receives the full `Farm`),
  `fertiliser-plan/index.ts`'s `getFarmFertiliserDemand` (both its
  eligibility-check call and its second `calculateNutrientPlan` call for
  the Recommended aggregation, plus its two callers —
  `getFarmFertiliserDemandAction`/`getFarmContextForCurrentUser`), and
  `NutrientsPageClient.tsx`'s own separate client-side `calculateNutrientPlan`
  calls (the identical gap this screen's own display had). Verified with
  an empirically-derived fixture (dairy herd, real age/sex, GSR 460 kg
  N/ha, all Article 17(6) conditions satisfiable): supplying
  `pBuildUpCompliance` moves the real P ceiling from Table 15a's 39
  kg/ha to Table 15b's enhanced 69 kg/ha, proven at both
  `promptForFertiliserRecommendation` and `recomputePromptByKind`.
- **HIGH, fixed — "Accept as recommended" lost its own known product
  and quantity at Confirm Actual.** For a bare-accepted, single-product
  plan, the exact planned product/quantity are real and already treated
  elsewhere as authoritative enough to count toward farm-wide Planned
  demand and to GPS-match/start a job (`selectedProductName`'s own
  established fallback rule) — but `getLinkedFertiliserPlanForJobSessionAction`
  only ever read explicit `edits.plannedProduct`/`plannedQuantityKg`,
  leaving both empty for a bare acceptance. Since fertiliser Actual
  product/quantity are optional, a farmer could confirm that job with
  neither recorded, turning a perfectly well-known application into an
  unresolved-composition Actual that cannot reduce the remaining
  requirement. Fixed: the action now reuses `selectedProductName` (the
  same value already trusted elsewhere) for `plannedProduct`, and falls
  back to that product's own real `totalKg` for `plannedQuantityKg`
  whenever no explicit `edits.plannedQuantityKg` exists — covering both
  a bare single-product acceptance and a farmer who named a product but
  never overrode its quantity. `plannedDate` is unaffected (no real
  fallback exists for it). The test that previously asserted both
  values stay `undefined` for this exact case has been rewritten to
  assert the real prefilled values, plus two new tests covering the
  multi-product (no safe fallback) and named-product-only-quantity-
  fallback cases.
- **MEDIUM, fixed — the round-13 GPS race fix still left a
  post-lookup stale-result window.** Round 13 disabled Confirm only
  while the *initial* matchable-plan lookup was in flight; once it
  settled to `"none"`/`"ambiguous"`, that result was kept for the whole
  candidate cycle with no revalidation, so a plan saved/unlinked
  after that lookup settled but before the farmer's tap could still be
  silently bypassed. Fixed: `confirm()` now re-resolves the matchable
  plan itself, right before deciding whether to link or start manually
  — the authoritative check happens at confirmation time, not from
  cached state; a failed re-check still falls back to the same existing
  safe manual-start path. A narrow client/server race remains
  inherent to any client-driven two-step flow (the few hundred
  milliseconds between this re-check and the actual session-creation
  call) — a materially smaller window than before this fix, not a
  claim of full atomicity; a genuinely atomic fix would require a single
  server action that itself chooses between linked/manual start, which
  this round's fix does not attempt.
- **MEDIUM, fixed — fertiliser recomputation ignored its own supplied
  calculation date.** `recomputePromptByKind`'s `fertiliser_recommendation`
  branch received a real, injectable `input.now` but passed `undefined`
  as `calculateNutrientPlan`'s own `asOfDate`, and `getFarmFertiliserDemand`
  did the same at both of its own `calculateNutrientPlan`-adjacent call
  sites — each silently fell back to the process clock for soil-test-age
  validity while the very same operation's season boundary (or the
  Prompt's own `createdAt`) used the real supplied date. A historical or
  deterministic recompute could therefore combine one date's Actuals
  with another date's evidence validity. Fixed: all three call sites now
  thread the real supplied date through as `asOfDate` too. Verified via
  `recompute.test.ts`'s new test asserting `inputsSnapshot.asOfDate`
  equals the supplied `now`, not a fallback `new Date()` value. Note:
  `getFarmFertiliserDemand`'s own two call sites have no test asserting
  an *observable* behaviour difference from this fix, because neither
  `asOfDate` nor `pBuildUpCompliance` currently affects that function's
  own return shape (`FarmFertiliserProductDemand[]`, kg totals only) —
  both inputs only ever change `napCompliance`, which that function
  computes internally (for the product-membership check) but does not
  expose. The fix is still correct and necessary for internal
  consistency and any future consumer of that internal recommendation,
  but is honestly documented here as unobservable at this exact call
  site today, rather than backed by a synthetic test that could not
  actually fail without it.

Both prior open questions in `docs/evidence-register.md` (round 9's
withdrawn rejection, round 11/12's buffer-alert correction) were
re-examined fresh by this round's own broad review and re-confirmed
correct — no new issue found in either.

Quality gate after round 14: 1998/1998 tests (147/147 files), typecheck/
lint pass — up from 1990/1990 (146/146), +8 new tests, +1 new test file
(`src/orchestration/prompt/recompute.test.ts`). Full `scripts/quality-gate.sh`
(including build) run separately, see below.

## Codex audit round 15 — 0 Critical, 1 High, 2 Medium: all 3 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`1e4660b`, again asked for a genuinely fresh, unhurried full re-read (not
a targeted pattern-hunt), and to fresh-eyes re-review every prior
withdrawn/rejected finding plus round 14's own two new disclosed
judgement calls. All three findings were real; every prior finding and
both of round 14's own judgement calls were re-confirmed correct — the
audit explicitly agreed with the round-9/round-11-12 corrections and
with round 14's own commonage/buffer-noise and untestable-`getFarmFertiliserDemand`-call-site
reasoning, finding no new issue in either. (Test execution itself could
not be repeated inside the audit's own read-only worktree — `vitest` is
not installed there — so this round's conclusions come from a complete
source/test *review*, not a re-run; every finding below was independently
re-verified against real code and, where relevant, real fixture output
before being fixed.)

- **HIGH, fixed — `RemainingFertiliserRequirementCard.tsx` could display
  the PREVIOUS field's own real requirement/applied/remaining figures
  under a NEW field's heading.** The effect resetting `result` only ever
  fired when `canRecord` turned off — never on a plain `fieldId` change
  — so switching the Nutrients screen's selected field started a new
  fetch but left the old field's real numbers rendered until the new
  fetch resolved, and *indefinitely* if it ever rejected (the rejection
  handler only logged). Concretely: field A showing "0 kg N/ha still
  required" (fully applied) could remain visible under field B's own
  heading while B's real N requirement is still fully outstanding — a
  genuinely unsafe spreading decision if acted on. Fixed: `result` now
  resets unconditionally at the top of the effect, before either the
  early `!canRecord` return or the new fetch — nothing is shown
  (`!result` renders null) rather than a stale, wrong field's real
  numbers, for either an unresolved lookup or a rejected one.
- **MEDIUM, fixed — farm-wide "Planned" demand miscounted a real,
  legitimately partial plan edit.** `validateFertiliserPlanEdits`
  explicitly allows `plannedProduct`/`plannedQuantityKg` to be edited
  independently, and round 14's own `getLinkedFertiliserPlanForJobSessionAction`
  fix explicitly supports a product-only edit by deriving that product's
  own real recommended quantity — but `getFarmFertiliserDemand`'s
  planned-decision candidate derivation still required BOTH properties
  to trust any explicit edit at all, falling all the way back to the
  bare single-product snapshot otherwise. A product-only edit naming a
  different product from a multi-product recommendation was therefore
  omitted from Planned entirely, even though the identical plan is
  already unambiguous/executable and correctly prefilled at Confirm
  Actual; symmetrically, a quantity-only override on a single-product
  recommendation counted the *original* recommended quantity, silently
  discarding the farmer's own explicit correction. Fixed by extracting
  `selectedProductName` (Codex audit HIGH round 9/10's own established
  single-product-fallback rule, until now only living in
  `src/app/actions/fertiliser-plan.ts`) into `fertiliser-plan/index.ts`
  — exported and reused by both files, closing this exact drift risk
  the same way `isTillageField`/`hasNoRecordedLivestock` (round 8) and
  `isPlanProductStillRecommended` already did — with the candidate's
  quantity independently preferring the farmer's own explicit
  `plannedQuantityKg` override, falling back only to that *specific*
  resolved product's own real recommended `totalKg`, never the wrong
  product's or the wrong (all-or-nothing) fallback.
- **MEDIUM, fixed — `NutrientsPageClient.tsx`'s "already planned"
  disclosure could leak one field's state onto another.** Identical bug
  shape to the HIGH above, in the sibling `existingPlan` effect: reset
  only fired on `!isRealMode || !field`, never on a plain field switch.
  Switching from a field with no plan to one that already has one (or
  the reverse) kept showing the *previous* field's own disclosure/button
  label until the new lookup resolved — concretely, a farmer could open
  "Plan this application" and save a genuine nuisance-duplicate plan for
  the new field before its own real "you already have one" disclosure
  ever caught up, reintroducing exactly the duplicate-plan risk rounds
  4-5 built this disclosure to prevent. Fixed identically: `existingPlan`
  now resets unconditionally at the top of the effect, before either the
  early-return or the new lookup.

Quality gate after round 15: 2004/2004 tests (147/147 files), typecheck/
lint/build all pass — up from 1998/1998 (147/147), +6 new tests.

## Codex audit round 16 — 0 Critical, 1 High, 0 Medium, 0 Low: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`69db86b`, again asked for a genuinely fresh full re-read, to
specifically check for a third instance of round 15's own "per-field
render state not reset on a field switch" bug shape, and to fresh-eyes
re-review every prior withdrawn/rejected finding plus rounds 14-15's own
judgement calls/fixes. One real finding; every prior finding and every
one of rounds 14-15's own judgement calls were re-confirmed correct — no
third instance of the round-15 bug shape was found (the audit explicitly
checked `GpsActivityCandidateCard.tsx` and `ActiveJobSessionView`, both
sound). (`vitest`/`node_modules` remain absent in the audit's own
read-only worktree, as round 15's audit also found — conclusions are
from a complete source/test review, not a re-run.)

- **HIGH, fixed — the downloadable Nutrient Plan CSV report was the one
  real `calculateNutrientPlan` call site round 14's own Article 17(6)
  propagation missed.** `buildNutrientPlanReportCsv` had no parameter
  for `Farm.pBuildUpCompliance`, and the Reports screen (`ReportsPageClient.tsx`)
  never even read the current `Farm` record to have one to pass. Since
  rounds 9 and 13 specifically made this report's own NAP columns
  authoritative-looking and fail-closed, this was a real, signed-in
  compliance-record export silently defaulting every farm to "not
  proven" and Table 15a's lower P ceiling — for a farm with all three
  real Article 17(6) conditions genuinely satisfied, a recommendation
  between Table 15a's 39 kg P/ha and Table 15b's enhanced 69 kg P/ha
  exported `P within NAP ceiling = No` when the farm's actual recorded
  evidence makes the correct answer `Yes`. Fixed: `buildNutrientPlanReportCsv`
  gained the identical trailing optional `pBuildUpCompliance` parameter
  every other real call site now has, and `ReportsPageClient.tsx` now
  reads `useFarm()` and passes `farm.pBuildUpCompliance?.value` through.
  Verified with an empirically-derived fixture: a silage cut not
  intended for sale (so the ordinary grazing-style P ceiling gate
  applies) with a real P requirement of 50 kg/ha, squarely between the
  two ceilings — the exported CSV cell flips from `No` to `Yes` with the
  evidence supplied, nothing else about the row changes.

Quality gate after round 16: 2005/2005 tests (147/147 files), typecheck/
lint/build all pass — up from 2004/2004 (147/147), +1 new test.

## Codex audit round 17 — 1 Critical, 1 High: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`ec10ba5`, specifically asked to re-verify Article 17(6) propagation is
now genuinely complete everywhere (rounds 14/16 had each separately
claimed completeness and each been wrong), to check for any other
farm/field-level evidence input some call sites supply and others
silently omit, to check for a third instance of round 15's field-switch
stale-state bug shape, and to fresh-eyes re-review every prior
withdrawn/rejected finding plus rounds 14-16's own judgement calls. Both
findings real, both fixed. Every prior finding and judgement call
re-confirmed correct; no third instance of round 15's bug shape found
(`GpsActivityCandidateCard`/`ActiveJobSessionView`/`FertiliserPlanSheet`
all re-checked and sound).

- **CRITICAL, fixed — "Generate audit trace" was a seventh independent
  path omitting both real slurry allocation and Article 17(6) evidence
  from its own `calculateNutrientPlanWithTrace` call.**
  `RecommendationAuditTrailCard` read `useFields()`/`useLivestockGroups()`
  but never `useSlurryAllocations()`/`useFarm()` — a field with a real,
  persisted slurry allocation got a persisted, exportable "audit trail"
  calculated as if none existed (overstating purchased-product
  quantities, omitting the real organic offset), and a farm with real,
  satisfied Article 17(6) evidence got a trace recording Table 15a's
  lower P ceiling instead of the enhanced Table 15b one — the identical
  substantive failure round 16 fixed for the CSV export, in a separate
  calculation path round 16 missed. Rated CRITICAL (not HIGH, like the
  CSV instance) because this surface specifically describes itself as a
  peer-reviewable audit trail, persisted to `localStorage` and
  exportable as CSV/JSON/text — closer to `RecommendationAuditTrailCard`'s
  own round-11 CRITICAL (tillage/missing-livestock) than an ordinary
  display bug. Fixed by adding `useSlurryAllocations()`/`useFarm()` and
  threading `slurryAllocation`/`pBuildUpCompliance` into the trace call,
  identical to every other real call site. Verified two ways: (1) a
  field with a real slurry allocation now gets a persisted "statutory
  manure N/P ledger value" decision record with a real, positive
  quantity — entirely absent without one (`statutoryManureNutrientValue`'s
  own `NO_MANURE_APPLICATION_TO_VALUE` `NOT_APPLICABLE` when quantity is
  zero); (2) the trace's own `P_BUILD_UP_ELIGIBILITY` compliance check
  (already built into `nutrient-plan-trace.ts` before this round) flips
  from `FAIL` to `PASS` with the round-14/16 empirically-derived fixture,
  using the identical evidence.
- **HIGH, fixed — the Dashboard's own NAP-ceiling alert was the eighth
  real `calculateNutrientPlan` call site missing Article 17(6)
  evidence.** `deriveRealAlerts` (`src/domain/real-alerts.ts`) already
  receives the complete real `Farm` (used elsewhere in the same
  function for the closed-period county lookup) but never forwarded
  `input.farm.pBuildUpCompliance?.value` to its own `calculateNutrientPlan`
  call — a farm satisfying Article 17(6) with a P recommendation between
  the two ceilings would see a real, false "Planned application exceeds
  NAP ceiling" dashboard warning the Nutrients Prompt/CSV/audit-trace
  paths (once fixed) correctly do not raise. Fixed identically. **Disclosed,
  not tested with a new fixture** (the same honest disclosure round 14
  made for `getFarmFertiliserDemand`): `deriveRealAlerts` has no
  `silage` input at all (`DeriveRealAlertsInput` is grazing-only), and
  for real grazing (never silage) this data model's own P requirement
  is structurally capped at 36 kg/ha (`pBuildUpKgHa`'s max 20 +
  `pMaintenanceGrazingKgHa`'s drystock max 16) — below every real
  Table 15a grazing ceiling band (minimum 27, at Index 1's lowest
  stocking band) regardless of index or stocking rate. `pWithinCeiling`
  is therefore always `true` for a real grazing field in this app today,
  so `pBuildUpCompliance` (which only ever affects the P ceiling, never
  N) cannot currently flip this specific alert's own trigger condition
  for any real fixture — the fix is still correct and necessary for
  consistency with every other call site (and for whenever this
  function's own scope grows to cover silage), just not independently
  provable through this alert today.
- **Round 14/16's own claims of complete Article 17(6) propagation were
  both wrong** — disclosed here directly rather than silently
  superseded: round 14 believed it had covered "all five real call
  sites"; round 16 believed its CSV fix was the "sixth and final" one
  round 14 missed. This round found two more (audit-trace, dashboard
  alerts) — eight real call sites in total now confirmed propagating
  this evidence consistently (`build-all.ts`, `recompute.ts`,
  `getFarmFertiliserDemand`'s two calls, `NutrientsPageClient.tsx`'s two
  calls, `buildNutrientPlanReportCsv`, `RecommendationAuditTrailCard.tsx`,
  `deriveRealAlerts`) — `finance.ts`'s two calls remain the one
  deliberately-verified exception (Area 1 of this round's own coverage
  confirmed `finance.ts` never reads `plan.napCompliance` at all, so the
  omission there is genuinely inert, not merely undisclosed).

Quality gate after round 17: 2008/2008 tests (147/147 files), typecheck/
lint/build all pass — up from 2005/2005 (147/147), +3 new tests.

## Codex audit round 18 — 0 Critical, 1 High: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`b35549c`. Explicitly instructed, given rounds 14 and 16 had each
wrongly claimed complete Article 17(6) propagation from memory, to
FIRST run a real, exhaustive grep-based enumeration of every real
(non-test) `calculateNutrientPlan`/`calculateNutrientPlanWithTrace`/
`promptForFertiliserRecommendation` call site in `src/` and check each
one's propagation status explicitly, before doing anything else — and
to check every real optional `CalculateNutrientPlanInput` field (not
just `pBuildUpCompliance`) for the identical some-call-sites-supply-
it/others-silently-omit-it drift pattern. One real finding, fixed. The
dedicated enumeration this round produced (reproduced in full in this
round's own audit log) confirms Article 17(6) propagation is now
genuinely complete across all eight real call sites identified in round
17, with `finance.ts`'s two calls remaining the one deliberately-
verified inert exception — the first time this claim has actually been
verified by enumeration rather than reasoning from memory.

- **HIGH, fixed — the Dashboard's own NAP-ceiling alert discarded the
  farm's real non-grass-eligible-area evidence, a completely separate
  omission from round 17's `pBuildUpCompliance` fix in the same
  function.** `deriveRealAlerts` computes `farmGrasslandAggregates(input.fields)`
  — the identical call already used for `farmGrasslandAreaHa` — but
  only ever destructured that one field, silently discarding the
  returned `nonGrassPct`. `calculateNutrientPlan`'s own elevated-N-
  ceiling eligibility gate (`isEligibleForElevatedNRate`, GFT023/GFT024)
  therefore always saw 0%, regardless of a farm's real recorded
  evidence. Concretely: a real statutory GSR of 230 kg N/ha with a real
  N requirement of 193 kg N/ha is genuinely compliant against the real
  214 kg N/ha elevated ceiling a farm with ≥5% real non-grass area
  unlocks — but with `nonGrassPct` discarded, the same field falls back
  to the lower, ineligible-farm 185 kg N/ha ceiling and is misclassified
  as exceeding it, a false "Planned application exceeds NAP ceiling"
  Dashboard warning built from the farm's own recorded evidence. Fixed
  by threading `nonGrassPct` through to the same `calculateNutrientPlan`
  call, alongside `pBuildUpCompliance`. Verified with an empirically-
  derived fixture (25 dairy cows over 10ha grazing + 0.6ha tillage,
  giving ~5.7% real non-grass area) where the alert genuinely does not
  fire for a real N requirement that would otherwise (and, before this
  fix, actually did) exceed the ineligible-farm ceiling.

This is a distinct bug from round 17's `pBuildUpCompliance` fix in the
identical function/call — `nonGrassPct` and `pBuildUpCompliance` are two
independent `CalculateNutrientPlanInput` fields with two independent
statutory effects (elevated N ceiling vs. enhanced P ceiling), and this
round's own dedicated audit confirmed no other real optional input to
`calculateNutrientPlan` has this same some-sites-supply-it/others-omit-it
gap at any real call site today.

Quality gate after round 18: 2009/2009 tests (147/147 files), typecheck/
lint/build all pass — up from 2008/2008 (147/147), +1 new test.

## Codex audit round 19 — 0 Critical, 1 High, 1 Low: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`8597401`. Confirmed round 18's own dedicated enumeration: Article
17(6)/`nonGrassPct` now reach every real call site that consumes NAP
compliance, with no other campaign-added/modified function found to
have a meaningful required input supplied by only some of its own
equivalent real callers. Two real UI findings, both fixed — the first
a genuinely new instance of round 13's own "action stays enabled while
its prerequisite identifier-scoped lookup is still pending" bug shape,
never previously found in `NutrientsPageClient.tsx` despite three
separate rounds (15, 17, 18) checking this exact component for other
issues.

- **HIGH, fixed — "Plan this application" stayed enabled through its
  own prerequisite existing-plan lookup's loading and failure states,
  permitting a real duplicate plan.** `existingPlan === undefined`
  conflated three materially different states — not yet queried, the
  lookup still in flight, and the lookup having genuinely failed — and
  the button rendered identically (enabled, "Plan this application") in
  all three. A farmer opening the Nutrients screen for a field that
  already has a real, unlinked, matchable plan could tap "Plan this
  application" and persist a genuine duplicate Decision before the real
  `getMatchablePlanForFieldAction` lookup resolved, or indefinitely if
  it kept failing (the rejection handler only logged) — recreating
  exactly the nuisance-duplicate state the round-4/5 disclosure exists
  to prevent, after which GPS matching then correctly refuses to guess
  which of the two plans is real (returns `"ambiguous"`), leaving
  neither auto-linkable. The identical race shape round 13 fixed in
  `GpsActivityCandidateCard` via its own `matchablePlanLoading`, never
  applied here. Fixed with the same established pattern: a new
  `existingPlanLoading` state disables the button and shows "Checking…"
  until the lookup genuinely settles; a new `existingPlanCheckFailed`
  state shows the identical honest "couldn't safely check" disclosure
  the truncated/ambiguous case already uses — but, unlike the loading
  state, does NOT keep the button disabled afterward (the underlying
  action isn't unsafe on its own, only possibly redundant; an
  indefinite block on a real failure would trap a farmer who has never
  actually planned this field at all).
- **LOW, fixed — a genuine remaining-requirement fetch failure rendered
  as silent absence, indistinguishable from a real NOT_APPLICABLE
  field.** `RemainingFertiliserRequirementCard`'s round-15 fix correctly
  stopped a fetch failure from leaving the PREVIOUS field's stale
  figures visible, but the replacement state (`result` staying
  `undefined`) renders nothing at all — the identical render path a
  genuinely not-applicable field, or one not yet fetched, already takes.
  A farmer revisiting this screen during a real network/database
  failure, immediately after recording a confirmed application, would
  see the whole "Remaining requirement" card silently vanish with no
  way to tell that from "nothing to show here". Fixed with a new
  `checkFailed` state rendering its own honest, distinct disclosure
  ("Farm Return couldn't check this field's remaining requirement right
  now — try again shortly") instead of returning `null`.

Both existing round-15 field-switch tests for these two components
needed updating to match the new, more correct behaviour (the
`NutrientsPageClient` one asserted the button rested on "Plan this
application" during a still-pending lookup — now correctly "Checking…"
instead; the important assertion, that the previous field's own
"already planned" state never leaks through, is unchanged and still
holds).

Quality gate after round 19: 2012/2012 tests (147/147 files), typecheck/
lint/build all pass — up from 2009/2009 (147/147), +3 new tests.

## Codex audit round 20 — 0 Critical, 1 High, 1 Medium, 1 Low: all 3 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`5890f48`, specifically asked to systematically check every campaign
component with its own async data-fetching effect for round 19's exact
bug shape (action stays enabled/silent through a pending or failed
prerequisite lookup), since three prior rounds (15, 17, 18) had each
reviewed some of these exact components for other issues without
finding it. All three findings real, all fixed — two more instances of
that same shape, in components not yet checked for it specifically,
plus one new instance of round 14's clock-consistency discipline. Every
prior finding and judgement call from rounds 14-19 re-confirmed correct,
with one explicit, well-argued disagreement (below) that was accepted.

- **HIGH, fixed — Confirm Actual opened fully interactive before its
  own linked-plan prerequisite lookup settled, in `ActiveJobSessionView.tsx`/
  `ConfirmActualSheet.tsx`.** `linkedPlan === undefined` meant both
  "still loading" and "the lookup genuinely failed" — identical to a
  non-plan-origin session's own permanent "nothing to prefill" state —
  and `ConfirmActualSheet` rendered immediately, fully interactive, in
  all three. A farmer confirming quickly (or during a slow/failed
  fetch) could submit before round 14's own prefill fix ever populated
  the known product/quantity, or indefinitely on a genuine failure, with
  no indication anything was expected — quietly undermining round 14's
  own stated purpose. Fixed with the same established pattern: new
  `linkedPlanLoading`/`linkedPlanCheckFailed` props threaded from
  `ActiveJobSessionView`'s own fetch, rendered as an honest, distinct
  disclosure near the product/quantity fields in `ConfirmActualSheet` —
  deliberately **not** blocking submission itself, since the farmer has
  already finished a real job and must always be able to record it (the
  same "never trap on a failure" reasoning round 19 established).
- **MEDIUM, fixed — a failed CONFIRM-TIME GPS plan-match lookup was
  silently treated as a confirmed "no plan exists", in
  `GpsActivityCandidateCard.tsx`.** Round 14's own confirmation-time
  re-check (added to close a stale-result race) caught any lookup
  failure and substituted a synthesised `{status: "none"}`, then
  proceeded to start an unlinked manual session on that basis. **This
  round's audit explicitly disagreed with round 14's own judgement that
  a lookup failure is safely equivalent to "no match" — and that
  disagreement is accepted as correct**: a genuine `"none"` result
  establishes real absence; a rejected lookup establishes nothing at
  all, and silently taking the unlinked branch on it could leave a
  real, unambiguous planned application permanently uncounted while an
  orphaned manual session gets created instead. Fixed by letting a
  confirm-time lookup failure propagate to this function's own existing
  outer error handler instead of being swallowed — nothing has been
  committed yet at that point (no session/Decision created), so this
  safely fails the whole confirm attempt with the same "Couldn't start
  this job" message every other real failure in this function already
  shows, and the farmer can simply tap Confirm again.
- **LOW, fixed — `getFieldFertiliserStatusAction` could combine two
  different calendar years' evidence in one result.** It already
  captures a real `now` for the recommendation recompute, but never
  threaded that same value into `getFieldRemainingFertiliserRequirement`'s
  own `asOfDate` — that call independently read the process clock for
  its confirmed-session season boundary. A request straddling a
  calendar-year rollover could combine one date's recommendation/soil-
  evidence state with the other date's confirmed-Actuals season
  boundary. Fixed by threading the already-captured `now` through,
  the identical discipline round 14 already required for every other
  deterministic recompute path in this vertical.

This round's own systematic per-component sweep (item 3 of its review)
explicitly confirmed no further instance of this bug shape remains
across every campaign component with an async data-fetching effect.

Quality gate after round 20: 2018/2018 tests (147/147 files), typecheck/
lint/build all pass — up from 2012/2012 (147/147), +6 new tests.

## Codex audit round 21 — 0 Critical, 0 High, 1 Medium, 0 Low: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`87eaf6c`. Independently re-enumerated the live `calculateNutrientPlan`/
`calculateNutrientPlanWithTrace`/`promptForFertiliserRecommendation`
call sites and confirmed rounds 17-19's Article 17(6)/`nonGrassPct`
propagation conclusion holds; spot-checked (rather than re-deriving from
scratch) the round-20 async-prerequisite UI sweep and confirmed it
holds too. One real finding — a genuinely new class of gap, not another
instance of the propagation or async-prerequisite patterns rounds
14-20 already closed.

- **MEDIUM, fixed — a real confirmed fertiliser Actual whose quantity
  couldn't be resolved to a real kg figure vanished from farm-wide
  demand with no disclosure that it had.** `totalProductQuantityKgByProduct`
  correctly excludes a quantity it cannot convert (most commonly
  `quantityUnit: "bags"` — no verified bag weight exists anywhere in
  this app) rather than inventing one, but `getFarmFertiliserDemand`
  had no way to disclose that exclusion happened at all: it could
  return `confirmedAppliedTotalKg: 0`/the full `recommendedTotalKg`
  left in `remainingTotalKg`/`truncated: false` for a farm whose real
  bag-recorded application genuinely happened but silently isn't
  counted — apparently complete, honest-looking figures that
  understate the truth. This differs from field-level remaining
  requirement, which already discloses the identical situation one
  field at a time via `applicationsWithUnknownComposition`; the
  farm-wide aggregator never had an equivalent. Fixed: a new
  `countUnresolvedFertiliserQuantities` (reusing the identical
  exclusion predicate `totalProductQuantityKgByProduct` itself applies,
  factored into one shared, un-exported `isUnresolvedFertiliserQuantity`
  so the two functions can never silently drift apart about what counts
  as "resolved") gives `getFarmFertiliserDemand` a real farm-wide
  `applicationsWithUnknownComposition: number`, threaded additively
  through every consumer: `FarmFertiliserDemandResult` →
  `getFarmFertiliserDemandAction`'s own `FarmFertiliserDemandActionResult`
  → `FarmContext`/`FarmContextInputs`'s new
  `fertiliserDemandApplicationsWithUnknownComposition` field (the
  identical pattern `fertiliserDemandTruncated` already establishes).
  Deliberately farm-wide, not per-product — an unresolved quantity with
  no real product name at all cannot be attributed to one row, the same
  reason `truncated` itself is a whole-result flag, not a per-row one.
  Only ever non-zero for confirmed-Actual quantities in practice
  (planned quantities are always built with a literal `"kg"` unit, so
  can never trigger this exclusion) — verified with a real "bags"-unit
  confirmed session, and with a control case proving a cleanly-resolved
  confirmed session reports zero.

Quality gate after round 21: 2027/2027 tests (147/147 files), typecheck/
lint/build all pass — up from 2018/2018 (147/147), +9 new tests.

## Codex audit round 22 — 0 Critical, 1 High, 1 Low: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`a0d102c`, asked whether round 21's own new disclosure discipline
(`applicationsWithUnknownComposition` for unconvertible confirmed
quantities) is now complete and consistent everywhere it should apply,
and whether any other domain function has a similar silent-exclusion
gap. Both findings real, both fixed — the HIGH is the exact class round
21 itself introduced, found in two sibling aggregators round 21 never
touched.

- **HIGH, fixed — blocked grazing fields collapsed to a complete-
  looking zero/empty result in Finance and farm-wide demand, the same
  disclosure gap round 21 fixed for unconvertible confirmed quantities,
  in two aggregators that round never touched.** `calculateFarmFertiliserRequirement`
  (`src/domain/finance.ts`) and `getFarmFertiliserDemand`'s own
  Recommended total both correctly exclude a grazing field with no
  recorded livestock (the authoritative
  `BLOCKED_INSUFFICIENT_EVIDENCE("MISSING_LIVESTOCK_DATA")` gate) —
  but neither disclosed that the exclusion happened. A farm with real,
  unrecorded-livestock grazing fields saw "Estimated fertiliser spend
  €0" indistinguishable from a genuine "no purchase needed" farm, and
  `getFarmFertiliserDemand`'s `demand: []`/`truncated: false` looked
  like a complete, real "nothing to buy" answer. Fixed with the
  identical pattern round 21 established: a new `fieldsWithBlockedEvidence`
  count on `FarmFertiliserRequirement` (deliberately never counting a
  tillage field — genuinely `NOT_APPLICABLE`, not a "cannot calculate"
  case) and on `FarmFertiliserDemandResult`, threaded through
  `FertiliserSlurryCard.tsx` (a new disclosure line) and
  `getFarmFertiliserDemandAction`'s own result / `FarmContext` (the
  same `fertiliserDemandTruncated`/`fertiliserDemandApplicationsWithUnknownComposition`
  pattern). Verified with real fixtures for both the exclusion and
  control (complete-evidence, and tillage-never-counted) cases.
- **LOW, fixed — the remaining-requirement exclusion disclosure falsely
  attributed every exclusion reason to a catalogue mismatch.**
  `applicationsWithUnknownComposition` covers four real, distinct
  reasons (missing product, missing/invalid quantity or unit, an
  unverified "bags" conversion, or a genuinely unrecognised product),
  but `RemainingFertiliserRequirementCard.tsx` always explained it as
  "product not in Farm Return's verified catalogue" — concretely wrong
  for the other three, and pointing a farmer at the wrong field to fix.
  Fixed with an accurate umbrella phrase covering all four real cases,
  rather than threading a new reason-code breakdown through the whole
  chain for a LOW-severity copy issue.

Quality gate after round 22: 2033/2033 tests (148/148 files), typecheck/
lint/build all pass — up from 2027/2027 (147/147), +6 new tests, +1 new
test file (`src/components/finance/FertiliserSlurryCard.test.tsx`, this
component's first).

## Codex audit round 23 — 0 Critical, 2 High, 0 Medium, 0 Low: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`cf9ba47`, asked whether round 21/22's own "a real exclusion must never
collapse into a complete-looking result" disclosure discipline is now
genuinely complete everywhere it should apply. Both findings real, both
fixed — the first is round 22's own disclosure fix, itself incomplete;
the second is a completely independent instance of the much older
(round 9/10) tillage/missing-livestock silage exemption, missed in
`reports.ts` specifically.

- **HIGH, fixed — round 22's own `fieldsWithBlockedEvidence` fix was
  itself incomplete: it only ever counted the missing-livestock
  exclusion, never a field with recorded livestock but missing P/K Soil
  Index evidence.** `calculateFarmFertiliserRequirement` still called
  `calculateNutrientPlan` for such a field, got back a real, correctly
  fail-closed `purchasedProducts: []` (`plan.fertilityEvidence.status
  !== "OK"`), and silently contributed nothing to `byProductMap` with
  no increment to the new counter — the exact same "complete-looking
  zero" failure round 22 itself was meant to close, just from a
  different real cause. Fixed by checking `plan.fertilityEvidence.status`
  after computing each field's plan and counting it there too —
  deliberately still never counting a field whose fertility evidence is
  genuinely `OK` but recommends little or nothing for other real
  reasons (Index 4 soil, in particular, still recommends real N
  regardless — verified empirically that a genuine real-zero case
  doesn't exist for N here, so the two are not conflated in practice
  either).
- **HIGH, fixed — the Nutrient Plan CSV report applied the missing-
  livestock exclusion to silage fields too, overwriting their real,
  livestock-independent N/P/K requirement with `INSUFFICIENT_EVIDENCE`.**
  `buildNutrientPlanReportCsv`'s own `nRecommendable = !tillage &&
  !noLivestock` ignored the exact silage exemption `calculateFarmFertiliserRequirement`
  (round 10) and `RecommendationAuditTrailCard.tsx` (round 11) both
  already apply — silage N/P/K (`nSilageKgHa`/`pMaintenanceSilageKgHa`/
  `kSilageKgHa`) never depends on `livestockGroups` at all. A real,
  complete-evidence silage field on a farm with genuinely no recorded
  livestock had its real N/P/K requirement, organic offsets, purchased
  products, and every NAP column replaced with `INSUFFICIENT_EVIDENCE`
  in this real, downloadable, per-field export. Fixed by exempting a
  field with a real, matching `SilagePlan` from the livestock gate,
  identical to the two other call sites — `nRecommendable = !tillage &&
  (!noLivestock || silagePlan !== undefined)`.

Both findings show the same lesson stated plainly in this round's own
audit: a disclosure or gate fix applied at one call site does not
automatically reach every sibling call site with the identical shape —
each of rounds 10, 11, 21, and 22 fixed the same underlying pattern
once, and each time at least one sibling was missed until a
later round found it independently.

Quality gate after round 23: 2036/2036 tests (148/148 files), typecheck/
lint/build all pass — up from 2033/2033 (148/148), +3 new tests.

## Codex audit round 24 — 0 Critical, 3 High, 1 Medium: all 4 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`fc9b8a9` (the round-23 commit), explicitly asked for a full enumerated
cross-check table of both recurring sub-patterns (silage exemption from
the missing-livestock gate; blocked-evidence exclusions disclosed rather
than left as a complete-looking zero) across every real call site, rather
than trusting any prior round's "complete" claim from memory. Found 4
more real gaps despite 5 prior rounds (9/10, 11, 21, 22, 23) each having
believed they'd found the last one.

- **HIGH, fixed — `NutrientsPageClient.tsx` reused one boolean for two
  different gates with two different correct answers.** Its own
  `showFertiliserRecommendation = !tillage && !noLivestock` fed both the
  display gate (should carry the silage exemption, like every other
  aggregator since round 10) and the "can plan an application" gate
  (should not — planning a purchased-product application from a
  grazing-only recommendation genuinely requires livestock, exemption or
  not). A real silage field on a farm with no recorded livestock had its
  entire requirement/NAP/product card hidden. Fixed by splitting into two
  independent booleans: `showFertiliserRecommendation` now includes
  `|| silagePlan !== undefined`; `canPlanFertiliserApplication` re-checks
  `!noLivestock` directly, never inheriting the exemption.
- **HIGH, fixed — `calculateFarmSlurryNutrientValueEur` had the identical
  missing-disclosure gap `calculateFarmFertiliserRequirement` closed in
  rounds 22/23, never applied here.** A real grazing field excluded from
  the slurry-value total (no recorded livestock, or missing P/K Soil
  Index evidence) left "Slurry nutrient value €0" indistinguishable from
  a genuine zero saving. Fixed with a new `FarmSlurryNutrientValueResult
  { value, fieldsWithBlockedEvidence }` return type (previously a bare
  `TrackedValue<number>`, one real caller) and a corresponding new
  disclosure block in `FertiliserSlurryCard.tsx`. Implementing this
  surfaced a genuine ordering bug caught via a self-written test, not by
  Codex: the loop originally checked missing-livestock/fertility-evidence
  *before* checking whether the field had any applicable slurry
  allocation at all, so a field with no slurry allocated (nothing to
  calculate in the first place) was miscounted as blocked. Fixed by
  reordering the loop so the slurry-applicability check runs first.
- **HIGH, fixed — `deriveRealAlerts` silently skipped its own two
  ledger-dependent checks (NAP-ceiling, national-buffer) for every
  non-tillage field when the farm has no recorded livestock, with no
  disclosure.** The Dashboard's `AlertsCard` showed "No compliance alerts
  from your current farm data" — a complete-looking all-clear — even
  though those two real, advertised checks were never actually run.
  Fixed with a new `DeriveRealAlertsResult { alerts,
  fieldsWithBlockedChecks }` return type (previously a bare
  `FarmAlert[]`, one real caller) and two new `AlertsCard.tsx` disclosure
  branches: one replacing the all-clear message when the alert list is
  empty but fields were blocked, another shown alongside a non-empty
  alert list (a farm can have real alerts and real blocked checks at the
  same time).
- **MEDIUM, fixed — "Generate audit trace" silently skipped every
  grazing field when `livestockGroups` is empty, with no disclosure or
  persisted `BLOCKED_INSUFFICIENT_EVIDENCE` record.** Unlike the other
  three findings this round, this path already correctly exempted a
  matching silage plan (round 11) — the gap was narrower: the skip itself
  was invisible, so a farmer generating a trace on a farm with no
  recorded livestock got a run list that looked complete. Fixed with a
  `skippedFieldCount` tracked per generate call and a new disclosure line
  under the "Generate audit trace" button, rather than a persisted trace
  record — this screen's own runs represent a *produced* calculation, and
  a field that was never calculated has nothing to persist a trace of; a
  UI-level disclosure is the accurate representation, the same choice
  already made for every other blocked-evidence disclosure this round.

All four findings are further instances of the same recurring lesson
stated explicitly in this round's own audit brief: a gate/disclosure fix
applied at one call site does not automatically reach every sibling call
site with the identical shape. Six rounds now (9/10, 11, 21, 22, 23, 24)
have each independently found at least one more sibling this pattern
hadn't yet reached.

Quality gate after round 24: 2052/2052 tests (149/149 files), typecheck/
lint/build all pass — up from 2036/2036 (148/148), +16 new tests, +1 new
test file (`src/components/farm/AlertsCard.test.tsx` — this card had no
prior test coverage at all).

## Codex audit round 25 — 1 Critical, 2 High: all 3 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`77b887b` (the round-24 commit), asked for a genuinely fresh review (not
a repeat pattern-hunt trusting round 24's own "complete" claim) plus a
fresh enumerated call-site table and a re-verification that no
fabricated agronomy/price value reaches a farmer-facing screen. One new
CRITICAL and two more instances of the recurring "gate/disclosure fix
doesn't propagate to every sibling" pattern.

- **CRITICAL, fixed — `nutrients.ts`'s `PRODUCTS` prices were still the
  original Phase 1 mock market data (€480/€620/€555 per tonne),
  reaching real, signed-in farmer screens (Purchased Fertiliser,
  Dashboard, Finance, Input Planner) with no "sample data"/"not yet
  available" disclosure.** This one predates the Fertiliser Vertical
  campaign and was explicitly scoped out of rounds 5/6/9/10 as a
  "pre-existing, already-disclosed limitation" — correct at the time,
  since no real price source existed to fix it with. Round 25 found that
  `market.ts`'s own real CSO AJM09 fertiliser-price series (evidence
  class A-OFFICIAL, shipped for `/market-prices`/`MarketWatchCard`) has
  covered these exact three products (`CSO_COMPOUND_0_7_30`,
  `CSO_COMPOUND_18_6_12`, `CSO_UREA_46N` as a disclosed near-match for
  Protected Urea) since it shipped, without `nutrients.ts` ever being
  wired to it — turning this from "no real source exists" into "a real
  source exists in this exact repo and was never connected". Fixed by
  replacing the three hardcoded prices with each product's real, latest
  observed CSO price (`latestPoint(...)`) — deterministic (a fixed
  historical data point, not a live fetch), no calculation-version bump
  (a correctness fix, not a rule-set change, matching this campaign's
  own convention). No existing test asserted an exact `costEur` figure
  computed through `PRODUCTS` (only `fertiliser-plan.ts`'s own pure-
  arithmetic tests use a literal `620`, built from synthetic fixtures
  independent of `PRODUCTS`), so the entire 2052-test suite passed
  unchanged against the new real prices.
- **HIGH, fixed — round 24's own `fieldsWithBlockedChecks` on
  `deriveRealAlerts` counted only the missing-livestock reason, never a
  field with real livestock but a missing P/K Soil Index.** The exact
  "round 22 counted only missing livestock, not missing fertility"
  undercounting round 23 had to fix for `calculateFarmFertiliserRequirement`,
  reproduced inside round 24's brand-new field. Such a field's real
  NAP-ceiling check is already correctly blocked (`calculateNutrientPlan`
  forces `napCompliance` to `BLOCKED_INSUFFICIENT_EVIDENCE` whenever
  `fertilityEvidence.status !== "OK"`) — only the disclosure was
  missing. Fixed by also checking `plan.fertilityEvidence.status`,
  counted once per field even when both reasons apply; `AlertsCard.tsx`'s
  hard-coded "no recorded livestock" copy was generalised to the same
  "missing livestock or soil evidence" umbrella phrase
  `FertiliserSlurryCard.tsx` already uses.
- **HIGH, fixed — the farm-cost aggregates feeding the Dashboard KPI,
  Input Planner, and Input Summary all discarded their own
  `fieldsWithBlockedEvidence` disclosure before rendering.**
  `calculateFarmFertiliserCostEur` (the Dashboard's own fertiliser-cost
  source) called `calculateFarmFertiliserRequirement` and kept only its
  `totalCostEur`, throwing away the count — `FertiliserSlurryCard.tsx`
  had already worked around this by calling the requirement function a
  second time just to recover it. `input-planner/page.tsx` and
  `InputSummaryCard.tsx` both already held the complete result in scope
  but never rendered the count at all. Fixed: `calculateFarmFertiliserCostEur`
  now returns `{ value, fieldsWithBlockedEvidence }` (previously a bare
  `TrackedValue<number>`) — `FertiliserSlurryCard.tsx` updated to read it
  directly, its own redundant second call removed. `MetricCard.tsx`
  gained a new optional `partialCaption` prop (the same additive pattern
  as its existing `sampleData` pill) so the Dashboard's compact KPI tile
  can carry a one-line disclosure; the Input Planner page and
  `InputSummaryCard.tsx` gained a full disclosure line each, matching
  `FertiliserSlurryCard.tsx`'s own established copy.

Seven rounds now (9/10, 11, 21, 22, 23, 24, 25) have each independently
found at least one more sibling call site the "gate/disclosure fix
doesn't propagate" pattern hadn't yet reached — and round 25 additionally
shows that a fix explicitly and correctly scoped out as "no real source
exists yet" can stop being out of scope the moment a real source ships
elsewhere in the same codebase, without anyone connecting the two.

Quality gate after round 25: 2061/2061 tests (152/152 files), typecheck/
lint/build all pass — up from 2052/2052 (149/149), +9 new tests, +3 new
test files (`src/components/farm/InputSummaryCard.test.tsx`,
`src/app/(app)/input-planner/page.test.tsx`,
`src/app/(app)/dashboard/page.test.tsx` — none of these three had prior
test coverage at all).

## Codex audit round 26 — 1 Critical, 3 High, 1 Low: 1 Critical + 2 High fixed, 1 High rejected, 1 Low fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`50f80b7` (the round-25 commit), asked for a genuinely fresh review, a
re-check of round 25's own new fixes for completeness, and a check for
any other hardcoded/mock financial figure reaching a real screen. This
round surfaced the single most consequential finding of the whole
campaign — a real, previously-undetected gap in a foundational engine
branch, not another sibling-call-site disclosure gap — plus one finding
this round rejects after investigation, with rationale, as re-litigating
already-settled, deliberately-documented architecture.

- **CRITICAL, fixed — a field's own recorded `plannedUse` (a silage cut)
  was never checked against whether a real `silage` input was actually
  supplied to `calculateNutrientPlan`.** This app has no real, persisted
  `SilagePlan` source anywhere (`FERTILISER_VERTICAL_PHASE0.md`'s own
  disclosed scope limit) — every real caller in this vertical either
  omits `silage` entirely or passes `silagePlans: []`. Since
  `calculateNutrientPlan`'s own `if (silage) {...} else {...}` branch
  selects GRAZING whenever `silage` is absent, with no check against
  `field.plannedUse` at all, a real field the farmer has explicitly
  marked as a silage cut silently received a full, actionable
  GRAZING-basis N/P/K requirement and purchased-product blend instead —
  a wrong crop-specific formula presented with the same confidence as a
  correct one, reaching every real Prompt/Decision/GPS/Dashboard/
  Finance/CSV/audit-trace surface in the vertical. This is the missing
  counterpart to the tillage gate every caller already applies upstream
  — but unlike tillage (this app genuinely has no N/P/K table at all,
  `NOT_APPLICABLE`), silage DOES have real Green Book/NAP tables
  (13-4/14-2/16/17); this app just has no real per-field cut/yield
  evidence source for them yet, the same "cannot calculate, not nothing
  needed" shape as a missing P/K Soil Index. Fixed **inside
  `calculateNutrientPlan` itself** — deliberately breaking from this
  campaign's usual per-caller-gate pattern (the exact pattern that has
  produced 7 rounds of "one sibling call site missed" findings) — a new
  `silageEvidenceOk` check combines with the existing `fertilityEvidenceOk`
  into one `evidenceOk` gate covering `requirement`/`purchasedProducts`/
  `estimatedFieldCostEur`/`napCompliance` (a new `MISSING_SILAGE_PLAN_DATA`
  reason code), automatically propagating to every one of this engine's
  9+ real call sites with zero additional per-site changes needed.
  `organicApplication`'s own offset figures are deliberately left
  ungated: `slurryAvailableKgHa` is DM%/P/K-Index driven, not land-use
  dependent, verified by reading its own implementation before assuming
  otherwise. Exactly one existing test needed adjustment (a GSR-resolution
  test that happened to reuse the shared silage-planned-use fixture
  without ever supplying real silage evidence — given a grazing field
  instead, isolating the one real condition it was actually testing).
  **Follow-on fix, same root cause**: `PurchasedFertiliserCard.tsx` was
  still gated on `fertilityEvidence` alone, so a silage field blocked by
  the new gate had `fertilityEvidence.status === "OK"` but
  `products: []` — rendering an empty table with "Estimated field cost
  €0" exactly like a genuine zero, the very failure this card exists to
  prevent, for a reason it didn't yet know about. Fixed by gating on
  `requirement.status` instead (already `"unavailable"` for either real
  blocking reason, with `requirement.source` carrying the correct,
  reason-specific message) — this card no longer needs to know which
  reason applies, only whether one does.
- **HIGH, fixed — round 24's own `fieldsWithBlockedChecks` still missed a
  third real blocking reason.** Even with real livestock and complete
  fertility evidence, `plan.napCompliance` can independently resolve to
  `BLOCKED_INSUFFICIENT_EVIDENCE` when the real statutory GSR needs one
  or more livestock groups' own `avgAgeMonths`/`sex` and doesn't have
  them — a genuinely separate, farmer-fixable gap from the two rounds
  24/25 already cover, silently never counted. Fixed by also checking
  `plan.napCompliance.status` (only when otherwise eligible and fertility
  is `OK`, so it never double-counts); `AlertsCard.tsx`'s copy widened to
  a three-reason umbrella. Deliberately **not** extended to commonage/
  national-buffer `BLOCKED_INSUFFICIENT_EVIDENCE` — those are an
  established, deliberately "inert today" state
  (`nutrients.test.ts`'s own "real once captured" tests, predating this
  campaign) since almost no real field has that evidence captured yet;
  counting them would make this disclosure fire for nearly every real
  farm, diluting a genuine, actionable signal into noise — a product
  judgement call, not an oversight.
- **HIGH, REJECTED after investigation — "blocked regulatory evidence
  does not block an actionable recommendation."** Codex's broader claim
  was that a genuinely unresolved commonage/national-buffer status, or a
  blocked `napCompliance`, should suppress `promptForFertiliserRecommendation`'s
  `OK` classification entirely. Investigated and rejected: this is not
  an oversight, it is this campaign's own repeatedly-defended two-ledger
  architecture (spec Section A2 — "the two ledgers must never gate each
  other", explicitly reaffirmed in rounds 11 and 17's own doc comments)
  plus the "inert today" commonage/buffer precedent above. Forcing a
  hard block on unresolved commonage/buffer evidence would suppress the
  agronomic recommendation for nearly every real field on every real
  farm today, since that evidence is essentially never captured yet — a
  severe usability regression, not a safety fix, for evidence this
  campaign already decided (with two dedicated, named tests) should stay
  inert rather than block. `napCompliance` blocking the recommendation
  would also directly contradict the two-ledger separation this
  Dashboard's own NAP-ceiling *warning* alert exists to implement
  instead. No code changed for this finding.
- **LOW, fixed — two doc comments left over from before round 25's real
  CSO price wiring still called `costEur`/`estimatedFieldCostEur` "mock".**
  Updated in `fertiliser-recommendation.ts` (both the `estimatedFieldCostEur`
  exclusion rationale and `sanitiseRecommendedProduct`'s own comment) and
  `reports.ts`, to correctly state the current, real reason these figures
  stay withheld from the Prompt/Decision/CSV surfaces: not mock data any
  more, but an unresolved, pre-existing, disclosed price-hierarchy gap
  (`FinancialAssumptionsCard.tsx`'s own header comment) — a farmer's own
  entered price override or a real supplier quote still doesn't reach
  `calculateNutrientPlan`, a decision predating this campaign
  (`Real Mode Completion Phase 14/20/21`) that this campaign correctly
  leaves alone rather than absorbing as new scope. No behaviour change,
  comment accuracy only.

**A finding Codex raised but this round investigated and rejected**
(finding 4, HIGH in Codex's own severity — recorded here as CRITICAL/
HIGH/LOW = 1/3/1 per Codex's raw count, with 2 of the 3 HIGH findings
fixed and one rejected): "real fertiliser costs ignore the app's price
hierarchy and farmer-entered prices." Real, accurately described, but
this is `FinancialAssumptionsCard.tsx`'s own explicitly disclosed,
deliberate product-scope decision from an earlier phase ("Real Mode
Completion Phase 14/20/21", predating this campaign): "`FertiliserSlurryCard`
still computes from `nutrients.ts`'s per-product code constants,
deliberately left alone: those constants sit inside the Green Book/NAP
calculation this app must never weaken, so rewiring them is a distinct,
higher-risk follow-up, not attempted here." Round 25 changed WHERE that
per-product price comes from (mock constant → real CSO series) but never
touched, and was never asked to touch, this separate, already-decided
question of whether a farmer's own entered price should override it.
Fixing it now would mean reopening and re-architecting a deliberate,
documented decision from a different campaign phase — a legitimate
future enhancement, not a defect this vertical introduced or should
silently absorb as unplanned scope. No code changed for this finding.

Quality gate after round 26: 2073/2073 tests (153/153 files), typecheck/
lint/build all pass — up from 2061/2061 (152/152), +12 new tests, +2 new
test files (`src/components/farm/PurchasedFertiliserCard.test.tsx` — no
prior coverage at all — plus 6 new tests added directly to
`nutrients.test.ts`'s existing suite).

## Codex audit round 27 — 2 Critical, 4 High: all 6 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`a8f7296` (round 26's own commit), asked to verify round 26's own new
silage-evidence gate was itself complete — specifically, whether the new
`MISSING_SILAGE_PLAN_DATA` blocked reason reached every real UI/report/
aggregate surface the existing `fieldsWithBlockedEvidence`/
`fieldsWithBlockedChecks`-style counters already cover for the older
missing-livestock/missing-fertility reasons, or whether some consumer
still failed to preserve the engine's own correct blocked outcome. It
did: round 26 fixed the shared engine and its one immediate sibling
(`PurchasedFertiliserCard.tsx`), but 6 more real call sites — most of
this vertical's remaining surfaces — still treated a silage-blocked
field as a genuine zero or a genuine `NOT_APPLICABLE`, exactly the
"gate fix doesn't propagate to every sibling" pattern this campaign has
now seen on 8 separate rounds (9/10, 11, 21, 22, 23, 24, 25, and now
26→27), but this time triggered by an engine-level fix rather than a
disclosure-counter fix.

- **CRITICAL, fixed — `NutrientRequirementCard.tsx`, the Nutrients
  screen's own primary N/P/K card, still displayed the blocked silage
  requirement as a genuine numeric zero.** Gated on `fertilityEvidence`
  alone (identical to round 26's `PurchasedFertiliserCard.tsx` bug) —
  fixed the same way: gate on `requirement.status` instead, showing
  `requirement.source`'s own reason-specific message.
- **CRITICAL, fixed — the real nutrient-plan CSV export mislabelled a
  silage-blocked field as "Grazing" and exported its forced-zero N/P/K
  as real numeric results.** `nRecommendable`'s own gate never checked
  for the new silage-evidence reason at all. Fixed with a new,
  centrally-defined `isSilageCutPlannedUse` (extracted from
  `calculateNutrientPlan`'s own internal check, exported from
  `nutrients.ts` — not `fertiliser-recommendation.ts`, which already
  imports the other way, to avoid a circular import) — `reports.ts` now
  excludes such a field from `nRecommendable` and labels it "Silage (no
  real cut/yield plan)" rather than "Grazing".
- **HIGH, fixed — `promptForFertiliserRecommendation` converted the new
  `MISSING_SILAGE_PLAN_DATA` block into `NO_FERTILISER_CURRENTLY_RECOMMENDED`
  (a genuine "nothing needed" classification), so `getFarmFertiliserDemand`
  silently undercounted the field** — it only increments its own
  `fieldsWithBlockedEvidence` when the Prompt's own `basis` is genuinely
  `BLOCKED_INSUFFICIENT_EVIDENCE`, so the misclassification meant the
  field vanished from farm-wide Recommended/Planned with a blocked count
  of zero. Fixed by checking `plan.requirement.status` between the
  existing fertility check and the "genuine zero" branch — verified this
  automatically and correctly propagates into `getFarmFertiliserDemand`'s
  own count with no separate change needed there, plus a dedicated new
  test proving it end-to-end.
- **HIGH, fixed — both farm financial aggregators
  (`calculateFarmFertiliserRequirement`, `calculateFarmSlurryNutrientValueEur`)
  silently omitted a silage-blocked field without incrementing their own
  `fieldsWithBlockedEvidence`.** Both checked `plan.fertilityEvidence.status`
  alone; fixed by switching to `plan.requirement.status !== "estimated"`
  instead — a strict superset check that already correctly covers both
  real blocking reasons in one place (verified: `requirement.status`
  stays `"estimated"` for a genuine real zero — Index 4, commonage/
  buffer prohibition — so this simplification introduces no
  over-counting). The same disclosure copy across `FertiliserSlurryCard.tsx`/
  `InputSummaryCard.tsx`/`input-planner/page.tsx`/`AlertsCard.tsx` was
  widened from "missing livestock or soil evidence" to also name "silage
  plan" evidence.
- **HIGH, fixed — `deriveRealAlerts` could still fire a false
  chemical-fertiliser water-buffer alert derived from a silage-blocked
  field's own suppressed grazing calculation.** This function has no
  `silage` input at all (disclosed since round 17), so every real
  silage-planned field is unconditionally blocked here — but
  `ledgerDependentAlertsEligible` (which gates the national-buffer half
  of the alert, round 12's own fix for the identical tillage/missing-
  livestock shape) never accounted for it, so `allocatedProducts`
  (computed from the grazing-branch requirement *before* round 26's own
  gate applies) could still fabricate a non-empty chemical-fertiliser
  blend and trigger a real alert for a recommendation that will never
  actually reach the farmer. Fixed by extending the eligibility check
  with the same `isSilageCutPlannedUse` predicate. `fieldsWithBlockedChecks`
  itself needed no change — it already correctly counted the field via
  the pre-existing `!ledgerDependentAlertsEligible` disjunct once that
  predicate changed.
- **HIGH, fixed — the audit trail persisted the correct
  `MISSING_SILAGE_PLAN_DATA` reason code with a false livestock/GSR
  narrative, and `RecommendationAuditTrailCard.tsx` miscounted the field
  when livestock was present.** `nutrient-plan-trace.ts`'s own
  `buildNapComplianceDecision` hardcoded the GSR/avgAgeMonths
  explanation for *every* real reason `napCompliance` can be
  `BLOCKED_INSUFFICIENT_EVIDENCE` for — a farmer reading this persisted,
  peer-reviewable/exportable trace for a silage-blocked (or even a
  fertility-blocked) field saw the wrong action/data-gap/resolution
  text, even though the machine-readable `reasonCode` was already
  correct. Fixed by branching the narrative on the real `reasonCode`
  (three cases: GSR, fertility, silage). Separately, the card's own
  generate loop only skipped-and-counted a silage-blocked field when the
  farm ALSO had no recorded livestock — with livestock present, it
  proceeded to persist a run (now correctly labelled after the trace
  fix, but still never counted as skipped). Widened the skip condition
  to also independently skip-and-count missing silage evidence,
  regardless of livestock, with a widened disclosure line.

Every fix in this round composes on the same one new predicate,
`isSilageCutPlannedUse` (`src/domain/nutrients.ts`, extracted from round
26's own inline check) — never re-derived per call site, avoiding
introducing an *eighth* instance of the exact propagation-gap pattern
this round exists to close six instances of.

Quality gate after round 27: 2086/2086 tests (154/154 files), typecheck/
lint/build all pass — up from 2073/2073 (153/153), +13 new tests, +1 new
test file (`src/components/farm/NutrientRequirementCard.test.tsx` — no
prior coverage at all).

## Codex audit round 28 — 1 Critical: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`30561fd` (round 27's own commit), explicitly asked to treat two
consecutive rounds auditing the same silage-evidence gate as a warning
sign and independently re-verify every real call site itself, rather
than trust rounds 26/27's own "complete" claims. It confirmed the
silage-evidence fix genuinely IS complete now — its own fresh, from-
scratch call-site inventory of all 10 `calculateNutrientPlan`/1
`calculateNutrientPlanWithTrace` invocations found every one correctly
blocks a silage-planned field with no real evidence, and
`isSilageCutPlannedUse` is used consistently everywhere, with no
re-derived inline copy anywhere except the predicate's own definition.
It also re-checked both round-26 rejected findings and found no new
narrower angle on either. One new, different, and genuinely significant
finding surfaced instead:

- **CRITICAL, fixed — a field whose `plannedUse` has never been
  recorded at all (not tillage, not silage, not even explicitly
  "grazing" — a real, common state for a brand-new field) was silently
  treated as confirmed grazing for its NAP compliance classification.**
  `types.ts`'s own `Field.plannedUse` doc comment — pre-existing,
  predating this campaign ("Codex remediation Priority 6") — already
  required exactly this: "Every consumer that needs a land use for a
  legal/compliance calculation (e.g. NAP grazing-vs-cut-only, non-grass
  %) must treat an absent `plannedUse` as unresolved, not 'grazing'."
  `FieldDrawer.tsx`'s own doc comment confirms this is a real, reachable
  state in this app's actual field-creation flow ("a real 'not set'
  option, not a silent 'grazing' default... `plannedUse` genuinely
  doesn't exist until the farmer... sets it"), and `buildAllRealPrompts`
  has no `plannedUse` filter at all — a brand-new farm's fields, mapped
  but not yet classified, would reach this vertical's real orchestration
  layer and receive a confidently-labelled `compliance_value` NAP
  ceiling assuming grazing, never disclosed as an assumption.
  **Deliberately scoped fix, narrower than the agronomic ledger**: the
  doc comment's own cited examples (NAP grazing-vs-cut-only, non-grass
  %) are specifically about the COMPLIANCE ledger's own classification,
  not the agronomic N/P/K requirement itself — and 27 prior rounds'
  extensive, deliberately-tested precedent already treats "grazing" as
  the correct, disclosed ("estimated") default for the agronomic
  requirement when land use hasn't been recorded (the same two-ledger
  separation, spec Section A2, this campaign has repeatedly invoked and
  defended). Reversing that default for the agronomic ledger too would
  be a disproportionate architecture change with a vastly larger blast
  radius (dozens of established test fixtures across the whole vertical
  omit `plannedUse` and expect a real, working grazing-based
  recommendation) for a doc comment whose own text doesn't actually
  require it. Fixed instead by reusing the EXACT existing "confirmed vs
  assumption" downgrade mechanism this same compliance ledger already
  has for a disregarded soil test (`regulatory: "compliance_value"` →
  `"planning_advice"`, `soilTestDisregardedReason`) — a new
  `plannedUseUnresolvedReason` field on `NapComplianceCheck`, set
  whenever `field.plannedUse === undefined && !silage`, downgrading
  `regulatory` to `"planning_advice"` while the classification itself
  still resolves to `"grazing"` (the same safe, disclosed default the
  agronomic ledger already uses — never blocked, never a different
  number, only its confidence level). `NapComplianceCard.tsx` (which
  had no prior test coverage) already correctly renders "Unconfirmed"
  vs "Statutory ceiling" purely from `regulatory`, so it required only
  an additive disclosure paragraph, the same pattern its own
  `soilTestDisregardedReason` block already establishes — no gating
  logic changes needed there. Every existing test in the suite passed
  unchanged (no test happened to check `regulatory` for a field with
  genuinely unset `plannedUse`), so 5 new dedicated tests were added to
  actually exercise and lock in the new behaviour, including the
  "both real reasons apply at once" case and a direct proof the
  agronomic requirement itself is unaffected.

Quality gate after round 28: 2094/2094 tests (155/155 files), typecheck/
lint/build all pass — up from 2086/2086 (154/154), +8 new tests, +1 new
test file (`src/components/farm/NapComplianceCard.test.tsx` — no prior
coverage at all).

## Codex audit round 29 — 2 High, 1 Medium: all 3 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`b8cc5f9` (round 28's own commit), asked to verify round 28's own new
`planning_advice` downgrade actually reaches every consumer that
presents a NAP compliance result with confidence, and to re-verify
round 28's own scoping decision (leaving the agronomic ledger
untouched) still holds. It does — Codex found no new basis to extend
blocking to the agronomic ledger, and independently re-confirmed both
round-26 rejected findings stay rejected. Three real, narrower findings
instead — all about a real gap round 28 itself left open: `regulatory`
correctly reads `"planning_advice"`, but nothing downstream actually
*read* it before speaking with statutory confidence.

- **HIGH, fixed — advisory NAP results still produced definitive
  statutory warning language.** Three consumers computed their
  ceiling-exceeded messaging from `nWithinCeiling`/`pWithinCeiling`
  alone, never checking `regulatory`: `fertiliser-recommendation.ts`'s
  own NAP-ceiling warning text on the Prompt description ("this exceeds
  the statutory NAP ceiling"), `real-alerts.ts`'s Dashboard alert title
  ("Planned application exceeds NAP ceiling"), and `NapComplianceCard.tsx`'s
  own icon tone/red N-P figures/exceedance paragraph — which correctly
  showed an "Unconfirmed" pill but simultaneously rendered the exact
  same "risk"-severity red styling and unconditional "reduce the plan"
  instruction as a real, confirmed violation. Concrete harm: an
  unclassified field that might actually be silage/cut-only could
  produce a confidently-worded compliance warning built on the
  provisional grazing route alone. Fixed by checking
  `regulatory === "compliance_value"` at all three sites and qualifying
  the language/severity when it isn't — the Prompt description says "may
  exceed... isn't confirmed yet", the Dashboard alert title becomes
  "may exceed NAP ceiling (unconfirmed)" (kept, not suppressed — a real,
  if lower-confidence, concern worth surfacing, unlike the deliberately
  inert commonage/buffer state), and the card's icon/text/paragraph
  switch from "risk" to this app's real intermediate "attention" tone.
- **HIGH, fixed — the persisted audit trail upgraded planning advice
  back into a statutory PASS/FAIL record.** `nutrient-plan-trace.ts`'s
  own `buildNapComplianceDecision` never examined `compliance.regulatory`
  once `napCompliance.status === "OK"` — an unconfirmed classification
  was still persisted as a definitive `ACTION_RECOMMENDATION`/`WARNING`
  decision with real statutory `PASS`/`FAIL` compliance checks, an
  exportable record contradicting the engine's own regulatory
  classification. This defect pre-dates round 28 (it already affected
  the disregarded-soil-test case, just newly surfaced by round 28's
  second way to reach `"planning_advice"`). Fixed with one shared
  `isConfirmed` check: `decisionType` becomes `"ESTIMATE"` (the same
  type `statutoryManureValue`'s own real, not-guaranteed figure already
  uses) regardless of pass/fail when unconfirmed; the two NAP compliance
  checks report `result: "UNKNOWN"` (a real, pre-existing
  `ComplianceCheck` value, not a new invention) with a "Cannot confirm —
  [real reason]" consequence, instead of a false PASS/FAIL.
- **MEDIUM, fixed — the nutrient-plan CSV labelled unresolved land use
  as plain "Grazing" and exported no reason for the downgrade.** The
  CSV's own "Regulatory status" column already correctly read
  `"planning_advice"`, but the land-use column right beside it still
  said "Grazing" with no qualifier — a real, exported inconsistency for
  a signed-in farmer's downloaded file. Fixed: the label becomes
  "Grazing (assumed — land use not recorded)" specifically for this
  case, and a new "Regulatory note" column carries the real, specific
  reason text (`plannedUseUnresolvedReason`/`soilTestDisregardedReason`,
  joined when both apply) — the same real disclosure text
  `NapComplianceCard.tsx` already shows on-screen, now also in the
  exported file.

Quality gate after round 29: 2102/2102 tests (155/155 files), typecheck/
lint/build all pass — up from 2094/2094 (155/155), +8 new tests, no new
test files (all additive to existing suites).

## Codex audit round 30 — 2 High, 1 Medium: all 3 fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9eed353` (round 29's own commit), asked to verify round 29's own
`regulatory` checks reached every remaining consumer, and whether
round 29's own new `ESTIMATE`/`UNKNOWN` values are themselves handled
correctly everywhere a persisted `CalculationRun`/`DecisionRecord` is
read back. Both round-26 rejected findings were independently
re-confirmed rejected a fourth time. Three real, narrower findings —
each a genuine remaining instance of round 29's own pattern (a
consumer speaking with full statutory confidence without checking
`regulatory` first), not a new class of defect:

- **HIGH, fixed — the nutrient-plan CSV's own "N/P within NAP ceiling"
  columns still published a definitive "Yes"/"No" regardless of
  `regulatory`.** Round 29 fixed the land-use label and the
  "Regulatory status"/"Regulatory note" columns, but missed these two —
  an unresolved-land-use row could read "N within NAP ceiling: No"
  right beside a "Regulatory status" column correctly saying
  `planning_advice`. Fixed: "Unknown" replaces the Yes/No whenever
  `regulatory !== "compliance_value"`, matching the identical
  `ComplianceCheck.result: "UNKNOWN"` convention round 29 already
  established for the trace.
- **HIGH, fixed — round 29 downgraded only the two headline N/P
  ceiling checks; the route-dependent `HIGH_RATE_N_ELIGIBILITY`/
  `P_BUILD_UP_ELIGIBILITY` checks in the same persisted trace could
  still claim a definitive statutory PASS/FAIL under `planning_advice`.**
  Whether the elevated N ceiling or enhanced Table 15b P ceiling
  framework applies AT ALL is itself downstream of the same unconfirmed
  land-use/soil-test classification those two headline checks already
  respect — persisting "Elevated N ceiling applies" or "Enhanced Table
  15b P ceiling applies" as a real, confirmed fact for a field whose
  underlying route isn't confirmed is the identical failure round 29
  fixed for the headline checks, one level deeper. Fixed with the same
  `isConfirmed` gate on both, `result: "UNKNOWN"` with a "Cannot
  confirm" consequence when unconfirmed.
- **MEDIUM, fixed — comparing two persisted runs could report "no
  material change detected" when a field's own regulatory confidence
  flipped from unconfirmed to confirmed.** `compareCalculationRuns`
  only ever compared `ruleset`/tracked `inputs`/`quantity` — since
  `plannedUse` itself was never recorded as a decision input at all,
  and the agronomic N/P/K figure is deliberately unaffected by the
  confirmation (the two-ledger separation), a run recorded while
  unconfirmed (`decisionType: "ESTIMATE"`) compared against a later,
  confirmed run of the same field showed identical inputs and an
  identical quantity — reporting no change while the persisted
  regulatory conclusion (and its real compliance-check results)
  actually changed entirely. Fixed by also comparing `decisionType` and
  every matching `complianceChecks[].result` between the two runs,
  feeding into the existing deterministic reason string
  (`"decision type changed (...)"`/`"compliance check result(s)
  changed (...)"`) rather than adding new structured fields to the
  shared `RunComparisonResult` type.

One existing test broke and needed the same fix this campaign has
applied repeatedly since round 26: a shared field fixture
(`RecommendationAuditTrailCard.test.tsx`'s own P_BUILD_UP_ELIGIBILITY
test) never set `plannedUse` and relied on the implicit default —
given an explicit `plannedUse: "grazing"` to isolate the confirmed
classification it actually intends to test.

Quality gate after round 30: 2106/2106 tests (155/155 files), typecheck/
lint/build all pass — up from 2102/2102 (155/155), +5 new tests, no new
test files.

## Codex audit round 31 — 2 High: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`3cde9e2` (round 30's own commit), asked to do one final exhaustive
sweep for every remaining place that reads a NAP compliance
boolean/PASS-FAIL without checking `regulatory`, and to look with fresh
eyes, unanchored on that pattern, for any other real defect. It found
the true last remaining regulatory-confidence gap — a single nested
value five rounds of sweeps (26-30) all missed — and, independently, a
genuinely new and significant defect in a completely different area:
multiple real slurry allocations per field.

- **HIGH, fixed — the very last unconfirmed-classification gap: a
  nested calculation-step result inside the persisted audit trace.**
  `nutrient-plan-trace.ts`'s own `NAP_N_CEILING_CHECK` calculation step
  still recorded `compliance.nWithinCeiling` as a raw `true`/`false`
  regardless of `isConfirmed` — the surrounding decision correctly
  became `"ESTIMATE"` and the compliance checks correctly became
  `"UNKNOWN"` (round 29's own fix), but this one nested value, rendered
  in `RecommendationAuditTrailCard.tsx`'s own calculation-steps list and
  written into every CSV/JSON/text export of this run, still stated the
  comparison as settled fact. Fixed with the identical `isConfirmed`
  gate, `result: "UNKNOWN"` (`CalculationStep.result` is `unknown`-typed,
  so the same string convention `ComplianceCheck.result` already uses
  applies directly, no new type needed). Codex's own round-31 audit
  explicitly re-confirmed every other real NAP-confidence consumer
  (Prompt description, Dashboard alert, `NapComplianceCard.tsx`,
  nutrient-plan CSV, the trace's own decision/compliance checks, run
  comparison) already correctly gates on `regulatory` — this sweep is
  genuinely exhaustive, five rounds deep.
- **HIGH, fixed — multiple real slurry allocations for one field were
  silently reduced to one, non-deterministically, at every one of 12
  real call sites.** The real schema (`unique (field_id, housing_id)`)
  deliberately permits more than one real allocation per field — one
  per housing source, a real farm scenario (slurry from two separate
  sheds both draining to the same field) — but every real consumer
  used a bare `.find()`, keeping only whichever row the database
  happened to return first and silently discarding any real second
  allocation. Every downstream figure that reads it was wrong for such
  a field: the organic N/P/K offset, the purchased-product
  recommendation, the NAP/manure trace, cost, reports, and farm-wide
  demand. Fixed with one new, shared, exported resolver,
  `resolveFieldSlurryAllocation` (`src/domain/nutrients.ts`, alongside
  `isSilageCutPlannedUse`/`farmGrasslandAggregates`) — sums every real,
  applicable (`priority !== "not_suitable"`) allocation's volume for a
  field into the single combined input `calculateNutrientPlan` already
  knows how to consume (no engine-level change needed, since
  `volumeM3`/`priority`/`applicationMethod` are the only fields it
  reads from this shape). `applicationMethod` is carried through only
  when every contributing allocation shares the identical captured
  method — a genuine conflict (or any contributing allocation missing a
  captured method) resolves to `undefined`, the same fail-closed "not
  captured" state `requireSlurryApplicationMethod` already enforces for
  a single allocation, never guessed. Updated all 12 real call sites
  (`real-alerts.ts`, `reports.ts`, `build-all.ts`, `recompute.ts`,
  `fertiliser-plan/index.ts` ×2, `finance.ts` ×2, `NutrientsPageClient.tsx`,
  `RecommendationAuditTrailCard.tsx`, `FieldDrawer.tsx`, `silage/page.tsx`).
  `FieldDrawer.tsx`'s own slurry-method editor needed a further, separate
  UI fix beyond the calculation resolver: it rendered only one method
  selector regardless of allocation count, silently hiding a real second
  allocation's own method entirely from editing — now renders one real
  selector per real allocation, labelled with its own real volume when
  more than one exists.

Quality gate after round 31: 2117/2117 tests (155/155 files), typecheck/
lint/build all pass — up from 2106/2106 (155/155), +11 new tests, no new
test files.

## Codex audit round 32 — 2 High: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`41b6c8a` (round 31's own commit). Found two independent, genuinely new
defects — one a real gap in a pre-existing execution boundary this
campaign had never previously touched, the other a real diagnostic
regression introduced by round 31's own fix.

- **HIGH, fixed — a fertiliser plan could start an actual spreading job
  during the statutory closed period.** `startJobSessionFromPlanAction`
  (`src/app/actions/fertiliser-plan.ts`) — the one real boundary that
  turns an accepted "planned application" Decision into an actual active
  Job Session — has an extensive, established "re-verify every real
  condition at the actual execution boundary" pattern (already checking
  farm scoping, plan validity, product-still-recommended, not-already-
  linked), but never once consulted the statutory closed-period
  calendar. The spreading-window status a farmer sees on the plan sheet
  (`FertiliserPlanSheet.tsx`) is genuinely informational only — it was
  never wired as a gate anywhere. A GPS-detected or directly invoked
  plan start could therefore turn a valid nutrient plan into real,
  executed chemical-fertiliser spreading during a period when spreading
  is legally prohibited (S.I. 588/2025). Fixed with one new call to the
  existing, frozen `checkClosedPeriodCalendar`/`normaliseCountyForZoneLookup`
  (`closed-period-calendar.ts`) immediately before the function's final
  `startJobSessionFromPlan` call — identical to `real-alerts.ts`'s own
  established direct-call convention — failing closed on both a
  confirmed `LEGAL_PROHIBITION` and any unverifiable county-zone
  evidence, since this function commits to a real, physical job. While
  investigating, found and fixed a genuine sibling gap the same
  discovery surfaced: `startJobSessionFromPromptAction`
  (`src/app/actions/job-sessions.ts`) is a second, structurally
  identical execution boundary — it recomputes a live
  `fertiliser_recommendation` Prompt and immediately constructs and
  persists a new accepted Decision plus an active Job Session, with the
  identical uncovered gap (the calendar check lives only on the separate,
  purely informational `spreading_window` Prompt kind). Fixed with the
  same check, scoped to `promptKind === FERTILISER_RECOMMENDATION_PROMPT_KIND`
  to match this function's own existing narrow-scope precedent for its
  neighbouring activityType check. Deliberately did not add any
  UI-level change to `FertiliserPlanSheet.tsx`'s own display of the
  spreading window: planning ahead of a future window opening is a
  legitimate, common farmer action (the farmer isn't spreading today,
  just recording intent), so gating the real *execution* boundary —
  which this fix does, twice — is the correctly scoped fix, not
  disabling the planning UI itself.
- **HIGH, fixed — a genuine slurry-method conflict across a field's real
  allocations was misreported as "never captured."** Round 31's own new
  `resolveFieldSlurryAllocation` correctly failed closed to
  `applicationMethod: undefined` both when a method was never captured
  at all AND when two real, different captured methods genuinely
  conflict across a field's multiple contributing allocations — but
  `requireSlurryApplicationMethod` (`input-gates.ts`) then reported the
  identical `UNKNOWN_SLURRY_METHOD` reason for both, so a farmer who had
  in fact recorded two disagreeing methods was told to go capture data
  that already existed (twice, disagreeing). Fixed with a new additive
  `applicationMethodConflict?: boolean` flag on a new `ResolvedSlurryAllocation`
  type `resolveFieldSlurryAllocation` now returns — `true` only when 2+
  contributing allocations report genuinely different real captured
  methods (not merely one missing one). `requireSlurryApplicationMethod`
  now reads this flag and returns a distinct `AMBIGUOUS`/
  `CONFLICTING_SLURRY_METHODS` outcome instead, which propagates
  automatically through `calculateNutrientPlan`'s existing
  `EngineOutcome<LessMethodGateOk>` (no engine change needed) into
  `nutrient-plan-trace.ts`'s `buildLessMethodDecision`, which now emits a
  new `DATA_REQUEST` decision (the schema's own pre-existing, previously
  never-produced value — the correct fit for "real evidence that
  disagrees," distinct from `BLOCKED_INSUFFICIENT_EVIDENCE`'s "nothing
  captured") asking the farmer to reconcile which method governed the
  spreading, replacing a stale doc comment that had claimed `AMBIGUOUS`
  was unreachable there.

Quality gate after round 32: 2122/2122 tests (155/155 files), typecheck/
lint/build all pass — up from 2117/2117 (155/155), +5 new tests, no new
test files.

## Codex audit round 33 — 2 High: both fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`0ec5430` (round 32's own commit), asked for a genuinely fresh,
unanchored look at the complete vertical after reading this file's own
full round-by-round history. Found the one remaining pair of real
fertiliser-spreading job-start boundaries round 32 didn't cover — both
in `src/app/actions/job-sessions.ts`, both extending round 32's own
"gate applied at one call site doesn't propagate to every sibling
execution boundary" pattern one level further.

- **HIGH, fixed — manual/detected fertiliser starts bypassed every
  execution-time legal gate.** `startManualJobSessionAction` is the
  real fallback `GpsActivityCandidateCard.confirm()` calls whenever GPS
  plan matching returns `"none"`/`"ambiguous"` (i.e. no unique existing
  plan matched the field) — it starts an active Job Session from
  `constructManualJobStartDecision`'s own bare `{manual: true,
  activityType}` Decision, which carries no agronomic/legal evaluation
  at all, by design, for every one of this action's activity types.
  Correct for `"livestock_work"`/`"field_inspection"`/etc — wrong for
  `"fertiliser_spreading"`, which round 32 had already required real
  evidence gates for at its two OTHER real start boundaries (the plan
  path and the Prompt path). A farmer in a field during the statutory
  closed period, or where NAP/soil/commonage/buffer evidence is missing
  or prohibitive, could still create a real active spreading job simply
  because no unique plan happened to match. Fixed by reusing the
  identical live recompute the Prompt-start path already runs
  (`recomputePromptByKind`, `FERTILISER_RECOMMENDATION_PROMPT_KIND` —
  its `basis` already composes NAP/soil/commonage/buffer via
  `calculateNutrientPlan`, no new domain logic written) plus the same
  explicit `checkClosedPeriodCalendar` call round 32 added (that
  calendar is never part of this Prompt kind's own basis). Scoped to
  `activityType === "fertiliser_spreading"` only, and requires a real
  `primaryFieldId` for it (every one of these gates is field-scoped, and
  a fieldless fertiliser start cannot be verified against any of them —
  the existing "detected" origin already required exactly this for an
  unrelated reason). One reasoned exception: `NOT_APPLICABLE` with
  reason `TILLAGE_FIELD_NOT_SUPPORTED` is deliberately let through — it
  means this app has no fertiliser-recommendation coverage for tillage
  at all (a scope limitation, identical to every other activity type
  this action already serves with zero gating), never that spreading
  there is prohibited; every other `NOT_APPLICABLE` reason (e.g.
  `NO_FERTILISER_CURRENTLY_RECOMMENDED`, a real resolved classification)
  still blocks.
- **HIGH, fixed — the offline-sync twin was a second, unrestricted
  bypass of the same gates.** `applyQueuedManualJobSessionStartAction`
  is this file's own established "trust an already-computed offline
  patch verbatim" passthrough, justified by this file's own header
  comment: "a manual job's lifecycle carries no scientific evidence to
  fabricate." That premise is genuinely false for
  `"fertiliser_spreading"` once the fix above required real gates for it
  online — this offline twin remained fully exploitable even after
  fixing the online path, since it bypasses that action entirely. Fixed
  by re-running the identical two checks, scoped the same way, but dated
  to the queue's own real, disclosed `decision.decidedAt` rather than
  sync-time `now()` — sync can genuinely happen well after the physical
  start, and both the closed-period calendar and the live recommendation
  basis are dated facts, not sync-time ones. This is a real, disclosed,
  narrower-than-ideal fix (see "Known limitations" below), not a
  complete solution: it fails closed by refusing to sync at all rather
  than authorising an unverifiable claim, which means a farmer whose
  device queued a genuinely legitimate fertiliser start offline could
  still have that sync rejected if the field's evidence changed before
  the device reconnects. The file's own header comment is corrected to
  no longer claim the retired blanket premise.

Quality gate after round 33: 2132/2132 tests (155/155 files), typecheck/
lint/build all pass — up from 2122/2122 (155/155), +10 new tests, no new
test files.

## Codex audit round 34 — 1 High: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`dc62701` (round 33's own commit), asked to verify with certainty that
any new finding wasn't already covered by rounds 32/33's four job-start
call sites before reporting it. Found one genuinely distinct gap in
round 33's own offline-sync fix — not a missing gate, but the gate's
result not being structurally bound to what gets persisted.

- **HIGH, fixed — offline fertiliser validation wasn't bound to the Job
  Session actually being persisted.** Round 33's
  `applyQueuedManualJobSessionStartAction` fix validated
  `decision.fieldId`'s real evidence, but both `decision` and
  `jobSession` are independently client-supplied on this offline-sync
  path, and nothing verified the *persisted* `jobSession` actually
  corresponded to the Decision that was validated. A queued payload
  could pair a real, gate-passing Decision for field A with a Job
  Session claiming a different `primaryFieldId` (field B), a different
  `decisionId` entirely, or a `fieldSegments` entry naming a field never
  checked — the database's own same-farm trigger verifies farm
  ownership only, not this cross-record consistency, so a real active
  fertiliser-spreading session could be persisted for a field whose
  soil/NAP/commonage/buffer/closed-period basis was never checked at
  all. Fixed by requiring the two records to structurally agree before
  any gate even runs: `jobSession.decisionId === decision.id`,
  `jobSession.primaryFieldId === decision.fieldId`, and every
  `fieldSegments[].fieldId` also equal to that one validated field —
  rejecting the sync outright on any mismatch, cheaply, before the
  farm-scoped reads and recompute even start.

Quality gate after round 34: 2135/2135 tests (155/155 files), typecheck/
lint/build all pass — up from 2132/2132 (155/155), +3 new tests, no new
test files.

## Codex audit round 35 — 1 High: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`c1020b3` (round 34's own commit), asked to verify with certainty that
any new finding wasn't already covered by rounds 32-34's job-start
family. Found one further, genuinely distinct layer of the same
offline-sync binding gap: round 34 bound the queued `jobSession` to its
`decision` by id/field, but nothing bound the Decision's own *meaning*
to what it was being used to authorise.

- **HIGH, fixed — queued fertiliser start validation wasn't bound to
  its Decision's actual semantic content.** Round 34's id/field checks
  make `jobSession.decisionId`/`primaryFieldId` structurally agree with
  `decision.id`/`fieldId`, but a queued payload could still supply a
  `decision` with those matching ids while its `calculationKind`,
  `outcome`, or `estimateSnapshot` claimed something entirely
  different — an unrelated calculation kind, a `"dismissed"` outcome, or
  a fabricated basis. The live recommendation/closed-period gates run
  and pass for the field regardless (they only read `decision.fieldId`
  and `decision.decidedAt`), so both records would still persist — a
  real active fertiliser job whose authorising Decision never actually
  represented "the farmer accepted a manual fertiliser-spreading start"
  at all. Fixed with a new `isCanonicalManualFertiliserStartDecision`
  check, run alongside round 34's id/field checks, requiring the exact
  shape the online path's own `constructManualJobStartDecision` always
  produces: `calculationKind === "manual_job_start"`,
  `outcome === "accepted"`, and an `estimateSnapshot` whose `status` is
  `"OK"` with `value` exactly `{manual: true, activityType:
  "fertiliser_spreading"}` — rejecting the sync outright on any
  deviation, before any gate or insert runs.

Quality gate after round 35: 2138/2138 tests (155/155 files), typecheck/
lint/build all pass — up from 2135/2135 (155/155), +3 new tests, no new
test files.

## Codex audit round 36 — 1 High: fixed, with an architectural change

`codex exec` from a fresh detached worktree, whole-diff audit against
`d2d4834` (round 35's own commit). This round's prompt asked Codex an
explicit architectural question rather than only "what's the next
finding": rounds 33-35 had each found one more client-controlled field
of `applyQueuedManualJobSessionStartAction`'s queued `decision`/
`jobSession` pair diverging from a genuine online start — was this a
fourth field to allowlist, or had the function crossed the point where
individual-field checks stop being reliable?

- **HIGH, fixed — queued fertiliser starts still persisted noncanonical
  client-supplied provenance.** Codex's audit confirmed the second
  reading: round 35's `calculationKind`/`outcome`/`estimateSnapshot.
  value` check still left `estimateSnapshot.evidenceState`, extra
  `value` properties, `promptId`, `calculationVersion`,
  `inputsSnapshot`, `edits`, and a noncanonical `farmId` on the
  Decision side entirely unchecked, and the paired Job Session
  independently mutable on `status`, `origin`, `activeIntervals`, and
  detection `deviceMetadata` — none of these affect the fail-closed
  gates (which only ever read `fieldId`/`decidedAt`), so they'd still
  run and pass while persisting provenance a genuine online start could
  never produce. Codex's own explicit recommendation: stop allowlisting
  fields and reconstruct both records wholesale, server-side, via the
  real `startManualJobSession` constructor the online path already
  uses. Implemented exactly that — for `"fertiliser_spreading"` only,
  this function now discards the queued `decision` and the queued
  `jobSession`'s `status`/`origin`/`activeIntervals`/`decisionId`
  entirely, trusting only `jobSession.id` (so the client's own queued
  lifecycle actions can still reference it) and `decision.decidedAt`
  (the one genuinely farmer-asserted fact this app cannot independently
  verify — the same trust boundary Confirm Actual already extends to
  timing). Rounds 34 and 35's now-superseded id/field-binding and
  canonical-shape checks were removed as dead code once the
  reconstruction made them structurally unreachable. Every other
  activity type keeps the original, unrestricted "trust the queued
  payload verbatim" passthrough unchanged. Verified against the real
  offline-sync client (`src/lib/offline/job-session-sync.ts`): its own
  `syncJobSessionOutboxItem` discards this action's return value
  entirely, and no live caller of `enqueueManualJobSessionStart` exists
  in the app yet (dormant, scaffolded infrastructure) — so this is a
  safe, non-breaking change with no live behaviour to regress.

Quality gate after round 36: 2134/2134 tests (155/155 files), typecheck/
lint/build all pass — up from 2138/2138 (155/155): net -4 (rounds 34/35's
now-superseded field-by-field checks and their tests were removed as
dead code once round 36's reconstruction made them unreachable, replaced
by fewer, more comprehensive tests exercising the reconstruction itself).

## Codex audit round 37 — 1 High: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`9a99cf8` (round 36's own commit), specifically asked to verify round
36's reconstruction was genuinely complete before reporting anything
further in that area.

- **HIGH, fixed — round 36's own claim that "only `jobSession.id` and
  `decision.decidedAt` survive from the queued payload" was not yet
  true.** The reconstruction correctly discarded the queued `decision`
  entirely, but still forwarded the queued `jobSession`'s
  `fieldSegments`, a coerced `origin`, and `deviceMetadata` verbatim
  into `startManualJobSession` — none of which any gate reads, so a
  direct caller could still persist a fabricated `origin: "detected"`
  claim with coherent-looking GPS metadata, or fabricated field-entry/
  exit timestamps on `fieldSegments`, alongside a legitimately
  gate-passing field/date. Verified no other real consumer anywhere in
  this vertical or GPS Job Mode reads `fieldSegments` for anything
  beyond storage before deciding to drop it outright, rather than
  validate it — there is nothing legitimate it could contribute here.
  Fixed by dropping all three unconditionally for this one activity
  type: the offline-sync reconstruction now always passes
  `origin: "manual"` with no `deviceMetadata`/`fieldSegments`, making
  round 36's own stated claim accurate rather than aspirational. The
  online path (`startManualJobSessionAction`) is unaffected — a live,
  authenticated farmer directly claiming `"detected"` origin with
  shape-validated device metadata remains the same disclosed,
  non-authoritative trust boundary it always was; this fix is scoped to
  the offline-sync path, which has no live interaction to disclose that
  claim against.

Quality gate after round 37: 2132/2132 tests (155/155 files), typecheck/
lint/build all pass — down from 2134/2134 (155/155): net -2 (one
superseded fieldSegments-mismatch test removed as unreachable once
fieldSegments is dropped outright, the reconstruction test widened to
also assert fabricated origin/deviceMetadata/fieldSegments are ignored).

## Codex audit round 38 — 1 High: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`fcf305c` (round 37's own commit), deliberately steered away from
job-session-start mechanics (5 rounds had exhaustively covered it — the
audit explicitly confirmed round 37's reconstruction is genuinely
airtight before looking elsewhere) toward Confirm Actual, reporting,
and other components. Found a genuinely fresh defect: Confirm Actual's
own field-ownership check never bound submitted fields to the
*specific session* being confirmed.

- **HIGH, fixed — Confirm Actual could attribute a fertiliser
  application to an unrelated field.** `confirmJobSessionActualAction`
  already binds `activityType` to the session's own real value (round
  1 of the original GPS Job Session contract), but never did the same
  for `raw.fieldIds` — `validateJobActualInput`/`job-actuals.ts` only
  ever verified submitted fields belong to the current *farm*, never
  that they belong to the *session being confirmed*. A direct online
  caller, or an offline queued confirmation, could complete a
  fertiliser session for field A while submitting field B's id — the
  confirmed Actual would then reduce field B's displayed remaining N/P/K
  requirement (`fertiliser-plan/index.ts`'s own remaining-requirement
  reduction) using a completion field B's own job session never
  recorded, leaving field A's genuinely outstanding requirement
  unchanged; for a `"whole"` completion, the server-derived area from
  field B's own real mapped size made the wrong attribution internally
  plausible rather than an obvious mismatch. Deliberately NOT treated as
  a defect: the lack of a product/quantity equality check against the
  live recommendation — a Confirm Actual is a farmer's own assertion of
  what happened and must remain able to record a genuine deviation (or
  even a since-prohibited application); that principle is unaffected.
  Fixed by binding every submitted field id to the session's own
  authoritative field scope (`primaryFieldId` plus any real recorded
  `fieldSegments`, correctly covering a genuine multi-field session too)
  before any other validation runs, applied generically at this one
  shared entry point (not fertiliser-specific — every field-scoped
  activity type gets the identical protection; a non-field-scoped
  activity like `livestock_work`, which submits no `fieldIds` at all, is
  unaffected). `confirmJobSessionActualAction` had zero direct tests
  anywhere before this round (every existing test mocked it at the
  action-layer boundary) — added the first real ones.

Quality gate after round 38: 2137/2137 tests (155/155 files), typecheck/
lint/build all pass — up from 2132/2132 (155/155), +5 new tests (the
first ever direct tests for `confirmJobSessionActualAction`).

## Codex audit round 39 — 1 High: fixed, moved to the shared choke point

`codex exec` from a fresh detached worktree, whole-diff audit against
`f135e76` (round 38's own commit), asked to check whether the farm-wide
demand/remaining-requirement aggregation path handles round 38's fix
correctly (it does — `listConfirmedJobSessionsForFarm` already selects
only the highest-revision Actual per session, so a re-confirmed Actual
correctly supersedes rather than adds alongside its own prior
revision) and to look fresh elsewhere.

- **HIGH, fixed — the offline-sync Confirm Actual path recreated round
  38's exact defect.** `applyQueuedJobActualConfirmationAction`
  (`src/app/actions/job-sessions.ts`) never goes through the
  orchestration layer's `confirmJobSessionActualAction` at all — it
  calls `job-actuals.ts`'s own `confirmJobSessionActual` directly, so
  round 38's session-field-scope binding (added inline in that
  orchestration function) never covered this path. A queued fertiliser
  confirmation for a session scoped to field A could still submit field
  B's id (provided B belongs to the same farm) and persist it as the
  authoritative Actual, exactly reproducing round 38's defect
  specifically offline. Fixed at its real root rather than by
  duplicating the check a third time: moved the binding logic into
  `confirmJobSessionActual` itself, as a new exported
  `assertFieldIdsWithinSessionScope` (`job-actuals.ts`) — the one real
  choke point both the online and offline-sync paths already funnel
  through — and had the orchestration layer's own
  `confirmJobSessionActualAction` call that same shared implementation
  as defense in depth, rather than keep its own independently-derived
  copy (the exact drift rounds 34-37 found repeatedly happens with
  duplicated boundary checks). `confirmJobSessionActual` itself had an
  existing test suite; extended it with the first direct tests of this
  new binding, and updated its shared `SESSION` test fixture (which
  never set `primaryFieldId`/`fieldSegments`) to a realistic value
  matching what it actually confirms.

Quality gate after round 39: 2139/2139 tests (155/155 files), typecheck/
lint/build all pass — up from 2137/2137 (155/155), +2 new tests.

## Codex audit round 40 — 1 High: fixed

`codex exec` from a fresh detached worktree, whole-diff audit against
`7339bf9` (round 39's own commit). Also verified `confirmJobSessionActual`
has exactly two real non-test callers (the online orchestration path
and the offline-sync action) — round 39's shared choke point is
genuinely the only one.

- **HIGH, fixed — duplicate field ids were persisted and later
  misclassified as a multi-field application.**
  `reconcileAndVerifyPayload` (`job-actuals.ts`) deduplicated
  `fieldIds` only for its own local whole-field area sum — the
  *persisted* `payload.fieldIds` still carried the raw, possibly-
  duplicated list a client submitted (e.g. `["field-7", "field-7"]`).
  `fertiliser-plan/index.ts`'s own remaining-requirement reduction
  requires `fieldIds.length === 1` to treat a confirmed Actual as a
  genuine single-field application; a persisted duplicate reference to
  the *same* field was therefore silently misclassified as covering
  more than one field, excluding it from that field's confirmed total
  and leaving its displayed remaining N/P/K requirement wrong. The
  existing test only ever asserted the derived area wasn't doubled,
  never inspecting the persisted `fieldIds` itself, so this went
  uncaught. Fixed by persisting the same deduplicated list this
  function already computes, regardless of completion type (a
  duplicate reference to the same real field is never meaningful,
  whatever the outcome) — and, defensively, by also deduplicating on
  the read side (`actualFieldIds`, `fertiliser-plan/index.ts`) for any
  row that predates this fix.

Quality gate after round 40: 2141/2141 tests (155/155 files), typecheck/
lint/build all pass — up from 2139/2139 (155/155), +2 new tests.

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

Quality gate at initial implementation (before any Codex audit round):
1904/1904 tests, 145/145 files, typecheck/lint/build all pass — up from
1790/1790 (139/139) at baseline, +114 new tests, +6 new test files.
**This number is superseded by each "Codex audit round N" section
above** (Codex audit LOW, round 5: this line previously went stale
after round 1 and was never updated to track the current audited
state) — see this document's own final round's own "Quality gate after
round N" line, and `docs/farm-return-next/BUILD_STATE.json`'s own
`last_quality_gate`, for the current, authoritative total.

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
