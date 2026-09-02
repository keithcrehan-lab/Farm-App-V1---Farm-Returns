# Codex audit — GPS Job Session + Confirm Actual contract — round 4

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `719af65` (round-3 target)
PHASE_COMMIT: `e3dfdfa` — "Fix Codex round-3 findings against the GPS Job
Session + Confirm Actual contract: 2 HIGH + 1 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **HIGH — Database-level entity validation still fails open for malformed JSON identifiers.** In `20260902010000_job_actuals.sql:203`, ownership checks run only when `fieldIds` is an array and each element is a string; non-string elements are silently skipped. Likewise, `livestockGroupId` and `animalId` are checked only when their JSON type is `string` (lines 211 and 220). An authenticated owner can therefore directly insert payloads such as `{"fieldIds":[{"id":"…"}]}`, `{"fieldIds":"…"}`, or `{"animalId":123}` and subsequently confirm the session. No payload-shape constraint rejects these values. Activity-type binding and correctly typed cross-farm IDs are now enforced, but round 3's database bypass is not fully fixed. The assertion in `BLOCKERS.md:1364` that every structural gap was closed and non-string identifiers fail closed is consequently inaccurate; the deliberately retained numeric-truthfulness risk is otherwise described honestly.

2. **MEDIUM — `FOR SHARE` serializes cancellation but does not prevent the invalid final state.** The insert trigger locks the parent at `20260902010000_job_actuals.sql:186`, so a concurrent cancellation waits. After the Actual insert commits, however, the waiting `completed_estimated → cancelled` update remains unconditionally legal at `20260902010000_job_actuals.sql:348`. It can then commit and leave an Actual attached to a cancelled session — the exact outcome round 3 identified. The transition trigger must reject cancellation when an Actual exists, or confirmation must make insertion and status movement atomic.

The application-side non-string checks and offline `validateJobActualInput` call are genuinely fixed. The new tests meaningfully exercise those application paths, but none exercises the SQL trigger behavior responsible for both remaining findings. Focused tests could not run because this checkout has no installed `vitest` executable.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=1 LOW=0
GATE: FAIL
