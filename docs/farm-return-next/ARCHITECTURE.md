# Farm Return Next — technical architecture

Companion to `MASTER_SPEC.md` (product) and `DOMAIN_CONTRACTS.md` (the
frozen interface surface this architecture must call, never reimplement).

## Stack (unchanged from V1)

Next.js (App Router), React, TypeScript, Tailwind, Supabase/Postgres,
Vitest, Playwright. No new framework is introduced for the orchestration
layer — it is more of the same stack, not a second application.

## Layering

```
┌─────────────────────────────────────────────────────────┐
│ UI (src/app, src/components)                             │
│  V1 screens, reorganised under Today/Farm/Plan/Records/   │
│  Activity IA (UX_DESIGN.md) + new GPS job mode            │
├─────────────────────────────────────────────────────────┤
│ Orchestration layer (NEW — proposed, not yet scaffolded)  │
│  src/orchestration/                                       │
│   observe/    — telemetry ingestion, event normalisation  │
│   prompt/     — Estimate output -> suggestion             │
│   decide/     — farmer decision capture                   │
│   act/        — decision -> job/record (calls farm-data)  │
│   confirm/    — job completion capture                    │
│   learn/      — estimate-vs-actual reconciliation          │
│                 (confidence calibration only)              │
├─────────────────────────────────────────────────────────┤
│ Domain layer (PRESERVED — src/domain/*.ts)                │
│  Estimate. Every calculation Next uses already exists      │
│  here or is added here the same way V1 additions were:     │
│  pure function + test + evidence-register entry.           │
├─────────────────────────────────────────────────────────┤
│ Persistence layer (PRESERVED — src/lib/farm-data/*.ts,     │
│  Supabase/Postgres, RLS)                                   │
│  Act writes through this layer's existing mutation          │
│  functions. New tables (jobs, telemetry, decisions) are     │
│  additive migrations following the same RLS/provenance      │
│  pattern as every V1 migration.                             │
└─────────────────────────────────────────────────────────┘
```

The orchestration layer is the only genuinely new architectural piece.
Everything below it in this diagram is frozen-baseline code called through
its existing exports.

## Data model additions (proposed — first BUILD_PLAN checkpoint scaffolds
these; nothing below is applied to any database yet)

**Shipped in the Checkpoint 1 migration**
(`20260829000000_orchestration_foundation.sql`):

- `decisions` — the farmer's response to a Prompt (accept/edit/dismiss),
  carrying an immutable copy of the Prompt's own `kind`/`basis`
  (`calculation_kind`/`estimate_snapshot`) at decision time, since a
  Prompt itself is never persisted — this is what lets Learn reconcile
  Estimate vs Actual per decision, and what Activity's trace view
  inspects. RLS policies are select+insert only (no update/delete — a
  decision, once made, is a historical fact) — but see the note below,
  no client can reach even that yet.
- `jobs` — an Act-stage record: what was decided (`decision_id`,
  required — a job always has an authorising decision), status
  (proposed/scheduled/in_progress/confirmed/dismissed), farm_id-scoped RLS
  identical to every existing table. Which field/entity a job targets is
  deliberately **not** in the Checkpoint 1 schema — a first attempt at a
  polymorphic `target_type`/`target_id` pair was found, by Codex audit, to
  reopen the exact cross-farm ownership gap
  `20260828070000_cross_farm_integrity.sql` closed (no enforcement existed
  for which table a given `target_type` actually pointed into); removed
  rather than patched, since a real fix needs an agreed set of target
  entity kinds that doesn't exist yet (`BLOCKERS.md`). Vertical C adds a
  properly-enforced target reference when it has one.

**Neither table is granted to `authenticated` yet.** RLS policies exist
and are correct for both, but this migration deliberately stops one step
short of making either table reachable by a real client — no app code
writes to either this checkpoint (Act writes straight to the existing
`livestock_weight_observations` table), and a Codex audit correctly
pointed out that a partial CHECK constraint on `estimate_snapshot` isn't
"safe" while a raw client insert is live regardless
(`docs/farm-return-next/BLOCKERS.md`). A future vertical adds the grant,
via its own one-line forward-only migration, alongside a real designed
write path — not before.

**Deferred to their owning verticals, not in the Checkpoint 1 migration**
— both were drafted and audited across several rounds
(`docs/farm-return-next/IMPLEMENTATION_LOG.md`), and both kept surfacing
real findings that trace back to the same root cause: neither vertical
that would actually use the table exists yet, so its real design
requirements aren't fully known. Removed rather than guessed at, per the
same call `jobs`' target columns needed:

- `telemetry_events` (Vertical A — Observe/telemetry) — raw Observe-stage
  phone events (GPS point/track, timestamp, accuracy), farm_id-scoped,
  short-retention by default. Retention policy is a `BLOCKERS.md` open
  question Vertical A needs answered before this table is designed for
  real.
- `estimate_calibration` (Vertical F — Learn calibration) — Learn's
  output: a per-calculation-type confidence adjustment. Five audit
  rounds on a draft version repeatedly found real provenance/integrity
  gaps, the last of which correctly identified that real calibration
  provenance needs to reference confirmed Actuals, not just Decisions —
  and Actuals don't exist as a queryable concept until Vertical D ships,
  exactly matching `BUILD_PLAN.md`'s own dependency ordering ("Vertical F
  ... gated on ... Vertical D (needs real Actuals)"). Designed for real
  once Vertical D exists to design it against, not before.

Each of these follows the schema/RLS/trigger conventions
`supabase/migrations/20260828070000_cross_farm_integrity.sql` established:
`to authenticated`, `(select auth.uid())`, `anon` revoked, forward-only,
cross-table ownership enforced by trigger where a second foreign key
exists.

## Offline / GPS job mode

Phone connectivity in a field is unreliable by default — Confirm and
telemetry capture must queue locally (IndexedDB / a service worker cache,
mechanism TBD at the relevant `BUILD_PLAN.md` checkpoint) and sync when the
phone reconnects, the same "local state responds immediately, a real write
is separately tracked" pattern `farm-store.tsx`'s `SyncStatusBanner`
already established for the fire-and-forget real-mode write path (P5,
`docs/real-mode-completion/BUILD_LOG.md`). Conflict resolution strategy
(two Confirms for one job, a job edited while offline) is an open question
— `BLOCKERS.md`.

## Reuse boundary — hard rule

An orchestration-layer module may **call** any exported function in
`src/domain/` or `src/lib/farm-data/`. It may **never** contain its own
copy of a calculation, threshold, or persistence query that duplicates
what one of those modules already does. If Next needs a calculation that
doesn't exist yet (e.g. a spreading-window Prompt score), it is added to
`src/domain/` as a new versioned module with tests and an evidence-register
entry — the exact same process V1 used for every calculation it has —
never inlined into `src/orchestration/`.

## Environments

Same as V1: `Farm Return V1 Dev` Supabase project via `.env.local`. Next
introduces no new environment. No migration in this build programme
targets production — see `CLAUDE.md`'s Next-specific never-rules and
`BUILD_PLAN.md`'s gating rules.
