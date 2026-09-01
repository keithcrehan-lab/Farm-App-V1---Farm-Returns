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
│  V1 screens, reorganised under the locked Today/Farm/+/   │
│  Plan/Records IA (UX_DESIGN.md) + new GPS job mode (`+`)  │
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
  Estimate vs Actual per decision, and what Today's Prompt detail view
  (`UX_DESIGN.md` — no separate Activity screen) inspects. RLS policies
  are select+insert only (no update/delete — a
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
  phone events (GPS point/track, timestamp, accuracy), farm_id-scoped.
  **Retention policy decided (product-owner decision, 2026-09-01):**
  retain raw/high-frequency GPS observations for a maximum of 30 days;
  raw location history is never the permanent Farm Return record. Once a
  job is confirmed, the durable record is a separate, permanent, derived
  evidence row (not this table) — start/end time, fields, duration,
  distance, a simplified route/coverage geometry, machinery, activity,
  quantities, and the usual provenance/evidence/confidence metadata.
  `telemetry_events` rows must be deletable after their 30-day retention
  window without breaking that permanent record — the derived-evidence
  row, not the raw track, is what any other table (`jobs`, a future
  `estimate_calibration`) may reference. Exact column shape (a dedicated
  `telemetry_events` table plus a durable-evidence table/columns, vs. one
  table with a retention-eligible raw-geometry column) is Vertical A's own
  implementation decision, made against this retention/durability
  contract, not invented here ahead of it.
- `estimate_calibration` (Vertical F — Learn calibration) — Learn's
  output: a per-calculation-type confidence adjustment. Five audit
  rounds on a draft version repeatedly found real provenance/integrity
  gaps, the last of which correctly identified that real calibration
  provenance needs to reference confirmed Actuals, not just Decisions.
  Vertical D's `jobs.weight_observation_id` (shipped) now makes Actuals a
  genuinely queryable concept, but a sharper, still-open gap remains: no
  Prompt/Decision in this codebase yet predicts a *number* a later Actual
  could be compared against, so there is nothing real for
  `biasRatio` to calibrate against. **Do not fabricate a calibration
  system merely to complete this vertical** (product-owner instruction,
  2026-09-01) — designed for real only once a genuine numeric
  Estimate<->Actual pair exists somewhere in this app, per `BLOCKERS.md`.

Each of these follows the schema/RLS/trigger conventions
`supabase/migrations/20260828070000_cross_farm_integrity.sql` established:
`to authenticated`, `(select auth.uid())`, `anon` revoked, forward-only,
cross-table ownership enforced by trigger where a second foreign key
exists.

## Offline / GPS job mode

Phone connectivity in a field is unreliable by default — Confirm and
telemetry capture must queue locally and sync when the phone reconnects,
the same "local state responds immediately, a real write is separately
tracked" pattern `farm-store.tsx`'s `SyncStatusBanner` already established
for the fire-and-forget real-mode write path (P5, `docs/real-mode-completion/BUILD_LOG.md`).

**Architecture decided (product-owner decision, 2026-09-01):**

- **IndexedDB is the canonical client-side durable outbox/store** for
  offline-recorded events (GPS telemetry, Confirm actions, any other
  high-frequency capture) — a real transactional queue a browser tab
  reload/crash doesn't lose, not a cache.
- **A service-worker cache is not the primary transactional queue.** A
  service worker/Background Sync mechanism may attempt automatic
  flushing where the browser supports it, but the system must remain
  fully correct without Background Sync (Safari/iOS — the platform this
  phone-first product cannot assume away — has historically had
  incomplete Background Sync support; the queue's own correctness can
  never depend on it firing).
- The queue must support: persistent offline recording; retry after
  network failure; **deterministic event IDs/idempotency keys** (client-
  generated once, at record time — the same discipline
  `decisions.id`/`crypto.randomUUID()` already established server-side
  for `decideAsFarmer`, now required client-side too); **server-side
  duplicate protection** (the write endpoint must reject/no-op a replayed
  idempotency key, not merely trust the client never to retry
  incorrectly — `CLAUDE.md`'s "never assume application code is the only
  writer" applied to the client's own retry logic); clear, inspectable
  sync state (per-item, not just a single "syncing" boolean); partial-
  failure recovery (one failed item in a batch must not block or corrupt
  the rest of the queue); and no duplicate Job/Actual creation after a
  retry — matching `insertDecision`/`insertJob`'s own existing `23505`-
  retry-safety pattern (`src/lib/farm-data/decisions.ts`/`jobs.ts`),
  extended to a client-originated idempotency key rather than a
  server-generated one.
- **No silent last-write-wins for multi-device conflicts.** Real
  revision/version conflict detection is required — a write that targets
  a stale revision is rejected or flagged, not silently applied over a
  newer one. The existing, accepted record is preserved; a conflicting
  later write becomes an explicit amendment/conflict record, not an
  overwrite. A confirmed Actual must remain auditable — a later
  correction is a revision/amendment on top of the original, never a
  silent rewrite of historical evidence (the same "never overwrite
  provenance, only append a new value with `previous`" discipline
  `TrackedValue.previous` already establishes for every other tracked
  farm fact, `types.ts`).

Exact schema/API shape (the IndexedDB store's object structure, the
sync-queue table if one is needed server-side, the revision column on
`jobs`/wherever else a conflict can occur) is Vertical A/C's own
implementation work against this contract — not designed here ahead of
it, the same discipline every other "decided, not yet designed" item in
this file already follows.

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
