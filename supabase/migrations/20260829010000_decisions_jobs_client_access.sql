-- Farm Return Next Checkpoint 2, Vertical D — the `decisions`/`jobs`
-- client-access grant `20260829000000_orchestration_foundation.sql`'s own
-- header comment said would come "alongside a real designed write path":
--
--   "A future vertical enables real access with a one-line forward-only
--   migration (`grant select, insert on public.decisions to authenticated;`
--   etc.) once it has a real, designed writer — the policies don't need to
--   be touched again when that happens."
--
-- That real, designed writer now exists: `src/lib/farm-data/decisions.ts`'s
-- `insertDecision` and `src/lib/farm-data/jobs.ts`'s `insertJob`, called by
-- `actRecordWeightObservation` (`src/orchestration/act/index.ts`) — the
-- same reuse-boundary pattern `individual-animals.ts` already established
-- for `addWeightObservation`. This migration is still purely additive with
-- respect to `20260829000000_orchestration_foundation.sql`: no existing
-- column, constraint, trigger, or RLS policy in that file is altered or
-- dropped. It does more than the "one-line" grant that file's own comment
-- anticipated, though — two real Codex audit findings against the first
-- version of this file (below) needed real schema changes, not just a
-- grant, to resolve honestly rather than deferred a third time.
--
-- ---------------------------------------------------------------------------
-- Codex audit findings against this file's first version
-- (docs/farm-return-next/audit-logs/20260829T190434Z.md), both resolved
-- here, not deferred:
--
-- CRITICAL — granting raw `insert` on `decisions` reopens the exact gap
-- the foundation migration's own `estimate_snapshot` CHECK comment already
-- named: "Deliberately NOT validated further here... this only checks
-- `status`, not the rest of an `OK` EngineOutcome's shape (`value`
-- present, `evidenceState` one of its six real values)." That comment
-- reasoned the real fix should be a sanctioned Postgres function/RPC
-- rather than a deepened CHECK, to avoid re-encoding
-- `src/domain/evidence.ts`'s full discriminated union in SQL. On
-- reflection, a full RPC is more than this specific gap actually needs
-- (and it is not this schema's established pattern — no table here is
-- RPC-gated; `insertDecision`/`insertJob`'s own `"server-only"` boundary
-- is the same trust boundary every other `src/lib/farm-data/*.ts` mutation
-- already relies on) — re-encoding the *entire* EngineOutcome union in SQL
-- would itself be the domain-logic duplication `DOMAIN_CONTRACTS.md`'s
-- reuse boundary exists to prevent. The gap Codex actually named is
-- narrower and closable without that: `value` presence and
-- `evidenceState` enum membership are two structural facts, not a
-- calculation — checking them is the same kind of shape validation the
-- existing `outcome`/`status` CHECK already does, not a new category of
-- logic. `decisions_estimate_snapshot_ok_shape` below closes exactly that
-- gap. What it deliberately still cannot do (and no CHECK constraint or
-- RPC without re-running the real calculation could): verify a `value` is
-- *truthful*, only that it has the right shape — the same limit every
-- other jsonb-typed column in this schema already accepts (row-types.ts's
-- own header comment: "an assumption about what was written, not a
-- runtime-validated boundary").
--
-- HIGH — `Decision.fieldId`/`calculationVersion`/`inputsSnapshot`
-- (`src/orchestration/decide/index.ts`, added in Checkpoint 2's first
-- Vertical B slice specifically so a Prompt's trace survives the Prompt
-- itself never being persisted) had no columns in the foundation
-- migration to persist into, so `insertDecision` silently dropped them —
-- exactly the incomplete trace `SCIENTIFIC_RULES.md`'s "a Prompt's own
-- trace... must be inspectable" forbids. Fixed for real: `field_id`,
-- `calculation_version`, `inputs_snapshot` columns added below (all
-- nullable — `Decision`'s own fields are optional, a Prompt not scoped to
-- one field has no `fieldId` to record). `field_id` is a second
-- cross-farm-sensitive foreign key (into `fields`, a farm-scoped table),
-- so it gets the identical same-farm-enforcement trigger pattern
-- `jobs.decision_id` already established in the foundation migration
-- (`assert_decision_belongs_to_farm`/`jobs_check_same_farm`) — a
-- `field_id` from another farm is rejected the same way a cross-farm
-- `decision_id` on `jobs` already is.
--
-- MEDIUM (documentation, not schema) — the original version's
-- `auditTrailError` doc comment in `act/index.ts` implied a failed
-- decisions/jobs write could just be "retried," without being explicit
-- that retrying the *whole* `actRecordWeightObservation` call is not
-- actually safe (it would re-run `addWeightObservation`, which has no
-- idempotency key, creating a second real weight observation). Fixed in
-- that file directly, not here — noted for completeness since both
-- findings came from the same audit round.
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- Codex audit findings against this file's *second* version
-- (docs/farm-return-next/audit-logs/20260829T191955Z.md), all resolved
-- here:
--
-- CRITICAL — the second version's `grant ... update, delete on public.jobs`
-- was unrestricted: combined with `jobs_owner_all`, an authenticated
-- client could delete a confirmed job outright (real audit-history data
-- loss) or rewrite `decision_id`/`farm_id`/`job_type` on an existing job
-- (provenance corruption — a "confirmed" job could be repointed at a
-- different decision entirely, or its farm changed). The stated
-- rationale ("status legitimately transitions") only ever needed the
-- `status` column. Fixed: `delete` is not granted at all (no delete
-- function exists in `jobs.ts` either, matching `decisions`' own
-- no-delete-ever posture), and `update` is granted **column-scoped** to
-- `status` only (`grant update (status) on public.jobs to authenticated`
-- — real Postgres column privileges, not a convention this schema
-- invented) — every other column stays genuinely immutable at the
-- database level even though the table nominally allows `update`.
--
-- HIGH — `insertJob` (`src/lib/farm-data/jobs.ts`) was not idempotent:
-- unlike `decisions.id` (client-generated once, so a retried insert with
-- the same id is detectably "the same decision"), `jobs.id` is
-- server-generated per insert — a retry after a lost response would mint
-- a fresh id and create a second, duplicate "confirmed" job for the same
-- decision, undermining the retry-safety `persistRecordWeightObservationAuditTrail`
-- (`act/index.ts`) claims. Fixed with the same shape as `decisions.id`'s
-- retry-safety: `jobs_decision_id_unique` below gives `jobs.decision_id`
-- a real uniqueness constraint (this checkpoint's model is genuinely
-- one-decision-to-one-job — `ARCHITECTURE.md`: "a job... a decision
-- turned into a real, trackable unit of work" — so this is a real
-- invariant, not an arbitrary restriction invented to make retries work),
-- and `insertJob` now catches the resulting `23505` and fetches-and-
-- returns the existing row by `decision_id` instead of failing, the same
-- pattern `insertDecision` already established.
--
-- HIGH — `insertDecision`'s `23505` handling (previous version) treated
-- *any* row with a matching `id` as proof of an identical retried
-- decision, without ever comparing content — a reused id for a genuinely
-- different decision (which should never happen, since `decideAsFarmer`
-- mints a fresh `crypto.randomUUID()` per decision, but "must not assume
-- application code is the only writer" applies to this class of bug too)
-- would have silently returned the *old* row, after which a job would be
-- created against provenance that never actually authorised the current
-- action. Fixed in `decisions.ts`: the existing row's full content is now
-- compared field-for-field (a small local `jsonValuesEqual` helper, no
-- new dependency) against what was actually requested; a mismatch throws
-- a clear, fail-closed error instead of silently returning stale data.
--
-- HIGH — `persistRecordWeightObservationAuditTrail` (`act/index.ts`) took
-- `outcome`/`decidedBy` as separate parameters from `decision`, so a
-- caller could in principle pass a `decision` with one `outcome` and a
-- mismatched `outcome` argument, persisting a false "accepted" audit
-- record for what was actually a dismissed Decision. Fixed: both
-- exported functions now share one `assertWeightObservationDecisionIsActable`
-- guard that validates the real `Decision` object itself (outcome,
-- decidedBy, calculationKind, estimateSnapshot.status) — there is no
-- longer a separate `outcome`/`decidedBy` parameter to disagree with it.
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- Codex audit finding against this file's *third* version
-- (docs/farm-return-next/audit-logs/20260829T192805Z.md), resolved here:
--
-- CRITICAL — restated round 1's identical concern, sharper: no CHECK
-- constraint (however complete `decisions_estimate_snapshot_ok_shape` is)
-- can verify a shape-valid `value`/`evidenceState` is *truthful*, only
-- that it has the right shape — round 1 closed every *shape* gap that
-- constraint can close; it never could and still cannot close *this* one.
-- This is the fix the foundation migration's own header comment named as
-- the real one from the start, not attempted until now: route every
-- `decisions`/`jobs` write through one sanctioned RPC and revoke the raw
-- table-level `insert` grant entirely, rather than leaving it live
-- alongside a CHECK constraint — the foundation migration's own round 10
-- already established the identical judgment for the *read* side of this
-- exact question ("deferring a sanctioned writer does not make the
-- presently granted raw insert safe": a parallel raw grant undermines
-- whatever sits next to it). `insert_decision`/`insert_job` below are
-- `security definer` — the *first* such function in this schema (every
-- prior helper here, including this file's own `assert_field_belongs_to_farm`/
-- `decisions_check_field_same_farm`, is `security invoker`) — because
-- that is the only way an RPC can insert into a table `authenticated` has
-- no table-level grant on at all: a `security invoker` RPC still runs as
-- the calling role, which would hit the exact same missing-grant wall a
-- raw client insert does. Because `security definer` functions execute as
-- their owning role (which bypasses RLS the same way a service-role
-- connection does — RLS cannot be relied on inside one), both functions
-- re-implement the farm-ownership check RLS would otherwise have provided,
-- explicitly, as their own first statement (`CLAUDE.md`'s "never assume
-- application code is the only writer" applied with equal force to
-- "never assume RLS is the only enforcement layer inside a `security
-- definer` function"). Every CHECK constraint and trigger already on
-- these tables still applies unconditionally to any `insert`, including
-- one issued from inside these functions — this closes the "raw insert
-- bypass" concern specifically; it does not and cannot verify a `value`'s
-- truthfulness, the same acknowledged limit `decisions_estimate_snapshot_ok_shape`'s
-- own comment already names, restated here because it applies to this fix
-- too, not resolved by it.
--
-- **Superseded by this file's own fifth-round finding, below**: the fifth
-- round correctly rejected `execute`-granted-to-`authenticated` as still
-- reachable by any client credential regardless of `security definer` —
-- `insert_decision`/`insert_job` as described in this paragraph no longer
-- exist in this file; see the fifth-round section for what replaced them.
-- This paragraph is kept as an accurate record of what round 3 actually
-- shipped and why, not edited to pretend otherwise.
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- Codex audit findings against this file's *fourth* version
-- (docs/farm-return-next/audit-logs/20260829T193529Z.md):
--
-- CRITICAL — fixed. The fourth version's `grant update (status) on
-- public.jobs to authenticated` let any authenticated client transition
-- ANY of their own jobs' `status` to ANY of the five values at any time —
-- `proposed`, `confirmed`, `dismissed` in any order, with nothing
-- enforcing a real state machine (e.g. rewriting an already-`confirmed`
-- job back to `proposed`, corrupting completion history). No code this
-- checkpoint ever calls this grant (this checkpoint's one real caller,
-- `actRecordWeightObservation`, only ever *inserts* a job already
-- `confirmed` — nothing here updates one). Fixed the same way this
-- programme has repeatedly resolved "real gap, zero real consumer yet"
-- findings (`estimate_calibration`/`telemetry_events`/`jobs.target_type`,
-- all in `BLOCKERS.md`): **the grant is removed entirely**, not
-- replaced with a speculative transition-enforcing trigger designed
-- against a workflow (Vertical C's GPS job mode / Confirm stage) that
-- doesn't exist in this codebase yet and whose real transition rules
-- aren't known. Whichever vertical first needs to transition a job's
-- `status` after creation designs the real state machine (which
-- transitions are legal, whether a transition needs its own confirmation
-- step) against its own actual requirements, and adds the grant
-- (ideally itself RPC-gated, matching this file's own `insert_decision`/
-- `insert_job` precedent, not a raw column grant) alongside it —
-- `BLOCKERS.md` records this.
--
-- CRITICAL — deliberately deferred, not fixed, with real, specific
-- reasoning (not a rubber stamp): `insert_decision`/`insert_job`'s
-- `execute` grant to `authenticated` (previous round's fix) still lets
-- any authenticated client call either RPC directly, bypassing
-- `decideAsFarmer`/`actRecordWeightObservation` entirely, with a
-- shape-valid-but-fabricated `estimate_snapshot`/`edits`/etc. This is
-- real. It is also, on investigation, **not a gap this checkpoint
-- introduced, and not unique to `decisions`/`jobs`** — it is the
-- existing, systemic trust model of this entire application: every
-- other table in this schema (`farms`, `fields`, `housing`,
-- `livestock_groups`, `slurry_allocations`, `financial_assumptions`,
-- `supplier_quotes`, `livestock_individuals`, and — concretely, the
-- exact table `actRecordWeightObservation`'s own pre-existing, already-
-- shipped, already-audited `addWeightObservation` call writes through —
-- `livestock_weight_observations`) grants `select, insert, update,
-- delete` directly to `authenticated` with zero RPC gating and zero
-- service-role mediation (`20260828000000_init_farm_schema.sql`,
-- `20260828040000_individual_animals.sql`,
-- `20260828050000_supplier_quotes.sql` — verified by reading their
-- `grant`/`create policy` statements directly, not asserted). A client
-- with a valid session JWT can already bypass this entire Next.js app
-- and, say, insert a fabricated `livestock_weight_observations` row
-- claiming an animal weighs 900kg, with nothing beyond RLS/CHECK
-- constraints to stop it — the identical class of gap, on a table this
-- checkpoint never touched. Fully closing this for *any* table (not just
-- `decisions`/`jobs`) requires a service-role-mediated write architecture
-- (a separate, genuinely-secret service-role Supabase client used only
-- server-side, with `authenticated` granted nothing at all on the tables
-- it mediates) — grep across `src/lib/supabase/` confirms zero such
-- client exists anywhere in this codebase today. That is a real,
-- cross-cutting architectural change touching every `src/lib/farm-data/
-- *.ts` mutation in the app, not a `decisions`/`jobs`-scoped fix, and is
-- far outside this task's own explicitly-scoped brief (extend
-- `actRecordWeightObservation` and add exactly two new farm-data files).
-- `insert_decision`/`insert_job` stay exactly as hardened as the previous
-- round left them (RPC-gated, `security definer`, explicit ownership
-- checks, full CHECK-constraint shape validation) — a real, positive
-- improvement over every sibling table's plain grant, even though it does
-- not and structurally cannot close the one gap that would require a
-- whole-app service-role migration to close. Documented in `BLOCKERS.md`
-- as a real, evidenced, systemic, whole-app blocker — not silently
-- dropped, not conceded as fixed.
--
-- MEDIUM — `BUILD_STATE.json`/`IMPLEMENTATION_LOG.md` not yet updated in
-- the same commit as this work — real, being fixed in the same commit
-- that lands this migration (`AGENTS.md`'s own rule), not before (the
-- final round count/result had to be known first).
--
-- MEDIUM — `decisions.ts`/`jobs.ts` had no direct tests of their own
-- Supabase-calling logic (RPC argument mapping, `23505` retry-safety,
-- content-mismatch fail-closed behaviour) — every existing test in this
-- repo that touches a `server-only` Supabase mutation module mocks the
-- *whole module* from its caller's side instead (confirmed by grep before
-- this round: zero prior test in this repo mocks `@/lib/supabase/server`
-- directly). Real, and the untested logic Codex named is genuinely new,
-- non-trivial branching this checkpoint added — not covered by that
-- convention having never needed it before. Fixed:
-- `src/lib/farm-data/decisions.test.ts`/`jobs.test.ts`, the first tests
-- in this repo to mock `@/lib/supabase/server` directly (a deliberate,
-- reasoned departure from the established convention, documented as such
-- in both files' own header comments) — covering the RPC call shape, a
-- non-conflict error propagating unchanged, `23505` recovery returning
-- the existing matching row, `23505` recovery failing closed on a content
-- mismatch, and a fetch error during recovery propagating.
-- ---------------------------------------------------------------------------
--
-- The grant itself (superseded by this file's own fifth-round finding
-- below, which removes the RPC write path entirely in favour of a
-- service-role client — this paragraph is kept as an accurate record of
-- round 4's state, not edited to pretend otherwise):
--
-- - decisions: `select` only, table-level — matches `decisions_owner_select`
--   (no `decisions_owner_update`/`_delete` policy exists, deliberately —
--   "a decision, once made, is a historical fact", the foundation
--   migration's own header comment). No table-level `insert` grant at
--   all.
-- - jobs: `select` only, table-level. No `insert`, no `update` (removed
--   this round — see this file's own fourth-round CRITICAL fix above; a
--   future vertical adds a real status-transition path once it exists to
--   design one against), no `delete`.
--
-- `jobs_check_same_farm`'s trigger function stays `security invoker` — the
-- foundation migration's own "GRANT DEPENDENCY" comment on that trigger
-- already named the consequence precisely: granting `select` on `jobs`
-- without also granting `select` on `decisions` would make every `jobs`
-- insert (now routed through `insert_job`, but the trigger itself is
-- unchanged) fail with a permission error instead of ever reaching the
-- ownership check. Both `select` grants ship together below, in the same
-- migration, for exactly that reason (the new
-- `decisions_check_field_same_farm` trigger this file adds has the
-- identical dependency on `select` on `fields`, already granted to
-- `authenticated` since the initial schema migration).
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (independently
-- confirmed live by the product owner, 2026-09-01) and, as of 2026-09-02
-- (Phase A, decisions/jobs real Dev-database validation), genuinely
-- live-validated: `supabase/validation/decisions_jobs_rls_validation.sql`
-- run for real via the Supabase CLI against this project, 29/29 checks
-- PASS, 0 FAIL, 0 SKIP, via two real authenticated sessions (User A
-- owning Farm A, User B owning Farm B; the anon/authenticated Supabase
-- key is the only kind any real browser session ever holds, so this is
-- the complete real threat model, not a proxy for it). Full account:
-- `docs/validation/decisions-jobs-dev-validation.md`. Every invariant the
-- checklist below names was confirmed, not merely reasoned about:
--
-- POSITIVE — User A, authenticated: CAN `select` a `decisions`/`jobs` row
-- on Farm A; CAN `insert` a `decisions` row on Farm A whose
-- `estimate_snapshot` has `status: "OK"`, a `value` key, and a real
-- `evidenceState`; CAN `insert` a `jobs` row on Farm A referencing a
-- `decisions` row that already exists on Farm A.
--
-- NEGATIVE (User A cannot act on Farm B / User B's rows — the review's
-- explicit brief, rule 8):
-- - User A's `select` on `decisions`/`jobs` returns zero rows for Farm B
--   (`decisions_owner_select`/`jobs_owner_all`'s `using` clause) — User A
--   cannot read a Decision/Job belonging to User B.
-- - User A's `insert` on `decisions`/`jobs` with `farm_id` set to Farm B
--   is rejected by Postgres with a permission/RLS error
--   (`decisions_owner_insert`/`jobs_owner_all`'s `with check` clause) —
--   User A cannot create a Decision/Job against a farm they don't own by
--   changing `farm_id` in the request, even though the row would
--   otherwise be shape-valid.
-- - User A's `insert` on `decisions` with a real Farm-A `farm_id` but a
--   `field_id` belonging to a field on Farm B is rejected by
--   `decisions_check_field_same_farm` — `farm_id` alone being correct is
--   not enough if a nested reference points elsewhere.
-- - User A's `insert` on `jobs` with a real Farm-A `farm_id` but a
--   `decision_id` belonging to a decision on Farm B is rejected by
--   `jobs_check_same_farm` — identical reasoning, for `jobs`' own
--   cross-table reference.
-- - User A's `update`/`delete` on any `decisions` row (their own or
--   User B's) is rejected — no such grant exists on this table at all,
--   for any role reachable by a client credential.
-- - User A's `update`/`delete` on any `jobs` row (their own or User B's)
--   is rejected — no such grant exists on this table at all either
--   (`jobs_owner_all`'s RLS policy nominally allows `all`, but the
--   table-level grant below only ever includes `select, insert` — RLS is
--   a ceiling, the grant is what's actually reachable).
-- - Every check above holds with the anon key (no session at all) too —
--   `revoke all on public.decisions, public.jobs from anon` (this file's
--   own earlier foundation migration) — an unauthenticated request gets
--   nothing.
--
-- SHAPE (independent of which authenticated user performs the insert):
-- an accepted/edited `decisions` insert whose `estimate_snapshot` is
-- missing `value`/has an invalid `evidenceState` is rejected by
-- `decisions_estimate_snapshot_ok_shape`; a second `jobs` insert for the
-- same `decision_id` is rejected by `jobs_decision_id_unique`.
--
-- No privileged/service-role credential is used, tested, or required
-- anywhere in this checklist — see `decisions.ts`/`jobs.ts`'s own header
-- comments and `docs/farm-return-next/BLOCKERS.md` for why.

alter table public.decisions
  add column field_id uuid null references public.fields (id),
  add column calculation_version text null,
  add column inputs_snapshot jsonb null;

comment on column public.decisions.field_id is
  'Mirrors Decision.fieldId (src/orchestration/decide/index.ts) at decision time -- present only for a Prompt scoped to one field. Same-farm-enforced by decisions_check_field_same_farm below, the same pattern jobs.decision_id already uses.';
comment on column public.decisions.calculation_version is
  'Mirrors Decision.calculationVersion -- present only when the originating Prompt carried one.';
comment on column public.decisions.inputs_snapshot is
  'Mirrors Decision.inputsSnapshot (deep-cloned at decision time, same discipline as estimate_snapshot) -- present only when the originating Prompt carried one.';

-- ---------------------------------------------------------------------------
-- decisions_estimate_snapshot_ok_shape: closes the CRITICAL above. An
-- accepted/edited decision's estimate_snapshot must have status "OK", a
-- `value` key (any value, including a JSON null -- EngineOutcome<T>'s
-- `value: T` is legitimately nullable, e.g. a Prompt with no numeric
-- payload), and an `evidenceState` matching one of
-- src/domain/evidence.ts's six real EvidenceState values. Every branch
-- uses the jsonb `?` key-exists operator (a real boolean, never NULL) as
-- the guard before any `->>` text comparison, so a missing key is a real
-- FALSE through the whole `and` chain -- not a silent NULL pass, the exact
-- Postgres CHECK semantics bug round 8 of the foundation migration's own
-- audit history already found and fixed once (`IS NOT DISTINCT FROM`
-- there; the `?`-operator guard achieves the same NULL-safety here).
-- ---------------------------------------------------------------------------
alter table public.decisions
  add constraint decisions_estimate_snapshot_ok_shape check (
    outcome = 'dismissed'
    or (
      estimate_snapshot ? 'status'
      and estimate_snapshot ->> 'status' = 'OK'
      and estimate_snapshot ? 'value'
      and estimate_snapshot ? 'evidenceState'
      and estimate_snapshot ->> 'evidenceState' = any (
        array['MEASURED', 'DERIVED', 'IRISH_MODEL', 'IRISH_DEFAULT', 'GENERIC_FALLBACK', 'INSUFFICIENT']
      )
    )
  );

-- ---------------------------------------------------------------------------
-- decisions_check_field_same_farm: closes the HIGH above's cross-farm
-- exposure on the new field_id column. Identical shape to the foundation
-- migration's own assert_decision_belongs_to_farm/jobs_check_same_farm.
-- ---------------------------------------------------------------------------
create or replace function public.assert_field_belongs_to_farm(p_field_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.fields where id = p_field_id and farm_id = p_farm_id) then
    raise exception 'field % does not belong to farm %', p_field_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.decisions_check_field_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.field_id is not null then
    perform public.assert_field_belongs_to_farm(new.field_id, new.farm_id);
  end if;
  return new;
end;
$$;

drop trigger if exists decisions_field_same_farm on public.decisions;
create trigger decisions_field_same_farm
  before insert on public.decisions
  for each row execute function public.decisions_check_field_same_farm();

-- ---------------------------------------------------------------------------
-- jobs_decision_id_unique: closes this file's own second-round HIGH above
-- (insertJob's retry-safety). Also a real, correct invariant on its own
-- terms, not merely a means to make retries idempotent: this checkpoint's
-- model is genuinely one decision -> at most one job
-- (`ARCHITECTURE.md`'s "a job... a decision turned into a real, trackable
-- unit of work" -- singular).
-- ---------------------------------------------------------------------------
alter table public.jobs
  add constraint jobs_decision_id_unique unique (decision_id);

-- ---------------------------------------------------------------------------
-- Codex audit finding against this file's *fifth* version
-- (docs/farm-return-next/audit-logs/20260829T194336Z.md) — resolved *at
-- the time* by removing the RPC write path this file's third round
-- added, and routing `insertDecision`/`insertJob` through a new
-- service-role client (`src/lib/supabase/service-role.ts`) instead.
--
-- CRITICAL — `insert_decision`/`insert_job`'s own `execute` grant to
-- `authenticated` meant any authenticated client could still call either
-- RPC directly, bypassing `decideAsFarmer`/`actRecordWeightObservation`
-- entirely, with a shape-valid but fabricated payload. This round
-- explicitly, correctly rejected the previous round's deferral reasoning
-- ("every sibling table has the identical exposure") as insufficient for
-- these two tables specifically. No CHECK constraint, RPC-with-execute-
-- granted-to-`authenticated`, or `security definer` ownership check
-- inside such an RPC can close this — every one of those still requires
-- `authenticated` to be able to reach the function at all, and any
-- credential `authenticated` can obtain (a real user's own session JWT)
-- can call anything granted to that role, by REST directly, regardless
-- of what this app's own Next.js server code does or doesn't expose in
-- its UI. That specific technical claim is correct and remains part of
-- the record — see the sixth-round entry below for why it was decided
-- not to be the right basis for this schema's actual architecture.
-- ---------------------------------------------------------------------------
--
-- ---------------------------------------------------------------------------
-- **Sixth round — a dedicated architectural security review (not a Codex
-- audit round; a human-directed review of this checkpoint's whole
-- persistence design against Farm Return's existing authenticated+RLS
-- architecture), superseding the fifth round's service-role fix. Full
-- account in `docs/farm-return-next/BLOCKERS.md`'s "Decisions/jobs
-- persistence: service-role reverted to RLS" entry; summarised here
-- because it changes what this migration actually ships.**
--
-- The fifth round's technical premise is correct: a client holding a real
-- user's session JWT can call anything granted to `authenticated`
-- directly via REST, bypassing this app's own server code entirely. What
-- the fifth round did not establish is that this is a `decisions`/`jobs`-
-- specific problem, or that a service-role client is the right way to
-- close it. Neither holds up:
--
-- 1. It is not `decisions`/`jobs`-specific. Every other table in this
--    schema (`farms`, `fields`, `livestock_weight_observations`, etc.)
--    grants `insert`/`update` directly to `authenticated` with zero RPC
--    gating and zero service-role mediation — the fourth round's own
--    CRITICAL already established this by direct inspection of those
--    migrations' grant statements, not asserted. A farmer forging their
--    *own* farm's `decisions` row via direct REST is real, but it is the
--    same class of gap as a farmer forging their own farm's
--    `livestock_weight_observations` row the same way — an accepted,
--    systemic property of this whole app's RLS-only architecture, not
--    something this one checkpoint's persistence module should close
--    unilaterally by introducing this codebase's first privileged
--    credential.
-- 2. A service-role client does not actually close the underlying concern
--    either. The real worry — "a farmer inserts a shape-valid but
--    fabricated Decision, so the record no longer proves
--    `SCIENTIFIC_RULES.md`'s science-before-AI discipline was followed" —
--    is about payload *truthfulness*, not which Supabase role performs
--    the write. `decisions_estimate_snapshot_ok_shape`'s own comment
--    already concedes no CHECK constraint (and, by the identical
--    argument, no service-role-mediated insert) can verify that a
--    structurally valid `estimate_snapshot`/`edits` payload is truthful,
--    only that it has the right shape. Routing the insert through
--    `insertDecision`/`insertJob` privileged rather than RLS-respecting
--    raises the bar from "any client with a session JWT can call this
--    directly" to "a bug in this app's own server code is required" —
--    but that second bar is exactly the one every other mutation in this
--    app already sits behind, service-role or not.
-- 3. It is a real defense-in-depth regression. With a service-role
--    client, `insertDecision`/`insertJob`'s own manual farm-ownership
--    `select` becomes the *only* enforcement layer against a cross-farm
--    write — `service_role` is RLS-exempt at the database level by
--    design, so a bug in that one manual check has no RLS backstop at
--    all. With the plain session client (what this migration now
--    grants), that same manual check and `decisions_owner_insert`/
--    `jobs_owner_all`'s database-level `with check` are independent: a
--    bug in one does not defeat the other. This is `CLAUDE.md`'s "never
--    assume application code is the only writer" applied to this
--    checkpoint's own code, not just to a hypothetical external client.
--
-- Per the review's explicit brief ("a normal signed-in farmer creating/
-- updating their own Decision or Job should use the authenticated
-- Supabase client and RLS, not a privileged client that bypasses RLS"),
-- and per Supabase's own stated direction away from the legacy
-- `service_role` key: `src/lib/supabase/service-role.ts` is removed
-- entirely, and `insertDecision`/`insertJob` perform their insert through
-- the same RLS-respecting session client used for the ownership
-- pre-check — see those files' own header comments. The systemic,
-- whole-app "any authenticated client can forge their own farm's data
-- via direct REST" gap the fifth round named is real and unresolved, but
-- it is not new, not unique to these two tables, and not something a
-- single checkpoint's persistence module should close by introducing a
-- new privileged credential ahead of a real, reviewed, whole-app
-- decision to do so.
--
-- `decisions_estimate_snapshot_ok_shape`/`decisions_check_field_same_farm`/
-- `jobs_check_same_farm`/`jobs_decision_id_unique` all still apply
-- unconditionally to any insert regardless of which role performs it
-- (CHECK constraints and triggers are role-independent) -- nothing about
-- this round's reversal loosens any of them.
-- ---------------------------------------------------------------------------
--
-- The grant itself. `select, insert` — table-level, to `authenticated`,
-- on both tables — the "one-line forward-only migration" the foundation
-- migration's own header comment anticipated, restored to what it
-- originally described. No `update`/`delete` grant on `decisions` at all
-- ("a decision, once made, is a historical fact" — that migration's own
-- header comment; `decisions_owner_select`/`decisions_owner_insert` are
-- the only two policies that table has ever had, matching this grant
-- exactly). No `update`/`delete` grant on `jobs` either, even though
-- `jobs_owner_all`'s RLS policy itself covers `all` — a real status
-- transition path is a future vertical's own scoped addition (see the
-- fifth-round section above and `BLOCKERS.md`), not shipped speculatively
-- here; the RLS policy being broader than the grant is the same pattern
-- every table's grant already narrows RLS's ceiling down to only what
-- has a real caller.
-- ---------------------------------------------------------------------------
grant select, insert on public.decisions to authenticated;
grant select, insert on public.jobs to authenticated;
