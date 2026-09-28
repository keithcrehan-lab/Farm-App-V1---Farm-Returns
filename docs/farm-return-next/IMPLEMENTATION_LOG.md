# Farm Return Next — current implementation log

Historical record through frozen Campaign B: [unchanged archive](history/IMPLEMENTATION_LOG-through-b24c266.md).
Read historical sections only for a specific investigation. Rotate completed campaigns into
`history/` with their boundary SHA, retain a link here, and append one concise entry per task.
The archive and Git retain full provenance; no historical entry is deleted.

## Agent harness token efficiency — starting b24c266 (2026-09-28)

Tooling/governance only. Campaign B remains frozen; Campaign C not started.
See `.agent/HARNESS_DIAGNOSIS.md` for the firsthand flow trace and measured context sizes.
Task manifest `.agent/TASK.json` pins the base. Replaced the implicit legacy baseline audit
and stale autopilot with the task workflow; retained independent primary/remediation/final
reviews, dependency expansion, all four quality checks and Critical/High blocking.
CLI JSON usage is recorded when exposed, otherwise UNKNOWN. Archived historical state/logs
byte-for-byte. Blocker index retains unresolved legacy constraints without declaring them closed.
Validation and audit outcome will be recorded at the final checkpoint.

Primary independent audit: one High (F001, conflicting mode flags could narrow final scope).
Fixed by rejecting conflicting modes, selecting the immutable task base for primary/final,
and validating final receipt base/head/clean state. Narrow independent before/after review
resolved F001 with 0 Critical/High; it did not repeat the primary audit.

Verification: 50 orchestration cases and 8 focused harness cases passed. Sandbox-independent
watchdog cleanup is covered directly. The expanded orchestration wrapper retains every case
with a 1180/1200-second allowance. An unchanged product test timed out under concurrent load
and passed all 15 tests in isolation; the final gate uses one test worker, with assertions and
product-test time limits unchanged. Final complete gate passed: 251 test files / 3846 tests; typecheck, lint and build PASS. Logs: `.agent/history/quality-20260928T195447Z-37358/`. Final independent audit is recorded after this commit in the task runtime receipt, which must match HEAD; no task may close without it.
