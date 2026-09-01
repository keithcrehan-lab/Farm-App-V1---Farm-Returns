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
| A — Observe/telemetry | Phone GPS ingestion, IndexedDB offline outbox. Retention (30-day raw, permanent derived evidence) and offline architecture (IndexedDB canonical, no service-worker-only queue, revision-based conflict detection) decided 2026-09-01 — see `ARCHITECTURE.md`. **First increment shipped 2026-09-01**: `telemetry_events` migration (`PENDING_DEV_VALIDATION`) + `src/lib/farm-data/telemetry.ts` (idempotent, retry-safe insert) + `src/lib/offline/outbox.ts` (generic IndexedDB durable queue, real per fake-indexeddb tests). Real GPS-capture wiring (`navigator.geolocation`) and any job-mode screen deliberately deferred to Vertical C — see `ARCHITECTURE.md`'s own scoping note. | Checkpoint 1's `observe/` |
| B — Prompt/Decide surface | Real Prompt producers (4 shipped: `soil_test_age`, `spreading_window`, `commonage_status`, `local_buffer_override`), presented on Today (absorbed into Today per the locked IA, no separate Activity screen) | Checkpoint 1's `prompt/`/`decide/` |
| C — Act/Confirm/GPS job mode | Start Job → GPS Observe → Finish → Estimate → Confirm → Actual, entered via `+`. Strategic priority alongside A — get the first complete phone-GPS job loop working early. | Checkpoint 1's `act/`/`confirm/`, Vertical A's offline outbox |
| D — Records extension | Farmer-facing Records UI reading the real `decisions`/`jobs` rows Checkpoint 2's persistence work shipped. Buildable against the existing approved visual system now (`UX_DESIGN.md`) — no new design reference needed. | Checkpoint 1's `jobs` table (shipped, `PENDING_DEV_VALIDATION`) |
| E — Farm IA + fragmented land blocks | "Fragmented land blocks" (multiple distinct fields per farm, anywhere on the map) already fully supported by `FieldMap`'s existing per-field polygon projection, confirmed 2026-08-29, no code change needed. IA itself is now locked (`Today \| Farm \| + \| Plan \| Records`, product-owner decision 2026-09-01, `UX_DESIGN.md`) — only *final visual implementation* remains blocked, pending an approved design reference (`CLAUDE.md`'s screen workflow) — see `BLOCKERS.md`. | none (V1 contracts only) |
| F — Learn calibration | `estimate_calibration` writer/reader. Do not fabricate a calibration system to complete this vertical (product-owner instruction, 2026-09-01) — sequenced after a genuine numeric Estimate↔Actual pair exists anywhere in this app; none does yet (`BLOCKERS.md`). | Checkpoint 1's `learn/`, a real numeric Estimate↔Actual pair |
| G — Notifications | In-app is the canonical first channel (product-owner decision, 2026-09-01) — real lifecycle states (unread/viewed/acted-on/dismissed/expired), contextual/actionable content, built independent of any push vendor. Push is a future adapter, not a blocker. | Vertical B |
| H — Satellite field intelligence | Copernicus Data Space Ecosystem, Sentinel-2 L2A surface reflectance, behind a provider boundary (product-owner decision, 2026-09-01) — see `BLOCKERS.md` for the full evidence/provenance requirements. Field/vegetation intelligence only this phase; NDVI is never presented as direct biomass. | none |

**Build priority (product-owner decision, 2026-09-01), supersedes any
other implied ordering**: 1 — Vertical D (Records/Activity UI). 2 —
Vertical B (next genuine Prompt where real evidence exists). 3 —
Vertical A (GPS Observe + IndexedDB offline). 4 — Vertical C (complete
Start Job → GPS Observe → Finish → Estimate → Confirm → Actual loop). 5
— Vertical G (in-app notification engine). 6 — Vertical H (Sentinel-2
field intelligence). 7 — Vertical E (final visual implementation, once a
design reference exists). 8 — Vertical F (once a real numeric Estimate↔
Actual pair exists). **A and C are a strategic priority within this
order** — get the first complete phone-GPS job loop (Start Job → GPS
Observe → Finish → Estimate → Confirm → Actual) working as early as
safely possible after D and B's next slice.

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
