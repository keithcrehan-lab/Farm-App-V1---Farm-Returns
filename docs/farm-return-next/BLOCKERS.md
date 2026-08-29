# Farm Return Next — blockers

Documented, not silently worked around, per `BUILD_PLAN.md`'s autonomy
rules: a blocked subsystem is recorded here with enough detail to resume,
and other unblocked work continues. Mirrors the discipline
`docs/real-mode-completion/COMPLETION_REPORT.md`'s "Remaining external
blockers"/"Deliberately deferred work" sections already established for
V1 — carried-over V1 blockers are listed here only where they now also
constrain a Next feature; see that file for the full V1 list.

## Carried over from V1 (still open, now also gate Next features)

- **No automated market-price feed** — confirmed blocker (V1
  `COMPLETION_REPORT.md`). Gates: any Next Prompt that would suggest a
  bulk-buy/timing decision based on price movement.
- **No sourced silage yield/DM-conversion data** — confirmed blocker.
  Gates: any Next Prompt/job around silage cutting timing.
- **Met Éireann forecast commercial licence** — pre-existing. Gates:
  weather-window Prompts beyond the observation-based (non-forecast) data
  V1 already has live.
- **Fertiliser price not yet in the price-resolution hierarchy**
  (`nutrients.ts`'s Green Book/NAP prices are still a code constant,
  deliberately deferred in V1's P2 remediation priority) — gates any
  Next fertiliser-cost Prompt from being fully price-resolved.

## New to Next

- **No separate external architecture document.** `MASTER_SPEC.md`'s
  source is the product owner's chat brief (2026-08-29) alone. If a
  separate design/spec document exists outside this repo, it needs to be
  supplied and reconciled — until then `MASTER_SPEC.md` is treated as
  complete and authoritative, not a placeholder.
- **GPS job-mode offline conflict resolution undefined** — what happens
  when a job is Confirmed twice (once offline, once after a stale sync)
  or edited on two devices before either syncs. Gates: Vertical C
  (`BUILD_PLAN.md`) shipping anything beyond a single-device, single-
  Confirm happy path.
- **Notification channel/push infrastructure undefined** — no push
  provider, no in-app notification center exists yet. Gates: Vertical G.
- **Telemetry retention policy undefined** — how long a raw GPS
  `telemetry_events` row is kept before aggregation/deletion. Not a
  blocker for Checkpoint 1's schema (additive, forward-only either way)
  but must be decided before Vertical A ships to real farmers.
- **Satellite field intelligence provider/evidence base undefined** — no
  provider selected, no evidence-register entry exists for any vegetation/
  imagery model. Vertical H is expected to stay blocked (documented, not
  silently dropped) until a provider and evidence source are chosen — the
  same honest treatment V1 gave NDVI/satellite intelligence throughout
  (`docs/real-mode-completion/COMPLETION_REPORT.md`: "NDVI / satellite
  vegetation intelligence remains deliberately deferred").
- **Decide-stage auto-rule boundary has zero implemented rules yet.**
  `SCIENTIFIC_RULES.md` defines the boundary; no specific auto-rule has
  been proposed or reviewed against it. Not a blocker — a placeholder
  noting nothing should be assumed pre-approved just because the boundary
  exists.
- **Prompt's blocked-description isn't yet structurally enforced.** Codex
  audit finding (Medium), `docs/farm-return-next/audit-logs/20260829T002345Z.md`:
  a caller can construct a `Prompt` with a non-OK `basis` and a
  hand-written `description` that doesn't come from `describeBlockedBasis`,
  bypassing the "only sanctioned way" the module's own doc comment claims.
  Deferred rather than fixed immediately — nothing constructs a real
  `Prompt` yet (`prompt/` is still types-only). Gates: Vertical B must
  read this before adding its first real Prompt constructor and either
  add a smart-constructor guard or otherwise close the gap then, not
  carry it forward again.
- **`jobs` has no target-entity reference yet.** Codex audit finding
  (CRITICAL, `docs/farm-return-next/audit-logs/20260829T004238Z.md`): a
  first attempt at `target_type text`/`target_id uuid` columns had no
  same-farm ownership enforcement (Postgres has no single foreign key
  that can point into "one of several tables" depending on a sibling
  column's value), reopening the exact cross-farm gap
  `20260828070000_cross_farm_integrity.sql` closed. Removed rather than
  patched — enforcing ownership over a polymorphic target needs a real,
  agreed set of target entity kinds (field/animal/housing/...), which
  doesn't exist yet. Gates: Vertical C (Act/Confirm/GPS job mode) must
  decide that convention and add a properly same-farm-enforced target
  reference (most likely: one nullable FK column per real target kind,
  each with its own assert-belongs-to-farm trigger, mutually exclusive
  via a check constraint — the same shape this repo's existing
  polymorphic-ish cases avoid by simply not being polymorphic) before any
  `jobs` row can safely carry a target.
- **`estimate_calibration` isn't in the Checkpoint 1 migration.** Five
  Codex audit rounds on a draft version
  (`docs/farm-return-next/audit-logs/20260829T003659Z.md` through
  `20260829T005601Z.md`) repeatedly found real provenance/integrity gaps
  — missing NaN/Infinity rejection, an unenforced `sample_size`, a
  migration-breaking illegal CHECK subquery, a still-mutable table, and
  finally the one that settled it: real calibration provenance needs to
  reference confirmed Actuals, not just Decisions, and Actuals don't
  exist as a queryable concept anywhere in this schema yet. This exactly
  matches `BUILD_PLAN.md`'s own dependency table, written before any of
  this: Vertical F is gated on Vertical D's real Actuals. Gates: Vertical
  F must design this table for real once Vertical D exists, referencing
  actual confirmed-Actual records (not just `decisions`), before any
  Learn writer/reader is built — do not resurrect the deferred draft
  schema without addressing that gap.
- **`telemetry_events` isn't in the Checkpoint 1 migration either** — same
  reasoning as `estimate_calibration` above, one level simpler: no
  Vertical A code exists yet to consume it, and its retention policy
  (see the existing "Telemetry retention policy undefined" entry below)
  needs answering before the table is designed for real, not scaffolded
  ahead of that answer. Gates: Vertical A adds it when it starts.
- **`decisions.estimate_snapshot` is only partially validated at the
  database level, and both `decisions`/`jobs` have no client grant at
  all yet.** The `outcome = 'dismissed' or estimate_snapshot ->> 'status'
  IS NOT DISTINCT FROM 'OK'` check (migration
  `20260829000000_orchestration_foundation.sql`) rejects an
  accepted/edited row with the wrong/missing `status`, but not one with a
  missing `value` or an invalid `evidenceState`. First raised as a Codex
  audit HIGH (`docs/farm-return-next/audit-logs/20260829T011613Z.md`);
  round 10 (`docs/farm-return-next/audit-logs/20260829T012158Z.md`)
  correctly pushed back on deferring this alone while `authenticated`
  still had a live `insert` grant ("deferring a sanctioned writer does
  not make the presently granted raw insert safe"). Resolved by removing
  the grant entirely, not by deepening the CHECK constraint: neither
  table is `GRANT`ed to `authenticated` in this migration at all, so no
  client can read or write either table regardless of what a CHECK
  constraint does or doesn't catch — a stronger guarantee than a deeper
  CHECK would have given, and consistent with the "nothing consumes this
  table yet" reasoning that already deferred `estimate_calibration`/
  `telemetry_events`/`jobs`' target columns. The partial CHECK constraint
  itself is left in place as real defense-in-depth for whenever access is
  granted, not removed. Gates: whichever vertical builds the first real
  writer to `decisions` (Vertical B, most likely) adds the grant via its
  own forward-only migration alongside a real, designed write path — and
  should still route every write through one sanctioned Postgres
  function/RPC (never a raw client insert) that validates the full
  `EngineOutcome` shape once, in one place, rather than attempting to
  re-derive its validation rules in a bare CHECK constraint.
- **`/today` exists but isn't wired into navigation or any auth-redirect
  target yet.** `src/app/(app)/today/page.tsx` (Checkpoint 1's Today
  screen v0) is a real, working route — a literal re-export of
  `dashboard/page.tsx`, so it can never drift from it — but `nav-items.ts`,
  `proxy.ts`'s post-sign-in redirect, and every `redirect("/dashboard")`
  call site (sign-in/sign-up/onboarding/auth-callback, 7 files) still all
  target `/dashboard`, deliberately left untouched. Reason: every one of
  those already has a real, live-verified E2E assertion pinned to
  `/dashboard` specifically
  (`tests/e2e/real-mode-flow.spec.ts`'s `waitForURL("**/dashboard")`,
  twice) — repointing them now would risk that suite for a v0 screen that
  renders byte-identical content to the route it would replace, for no
  behavioural gain yet. Gates: the full IA cutover (nav relabelled
  "Today", every redirect retargeted, `tests/e2e/real-mode-flow.spec.ts`
  updated deliberately alongside it, `/dashboard` reduced to a thin
  redirect to `/today` or removed) belongs to whichever later checkpoint
  first gives Today real content that differs from Dashboard (Vertical B's
  real Prompts) — not before, and not silently.
