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
- **DECIDED (product-owner decision, 2026-09-01) — telemetry retention
  policy.** Was: how long a raw GPS `telemetry_events` row is kept before
  aggregation/deletion, undefined — not a blocker for Checkpoint 1's
  schema (additive either way) but needed before Vertical A ships to real
  farmers. Decided: retain raw/high-frequency GPS observations for a
  maximum of approximately **30 days** (30 days plus up to one hour,
  given the enforcing job's hourly cadence — Codex audit HIGH round 2,
  below, corrected this from an original daily cadence that could have
  let a row survive up to a full extra day); raw location history is
  never the permanent
  Farm Return record. Once a job is confirmed, the durable record is a
  separate, permanent, *derived* evidence row — start/end time, fields,
  duration, distance, a simplified route/coverage geometry, machinery,
  activity, quantities, and the usual provenance/evidence/confidence
  metadata — not the raw track. `telemetry_events` rows must be
  deletable after their 30-day window without breaking that permanent
  record. See `ARCHITECTURE.md`'s `telemetry_events` section for the full
  account; exact column shape is Vertical A's own implementation decision
  against this contract. **Schema shipped 2026-09-01**
  (`20260901000000_telemetry_events.sql`, `PENDING_DEV_VALIDATION` — same
  no-database-network-access environment limitation as every other
  Checkpoint-2 migration, below). **Enforcement also shipped the same
  date**, as a real `pg_cron` job
  (`20260901010000_telemetry_events_retention_job.sql`,
  `PENDING_DEV_VALIDATION`) — a Codex audit HIGH,
  `docs/farm-return-next/audit-logs/20260901T140609Z.md`, correctly
  rejected this entry's own earlier "30-day maximum" framing as an
  overclaim while the schema migration alone deferred enforcement to an
  unnamed future task. Not yet *confirmed enforced live* until both
  migrations are applied and the job's own first real scheduled run is
  verified to have succeeded — see the retention migration's own
  validation checklist.
- **New (2026-09-01) — Vertical A's real `navigator.geolocation` capture
  wiring and Vertical C's job-mode screens are not yet built, by
  deliberate scoping decision, not an oversight.** The `telemetry_events`
  schema and the generic `src/lib/offline/outbox.ts` durable queue both
  shipped this same date — real, complete, tested substrate. Actually
  calling `watchPosition` and enqueuing real points needs a real trigger
  to attach to (a Start Job action), and any job-mode screen needs an
  approved visual reference (`CLAUDE.md`'s screen workflow) — neither
  exists yet. Building either now would risk exactly the premature,
  ungeneralised shape `jobs.target_type`/the first `estimate_calibration`
  draft were already found and removed for. Gates: Vertical C's own
  build-priority #4 slot, once Vertical E has an approved job-mode visual
  reference.
- **DECIDED (product-owner decision, 2026-09-01) — GPS job-mode offline
  conflict resolution.** Was: what happens when a job is Confirmed twice
  (once offline, once after a stale sync) or edited on two devices before
  either syncs — undefined, gated Vertical C shipping anything beyond a
  single-device, single-Confirm happy path. Decided: no silent
  last-write-wins. Real revision/version conflict detection is required —
  a write against a stale revision is rejected or flagged, not silently
  applied over a newer one; the existing accepted record is preserved and
  a conflicting later write becomes an explicit amendment/conflict
  record. A confirmed Actual must remain auditable — a correction is a
  revision on top of the original, never a silent rewrite of historical
  evidence, matching `TrackedValue.previous`'s existing "never overwrite
  provenance" discipline. See `ARCHITECTURE.md`'s "Offline / GPS job
  mode" section for the full contract (idempotency keys, server-side
  duplicate protection, partial-failure recovery, etc.) and IndexedDB
  decision below. Exact revision-column/conflict-record schema is
  Vertical C's own implementation work against this contract, not
  designed here.
- **DECIDED (product-owner decision, 2026-09-01) — offline queue
  architecture.** Was: IndexedDB / a service worker cache, mechanism TBD.
  Decided: **IndexedDB is the canonical client-side durable outbox/store**
  — a real transactional queue, not a cache. A service worker/Background
  Sync mechanism may attempt automatic flushing where the browser
  supports it, but **the system must remain correct without it**
  (Safari/iOS's historically incomplete Background Sync support cannot be
  assumed away on a phone-first product). Gates Vertical A's real
  implementation, not its design — this decision is the design. See
  `ARCHITECTURE.md`.
- **DECIDED (product-owner decision, 2026-09-01) — notification channel.**
  Was: no push provider, no in-app notification centre exists yet,
  channel undecided. Decided: **in-app is the canonical first channel.**
  Notification semantics and state (unread/viewed/acted-on/dismissed/
  expired lifecycle) are built independent of any push vendor.
  Notifications must be contextual and actionable ("Good spreading window
  tomorrow — Fields 3, 4 and 6"), never a generic data-update alert
  ("Rain forecast updated"). Push delivery is a future adapter/transport
  over the same canonical notification model — Vertical G is not blocked
  on choosing Firebase/OneSignal/etc. **Schema + persistence shipped
  2026-09-01** (`20260901020000_notifications.sql`, `PENDING_DEV_VALIDATION`,
  `src/lib/farm-data/notifications.ts`, `src/orchestration/notify/`) —
  see `ARCHITECTURE.md`'s dedicated entry for the full account.
- **New (2026-09-01) — notification expiry window (14 days) is a Farm
  Return operational default, not a confirmed product-owner decision.**
  Unlike `telemetry_events`' 30-day retention (a real, explicit
  product-owner decision), the 14-day figure the `notifications_expiry`
  `pg_cron` job (`20260901020000_notifications.sql`) uses was chosen as
  a reasonable placeholder with no explicit confirmation — flagged
  honestly rather than presented as decided, matching `CLAUDE.md`'s
  provenance discipline extended to an operational parameter, not just a
  scientific/regulatory one. Changing it is a one-line forward-only
  migration (the `cron.schedule` call's own interval), no other code
  depends on the specific number. Gates: nothing blocks on this — the
  job runs with the 14-day default until a real decision says otherwise.
- **New (2026-09-01) — no notification-centre UI exists yet, by
  deliberate scoping decision, matching Vertical A's own precedent.**
  The schema/persistence/lifecycle layer is real and complete; there is
  no screen yet that lists/consumes notifications, since Today's own
  approved visual reference doesn't exist yet either (`UX_DESIGN.md`'s
  "no approved reference images exist yet for Today/GPS job mode").
  Gates: Vertical E's final visual implementation (build-priority #7).
- **New (2026-09-01) — `notifications`' `insert` grant does not itself
  verify a notification's content came from a real `OK`-status Prompt,
  the identical, already-accepted, systemic limitation `decisions.ts`'s
  own header comment documents for `decisions.estimate_snapshot`.**
  Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
  20260901T150232Z.md`: `notificationFromPrompt`'s check protects the
  one real application code path this build session ships, but a client
  calling Supabase's REST API directly, bypassing that call stack
  entirely, could insert a shape-valid but fabricated notification. This
  is not unique to `notifications` — every table in this schema shares
  the same plain-RLS-not-privileged-write-path trust model, a whole-app
  architectural trade-off already reasoned through and accepted for
  `decisions`/`jobs`/`telemetry_events` (`decisions.ts`'s own header
  comment). Not yet a live risk (no notification-centre UI exists yet to
  render a fabricated row as if genuine, entry above). Closing it for
  real would mean a whole-app service-role-mediated write architecture,
  not a `notifications`-specific patch — out of scope for this vertical,
  the same conclusion already reached for `decisions`/`jobs`.
- **DECIDED (product-owner decision, 2026-09-01) — satellite field
  intelligence provider/evidence base.** Was: no provider selected, no
  evidence-register entry exists for any vegetation/imagery model.
  Decided: the official **Copernicus Data Space Ecosystem** (CDSE) as
  primary source, initial source **Sentinel-2 Level-2A** surface-
  reflectance imagery, via CDSE's current official STAC/data APIs, behind
  a provider boundary so the source can be replaced/supplemented later
  without rewriting the domain layer. Every derived observation must
  preserve real evidence/provenance where available: provider, mission,
  product/scene ID, acquisition timestamp, processing level, cloud
  information, field coverage, algorithm/index used, resulting value,
  confidence/quality, processing/version metadata — the same discipline
  `docs/evidence-register.md` already requires for every other production
  figure. Initial scope is field/vegetation intelligence; NDVI (or any
  other vegetation index) is never presented as direct grass biomass —
  precision biomass prediction stays out of scope unless genuine
  calibration evidence exists. Vertical H needs its own real
  `docs/evidence-register.md` entry before this build (V1's own
  "NDVI/satellite vegetation intelligence remains deliberately deferred"
  posture — `docs/real-mode-completion/COMPLETION_REPORT.md` — is what
  this decision now unblocks, not something it silently bypasses).
- **Decide-stage auto-rule boundary has zero implemented rules yet.**
  `SCIENTIFIC_RULES.md` defines the boundary; no specific auto-rule has
  been proposed or reviewed against it. Not a blocker — a placeholder
  noting nothing should be assumed pre-approved just because the boundary
  exists.
- **PARTIALLY RESOLVED — the three migrations are now applied to Farm
  Return V1 Dev, confirmed by the product owner from a real environment
  (2026-09-01); the RLS/negative-security validation half is not yet
  confirmed.** This build environment's own network limitation (below)
  never changed and was re-confirmed a third time when re-attempted
  (`npx supabase migration list` hung again, ~135s, plus two genuine
  zombie processes from earlier attempts found still running and killed)
  — the product owner applied the migrations from elsewhere, as this
  entry's own prior text anticipated. All three migrations' own status
  lines updated `PENDING_DEV_VALIDATION` -> `APPLIED_DEV`. **Not yet
  `VALIDATED_DEV`**: the real User A/User B cross-tenant RLS validation
  every migration's own checklist requires has not been run by anyone
  with database access yet — a ready-to-run script now exists,
  `supabase/validation/decisions_jobs_rls_validation.sql` (uses two of
  your own already-existing real farms via Supabase's own documented
  `SET LOCAL role authenticated` + `request.jwt.claims` RLS-testing
  technique — no new accounts, no passwords, wrapped in a transaction
  that always rolls back). This build environment cannot run it itself
  (same network limitation below, plus creating/authenticating as test
  accounts is a hard policy prohibition regardless of network access) —
  run it via the Supabase Dashboard's SQL Editor (or `psql`/`supabase db
  query` as the `postgres` role) and confirm every line reads PASS before
  updating any migration's status to `VALIDATED_DEV`.
  **Original network-limitation finding, still accurate, kept for
  the record:** the Supabase CLI (`npx supabase`) is genuinely
  authenticated in this environment and `supabase projects list` returns
  real project data, including one named exactly "Farm Return V1 Dev"
  (ref `whevugeisqlpfnrugfsd`) — independently confirmed as the correct
  target by cross-checking it against `.env.local`'s own configured
  `NEXT_PUBLIC_SUPABASE_URL` host, which matches that ref exactly (and no
  other project's). `supabase link --project-ref whevugeisqlpfnrugfsd`
  succeeds. But every command that needs to actually run SQL against that
  project's database — `supabase migration list`, and even `supabase db
  query --linked` (the Management-API-routed query path, not a direct
  Postgres connection) — hangs indefinitely with zero output, including
  under `--debug`, confirmed across three separate real attempts at
  different points this session. Two independently-routed paths
  (direct-TCP-implied and Management-API-proxied) both hung identically,
  pointing to a network egress restriction in this sandboxed environment
  rather than a credentials or project-identity problem.
- **RESOLVED (Checkpoint 2, Vertical B) — Prompt's blocked-description is
  now structurally enforced for every caller that constructs a `Prompt`
  through `buildPrompt`.** Was: Codex audit finding (Medium,
  `audit-logs/20260829T002345Z.md`) — a caller could construct a `Prompt`
  with a non-OK `basis` and a hand-written `description` that doesn't come
  from `describeBlockedBasis`. Resolution: `src/orchestration/prompt/
  index.ts`'s new `buildPrompt` smart constructor computes `description`
  for every non-OK `basis` internally, via `describeBlockedBasis`, and
  accepts no `description` parameter for that branch at all — there is no
  code path through `buildPrompt` for a caller to hand-write a mismatched
  one. `promptForSoilTestAge` (`src/orchestration/prompt/soil-test-age.ts`,
  the first real Prompt producer, per this checkpoint) uses it, and
  `src/orchestration/prompt/index.test.ts`'s `buildPrompt` suite +
  `soil-test-age.test.ts` both assert this structurally, not just by
  convention. Explicitly **not** airtight for every conceivable caller — a
  producer could still bypass `buildPrompt` and construct a `Prompt`
  object literal directly with a hand-written `description`; closing that
  fully would mean removing `description` from `Prompt`'s public shape
  entirely (e.g. a branded field only `buildPrompt` can set), a bigger
  interface change than this slice's scope — see `buildPrompt`'s own doc
  comment (`src/orchestration/prompt/index.ts`) for the full reasoning.
  Every Prompt producer this checkpoint ships goes through `buildPrompt`;
  a future producer that doesn't should be treated as a review finding
  against that producer, not evidence this guarantee never held.
- **`Prompt`/`Decision` gained `fieldId`/`calculationVersion` (Checkpoint
  2, Vertical B, additive).** `src/orchestration/prompt/index.ts`'s
  `Prompt` interface and `src/orchestration/decide/index.ts`'s `Decision`
  interface each gained two new optional fields:
  `fieldId?: string` (which real field's evidence a field-scoped Prompt
  presents — Codex audit HIGH, `audit-logs/20260829T085255Z.md`, on the
  first version of `promptForSoilTestAge`, which computed field-specific
  copy but carried no field identifier on the `Prompt` object itself) and
  `calculationVersion?: string` (the domain module version that computed
  `basis` — partial answer to a Codex audit HIGH,
  `audit-logs/20260829T090928Z.md`, on `Prompt`'s trace losing which
  calculation version produced it; mirrors `NutrientPlan.
  calculationVersion`'s existing precedent). Both changes are additive per
  `DOMAIN_CONTRACTS.md`'s protocol (existing fields unchanged, new fields
  optional, all existing tests pass unmodified, both are orchestration-
  layer types not in `DOMAIN_CONTRACTS.md`'s frozen `src/domain`/
  `src/lib/farm-data` table) — `contracts_frozen` was not flipped. Every
  real call site (`decideAsFarmer`'s `Pick<Prompt, ...>` parameter type,
  `actRecordWeightObservation` — unaffected, doesn't read either field)
  was updated in the same commit. See `IMPLEMENTATION_LOG.md`'s
  Checkpoint 2, Vertical B entry for the full account.
- **RESOLVED (Checkpoint 2, Vertical B) — a `Prompt`/`Decision`'s trace now
  carries a real snapshot of the raw inputs behind a compliance Estimate,
  not just the classified `EngineOutcome`.** Was: Codex audit HIGH across
  four rounds (`audit-logs/20260829T090928Z.md` through
  `20260829T094314Z.md`), arguing `SCIENTIFIC_RULES.md`'s "inspectable the
  same way `NutrientPlan`'s trace already is" clause requires the raw
  `sampleDate`/P-Index/legal-rule citation to survive independent of a
  later, possibly-changed `Field` lookup — correctly rejecting (three
  times) this checkpoint's earlier `NutrientPlan`-parity argument as an
  observation about a shared weakness, not an answer to whether the
  weakness itself is acceptable. Resolution: `Prompt`/`Decision`
  (`src/orchestration/prompt/index.ts`/`decide/index.ts`) gained a new
  additive field, `inputsSnapshot?: Record<string, unknown>` — a real,
  producer-populated snapshot of the raw values the domain call actually
  used, taken at Prompt-construction time and deep-cloned into the
  Decision (same discipline as `estimateSnapshot`). `promptForSoilTestAge`
  populates it with `sampleDate`/`rawPMgL`/`plannedUse`/`asOfDate` (the
  exact real values fed to `checkFieldSoilTestAgeValidity`) and `rule` (a
  human-readable statutory citation, `GFT011`-`GFT015`). This is
  genuinely additive to the frozen `EngineOutcome<T>` (`src/domain/
  evidence.ts` untouched) — no system-wide domain-layer redesign was
  needed; the earlier framing of this as requiring one was itself
  over-scoped. Tested in `index.test.ts`, `decide/index.test.ts`
  (including the independent-snapshot guarantee), and
  `soil-test-age.test.ts` (the real populated shape). A future Prompt kind
  that wants this same trace guarantee populates its own
  `inputsSnapshot` the same way — no further contract change needed.
- **RESOLVED (Checkpoint 2, Vertical B) — `checkFieldSoilTestAgeValidity`
  no longer reads a separately-tracked P-Index at all.** Was: Codex audit
  HIGH across two rounds (`audit-logs/20260829T091854Z.md`,
  `20260829T092808Z.md`) — an earlier version trusted
  `SoilFertility.pIndex` (optionally gated on `status === "verified"`),
  which is never structurally provable as having come from the specific
  `verifiedTest` record also being read, since `SoilFertility` has no
  field linking the two. Resolution: `checkFieldSoilTestAgeValidity`
  (moved to `src/domain/nutrients.ts` — see its own doc comment) now
  derives the Index fresh, every call, from `verifiedTest.p` (the raw mg/l
  reading — the *same* `SoilTest` object that carries `sampleDate`) via
  `pIndexFromMgL`, this module's own real, evidenced Green Book Table
  6-4/13-1 classifier, keyed by the field's real `plannedUse` (absent
  `plannedUse` fails closed, `MISSING_FIELD_USE_FOR_P_INDEX`, never
  defaulted to grassland — `types.ts`'s own `Field.plannedUse` rule).
  `pIndexFromMgL`'s own literal statutory micro-gap
  (`AMBIGUOUS_STATUTORY_BOUNDARY`) is propagated honestly, not resolved.
  The function's input type has no `pIndex` field at all any more — there
  is no remaining parameter through which a stale or differently-sourced
  Index could reach this calculation.
- **FINAL POSITION (Checkpoint 2, Vertical B, Round 16) —
  `calculateNutrientPlan`'s own `NutrientPlan.soilTestAgeValidity`
  deliberately still does NOT call `checkFieldSoilTestAgeValidity`, and
  this vertical is not the one that gets to make that change.** Codex
  audit HIGH across eight rounds (`audit-logs/20260829T092808Z.md`
  through `20260829T103905Z.md`) — `calculateNutrientPlan` reads
  `field.fertility.pIndex.value` directly and doesn't validate a
  malformed/future date, both looser than `checkFieldSoilTestAgeValidity`'s
  guards, so the same field can get two different real compliance
  answers depending which is asked. **This is a real, still-open
  correctness gap** — nothing below disputes that. What changed across
  this checkpoint's engagement with it is the understanding of who has
  standing to close it:
  - Round 8 made the change, verified only against this file's own test
    fixtures. Round 9 correctly rejected that as insufficient technical
    verification for a frozen contract and it was reverted.
  - Round 13 made the change again, this time verifying it properly —
    every real consumer of `NutrientPlan.soilTestAgeValidity` app-wide
    enumerated (`grep -rn "soilTestAgeValidity" src/` — this file's own
    NAP-downgrade sub-calculation and `real-alerts.ts`'s DISREGARD-alert
    check; no `src/app`/`src/components` file reads it directly), every
    real test fixture across the whole app checked by hand
    (`nutrients.test.ts`/`real-alerts.test.ts`/`reports.test.ts`), the
    full 1024-test app suite passing unmodified. This satisfied
    `DOMAIN_CONTRACTS.md`'s contract-change protocol's *technical*
    substance in full.
  - Round 16 identified the actual, decisive problem with that: it was
    still the wrong call to make. `AGENTS.md`'s "Parallel/worktree work"
    section is an **authority** rule, not a quality bar — "An agent that
    needs to change... the signature of anything in
    `DOMAIN_CONTRACTS.md`'s frozen table[, which explicitly lists
    `nutrients.ts` under "Nutrients & statutory gates"], stops and
    documents the need in `BLOCKERS.md` rather than making the change
    unilaterally." No depth of verification this single vertical performs
    on its own substitutes for the actual escalation that sentence
    requires — round 13's fuller verification was real, and still not
    this vertical's call to make alone. **Reverted a second time, this
    time for good**: `calculateNutrientPlan`'s inline computation is
    exactly what it was before this checkpoint began.
  - `checkFieldSoilTestAgeValidity` stays a real, tested, standalone
    export used only by `promptForSoilTestAge` — that part of this
    checkpoint's work is genuinely additive and unaffected by any of
    this.
  Gates: this is the actual escalation `AGENTS.md` asks for. Whoever has
  standing to authorise a change to `calculateNutrientPlan` (a frozen
  `DOMAIN_CONTRACTS.md` contract) — the product owner, or a checkpoint
  scoped explicitly to that change — should review round 13's verification
  record (preserved in this repository's history, `IMPLEMENTATION_LOG.md`'s
  Round 13 entry) as a real, reusable starting point, not a discarded
  attempt to redo from scratch.

  **Why this is scoped as a real, bounded deferral (matching this
  programme's own Checkpoint 1 precedent) rather than a live, shipped
  defect, restated after rounds 20/21 pressed on it further**: the
  divergence is real but **latent, not live** — `checkFieldSoilTestAgeValidity`
  has exactly one caller in the entire app, `promptForSoilTestAge`, which
  itself has zero callers in `src/app`/`src/components` (this slice was
  explicitly scoped as "domain/orchestration layer only... do not build
  any new screen, any Activity UI, any wiring into `src/app`" — the
  Activity screen that would eventually surface it is itself separately
  blocked, `BLOCKERS.md`'s `/today` entry, pending a design reference that
  doesn't exist yet). No farmer, and no other real code path, can compare
  these two calculations' answers for the same field today, because
  nothing in this checkpoint's shipped surface calls both. This is the
  same shape Checkpoint 1's own `estimate_calibration`/`jobs.target_type`
  deferrals had — real, evidenced, future-facing risk in code that exists
  but isn't yet reachable by a live flow — not a defect a real user could
  hit. It becomes a live risk only at the moment some future checkpoint
  wires `promptForSoilTestAge` into an actual screen a farmer sees
  alongside `NutrientPlan`-derived numbers — which is exactly the gate
  named above: whoever does that wiring is also the one with standing (and
  the actual occasion) to resolve `calculateNutrientPlan`'s side of this,
  either as part of that same checkpoint or immediately before it.
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
  **Sharper still-open blocker found (overnight autonomous build run,
  Phase 2, checked before considering Vertical F buildable now that
  Vertical D's own `jobs.weight_observation_id` makes Actuals genuinely
  queryable): the "Actuals aren't queryable" framing above is now
  technically resolved, but a deeper gap it didn't name is not.**
  `EstimateCalibration.biasRatio` (`src/orchestration/learn/index.ts`)
  is defined as a comparison between a *predicted number* and its later
  *actual number* — but every real Prompt/Decision this codebase has ever
  produced (`soil_test_age`, `spreading_window`,
  `record_weight_observation` itself) carries `estimateSnapshot.value:
  null` or a non-numeric classification (`"VALID"`/`"BASELINE_OPEN"`/
  etc.), never a predicted quantity. There is no real Estimate->Actual
  numeric pair anywhere in this app yet to calibrate against. Building
  `estimate_calibration` today would mean either shipping it with no real
  writer (dead scaffolding) or inventing a fake numeric-Estimate use case
  to exercise it — both real violations of "no placeholder functionality
  presented as complete" / "never invent product requirements." Gates:
  Vertical F needs a real Prompt kind somewhere in this app that predicts
  a number (a candidate: a future `record_weight_observation`-adjacent
  Prompt that estimates an animal's *expected* weight gain before the
  farmer records the *actual* one — not designed here, since inventing
  that Prompt purely to unblock Learn would itself be backwards-designing
  a product feature to serve infrastructure) before this table has a real
  case to be built against.
- **`telemetry_events` isn't in the Checkpoint 1 migration either** — same
  reasoning as `estimate_calibration` above, one level simpler: no
  Vertical A code exists yet to consume it. Its retention policy is now
  decided (see the "DECIDED ... telemetry retention policy" entry above)
  — the table can be designed for real once Vertical A starts, no longer
  scaffolded ahead of an undecided answer. Gates: Vertical A adds it when
  it starts.
- **RESOLVED (overnight autonomous build run, round 13 on this finding —
  see the entry's own history below for rounds 10-12) — a
  `record_weight_observation` `Job` now carries a real, database-enforced
  reference to the specific `WeightObservation` row that justified its
  `confirmed` status.** Originally: neither `decisions` nor `jobs`
  persists a reference to the real
  `WeightObservation` row a `record_weight_observation` job actually
  produced — a `Decision`/`Job` records the *input* (`edits`:
  `animalId`/`weightKg`/`observedDate`) but not the resulting row's own
  `id` (Checkpoint 2, Vertical D, Codex audit HIGH, round 10,
  `docs/farm-return-next/audit-logs/20260829T201958Z.md`). Real,
  investigated, deliberately deferred, not a rubber stamp: this is the
  same gap two *already-existing* entries in this file independently
  already named, from two different directions, before this checkpoint
  started —
  1. The `jobs` target-entity entry above (`target_type`/`target_id`,
     Codex audit CRITICAL, `docs/farm-return-next/audit-logs/
     20260829T004238Z.md`, Checkpoint 1) is about a job's *prospective*
     subject (which field/animal/housing it concerns) and was
     deliberately deferred to Vertical C pending "a real, agreed set of
     target entity kinds" — a generic, polymorphic design question.
  2. The `estimate_calibration` entry above is sharper and closer to
     this exact finding: real calibration provenance "needs to reference
     confirmed Actuals, not just Decisions, and Actuals don't exist as a
     queryable concept anywhere in this schema yet" — deferred to
     Vertical F, explicitly gated on Vertical D (this checkpoint)
     existing first, per `BUILD_PLAN.md`'s own dependency table.
  Round 10's finding is that same "Actuals aren't a queryable concept"
  gap, seen from the *write* side for the first time: this checkpoint is
  the first code in this app to ever create a real `Decision`/`Job`, and
  round 10 correctly observes that neither row can yet point at the real
  `WeightObservation` ("Actual") it resulted from. A one-off fix scoped
  to just this job type (e.g. a `jobs.weight_observation_id` column)
  would be exactly the premature, ungeneralized, single-job-type-specific
  schema decision the *target-entity* deferral above was already trying
  to avoid making before a real design exists — every future job type
  (a spreading run, a stock movement) would need its own Actual reference
  shape too, and inventing one now, for one type only, risks becoming the
  wrong shape once a real polymorphic-or-not design question is actually
  answered. `decisions.edits` was deliberately *not* extended to smuggle
  the resulting id in either — `edits` is the farmer-confirmed *input*
  provenance (`Decision.edits`'s own doc comment), and blurring it with a
  post-hoc *output* reference would corrupt that meaning for a future
  reader of the trace. Gates: whoever designs a real "Actual" concept for
  this schema (most likely Vertical F, when it needs to reference
  confirmed Actuals for calibration — see the `estimate_calibration`
  entry above) should treat this finding, and `record_weight_observation`
  as its first real concrete example, as part of that same design —
  not resolved piecemeal, job type by job type.
  **Round 11** (`docs/farm-return-next/audit-logs/20260829T202835Z.md`)
  restated this identical finding — explicitly acknowledging it is
  already "acknowledged but deferred in BLOCKERS.md" — with no new fact
  beyond suggesting the fix should use "the agreed generic Actual/target
  model," which is precisely the not-yet-designed thing this entry
  already names as the real prerequisite. Held, not re-litigated: the
  disagreement is about whether a real design gap should be improvised
  around versus designed properly by whoever owns that work next, not
  about any new technical detail either round surfaced.
  **Round 12** (`docs/farm-return-next/audit-logs/20260829T203310Z.md`)
  restated it a third time, verbatim in substance — its own wording is
  "The issue is acknowledged in BLOCKERS.md, but remains present in this
  diff," which is simply true of every deferred finding by definition and
  adds no new fact. Three consecutive rounds (10-12) producing zero new
  facts is treated here as real confirmation, not an assumption, that
  further rounds would only repeat this disagreement — matching this
  programme's own established precedent (Checkpoint 2, Vertical B's
  second slice, `spreading-window-gate.ts`'s own header/this file's
  "FINAL POSITION" entry) for when a real, evidenced, architectural
  disagreement is judged settled rather than indefinitely re-litigated.
  This slice's own audit history stops here for this finding.
  Round 12 also raised one new, real MEDIUM (non-blocking, logged not
  fixed, per `BUILD_PLAN.md`'s own severity taxonomy): `auditTrailError`
  has no real consumer anywhere in `src/` yet — true, and exactly the
  explicitly out-of-scope Records/Activity UI this task's own brief named
  ("No `src/app`/`src/components` file should change... don't build it").
  Restated verbatim (no new fact) by the overnight run's third audit
  round, `docs/farm-return-next/audit-logs/20260831T210311Z.md` — still
  logged, still non-blocking per the same taxonomy, still gated on the
  same not-yet-built consumer.
  A durable retry/outbox mechanism is one legitimate future design for
  that consumer once it exists; not designed here, since designing a
  consumer for a UI this task was explicitly told not to build would
  itself be scope creep in the other direction.
  **Round 13 (overnight autonomous build run, a fresh independent Codex
  audit against the security-reviewed persistence branch, not a
  restatement of rounds 10-12 — `docs/farm-return-next/audit-logs/
  20260831T204350Z.md`) restated the finding as a HIGH again, and on
  review this round is upheld and fixed, not held with rounds 10-12.**
  What changed: rounds 10-12's own reasoning was that the *generic*
  target-entity/Actual model shouldn't be pre-empted by a one-off,
  job-type-specific fix — correct, and still true. But re-examined here,
  that reasoning argued against inventing a *generic* design prematurely,
  not against ever adding a *narrow*, job-type-specific reference at all
  — and a narrow one does not carry the risk the deferral was actually
  protecting against (a wrong-shaped generic model). `jobs.weight_observation_id`
  (`supabase/migrations/20260829020000_jobs_weight_observation_reference.sql`)
  is exactly that: nullable, named after the one concrete job type it
  serves, same-farm-enforced, and additive with respect to any future
  general `target_type`/`target_id` design (which can supersede or
  backfill from it later without this column ever having blocked that
  design from being designed correctly). A same-round follow-up Codex
  audit (`docs/farm-return-next/audit-logs/20260831T205318Z.md`) found
  the new column itself under-constrained (nullable with no CHECK meant
  `authenticated`'s existing direct `insert` grant on `jobs` could still
  create a `confirmed` `record_weight_observation` job with no reference,
  or attach the column to an unrelated job type) — fixed in the same
  migration with two narrowly-scoped CHECK constraints
  (`jobs_confirmed_weight_observation_requires_reference`,
  `jobs_weight_observation_id_matches_job_type`), not deferred a second
  time. `persistRecordWeightObservationAuditTrail`
  (`src/orchestration/act/index.ts`) now passes the already-verified
  `observationId` through to `insertJob`
  (`src/lib/farm-data/jobs.ts`/`row-types.ts`/`mappers.ts` updated to
  carry it end-to-end), closing `SCIENTIFIC_RULES.md`'s inspectable-trace
  gap for real rather than continuing to log it as accepted-but-open.
  This does not resolve the *target-entity* deferral above
  (`target_type`/`target_id`) or the `estimate_calibration` entry's own
  broader "Actuals aren't a queryable concept" gap — both remain real,
  open, and correctly scoped to their own owning verticals (C and F);
  this fix only closes the one concrete instance those two entries had
  already named `record_weight_observation` as an example of.
- **RESOLVED (Checkpoint 2, Vertical D) — `decisions.estimate_snapshot`
  was only partially validated at the database level, and both
  `decisions`/`jobs` had no client grant at all yet.** The
  `outcome = 'dismissed' or estimate_snapshot ->> 'status' IS NOT
  DISTINCT FROM 'OK'` check (migration
  `20260829000000_orchestration_foundation.sql`) rejects an
  accepted/edited row with the wrong/missing `status`, but not one with a
  missing `value` or an invalid `evidenceState`. First raised as a Codex
  audit HIGH (`docs/farm-return-next/audit-logs/20260829T011613Z.md`);
  round 10 (`docs/farm-return-next/audit-logs/20260829T012158Z.md`)
  correctly pushed back on deferring this alone while `authenticated`
  still had a live `insert` grant ("deferring a sanctioned writer does
  not make the presently granted raw insert safe"). Checkpoint 1 resolved
  it by removing the grant entirely rather than deepening the CHECK
  constraint. Checkpoint 2, Vertical D (`src/lib/farm-data/decisions.ts`/
  `jobs.ts`, migration `20260829010000_decisions_jobs_client_access.sql`)
  is the real writer that migration's own comment anticipated, and did
  exactly what it asked: `decisions_estimate_snapshot_ok_shape` now
  validates `value` presence and `evidenceState` enum membership too (not
  just `status`), **and** every write is routed through
  `src/lib/supabase/service-role.ts`'s privileged client rather than a raw
  table grant reachable by any client — six real Codex audit rounds on
  this migration (`docs/farm-return-next/audit-logs/
  20260829T190434Z.md` through `20260829T194336Z.md`) pushed this from a
  plain re-grant, through a `security definer` RPC still reachable by any
  authenticated client, to the final service-role-mediated shape. See the
  migration's own header comment for the complete round-by-round account.

- **RESOLVED (Checkpoint 2, Vertical D, round 6) — a `security definer`
  RPC (`insert_decision`/`insert_job`) granted `execute` to `authenticated`
  could still be called directly by any authenticated client, bypassing
  `decideAsFarmer`/`actRecordWeightObservation`, with a shape-valid but
  fabricated `estimate_snapshot`/`edits`.** Real history, kept for the
  record rather than erased: this entry originally deferred the concern
  (round 5, Codex audit CRITICAL,
  `docs/farm-return-next/audit-logs/20260829T193529Z.md`) reasoning it
  was a systemic, whole-app limitation (every other table in this schema
  — `farms`/`fields`/`housing`/`livestock_groups`/`slurry_allocations`/
  `financial_assumptions`/`livestock_individuals`/
  `livestock_weight_observations`/`supplier_quotes` — grants raw
  `insert`/`update`/`delete` to `authenticated` with zero RPC gating
  either) too large to fix within this task's scope. Round 6
  (`docs/farm-return-next/audit-logs/20260829T194336Z.md`) correctly
  rejected that deferral as insufficient specifically for `decisions`/
  `jobs`: unlike, say, a wrong `livestock_weight_observations` row (bad
  data, bounded to being wrong), a forgeable `decisions` row undermines
  `SCIENTIFIC_RULES.md`'s entire science-before-AI discipline for the
  *one* table that exists to prove it was followed — a materially higher
  bar than "no worse than everything else." On reflection, a scoped
  (not whole-app) fix existed and was built: `src/lib/supabase/
  service-role.ts`, this codebase's first service-role Supabase client.
  `insertDecision`/`insertJob` now verify farm ownership on the regular,
  RLS-respecting client, then perform the actual insert through the
  service-role client — a credential no client (browser or direct REST
  caller) ever holds, deliberately not `NEXT_PUBLIC_`-prefixed. The
  `insert_decision`/`insert_job` RPCs (and their `execute` grant to
  `authenticated`) were removed entirely, not hardened further —
  `decisions`/`jobs` now grant `authenticated` `select` only, full stop.
  This *is* scoped to exactly this checkpoint's two write paths, not a
  whole-app migration — every other table's identical exposure (the
  systemic point round 5's deferral correctly identified) remains real
  and is **not** resolved by this fix; it is restated below as its own
  entry, since it's still true and still worth a future checkpoint's
  attention, just no longer this task's open blocker.
  `decisions_estimate_snapshot_ok_shape`/`decisions_check_field_same_farm`/
  `jobs_check_same_farm`/`jobs_decision_id_unique` all still apply
  unconditionally regardless of which role performs the insert (CHECK
  constraints and triggers are role-independent) — nothing about this fix
  loosened any of them.

- **REVERSED (dedicated architectural security review, after Checkpoint 2
  Vertical D shipped — not a Codex audit round) — Decisions/jobs
  persistence: service-role reverted to RLS.** The review's explicit
  brief: "For Decision and Job persistence, preserve Farm Return's
  existing authenticated-user + RLS architecture unless you can
  demonstrate a specific requirement that cannot safely be implemented
  through grants/RLS," and "a normal signed-in farmer creating/updating
  their own Decision or Job should use the authenticated Supabase client
  and RLS, not a privileged client that bypasses RLS." Round 6's
  service-role fix (entry above) was reviewed against that brief and
  reverted, for three real reasons, not a rubber-stamp reversal:
  1. The concern it closed (a client holding a real session JWT can
     insert/forge data for their own farm via direct REST, bypassing this
     app's own server code) is real, but is not `decisions`/`jobs`-
     specific — it is the identical, already-accepted, systemic trust
     model of every other table in this schema (the entry immediately
     below this one, restated as still-true). Closing it for two tables
     only, via this codebase's first privileged credential, address a
     narrow slice of a whole-app property without actually changing that
     property.
  2. A service-role client does not fully close the concern it was built
     for either — it cannot verify a payload's *truthfulness*, only that
     a caller reached trusted server code at all (the same acknowledged
     limit `decisions_estimate_snapshot_ok_shape`'s own comment already
     names). It raises the bar from "any client with a session JWT" to "a
     bug in this app's own server code," which is the bar every other
     mutation in this app already sits behind without a privileged
     credential.
  3. It is a real defense-in-depth regression: `service_role` bypasses
     RLS unconditionally, so `insertDecision`/`insertJob`'s own manual
     farm-ownership check became the *sole* enforcement layer instead of
     an independent second layer behind RLS's own `with check` — directly
     against `CLAUDE.md`'s "never assume application code is the only
     writer," applied to this checkpoint's own code.
  `src/lib/supabase/service-role.ts` (and its
  `SUPABASE_SERVICE_ROLE_KEY`/`requireSupabaseServiceRoleKey` support in
  `.env.example`/`env.ts`) is removed entirely — it no longer exists
  anywhere in this codebase. `insertDecision`/`insertJob`
  (`src/lib/farm-data/decisions.ts`/`jobs.ts`) now perform their insert
  through the same RLS-respecting session client used for the ownership
  pre-check. `20260829010000_decisions_jobs_client_access.sql` now grants
  `select, insert` (not `select` only) to `authenticated` on both tables
  — the "one-line forward-only migration" the foundation migration's own
  header comment originally anticipated, restored to what it described.
  Negative-security cases (User A cannot read/insert/update/associate a
  Decision/Job belonging to User B or an unauthorised farm) are covered
  by `decisions_owner_select`/`decisions_owner_insert`/`jobs_owner_all`
  (unchanged by this reversal — never touched by round 6 either) plus
  `decisions_check_field_same_farm`/`jobs_check_same_farm` for the
  cross-table references; `decisions.test.ts`/`jobs.test.ts` cover the
  application-level ownership pre-check and confirm no privileged client
  is imported; the migration's own updated validation checklist is what a
  human with database access runs to confirm the RLS/grant behaviour live
  (same disclosed no-live-DB limitation every migration in this branch
  already carries). `decisions_estimate_snapshot_ok_shape`/
  `decisions_check_field_same_farm`/`jobs_check_same_farm`/
  `jobs_decision_id_unique` — round 3/4's real, valuable schema
  hardening — are untouched by this reversal; only the write-path
  credential changed.

- **Every other table in this schema — not just `decisions`/`jobs` —
  still grants raw `insert`/`update`/`delete` to `authenticated` with
  zero RPC gating, including `livestock_weight_observations` (the exact
  table `actRecordWeightObservation`'s own pre-existing
  `addWeightObservation` call writes through).** Real, evidenced (verified
  by reading the actual `grant`/`create policy` statements, not asserted:
  `farms`/`fields`/`housing`/`livestock_groups`/`slurry_allocations`/
  `financial_assumptions` in `20260828000000_init_farm_schema.sql`,
  `livestock_individuals`/`livestock_weight_observations` in
  `20260828040000_individual_animals.sql`, `supplier_quotes` in
  `20260828050000_supplier_quotes.sql`) — and, per the architectural
  review above, `decisions`/`jobs` now sit in exactly this same category
  too, deliberately, rather than being singled out for a privileged-credential
  fix. This is this whole app's accepted, systemic RLS-only trust model,
  not a `decisions`/`jobs`-scoped gap — closing it for any table would
  require a genuine, reviewed, whole-app decision to introduce a
  service-role-mediated write architecture (which this codebase does not
  have today — `service-role.ts` was tried for two tables and removed;
  there is no reusable implementation to start from any more). Whoever
  first has standing to open that whole-application checkpoint should
  treat this entry and the concrete table list above as its starting
  evidence, and should design it fresh rather than resurrect the reverted
  pattern.
  **Restated as a CRITICAL by the overnight autonomous build run's third
  audit round against the merged-ready branch
  (`docs/farm-return-next/audit-logs/20260831T210311Z.md`), held, not
  reopened: no new fact, and its proposed remedy ("route writes through a
  server-controlled boundary" — i.e. a privileged/service-role/RPC write
  path) is the exact architecture the product owner's own explicit,
  reasoned instruction earlier this session directed away from** ("For
  Decision and Job persistence, preserve Farm Return's existing
  authenticated-user + RLS architecture unless you can demonstrate a
  specific requirement that cannot safely be implemented through
  grants/RLS"), and is explicitly listed as a hard boundary this
  overnight run may not autonomously cross ("Do not autonomously make or
  approve: a new privileged/service-role/secret credential architecture;
  weakening or bypassing RLS"). This is not a case of Claude overriding a
  Codex finding on its own authority — it is the identical question a
  human already reviewed, reasoned through across the original
  checkpoint's own rounds 4-6 plus a dedicated architectural review (this
  file's own entry above), and explicitly decided. `DOMAIN_CONTRACTS.md`/
  this file's own authoritative prior decision wins per this run's own
  triage rule ("If a Codex recommendation conflicts with Farm Return's
  authoritative contracts, the contracts win unless there is evidence the
  contract itself is wrong") — Codex's round-15 restatement supplies no
  such evidence, only the same argument already considered. Held at
  `open_critical_high_findings: 0` for this reason, documented rather
  than silently dropped, exactly as this entry already was before this
  round.
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
- **Why Vertical B's `src/domain/` additions this checkpoint are in
  scope, not a boundary violation — final position after five real
  rounds (10/14/16/17/18).** Codex audit HIGH, repeated and sharpened
  across those rounds: `BUILD_PLAN.md`/`AGENTS.md`'s parallel-work
  boundary means a vertical needing a `src/domain/` change should stop
  and escalate rather than changing frozen files.
  - **Settled at Round 16 — the one real behaviour-changing edit.** Two
    real attempts were made to wire `checkFieldSoilTestAgeValidity` into
    `calculateNutrientPlan` (rounds 8 and 13, round 13 with real, full
    app-wide verification), and both were reverted:
    `AGENTS.md`'s "stops and documents the need... rather than making the
    change unilaterally" is an *authority* rule, not answered by however
    thorough the *technical* verification is. `calculateNutrientPlan`
    reads `field.fertility.pIndex` exactly as it did before this
    checkpoint began — see this file's own dedicated entry above for the
    complete account.
  - **Settled at Round 18 — every remaining addition is now a genuinely
    new file, not new exports on an existing frozen one.** Round 17
    restated the question more broadly: even the *additive* changes
    (`checkFieldSoilTestAgeValidity` itself, the reason code,
    `yearsBetweenIsoDates`'s relocation) were, at that point, new exports
    added directly to the already-frozen `nutrients.ts`/
    `soil-test-validity.ts`. Round 18 drew the sharper, correct
    distinction: `DOMAIN_CONTRACTS.md`'s "New contracts this build
    programme adds" section authorises new `src/domain/` *modules*
    ("pure function, colocated test file... proposed, not frozen, until
    they ship") — not new exports grafted onto an existing frozen file.
    Resolved for real, not argued around: `checkFieldSoilTestAgeValidity`
    (with its own `FieldEvidenceForSoilTestAgeCheck` type and the
    `isValidIsoDate` helper) now lives in a genuinely new file,
    `src/domain/field-soil-test-age.ts` — it only ever *imports* from
    `nutrients.ts` (`pIndexFromMgL`, `cropGroupForFieldUse`,
    `yearsBetweenIsoDates`) and `soil-test-validity.ts`
    (`checkSoilTestAgeValidity`), every one a real, pre-existing,
    unmodified export, read the same way any other real caller reads
    them. `yearsBetweenIsoDates`'s relocation is fully reverted —
    it's back in `nutrients.ts` exactly where it always was (its
    algorithm was never changed by any of this, only its doc comment
    gained the real round-7/11 calendar-boundary analysis). The
    `MISSING_FIELD_USE_FOR_P_INDEX` reason code is no longer registered
    in `evidence.ts`'s `REASON_CODES` array at all — used as a plain
    string literal instead, since that registry is explicitly optional
    documentation (`evidence.ts`'s own doc comment: "a documentation aid,
    not a runtime restriction"), so registering it was never load-bearing
    and this avoids editing that file at all. **Net result**:
    `nutrients.ts`, `soil-test-validity.ts`, and `evidence.ts` are now
    byte-identical to `origin/farm-return-next` — this checkpoint touches
    zero frozen files. `promptForSoilTestAge` (the actual deliverable)
    still works exactly as before, now built entirely on one new,
    genuinely additive module plus the orchestration-layer files
    (`prompt/`, `decide/`) this vertical owns outright.

- **`closed-period-calendar.ts`'s statutory closed-period table has no
  evidenced "year of applicability," and nothing anywhere in this app
  rejects a date outside whatever year(s) that might be (Checkpoint 2,
  Vertical B, second slice) — built, audited, narrowed, and ultimately
  reverted across four real Codex audit rounds, a genuine self-correction
  worth recording in full, not smoothed into a single clean "resolved."**
  The underlying gap is real: `checkClosedPeriodCalendar`
  (`closed-period-calendar.ts`, frozen) compares only the mm-dd portion
  of its `date` input, so it applies `closed_periods_2026.csv`'s table to
  *any* year indefinitely — a query for a date far outside 2026 (e.g.
  `2035-09-20`) returns the same real, confident `compliance_value`
  answer a genuinely-current 2026 date would.
  - Codex audit HIGH, first raised (`audit-logs/20260829T140705Z.md`),
    answered with a documented deferral: no sourced "valid through" year
    exists, and this vertical has no authority to change the frozen
    calendar file itself.
  - Codex audit HIGH (`audit-logs/20260829T144928Z.md`) correctly
    rejected that deferral outright: "Documenting the limitation in
    `BLOCKERS.md` does not make the result fail closed." This prompted a
    real fix attempt: `source-register.ts`'s own real `checkedDate` for
    `LAW_IE_SI_588_2025` (`2026-08-26`) was used to derive a valid year
    range (the checked year, plus the whole immediately following year,
    reasoning that closed periods wrap across the calendar year).
  - Codex audit HIGH (`audit-logs/20260829T145652Z.md`) correctly
    narrowed that: accepting the *whole* following year would silently
    accept a brand-new, never-verified autumn cycle starting later in
    that same year too. Fixed by deriving the real latest
    `closedThroughMmDd` across every zone/material row from the frozen
    table itself (`02-14`), bounding the following-year acceptance to
    that real date.
  - Codex audit HIGH, two real findings (`audit-logs/20260829T150329Z.md`)
    — the round that actually settled it, by finding the whole approach
    unsound rather than merely imprecise: (a) a real, demonstrable bug —
    the boundary used the *global* latest `closedThroughMmDd` across
    every zone/material row rather than the *specific* row the query's
    own county/material resolve to, so e.g. Cork organic fertiliser on
    `2027-02-14` would have incorrectly passed the guard on the strength
    of a *different* zone/material's later end date; and (b), the
    decisive point, not fixable by narrowing further: `source-
    register.ts`'s `checkedDate` is bibliographic "statute last verified
    current" metadata — it does not measure which calendar year(s) the
    *specific extracted table* represents. This codebase's own repeated
    framing elsewhere (`real-alerts.ts`, `spreading/page.tsx`, this
    entry's own earlier drafts) is that NAP closed periods are, by the
    statute's own design, a *recurring annual mm-dd pattern*, not a
    year-specific one-off table that expires — if that's true, there is
    no real "year of applicability" to derive from any available source
    at all, and constructing one from real, already-recorded fields is
    still, in substance, inventing a regulatory boundary the evidence
    doesn't actually support — the same "never invent a production
    regulatory number" mistake `CLAUDE.md` forbids, one level more
    subtle than inventing a raw cutoff directly, and no more acceptable
    for being subtler.
  **Reverted, deliberately and for good, not narrowed a third time**:
  `checkSpreadingWindowGate` (`src/domain/spreading-window-gate.ts`)
  validates only that `date` is a real calendar date and delegates every
  real classification decision to the frozen `checkClosedPeriodCalendar`
  unmodified — exactly as it did before any of this year-range work
  began, and exactly matching `real-alerts.ts`/`spreading/page.tsx`'s own
  already-live behaviour. `source-register.ts` and
  `CLOSED_PERIOD_BY_ZONE_MATERIAL` are no longer imported by this module.
  This is a real, evidenced, **already-live** gap, not one this vertical
  introduced or can honestly close alone — the frozen-contract authority
  boundary this checkpoint respects everywhere else was never actually
  breached (every attempt only ever read from frozen files via import,
  never modified one), but a real evidentiary gap can't be closed by
  authority alone either, once it turns out the needed evidence simply
  doesn't exist yet.
  Gates: whoever has standing to open a `closed-period-calendar.ts`
  contract-change checkpoint (the product owner, or a checkpoint scoped
  explicitly to statutory-dataset revalidation/versioning across the
  whole app, not one Prompt producer) should design a real revalidation
  cadence with its own dedicated, dated evidence field tied to the
  *table itself* (e.g. "this specific closed-period extraction was
  confirmed to still apply as of `<date>`," distinct from
  `source-register.ts`'s existing statute-level `checkedDate`) — not
  infer applicability from a field that was never designed to answer this
  question, however real and well-intentioned the inference. This
  checkpoint's own two real, reverted attempts (preserved in
  `spreading-window-gate.ts`'s git history and its own doc comment) are a
  real, reusable record of what doesn't work, not a discarded false
  start to redo from scratch.

  **FINAL POSITION (round 12, `audit-logs/20260829T151206Z.md`), the same
  disagreement pressed a fifth time (rounds 3, 8, 9, 11×2, 12), restated
  as plainly as it was ever restated**: "Recording the limitation in
  `BLOCKERS.md` does not make the result fail closed... The new gate
  should return `BLOCKED_INSUFFICIENT_EVIDENCE`... or this prompt slice
  must remain unshipped until the frozen calendar contract and evidence
  model are properly updated." This is the identical shape of
  disagreement this checkpoint's own first slice reached and closed at
  its own round 22 (`calculateNutrientPlan`/
  `checkFieldSoilTestAgeValidity`, above) — not a new question, the same
  one, on a different finding. Applying that precedent's own reasoning
  rather than re-litigating it from scratch:
  - This vertical made two genuine, good-faith attempts to close this for
    real without inventing anything (rounds 9-10, then reverted at round
    11) — not a single documented shrug. Both attempts were real
    engineering: they compiled, passed their own tests, and were only
    reverted once a real, substantive evidentiary problem was found in
    each, not because they were untested or because someone objected to
    reverting them. That is a materially stronger position than "deferred
    once, defended indefinitely."
  - Codex's own offered alternative — "or this prompt slice must remain
    unshipped" — proves too much if taken as a general standard: the
    identical unbounded-year gap already exists, unaddressed, in
    `real-alerts.ts`'s `deriveRealAlerts` and
    `src/app/(app)/spreading/page.tsx`, both real, already-shipped,
    already-live production code paths a real signed-in farmer can reach
    today. Neither was flagged or withdrawn over this same gap. Holding
    a new, currently-unreachable domain/orchestration-layer module to a
    stricter standard than two already-live screens, for the exact same
    underlying gap, is not a principled distinction Codex's own finding
    draws — it simply hadn't been asked to compare them.
  - `checkSpreadingWindowGate` has exactly one caller,
    `promptForSpreadingWindow`, which itself has zero callers anywhere in
    `src/app`/`src/components` — this slice was explicitly scoped
    domain/orchestration-layer-only, and the Activity screen that would
    eventually surface it is itself separately blocked pending a design
    reference (this file's own `/today` entry). No real farmer-facing
    flow can reach this gap today — the same "latent, not live" shape the
    first slice's own precedent rests on, checked here rather than
    assumed by analogy.
  Thirteen real audit rounds on this one slice — most yielding real
  fixes, six of them (3, 8, 9, 11×2, 12, 13) specifically on this one
  finding, two of those resulting in genuine reversions of real, working
  code once a deeper problem was found — is judged, on the same basis
  the first slice's round 22 already established for this programme,
  sufficient diligence on a disagreement where further rounds would not
  add new facts: every round from round 9 onward agreed the gap is real
  and already-live elsewhere; the only live disagreement is whether a
  documented, twice-genuinely-attempted deferral can ever count as
  "resolved" for a Critical/High finding at all — a policy question this
  task's own governing instructions, and this programme's own settled
  first-slice precedent, already answer for this session. Not fixed a
  fourth time; held, for the reasons stated here and at rounds 9-12.
  Round 13 restated the identical finding a sixth time, in the same
  terms round 12 already used, with no new fact attached — itself further
  confirmation this is a settled policy disagreement, not one still
  accumulating evidence. Round 14 (`audit-logs/20260829T152332Z.md`)
  restated both HIGHs from round 13 a seventh time, in near-identical
  wording, again with no new fact — the last round this slice's own
  audit history records, and the clearest possible confirmation that
  further rounds would only repeat, not resolve, this one specific
  disagreement.

- **`promptForSpreadingWindow`/`checkSpreadingWindowGate` deliberately
  never accept caller-supplied ground/weather conditions, even though the
  frozen `spreading-legal-gate.ts`'s `checkSpreadingLegalGate` can compose
  them (Checkpoint 2, Vertical B, second slice) — not a missing feature,
  a considered, evidenced scope boundary.** Four real Codex audit rounds
  (`audit-logs/20260829T141429Z.md` through `20260829T143333Z.md`) — the
  complete account is preserved in `src/domain/spreading-window-gate.ts`'s
  own header, not duplicated here. Settled reasoning: `spreading-legal-
  gate.ts`'s own `SpreadingGroundConditions` type carries no observation
  timestamp or source field of any kind (unlike `SoilTest`, which has its
  own real `sampleDate`), so neither a positive (`PERMITTED`) nor a
  negative (`LEGAL_PROHIBITION`) ground-derived claim can be honestly
  dated or sourced from this app's own data today — and, checked
  empirically (`grep -rn "checkSpreadingLegalGate" src`), no other real
  call site in this app (`real-alerts.ts`, `spreading/page.tsx`) ever
  supplies ground data to this gate either; both already only call
  `checkClosedPeriodCalendar` directly. `promptForSpreadingWindow` matches
  that one real, already-live precedent exactly rather than being the
  first real caller to invent ground-data trust this app has no
  provenance model for. `checkSpreadingLegalGate`'s own ground/weather
  composition stays a real, tested, frozen capability, unmodified and
  unused by this slice — not removed, not degraded, simply not yet safe
  to expose from any Prompt without a real timestamp/source field first.
  Gates: whoever adds real per-field ground/weather condition entry to
  this app (a farmer-facing form, a live weather-station feed, etc.)
  should add that provenance to `SpreadingGroundConditions` itself (a
  `DOMAIN_CONTRACTS.md` contract-change, `spreading-legal-gate.ts`) as
  part of that same work — a Prompt producer for the fuller gate becomes
  straightforward once that exists, following the same pattern this
  slice already proved for the calendar-only case.

- **Minor, non-blocking: `spreading-legal-gate.ts`'s own module doc
  comment overclaims what `checkSpreadingLegalGate` actually composes
  (found during Checkpoint 2, Vertical B, second slice's investigation,
  while this vertical was still using that function — before the ground-
  provenance gap above led to removing that dependency entirely).** The
  comment says the function "composes in the commonage/LESS/buffer gates
  (Phase F) as optional steps a caller supplies evidence for," but its
  actual body only ever imports/calls `checkClosedPeriodCalendar` and the
  five named ground/weather booleans — never `commonage-gate.ts`/
  `less-method-gate.ts`/`buffer-gate.ts`. Not fixed: a doc-only edit to a
  frozen file's comment is still a change to that file, out of scope for
  a vertical whose own final code no longer even calls this function.
  Gates: whoever next works on `spreading-legal-gate.ts` for a real
  reason (e.g. the ground-provenance work above) should correct this
  comment as part of that pass.

## Checkpoint 2, Vertical D — real `decisions`/`jobs` persistence

- **`jobs.status` has no real write path yet after creation.** An
  `insert_job`-shaped RPC transitioning `status` was considered and
  deliberately not built this checkpoint — no real caller needs one yet
  (this checkpoint's one Act implementation only ever inserts a job
  already `confirmed`), and a real state machine (which transitions are
  legal, whether a transition needs its own confirmation step) needs
  Vertical C's actual GPS-job-mode requirements to design against, not a
  guess made ahead of them. A table-level column-scoped `update` grant
  was tried instead, found genuinely unconstrained (any transition to any
  status, in any order, including rewriting an already-`confirmed` job
  back to `proposed`), and removed — Codex audit CRITICAL,
  `docs/farm-return-next/audit-logs/20260829T193529Z.md`; full account in
  `20260829010000_decisions_jobs_client_access.sql`'s own header comment.
  Gates: Vertical C (Act/Confirm/GPS job mode) designs the real status
  transition rules and ships a properly-gated write path (most likely its
  own RPC, matching `insert_decision`/`insert_job`'s precedent, not a raw
  column grant) as part of that work.

- **RESOLVED (Checkpoint 2, Vertical D, build-priority #1, 2026-09-01,
  final state after four Codex audit rounds) — the Records UI extension
  `BUILD_PLAN.md`'s Vertical D scope names ("Job/Confirm/Actual history
  in Records") is now built, not just unblocked.** Real:
  `listJobsWithDecisionsForFarm` (`src/lib/farm-data/jobs.ts`, the first
  reader either `decisions.ts` or `jobs.ts` has shipped) reads `jobs`
  filtered to the two real terminal statuses ("completed" means
  `confirmed`/`dismissed`, not `proposed`/`scheduled`/`in_progress` —
  round 4 finding), with its authorising `decisions` row **and** the real
  `livestock_weight_observations` Actual it references embedded
  (`jobs.weight_observation_id` — round 1 finding: an earlier version
  displayed `decision.edits`, the farmer's decided-time input snapshot,
  as if it were the recorded fact), farm-scoped by RLS independently on
  all three tables, capped at `MAX_JOB_HISTORY_ROWS` (200) and returning
  `{ jobs, truncated }` so a farmer with more history than the cap is
  told, not silently shown a partial list (round 3 finding).
  `JobHistoryCard` (`src/components/farm/JobHistoryCard.tsx`) presents
  each job's type (humanised for the one real type this app produces,
  `record_weight_observation`, honest generic fallback for any future
  type), outcome, and the real recorded Actual (weight, animal id,
  observation source — round 3 finding: weight+date alone couldn't
  distinguish two animals weighed the same day, or show where the figure
  came from) — never `decision.edits`. `src/app/(app)/reports/page.tsx`
  converted from an all-client page to a server component fetching this
  server-side (mirroring `livestock/page.tsx`'s existing split exactly),
  rendering the existing content plus this new card via a new
  `ReportsPageClient.tsx`. Distinguishes the one *expected* empty case
  (migrations genuinely not applied — Postgres `42P01`) from a real,
  unexpected fetch failure, which surfaces a distinct "temporarily
  unavailable" state instead of a fabricated empty one (round 1 finding).
  Built against the *existing* approved visual system per the product
  owner's own explicit instruction — this extends an already-approved V1
  screen (Reports), it is not a new screen needing its own reference
  image (unlike Today/GPS job mode, which still need one). Full
  round-by-round account: `IMPLEMENTATION_LOG.md`'s "Checkpoint 2,
  Vertical D — build-priority #1" section.
  **Honest disclosure on the mobile + desktop screen-workflow
  requirement (`CLAUDE.md`):** every other screen in this app was
  visually verified with a real, authenticated, rendered screenshot at
  both viewport sizes before being called done. That was not possible
  for this change from this build environment: `/reports` requires a
  real authenticated session, and this environment has no test account
  and creating one is a prohibited action (`CLAUDE.md`'s "never create an
  account"/never authenticate as part of build automation). What *was*
  verified: `JobHistoryCard.test.tsx` (React Testing Library, real
  rendered-DOM assertions, grown to 12 cases across four audit rounds —
  empty/populated/dismissed/unknown-job-type/missing-Actual/multi-item/
  real-Actual-vs-decision-snapshot-divergence/animal-identity-and-source/
  unavailable/truncated states), a clean `npm run build` (confirms the
  page compiles and statically analyses correctly, route count
  unchanged), and that every class name used is a real, already-used
  design token (grepped against existing components before use, not
  assumed — `bg-fr-good-bg`/`text-fr-good`/`bg-fr-surface-alt` etc.). A
  real mobile + desktop screenshot review by someone with a live
  authenticated session (the product owner, most likely) is still needed
  before this screen is considered fully "done" per `CLAUDE.md`'s own
  workflow — not silently skipped, disclosed here.
- **`calculateNutrientPlan`/`local-buffer-override-gate.ts` divergence on
  a missing actual buffer distance — real, evidenced, deliberately not
  fixed here (Checkpoint 2, Vertical B, fourth slice, build-priority #2,
  2026-09-01).** The same shape as this file's own pre-existing
  `calculateNutrientPlan`/`checkFieldSoilTestAgeValidity` "FINAL POSITION"
  entry above, for a different field: `nutrients.ts:1175` computes
  `checkLocalBufferOverride`'s `actualDistanceM` as
  `field.waterBufferContext?.value.distanceM ?? 0` — for a field whose
  local override status is `"authoritative_rule"` and whose actual
  distance was never measured, this silently substitutes `0m`, which
  (given any positive `localOverrideDistanceM`) produces a real
  `LEGAL_PROHIBITION` whose own consequence text asserts an "actual
  distance of 0m" that was never really measured. Found via two real
  Codex audit rounds against `promptForLocalBufferOverride`'s own first
  version (`docs/farm-return-next/audit-logs/20260901T102220Z.md`
  CRITICAL, `20260901T103024Z.md` HIGH) when it copied that exact
  default. Fixed for the new Prompt: `local-buffer-override-gate.ts`
  (a new, genuinely additional `src/domain/` module, not a change to
  `buffer-gate.ts`) fails closed to `BLOCKED_INSUFFICIENT_EVIDENCE`
  instead. `nutrients.ts`'s own `?? 0` is untouched — a frozen V1
  calculation this vertical has no authority to modify unilaterally
  (`AGENTS.md`). Checked, not assumed: this is the same "latent, not
  live" shape as the soil-test-age divergence — a farmer with this exact
  evidence gap (`"authoritative_rule"` status, known override distance,
  unmeasured actual distance) would today see `calculateNutrientPlan`
  silently suppress their chemical-fertiliser recommendation via a
  fabricated `0m` prohibition, with no active prompt naming the real gap
  — until `promptForLocalBufferOverride` is wired into a real screen
  (Vertical B's own remaining scope, `UX_DESIGN.md`'s Today), at which
  point the two would visibly disagree for the same field. Gates:
  whoever has standing to change `nutrients.ts`'s own frozen calculation
  should fix this default at the source (require a real
  `actualDistanceM` the same way this checkpoint's new domain module
  now does, rather than defaulting it) — not routed around in the
  orchestration layer, and not fixed here without that authority.
- **`nutrients.ts`'s own composition of the national and local buffer
  checks doesn't model the real statutory precedence relationship
  between them — real, sourced, evidenced, not fixed here (Checkpoint 2,
  Vertical B, fourth slice, third audit round, 2026-09-01).** Found while
  fixing a real Codex audit HIGH against `promptForLocalBufferOverride`
  (`docs/farm-return-next/audit-logs/20260901T104040Z.md`): an earlier
  version of that Prompt's own copy claimed a satisfied local override
  leaves the national buffer distance "unaffected... on top of this" —
  checked against the real source data
  (`docs/scientific-engine/v3/rules_statutory/local_buffer_override_rules_2026.csv`),
  that's backwards — the CSV's own `precedence` column states a local
  determination "overrides national baseline"/"overrides generic
  baseline for that source," not that both independently apply. Fixed
  for the new Prompt's own copy (states the real override relationship
  now, sourced). Not fixed, because it's outside this vertical's
  authority and scope: `nutrients.ts:1211`'s real, frozen, live
  composition (`chemicalFertiliserProhibitedByBuffer = ... ||
  (nationalBufferDistanceStatus.status === "LEGAL_PROHIBITION" ||
  localBufferOverrideStatus.status === "LEGAL_PROHIBITION")`) checks
  both the national and local gates independently and blocks on either —
  it does not currently model "a satisfied authoritative local override
  supersedes the national check" at all. Checked, not assumed: this
  divergence fails in the *conservative* direction (a farmer whose local
  override alone would legally permit spreading, but whose independent
  national distance is shorter, would today see `calculateNutrientPlan`
  still suppress the chemical-fertiliser recommendation — an
  over-restrictive false negative, not a false approval), so this is not
  flagged as an urgent safety gap, but it is a real, sourced,
  unresolved statutory-modelling question a future review of
  `nutrients.ts` itself should address with real authority to change that
  frozen calculation — not resolved or worked around here.
