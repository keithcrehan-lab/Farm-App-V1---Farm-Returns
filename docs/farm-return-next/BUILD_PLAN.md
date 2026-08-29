# Farm Return Next — build plan

Live, authoritative plan. `BUILD_STATE.json` always names the current
checkpoint; this file is what a human or an agent reads to know what that
checkpoint means and what comes next. Update this file's checkpoint status
markers as work lands — do not let it drift from `BUILD_STATE.json` or
`IMPLEMENTATION_LOG.md`.

## Severity taxonomy (used by every quality gate / Codex audit)

- **Critical** — data loss, cross-farm data leakage, a fabricated number
  reaching a production (non-`sample_data`) screen, a security/RLS gap, a
  destructive migration, anything touching `main` or production.
- **High** — an incorrect calculation, a broken build/test/typecheck/lint,
  a `DOMAIN_CONTRACTS.md` violation (duplicated domain logic, a breaking
  contract change made without the protocol), a missing/incorrect
  provenance label on a real figure.
- **Medium/Low** — style, simplification, efficiency, non-blocking
  suggestions. Recorded, never gates progress on their own.

**Critical or High found at a checkpoint audit blocks progression past
that checkpoint until resolved.** Medium/Low do not block — they're logged
in `IMPLEMENTATION_LOG.md` and picked up opportunistically.

## Checkpoint 0 — autonomous framework (this session)

Establish and smoke-test the framework only — no product feature work.

Deliverables: `CLAUDE.md` (updated), `AGENTS.md`, this directory's eight
docs, `BUILD_STATE.json`, `scripts/quality-gate.sh`,
`scripts/codex-audit.sh`, `scripts/autopilot.sh`.

Exit gate: full quality gate green; one real Claude automation smoke test;
one real Codex automation smoke test; both reported honestly, including
any failure.

## Checkpoint 1 — contracts freeze + orchestration skeleton (sequential)

**Status: complete.** Exit gate met: quality gate green (983/983 tests,
typecheck/lint/build clean, 32 routes), Codex audit CRITICAL=0/HIGH=0,
`contracts_frozen` stays `true` (full account, all rounds:
`IMPLEMENTATION_LOG.md`). All three deliverables shipped: orchestration
skeleton, the `decisions`/`jobs` migration (`PENDING_DEV_VALIDATION` —
still needs the user to apply it to Dev), and Today screen v0. Getting
here took twelve real Codex audit rounds, not a rubber stamp — one
CRITICAL (a self-inflicted cross-farm regression, found and fixed same
session), several genuine HIGHs in the shipped code and the migration,
and the migration's own scope narrowing twice: `jobs.target_type`/
`target_id` and, more substantially, the entire `estimate_calibration`/
`telemetry_events` tables were drafted, repeatedly found to have real
gaps, and deferred to their owning verticals (F and A) rather than
patched indefinitely — this file's own dependency table said Vertical F
needed Vertical D's real Actuals first before any of this started;
repeated audit rounds confirmed it empirically rather than the deferral
being asserted without evidence. Checkpoint 2's parallel verticals may
now be delegated.

No parallel worktree delegation yet — `DOMAIN_CONTRACTS.md`'s frozen table
is the *existing* V1 surface, but the *new* orchestration contracts
(Observe/Prompt/Decide/Act/Confirm/Learn module interfaces) don't exist
yet and must be authored and stabilised by one agent/session before
anyone builds against them in parallel.

Deliverables:
- `src/orchestration/{observe,prompt,decide,act,confirm,learn}/` — typed
  interfaces and the thinnest possible real implementation (e.g. `act/`
  calling one existing `farm-data` mutation for one job type end-to-end),
  proving the layering in `ARCHITECTURE.md` actually works, not just
  documented.
- The `jobs`/`decisions` migration (originally scoped as four tables;
  `telemetry_events`/`estimate_calibration` deferred to Verticals A/F —
  see `BLOCKERS.md`), applied to Dev only (never production), validated
  the same way `20260828070000_cross_farm_integrity.sql` was — see
  `docs/real-mode-completion/BUILD_LOG.md`'s P10 entry as the template for
  what "validated" documentation looks like.
- Today screen v0: reuses Dashboard's existing content verbatim under the
  new IA (`UX_DESIGN.md`), no Prompt logic yet.

Exit gate: quality gate + Codex audit green, zero Critical/High open,
`BUILD_STATE.json.contracts_frozen = true`.

## Checkpoint 2+ — parallelisable verticals

Once Checkpoint 1 exits, each vertical below is independent enough to
delegate to an isolated worktree agent (`isolation: "worktree"`) — each
reads only frozen contracts (V1's `DOMAIN_CONTRACTS.md` table +
Checkpoint 1's new orchestration interfaces), writes only within its own
vertical's files, and does not touch another vertical's files or any
frozen contract's signature. A vertical needing a contract change stops
and escalates (documents in `BLOCKERS.md`, does not improvise) rather than
changing a frozen file itself.

| Vertical | Scope | Depends on |
|---|---|---|
| A — Observe/telemetry | Phone GPS ingestion, offline local queue | Checkpoint 1's `observe/`/`telemetry_events` |
| B — Prompt/Decide/Activity screen | Suggestion generation, Activity UI | Checkpoint 1's `prompt/`/`decide/` |
| C — Act/Confirm/GPS job mode | Job creation, GPS job mode UI | Checkpoint 1's `act/`/`confirm/`, Vertical A's offline queue |
| D — Records extension | Job/Confirm/Actual history in Records | Checkpoint 1's `jobs` table |
| E — Farm IA + fragmented land blocks | IA reshuffle, `FieldMap` multi-block rendering | none (V1 contracts only) |
| F — Learn calibration | `estimate_calibration` writer/reader | Checkpoint 1's `learn/`, Vertical D (needs real Actuals) |
| G — Notifications | Push/notification channel (channel TBD, `BLOCKERS.md`) | Vertical B |
| H — Satellite field intelligence | Provider/evidence TBD, `BLOCKERS.md` | none — likely blocked at time of writing |

## Autonomy / gating rules (all checkpoints)

- Minimise product-owner prompting — continue current/incomplete work
  automatically rather than stopping to ask when the answer is already in
  `MASTER_SPEC.md`/`ARCHITECTURE.md`/`DOMAIN_CONTRACTS.md`.
- Run focused tests continuously while implementing.
- Run the full quality gate (`scripts/quality-gate.sh`) at every
  checkpoint boundary, not just at the end.
- Run a Codex audit (`scripts/codex-audit.sh`) at every checkpoint
  boundary. Never skip an audit because Codex is unavailable — retry per
  `scripts/autopilot.sh`'s rate-limit handling; if genuinely unreachable
  for an extended period, document it in `BLOCKERS.md` as a blocked audit
  (not a skipped one) and continue other unblocked work while it's
  retried.
- Resolve all Critical/High findings before progressing past that
  checkpoint.
- Commit each passing checkpoint. Update `BUILD_STATE.json` and
  `IMPLEMENTATION_LOG.md` in the same commit.
- If a subsystem is blocked (missing evidence, an external dependency,
  an unresolved open question), document it in `BLOCKERS.md` with enough
  detail to resume, and continue other unblocked work — never stall the
  whole programme on one blocked subsystem.
- Never merge into `main`, never deploy production, never force-push or
  rewrite history, never make a destructive production database change —
  `CLAUDE.md`'s Next-specific never-rules, restated because they gate this
  plan specifically.
