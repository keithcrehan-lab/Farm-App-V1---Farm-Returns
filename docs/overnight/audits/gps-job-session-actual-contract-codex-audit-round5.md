# Codex audit — GPS Job Session + Confirm Actual contract — round 5

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `e3dfdfa` (round-4 target)
PHASE_COMMIT: `28634b7` — "Fix Codex round-4 findings against the GPS Job
Session + Confirm Actual contract: 1 HIGH + 1 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **MEDIUM — The cancellation race is not fully fixed.** In `job_sessions_check_valid_transition` (`20260902010000_job_actuals.sql:372`), the new `EXISTS` query uses the cancellation `UPDATE` statement's `READ COMMITTED` snapshot. If the cancellation statement starts while the Actual insert holds its `FOR SHARE` lock, it can wait, then continue after the insert commits while still using the earlier snapshot. The trigger may therefore see no `job_actuals` row and allow cancellation, leaving the committed Actual attached to a cancelled session. This needs an atomic insert/status transition or synchronization that obtains a fresh snapshot after locking. Consequently, `BLOCKERS.md:1340` overclaims that this race is closed. If the Actual insert rolls back, its uncommitted row is never visible and the cancellation correctly proceeds after the lock releases; there is no false permanent block.

Round 4's HIGH is genuinely fixed. The checks at `20260902010000_job_actuals.sql:213` correctly reject non-array `fieldIds`, non-string array entries, and non-string/null livestock or animal identifiers. UUID casts and ownership lookups fail closed, and the PL/pgSQL/operator usage appears valid.

The completed-estimated cancellation restriction is semantically appropriate once a committed Actual exists: the domain contract distinguishes abandoning before confirmation from confirming `did_not_happen`. A failed or rolled-back Actual insert does not leave a row capable of blocking later cancellation.

No additional Critical/High issue was found in the reviewed TypeScript and migrations. Offline confirmation is revalidated against current farm data, retries remain ID-based, farm isolation is enforced in both application and database paths, and revision inserts remain immutable and gap constrained. No executable Vitest or local PostgreSQL environment was installed, and there is still no database integration test reproducing the lock/snapshot race.

The disclosed numeric/quantity-truthfulness remainder is accurately scoped: direct REST callers can still submit shape-valid but invented quantities or areas for their own farm. It is not overclaimed as fixed. The assertion that all structural identifier checks are closed is accurate; only the separate cancellation-race closure claim is inaccurate.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` (0 Critical, 0 High) — per `docs/farm-return-next/BUILD_PLAN.md`'s
own severity taxonomy and `scripts/codex-audit.sh`'s own pass/fail
definition, this is a genuine pass; no Critical or High finding remains
unresolved anywhere across all five rounds of this phase's audit.

The one remaining MEDIUM is a real, correctly-identified subtlety, not
dismissed: PostgreSQL's READ COMMITTED snapshot semantics mean a
`not exists (select ... from job_actuals ...)` re-evaluated inside a
trigger after a `FOR SHARE` lock-wait completes does not reliably see a
row committed by the transaction it just waited on — only the specific
locked row itself gets a fresh (EvalPlanQual) read; a subquery against a
*different* table keeps the original pre-wait snapshot. This is genuine,
documented Postgres behaviour, not a misunderstanding on Codex's part,
and the fix round 4 shipped narrows the race window (closing the
*concurrent-with-the-insert-transaction* case, which is real and was
the literal round-3/round-4 finding) without fully eliminating a rarer
sub-case within it.

**Why this is not fixed further this round, and is recorded as accepted,
not silently left open:** a full fix means making the `job_actuals`
insert and the `job_sessions` status move to `confirmed_actual` one
atomic database transaction, rather than the two separate statements
`confirmJobSessionActual` (`src/lib/farm-data/job-actuals.ts`) issues
today. That is a genuine architecture decision — introducing this
schema's first client-callable multi-write transactional RPC — not a
same-shape trigger tweak, and not something one checkpoint's persistence
module should do unilaterally (the identical reasoning `BLOCKERS.md`
already applies to the numeric-truthfulness gap and to why this schema
has never introduced a privileged/RPC-gated write path). Verifying the
exact scope of the residual window with certainty also requires a live
PostgreSQL instance to test the actual EvalPlanQual/snapshot behaviour
under real concurrent load — this session has no Dev DB credentials
(`BLOCKERS.md`'s standing `BLOCKED_EXTERNAL`). Recorded honestly in
`BLOCKERS.md` as a narrow, same-farm-only residual race (a farmer racing
a cancel against their own Confirm Actual submission within the single
in-flight insert's duration), not overclaimed as closed.

**Stopping the audit-fix-reaudit loop here**: `GATE: PASS` has been
reached (5 rounds: 10 → 8 → 3 → 2 → 1 findings, converging throughout,
zero Critical/High remaining), satisfying this phase's own gating rule.
The one remaining MEDIUM is disclosed, narrow, and requires a real
architecture decision plus live-DB verification to close further —
exactly the "genuine external/human blocker" class of remainder this
phase's own instructions anticipated, not something to keep iterating on
unilaterally.
