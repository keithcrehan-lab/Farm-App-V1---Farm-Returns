# Codex audit — GPS Job Session + Confirm Actual contract — round 2

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `c49c35f` (round-1 target)
PHASE_COMMIT: `2ba183d` — "Fix Codex round-1 findings against the GPS Job
Session + Confirm Actual contract: 5 HIGH + 5 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **HIGH — Database-level Confirm Actual bypass remains.** The replacement transition function correctly exists in `20260902010000_job_actuals.sql`, and the earlier migration is safe: its function body does not reference `job_actuals`; moreover, PL/pgSQL embedded statements are planned when executed, not resolved against the catalog at function creation. However, authenticated users still have direct `INSERT` on `job_actuals`, so they can insert an arbitrary revision-1 row and then directly update the parent session to `confirmed_actual`. The trigger merely checks that some row exists; it does not establish that confirmation passed through `confirmJobSessionActual`. It also permits an Actual inserted while the session is still `ready` or `active`. See `20260902010000_job_actuals.sql:145` and `20260902010000_job_actuals.sql:245`.

2. **HIGH — `basedOnRevision` still does not represent the revision the user edited.** The SQL revision trigger correctly allows revision 1 only with `supersedes_revision IS NULL`, requires later revisions to supersede `revision - 1`, and verifies that prior revision exists. The unique constraint serializes concurrent inserts safely. But orchestration derives `basedOnRevision` immediately before every attempt rather than accepting the revision on which the edit was authored. After writer A wins revision 2, writer B's retry re-enters orchestration, reads revision 2 as its new base, and inserts revision 3. This reproduces the original silent stale-edit conversion. No live caller supplies an authored base revision; the BLOCKERS entry confirms the edit UI does not exist. See `index.ts:327` and `job-actuals.ts:268`.

3. **HIGH — the UI's instructed retry can permanently preserve the inconsistent state.** The automatic retry correctly reuses the same `id`, reaches the id-first branch, and retries only the status update; it will not hit a duplicate key. The queued action also correctly throws, and the outbox does not swallow that rejection. But if both automatic status attempts fail, the sheet tells the farmer to try Confirm Actual again. A later button press generates a new UUID. Because the session remains `completed_estimated`, orchestration supplies no `basedOnRevision`; `confirmJobSessionActual` inserts revision 2 and, because only revision 1 triggers the status repair, returns success without changing the session status. The UI then navigates away while the session remains unconfirmed. See `ConfirmActualSheet.tsx:96` and `job-actuals.ts:321`.

4. **HIGH — duplicate `fieldIds` can still fabricate a whole-field area.** Server reconciliation is called before both the id-first comparison and insertion, and it uses a real RLS-scoped `fields` query. Normal offline validation followed by server reconciliation is otherwise safe. However, neither validation nor reconciliation requires `fieldIds` to be unique. A request containing the same owned field ID multiple times passes every ownership check and sums its mapped area once per occurrence. This lets a client manufacture a larger "whole" area entirely from real-looking server data. See `job-actuals.ts:169` and `job-actual.ts:125`.

5. **HIGH — activity binding and payload validation remain bypassable through the offline-sync action and direct SQL.** The normal online orchestration action correctly compares `input.activityType` with the immutable session activity. `applyQueuedJobActualConfirmationAction`, however, calls the lower-level persistence function directly and performs neither that comparison nor `validateJobActualInput`; authenticated clients can invoke this Server Action with an activity/payload unrelated to the session. Direct authenticated SQL inserts have the same gap because there is no trigger binding `job_actuals.activity_type` to `job_sessions.activity_type`. See `job-sessions.ts:260` and `20260902010000_job_actuals.sql:43`.

6. **HIGH — livestock ownership from round-1 finding 4 was explicitly left unfixed.** Neither `livestockGroupId` nor `animalId` is reconciled against farm-scoped data. The claim in BLOCKERS that this is merely a hypothetical "self-farm-only exposure" is inaccurate: both the public insert grant and the queued Server Action accept opaque payload identifiers without looking up their owning farm. A known cross-farm identifier can therefore be persisted. See `BLOCKERS.md:1326` and `20260902010000_job_actuals.sql:59`.

7. **MEDIUM — reconciliation before the idempotency check can break a legitimate retry.** Re-fetching field data before comparing an existing ID means a mapped-area change between the successful revision-1 insert and its status-only retry produces a different reconciled payload. The id-first branch then rejects the same logical submission as mismatched and never repairs the parent status. Retry comparison should use immutable submission semantics or perform the existing-ID/status-repair path before reconciliation. See `job-actuals.ts:235`.

8. **MEDIUM — background interruption can fire twice.** When the 30-second timer executes, it calls `onInterruption` but does not clear `hiddenSinceMs` or record that it fired. On resume, the wall-clock branch calls the callback again. Thus the claimed "fires once" behavior is false and can append duplicate interruption gaps. See `web-location-tracking-provider.ts:99`.

The remaining checks passed:

- Telemetry presence is joined through the current session's relationship and selects only `telemetry_events.id`; another session's row cannot satisfy it, and no coordinates are returned. Clients can still submit false telemetry, but that capability predates this fix.
- Fertiliser clears product, quantity, unit, and area; slurry clears type, quantity, unit, method, and area; silage clears harvested area, bales, and tonnes for `did_not_happen`.
- The completion group has a real matching label ID, `role="radiogroup"`, and child `role="radio"` elements with meaningful `aria-checked`; controls have accessible names and errors use `role="alert"`.
- The manual-start `MEASURED` blocker was added and accurately describes that specific vocabulary mismatch. The broader claim that all round-1 High/Medium issues were fixed is not accurate.
- Focused tests could not run because this checkout has no installed `vitest` executable (`sh: vitest: command not found`).

AUDIT_SUMMARY: CRITICAL=0 HIGH=6 MEDIUM=2 LOW=0
GATE: FAIL
