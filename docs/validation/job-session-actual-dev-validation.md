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
| 11 | `20260902070000_fix_confirm_job_session_actual_retry_race.sql` | Codex audit round 1 MEDIUM — the RPC's own retry-safety id-check ran before its `for update` lock, leaving a narrower race for two concurrent retries of the identical id. Reordered. |
| 12 | `20260902080000_revoke_default_privileges_public_schema.sql` | Codex audit round 1 HIGH — #9 fixed the symptom (existing tables) but not the root cause (the project's own standing default-privilege setting). Revokes the default ACL itself for role `postgres`, schema `public`, for future tables/functions/sequences. |
| 13 | `20260902100000_fix_field_segments_fail_open.sql` | Codex audit round 5 MEDIUM — `job_sessions.field_segments`' own ownership check silently skipped a missing/non-string `fieldId` instead of rejecting it (the same fail-open pattern already fixed for `job_actuals`, never mirrored here). Fixed. |
| 14 | `20260902110000_fix_confirm_job_session_actual_retry_content_check.sql` | Codex audit round 5 HIGH — the RPC's id-matched retry branch returned whatever row it found by `id` alone, with no check the request's own content actually matched. Fixed: compares every immutable field and raises on mismatch; also makes the parent-session lookup explicit and fail-closed on its own. |
| 15 | `20260902120000_fix_field_segments_fail_open_round2.sql` | Codex audit round 6 MEDIUM — round 5's own fix for #13 only rejected a *present* non-string `fieldId`; a missing `fieldId` key, or a non-object array element, was still silently accepted (the real domain type, `FieldSegmentInput`, requires `fieldId` — never optional). Fixed to match `job_actuals.fieldIds`' own sibling implementation exactly. |
| 16 | `20260902130000_fix_confirm_job_session_actual_retry_content_check_round2.sql` | Codex audit round 6 HIGH — round 5's own fix for #14 used a NULL-unsafe `<>` for several fields and omitted `farm_id`/`confirmed_by`/`confirmed_at`. Fixed: every comparison now uses `IS DISTINCT FROM`, with the full immutable-field set covered. |

**16 real migrations applied in total.** A 17th, targeting `supabase_admin`'s own separate default ACL (Codex audit round 2 HIGH follow-up — `supabase_admin` also holds `CREATE` on `public` and its own separate default ACL), was written and actually run — rejected live: `permission denied to change default privileges`, a genuine Supabase role-hierarchy boundary `postgres` cannot cross. **Status: `BLOCKED_EXTERNAL`, not applied.** Codex audit round 4 (MEDIUM) correctly flagged that keeping this migration's file in `supabase/migrations/` would make every future `supabase db push` fail on it before ever reaching a later migration (`supabase migration repair --status reverted` was tried first and does not change this — the CLI still treats a reverted-but-never-applied version as pending) — the file was removed from `supabase/migrations/` entirely; its exact SQL is preserved in `docs/farm-return-next/BLOCKERS.md` instead, ready for a future session with real `supabase_admin`-level access to apply as a fresh migration. `db push --dry-run` re-confirmed `upToDate: true` after removal.

`supabase migration list --linked` confirmed every one of the 16 applied local migration timestamps has a matching remote entry (`local` = `remote` for all 16, no drift).

**Codex audit history against this phase's own work**: round 1 (3 HIGH + 1 MEDIUM + 2 LOW, all fixed — migrations #11/#12 above, the Test 12 additions below, BUILD_STATE.json/IMPLEMENTATION_LOG.md catch-up, an allowlist-strengthened `constructManualJobStartDecision` guard, corrected stale comments); round 2 (3 further HIGH — Test 12's own incompleteness (fixed) and BUILD_STATE.json's own remaining staleness/self-contradiction (fixed); the `supabase_admin` default ACL was *investigated with real live evidence and a real applied-and-rejected migration*, not fixed — it is genuinely `BLOCKED_EXTERNAL`, see "Remaining blockers" below); round 3 (2 further HIGH + 1 LOW, all fixed — Test 12's own column-grant check needed a real correction after its first fix attempt was itself found wrong during verification, BUILD_STATE.json's continued staleness, and an overclaiming "closed" sentence in the blocked migration's own comment); round 4 (2 further HIGH + 1 MEDIUM + 1 LOW, all fixed — Test 12 still missed column-scoped `REFERENCES` grants (added Test 12g), BUILD_STATE.json's continued staleness, the blocking-future-migrations hazard above (fixed by removing the file), and this section's own stale "10/10" migration count); round 5 (2 HIGH + 2 MEDIUM — Test 12's whole suite was blind to a `PUBLIC`-granted or role-membership-inherited privilege (fixed: Test 12h using `has_table_privilege`, migrations #13/#14 above closing two genuine, independently-found code bugs — `job_sessions.field_segments`' own fail-open ownership check, and the RPC's own unvalidated id-matched retry — neither previously flagged by any prior round; BLOCKERS.md's own older summary paragraph still cited stale figures, fixed); round 6 (2 further HIGH + 2 further MEDIUM — Test 12h's own first version still only covered 4 of the 7 tables and never called the `has_any_column_privilege` it advertised (fixed: extended to all 7, added Test 12i for column-scoped REFERENCES); the RPC's own round-5 content-check used a NULL-unsafe `<>` and omitted `farm_id`/`confirmed_by`/`confirmed_at` (fixed: migration #16, uniform `IS DISTINCT FROM`, full field coverage); `field_segments`' own round-5 fix still silently accepted a missing `fieldId` key or non-object element, contradicting the real domain type which requires it (fixed: migration #15); this section's own migration count still lagged behind the real total after rounds 5's own additions). Full transcripts:
`docs/overnight/audits/job-session-dev-validation-codex-audit-round{1,2,3,4,5,6}.md`.

## RLS / farm-isolation results

Run via `supabase/validation/job_sessions_actuals_validation.sql` (self-rolling-back, real farms already in the project — Farm A `3dec4855-…` and Farm B `2cb08df7-…`, two different real owners, each with a real field and livestock group). **All 51 checks: PASS** (grew from 33 across five rounds of Codex audit against this phase's own work — round 1 added Test 12a-12e for the seven previously-affected tables' grants; round 2 found that first version only checked absence of a few named excess privileges, not an exact match against the full intended grant, so Test 12 was rewritten to assert every table's real, complete table-level grant set; round 3 found the column-level part of that rewrite was still incomplete, and that a same-round first fix attempt for it was itself wrong — `information_schema.role_column_grants` reflects a table-level grant per column too, so "zero column rows expected" was never the correct invariant — corrected to check UPDATE-column counts against each table's own real, current total; round 4 found column-scoped `REFERENCES` grants specifically were still unchecked — added Test 12g; round 5 found the whole Test 12 suite only ever checked *direct* grants to `authenticated`, blind to a PUBLIC-granted or role-membership-inherited privilege — added Test 12h using `has_table_privilege`; round 5 also added Test 3e/3f for `job_sessions.field_segments`' own same fail-open pattern already fixed for `job_actuals`, and Test 8b for the RPC's own id-matched-but-different-content case; round 6 found Test 12h's own first version still only covered 4 of the 7 tables and never actually called the `has_any_column_privilege` it advertised — extended to all 7 tables and added Test 12i for column-scoped REFERENCES specifically).

| Test | Result |
|---|---|
| 1 — User A selects own (empty) job_sessions/job_actuals | PASS |
| 2a/2b/2c — User A sees zero rows/cannot select Farm B's session/actual directly by id | PASS |
| 3a — positive control: User A inserts own job_sessions row | PASS |
| 3b — User A cannot insert with farm_id = Farm B | PASS |
| 3c — User A cannot insert own farm_id + Farm B's decision_id (job_sessions_check_same_farm) | PASS |
| 3d — User A cannot insert own farm_id + Farm B's field as primary_field_id | PASS |
| 3e — User A cannot insert a field_segments element referencing Farm B's field | PASS |
| 3f — a field_segments element with a non-string fieldId fails closed | PASS |
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
| 8b — reusing a client id with genuinely different content is rejected, not silently resolved to the wrong row | PASS |
| 9a/9b — no UPDATE/DELETE grant on job_actuals; behavioural + content confirmation | PASS |
| 10a/10b — User B cannot see Farm A's session/actual | PASS |
| 11a/11b/11c — anon has zero access to job_sessions/job_actuals/the RPC | PASS |
| 12a-12e3 — an exact-match assertion of authenticated's real, complete table-level grant against all seven previously-affected tables' documented intent | PASS |
| 12f1-12f5 — authenticated's real UPDATE-column count on each of the five non-partial tables is exactly 0 or exactly that table's own full column count (never a stray, narrower column-scoped grant) | PASS |
| 12g — authenticated has no column-scoped REFERENCES grant on any of the seven tables | PASS |
| 12h — has_table_privilege (PUBLIC/membership-aware) independently confirms no dangerous privilege is effectively reachable across all seven tables, closing what the direct-grant-only checks above cannot see | PASS |
| 12i — has_any_column_privilege (PUBLIC/membership-aware) independently confirms no column-scoped REFERENCES is effectively reachable on any of the seven tables | PASS |

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
| Migrations applied | PASS — 16/16 applied, all forward-only, `migration list` shows zero drift; a 17th (supabase_admin default ACL) genuinely `BLOCKED_EXTERNAL`, removed from the migration chain, SQL preserved in BLOCKERS.md |
| RLS / farm isolation | PASS — 51/51 live checks |
| Lifecycle integrity | PASS |
| Actual integrity (activity binding, field/livestock ownership, revision) | PASS |
| Retry / idempotency | PASS |
| Provenance round-trip | PASS |
| Cancellation-race (round-5 MEDIUM) | PASS — reproduced and confirmed closed |
| Default-ACL over-grant (CRITICAL, found this session) | PASS for all 7 affected tables + the RPC (`postgres`-owned default ACL and every existing table's own grant); `BLOCKED_EXTERNAL` for `supabase_admin`'s own separate default ACL (see "Remaining blockers") |

## Remaining blockers

None affecting the Job Session / Actual persistence layer's own real, live-verified correctness (51/51 checks pass). Two genuine residuals, both disclosed, neither claimed as closed:

1. **`BLOCKED_EXTERNAL`**: `supabase_admin` also holds `CREATE` on the `public` schema and carries its own separate default-privilege ACL, still broadly granting `authenticated`/`anon`. A migration to close it was written and actually run against `Farm Return V1 Dev` — and rejected: `permission denied to change default privileges` (the `postgres` role this project's migrations run as cannot alter a different role's own defaults — a genuine Supabase platform boundary). That migration is no longer a file in `supabase/migrations/` (leaving a known-failing migration in the ordered chain would make every future `supabase db push` fail on it first — Codex audit round 4) — its exact SQL is preserved in `docs/farm-return-next/BLOCKERS.md` instead. Real, live-confirmed scope: no object in this schema has ever actually been created as `supabase_admin` (every table's real owner is `postgres`). Unblocks with either genuine `supabase_admin`-level access or a change from Supabase's own platform side.
2. **The disclosed, systemic, whole-schema numeric-truthfulness risk** (an authenticated client can submit shape-valid-but-fabricated numeric content — quantity, non-"whole" area — for their own farm via direct REST) is unchanged, already accepted, and out of scope for a database-level fix per `decisions.ts`'s own architectural history (`BLOCKERS.md`).
