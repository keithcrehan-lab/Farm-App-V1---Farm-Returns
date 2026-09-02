# GPS Job Session + Confirm Actual contract

Frozen architecture decision for the GPS Job Session lifecycle and its
resulting confirmed Actual record — the missing middle of the Prompt →
Job → GPS → Actual → Record → Ask AI journey named in
`FARM_RETURN_NEXT_SPEC_v1_1.md` Appendix A as this programme's own
"Immediate implementation objective." This document is the source of
truth for that middle segment; `FARM_RETURN_NEXT_SPEC_v1_1.md` remains
the top-level product spec and takes precedence on anything this
document doesn't cover.

Built 2026-09-02, resuming from `docs/overnight/OVERNIGHT_BUILD_LOG.md`'s
own "recommended next phase" after the Phase 1 visual/nav/Prompt→Decide
loop was completed and independently audited clean (rounds 1–5). See
`docs/farm-return-next/IMPLEMENTATION_MATRIX.md` for this phase's own
entry and `BLOCKERS.md` for the exact remaining gaps this document names
below.

## 1. Observed / Estimated / Actual

Three sharply distinct tiers, never conflated:

- **Observed** — what the device genuinely detected: GPS positions, a
  start/end device timestamp, a raw telemetry fix. No inference, no
  scientific claim.
- **Estimated** — what Farm Return infers or plans: a Prompt's own
  `basis` (an `EngineOutcome`, `src/domain/evidence.ts`), a planned
  quantity, an expected area. Always traceable to the real domain
  calculation that produced it.
- **Actual** — what the farmer has explicitly confirmed happened. Never
  derived automatically from Observed or Estimated evidence.

**The critical rule, enforced in code, not just prose**: Observed or
Estimated values must never silently become Actual. Two independent
mechanisms enforce this:

1. `src/domain/job-session-evidence.ts`'s `JobEvidenceValue<T>` — a
   small, purpose-built type (deliberately distinct from
   `src/domain/types.ts`'s `DataStatus`/`TrackedValue<T>`, which answers
   a different question about farm-reference-data confidence — see that
   module's own header comment for the full reasoning). `actualValue()`
   has no code path that accepts an `"observed"`- or `"estimated"`-tier
   value and returns an `"actual"`-tier one; promoting a tier means
   reading `.value` off the source and passing it through explicitly, a
   visible step at every real call site. `reviseActualValue()` is the
   one sanctioned way to "edit" an already-confirmed value, chaining the
   prior one into `.previous` rather than discarding it (§9 below).
2. `src/domain/job-session-lifecycle.ts`'s `finishJobSession` — see §2.

## 2. Job Session lifecycle

`src/domain/job-session-lifecycle.ts` is the single, pure, dependency-free
state machine. `JobSessionStatus`:

```
ready → active ⇄ paused → completed_estimated → confirmed_actual
  ↓        ↓        ↓              ↓
                cancelled
```

Legal transitions (`LEGAL_TRANSITIONS`, mirrored independently by
`job_sessions_check_valid_transition`, the database trigger in
`supabase/migrations/20260902000000_job_sessions.sql` — defense in
depth, both must change together if this table ever does):

| From | To |
|---|---|
| `ready` | `active`, `cancelled` |
| `active` | `paused`, `completed_estimated`, `cancelled` |
| `paused` | `active`, `completed_estimated`, `cancelled` |
| `completed_estimated` | `confirmed_actual`, `cancelled` |
| `confirmed_actual` | *(terminal)* |
| `cancelled` | *(terminal)* |

**The one rule this whole module exists to get right**: `finishJobSession`
transitions only to `completed_estimated`, never to `confirmed_actual`.
No function in this module (and none should ever be added) takes an
active/paused session straight to a confirmed Actual — that transition
exists only via `src/lib/farm-data/job-actuals.ts`'s
`confirmJobSessionActual`, which requires an explicit farmer-confirmed
Actual payload as its input. Tested directly:
`src/domain/job-session-lifecycle.test.ts`'s "Finish Job produces
completed_estimated, never confirmed_actual" tests.

**`cancelled` vs. `confirmed_actual` with `completionType: "did_not_happen"`**
are two different, both-honest end states, not the same thing:
`cancelled` means the farmer abandoned the session *before* reaching
Confirm Actual (wrong field selected, changed their mind); a confirmed
Actual with `completionType: "did_not_happen"` means the farmer *did*
reach Confirm Actual and is explicitly recording that outcome as the
confirmed fact (e.g. weather stopped play after Finish Job was pressed).
Which one applies depends on how far the farmer actually got.

Elapsed time (`computeElapsedSeconds`) is always derived from the
session's own `activeIntervals` list (`{startedAt, endedAt?}`), never a
separately-maintained running total — one source of truth. A paused
session's elapsed time is exactly its closed intervals' sum; an active
session adds live time for its currently-open interval.

## 3. Universal Job Session + activity-specific Actual

One table, `job_sessions`
(`supabase/migrations/20260902000000_job_sessions.sql`), for every
activity — not one table per activity type. Fields preserved: `farmId`,
`decisionId` (the authorising Decision — every session, including a
manual start, is authorised the same way `jobs` already requires),
`activityType`, `origin` (`prompt` | `plan` | `manual` | `detected`),
`status`, `primaryFieldId` + `fieldSegments` (§8 multi-field),
`activeIntervals`, `interruptionGaps` (§7), `deviceMetadata`,
`cancelledReason`, `createdAt`/`updatedAt`.

**Deliberately not duplicated on this table**: a separate "Estimated
values" column. A session's Estimate already lives on its authorising
`decisions` row (`estimate_snapshot`/`inputs_snapshot`/
`calculation_version`) — read via `decisionId`, never copied a second
time (`DOMAIN_CONTRACTS.md`'s reuse boundary applied to this
checkpoint's own new schema).

Activity-specific data lives entirely in `job_actuals.payload`
(`src/domain/job-actual.ts`'s `JobActualPayload` union) — adding a new
activity type never needs a new lifecycle column, only a new payload
shape + validator. Validated against five representative activities
(§6 of the original brief), each a real, tested validator in
`job-actual.ts`:

- **Fertiliser spreading** — `fieldIds`, `product`, `quantity`+`unit`,
  `areaHa` (whole → real mapped area; partial → farmer-confirmed only,
  never manufactured).
- **Slurry spreading** — `fieldIds`, `slurryType` (only when known),
  `quantity`+`unit` (never inferred from GPS), `applicationMethod`
  (reused from `less-method-gate.ts`'s `SlurryApplicationMethod`, not
  redefined).
- **Silage** — `fieldIds`, `harvestedAreaHa`, `bales`/`tonnes` — both
  absent unless genuinely supplied; no yield is ever invented to
  populate the screen.
- **Field inspection** — lightweight: `fieldIds`, `observedIssueCategory`,
  `observationNote`, `evidenceRef`.
- **Livestock work** — the one activity with no field requirement at
  all: `livestockGroupId`/`animalId` (at least one), `action`, `outcome`.

`validateJobActualInput` is the one dispatcher every real caller uses.

## 4. Farm Awareness vs. Active Job Tracking

`src/lib/location/location-tracking-provider.ts` freezes three operating
modes:

- **Location off** — no permission, or genuinely unavailable. Every
  workflow degrades to manual entry; nothing pretends location context
  exists.
- **Farm Awareness** — low-power, infrequent, lower-accuracy updates
  (`startFarmAwareness`). Contextual only — not intended to reconstruct a
  detailed movement history.
- **Active Job Tracking** — the highest accuracy the current adapter can
  genuinely provide, only once a Job Session requiring GPS is active
  (`startActiveTracking`).

## 5. The web capability boundary — honest, not fictional

`src/lib/location/web-location-tracking-provider.ts` is the one real
adapter this phase ships, built on `navigator.geolocation`. It reports
**`backgroundTrackingSupported: false`, always** — no cross-platform web
API guarantees tracking continues once a tab is backgrounded or the
screen locks (iOS Safari in particular suspends a backgrounded tab's JS).
This is not a temporary gap papered over; it is the honest, permanent
answer for a browser/PWA adapter.

**Native capability requirement for a future adapter**: a native
iOS/Android build implements the exact same `LocationTrackingProvider`
interface — Core Location on iOS, an Android foreground location service
— and reports `backgroundTrackingSupported: true` once it genuinely
delivers that. No caller needs to change; the interface is the contract.

The web adapter detects backgrounding via the page's own
`visibilitychange` event: if the page stays hidden longer than 30 seconds
while actively tracking, it fires `onInterruption("app_backgrounded")`
once — a real, useful signal, not a guarantee of catching every gap (a
true force-kill fires no events at all; see §7).

## 6. Offline-first

Non-negotiable per the original brief, and largely delivered, with one
disclosed, narrower exception (see the end of this section):

- **Continuing an active session** needs no network at all —
  `computeElapsedSeconds` is a pure function of already-known local
  state.
- **GPS observations** reuse the existing `telemetry_events` table/outbox
  (Vertical A) unchanged, with one additive nullable column
  (`job_session_id`,
  `supabase/migrations/20260902020000_telemetry_events_job_session_link.sql`) —
  no second, parallel observation store.
- **Pause/Resume/Finish/Cancel** compute their own transition client-side
  (the same pure `job-session-lifecycle.ts` functions the online path
  uses) and, when `navigator.onLine` is false, queue the result via the
  offline outbox instead of calling the server action directly
  (`src/app/(app)/job/[id]/ActiveJobSessionView.tsx`'s `applyTransition`).
- **Confirm Actual** needs no online/offline split at all — a Confirm
  Actual submission has always been client-asserted-and-trusted by
  design (the farmer is the source of truth for what happened, the same
  posture `addWeightObservation` already has for a farmer-entered
  weight), so offline Confirm Actual poses no *different* risk than
  online.

**Disclosed exception**: starting a Job Session **from a real Prompt**
requires connectivity. Starting one *from a Prompt* is a genuine
Decide-stage `"accepted"` outcome against a scientific Estimate — the
same class of risk `submitPromptDecisionAction`'s own audit history
already fixed once (a client-constructed `basis` can be fabricated;
`docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round1.md`,
HIGH). Trusting an offline-queued, client-computed Prompt acceptance
would reopen that exact gap. A **manual** start (no Prompt, no scientific
evidence at stake) works fully offline
(`applyQueuedManualJobSessionStartAction`,
`src/app/actions/job-sessions.ts`). See `BLOCKERS.md`'s matching entry.

Device observation → durable local storage → sync/outbox → cloud
persistence: the offline outbox (`src/lib/offline/outbox.ts`, unchanged
architecture, widened `OutboxItemType` union) gained four new item types
(`job_session_start`, `job_session_lifecycle`,
`job_session_gps_observation`, `job_actual_confirmation`), each wired to
its real sync call in `src/lib/offline/job-session-sync.ts` — the one
place `outbox.ts`'s own "wiring is the caller's job" design intended.

**Retry-safety, corrected once already in this same phase**: a queued
Confirm Actual submission's retry-safety is keyed on a client-generated
`job_actuals.id` (mirroring `telemetry_events.id`/`job_sessions.id`),
checked *before* any revision number is computed — a revision-only retry
check has a real bug under the outbox's at-least-once delivery model (a
retried call would re-read "current max revision" fresh, already
reflecting its own prior successful insert, and mint a duplicate
revision). See `src/lib/farm-data/job-actuals.ts`'s own header comment
for the full account; this was found and fixed during this phase's own
build, before ever shipping.

## 7. Tracking gaps — never fabricated

`src/domain/job-session-lifecycle.ts`'s `InterruptionGap`
(`{lastConfirmedAt, interruptedAt, nextConfirmedAt?, reason?}`) is
appended, never overwritten, via `recordInterruptionGap` — legal only
while a session is genuinely `"active"`. A farmer-initiated pause is not
an interruption (a deliberate, known state); an interruption is
discovered evidence about an already-active session that stopped
providing real fixes for a reason the app did not choose.

A force-killed app or OS interruption fires no events the app can catch
directly — the web adapter's `visibilitychange`-based detection (§5) is
a real, useful signal, not a complete guarantee. **Disclosed gap, not
silently accepted**: this phase wires `recordInterruptionGap` in the
domain layer and exposes it from the orchestration layer
(`recordJobSessionInterruptionAction`,
`src/orchestration/job-session/index.ts`), but the live UI does not yet
call it automatically on every real interruption path (e.g. a session
resumed after a genuine force-kill, where the app's own resume logic
would need to compare the last-known interval against the current real
time and decide whether the gap is large enough to be a genuine
interruption rather than a normal brief backgrounding). Tracked in
`BLOCKERS.md`.

## 8. GPS must not claim worked area without evidence

A phone being inside a field proves only that: the phone was there, for
some duration, at some recorded positions. `src/domain/job-actual.ts`'s
`resolveFieldScopedArea` is the one function every field-scoped
activity's validator calls, and it is the one place this rule is
enforced: `"whole"` completion uses the field's real, already-mapped
`areaHa` (farm data, never GPS-derived); `"partial"` uses only a
farmer-confirmed figure, never a manufactured one when none is known;
`"did_not_happen"` has no area at all. Future implement-width/tractor
telemetry may improve coverage estimation later — not invented now.

## 9. Partial jobs and remaining planned work

`completionType: "partial"` is a first-class Actual outcome, not a
separate lifecycle status (see §2's own note on why `cancelled` and
`did_not_happen` are the two real "did not fully happen" end states, and
partial/whole/did-not-happen are properties of the *Actual*, not the
session). `computeRemainingPlannedAreaHa(plannedAreaHa, confirmedActualAreaHa)`
(`job-actual.ts`) computes "remaining work" purely at display time —
floored at zero, never negative — without mutating any stored plan. No
separate "planned work area" concept exists elsewhere in this repo yet;
today "the plan" is simply the field's own real mapped area.

## 10. Multi-field architecture

`job_sessions.field_segments` (jsonb array of
`{fieldId, enteredAt?, exitedAt?}`) exists from day one, alongside the
indexed, same-farm-enforced `primary_field_id` convenience column for
today's common single-field case. This phase deliberately optimises the
UI around one primary field at a time (`ActiveJobSessionView`,
`ConfirmActualSheet` both show one field) — the schema does not block a
future Field 7 → Field 8 → Field 9 session; it is simply not built yet.

## 11. Farm Return Drive compatibility

`telemetry_events.source` is currently constrained to `'phone_gps'`
(`telemetry_events_phone_gps_payload_shape`, unchanged this phase) — a
future non-phone observation source (tractor identity, vibration/power,
a BLE implement tag, other machine telemetry) becomes real Observed
evidence on the same Job Session via the identical
`job_session_id`-linking pattern this phase already established for
phone GPS (§3/§6), needing only its own new `source` value (a small,
forward-only CHECK-constraint widening) — not a new schema concept. The
phone remains the primary GPS source unless product requirements change.

## 12. Per-value provenance

`src/domain/job-session-provenance.ts`'s `buildJobSessionProvenance` is
the one function that classifies each real signal present into a
`ProvenanceEntry` — never one flattened generic "confirmed" state, and
never an entry for a value that's absent. Worked example (matching the
original brief's own table):

| Value | Origin |
|---|---|
| date, start/end | `observed` — device timestamp |
| field | `observed` (GPS-inferred only), `actual` (farmer-confirmed only), or both |
| activity | `actual` (farmer-confirmed, from Plan/Prompt origin) |
| quantity | `actual` — farmer Actual |
| mapped field area | `farm_data` |
| weather | `external_source` |
| Prompt itself | `estimated` — Farm Return's own estimate |
| GPS trace | `observed` — device evidence |

This is the real, inspectable list Ask AI (§13), a future Calculation &
Evidence report, and plain on-screen disclosure all read from — not a
UI-only presentation detail.

## 13. Ask AI

`ActiveJobSessionView` and `ConfirmActualSheet` both wire real,
inspectable context (`AskAIButton`) — activity, field, status, elapsed
time, duration — never invented. Ask AI must never infer a missing
Actual: nothing in this phase's context objects synthesises a value the
session/Actual doesn't actually have.

## 14. Revision-safe Actuals

`job_actuals`
(`supabase/migrations/20260902010000_job_actuals.sql`) is insert-only —
select+insert grant, no update/delete, ever, the same "a recorded fact,
once made, is historical" posture `decisions`/`telemetry_events` already
have. Editing a confirmed Actual inserts a **new** row with `revision`
incremented and `supersedes_revision` naming the one it corrects; the
"current" Actual for a session is simply the row with the highest
`revision`. The user-facing action is "Edit record"; persistence never
mutates history. `src/domain/job-session-evidence.ts`'s
`reviseActualValue` gives the same discipline at the per-value level
(`.previous` chain), for a future UI that needs field-level revision
display rather than whole-row revision.

## 15. Estimate → Actual learning — data contract only

No calibration/ML logic is built in this phase. What exists: every
confirmed Actual's `job_sessions.decision_id` links back to the real
`decisions` row carrying the original Estimate
(`estimate_snapshot`/`inputs_snapshot`) — planned quantity vs. Actual
quantity, estimated duration (from the Decision's own timing context) vs.
Actual duration (`computeElapsedSeconds`), planned field vs. Actual field,
planned area vs. confirmed Actual area are all real, joinable facts
today. A future Learn-stage consumer reads this; none is built here.

## 16. Dev database status

All three migrations this phase adds
(`20260902000000_job_sessions.sql`, `20260902010000_job_actuals.sql`,
`20260902020000_telemetry_events_job_session_link.sql`) are
`PENDING_DEV_VALIDATION` — this build session has no Dev database
credentials (only the public anon key; confirmed via a real `curl`
returning 401, the same limitation every prior session in this
programme has already found and re-confirmed, never re-litigated).
Marked `BLOCKED_EXTERNAL` in `IMPLEMENTATION_MATRIX.md`; every other
buildable part of this contract proceeded regardless.

## Summary of new/changed modules

| Layer | Module | Purpose |
|---|---|---|
| Domain | `src/domain/job-session-lifecycle.ts` | Pure lifecycle state machine |
| Domain | `src/domain/job-session-evidence.ts` | Observed/Estimated/Actual tier primitive |
| Domain | `src/domain/job-actual.ts` | Activity-specific Actual payload validators |
| Domain | `src/domain/job-session-provenance.ts` | Per-value provenance assembly |
| Location | `src/lib/location/location-tracking-provider.ts` | Capability-boundary interface |
| Location | `src/lib/location/web-location-tracking-provider.ts` | Honest web/browser adapter |
| Persistence | `src/lib/farm-data/job-sessions.ts` | `job_sessions` CRUD/reads |
| Persistence | `src/lib/farm-data/job-actuals.ts` | `job_actuals` insert/reads, id-first retry-safety |
| Persistence | `src/lib/farm-data/telemetry.ts` | Additive `jobSessionId` link |
| Orchestration | `src/orchestration/job-session/index.ts` | Start/Pause/Resume/Finish/Confirm workflow |
| Orchestration | `src/orchestration/prompt/recompute.ts` | Shared server-side Prompt recompute (extracted, reused) |
| Offline | `src/lib/offline/outbox.ts` | Widened `OutboxItemType` |
| Offline | `src/lib/offline/job-session-sync.ts` | Real syncFn wiring for the four new item types |
| Actions | `src/app/actions/job-sessions.ts` | Online + offline-sync-passthrough server actions |
| Actions | `src/app/actions/telemetry.ts` | Thin `insertTelemetryEvent` wrapper |
| UI | `src/app/(app)/job/[id]/{page,ActiveJobSessionView}.tsx` | Canonical screen #3, GPS Job Mode |
| UI | `src/components/next/ConfirmActualSheet.tsx` | Canonical screen #4, Confirm Actual |
| UI | `src/components/next/JobSessionRecordCard.tsx` | Records' reader for a confirmed session |
| UI | `src/components/next/ExpandedPromptSheet.tsx` | "Start job" for `spreading_window` Prompts |
| Schema | `supabase/migrations/20260902{000000,010000,020000}_*.sql` | Three forward-only migrations |
