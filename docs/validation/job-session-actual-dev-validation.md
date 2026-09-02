# Job Session / Confirm Actual — real Dev database validation

**Date:** 2026-09-02
**Branch/commit:** `farm-return-next`, starting at `1ead480` (this phase's own commits follow)
**Dev environment:** Supabase project `whevugeisqlpfnrugfsd` ("Farm Return V1 Dev", org `llvvtefyqhirzxucyvco`) — confirmed via `supabase projects list` and `.env.local`'s own `NEXT_PUBLIC_SUPABASE_URL`. No secret value is recorded anywhere in this document or in the repository.

## How Dev access became available this phase

Every prior session in this programme found only the public anon key available (confirmed via `curl` returning 401 on protected tables). This phase began the same way — no `SUPABASE_ACCESS_TOKEN`, DB password, or service-role key in the environment, and a sandbox-level policy blocked an attempt to read a cached local Supabase CLI keychain token even after the user approved trying. The user then authenticated the Supabase CLI directly in their own terminal (outside this sandboxed session) and confirmed `supabase projects list` could see "Farm Return V1 Dev". From that point, this session used the `supabase` CLI (`db push`, `db query`) directly — no secret was ever read, printed, or committed by this session; the CLI manages its own credentials.

## Migrations applied

Applied via `supabase db push --linked --project-ref whevugeisqlpfnrugfsd` (dry-run reviewed first every time), in this order:

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260901000000_telemetry_events.sql` | Prerequisite (Checkpoint 2, Vertical A) — `telemetry_events` table, needed by #3 below. |
| 2 | `20260901010000_telemetry_events_retention_job.sql` | Prerequisite — retention enforcement. |
| 3 | `20260901020000_notifications.sql` | Prerequisite (Checkpoint 2, Vertical G) — `notifications` table. |
| 4 | `20260902000000_job_sessions.sql` | `job_sessions` table, lifecycle triggers, RLS. |
| 5 | `20260902010000_job_actuals.sql` | `job_actuals` table, revision/ownership/activity-binding triggers, RLS. |
| 6 | `20260902020000_telemetry_events_job_session_link.sql` | Additive `job_session_id` column on `telemetry_events`. |
| 7 | `20260902030000_confirm_job_session_actual_atomic.sql` | The atomic `confirm_job_session_actual` RPC (closes the round-5 cancellation race). |
| 8 | `20260902040000_restore_job_actuals_insert_grant.sql` | Corrective — restores `job_actuals`' `insert` grant to `authenticated`, mistakenly revoked by #7 (found by this session's own first validation attempt; see #7's own header comment for the full account). |
| 9 | `20260902050000_fix_default_acl_over_grant.sql` | **CRITICAL fix**, found by this session's own live validation: seven tables (`livestock_individuals`, `livestock_weight_observations`, `supplier_quotes`, `telemetry_events`, `notifications`, `job_sessions`, `job_actuals`) had `authenticated` holding a full, unintended `DELETE`/`UPDATE`/`TRUNCATE`/`TRIGGER`/`REFERENCES` grant from the project's own standing default-privilege setting, never revoked by their own migrations. `TRUNCATE` in particular bypasses RLS entirely. Fixed for all seven. |
| 10 | `20260902060000_revoke_anon_execute_confirm_job_session_actual.sql` | Same root cause as #9, for function `EXECUTE` privilege: `anon` could call `confirm_job_session_actual` directly (the project's default ACL also covers functions). Fixed. |

`supabase migration list --linked` confirmed every local migration timestamp now has a matching remote entry (`local` = `remote` for all, no drift).

## RLS / farm-isolation results

Run via `supabase/validation/job_sessions_actuals_validation.sql` (self-rolling-back, real farms already in the project — Farm A `3dec4855-…` and Farm B `2cb08df7-…`, two different real owners, each with a real field and livestock group). **All 33 checks: PASS.**

| Test | Result |
|---|---|
| 1 — User A selects own (empty) job_sessions/job_actuals | PASS |
| 2a/2b/2c — User A sees zero rows/cannot select Farm B's session/actual directly by id | PASS |
| 3a — positive control: User A inserts own job_sessions row | PASS |
| 3b — User A cannot insert with farm_id = Farm B | PASS |
| 3c — User A cannot insert own farm_id + Farm B's decision_id (job_sessions_check_same_farm) | PASS |
| 3d — User A cannot insert own farm_id + Farm B's field as primary_field_id | PASS |
| 4a — a new job_sessions row cannot be inserted directly as completed_estimated | PASS |
| 4b — ready → confirmed_actual directly is rejected | PASS |
| 4c — completed_estimated → confirmed_actual rejected with no job_actuals row | PASS |
| 5a — raw insert into job_actuals for own farm succeeds (disclosed, accepted — see below) | PASS (disclosed) |
| 5b — RPC rejects activity_type mismatch | PASS |
| 5c — RPC rejects a fieldId belonging to Farm B | PASS |
| 5d — RPC rejects a livestockGroupId belonging to Farm B | PASS |
| 5e — RPC rejects a job_session_id belonging to Farm B outright | PASS |
| 5f — RPC's gapless-revision trigger still fires through the RPC | PASS |
| 6 — atomic confirm inserts the Actual AND moves the session to confirmed_actual in one call | PASS |
| 7 — a confirmed_actual session with a real Actual cannot be cancelled | PASS |
| 8 — retrying the RPC with the same client id returns the same row, no duplicate | PASS |
| 9a/9b — no UPDATE/DELETE grant on job_actuals; behavioural + content confirmation | PASS |
| 10a/10b — User B cannot see Farm A's session/actual | PASS |
| 11a/11b/11c — anon has zero access to job_sessions/job_actuals/the RPC | PASS |

**Test 5a is disclosed, not a bug**: `confirm_job_session_actual` is `SECURITY INVOKER` (deliberately, not `SECURITY DEFINER` — see `20260902030000`'s own header comment), so it needs the same `insert` grant a raw client insert already required; revoking it breaks the RPC for every caller, not just a bypass (confirmed empirically — see migration #8 above). A raw insert for one's own farm remaining technically possible is the same already-accepted, whole-schema "an authenticated client can act on their own farm's data via direct REST" risk `BLOCKERS.md` already documents for every table.

## Job lifecycle / Actual integrity results

Covered by the same script (tests 4a–4c, 5b–5f, 6, 7 above) plus a dedicated real concurrency test (below). Confirmed live: `ready → confirmed_actual` direct jump rejected; `completed_estimated → confirmed_actual` with no `job_actuals` row rejected; a new session can only ever be inserted `ready`/`active`; `confirm_job_session_actual` binds `activity_type` and every `fieldId`/`livestockGroupId` to the real session/farm; revision gaplessness enforced through the RPC.

## Retry / idempotency results

Test 8 above: calling `confirm_job_session_actual` twice with the identical client-generated `id` returns the same row both times, with exactly one `job_actuals` row for that session afterward — confirmed by direct row count, not just absence of an error.

## Provenance round-trip

Test 6/8's real inserted row round-tripped its `payload` (`activityType`, `completionType`, `livestockGroupId`, `action`) and `revision`/`supersedes_revision` exactly as submitted, readable back via the same session. `src/domain/job-session-provenance.ts`'s own classification (Observed/Estimated/Actual/farm_data/external_source) is exercised by existing unit tests (`job-session-provenance.test.ts`, unchanged this phase) and is not itself persisted — it's computed at read time from real persisted facts, so no separate live round-trip check was needed beyond confirming those underlying facts persist correctly (which the tests above do).

## Cancellation-race reproduction — real, deterministic, two-connection test

The round-5 disclosed MEDIUM (a narrow same-farm cancellation race under PostgreSQL READ COMMITTED semantics) was reproduced and re-tested for real, not just reasoned about:

**Setup**: a disposable Farm-A session in `completed_estimated`, no `job_actuals` row yet.

**Connection 1** ("confirm"): `BEGIN; SET LOCAL ROLE authenticated` (Farm A's own claims) → calls `confirm_job_session_actual(...)` for the disposable session → holds the transaction open 4 seconds (`pg_sleep(4)`) before `COMMIT`.

**Connection 2** ("cancel"), started 1.5 seconds after connection 1 (while it is still open, holding its `for update` lock): `BEGIN; SET LOCAL ROLE authenticated` (same farm) → `UPDATE job_sessions SET status = 'cancelled' WHERE id = <session>`.

Both launched as genuinely separate `supabase db query` processes (separate connections/backends), run in parallel via background shell jobs, no shared transaction.

**Result**: connection 1 committed at `12:41:01.935022+00` (Actual inserted + session moved to `confirmed_actual`, atomically). Connection 2's `UPDATE`, which had been blocked waiting for connection 1's row lock, unblocked immediately after and was **rejected**: `ERROR: 23514: job_sessions: invalid status transition confirmed_actual -> cancelled`. Final state confirmed independently: `status = 'confirmed_actual'`, exactly one `job_actuals` row. The atomic RPC's `for update` lock, combined with both writes committing in one transaction, means a competing transaction that was genuinely blocked mid-flight gets a **fresh** read of the row once unblocked (PostgreSQL's own EvalPlanQual re-evaluates the target row's current `OLD` value for the specific row under lock) — closing the race the round-4 `for share` mitigation could not fully close (its own subtlety: a nested `exists` sub-query inside an already in-flight, lock-waiting statement keeps that statement's pre-wait snapshot; here there is no such sub-query — the rejection comes from the trigger's own primary `OLD.status` check, which does get the fresh value).

**Disposition: this MEDIUM is now genuinely closed**, not merely narrowed — real, empirical, two-connection evidence, not a theoretical argument. Test data cleaned up immediately after (session/decision/Actual deleted as the superuser connection); final row counts confirmed zero leftover rows.

## PASS/FAIL summary

| Area | Result |
|---|---|
| Migrations applied | PASS — 10/10, all forward-only, `migration list` shows zero drift |
| RLS / farm isolation | PASS — 33/33 live checks |
| Lifecycle integrity | PASS |
| Actual integrity (activity binding, field/livestock ownership, revision) | PASS |
| Retry / idempotency | PASS |
| Provenance round-trip | PASS |
| Cancellation-race (round-5 MEDIUM) | PASS — reproduced and confirmed closed |
| Default-ACL over-grant (CRITICAL, found this session) | PASS — fixed for all 7 affected tables + the RPC |

## Remaining blockers

None specific to the Job Session / Actual persistence layer's own correctness. The one remaining, disclosed, systemic, whole-schema risk (an authenticated client can submit shape-valid-but-fabricated numeric content — quantity, non-"whole" area — for their own farm via direct REST) is unchanged, already accepted, and out of scope for a database-level fix per `decisions.ts`'s own architectural history (`BLOCKERS.md`).
