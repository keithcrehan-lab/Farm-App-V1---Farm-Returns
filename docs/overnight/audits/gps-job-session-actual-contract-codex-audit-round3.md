# Codex audit — GPS Job Session + Confirm Actual contract — round 3

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `2ba183d` (round-2 target)
PHASE_COMMIT: `719af65` — "Fix Codex round-2 findings against the GPS Job
Session + Confirm Actual contract: 6 HIGH + 2 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **HIGH — Direct authenticated SQL still bypasses the sanctioned Confirm Actual path.** The new trigger only verifies the parent status at `20260902010000_job_actuals.sql:162`, while authenticated users retain direct insert permission at `20260902010000_job_actuals.sql:192`. Once a session is `completed_estimated`, its owner can insert a shape-valid but fabricated Actual and then update the session to `confirmed_actual`. The database does not bind the Actual's `activity_type` to the session or verify JSON entity ownership. This leaves the database portions of round-2 findings 1, 5, and 6 unresolved and contradicts the contract's claim that confirmation exists only through `confirmJobSessionActual`.

2. **HIGH — The offline-sync Server Action still bypasses payload validation.** `applyQueuedJobActualConfirmationAction` passes client-provided `ConfirmJobActualInput` directly to `confirmJobSessionActual`. That lower layer explicitly assumes validation already happened and never invokes `validateJobActualInput`. Its new ownership checks only run when IDs have string types, so malformed identifiers or arbitrary activity payload shapes can bypass them. Activity-type binding is fixed for this route, but round-2 finding 5 also identified payload-validation bypass, which remains.

3. **MEDIUM — The status gate has a concurrent cancellation race.** The trigger's plain `SELECT` neither locks the parent row nor establishes a serializable invariant. One transaction can observe `completed_estimated` and proceed with an Actual insert while another concurrently transitions that session to `cancelled`; both can commit, leaving an Actual attached to a cancelled session. A row lock or equivalent atomic database operation is required. Same-transaction ordering itself is correct: status-update-then-insert works, while insert-before-status-update fails. Revision >1 inserts remain legitimate because `confirmed_actual` is permitted.

The other fixes were verified:

- The vacuous orchestration derivation of `basedOnRevision` is genuinely removed, and its interface documentation now accurately states that no current caller supplies an authored revision.
- Status movement is attempted after every successful or ID-matched write. The supplied farm/session IDs have already been farm-scoped and compared against existing-row content, so no incorrect-ID call path was found. The extra session lookup is farm-scoped and activity is immutable; its cost is one additional round trip.
- Field IDs are deduplicated before both ownership iteration and summation.
- Both online and offline application paths reach the new activity binding, though direct SQL remains a bypass as reported above.
- Livestock queries are explicitly farm-filtered. Valid string identifiers are checked for all completion types.
- Reconciliation runs only for new IDs. Retry comparison removes only the two derived area keys for `whole` submissions and continues comparing quantity, product, field IDs, notes, timestamps, and other payload data. Reusing an ID with genuinely different non-area content is rejected.
- Clearing `hiddenSinceMs` prevents duplicate reporting. A later foreground transition clears the expired timer, and a subsequent background event initializes fresh timestamp/timer state, so a second interruption is still detected.
- Focused tests could not run because this checkout has no installed `vitest` executable.

AUDIT_SUMMARY: CRITICAL=0 HIGH=2 MEDIUM=1 LOW=0
GATE: FAIL
