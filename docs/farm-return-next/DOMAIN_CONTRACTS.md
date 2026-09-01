# Farm Return Next — domain contracts

This is the frozen interface surface `ARCHITECTURE.md`'s orchestration
layer (and any parallel worktree agent) must call, never reimplement.
"Contract" here means: a module's exported function signatures and the
shape of what they return. The logic inside is V1's, validated, and out of
scope for this build programme unless a genuine defect is found in it (in
which case it's fixed in place with the same evidence discipline, per
`MASTER_SPEC.md`'s non-goals).

## Why this file exists

`BUILD_PLAN.md` delegates independent verticals to isolated worktree
agents once contracts are stable. Two agents in two worktrees editing the
same file, or one silently changing a function signature the other
depends on, is exactly the failure mode this file exists to prevent —
every agent reads this file before writing a line of orchestration code,
and no agent changes an entry in the "frozen" table below without the
protocol at the bottom.

## Frozen contract inventory (`src/domain/*.ts`)

Grouped by concern; not exhaustive line-by-line (each module's own doc
comments and tests are the real interface definition) — this is the map
an agent uses to find the right module before writing a new one.

| Concern | Modules |
|---|---|
| Provenance & evidence | `provenance.ts`, `evidence.ts`, `source-register.ts` |
| Nutrients & statutory gates | `nutrients.ts`, `nutrient-plan-trace.ts`, `buffer-gate.ts`, `closed-period-calendar.ts`, `clover-n.ts`, `commonage-gate.ts`, `concentrate-gates.ts`, `fertiliser-admissibility-gate.ts`, `input-gates.ts`, `less-method-gate.ts`, `milking-platform.ts`, `p-build-up-eligibility.ts`, `sell-hold-economics-gate.ts`, `soiled-water-gate.ts`, `spreading-legal-gate.ts`, `statutory-excretion.ts`, `statutory-manure-value.ts` |
| Soil | `soil-resolution.ts`, `soil-test-validity.ts`, `field-boundary.ts` |
| Livestock & feed | `livestock.ts`, `feed-cost.ts`, `fodder-budget.ts` |
| Finance & market | `finance.ts`, `market.ts`, `price-resolution.ts` |
| Spreading & weather | `spreading.ts`, `weather-forecast.ts`, `weather-observations.ts`, `weather-station-capability.ts`, `weather-stations.ts` |
| Audit & reporting | `audit-export.ts`, `audit-trace.ts`, `audit-trace-adapters.ts`, `audit-trace-local-storage.ts`, `audit-trace-store.ts`, `peer-review-local-storage.ts`, `report-validator.ts`, `real-alerts.ts` |
| Shared types/units/stats | `types.ts`, `units.ts`, `farm-stats.ts` |

## Frozen contract inventory (`src/lib/farm-data/*.ts`)

The persistence layer Act writes through: `decisions.ts`, `farms.ts`,
`fields.ts`, `financial-assumptions.ts`, `housing.ts`,
`individual-animals.ts`, `json-equal.ts`, `jobs.ts`, `livestock.ts`,
`mappers.ts`, `notifications.ts`, `row-types.ts`, `slurry.ts`,
`soil.ts`, `supplier-quotes.ts`, `telemetry.ts`.

`notifications.ts` (Checkpoint 2, Vertical G — real persistence for the
new Notify stage, `supabase/migrations/20260901020000_notifications.sql`)
— registered here from the start, following the exact discipline
`telemetry.ts` established the previous checkpoint after being caught
omitting it once. `insertNotification`: select+insert, plain
RLS-respecting session client, `23505`-retry-safety against the real
`(farm_id, kind, dedupe_key)` UNIQUE constraint mirroring
`insertDecision`/`insertTelemetryEvent` field-for-field.
`listActiveNotificationsForFarm`: bounded (`MAX_ACTIVE_NOTIFICATIONS =
200`), over-fetch-by-one truncation detection, `{ notifications,
truncated }` return shape — the same honesty pattern
`listJobsWithDecisionsForFarm` (`jobs.ts`) established.
`markNotificationViewed`/`markNotificationActedOn`/
`markNotificationDismissed`: the first-ever legitimate client-reachable
state-transition functions in this schema (`decisions.ts`/`jobs.ts` both
deliberately have none) — safe specifically because the database's own
`notifications_valid_transition` trigger enforces the real state
machine independently of application code, the lesson
`20260829010000_decisions_jobs_client_access.sql`'s own `jobs.status`
CRITICAL finding established; a `23514` (check_violation) from an
illegal transition attempt is caught and surfaced as a clear, specific
error, never silently swallowed.

`telemetry.ts`/`json-equal.ts` (Checkpoint 2, Vertical A — real
persistence for the Observe stage's raw phone-GPS events,
`supabase/migrations/20260901000000_telemetry_events.sql`) — registered
here from the start this time (Codex audit HIGH,
`docs/farm-return-next/audit-logs/20260901T140609Z.md`, on this
increment's own first draft omitting exactly this entry — the third
occurrence of the same class of gap this file's "New contracts this
build programme adds" section already records happening twice before,
for Vertical B's first two Prompt modules and for `decisions.ts`/
`jobs.ts` itself). `insertTelemetryEvent`: select+insert only, matching
`telemetry_events`' own RLS/grant, plain RLS-respecting session client
(not privileged) — same architecture `decisions.ts`'s own header comment
documents in full for its own table, same `23505`-retry-safety pattern
as `insertDecision`, field-for-field. `json-equal.ts`'s `jsonValuesEqual`
is a small, dependency-free structural-equality helper extracted out of
`decisions.ts` once `telemetry.ts` needed the identical retry-safety
content comparison `insertDecision` already established — both real
callers now import it from there rather than each carrying a silently-
divergent copy.

`decisions.ts`/`jobs.ts` (Checkpoint 2, Vertical D — real persistence for
the Decide/Act stages, `supabase/migrations/
20260829010000_decisions_jobs_client_access.sql`) followed this table's
own registration protocol from the start this time (Codex audit HIGH,
`docs/farm-return-next/audit-logs/20260829T191227Z.md`, on this
checkpoint's own first draft omitting exactly this entry — the same class
of gap this file's "New contracts this build programme adds" section
already records happening once before, for Vertical B's first two
Prompt modules). Both `insertDecision` and `insertJob` verify farm
ownership and then insert, both on the same regular, RLS-respecting
session client — **not** a privileged/service-role client (an earlier
version of this checkpoint used one; a dedicated architectural security
review reverted it to plain authenticated+RLS, matching every other
`src/lib/farm-data/*.ts` mutation in this app — see `BLOCKERS.md`'s
"Decisions/jobs persistence: service-role reverted to RLS" entry and
`20260829010000_decisions_jobs_client_access.sql`'s own sixth-round
header section for the complete reasoning). `insertDecision`:
select+insert only, matching `decisions`' own RLS/grant — never add an
update/delete export for it (see that file's own header comment).
`insertJob`: select+insert only shipped this checkpoint — `jobs` grants
no `update`/`delete` at all either (a column-scoped `update` grant was
tried, found unconstrained, and removed — Codex audit CRITICAL,
`docs/farm-return-next/audit-logs/20260829T193529Z.md` — see
`20260829010000_decisions_jobs_client_access.sql`'s own header comment
and `BLOCKERS.md`). A real job-status-transition path is a future
vertical's (most likely C's) own design, not shipped speculatively here.
`jobs.weight_observation_id` (`supabase/migrations/
20260829020000_jobs_weight_observation_reference.sql`, overnight
autonomous build run) is a narrow, job-type-specific reference to the
`livestock_weight_observations` row a `record_weight_observation` job's
`confirmed` status is based on — database-CHECK-enforced present when
`job_type = 'record_weight_observation' and status = 'confirmed'`, and
CHECK-enforced absent for every other `job_type`. Deliberately not the
general `target_type`/`target_id` polymorphic reference `BLOCKERS.md`'s
pre-existing entry defers to Vertical C — see that migration's own
header comment for why the narrow version doesn't pre-empt the general
one.

`jobs.ts` gained its first reader, `listJobsWithDecisionsForFarm`
(Checkpoint 2, Vertical D, build-priority #1 — the Records UI,
product-owner decision 2026-09-01). A real PostgREST embedded-resource
select spanning three tables: `jobs`, its authorising `decisions` row
(`decision:decisions(*)`), and — added after a Codex audit HIGH,
`docs/farm-return-next/audit-logs/20260901T094442Z.md`, that caught an
earlier version presenting the decision's own decided-time input
snapshot as if it were the recorded fact — the real
`livestock_weight_observations` Actual the job's `weight_observation_id`
references (`weightObservation:livestock_weight_observations(*)`),
capped at `MAX_JOB_HISTORY_ROWS` (200) rows — returned as
`{ jobs, truncated }`, not a bare array, so a caller can honestly
disclose when a farm's real history exceeds the cap rather than
presenting a silently truncated list as complete (Codex audit MEDIUM,
`docs/farm-return-next/audit-logs/20260901T095654Z.md`). Farm-scoped by
RLS independently on all three tables — see that function's own doc
comment for why that's not a cross-farm read seam. Consumed by
`src/app/(app)/reports/page.tsx` (a server component, converted from an
all-client page to fetch this server-side, mirroring
`livestock/page.tsx`'s existing pattern exactly) via the new
`JobHistoryCard` (`src/components/farm/JobHistoryCard.tsx`). Not every
failure fails open the same way: the one *expected* case (the
migrations genuinely not applied yet — Postgres `42P01`,
`undefined_table`) renders as a genuine empty state; any other error is
logged server-side and renders a distinct "temporarily unavailable"
state instead (Codex audit MEDIUM, same round — an earlier version's
blanket catch conflated the two).

## The `EngineOutcome<T>` / fail-closed pattern

V1's gate modules (nutrients, statutory gates, soil resolution) return a
tagged result — a real value with evidence, or a named
`BLOCKED_INSUFFICIENT_EVIDENCE`-style reason — never a guessed number.
Every new orchestration-layer Prompt/Estimate consumer must handle both
arms explicitly: a blocked Estimate produces an honest "not enough
evidence yet" Prompt, never a Prompt built on a silently-substituted
default. This is `CLAUDE.md`'s "never invent a number" rule applied to the
new Prompt stage specifically.

## Contract-change protocol

A module in the tables above is **frozen** by default. Changing an
exported function's signature, return shape, or fail-closed behaviour is
a **breaking contract change** and requires, in one commit, before any
parallel worktree agent may rely on the new shape:

**Carve-out, made explicit here after Codex audit HIGH,
`docs/farm-return-next/audit-logs/20260901T153753Z.md` (round 2) and
`20260901T154550Z.md` (round 3, which correctly rejected round 2's own
first attempt at this carve-out — see below) against
`satellite-field-coverage.ts`.** A module's own still-open, first
round-trip of Codex audit findings against the exact commit that
introduced it does not require the full 4-step protocol for its own
in-progress fixes — the same already-established, unobjected-to pattern
`src/lib/offline/outbox.ts` used across four real rounds (Vertical A,
`farmId` added to every function, `flush`'s own concurrency contract
redesigned, `completeClaim` gaining a `boolean` return). **Round 2's
first version of this carve-out relied on an unwritten, unverifiable
signal** ("has this checkpoint's own commit sequence been pushed/closed
yet") that a parallel worktree agent reading this file alone cannot
actually check — round 3 correctly named this as defeating the
protocol's real preventive purpose, since "is another vertical depending
on it" is exactly the fact an isolated worktree has no way to know.
**Fixed for real, not by adding another unwritten caveat: this carve-out
now requires using the one signal this file's own protocol already
made canonical for exactly this state — `BUILD_STATE.json.contracts_frozen`.**
The commit that first adds a module to the "Shipped so far"/similar
table sets `contracts_frozen` to `false` in that same commit (the normal
step-4 mechanics already described above, applied to a *new* module's
own birth, not only to changing an existing one) and leaves it `false`
for the duration of that module's own initial audit cycle.

**Close sequence — final resolution, after Codex audit HIGH rounds 4-8
(`docs/farm-return-next/audit-logs/20260901T155638Z.md` through
`20260901T162549Z.md`) each found a real bug in the previous round's own
attempted fix, including round 8 correctly rejecting round 7's own
"commit B is covered by A's audit" claim as false (an audit of A's diff
cannot cover B's separately-written content, however small).** Four
rounds of trying to engineer a fully self-certifying, zero-gap sequence
converged on the same underlying fact: **it is logically impossible for
any commit to be simultaneously (a) the one that first asserts
"audited-clean" and (b) itself already covered by an audit that ran
before it existed.** This is not a defect in this protocol specifically
— it is the base condition of *every* commit in this workflow, at the
instant of its own creation, before its own audit round runs. This
project has never treated that ordinary, universal gap as unsafe for
any other commit or any other field in `BUILD_STATE.json`
(`last_quality_gate`, `checkpoint_status`, ... are all believed on the
strength of the work that produced them, not independently re-verified
before being trusted) — the four-round attempt to hold `contracts_frozen`
specifically to a stricter, zero-gap standard was this session's own
invention, not something the original four-step protocol above ever
asked for, and it turned out to be unsatisfiable by construction, not
merely difficult.

**The rule reverts to the original protocol's own plain language**:
commit **A** is the implementation (or latest fix), audited normally;
once clean, commit **B** — bookkeeping only — records that result and
flips `contracts_frozen` back to `true` in the same commit ("back to
`true` once merged," the original step-4 wording, unchanged). B is then
audited afterward exactly like every other commit already is, with no
special exemption and no pre-announced tolerance for whatever it might
find — the same ordinary discipline every commit in this build programme
goes through, no more and no less. **Ending the meta-argument here is a
deliberate decision, stated plainly rather than left implicit**: rounds
5 through 8 found four real, substantive bugs in four successive
attempts to engineer a stronger guarantee than the base protocol ever
claimed to provide (an unsafe operational claim, an improper self-
exemption, a false factual premise, and — round 8 — the same
"predecessor audit covers this commit's own new content" error the
project has now made twice); the underlying satellite-discovery
implementation itself has needed no change since round 4. Continuing to
add commits in pursuit of a guarantee this analysis now shows cannot
exist would not make the flag any safer — it would only keep restating
the same impossibility in new words. **Vertical A's `outbox.ts` and
Vertical G's `notifications.ts` did not flip this flag during their own
initial audit cycles (both are already closed/clean now, so there is no
live risk from that gap) — a real, retroactive process omission,
recorded honestly rather than silently corrected after the fact; see
`IMPLEMENTATION_LOG.md`.** This checkpoint (`satellite-field-coverage.ts`)
is the first to actually flip it, per the close sequence above, once
its own round-8 fix commit landed.

1. The change itself, with its existing tests updated (or new ones added
   if the change is additive-only and old tests still pass unmodified).
2. Every call site in `src/app`, `src/components`, and
   `src/orchestration` (once it exists) updated in the same commit — never
   left for "whoever hits the type error next."
3. A note in `IMPLEMENTATION_LOG.md` naming the module and what changed.
4. `BUILD_STATE.json`'s `contracts_frozen` flipped to `false` for the
   duration of the change, and back to `true` once merged to this
   branch — while `false`, `BUILD_PLAN.md`'s supervisor does not delegate
   new independent worktree tasks (see `BUILD_PLAN.md`'s parallelisation
   rules); in-flight worktree agents are notified via
   `IMPLEMENTATION_LOG.md` to rebase before continuing.

A **non-breaking, additive** change (a new optional parameter with a
default reproducing prior behaviour — the exact pattern `finance.ts`'s
`priceOverride`/`includeUnmodelledRows` parameters already used in the P3
remediation pass, see `docs/real-mode-completion/BUILD_LOG.md`) does not
require step 4 — this is the preferred shape for extending a frozen
contract wherever the new behaviour can be off-by-default.

## New contracts this build programme adds

New `src/domain/` modules (Prompt scoring, GPS-derived area corrections,
etc.) join this table via the same process every V1 domain module used:
pure function, colocated test file, `docs/evidence-register.md` entry
before any production screen consumes it for a real (non-`sample_data`)
figure. They are proposed, not frozen, until they ship — `BUILD_PLAN.md`
tracks which checkpoint owns each one.

Shipped so far (Codex audit HIGH, `audit-logs/20260829T144928Z.md` —
this inventory row was missing for both modules below until this entry
was added; `BUILD_STATE.json`/`IMPLEMENTATION_LOG.md` documented them
individually at the time each shipped, but a parallel worktree agent
scanning this file alone had no way to see them as owned domain surface):

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `field-soil-test-age.ts` | Checkpoint 2, Vertical B, first slice | `nutrients.ts` (`pIndexFromMgL`, `cropGroupForFieldUse`, `yearsBetweenIsoDates`), `soil-test-validity.ts` (`checkSoilTestAgeValidity`) | Field-scoped 4-year statutory soil-test disregard rule (`GFT011`-`GFT015`). Deliberately *not* wired into `calculateNutrientPlan` — see this file's own `calculateNutrientPlan`/`checkFieldSoilTestAgeValidity` entry in `BLOCKERS.md`. |
| `spreading-window-gate.ts` | Checkpoint 2, Vertical B, second slice | `closed-period-calendar.ts` (`checkClosedPeriodCalendar`) | Date-validated statutory closed-period calendar (`GFT057`-`GFT080`). Deliberately calendar-only — no ground/weather composition, and no year-range guard (both real gaps, tried and deliberately reverted for the latter; see `BLOCKERS.md`'s ground-provenance and unbounded-year entries). |
| `local-buffer-override-gate.ts` | Checkpoint 2, Vertical B, fourth slice (build-priority #2, 2026-09-01) | `buffer-gate.ts` (`checkLocalBufferOverride`) | Missing-actual-distance-validated local water-buffer override layer (AF010, `GFT089`-`GFT090`). Built after two real Codex audit rounds on `promptForLocalBufferOverride`'s own first version: a `?? 0` default copied from `nutrients.ts`'s real call site let a fabricated `0m` distance reach a real `LEGAL_PROHIBITION`; the first fix moved the missing-distance guard into the orchestration layer, which a second round correctly rejected as domain classification logic in the wrong layer. This module is that guard, in the right layer, with a new registered reason code (`MISSING_LOCAL_BUFFER_ACTUAL_DISTANCE`, `evidence.ts`, additive). Deliberately still diverges from `nutrients.ts`'s own frozen `?? 0` default for this exact scenario — a real, disclosed, "latent, not live" gap (see the module's own doc comment and `BLOCKERS.md`), not fixed here since `nutrients.ts` is a frozen V1 calculation outside this vertical's authority to modify unilaterally. |
| `satellite-field-coverage.ts` | Checkpoint 2, Vertical H, first slice (build-priority #6, 2026-09-01) | none (a new real source, `docs/evidence-register.md`'s CDSE STAC entry — not a wrapped existing V1 calculation) | Selects the best real Sentinel-2 L2A scene covering a field (least real cloud cover within a disclosed lookback window, footprint-intersection-checked with `@turf/turf`'s `booleanIntersects` against the field's real polygon, not just the search bbox) from candidates fetched by the new `src/server/satellite/cdse-stac-client.ts` (real, live-verified, unauthenticated STAC search — see `evidence-register.md`). New registered reason code `NO_RECENT_SATELLITE_SCENE_AVAILABLE` (`evidence.ts`, additive). Real NDVI/vegetation-index computation from raw spectral bands is deliberately NOT built — it requires CDSE `oidc`/`s3` credentials this build session does not have and cannot create (account creation is a hard policy prohibition); see `BLOCKERS.md`. `@/domain/field-boundary.ts` gained one additive export, `boundingBox`, to build the real search bbox this module's own caller needs. `asOf`/`lookbackDays` are validated (finite/positive/real calendar-valid ISO datetime, computed cutoff checked for `Date`-range overflow) after three real Codex audit rounds against this exact function found three separate ways the first two attempts stayed bypassable — see `IMPLEMENTATION_LOG.md`'s three dedicated sections for the full account. `contracts_frozen` was `false` through this module's own rounds 1-8 audit cycle (real Critical/High findings in rounds 1-4; a governance-protocol-text question in rounds 5-8, resolved in round 8) and is `true` again as of that round's own commit — see this file's own contract-change-protocol close sequence. |
| `iso-datetime.ts` | Checkpoint 2, Vertical H, extracted mid-slice (2026-09-01, Codex audit HIGH round 3 against `satellite-field-coverage.ts`) | none | `isValidIsoUtcDateTime` — a strict UTC ISO-8601 datetime validator (real calendar-range checks per component: month/day/hour/minute/second, leap years via plain Gregorian arithmetic — divisible by 4, except centuries not divisible by 400 — not `Date.UTC`, which a round-4 Codex audit HIGH found silently misinterprets any two-digit year 0-99 as 1900-1999, and not a hand-maintained days-per-month table either), extracted as its own shared module once both `satellite-field-coverage.ts` (`asOf`) and `cdse-stac-client.ts` (`datetime`) needed the identical real fix for the identical gap: `new Date(value)`'s lenient parser silently "fixes up" malformed input (`"0"`, `"2026-02-30"`, `"2026-01-01junk"`) instead of rejecting it, so a bare `Number.isNaN(new Date(value).getTime())` check never catches any of those. See the module's own doc comment for the full account. |
