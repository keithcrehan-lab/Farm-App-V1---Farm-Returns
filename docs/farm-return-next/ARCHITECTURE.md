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

- `jobs` — an Act-stage record: what was decided, which field/entity it
  targets, status (proposed/scheduled/in_progress/confirmed/dismissed),
  farm_id-scoped RLS identical to every existing table.
- `telemetry_events` — raw Observe-stage phone events (GPS point/track,
  timestamp, accuracy), farm_id-scoped, short-retention by default (a
  location trail is not a permanent record the way a soil test is —
  retention policy is a `BLOCKERS.md` open question).
- `decisions` — the farmer's response to a Prompt (accept/edit/dismiss),
  linking a `jobs` row to the Estimate that produced its suggestion, so
  Learn can reconcile Estimate vs Actual per decision.
- `estimate_calibration` — Learn's output: a per-calculation-type
  confidence adjustment, versioned like everything else. **Never** a table
  the Estimate stage's domain functions read a substitute number from —
  see `SCIENTIFIC_RULES.md`.

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
