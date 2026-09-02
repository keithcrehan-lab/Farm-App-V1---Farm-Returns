# Codex audit — GPS Job Session + Confirm Actual contract — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `3f01920178601a4839f4fe225f514a8dd0649897` (the prior audited-clean checkpoint)
PHASE_COMMIT: `c49c35f` — "GPS Job Session + Confirm Actual contract: universal Job Session lifecycle, activity-specific Actuals, offline-first, honest location capability boundary"

Full raw transcript (Codex's own file reads, in full) is not included here
— trimmed to Codex's final report only, per the overnight-run instruction
("Use a temporary output path for Codex's final message and copy it into
the audit log").

---

codex
1. **HIGH — `confirmed_actual` is reachable without a Confirm Actual submission.** The TypeScript and SQL transition tables agree, but the database grants authenticated users direct `status` updates. Any farm owner can update a `completed_estimated` row to `confirmed_actual`; the trigger checks only the transition, not the existence of a corresponding `job_actuals` revision. Conversely, authenticated users can insert directly into `job_actuals`. This contradicts the contract's central claim that confirmation exists only through `confirmJobSessionActual`. See `20260902000000_job_sessions.sql:171` and `20260902000000_job_sessions.sql:239`. The lifecycle tests verify the pure function, but not this database-level bypass.

2. **HIGH — concurrent revisions are silently serialized instead of detecting stale edits.** Both writers read the same maximum revision, one wins the unique slot, and the other fails. When the losing outbox item retries, it rereads the new maximum and inserts itself as the following revision, even though it was authored against the older base. No expected/base revision is supplied or checked, so two-device conflicts become an apparently intentional amendment. Direct database inserts can also choose any positive revision or incorrect `supersedes_revision`; SQL enforces neither a gapless sequence nor `supersedes_revision = revision - 1`. See `job-actuals.ts:167` and `20260902010000_job_actuals.sql:43`. The race test checks only the first failure, not the consequential retry.

3. **HIGH — the two-step first confirmation can leave a permanent inconsistent state.** If the Actual insert succeeds and the status update fails, `confirmJobSessionActual` resolves successfully with `sessionStatusUpdateError`. Both the UI and outbox synchronization ignore that field: the UI navigates away, while `flush()` marks the outbox item synced. Nothing queues or performs the documented status-only recovery. The result is a recorded revision hidden from confirmed-session Records while the session remains `completed_estimated`; a later fresh confirmation can then be inserted as revision 2 without ever repairing status because only revision 1 attempts the transition. See `job-actuals.ts:105`, `job-session-sync.ts:50`, and `ConfirmActualSheet.tsx:105`.

4. **HIGH — embedded entity ownership is client-trusted and bypassable.** `field_segments` receives no same-farm validation; only `primary_field_id` does. `job_actuals.payload.fieldIds`, `livestockGroupId`, and `animalId` likewise have no database ownership enforcement. More importantly, the online server action accepts `FieldAreaContext[]` directly from the client and uses those client-supplied areas as "real mapped area," without refetching fields. A caller can therefore reference another farm's entity IDs or manufacture a whole-field area. See `20260902000000_job_sessions.sql:120`, `20260902010000_job_actuals.sql:59`, and `job-sessions.ts:214` (app/actions).

5. **HIGH — an Actual's activity is not bound to its parent session.** The confirmation action accepts `activityType` from the client but never compares it with `session.activityType`. The database similarly has independent unconstrained `activity_type` values on both tables, while the JSON payload is barely shape-checked. A fertiliser session can therefore be confirmed with a livestock or other activity Actual, corrupting provenance and downstream learning. See `orchestration/job-session/index.ts:300` and `20260902010000_job_actuals.sql:49`.

6. **MEDIUM — Records fabricates GPS provenance.** `JobSessionRecordCard` sets both `hasDeviceTimestamps` and `hasGpsTrace` merely because `activeIntervals` is non-empty. Every started session has an interval even when GPS is unsupported, denied, or never yields a position, and interval endpoints represent lifecycle action timestamps rather than GPS observations. Such records are labelled "Phone GPS (device timestamp)" and "Device evidence" without any telemetry query proving a trace exists. See `JobSessionRecordCard.tsx:45`.

7. **MEDIUM — `did_not_happen` retains hidden numeric values and then fails persistence.** Fertiliser and slurry validators skip requirements but still copy previously entered quantity/area into the payload. Silage inputs remain visible for this completion type and `raw.harvestedAreaHa` takes precedence over the required absence. The SQL constraint rejects these payloads, so selecting "Did not happen" after entering data produces a generic failure instead of the valid confirmed outcome. See `job-actual.ts:193`, `job-actual.ts:227`, and `job-actual.ts:288`.

8. **MEDIUM — Confirm Actual form controls lack accessible names and state semantics.** Inputs and textareas rely only on placeholders; unit and method selects have no labels. Completion choices are ordinary buttons without `aria-pressed` or radio semantics, and validation/status messages lack an alert/live region. The reused Sheet provides modal focus handling, but it does not repair these form-level issues. See `ConfirmActualSheet.tsx:145`.

9. **MEDIUM — background-interruption detection does not reliably deliver its claimed behavior.** The 30-second timer depends on JavaScript executing while hidden. On browsers that suspend background JavaScript — the exact limitation motivating `backgroundTrackingSupported: false` — the page may resume and process `visibilitychange` first, clearing the pending timer without ever reporting the interruption. In addition, every location fix clears the timer while the document remains hidden rather than restarting it. The capability booleans themselves are otherwise conservative, but the documented "hidden longer than 30 seconds fires once" behavior is overstated. See `web-location-tracking-provider.ts:86`.

10. **MEDIUM — manual job starts misuse `MEASURED` evidence.** `MEASURED` belongs to the estimate/evidence vocabulary and communicates a measured value. A button press authorizing a manual job is neither a measurement nor an estimate; persisting `{manual:true}` as an `OK` measured EngineOutcome can mislead future decisions-row consumers. The code comment acknowledges the category mismatch, but the frozen contract does not clearly disclose it and no matching blocker entry was found, despite the comment claiming one exists. See `orchestration/job-session/index.ts:44`.

The selected tests are substantive for their intended happy paths, but systematically mock away the database coupling, concurrent retry, ownership, telemetry-existence, and partial-failure behaviors above. No GPS coordinates were found in application error messages or logs; GPS payloads remain in the intended local outbox/telemetry path, subject to the RLS ownership issues already identified.

AUDIT_SUMMARY: CRITICAL=0 HIGH=5 MEDIUM=5 LOW=0
GATE: FAIL
