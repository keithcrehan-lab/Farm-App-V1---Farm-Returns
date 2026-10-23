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

## Non-Negotiable Audit & Scientific Provenance Principle

This is a project-wide contract, not a note scoped to any one phase —
codified here (Economic Opportunity Engine, Phase 7.1) because that
programme is where fingerprinting first made it directly enforceable, but
binding on every domain module in this repository:

> **Every recommendation Farm Return makes is reproducible from its
> underlying data, traceable to the scientific or authoritative evidence
> supporting every material transformation, and capable of being
> independently reviewed without trusting Farm Return itself.**

Concretely:

- **No recommendation without evidence.** A raw observation (a soil-test
  result, a farmer-entered slurry volume, a market price) does not need to
  be peer-reviewed — but it does need provenance (`DataStatus`/`TrackedValue`,
  `src/domain/types.ts`/`provenance.ts`). A scientific TRANSFORMATION of
  that observation (a soil index, a nutrient requirement, a slurry
  available-nutrient figure) needs a real, citable authoritative source
  where such science exists (`SourceId`/`SOURCE_REGISTER`,
  `src/domain/source-register.ts`) — never an invented citation, and never
  silence where a citation is genuinely missing (report the gap instead;
  see any Economic Opportunity Engine phase's own STOP-condition
  discipline for the pattern).
- **No economic value without provenance.** Every calculated euro must be
  traceable to the exact scientific/product recommendation, price
  observation, and calculation that produced it — see the Economic
  Opportunity Engine phases below for the concrete chain.
- **No unknown silently converted to zero.** `EngineOutcome<T>`'s
  discriminated union (`evidence.ts`) exists precisely so "genuinely
  quantified zero" and "unknown/blocked/insufficient evidence" can never
  be confused — every phase below enforces this at its own boundary.
- **No scientific assumption without an applicability boundary.** A rule
  used outside the real conditions its evidence supports (wrong method,
  wrong timing, wrong geography) must fail closed, not extrapolate
  silently — see `nutrients.ts`'s `resolveAvailableSlurryNutrients` for a
  concrete, already-audited example.
- **No historical calculation rewritten when evidence changes.** New
  evidence produces a NEW record/assessment; the old one remains
  reconstructable (`TrackedValue.previous`, Phase 7's supersession model,
  Phase 2's append-only market observations).
- **No downstream recommendation may detach from the exact audited
  calculation that produced it.** A future ranking/recommendation layer
  consumes a record with valid provenance/integrity — never a bare number
  with the evidence stripped away (Phase 7's read-model; Phase 7.1's
  content fingerprint makes "is this exactly the calculation it claims to
  be" independently verifiable, not merely asserted).

This principle is enforced today by the Economic Opportunity Engine
(Phases 1-7.1, below) and by the pre-existing `EngineOutcome`/`TrackedValue`
machinery every other domain module already uses. It is not optional
documentation — a future module that violates it (fabricates a source,
collapses unknown into zero, mutates historical evidence) is a defect,
reviewed with the same severity this repository's adversarial-review
rounds already apply.

## Frozen contract inventory (`src/domain/*.ts`)

Grouped by concern; not exhaustive line-by-line (each module's own doc
comments and tests are the real interface definition) — this is the map
an agent uses to find the right module before writing a new one.

| Concern | Modules |
|---|---|
| Provenance & evidence | `provenance.ts`, `evidence.ts`, `source-register.ts` |
| Nutrients & statutory gates | `nutrients.ts`, `nutrient-plan-trace.ts`, `slurry-composition.ts`, `buffer-gate.ts`, `closed-period-calendar.ts`, `clover-n.ts`, `commonage-gate.ts`, `concentrate-gates.ts`, `fertiliser-admissibility-gate.ts`, `input-gates.ts`, `less-method-gate.ts`, `milking-platform.ts`, `p-build-up-eligibility.ts`, `sell-hold-economics-gate.ts`, `soiled-water-gate.ts`, `spreading-legal-gate.ts`, `statutory-excretion.ts`, `statutory-manure-value.ts` |
| Soil | `soil-resolution.ts`, `soil-test-validity.ts`, `soil-test-history.ts`, `field-boundary.ts` |
| Livestock & feed | `livestock.ts`, `feed-cost.ts`, `fodder-budget.ts` |
| Finance & market | `finance.ts`, `market.ts`, `price-resolution.ts` |
| Economic Opportunity Engine (domain foundation, market evidence, price resolution, costing, slurry counterfactual, whole-farm slurry allocation, audited opportunity record, assessment integrity/fingerprinting — see below) | `money.ts`, `economic-opportunity.ts`, `market-evidence.ts`, `market-price-resolution.ts`, `fertiliser-plan-cost.ts`, `slurry-direct-economic-assessment.ts`, `slurry-whole-farm-allocation.ts`, `audited-opportunity-record.ts`, `assessment-integrity.ts` |
| Spreading & weather | `spreading.ts`, `weather-forecast.ts`, `weather-observations.ts`, `weather-station-capability.ts`, `weather-stations.ts` |
| Audit & reporting | `audit-export.ts`, `audit-trace.ts`, `audit-trace-adapters.ts`, `audit-trace-local-storage.ts`, `audit-trace-store.ts`, `peer-review-local-storage.ts`, `report-validator.ts`, `real-alerts.ts` |
| Shared types/units/stats | `types.ts`, `units.ts`, `farm-stats.ts` |

## Frozen contract inventory (`src/lib/farm-data/*.ts`)

The persistence layer Act writes through: `decisions.ts`, `farms.ts`,
`fields.ts`, `financial-assumptions.ts`, `housing.ts`,
`individual-animals.ts`, `json-equal.ts`, `jobs.ts`, `livestock.ts`,
`mappers.ts`, `notifications.ts`, `row-types.ts`, `slurry.ts`,
`slurry-composition.ts`, `soil.ts`, `supplier-quotes.ts`,
`support-profile.ts`, `telemetry.ts`.

`support-profile.ts` (Supports Intelligence + Farm Strategy phase,
`supabase/migrations/20260904000000_support_profile_facts.sql`) —
registered here from the start, following the same discipline this
table's own header note requires. `listSupportProfileFactsForFarm`/
`upsertSupportProfileFact`: plain RLS-respecting session client (not
privileged), matching every other table in this directory. `key` is
database-CHECK-constrained to `src/domain/support-profile.ts`'s own
`SupportProfileFactKey` union — an unregistered key is rejected by the
database itself, not just application discipline. `VALIDATED_DEV` —
applied to `Farm Return V1 Dev` and live-verified for real, including a
real two-tenant cross-farm isolation test (this project now holds two
real farms) — see
`docs/validation/support-profile-facts-dev-validation.md`.

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
| `wind-speed.ts` | Strict Visual Reproduction phase, Field detail (2026-09-03, final whole-session Codex audit HIGH, `audit-logs/20260903T155348Z.md` — `FieldWindChip.tsx` had performed this conversion inline in a UI component) | none | `metresPerSecondToKmPerHour` — the exact SI unit-of-measure fact 1 m/s = 3.6 km/h, applied to `FieldWindChip`'s own real observed wind speed. No `evidence-register.md` sourced-authority entry (same precedent `units.ts`'s own P2O5/acre-hectare conversions already set — see that register's own "Modules with no external source" section, added alongside this row for the identical audit finding). |
| `near-field.ts` | Strict Visual Reproduction phase, Field/Today (2026-09-03, final whole-session Codex audit — round 1 CRITICAL, `audit-logs/20260903T155348Z.md`: `NearbyFieldCard.tsx`'s own inline version measured to a field's centroid and ignored the real position fix's own `accuracyMeters` entirely; round 2 HIGH+MEDIUM, `audit-logs/20260903T161401Z.md`: accuracy folded into the distance bound as worst-case uncertainty rather than a separate fixed pass/fail ceiling, non-finite/non-positive accuracy rejected, and real interior-ring/hole handling added to the point-in-polygon test. GPS Job Mode campaign, Codex audit HIGH round 2, 2026-09-04: added `distanceToPolygonBoundaryKm` — a purely additive export, `distanceToPolygonKm`'s own external "0 when inside" contract unchanged and still covered by its own existing tests) | none | `distanceToPolygonKm`/`distanceToPolygonBoundaryKm`/`findNearbyField` — real point-in-polygon (with real hole support) and point-to-boundary-segment geometry, used by `NearbyFieldCard.tsx`'s "Looks like you're near \<field\>" real-position-aware card and (the boundary-distance export) `gps-activity-detection.ts`'s own accuracy-aware field containment. No `evidence-register.md` sourced-authority entry (standard published geometry algorithms plus one disclosed, centralised UX threshold constant — see that register's own "Modules with no external source" section). |
| `support-profile.ts` | Supports Intelligence + Farm Strategy phase, 2026-09-04 | `nutrients.ts` (`totalLivestockUnits`, unmodified); `weather-forecast.ts` (`localDateKey`, unmodified — added round 11, 2026-09-04: `nowAsSupportProfileAssessedAt()` reuses this already-tested, DST-aware Europe/Dublin calendar-date function rather than a second, competing timezone calculation) | `buildSupportProfile` — derives known facts from existing `Farm`/`Field[]`/`LivestockGroup[]` and lists only the closed, named set of genuine gaps (`SupportProfileFactKey`, six as of round 12's `holds_annex_j_qualification`) this phase's own five seeded schemes need. `forageAreaHa` is `null` (not `0`) whenever any field's `plannedUse` is unresolved. See `docs/product/farm-return-next-v1.1/SUPPORTS_STRATEGY_CONTRACT.md`. |
| `scheme-registry.ts` | Supports Intelligence + Farm Strategy phase, 2026-09-04 | none (a new sourced registry — see `docs/evidence-register.md`'s own new row for this phase) | `Scheme`/`SchemeVersion`/`SchemeSource`/`SchemeRule` types plus five seeded `SchemeVersion`s (BISS, TAMS 3 general, TAMS 3 YFCIS, ANC, National Reserve Young Farmer), each rule individually source-cited. Four of five are `verificationStatus: "RULES_UNVERIFIED"` (BISS, ANC from launch; TAMS 3 general and National Reserve Young Farmer moved from an initially-mistaken `CONFIRMED` by Codex audit HIGH round 6, 2026-09-04, once their own sources were found not to specifically cover the scheme they were cited for) — only TAMS 3 YFCIS remains `CONFIRMED`, disclosed, not guessed. |
| `scheme-eligibility.ts` | Supports Intelligence + Farm Strategy phase, 2026-09-04 | none (Codex audit HIGH round 7, 2026-09-04, replaced this module's own two regulatory-boundary comparisons — the 5-year head-of-holding window and the "over 18" age gate — with a local, calendar-exact `exactYearsBetweenIsoDates`; `nutrients.ts`'s own approximate `yearsBetweenIsoDates` was no longer precise enough for an exact-anniversary legal boundary and is no longer imported here) | `assessSchemeEligibility`/`assessAllSchemes` — the deterministic Eligibility Engine (no AI call). `ELIGIBLE`/`LIKELY_ELIGIBLE`/`MORE_INFORMATION_REQUIRED`/`NOT_ELIGIBLE` farmer-facing states, `RULES_UNVERIFIED`/`SCHEME_UNAVAILABLE` internal fail-closed states. A `RULES_UNVERIFIED` scheme can never reach `ELIGIBLE`/`NOT_ELIGIBLE` (test-enforced); a result relying on any farmer-declared, DAFM-unverified fact caps at `LIKELY_ELIGIBLE`, never bare `ELIGIBLE` (also test-enforced). |
| `support-opportunity.ts` | Supports Intelligence + Farm Strategy phase, 2026-09-04 | none | `buildSupportOpportunity`/`estimateGrantSupportEur` — links a real `EligibilityAssessment` to, only when supplied, a real `StrategyComparison`; never infers "financially sensible" from eligibility alone. `estimateGrantSupportEur` reads only a `CONFIRMED` scheme's own cited `grantRatePct`/`ceilingEur` — `undefined`, never guessed, for every other scheme. |
| `farm-strategy.ts` | Supports Intelligence + Farm Strategy phase, 2026-09-04 | none | `compareStrategyToBaseline` — the 1/3/5/10-year Farm Strategy engine. Baseline is a real explicit zero ("continue current operation"), never fabricated. `peakCashRequirementEur` is always full gross capital cost (support is reimbursement after spend, never assumed to reduce upfront cash need) — structurally distinct from `netEventualCapitalCostEur` (gross minus only approved/actual support) and `cumulativeDifferenceVsBaselineEur`. `paybackYear` is never extrapolated past the requested horizon. All nine spec-required deterministic cases are real tests (`farm-strategy.test.ts`). |
| `gps-activity-detection.ts` | GPS Job Mode / Uber-style Activity Recording campaign, Phase 1, 2026-09-04 (Codex audit round 1 HIGH: dwell/sample-count/ratio rescoped to `candidateFieldEnteredAt`, not the whole observation window; round 2 HIGH x3: the current sample must itself be positive evidence before firing `candidate_start`, not just the historical aggregate; finish detection no longer gates "still in field" on speed, only genuine boundary departure; field containment is now accuracy-aware, not raw-centre-point-only; round 4 HIGH: added `candidateFieldSampleCount`, the qualifying-window sample count, so a caller persisting real detection evidence never misuses the whole window's own total; round 5 HIGH: `isUsableSample` (renamed from `hasUsableAccuracy`) now also rejects out-of-range lat/lng and a malformed `recordedAt` — previously a NaN/garbage sample could silently stall detection rather than being cleanly rejected; round 5 HIGH: `advanceFinishDetection` now uses a new three-way `classifyFieldMembership` ("inside"/"outside"/"ambiguous") instead of a bare "confidently inside or not" check — a run of genuinely ambiguous, poor-accuracy fixes near the field boundary no longer counts as departure evidence the way a confidently-outside fix does; an `activeFieldId` with no matching field entry now fails closed (`"ambiguous"`) instead of ambiguously matching nothing; round 6 HIGH: the departure window is now anchored to `firstGenuineOutsideAt` (the first genuinely `"outside"` sample since the last confirmed-inside moment, reset only on a genuine `"inside"` confirmation, untouched by an `"ambiguous"` sample in between) with a hard requirement that the *current* sample itself classify as `"outside"` before the duration/count check is even considered — closing a gap where real clock time passing through a run of merely `"ambiguous"` fixes after earlier genuine outside evidence could otherwise cross the threshold on stale evidence alone; round 6 MEDIUM: `gps-activity-candidate-controller.ts`'s `start()`/`stop()` no longer races — a concurrent `start()` joins the one in-flight promise instead of double-subscribing, and a `stop()` arriving while `start()` is still awaiting the provider is honoured the instant `start()` knows its own outcome, rather than silently no-op'ing on a not-yet-`true` `started` flag and leaving a live subscription running; round 14 MEDIUM: `started` was also cleared *before* a genuine `stopFarmAwareness()` call had actually succeeded, in both `stop()` and the mid-flight-cleanup branch — a real rejection left the controller believing it was stopped while the subscription might still be running, with every later `stop()` call then a permanent no-op; both now only clear `started` once the real unsubscribe has genuinely succeeded, `stop()` itself now rethrows a genuine failure (mirroring `start()`'s own round-4 contract), and round 15 MEDIUM: round 14's own mid-flight-cleanup fix only logged that failure, swallowing it from `stop()`'s own caller — the caller that actually asked to cancel a pending start was denied the exact failure signal it needs to retry; now captured separately (never conflated with the `starting` promise's own, unrelated `startFarmAwareness`-failure rejection, which `stop()` still correctly swallows) and rethrown by `stop()` itself, exactly like the ordinary stop path already does; round 7 MEDIUM: that same `stopRequestedDuringStart` flag could leak forward if the in-flight `start()` attempt finished *without* ever installing a subscription (platform unsupported, or `getCapability()` itself throwing) — a later, genuinely successful `start()` would then immediately undo itself reacting to an already-stale stop request; now cleared unconditionally once any in-flight attempt finishes, having already been consumed if it was genuinely relevant; round 7 MEDIUM: `ActiveJobSessionView.tsx` seeds its `session`/`finishDetection`/`tracking` state from props exactly once, at mount, with nothing re-syncing it to a later prop change — `job/[id]/page.tsx` now gives `ActiveJobSessionView` a real `key={id}`, so React never reconciles two different job sessions onto the same instance (the App Router does not itself guarantee a fresh instance just because a dynamic segment's param changed); the finish-detection reset identity inside the component also now includes `session.id`, not just `activeIntervals.length`, as defence in depth; round 8 HIGH: `firstGenuineOutsideAt` now also resets to `null` on an `"ambiguous"` sample (not just left untouched, as round 6 had it) — a long ambiguous gap no longer lets two sparse `"outside"` fixes it bridges satisfy the duration/count thresholds on stale, non-continuous evidence; sustained departure must now be shown by a genuinely unbroken run of `"outside"` samples; round 8 MEDIUM: `GpsActivityCandidateCard.tsx`'s periodic permission re-check now handles a rejected `getCapability()` explicitly (logged, never an unhandled rejection, and never treated as evidence of a denied permission) instead of only ever handling the fulfilled case; round 9 HIGH x2, new `maxSampleGapSecondsForContinuity` config: (1) the start detector previously only ever *switched* `candidateFieldId` to a different real field it stably agreed on, never dropping it just because the farmer had genuinely, stably left it — a farmer leaving the established candidate for several minutes and later returning could have both visits' evidence silently combined into one continuous-looking dwell; a stable run of samples all confidently away from the current candidate now drops it entirely, same as a fresh search. (2) both detectors now also reset their own accumulating evidence anchor across a real gap between consecutive accepted samples larger than `maxSampleGapSecondsForContinuity` (an app interruption, background suspension, or signal loss) — previously two sparse pieces of real evidence either side of such a gap, with literally nothing recorded during it, could still satisfy a duration/count threshold as if evidence had continued throughout; round 10 HIGH: round 9's own "stable departure drops the candidate" fix compared `fieldContainingSample`'s binary answer (which folds a genuinely `"ambiguous"` fix — poor accuracy near a boundary, or two real overlapping field polygons — into the same `null` as a confidently-outside one) against the candidate field id, so two merely inconclusive fixes could wrongly erase valid, still-accumulating dwell evidence; now reuses `classifyFieldMembership`'s three-way answer against the candidate field specifically, so only a confidently `"outside"` run drops it; round 11 HIGH, new `isMonotonic`: neither detector previously checked that an accepted sample's own `recordedAt` was actually after the previously accepted one's — a real, delayed/cached fix (browser geolocation timestamps are acquisition time, not delivery order) could arrive with an *earlier* timestamp than one already accepted, producing a negative gap/duration this file's own arithmetic never anticipated and letting a threshold appear satisfied almost instantly; a non-monotonic sample is now rejected outright, the same fail-closed treatment as bad accuracy or an invalid coordinate; round 12 HIGH: this row's own text had claimed the "modules with no external source" precedent applied since Phase 1, but no actual `evidence-register.md` entry was ever filed for it — added now, belatedly, following `near-field.ts`'s exact format; rounds 13-15: a doc-comment mismatch (LOW), a mid-flight stop-cleanup failure swallowed rather than surfaced (MEDIUM), then round 15's own correction of that fix once it conflated two genuinely different failure signals (MEDIUM); round 16: CLEAN, 0 Critical/High/Medium/Low — audit loop closed. `contracts_frozen` was `false` through this module's own 16-round audit cycle and is `true` again as of round 16's own commit) | `near-field.ts` (`distanceToPolygonKm`/`distanceToPolygonBoundaryKm`, unmodified — real polygon-boundary distance and boundary-edge distance, never centroid); `weather-stations.ts` (`haversineDistanceKm`, unmodified — real inter-sample speed derivation); `iso-datetime.ts` (`isValidIsoUtcDateTime`, unmodified, added round 5 — the same frozen calendar-exact UTC validator already used elsewhere, replacing this module's own weaker `Number.isNaN(new Date(...).getTime())` sample-timestamp check) | `advanceStartDetection`/`advanceFinishDetection` — pure, deterministic GPS Activity Candidate detection, entirely upstream of any real `job_sessions` row (`job-session-lifecycle.ts`'s own frozen state machine is untouched and takes over completely once a farmer confirms a candidate). Two independent detectors (start: searches every mapped field for genuine dwelling; finish: watches an already-known active field for genuine departure), never one combined machine. Every heuristic threshold (`GpsActivityDetectionConfig`) is named, centralised, and disclosed as a product heuristic, not a scientific/regulatory fact — see `evidence-register.md`'s own "Modules with no external source" section (round 12 fix: filed there, following `near-field.ts`'s/`units.ts`'s own precedent this row's text had cited since Phase 1 without ever actually filing). Fails closed on missing/non-finite/non-positive/kilometre-scale accuracy, out-of-range coordinates, and malformed timestamps (test-enforced), never counts a fast (road-speed) sample as dwelling evidence, requires `fieldSwitchStabilitySamples` consecutive agreeing samples before switching the candidate field (jitter/boundary-crossing protection), treats a boundary-ambiguous fix as genuinely inconclusive rather than either "inside" or "outside" evidence, and a terminal state (`expired`/`candidate_finish`) ignores further samples rather than reacting again. |
| `subject.ts` | Checkpoint 1.5 (Intelligence & Extensibility Architecture), 2026-09-08 | none | `SubjectType`/`SubjectRef` — a minimal, farm-scoped-by-resolution (never by an embedded field) pointer to any real Farm Return entity (`FARM`/`FIELD`/`ANIMAL`/`ANIMAL_GROUP`/`MACHINE`/`BUILDING`/`INPUT`/`STORAGE`). Not retrofitted onto `job_sessions` (GPS Job Mode, untouched) — deliberately TypeScript-only, matching `jobs_weight_observation_reference.sql`'s own precedent against inventing a generic polymorphic reference for one caller. Consumed by `measurement.ts`/`external-reference.ts`. See `docs/farm-return-next/CHECKPOINT_1_5_ARCHITECTURE.md`. |
| `evidence-item.ts` | Checkpoint 1.5, 2026-09-08 | none | `EvidenceKind`/`EvidenceItem` — a minimal "what concretely backs this value" record (GPS trace, farmer confirmation, photo, receipt, weigh-head measurement, sensor reading, laboratory result). Deliberately distinct from `evidence.ts`'s `EvidenceState` (a confidence tier, not a proof record) — see the module's own header comment. No media upload/hardware integration. |
| `measurement.ts` | Checkpoint 1.5, 2026-09-08 (Codex audit rounds 1-4 each found and fixed a genuinely distinct, narrower gap in the same farm-scoping/immutability invariant — round 1: `reviseMeasurement` didn't check farm/subject consistency; round 2: `measurement()` itself, not just `reviseMeasurement`, needed the same check across the whole `.previous` chain, plus cycle detection; round 3: the returned object's own `subject`/`evidence`/`previous` were still mutable post-validation, fixed by deep-copy + `Object.freeze`; round 4: the freeze mechanism's own `Object.isFrozen` shortcut was spoofable by a shallow freeze wrapper, fixed by removing it. Round 5 explicitly confirmed closure ("I found no fifth code-level bypass"); round 6 clean — audit loop CLOSED) | `subject.ts` (`SubjectRef`), `evidence-item.ts` (`EvidenceItem`), `types.ts` (`DataStatus`, reused directly — no new confidence enum) | `Measurement<T>` — a generic "one real reading about any subject" shape (animal weight, grass cover, soil moisture, yield, ...), plus `reviseMeasurement()` (never-overwrite-provenance chain, matching `farmerAdjust`/`verify`/`reviseActualValue`). New closed vocabulary `MeasurementOrigin` (farmer_entered/phone_gps/farm_return_calculation/met_eireann/teagasc/satellite_estimate/laboratory_result/sensor/eid_or_weigh_head/imported_dataset/external_api/ai_inferred). Not a retrofit of the real, live `WeightObservation`/`livestock_weight_observations` — no persistence of its own yet. Every returned measurement's own `subject`/`evidence`/inherited `.previous` chain is deep-copied (current level) and frozen (`Object.freeze`, unconditionally, no shortcut) — a post-construction mutation attempt throws rather than silently reopening the farm-scoping invariant. |
| `external-reference.ts` | Checkpoint 1.5, 2026-09-08 | `subject.ts` (`SubjectRef`) | `ExternalSystemKind`/`ExternalReference` — a minimal, farm-scoped mapping from a Farm Return subject to an id in an external system (government animal system, EID, weigh head, accounting, machinery telemetry, laboratory). TypeScript contract only, no table, no integration — the general shape `jobs_weight_observation_reference.sql`'s own migration comment explicitly left room for without pre-empting it. |
| `evidence.ts` (extension) | Checkpoint 1.5, 2026-09-08, non-breaking additive change (`DOMAIN_CONTRACTS.md`'s own carve-out, no step-4 flag flip needed) | `source-register.ts` (`SourceId`, reused directly) | New `CalculationExplanation` (`inputs?`/`assumptions?`/`warnings?`/`sourceIds?`/`calculatedAt?`) and a new optional third parameter on `ok<T>(value, evidenceState, explain?)`, surfaced as `EngineOutcome`'s `"OK"` branch's own optional `explain?` field. Every existing call site (~75) is unaffected — `explain` is genuinely absent from the object unless a caller opts in (test-enforced). No existing calculation was changed to populate it. |
| `ai-context/index.ts` (`src/orchestration/`) | Checkpoint 1.5, 2026-09-08 | `farms.ts`/`fields.ts`/`livestock.ts`/`individual-animals.ts` (`src/lib/farm-data/`, all unmodified — no new query) | `FarmContext`/`buildFarmContext()`/`getFarmContextForCurrentUser()` — the farm-scoped read boundary for a future AI assistant (no LLM connected). Takes no caller-supplied farm id; always resolves the current authenticated session's own farm. `buildFarmContext` additionally re-filters every input collection against the requested `farmId` as defence in depth (test-enforced cross-farm regression case). Bounded snapshot (field/animal-group summaries + an animal count), not a database dump; weather/scientific-result/activity data is a disclosed future extension point, not yet included. |
| `field-awareness.ts` | Farm Awareness / Satellite Field Intelligence campaign, 2026-09-08 (Codex audit round 1: added `FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT` (40, disclosed) — the first version had no cloud-cover usability ceiling, so a fully cloud-obscured scene could be classified "current"/"high confidence"; `buildFieldAwarenessSnapshot` also now gives a distinct warning for `EngineOutcome`'s `UNKNOWN` status — a genuine provider outage — rather than reusing the "no observation found" wording a confirmed absence gets. Round 2: `classifyFieldAwarenessAttention` gained an `isProviderOutage` flag; `FIELD_AWARENESS_ACTIVITY_LOOKBACK_DAYS` (60) and an explicit most-recent-first sort added to `recentActivity`. Round 3: `classifyFieldAwarenessConfidence` simplified to freshness-only and never returns `"high"` from satellite evidence alone — round 2's own cloud-cover-based degradation was tried and rejected as still insufficient (scene-wide cloud cover cannot confirm field-level visibility at any threshold); `FieldAwarenessInputs` gained `recentActivityTruncated`, surfaced as a warning. Round 7: `FieldAwarenessInputs` gained `recentActivityUnavailable`, surfaced as its own distinct `FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING` — a genuine confirmed-activity read failure, never conflated with a real truncation) | `evidence.ts` (`EngineOutcome`/`isOk`/`unknown`, unmodified), `satellite-field-coverage.ts` (`SatelliteFieldCoverage` type, reused directly — that module itself gained a new export and two additive fields this campaign, see its own row below, but this file only ever consumes the type, not its selection functions), `job-actual.ts` (`ActivityType`/`CompletionType`, unmodified) | `FieldAwarenessSnapshot`/`buildFieldAwarenessSnapshot()` — a farm-scoped "what does Farm Return currently know about this field's monitoring" read model. Named "Field Awareness", not "Farm Awareness" (the campaign brief's own term), to avoid colliding with the existing, unrelated, already-shipped GPS Job Mode `startFarmAwareness` background-location capability. No field-specific vegetation signal exists to classify (real NDVI computation is blocked — `BLOCKERS.md`'s CDSE-credentials decision, not reopened here), so `freshness`/`attention`/`confidence` are derived entirely from real satellite-observation *currency*, never a fabricated crop-condition judgement — disclosed as product judgement in `docs/evidence-register.md`. Defensively re-filters `recentActivity` to its own `fieldId`, never trusting a caller's pre-filtering (test-enforced). See `docs/farm-return-next/FIELD_AWARENESS_ARCHITECTURE.md`. |
| `field-awareness/index.ts` (`src/orchestration/`) | Farm Awareness / Satellite Field Intelligence campaign, 2026-09-08 (Codex audit round 1: now calls `selectMostRecentUsableSatelliteCoverage`, not `selectBestSatelliteCoverage` — the latter always returns the least-cloudy real candidate however cloudy that candidate is; a real provider outage now returns `unknown("SATELLITE_PROVIDER_UNAVAILABLE")`, not the same `BLOCKED_INSUFFICIENT_EVIDENCE` a confirmed "no usable scene" case returns. Round 2: confirmed-activity matching also checked the Actual's own `payload.fieldIds`, alongside `primaryFieldId`. Round 3: `primaryFieldId` dropped from that match entirely — only `payload.fieldIds` (the confirmed Actual's own authoritative field list) is trusted now; the reader's own `truncated` flag is propagated through to a real snapshot warning. Round 5: the CDSE search now requests a disclosed, generous `FIELD_AWARENESS_SATELLITE_SEARCH_LIMIT` (100), wider than the STAC client's own `DEFAULT_LIMIT` (20), given the 30-day lookback window. Round 7: satellite coverage and confirmed-activity retrieval still resolve through one `Promise.all` (Codex audit LOW, round 10: an earlier version of this entry said they "no longer share one `Promise.all`", which was imprecise — the `Promise.all` itself is unchanged; what changed is that the activity promise now catches its own real database failure with `.catch` before `Promise.all` ever sees a rejection, so a real activity-read error can no longer discard otherwise-valid, already-resolved satellite coverage). The satellite fetch's own throw paths are deliberately left unwrapped — genuine caller-bug failures, not swallowed. Round 10: `FieldAwarenessCard.tsx` gained a `latestIdentityKeyRef` (updated in a `useLayoutEffect`) as defense-in-depth against a late-resolving fetch for a previously-selected field ever applying its result after switching to a different field — not confirmed as a reachable bug under React's own effect-cleanup-ordering guarantee, but cheap, correct, and independently verifiable regardless) | `farms.ts`/`fields.ts`/`job-sessions.ts` (`src/lib/farm-data/`, all unmodified — no new query), `cdse-stac-client.ts`/`field-boundary.ts` (unmodified), `satellite-field-coverage.ts` (`selectMostRecentUsableSatelliteCoverage`, new additive export, round-4 strengthened to full containment — see that module's own row below) | `getFieldAwarenessForCurrentUser(fieldId)` — resolves the current farm server-side, then re-verifies `fieldId` belongs to it via the already farm_id-scoped `listFieldsForFarm` (never a new raw `id`-only query, never RLS alone), before ever calling the satellite provider or reading confirmed activity. A field genuinely not found and a field belonging to another farm are indistinguishable to the caller (both `null`) — deliberate, gives a cross-farm attempt no signal. |
| `satellite-field-coverage.ts` (`selectMostRecentUsableSatelliteCoverage`, additive export; `SatelliteFieldCoverage` also gained `constellation?`/`processingVersion?`, additive) | Farm Awareness / Satellite Field Intelligence campaign, Codex audit round 1, 2026-09-08 (round 4: added a function-local, additional `booleanContains` full-containment requirement — a scene must genuinely contain the whole field, not merely intersect it, before counting as usable; `filterEligibleCandidates`'s own shared intersects check is unchanged. Round 5: `SatelliteFieldCoverage` gained `constellation`/`processingVersion` as additive, always-populated optional fields — real STAC data already present on `Sentinel2L2AItem` but never carried through, and named explicitly by the brief's own item 2) | none (shares this file's own existing `filterEligibleCandidates`/`toSatelliteFieldCoverage` private helpers, extracted from `selectBestSatelliteCoverage` without changing its behaviour or tests) | Selects the most recently *usable* real scene (full containment, cloud cover at/below a required, caller-disclosed `maxCloudCoverPercent` ceiling, most-recent-first, tie-break least cloud) rather than `selectBestSatelliteCoverage`'s existing least-cloud-globally-with-mere-intersection strategy — a genuinely different question ("how recently have we had a usable, whole-field look" vs. "what is the single clearest image overlapping this field at all, any age"). `selectBestSatelliteCoverage` itself is untouched — same signature, same behaviour, same 21 pre-existing tests all still pass unchanged; this is a purely additive second export, same precedent as `near-field.ts`'s `distanceToPolygonBoundaryKm`. |
| `nutrients.ts` (`knownFertiliserProductComposition`, additive export; `farmGrasslandAggregates`, additive export added round 10) | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08 (round 10: `farmGrasslandAggregates` added — the one real, authoritative home for the farm-wide grassland-area/non-grass-% aggregation every real caller of `calculateNutrientPlan` needs, after a *third* independent copy of the identical arithmetic was found in `src/domain/finance.ts`, Codex audit CRITICAL; `build-all.ts`'s own `computeFarmGrasslandAggregates` now delegates to it rather than keeping a second copy) | none (reads the existing, frozen `PRODUCTS` constant — the same three catalogue products `allocatePurchasedProducts` has always recommended from — never a second, independently-drifting copy of their N/P/K analysis) | Looks up one of the three real, verified fertiliser products' own N/P/K composition by exact name — `undefined`, never a fuzzy/guessed match, for anything else. The one real bridge between a farmer-confirmed Actual's free-text `product` field and a real nutrient contribution (`fertiliser-plan.ts` below). `calculateNutrientPlan`/`allocatePurchasedProducts` themselves are entirely unmodified. `farmGrasslandAggregates` is purely additive too — a pure `Field[]` → area aggregation, no dependency on any other campaign module, callable from both domain (`finance.ts`) and orchestration (`build-all.ts`) code since it lives at the correct, lowest layer. Round 25, 1 CRITICAL: the `PRODUCTS` catalogue's own `pricePerTonneEur` for all three products was the original Phase 1 mock market data (€480/€620/€555), reaching real signed-in farmer screens with no disclosure — fixed by importing `market.ts`'s own real, sourced CSO AJM09 fertiliser-price series (`latestPoint(CSO_COMPOUND_0_7_30/CSO_COMPOUND_18_6_12/CSO_UREA_46N)`), which has covered these exact three products since it shipped without ever being wired here. New dependency: `market.ts` (`latestPoint`, `CSO_COMPOUND_0_7_30`, `CSO_COMPOUND_18_6_12`, `CSO_UREA_46N`, all unmodified, no circular import since `market.ts` depends only on `types.ts`). Round 26, 1 CRITICAL: `calculateNutrientPlan` itself never checked `field.plannedUse` (a silage cut) against whether a real `silage` input was actually supplied — this app has no real, persisted `SilagePlan` source anywhere, so every real caller either omits `silage` or passes `silagePlans: []`, meaning a real silage field silently ran the grazing branch and got a full, actionable grazing-basis recommendation. Fixed with a new `silageEvidenceOk` check (a field's `plannedUse` is `silage_1st_cut`/`silage_2nd_cut`/`silage_3rd_cut` AND no `silage` object supplied) combined into a new `evidenceOk = fertilityEvidenceOk && silageEvidenceOk` gate covering `requirement`/`purchasedProducts`/`estimatedFieldCostEur`/`napCompliance` (new reason code `MISSING_SILAGE_PLAN_DATA`) — fixed inside the shared engine itself, not per-caller, so it reaches every one of this function's 9+ real call sites automatically. `organicApplication`'s own offset figures are deliberately ungated by this check: `slurryAvailableKgHa` is DM%/P/K-Index driven, not land-use dependent (verified by reading its own implementation, not assumed). Round 27, new additive export `isSilageCutPlannedUse(field)`: extracted the inline `plannedUse` check above into a shared, exported predicate — round 27's own audit found 6 more real call sites (`reports.ts`, `real-alerts.ts`, `RecommendationAuditTrailCard.tsx`, plus `fertiliser-recommendation.ts`/`finance.ts` via `requirement.status` instead) that needed the identical fact, and re-deriving it per site is exactly the class of drift this campaign keeps finding. Lives here, not in `fertiliser-recommendation.ts` alongside `isTillageField` — that orchestration-layer module already imports from this one, so the reverse import would be circular. Round 28, 1 CRITICAL: a field whose `plannedUse` has never been recorded at all (a real, common state for a brand-new field — `buildAllRealPrompts` has no `plannedUse` filter) was silently treated as confirmed grazing for its NAP compliance classification — `types.ts`'s own pre-existing `Field.plannedUse` doc comment already required treating this as unresolved for a legal/compliance calculation. Deliberately scoped narrower than the agronomic requirement (27 rounds of tested precedent already treat "grazing" as the correct disclosed default there, and the doc comment's own cited examples are compliance-specific — spec Section A2's two-ledger separation applies): fixed by reusing the existing `soilTestDisregarded`-style downgrade mechanism — a new `plannedUseUnresolvedReason` field on `NapComplianceCheck` (`types.ts`), downgrading `regulatory` to `"planning_advice"` when `field.plannedUse === undefined && !silage`, without changing `landUse`/the classification itself or the agronomic ledger at all. Round 31, new additive export `resolveFieldSlurryAllocation(allocations, fieldId)`: the real schema (`unique (field_id, housing_id)`) permits more than one real slurry allocation per field, but every one of 12 real call sites used a bare `.find()`, silently discarding a real second allocation from a different housing source. Sums every real, applicable (`priority !== "not_suitable"`) allocation's volume into the single combined input `calculateNutrientPlan` already knows how to consume — `applicationMethod` carried through only when every contributing allocation agrees, else `undefined` (fail closed, never guessed which method governs a combined volume). All 12 real call sites now share this one definition: `real-alerts.ts`, `reports.ts`, `build-all.ts`, `recompute.ts`, `fertiliser-plan/index.ts` (×2), `finance.ts` (×2), `NutrientsPageClient.tsx`, `RecommendationAuditTrailCard.tsx`, `FieldDrawer.tsx`, `silage/page.tsx`. Round 32, 1 HIGH: round 31's own fail-closed `applicationMethod: undefined` collapsed two genuinely different evidence states into one — "never captured" and "captured but genuinely conflicting across contributing allocations" — misleading a farmer who had in fact recorded two disagreeing methods into thinking nothing was recorded at all. Fixed with a new additive field, `applicationMethodConflict?: boolean`, on a new `ResolvedSlurryAllocation` type (`SlurryAllocation` plus that one flag) that `resolveFieldSlurryAllocation` now returns — `true` only when 2+ contributing allocations report genuinely different real captured methods (not merely when one is missing). `CalculateNutrientPlanInput.slurryAllocation` widened to accept either shape (structurally compatible, no call-site change needed). `input-gates.ts`'s `requireSlurryApplicationMethod` now reads this flag and returns a distinct `AMBIGUOUS`/`CONFLICTING_SLURRY_METHODS` outcome instead of the generic `BLOCKED_INSUFFICIENT_EVIDENCE`/`UNKNOWN_SLURRY_METHOD` when set — propagated automatically through `calculateNutrientPlan`'s existing `EngineOutcome<LessMethodGateOk>` `lessMethodCompliance` (no change needed there) and handled explicitly in `nutrient-plan-trace.ts`'s `buildLessMethodDecision` (see that row) as a new `DATA_REQUEST` decision, replacing a stale "not actually reachable" comment that predated this fix. |
| `PurchasedFertiliserCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 26, 2026-09-09 — pre-existing Codex-remediation-era component this campaign did not otherwise author, touched only for this one fix; had no dedicated test file before this round, one was added | `nutrients.ts` (`calculateNutrientPlan`'s `NutrientPlan.requirement`, already an existing dependency) | Was gated on a `fertilityEvidence` prop alone — round 26's new silage-evidence gate makes `products: []` for a blocked silage field whose `fertilityEvidence.status` is still `"OK"`, so this card rendered an empty table with a false "Estimated field cost €0" instead of the real reason. Fixed by replacing the `fertilityEvidence` prop with `requirement: NutrientPlan["requirement"]` and gating on `requirement.status !== "estimated"` instead — `calculateNutrientPlan` already forces this `"unavailable"` for either real blocking reason, with `requirement.source` carrying the correct, reason-specific message, so this card no longer needs to know which reason applies. |
| `NutrientRequirementCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 27, 2026-09-09 — pre-existing Real Farm V1 Phase 8 component this campaign did not otherwise author, touched only for this one fix; had no dedicated test file before this round, one was added | `nutrients.ts` (`calculateNutrientPlan`'s `NutrientPlan.requirement`, already an existing dependency) | Same gap and identical fix as `PurchasedFertiliserCard.tsx` above, one round later — this is the Nutrients screen's own primary N/P/K card, and was still gated on `fertilityEvidence` alone when round 27's audit found it, rendering a blocked silage field's N/P/K as "0" and "Total for field 0 kg". Fixed by gating on `requirement.status` instead. |
| `NapComplianceCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 29, 2026-09-09 — pre-existing V3 fix-era component; round 28 already added a dedicated test file for it, extended here | `nutrients.ts` (`calculateNutrientPlan`'s `NapComplianceCheck.regulatory`, already an existing dependency) | Correctly showed an "Unconfirmed" `Pill` when `regulatory !== "compliance_value"`, but the icon tone, the red N/P figures, and the exceedance paragraph all still rendered with the identical "risk"-severity styling and unconditional "reduce the plan" wording as a real confirmed violation. Fixed with a new `exceedanceTone` (`"risk"` only when both non-compliant AND confirmed, else this app's real intermediate `"attention"` tone when non-compliant but unconfirmed) applied to the icon and N/P figure colours, and qualified paragraph wording ("Based on an unconfirmed classification, planned application may exceed...") when unconfirmed. |
| `FieldDrawer.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 31, 2026-09-09 — pre-existing Real Farm V1 Phase 6 component this campaign did not otherwise author, touched only for this one fix | `nutrients.ts` (`resolveFieldSlurryAllocation`, new dependency for the underlying pattern — this component itself lists every real allocation rather than resolving one, so it doesn't call the resolver directly) | Showed/edited only the field's first real slurry allocation (`.find()`) regardless of how many real allocations exist for it — a field draining slurry from two real housing sources silently hid the second one's own application-method editor entirely. Fixed by rendering one real method selector per real allocation (`.filter()` instead of `.find()`), labelled with its own real volume whenever more than one exists, each independently editable via the existing `updateSlurryApplicationMethod(fieldId, housingId, ...)` mutation (already keyed by the composite `(field_id, housing_id)` the schema itself uses). |
| `finance.ts` (`calculateFarmFertiliserRequirement`/`calculateFarmSlurryNutrientValueEur`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 10, 2026-09-08 — pre-existing Phase 4/6 domain code this campaign did not otherwise author, touched only for this one fix (found by a deliberate hunt for a fifth instance of the "independent code path missing the gate" pattern rounds 6-9 each found once) | `nutrients.ts` (`farmGrasslandAggregates`, new dependency, replacing this file's own separate, identically-buggy inline duplicate) | These two whole-farm aggregations (reaching Dashboard/Finance/Input Planner) called `calculateNutrientPlan` for every field unconditionally — no tillage exclusion, no missing-livestock gate, the identical tillage-inclusive area bug rounds 5/9 already fixed elsewhere. Fixed by excluding a tillage field, and a *grazing* field when the farm has no recorded livestock, from both aggregations (a silage field is deliberately never excluded for missing livestock — silage N/P/K never depends on `livestockGroups`). The same functions' own disclosed mock `costEur`/`estimatedFieldCostEur` figures are deliberately left untouched — a real, pre-existing, already-disclosed limitation of this whole-farm surface (`docs/evidence-register.md`), the same class this campaign has left alone since round 5 (`PurchasedFertiliserCard.tsx`) — not a new surface it built. Round 22, 1 HIGH: `calculateFarmFertiliserRequirement` correctly excludes a blocked-evidence grazing field but disclosed nothing about it — `{byProduct: [], totalTonnes: 0, totalCostEur: 0}` looked identical to a genuinely complete zero-requirement farm. Fixed with a new `fieldsWithBlockedEvidence: number` field (never counting a tillage field, which is genuinely `NOT_APPLICABLE`, not blocked), consumed by `FertiliserSlurryCard.tsx`'s own new disclosure line — the identical disclosure discipline round 21 established for `getFarmFertiliserDemand`'s unconvertible confirmed quantities, applied here for the first time to a blocked-evidence field exclusion. Round 23, 1 HIGH: that new counter itself only tracked the missing-livestock exclusion — a field with recorded livestock but missing P/K Soil Index evidence (`plan.fertilityEvidence.status !== "OK"`) still silently contributed nothing with no disclosure. Fixed by counting that case too. Round 24, 1 HIGH: `calculateFarmSlurryNutrientValueEur` never got the `fieldsWithBlockedEvidence` disclosure at all — a real excluded field left "Slurry nutrient value €0" indistinguishable from a genuine zero saving. Fixed with a new `FarmSlurryNutrientValueResult { value, fieldsWithBlockedEvidence }` return type (previously a bare `TrackedValue<number>`, one real caller), consumed by a new `FertiliserSlurryCard.tsx` disclosure block. Implementing this also surfaced a genuine loop-ordering bug caught via a self-written test: the blocked-evidence checks originally ran before the slurry-applicability check, miscounting a field with no slurry allocated at all as blocked rather than not-applicable — fixed by reordering. Round 25, 1 HIGH: `calculateFarmFertiliserCostEur` (the Dashboard KPI's own source) called `calculateFarmFertiliserRequirement` and kept only `totalCostEur`, discarding `fieldsWithBlockedEvidence` entirely — `FertiliserSlurryCard.tsx` had already worked around this by calling the requirement function a second time just to recover it. Fixed: `calculateFarmFertiliserCostEur` now returns a new `FarmFertiliserCostResult { value, fieldsWithBlockedEvidence }` (previously a bare `TrackedValue<number>`); `FertiliserSlurryCard.tsx`'s own redundant second call removed. Round 27, 2 CRITICAL: both `calculateFarmFertiliserRequirement` and `calculateFarmSlurryNutrientValueEur` checked `plan.fertilityEvidence.status` alone, missing round 26's own new silage-evidence reason — a real silage-planned field with no matching real `SilagePlan` silently contributed zero products/€0 with nothing disclosing it. Fixed by switching both checks to `plan.requirement.status !== "estimated"` — a strict superset of the fertility-only check that already covers both real blocking reasons in one place (verified: `requirement.status` stays `"estimated"` for a genuine real zero — Index 4, commonage/buffer prohibition — so this is a correctness simplification, not just an addition). |
| `NutrientsPageClient.tsx` (`src/app/(app)/nutrients/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 10, 2026-09-08 (round 13, 1 MEDIUM: the "already planned" copy claimed "more than one planned application" for any `"ambiguous"` `MatchablePlanResult`, but that status also covers a truncation-caused inconclusive read with a `candidateCount` of 0 or 1 — fixed by checking `candidateCount >= 2` before making that specific claim, disclosing "couldn't safely check" otherwise) | `fertiliser-recommendation.ts` (`isTillageField`/`hasNoRecordedLivestock`, already an existing dependency since round 6) | Round 6's own fix (`canPlanFertiliserApplication`) only ever gated the "Plan this application" button — the requirement/NAP/organic-offset/purchased-product cards kept rendering `calculateNutrientPlan`'s own real output regardless, so a tillage field still showed a real grassland N/P/K recommendation and a farm with no recorded livestock still showed the clamped, presented-as-real 35 kg N/ha, for four Codex-audit rounds. Fixed: a new `showFertiliserRecommendation` gates the same four cards, rendering an honest "No fertiliser recommendation available" disclosure (naming the real reason) instead. Round 14, 1 HIGH (shared with `fertiliser-recommendation.ts`'s own row): this screen's own two direct `calculateNutrientPlan` calls (`plan`/`grazingOnlyPlan`, seeding both the display and the "Plan this application" sheet) had the identical missing-`pBuildUpCompliance` gap the orchestration layer had — fixed by passing `farm.pBuildUpCompliance?.value` to both, and by carrying the real `napCompliance` outcome through onto the sheet's own `FertiliserRecommendationSummary` prop. Round 15, 1 MEDIUM: `existingPlan`'s own reset effect had the identical stale-state bug `RemainingFertiliserRequirementCard.tsx`'s own row describes — it fired only on `!isRealMode || !field`, never on a plain field switch, so the previous field's own "already planned" disclosure/button label stayed rendered under a new field until its lookup resolved, letting a farmer save a real nuisance-duplicate plan before the disclosure caught up (reintroducing exactly what rounds 4-5 built it to prevent). Fixed identically: `existingPlan` resets unconditionally at the top of the effect. Round 19, 1 HIGH: `existingPlan === undefined` still conflated "not yet queried" with "lookup still in flight" and "lookup genuinely failed" — the "Plan this application" button rendered as a plain, always-enabled button in all three, letting a farmer persist a real duplicate Decision before (or despite) the lookup ever settling — a new instance of the round-13 `GpsActivityCandidateCard` bug shape, found here for the first time despite rounds 15/17/18 each reviewing this component. Fixed with the identical `matchablePlanLoading`-style pattern: a new `existingPlanLoading` disables the button and shows "Checking…"; a new `existingPlanCheckFailed` shows the existing honest "couldn't safely check" copy but leaves the button enabled afterward (a failure isn't itself unsafe, only unverified — an indefinite block would trap a farmer who has never planned this field at all). Round 24, 1 HIGH: `showFertiliserRecommendation` was reused for two gates with two different correct answers — the display gate should carry the round-10 silage exemption (silage N/P/K never depends on `livestockGroups`), the "can plan a purchased-product application" gate should not (planning a purchase genuinely requires livestock regardless of a silage plan). A real silage field with no recorded livestock had its entire requirement/NAP/product card hidden. Fixed by splitting into two independent booleans: `showFertiliserRecommendation` now includes `|| silagePlan !== undefined`; a new `canPlanFertiliserApplication` re-checks `!noLivestock` directly. |
| `fertiliser-plan.ts` | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08 | `nutrients.ts` (`knownFertiliserProductComposition`, unmodified), `evidence.ts` (`EngineOutcome`/`isOk`/`ok`/`blockedInsufficientEvidence`, unmodified) | `nutrientContributionFromFertiliserActual`/`sumConfirmedFertiliserApplications`/`calculateRemainingFertiliserRequirement` (campaign item 14's "remaining requirement" — Recommended vs Planned vs Actual never collapsed into one mutable value) and `aggregateFarmFertiliserRecommendation`/`totalProductQuantityKgByProduct`/`aggregateFarmFertiliserDemand`/`toFarmInputDemand` (items 19/20's farm-wide demand, shaped for a future commercial demand-aggregation system). Every function pure, no I/O — real farm-scoped reads live in `src/orchestration/fertiliser-plan/index.ts`. Fails closed to `BLOCKED_INSUFFICIENT_EVIDENCE` for any product/quantity/unit this app cannot honestly resolve (`docs/evidence-register.md`'s own new entry has the full account) — never a guessed composition or a fabricated bag weight. |
| `fertiliser-recommendation.ts` (`src/orchestration/prompt/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08 (Codex audit CRITICAL round 5: `estimatedFieldCostEur` — built from `nutrients.ts`'s own disclosed mock `PRODUCTS` prices — removed entirely from `FertiliserRecommendationSummary`, the Prompt's own description text, and the persisted Decision's `estimateSnapshot`; this vertical's own new surfaces never carry a mock monetary figure with the same evidentiary weight as the real N/P/K requirement beside it. Round 6, 3 CRITICAL: round 5's own fix was incomplete — every entry in `products` still carried its own real `costEur`, fixed with a new, exported `sanitiseRecommendedProduct` (`FertiliserRecommendationSummary.products` is now `FertiliserRecommendationProduct[]`, `FertiliserProduct` minus `costEur`), reused by `NutrientsPageClient.tsx`'s own separate client-side recommendation prop; a tillage field could receive and persist a grazing-based recommendation this app has no table for, fixed with a `field.plannedUse?.value === "tillage"` gate returning `NOT_APPLICABLE("TILLAGE_FIELD_NOT_SUPPORTED")` before `calculateNutrientPlan` is ever called; an empty `livestockGroups` read produced a concrete, actionable 35 kg N/ha via `nGrazingSucklerToBeefKgHa`'s own clamp-to-minimum behaviour (no real "0 LU/ha" row exists), fixed with `BLOCKED_INSUFFICIENT_EVIDENCE("MISSING_LIVESTOCK_DATA")` scoped only to the branch that would otherwise become `OK`. Round 8, HIGH: the tillage/missing-livestock predicates this module already enforced internally were being independently re-derived by `getFarmFertiliserDemand` — now exported as `isTillageField`/`hasNoRecordedLivestock`, the one real, authoritative home for both, reused by `fertiliser-plan/index.ts` and `NutrientsPageClient.tsx`'s own client-side gating instead of each re-deriving the rule. Round 14, 2 HIGH: `FertiliserRecommendationSummary` gained `napCompliance: EngineOutcome<NapComplianceCheck>` (copied verbatim from `plan.napCompliance`, previously discarded entirely) — a real NAP-ceiling breach now reaches this Prompt's description as a warning (disclosure, not suppression, per spec Section A2's own two-ledger separation), and every caller building this type (`NutrientsPageClient.tsx`'s own separate `FertiliserPlanSheet` recommendation prop included) had to supply it. Separately, `promptForFertiliserRecommendation` gained a trailing optional `pBuildUpCompliance` parameter (new exported type `PBuildUpComplianceInput`), threaded from the real `Farm.pBuildUpCompliance` at every real call site (`build-all.ts`, `recompute.ts`, `fertiliser-plan/index.ts`'s `getFarmFertiliserDemand`, `NutrientsPageClient.tsx`) — previously no parameter existed for it at all, forcing every farm down the "not proven" Article 17(6) P route regardless of actual recorded compliance. Separately, 1 MEDIUM: `recompute.ts`'s `fertiliser_recommendation` branch received a real, injectable `input.now` but passed `undefined` as `asOfDate`, so soil-test-age validity fell back to the process clock while the Prompt's own `createdAt`/`inputsSnapshot` used the real supplied date — fixed by threading `input.now` through as `asOfDate` too) | `nutrients.ts` (`calculateNutrientPlan`, unmodified — this producer makes no agronomic decision of its own, only classifies the real `NutrientPlan` it already computed) | `promptForFertiliserRecommendation`/`validateFertiliserPlanEdits`/`sanitiseRecommendedProduct`/`isTillageField`/`hasNoRecordedLivestock` — the fifth real Prompt producer `buildAllRealPrompts` fans out per field, and the one new farmer-editable surface on top of it ("Plan this application", campaign items 3/4). `validateFertiliserPlanEdits`'s allowlist (`plannedProduct`/`plannedQuantityKg`/`plannedDate`) is disclosed as product judgement, not science, in `evidence-register.md`. Deliberately calls `calculateNutrientPlan` with `silage: undefined` always — no real, persisted `SilagePlan` exists anywhere in this app for a server-side producer to consult (`mockSilagePlans` is client-store-only mock data), a disclosed scope limit, not an oversight — see `FERTILISER_VERTICAL_PHASE0.md`. Round 27, 1 HIGH: this deliberate `silage: undefined` scope limit meant round 26's own new silage-evidence gate fired for every real silage-planned field passed through here — but this producer's own `basis` classification never checked for it, so the resulting empty `purchasedProducts` fell into the `NOT_APPLICABLE("NO_FERTILISER_CURRENTLY_RECOMMENDED")` branch, misclassifying a real "cannot calculate" case as a real zero — which silently undercounted `getFarmFertiliserDemand`'s own `fieldsWithBlockedEvidence` (it only increments for a genuinely `BLOCKED_INSUFFICIENT_EVIDENCE` basis). Fixed by checking `plan.requirement.status !== "estimated"` between the existing fertility check and the NOT_APPLICABLE branch, returning `BLOCKED_INSUFFICIENT_EVIDENCE("MISSING_SILAGE_PLAN_DATA")` — verified to propagate into `getFarmFertiliserDemand`'s own count automatically, with a dedicated end-to-end test. Round 29, 1 HIGH: `describeFertiliserRecommendationOk`'s own NAP-ceiling warning text stated a definitive statutory fact ("this exceeds the statutory NAP ceiling") even when `napCompliance.value.regulatory` is only `"planning_advice"` (round 28's own new unresolved-plannedUse reason, or a disregarded soil test) — fixed by checking `regulatory === "compliance_value"` and qualifying the warning ("may exceed... isn't confirmed yet") when it isn't. |
| `fertiliser-plan/index.ts` (`src/orchestration/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08 (Codex audit round 1: field attribution moved from `job_sessions.primaryFieldId` to the confirmed Actual's own real `payload.fieldIds`, multi-field Actuals excluded rather than guessed, a calendar-year season boundary added. Round 2: the season boundary and `did_not_happen` exclusion extended to the farm-wide aggregator; an already-linked plan excluded from the farm-wide planned total. Round 3: that exclusion corrected to use `listActiveJobSessionsForFarm`/confirmed sessions, never `listJobSessionDecisionIdsForFarm` alone — a plan linked only to a *cancelled* session must not vanish from demand, since a cancelled job produced no real Actual. Round 7, 1 CRITICAL + 1 HIGH: `getFarmFertiliserDemand` called `calculateNutrientPlan` for every field unconditionally, bypassing round 6's own tillage/missing-livestock fail-closed gates (which live only in `promptForFertiliserRecommendation`) — fixed by excluding a tillage field, and every field when the farm has no recorded livestock, from this aggregation too; separately, a bare `accepted` Decision whose own recommendation named exactly one product now also counts toward "Planned", reconciling round 2's own exclusion with round 4's later `isUnambiguouslySingleProductPlan` refinement. Round 8, 1 CRITICAL + 1 HIGH: "Planned" itself never checked whether a Decision's own field was currently recommendable — a third active/executable interpretation path for a legacy tillage/no-livestock plan — fixed by gating "Planned" on the identical field-eligibility set "Recommended" already computes; separately, the inline tillage/missing-livestock re-derivation was replaced with calls to `fertiliser-recommendation.ts`'s own newly-exported `isTillageField`/`hasNoRecordedLivestock`, closing the drift risk at its source. This module also gained an exported `sanitiseDecisionRecordForClient` (moved here from `src/app/actions/fertiliser-plan.ts`, a `"use server"` module that cannot export a synchronous function), now the one real, shared sanitiser both that file's two actions and `src/app/(app)/records/page.tsx` call before any persisted Decision reaches a client. Round 9, 1 HIGH: round 8's own eligibility gate (`isTillageField`/`hasNoRecordedLivestock` alone) was not equivalent to a full recompute — a field newly missing soil evidence, at Index 4, or under a new commonage/buffer prohibition still counted toward both Recommended and Planned. Fixed: this function now calls `promptForFertiliserRecommendation` itself, per field, and uses its real `basis.status === "OK"` as the one authoritative eligibility signal, replacing the two narrower predicates entirely — `calculateNutrientPlan` still produces the actual Recommended quantity, unchanged. Round 13, 1 HIGH: "Planned" still never applied round 10's own `isPlanProductStillRecommended` rule — it checked only field eligibility ("some recommendation exists"), never whether the stored plan's own selected product remained among that recommendation's real products, so a historical plan's product could stay counted after the live blend changed. Fixed: now captures each recommendable field's own real `FertiliserRecommendationSummary` (a `Map<fieldId, FertiliserRecommendationSummary>`, not just a `Set<fieldId>`) and checks every planned quantity's product against it before counting. Round 14, 1 HIGH + 1 MEDIUM: `FarmFertiliserDemandInput` gained an optional `pBuildUpCompliance`, threaded to both this module's own `calculateNutrientPlan`-adjacent calls (the eligibility check and the second call producing the Recommended aggregation) and supplied by both real callers (`getFarmFertiliserDemandAction`/`getFarmContextForCurrentUser`) from the real `Farm` record — previously never supplied at all. Both calls also now pass `asOfDate: now` instead of `undefined`, so soil-test-age validity uses the same real, injectable date this function's own season boundary already does, not the process clock. Neither fix is independently observable from this function's own return shape today (kg totals only) — both inputs only ever change `napCompliance`, computed internally here for the product-membership check but never exposed — disclosed honestly in `evidence-register.md` rather than backed by a synthetic test. Round 15, 1 MEDIUM: the planned-decision candidate derivation itself required BOTH `edits.plannedProduct` and `edits.plannedQuantityKg` to trust an explicit edit, silently excluding a real product-only edit from Planned entirely and, symmetrically, ignoring a real quantity-only override in favour of the original recommended quantity — inconsistent with round 14's own Confirm Actual prefill fix, which correctly supports both independently. Fixed by extracting the shared `selectedProductName` fallback (previously only in `src/app/actions/fertiliser-plan.ts`, see that row) into this module, exported and reused by both files — quantity now resolved independently of product (the farmer's own override first, that specific resolved product's own real recommended `totalKg` otherwise. Round 21, 1 MEDIUM: a real confirmed Actual whose quantity `totalProductQuantityKgByProduct` couldn't resolve to a real kg figure (an unverified "bags" unit) silently vanished from `confirmedTotals` with nothing on this function's own return value disclosing it — fixed with a new `applicationsWithUnknownComposition: number` field, computed via `fertiliser-plan.ts`'s new `countUnresolvedFertiliserQuantities` over `confirmedQuantities`, the farm-wide equivalent of `getFieldRemainingFertiliserRequirement`'s own identical field-level disclosure. Round 22, 1 HIGH: the "Recommended" total had the identical undisclosed-exclusion gap round 21 fixed for confirmed quantities but this function itself never got — a field excluded via `BLOCKED_INSUFFICIENT_EVIDENCE` (missing livestock) vanished from `currentRecommendationsByFieldId` with nothing on this function's own return value disclosing it. Fixed with a new `fieldsWithBlockedEvidence: number` field, counted only for a genuine `BLOCKED_INSUFFICIENT_EVIDENCE` classification — never a tillage/no-purchase-needed field, both `NOT_APPLICABLE`)) | `fertiliser-plan.ts` (all pure arithmetic, unmodified except its own additive `countUnresolvedFertiliserQuantities` export, round 21), `nutrients.ts` (`calculateNutrientPlan`, unmodified), `build-all.ts` (`computeFarmGrasslandAggregates` — fixed, Codex audit HIGH round 5: previously included tillage ground in the farm's grassland area, a pre-existing bug this campaign's function had faithfully reproduced; now subtracts each field's own real tillage area, and `NutrientsPageClient.tsx`'s own separate, identically-buggy inline duplicate was removed in favour of calling this one shared, corrected function — extracted, not duplicated, so this module's farm-wide aggregation uses the identical real figure `buildAllRealPrompts` does), `fertiliser-recommendation.ts` (`promptForFertiliserRecommendation`/`sanitiseRecommendedProduct`), `job-sessions.ts`/`decisions.ts` (`src/lib/farm-data/`, unmodified) | `getFieldRemainingFertiliserRequirement`/`getFarmFertiliserDemand`/`sanitiseDecisionRecordForClient` — the real, farm-scoped I/O layer over `fertiliser-plan.ts`'s pure functions. A plain `accepted` Decision with no explicit `edits.plannedProduct`/`plannedQuantityKg` and no real single-product recommendation snapshot is deliberately excluded from the farm-wide *planned* total (disclosed product judgement, `evidence-register.md`) — it still counts toward *recommended* (when the field itself is currently recommendable). Surfaced a real, pre-existing, disclosed `job_sessions` schema limitation (round 3, not introduced by this campaign): the database's own `unique(decision_id)` constraint means a plan can never be relinked to a second job session, cancelled or not — see `FERTILISER_VERTICAL_ARCHITECTURE.md`'s own "Known limitations". Round 40, 1 HIGH: `actualFieldIds` read a confirmed Actual's own `payload.fieldIds` without deduplicating — a duplicated single-field reference (persisted by a pre-fix row, or any future caller) satisfied neither the single-field inclusion check nor the multi-field exclusion check correctly, silently misclassifying it. Fixed with a defensive `Array.from(new Set(...))` on this read side too, alongside the real fix at the persistence source (`job-actuals.ts`, see that row). Round 41, 1 LOW: `getFarmFertiliserDemand`'s own confirmed-Actual season boundary independently called `new Date()` again instead of reusing the `now` it already captures for its recommendation/evidence calculations — the same clock-consistency gap rounds 14/20 already fixed elsewhere in this function. Fixed by reusing `now`. Round 42, 1 HIGH: both `getFieldRemainingFertiliserRequirement` and `getFarmFertiliserDemand` filtered a confirmed Actual by `confirmedAt >= seasonStartIso` only, never an upper bound — a caller-supplied future-dated `confirmedAt` still counted as already applied when computing today's remaining requirement. Fixed by also requiring `confirmedAt <= asOfIso`/`<= now` in both, using the same already-captured date reference each function uses elsewhere. Round 45, 1 MEDIUM: both filters compared `confirmedAt`/`seasonStartIso`/`asOfIso` as bare strings, but `isValidIsoUtcDateTime` permits multiple valid representations (whole-second vs fractional-second) that don't necessarily compare correctly lexicographically. Fixed with a new local `isoToEpochMs` helper applied to every comparison on both bounds. |
| `job-session/index.ts` (`startJobSessionFromPlan`, additive export) | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08 | `decide/index.ts` (`decideAsFarmer`, unmodified — this function deliberately never calls it, since the plan Decision it links to already exists), `job-sessions.ts` (`insertJobSession` via the existing private `createJobSessionFromDecision`, unmodified) | Starts a Job Session from an **already-existing, already-persisted, accepted** plan Decision — campaign item 10's GPS Job Mode connection. Never calls `insertDecision` (the plan was already inserted at "Plan this application" time; inserting it again would fabricate a second historical decision event for the same real plan — item 25). `origin: "plan"` on `job_sessions` existed at the schema level before this campaign but had no real, distinct caller — `startJobSessionFromPrompt`'s own `origin` narrowed to literal `"prompt"` in the same change so the two meanings can never be conflated (disclosed, `evidence-register.md`). Round 38, 1 HIGH (`confirmJobSessionActualAction`, this file's own pre-existing Confirm Actual entry point, not otherwise authored by this campaign): already bound `activityType` to the session's own real value, but never did the same for `raw.fieldIds` — a confirmed fertiliser Actual could be attributed to a real, farm-owned field the completed session was never actually about, silently crediting that unrelated field's remaining-requirement instead of the genuine one. Fixed by binding every submitted field id to the session's own authoritative field scope (`primaryFieldId` plus any real recorded `fieldSegments`) before any other validation runs, applied generically (every field-scoped activity type, not fertiliser-specific). This function had zero direct tests anywhere before this round — added the first ones. Round 39, 1 HIGH: this inline field-scope check never covered `applyQueuedJobActualConfirmationAction`'s offline-sync path (`src/app/actions/job-sessions.ts`), which calls `job-actuals.ts`'s own `confirmJobSessionActual` directly, bypassing this orchestration function entirely — reproducing round 38's defect specifically offline. Fixed at the real shared root instead: moved into `confirmJobSessionActual` itself as a new exported `assertFieldIdsWithinSessionScope` (see that module's own row below); this function now calls that same shared implementation (new dependency) rather than keeping its own independently-derived copy. |
| `job-actuals.ts` (`src/lib/farm-data/`, `assertFieldIdsWithinSessionScope`, additive export) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 39, 2026-09-09 — pre-existing GPS Job Session + Confirm Actual contract module this campaign did not otherwise author, touched only for this one fix | none (pure, reads only the `session` object its own caller, `confirmJobSessionActual`, already fetched via `getJobSessionById`) | The one real, shared implementation of "every submitted fieldId must belong to the specific session being confirmed, not merely the current farm" — called inside `confirmJobSessionActual` itself (the one real choke point every Confirm Actual caller, online or offline, already funnels through) right alongside its own pre-existing `activityType` binding check, and reused by the orchestration layer's `confirmJobSessionActualAction` (`job-session/index.ts`, see that row above) as defense in depth. Deliberately filters out non-string entries rather than rejecting them — `reconcileAndVerifyPayload` (this same file, pre-existing, Codex audit HIGH round 3) already throws its own more specific error for a malformed identifier type; this function's only job is real string field ids against the session's real scope. Round 40, 1 HIGH (`reconcileAndVerifyPayload`, this same file's own pre-existing area-reconciliation function): deduplicated `fieldIds` only for its own local whole-field area sum, never for the *persisted* payload — a duplicated single-field reference (`["field-7", "field-7"]`) was stored unchanged, then misclassified as multi-field downstream (`fertiliser-plan/index.ts`, see that row). Fixed by persisting the same deduplicated list already computed, regardless of completion type. Round 41, 1 HIGH (`payloadForComparison`, this same file's own pre-existing id-first retry-safety helper): round 40's fix broke retry idempotency — the raw, still-duplicate-bearing input compared against the already-deduplicated stored row, wrongly rejecting a genuine retry as "different content". Fixed by having this shared comparison function also normalise `fieldIds` on both sides, the same way it already strips the analogous server-derived area key (`DERIVED_AREA_KEYS`). Round 43, 1 HIGH: round 42 stopped a future-dated Actual from affecting current calculations but never stopped the record itself from being created — a farmer or clock-skewed client could persist a real `confirmed_actual` fact dated in the future, which would silently start reducing the requirement once the clock reached it, with no further confirmation. Fixed by rejecting a genuinely new submission (never a retry — placed after the existing id-first retry-safety branch) whose `confirmedAt` is later than the real, captured server time or isn't a real date, never silently clamping it to "now". Round 44, 1 MEDIUM: that gate validated via `new Date(...)`, which silently normalises a calendar-invalid value instead of rejecting it, then persisted the original unnormalised string regardless — validating a different representation than what was written. Fixed by requiring the existing, strict `isValidIsoUtcDateTime` (`src/domain/iso-datetime.ts`, new dependency, unmodified) before the numeric comparison. |
| `job-sessions.ts` (`src/lib/farm-data/`, `listConfirmedJobSessionsForFarm`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 50, 2026-09-09 — pre-existing GPS Job Session Records reader this campaign did not otherwise author, touched only for this one fix; this campaign's first real migration | `supabase/migrations/20260909210000_list_confirmed_job_sessions_by_current_actual.sql` (new function `list_confirmed_job_session_ids_by_current_actual`) | The confirmed-session cap (`MAX_CONFIRMED_JOB_SESSIONS`) selected which 200 rows survive using `session.updated_at` — a database write timestamp round 49 already established is the wrong chronological identity for a confirmed record (its real one is the current Actual's own `confirmed_at`). Once a farm has more than 200 confirmed sessions, an old application whose session was merely touched later could permanently displace a genuinely newer one from ever being fetched — not recoverable client-side. PostgREST's embedded-resource `.order()` cannot order parent rows by an aggregate of a child column, so a real server-side fix (a new Postgres function, `security invoker`, matching this schema's own settled precedent against `security definer`) resolves the correct order/cap first and returns only ids; the existing embedded-select then fetches the full rows for exactly those ids, re-ordered client-side to match. Status `PENDING_DEV_VALIDATION` — no `Farm Return V1 Dev` credentials in this session to apply/verify it, matching every other unvalidated migration in this schema's history. Round 51, 1 LOW: `confirmed_at` is a real, farmer-supplied value, not a unique key — a tie at the exact 200-session boundary had no guaranteed row order, so the surviving session could differ between otherwise-identical reads. Fixed by adding `js.id desc` as a deterministic secondary sort key, edited into the same still-unapplied migration file. |
| `fertiliser-plan.ts` (`src/app/actions/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08 (Codex audit round 1: GPS-plan matching now fails to `"ambiguous"`, never a false `"matched"`, when either underlying real read was truncated; `startJobSessionFromPlanAction`'s `activityType` narrowed to the literal `"fertiliser_spreading"`. Round 2: Confirm Actual prefill now uses `decisions.ts`'s new `getDecisionById`, not the capped `listDecisionsForFarm`. Round 4: GPS-plan matching and `startJobSessionFromPlanAction` both gained `isUnambiguouslySingleProductPlan` — a bare-accepted, genuinely multi-product Decision is never GPS-matchable, disclosed in `evidence-register.md`. Round 7, 3 CRITICAL: a new `isPlanStillCurrentlyRecommendable` — reruns the field's own real, current recompute before treating any plan as matchable/startable, since a plan accepted before round 6's tillage/missing-livestock gates existed can still carry a real, frozen `"OK"` snapshot built from a since-recognised-invalid basis — applied to both `getMatchablePlanForFieldAction` and `startJobSessionFromPlanAction`; a new `sanitiseDecisionRecordForClient` and a `sanitiseRecommendedProduct` call strip a legacy persisted Decision's own real per-product mock `costEur` defensively at this file's two client-facing read boundaries, regardless of whether the specific snapshot predates round 6's own fix. Round 8: `sanitiseDecisionRecordForClient` itself moved out of this file into `fertiliser-plan/index.ts` — a `"use server"` module's every export becomes a callable Server Action, which must be async; this plain, synchronous sanitiser could not live here as an export — imported back in for the same two call sites, no behaviour change. Round 10, 1 HIGH: `isPlanStillCurrentlyRecommendable` only ever checked `basis.status === "OK"` — some real recommendation exists for the field — never whether the stored plan's own selected product remains among it. Split into `getCurrentFertiliserRecommendation` (returns the live recommendation itself) plus a new, pure `isPlanProductStillRecommended`, applied to every candidate in `getMatchablePlanForFieldAction` (computed once per field, not once per candidate) and as defense in depth in `startJobSessionFromPlanAction`. Round 14, 1 HIGH: `getLinkedFertiliserPlanForJobSessionAction` only ever read explicit `edits.plannedProduct`/`plannedQuantityKg`, leaving both `undefined` for a bare "accept as recommended" single-product plan even though that exact pair is already treated elsewhere as authoritative enough to count toward Planned demand and GPS-match/start a job — `ConfirmActualSheet` therefore prefilled nothing, letting a farmer confirm an unresolved-composition Actual. Fixed by reusing `selectedProductName` (this file's own established single-product fallback) for `plannedProduct`, and falling back to that product's own real `totalKg` for `plannedQuantityKg` whenever no explicit override exists — covers both the bare-acceptance case and a farmer who named a product but never overrode its quantity. Round 15: `selectedProductName` itself moved out of this file into `fertiliser-plan/index.ts` (exported) — `getFarmFertiliserDemand` needed the identical real fallback rule, which it previously lacked, reproducing an inconsistent narrower check instead; imported back into this file for its own two existing call sites, no behaviour change here. Round 20, 1 LOW: `getFieldFertiliserStatusAction` captured a real `now` for its recommendation recompute but never threaded that same value into `getFieldRemainingFertiliserRequirement`'s own `asOfDate`, which independently read the process clock for its confirmed-session season boundary — a request straddling a calendar-year rollover could combine two different years' evidence. Fixed by threading the same captured `now` through, the identical discipline round 14 already required for every other deterministic recompute path) | `decisions.ts`/`job-sessions.ts`/`fields.ts`/`livestock.ts`/`slurry.ts`/`farms.ts` (`src/lib/farm-data/`, `getDecisionById` the one new additive export — see that module's own row below), `job-session/index.ts` (`startJobSessionFromPlan`), `fertiliser-plan/index.ts` (`getFieldRemainingFertiliserRequirement`/`getFarmFertiliserDemand`/`sanitiseDecisionRecordForClient`), `fertiliser-recommendation.ts` (`recomputePromptByKind` via `./recompute`, `sanitiseRecommendedProduct`) | `getMatchablePlanForFieldAction`/`startJobSessionFromPlanAction`/`getLinkedFertiliserPlanForJobSessionAction`/`getFieldFertiliserStatusAction`/`getFarmFertiliserDemandAction` — every real GPS-plan-matching, Confirm-Actual-prefill, and remaining-requirement/demand action this campaign adds. GPS-plan matching returns `"ambiguous"`, never an auto-selected guess, whenever more than one real candidate plan exists for a field (item 11, disclosed in `evidence-register.md`). Every read is farm-scoped via `getFarmForCurrentUser()` first, matching every other action in this file (item 23). Round 22, 1 HIGH: `getFarmFertiliserDemandAction`'s own `FarmFertiliserDemandActionResult` never propagated `getFarmFertiliserDemand`'s new `fieldsWithBlockedEvidence` count — fixed additively, same pattern as `truncated`/`applicationsWithUnknownComposition`. Round 32, 1 HIGH: `startJobSessionFromPlanAction` — this file's one real boundary that turns an accepted fertiliser Decision into an actual active Job Session — never consulted the statutory closed-period calendar at all, despite this function's own extensive established "re-verify every real condition at the actual execution boundary" pattern; the plan sheet's own display of the spreading window (`FertiliserPlanSheet.tsx`) is purely informational and was never wired as a gate. A GPS-detected or directly invoked plan start could turn a valid nutrient plan into real, executed chemical-fertiliser spreading during a legally prohibited period (S.I. 588/2025). Fixed with a new call to `checkClosedPeriodCalendar`/`normaliseCountyForZoneLookup` (`closed-period-calendar.ts`, unmodified — identical to `real-alerts.ts`'s own established direct-call pattern) immediately before this function's final `startJobSessionFromPlan` call, failing closed on both `LEGAL_PROHIBITION` and any unverifiable county-zone evidence. |
| `job-sessions.ts` (`src/app/actions/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 8, 2026-09-08 — pre-existing, cross-cutting file this campaign did not otherwise author, touched only for this one fix | `fertiliser-recommendation.ts` (`FERTILISER_RECOMMENDATION_PROMPT_KIND`, already an existing dependency, unmodified) | `startJobSessionFromPromptAction` never validated `activityType` against `promptKind` for any of its five recomputable Prompt kinds; this campaign's own addition of `fertiliser_recommendation` to `RecomputablePromptKind` newly routes a real fertiliser recommendation through this pre-existing action, so a direct caller could submit any `activityType` alongside it, producing a real accepted fertiliser Decision linked to a semantically unrelated job. Fixed with one narrow check requiring `activityType === "fertiliser_spreading"` whenever `promptKind === "fertiliser_recommendation"` — the identical mismatch `startJobSessionFromPlanAction`'s own round-1 fix already closed for the plan-specific path. Deliberately scoped to only this one Prompt kind: the other four kinds' own activityType semantics predate this campaign and are out of its authority to redesign. Round 32, 1 HIGH (extending the same round-32 finding fixed in `fertiliser-plan.ts`'s row above): `startJobSessionFromPromptAction` is a second, structurally identical real execution boundary — it recomputes a `fertiliser_recommendation` Prompt and immediately constructs+persists a new accepted Decision plus an active Job Session, but that recompute (the separate, purely informational `spreading_window` Prompt kind owns the calendar check, not this one) never consults the statutory closed-period calendar either. Fixed with the identical `checkClosedPeriodCalendar` check, scoped to `promptKind === FERTILISER_RECOMMENDATION_PROMPT_KIND`, matching this function's own existing narrow-scope precedent for the activityType check immediately above it. Round 33, 2 HIGH: found this file's two remaining real fertiliser-spreading job-start boundaries with the identical gap. `startManualJobSessionAction` — the real fallback `GpsActivityCandidateCard.confirm()` calls whenever GPS plan matching returns `"none"`/`"ambiguous"` — starts an active Job Session from `constructManualJobStartDecision`'s bare, ungated `{manual: true, activityType}` Decision (correct for most activity types, wrong for `fertiliser_spreading`). Fixed by adding the identical `recomputePromptByKind`(`FERTILISER_RECOMMENDATION_PROMPT_KIND`)/`checkClosedPeriodCalendar` pair, scoped to `activityType === "fertiliser_spreading"`, requiring a real `primaryFieldId` (every gate is field-scoped); a new shared `describeBlockedFertiliserBasis` helper produces one honest message per real `EngineOutcome` status, deliberately letting `NOT_APPLICABLE`/`TILLAGE_FIELD_NOT_SUPPORTED` through (a scope limitation, not a prohibition) while blocking every other non-OK status. `applyQueuedManualJobSessionStartAction` (the offline-sync twin) had the identical gap, independently exploitable even after the online fix since it bypasses that action entirely — its own architecture was justified by this file's header claiming "a manual job's lifecycle carries no scientific evidence to fabricate," now corrected as false for this one activity type. Fixed by re-running the same two checks, dated to the queued `decision.decidedAt` rather than sync-time `now()` (a real, disclosed, narrower-than-ideal fix: fails closed by refusing to sync at all rather than authorising an unverifiable claim — see `FERTILISER_VERTICAL_ARCHITECTURE.md`'s "Known limitations"). Round 34, 1 HIGH: round 33's own offline-sync fix validated `decision.fieldId`'s evidence but never verified the *persisted* `jobSession` actually corresponded to the Decision validated — both are independently client-supplied on this path, so a queued payload could pair a real, gate-passing Decision for field A with a Job Session claiming a different `primaryFieldId`/`decisionId`/`fieldSegments` entry, persisting a real active fertiliser-spreading session for an unvalidated field. Fixed by requiring `jobSession.decisionId === decision.id`, `jobSession.primaryFieldId === decision.fieldId`, and every `fieldSegments[].fieldId` equal to that same field, rejected before any gate runs. Round 35, 1 HIGH: id/field binding alone wasn't enough — a queued `decision` could still carry matching ids while its `calculationKind`/`outcome`/`estimateSnapshot` claimed something else entirely (unrelated kind, dismissed outcome, fabricated basis), and the gates (which only read `fieldId`/`decidedAt`) would still run and pass. Fixed with a new `isCanonicalManualFertiliserStartDecision` check requiring the exact shape `constructManualJobStartDecision` always produces online (`calculationKind === "manual_job_start"`, `outcome === "accepted"`, `estimateSnapshot` `OK` with `value` exactly `{manual: true, activityType: "fertiliser_spreading"}`). Round 36, 1 HIGH, architectural: asked explicitly whether rounds 34-35's field-by-field allowlisting had crossed the point of reliability, Codex confirmed it had — `estimateSnapshot.evidenceState`/extra `value` properties/`promptId`/`calculationVersion`/`inputsSnapshot`/`edits`/a noncanonical `farmId` on the Decision, and `status`/`origin`/`activeIntervals`/`deviceMetadata` on the Job Session, all remained independently client-controlled and unchecked. Fixed by reconstructing both records wholesale server-side via the real `startManualJobSession` constructor (new dependency: `constructManualJobStartDecision`/`startManualJobSession`, already used by the online path), trusting only `jobSession.id` and `decision.decidedAt` — every other field of the queued payload is discarded for `fertiliser_spreading`; rounds 34/35's now-unreachable checks removed. Round 37, 1 HIGH: that claim wasn't yet true — the reconstruction still forwarded the queued `jobSession`'s `fieldSegments`/coerced `origin`/`deviceMetadata` verbatim, none read by any gate, letting a caller persist a fabricated `"detected"` claim or fabricated field-entry timestamps. Fixed by dropping all three unconditionally (always `origin: "manual"`, no metadata/segments) for this one activity type only — the online path's own identical, disclosed, non-authoritative trust boundary for a live farmer's own claim is unaffected. Round 45, 1 HIGH: `decision.decidedAt` (used to date the recommendation recompute, select the closed-period calendar date, and become the persisted job's own start time) was never validated as a real UTC ISO datetime and never rejected when future-dated — the same gap round 43/44 fixed for `confirmedAt`. Fixed with the identical `isValidIsoUtcDateTime` + future-date check (new dependency: `@/domain/iso-datetime`, unmodified), at the earliest point this value is used; no retry-safety exception needed since a not-future `decidedAt` can never become future-dated on a later retry. Round 46, 1 HIGH: `applyQueuedJobSessionPatchAction` forwarded any `JobSessionStatusPatch` shape verbatim, including `primaryFieldId`/`fieldSegments` — every real online lifecycle action sends only `status`/`activeIntervals`/`interruptionGaps`/`cancelledReason`, never field scope, but this offline twin had no such restriction, letting a direct caller mutate a fertiliser session's own field scope after every start-time gate already passed. Fixed by making a `fertiliser_spreading` session's field scope immutable through this path — rejects outright if the patch specifies either field at all. This function had zero direct tests anywhere before this round. |
| `JobSessionRecordCard.tsx` (`src/components/next/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit MEDIUM round 47, 2026-09-09 — pre-existing GPS Job Session Records component this campaign did not otherwise author, touched only for this one fix (completing a separate, earlier campaign's own round-1 finding, `docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round1.md` #6, which was only ever half-applied) | `job-session-provenance.ts` (`buildJobSessionProvenance`, already an existing dependency, unmodified) | `hasDeviceTimestamps` was derived purely from `session.activeIntervals.length > 0` — true for every started session regardless of GPS involvement, since the pure lifecycle state machine creates an active interval on every real Start Job — so a manual fertiliser job with no GPS telemetry at all was still labelled "Phone GPS (device timestamp)" for its date/start-end fields. That earlier campaign's own round-1 finding had already named both this field and its sibling `hasGpsTrace` as wrongly derived this way, but the shipped fix only ever applied the real `hasGpsTrace` telemetry-existence check to the sibling — `hasDeviceTimestamps` itself was never updated, and this component's own doc comments (both here and on `JobSessionWithActual.hasGpsTrace`) still describe the original, broader intended fix. Fixed by applying the identical, already-established `session.hasGpsTrace` gate to `hasDeviceTimestamps` too. This component had zero direct tests anywhere before this round — added the first ones. Round 48, 1 HIGH: that fix was still insufficient — `session.hasGpsTrace` only proves telemetry exists *somewhere* for the session, never that these specific `activeIntervals`/`updatedAt` values (always lifecycle/database clock reads) came from it. Fixed by making `hasDeviceTimestamps` unconditionally `false` at this call site — never claimed until this app has real, persisted per-timestamp GPS provenance, matching the identical honest-`false` pattern already used for `fieldGpsInferred`/`hasWeatherContext` in the same call. Round 47's own new tests updated to verify the corrected behaviour. Round 49, 1 HIGH: the displayed record date used `session.updatedAt` (a database write timestamp) instead of `session.actual.confirmedAt` (the real, farmer-asserted activity date) — see `ActivityTimelineCard.tsx`'s own row for the shared reasoning and the sort/group side of the identical fix. Fixed by switching to `actual?.confirmedAt ?? updatedAt`. |
| `ActivityTimelineCard.tsx` (`src/components/next/`, `entryTimestamp`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 49, 2026-09-09 — pre-existing Records timeline component this campaign did not otherwise author, touched only for this one fix | none (reads only fields already on `JobSessionWithActual`) | `entryTimestamp`'s own `"job_session"` branch used `session.updatedAt` to sort/day-group every confirmed-fertiliser timeline entry — a database write timestamp that can genuinely differ from `session.actual.confirmedAt` (the real, farmer-asserted date the application actually happened on: a later revision, a delayed status-move retry, or any other write after the fact), which could misplace a confirmed application into the wrong day entirely. Fixed by switching to `session.actual?.confirmedAt ?? session.updatedAt` — every real `"job_session"` entry is sourced from `listConfirmedJobSessionsForFarm` (`page.tsx`), so `actual` is always genuinely present per `JobSessionWithActual`'s own established invariant; the fallback is purely defensive. Neither this function nor `JobSessionRecordCard.tsx`'s own displayed date (see that row) had any test covering this before this round — added the first ones, using deliberately different `confirmedAt`/`updatedAt` values per Codex's own explicit request. |
| `records/page.tsx` (`src/app/(app)/records/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 8, 2026-09-08 — pre-existing screen this campaign did not otherwise author, touched only for this one fix | `fertiliser-plan/index.ts` (`sanitiseDecisionRecordForClient`, new dependency) | This screen reads every real `DecisionRecord` for the farm and passes it straight into the client component `RecordsPageClient` — a third, generic path (alongside `fertiliser-plan.ts`'s own two fertiliser-specific actions, round 7) that could forward a legacy fertiliser Decision's own real per-product mock `costEur` to a real client boundary. Fixed by mapping every decision through `sanitiseDecisionRecordForClient` before it reaches `RecordsPageClient` — a no-op for every non-fertiliser Decision and every already-clean fertiliser Decision. |
| `decisions.ts` (`src/lib/farm-data/`, `getDecisionById` additive export) | Fertiliser Vertical campaign, Codex audit MEDIUM (round 2) | none (shares this file's own real Supabase client/RLS posture — `insertDecision`/`listDecisionsForFarm` themselves unmodified) | A real, single-row, uncapped, farm-scoped decision lookup by id — `.eq("id", ...).eq("farm_id", ...).maybeSingle()`. Fixes a real gap `listDecisionsForFarm`'s own `MAX_DECISION_HISTORY_ROWS` cap (200) created for Confirm Actual prefill: a real plan Decision older than that window previously resolved to "not found" indistinguishable from a session with genuinely nothing to prefill from. Returns `null` for a nonexistent id or one belonging to another farm — the two are indistinguishable to the caller, same posture every other real farm-scoped id lookup in this app uses. |
| `ai-context/index.ts` (`src/orchestration/`, extension) | Fertiliser Vertical — End-to-End Real Workflow campaign, 2026-09-08, non-breaking additive change | `fertiliser-plan/index.ts` (`getFarmFertiliserDemand`, unmodified) | `FarmContext` gained a new `fertiliserDemand: FarmContextFertiliserDemandSummary[]` field (item 21) — the real farm-wide recommended/planned/confirmed/remaining totals by product, the deterministic data a future assistant needs to answer "How much fertiliser do I still need?" from real Farm Return figures. No LLM reads this yet — see this module's own header comment. `FarmContextInputs` gained a corresponding `fertiliserDemand` input, supplied by `getFarmContextForCurrentUser`'s own new `getFarmFertiliserDemand` call; farm-wide by construction, so (unlike `fields`/`livestockGroups`/`individualAnimals`) there is nothing per-row to filter by `farmId`. Round 21, 1 MEDIUM: `getFarmFertiliserDemand`'s own new `applicationsWithUnknownComposition` count (a real confirmed Actual whose quantity couldn't be resolved to a real kg figure) was likewise never threaded through — fixed with a new `fertiliserDemandApplicationsWithUnknownComposition` field on both `FarmContext` and `FarmContextInputs`, the identical pattern `fertiliserDemandTruncated` already establishes. Round 22, 1 HIGH: `getFarmFertiliserDemand`'s new `fieldsWithBlockedEvidence` count likewise needed threading through — fixed with a new `fertiliserDemandFieldsWithBlockedEvidence` field on both `FarmContext` and `FarmContextInputs`. |
| `reports.ts` (`src/lib/`, `buildNutrientPlanReportCsv`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 9, 2026-09-08 — pre-existing V1/V3 report generator this campaign did not otherwise author, touched only for this one fix (found by a deliberate hunt for a fourth instance of the "independent code path missing the gate" pattern rounds 6-8 each found once) | `build-all.ts` (`computeFarmGrasslandAggregates`, new dependency, replacing this file's own separate, identically-buggy inline duplicate), `fertiliser-recommendation.ts` (`isTillageField`/`hasNoRecordedLivestock`, new dependency) | This real, downloadable per-field CSV called `calculateNutrientPlan` directly for every field, labelling a tillage field "Grazing" and exporting a real grassland N/P/K recommendation (this app has no tillage table), and could export the clamped 35 kg N/ha for an un-evidenced empty herd — fixed by gating on the same two authoritative predicates the rest of this vertical uses; a tillage field now exports "Tillage"/"NOT_APPLICABLE", an empty herd exports "INSUFFICIENT_EVIDENCE". The same CSV also exported `nutrients.ts`'s own disclosed mock `costEur`/`estimatedFieldCostEur` to a real signed-in farmer's downloaded file — fixed by removing the "Estimated cost (EUR)" column and the per-product `€` text entirely, matching this file's own pre-existing stated principle for why the disabled "Financial Summary" report has no builder at all. Round 10, 1 HIGH: the products cell still read an ambiguous empty string for a field with complete real evidence whose live recommendation is genuinely `NOT_APPLICABLE` (Index 4, commonage) — fixed with an explicit `"NOT_APPLICABLE"` sentinel, distinct from `"INSUFFICIENT_EVIDENCE"`; the numeric N/P/K/organic-offset columns are unchanged, since those figures remain genuinely real in that case. Round 13, 1 HIGH: the last unclosed instance of the tillage/missing-livestock pattern across 8 consecutive rounds (6-13) — the four NAP compliance columns still read `plan.napCompliance` directly, ungated, since `checkNapCompliance` has no knowledge of tillage/missing-livestock at all. Fixed by gating all four on the same `nRecommendable` the other columns already use. Round 16, 1 HIGH: this file's own `calculateNutrientPlan` call was the one real call site round 14's `pBuildUpCompliance` propagation missed — no parameter for it at all, and its caller (`ReportsPageClient.tsx`) never even read the current `Farm` record. Since this report's own NAP columns are already made authoritative-looking and fail-closed (rounds 9/13), this silently exported a false "not proven"/Table 15a P ceiling result for a farm with real, satisfied Article 17(6) evidence. Fixed with the identical trailing optional `pBuildUpCompliance` parameter every other call site has; `ReportsPageClient.tsx` now reads `useFarm()` and passes it through. Round 23, 1 HIGH: `nRecommendable`'s own `!tillage && !noLivestock` gate — the very same gate rounds 9/13 built — applied the missing-livestock exclusion to a silage field too, even though silage N/P/K never depends on `livestockGroups` (the exact exemption `calculateFarmFertiliserRequirement`/`RecommendationAuditTrailCard.tsx` already apply, missed here). A real, complete-evidence silage field with genuinely no recorded livestock had its real N/P/K, offsets, products, and NAP columns all replaced with `INSUFFICIENT_EVIDENCE`. Fixed: `nRecommendable = !tillage && (!noLivestock || silagePlan !== undefined)`. Round 27, 1 CRITICAL: `nRecommendable` never checked round 26's own new silage-evidence gate at all — a real silage-planned field with no matching real `SilagePlan` was still labelled "Grazing" and its forced-zero N/P/K exported as a real requirement. Fixed with a new `silageEvidenceMissing = isSilageCutPlannedUse(field) && !silagePlan` (new dependency: `nutrients.ts`'s own shared predicate, not re-derived), folded into `nRecommendable`; the land-use column now reads "Silage (no real cut/yield plan)" instead of "Grazing" for this case. Round 29, 1 MEDIUM: a field whose `plannedUse` was never recorded at all still read plain "Grazing" — contradicting this same report's own "Regulatory status" column right beside it, which already correctly read `"planning_advice"` — and no column carried the real, specific downgrade reason. Fixed: the label becomes "Grazing (assumed — land use not recorded)" for this case, and a new "Regulatory note" column exports `plannedUseUnresolvedReason`/`soilTestDisregardedReason` (joined when both apply) — the same real disclosure text `NapComplianceCard.tsx` already shows on-screen. Round 30, 1 HIGH: the "N/P within NAP ceiling" columns (unchanged by round 29) still published a definitive "Yes"/"No" regardless of `regulatory` — fixed with "Unknown" whenever `regulatory !== "compliance_value"`, matching the identical convention `nutrient-plan-trace.ts` already uses. |
| `GpsActivityCandidateCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 13, 2026-09-09 — pre-existing GPS Job Mode component this campaign extended (round 1's own `getMatchablePlanForFieldAction` link, unchanged here), touched only for this one fix | `fertiliser-plan.ts` (`getMatchablePlanForFieldAction`, already an existing dependency since round 1) | Confirm was disabled only while the farmer's own submission was pending, never while the async `getMatchablePlanForFieldAction` lookup itself was still in flight — a quick tap could fall straight through to the unlinked manual-start branch even when a real, unambiguous plan existed, silently bypassing the exact GPS-to-plan link campaign item 10 exists to make. Fixed with a new `matchablePlanLoading` state, tracked separately from the lookup's own result value (which had conflated "no lookup running" with "still in flight") — Confirm now shows "Checking…" and stays disabled until the lookup genuinely settles; a real lookup failure still resolves to the same, unchanged manual-start fallback, never an indefinite block. Round 14, 1 MEDIUM: that same lookup's result was then kept, unrevalidated, for the whole candidate cycle once it settled — a plan saved/unlinked after it settled but before the farmer's tap could still be silently bypassed. Fixed by re-resolving the matchable plan inside `confirm()` itself, right before deciding whether to link or start manually, rather than trusting the cached state; a narrower client/server race remains inherent to this client-driven two-step flow, not fully eliminated. Round 20, 1 MEDIUM (correcting round 14's own judgement): that confirmation-time lookup's own failure handler synthesised `{status: "none"}` on rejection and proceeded to start an unlinked manual session on that false premise — round 14 had reasoned this was safely equivalent to the initial lookup's own fail-open handling, but this fork is consequential (link vs. permanently unlinked) in a way the initial, display-only lookup never is; a genuine `"none"` establishes real absence, a rejected lookup establishes nothing. Fixed by letting the failure propagate to this function's own existing outer error handler instead — nothing is committed yet at that point, so failing the whole confirm attempt (matching every other real failure in this function) and letting the farmer retry is the safe behaviour. |
| `ActiveJobSessionView.tsx` (`src/app/(app)/job/[id]/`) / `ConfirmActualSheet.tsx` (`src/components/next/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 20, 2026-09-09 — pre-existing GPS Job Mode / Confirm Actual components this campaign extended (round 14's own bare-acceptance prefill fix, unchanged here), touched only for this one fix | `fertiliser-plan.ts` (`getLinkedFertiliserPlanForJobSessionAction`, already an existing dependency since round 14) | `linkedPlan === undefined` conflated three states — not yet queried, the lookup still in flight, and the lookup having genuinely failed — identical to a non-`"plan"`-origin session's own permanent "nothing to prefill" state, and `ConfirmActualSheet` opened immediately, fully interactive, in every one. A farmer confirming quickly (or during a slow/failed fetch) could submit before round 14's own bare-acceptance prefill fix ever populated the known product/quantity, silently undermining that fix's stated purpose, or indefinitely on a genuine failure with no indication anything was expected. Fixed with new `linkedPlanLoading`/`linkedPlanCheckFailed` props threaded from `ActiveJobSessionView`'s own fetch, rendered as an honest, distinct disclosure near the product/quantity fields in `ConfirmActualSheet` — deliberately never blocking submission itself, since the farmer has already finished a real job and must always be able to record it. |
| `RemainingFertiliserRequirementCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 15, 2026-09-09 — this campaign's own new component, touched only for this one fix | `fertiliser-plan.ts` (`getFieldFertiliserStatusAction`, already an existing dependency) | Its own `result`-reset effect fired only when `canRecord` turned off, never on a plain `fieldId` change — switching the Nutrients screen's selected field started a new fetch but left the PREVIOUS field's real requirement/applied/remaining figures rendered under the new field's heading until the new fetch resolved, or indefinitely on a rejection (the handler only logged). A concrete unsafe scenario: field A showing "0 kg N/ha still required" (fully applied) could remain visible under field B's heading while B's real requirement is still fully outstanding. Fixed by resetting `result` to `undefined` unconditionally at the top of the effect, before either the early `!canRecord` return or the new fetch — nothing is shown rather than a stale, wrong field's real numbers. Round 19, 1 LOW: that fix left a genuine fetch failure rendering as silent absence (`result` staying `undefined`), identical to the render path a genuinely NOT_APPLICABLE or not-yet-fetched field already takes. Fixed with a new `checkFailed` state rendering its own honest, distinct disclosure instead of `null`. Round 22, 1 LOW: its `applicationsWithUnknownComposition` disclosure always blamed "product not in Farm Return's verified catalogue", concretely wrong for the other three real exclusion reasons `nutrientContributionFromFertiliserActual` can return (missing product/quantity/unit, unverified "bags") — fixed with an accurate umbrella phrase covering all four. |
| `FertiliserSlurryCard.tsx` (`src/components/finance/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 22, 2026-09-09 — pre-existing Phase 4 Finance component this campaign did not otherwise author, touched only for this one fix | `finance.ts` (`calculateFarmFertiliserRequirement`/`calculateFarmSlurryNutrientValueEur`, already an existing dependency via `calculateFarmFertiliserCostEur`) | "Estimated fertiliser spend €0" was indistinguishable from a genuinely complete zero-requirement farm when in fact one or more real grazing fields had been excluded from that total for lack of recorded livestock. Fixed by additionally reading `calculateFarmFertiliserRequirement`'s own new `fieldsWithBlockedEvidence` count and rendering a real disclosure line when it is positive — this component's first dedicated test file. Round 24, 1 HIGH: the identical gap existed for the Slurry section's own `calculateFarmSlurryNutrientValueEur` value, never fixed here. Fixed by reading the new `FarmSlurryNutrientValueResult.fieldsWithBlockedEvidence` and adding a second, independent disclosure block under the Slurry section; also updated the fertiliser-spend disclosure copy to an accurate umbrella ("missing livestock or soil evidence") now that round 23 extended that counter to cover missing-fertility-evidence too. |
| `RecommendationAuditTrailCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 11, 2026-09-08 — pre-existing Scientific engine V3 Phase J screen this campaign did not otherwise author, touched only for this one fix (found by a deliberate hunt for a sixth instance of the "independent code path missing the gate" pattern rounds 6-10 each found once) | `nutrients.ts` (`farmGrasslandAggregates`, new dependency, replacing this component's own separate, identically-buggy inline duplicate) | "Generate audit trace" summed every field unconditionally and ran `calculateNutrientPlanWithTrace` for every field with no tillage/missing-livestock gate — the first fixed call site in this pattern that *persists* its output (a real `CalculationRun` written to `localStorage`, peer-reviewable and exportable as CSV/JSON/text), not merely displaying it transiently. Fixed by reusing the shared `farmGrasslandAggregates` and skipping a tillage field, or a grazing field when the farm has no recorded livestock, entirely before generating a run — a silage field is never skipped for missing livestock, since silage N/P/K never depends on it. Round 17, 1 CRITICAL: this component never read `useSlurryAllocations()`/`useFarm()` at all, so its own `calculateNutrientPlanWithTrace` call omitted both the field's real slurry allocation and the farm's real Article 17(6) evidence — a field with a real slurry allocation got a persisted, exportable "audit trail" calculated as if none existed, and a farm with satisfied Article 17(6) evidence got the lower Table 15a P ceiling instead of the enhanced Table 15b one, in this same real peer-reviewable persisted surface. Fixed by adding both hooks and threading `slurryAllocation`/`pBuildUpCompliance` into the call, identical to every other real call site — verified via the trace's own persisted "statutory manure N/P ledger value" decision record (present only with a real allocation) and its `P_BUILD_UP_ELIGIBILITY` compliance check (PASS/FAIL flips with the evidence). Round 24, 1 MEDIUM: the missing-livestock skip in the generate loop (already correctly silage-exempt since round 11) was itself silent — a farmer generating a trace on a farm with no recorded livestock got a run list that looked complete, with no disclosure that its real grazing fields were never traced. Fixed with a new `skippedFieldCount` tracked per generate call and a UI disclosure line under the "Generate audit trace" button, rather than a persisted `BLOCKED_INSUFFICIENT_EVIDENCE` trace record — a skipped field was never calculated, so a UI-level disclosure is the accurate representation, not a fabricated run. Round 27, 1 HIGH (shared with `nutrient-plan-trace.ts`'s own row): a real silage-planned field with no matching real plan proceeded into `calculateNutrientPlanWithTrace` whenever livestock was present (never counted in `skippedFieldCount`), persisting a genuinely blocked run whose own narrative was separately wrong (see `nutrient-plan-trace.ts`). Fixed by widening the skip condition to also independently skip-and-count missing silage evidence (new dependency: `nutrients.ts`'s `isSilageCutPlannedUse`), regardless of livestock, with a widened disclosure line naming both real reasons. |
| `nutrient-plan-trace.ts` (`src/domain/`, `calculateNutrientPlanWithTrace`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 27, 2026-09-09 — pre-existing Scientific engine V3 Phase I module this campaign did not otherwise author, touched only for this one fix | `nutrients.ts` (`calculateNutrientPlan`, unmodified) | `buildNapComplianceDecision`'s own persisted, peer-reviewable/exportable narrative (`action`/`dataGaps[0].description`/`reason`/`resolution`) hardcoded the GSR/livestock-age-sex explanation for *every* real reason `napCompliance` can be `BLOCKED_INSUFFICIENT_EVIDENCE` for — the machine-readable `reasonCode` was already correct, but a farmer reading this trace for a field blocked for a different real reason (missing P/K Soil Index, or round 26's new silage-evidence reason) saw the wrong action/data-gap/resolution text. Fixed by branching the narrative on the real `reasonCode` (three cases: `MISSING_LIVESTOCK_CATEGORISATION_FOR_GSR`, `MISSING_SOIL_FERTILITY_INDEX`, `MISSING_SILAGE_PLAN_DATA`), falling back to the original GSR text for the GSR code and any future/unrecognised one. Round 29, 1 HIGH: `buildNapComplianceDecision` never examined `compliance.regulatory` at all once `napCompliance.status === "OK"` — a genuinely pre-existing defect (already affected the disregarded-soil-test case before round 28 ever shipped), newly surfaced by round 28's second path to `"planning_advice"`. An unconfirmed classification was still persisted as a definitive `ACTION_RECOMMENDATION`/`WARNING` with real statutory `PASS`/`FAIL` compliance checks. Fixed with a shared `isConfirmed` check: `decisionType` becomes `"ESTIMATE"` (the same type `statutoryManureValue`'s own real, not-guaranteed figure already uses) regardless of pass/fail when unconfirmed, and the two NAP compliance checks report `result: "UNKNOWN"` (a real, pre-existing `ComplianceCheck` value) with a "Cannot confirm" consequence instead of a false PASS/FAIL. Round 30, 1 HIGH: this downgrade only ever reached the two headline NAP_N_CEILING/NAP_P_CEILING checks — the route-dependent `HIGH_RATE_N_ELIGIBILITY`/`P_BUILD_UP_ELIGIBILITY` checks in the same decision could still claim a definitive PASS/FAIL under `planning_advice`, even though whether their own elevated/enhanced ceiling framework applies at all is downstream of the identical unconfirmed classification. Fixed with the same `isConfirmed`/`"UNKNOWN"` mechanism applied to both. Round 31, 1 HIGH: the true last remaining gap — the `NAP_N_CEILING_CHECK` calculation step still recorded `compliance.nWithinCeiling` as a raw `true`/`false` regardless of `isConfirmed`, rendered in `RecommendationAuditTrailCard.tsx`'s own calculation-steps list and written into every CSV/JSON/text export, even though the surrounding decision/compliance checks already correctly downgrade. Fixed with the identical `isConfirmed` gate, `result: "UNKNOWN"` (`CalculationStep.result` is `unknown`-typed, no new representation needed). Codex's own round-31 audit explicitly re-confirmed every other real NAP-confidence consumer already correctly gates on `regulatory` — this sweep is exhaustive, five rounds deep. Round 32, 1 HIGH: `buildLessMethodDecision`'s own `gate.status !== "BLOCKED_INSUFFICIENT_EVIDENCE" -> return null` branch carried a comment claiming `AMBIGUOUS` was unreachable — no longer true once `requireSlurryApplicationMethod` (`input-gates.ts`, see `nutrients.ts`'s own round-32 entry) gained a real `AMBIGUOUS`/`CONFLICTING_SLURRY_METHODS` outcome for a genuine cross-allocation method conflict. Fixed by handling `gate.status === "AMBIGUOUS"` explicitly, ahead of that branch, as a new `DATA_REQUEST` decision (`DecisionType`'s own pre-existing, previously-never-produced schema value — the correct fit for "real, captured evidence that disagrees," distinct from `BLOCKED_INSUFFICIENT_EVIDENCE`'s "nothing was ever captured") asking the farmer to reconcile which method governed the spreading, rather than silently returning `null` (dropping the decision from the trace) or misreporting it as missing evidence. |
| `audit-export.ts` (`src/domain/`, `compareCalculationRuns`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit MEDIUM round 30, 2026-09-09 — pre-existing RPT024 (run comparison) module this campaign did not otherwise author, touched only for this one fix | none (pure comparison over two already-persisted `CalculationRun`s) | Only ever compared `ruleset`/tracked `inputs`/`quantity` — since `plannedUse` was never recorded as a decision input at all, and the agronomic N/P/K figure is deliberately unaffected by a regulatory-confidence change (two-ledger separation), comparing an unconfirmed run (`decisionType: "ESTIMATE"`) against a later confirmed run of the same field reported "no material change detected" while the persisted regulatory conclusion (and its real compliance-check results) actually changed entirely. Fixed by also comparing `decisionType` and every matching `complianceChecks[].result`, feeding the existing deterministic `reason` string rather than adding new structured fields to the shared `RunComparisonResult` type. |
| `NapComplianceCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit CRITICAL round 28, 2026-09-09 — pre-existing V3 fix-era component this campaign did not otherwise author, touched only for this one additive fix; had no dedicated test file before this round, one was added | `nutrients.ts` (`calculateNutrientPlan`'s `NapComplianceCheck.plannedUseUnresolvedReason`, already an existing dependency via `NapComplianceCheck`) | Already correctly renders "Unconfirmed" vs "Statutory ceiling" purely from `regulatory`, so round 28's new `plannedUseUnresolvedReason` field required no gating-logic change — only a new additive disclosure paragraph, the identical pattern this card's own pre-existing `soilTestDisregardedReason` block already establishes (both can render together when a field has both real issues at once). |
| `real-alerts.ts` (`src/domain/`, `deriveRealAlerts`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 11, 2026-09-08 — pre-existing V3 closure-pass domain module this campaign did not otherwise author, touched only for this one fix (found by the same round-11 hunt). Round 12, 1 HIGH: round 11's own claim that the water-buffer alert is entirely field-intrinsic was half wrong — `nationalBufferDistanceStatus` also depends on the ledger (`bufferMaterial` picks `"chemical_fertiliser"` whenever `allocatedProducts` is non-empty); `localBufferOverrideStatus` genuinely is field-intrinsic | `nutrients.ts` (`farmGrasslandAggregates`, new dependency, replacing this file's own separate, identically-buggy inline duplicate) | The shared `farmGrasslandAreaHa` denominator (which `checkNapCompliance`'s own real statutory stocking-rate ledger divides by) had the identical tillage-inclusive bug. Of this function's four real alert types, the commonage and soil-test-age alerts are real properties of the field itself, genuinely independent of land use or livestock, and are deliberately left ungated so a tillage field or un-evidenced farm still gets its own real, valid alerts for those. The NAP-ceiling alert and the national-buffer half of the water-buffer alert are both gated on one shared `ledgerDependentAlertsEligible` (`field.plannedUse !== "tillage"`/`livestockGroups.length > 0`); the local-override half of the buffer alert stays ungated, since `checkLocalBufferOverride` reads only `field.waterBufferContext`. Round 17, 1 HIGH: this function's own `calculateNutrientPlan` call never forwarded `input.farm.pBuildUpCompliance?.value`, despite already receiving the complete real `Farm` — a farm with satisfied Article 17(6) evidence could see a false "Planned application exceeds NAP ceiling" dashboard warning the Nutrients Prompt/CSV/audit-trace paths correctly do not raise. Fixed identically to every other call site; disclosed as currently unobservable through this specific alert's own trigger condition (`deriveRealAlerts` has no `silage` input, and real grazing's own P requirement is structurally capped below every real Table 15a ceiling band in this data model) — see `evidence-register.md`'s own round-17 correction entry. Round 18, 1 HIGH: a genuinely separate omission in the same function/call — `nonGrassPct` (from the identical `farmGrasslandAggregates` call already used for `farmGrasslandAreaHa`) was also silently discarded, so the elevated-N-ceiling eligibility gate (GFT023/GFT024) always saw 0% regardless of a farm's real recorded evidence, misclassifying a genuinely compliant recommendation as exceeding the lower, ineligible-farm ceiling. Fixed by threading `nonGrassPct` through alongside `pBuildUpCompliance`; a dedicated round-18 audit of every optional `CalculateNutrientPlanInput` field across every real call site found no further instance of this drift pattern. Round 24, 1 HIGH: this function silently skipped its own two ledger-dependent checks (NAP-ceiling, the national-buffer half of the water-buffer alert) for every non-tillage field when the farm has no recorded livestock, with nothing on its return value disclosing it — the Dashboard's `AlertsCard` showed a complete-looking all-clear even though those two real, advertised checks never ran. Fixed with a new `DeriveRealAlertsResult { alerts, fieldsWithBlockedChecks }` return type (previously a bare `FarmAlert[]`, one real caller), never counting a tillage field (genuinely `NOT_APPLICABLE`, not blocked). Round 25, 1 HIGH: that new counter itself only tracked the missing-livestock reason — reproducing the exact "counts only missing livestock, not missing fertility" gap round 23 already had to fix once for `calculateFarmFertiliserRequirement` — a non-tillage field with real livestock but a missing P/K Soil Index also has its real NAP-ceiling check blocked (`calculateNutrientPlan` forces `napCompliance` to `BLOCKED_INSUFFICIENT_EVIDENCE` whenever `fertilityEvidence.status !== "OK"`), and was silently never counted. Fixed by also checking `plan.fertilityEvidence.status`, counted once per field even when both reasons apply; `AlertsCard.tsx`'s hard-coded "no recorded livestock" copy generalised to "missing livestock or soil evidence", matching `FertiliserSlurryCard.tsx`'s own established umbrella phrase. Round 26, 1 HIGH: a third real reason was still missed — even with real livestock and complete fertility evidence, `plan.napCompliance` can independently resolve `BLOCKED_INSUFFICIENT_EVIDENCE` when the real statutory GSR needs a livestock group's own `avgAgeMonths`/`sex` and doesn't have it. Fixed by also checking `plan.napCompliance.status` (only once otherwise eligible and fertility is `OK`, so it never double-counts); `AlertsCard.tsx`'s copy widened to a three-reason umbrella. Deliberately **not** extended to commonage/national-buffer `BLOCKED_INSUFFICIENT_EVIDENCE` (a separate round-26 finding, rejected — see `evidence-register.md`'s own round-26 entry: this is an established, deliberately "inert today" state, and counting it would make the disclosure fire for nearly every real farm). Round 27, 1 HIGH: this function has no `silage` input at all (disclosed since round 17), so every real silage-planned field is unconditionally blocked here by round 26's own new gate — but `ledgerDependentAlertsEligible` never accounted for it, so `allocatedProducts` (computed from the grazing-branch requirement *before* the round-26 gate applies) could fabricate a non-empty chemical-fertiliser blend and trigger a false "Water-buffer distance not met" alert, the identical failure round 12 already fixed for tillage/missing-livestock. Fixed by extending `ledgerDependentAlertsEligible` with the new shared `isSilageCutPlannedUse` predicate (`nutrients.ts`) — `fieldsWithBlockedChecks` needed no separate change, it already counts the field via the pre-existing `!ledgerDependentAlertsEligible` disjunct. Round 29, 1 HIGH: the NAP-ceiling alert's own title stated a definitive statutory fact regardless of `napCompliance.value.regulatory` — fixed by qualifying the title to "may exceed NAP ceiling (unconfirmed)" when `regulatory !== "compliance_value"`, deliberately kept (not suppressed) as a real, lower-confidence concern. |
| `AlertsCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 24, 2026-09-09 — pre-existing V3 closure-pass Dashboard component this campaign did not otherwise author, touched only for this one fix; had no dedicated test file before this round, one was added | `real-alerts.ts` (`deriveRealAlerts`, already an existing dependency) | Consumed `deriveRealAlerts`'s new `{ alerts, fieldsWithBlockedChecks }` return shape: an empty `alerts` list now shows a real "N field(s) couldn't be fully checked — no recorded livestock" disclosure instead of the previous unconditional "No compliance alerts" all-clear when `fieldsWithBlockedChecks > 0`; a second, independent disclosure line renders alongside a non-empty alert list, since a farm can have real alerts and real blocked checks at the same time. Round 25: copy generalised from "no recorded livestock" to "missing livestock or soil evidence" once `deriveRealAlerts`'s own counter was extended to also cover missing P/K Soil Index evidence. Round 26: copy widened again to "missing livestock, soil, or livestock age/sex evidence" once `deriveRealAlerts`'s own counter was extended to also cover an unresolved statutory GSR. |
| `MetricCard.tsx` (`src/components/ui/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 25, 2026-09-09 — pre-existing shared component this campaign did not otherwise author, touched only for this one additive fix | none (presentational only) | New optional `partialCaption?: string` prop, the same additive pattern as this component's existing `sampleData` pill — when set (and `unavailable` is not), renders a one-line caption under the value. Added so the Dashboard's compact "Fertiliser cost" KPI tile can disclose a `fieldsWithBlockedEvidence`-style exclusion without needing the full paragraph-length disclosure a `Card` has room for. Every other `MetricCard` caller is unaffected — the prop defaults to `undefined`. |
| `input-planner/page.tsx` (`src/app/(app)/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 25, 2026-09-09 — pre-existing Phase 6 screen this campaign did not otherwise author, touched only for this one fix; had no dedicated test file before this round, one was added | `finance.ts` (`calculateFarmFertiliserRequirement`, already an existing dependency) | This screen already held the complete `fertiliserRequirement` result (including `fieldsWithBlockedEvidence`) but never rendered the count — a real excluded field left the Fertiliser breakdown/Forecast Spend total looking complete. Fixed with a new disclosure line under the breakdown, matching `FertiliserSlurryCard.tsx`'s own established copy. |
| `InputSummaryCard.tsx` (`src/components/farm/`) | Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit HIGH round 25, 2026-09-09 — pre-existing Dashboard rollup component this campaign did not otherwise author, touched only for this one fix; had no dedicated test file before this round, one was added | `finance.ts` (`calculateFarmFertiliserRequirement`, already an existing dependency) | Same gap and fix as `input-planner/page.tsx` above, applied to this card's own Total line; the pre-existing `inputRequirements.length === 0` empty-state branch also gained a `fieldsWithBlockedEvidence`-aware message, though `withRealInputRequirements` always keeps the Fertiliser/Feed rows regardless of field state, so that branch is defensive rather than currently reachable in either real or mock mode. |

## Fertiliser Vertical V1, Checkpoint 1 (Soil Sampling Foundation, 2026-09-12)

Freeze doc: `docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md`.
New domain surface, pending its own Checkpoint 1 Codex audit round
(`BUILD_STATE.json.contracts_frozen: false` until it closes clean):

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `soil-sampling-plan.ts` | Checkpoint 1 | `evidence.ts` (`ok`/`blockedInsufficientEvidence`), `soil-test-validity.ts` (`SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE`, reused not duplicated) | `SamplingStrategy` interface (the permanent V1-V4 extension seam) + `StandardRepresentativeSamplingStrategy`, the only V1 implementation. Every numeric constant (min 20 cores, 2-4 ha ideal / 5 ha hard ceiling per sample, 10 cm depth, 3-6mo post-P/K and 2yr post-lime timing advisory) verified live against Teagasc's Soil Sampling page 2026-09-12, cited `TEAGASC_SOIL_SAMPLING`. `assessSamplingTimingReadiness` is deliberately advisory, not an `EngineOutcome` gate — see its own doc comment. |
| `job-actual.ts` additive `"soil_sampling"` `ActivityType` / `SoilSamplingActual` / `validateSoilSamplingActual` | Checkpoint 1 | `soil-sampling-plan.ts` (`MIN_CORES_PER_COMPOSITE_SAMPLE`) | Non-breaking additive change (`DOMAIN_CONTRACTS.md`'s own carve-out) — every existing `ActivityType`/validator/call site unchanged. |
| `soil-core-observations.ts` (`src/lib/farm-data/`) + `20260912000000_soil_core_observations.sql` | Checkpoint 1 | — | New table, new module — the one genuinely new persisted entity this checkpoint adds (`CoreObservation`). `SamplingPlan` reuses `decisions`, `SamplingSession` reuses `job_sessions` (`activity_type = "soil_sampling"`), `CompositeSample` is a derived read-only view (`buildCompositeSampleView`), never a separate mutable row — see the architecture doc's own table for the full reuse-vs-new breakdown. |
| `orchestration/soil-sampling/index.ts` | Checkpoint 1 | `job-session/index.ts` (`startJobSessionFromPrompt`, unmodified), `decide/index.ts` (via `startJobSessionFromPrompt`), `farm-data/{farms,fields,job-sessions,soil-core-observations,decisions}.ts` | `startSoilSamplingSession` calls the existing generic `startJobSessionFromPrompt` — no new Job Session start path. `recordSoilCoreObservation` takes a client-supplied `sequence` (true offline-multi-core correctness — see its own doc comment for why this is deliberate, not a missed server-side check) and re-verifies session ownership/status server-side regardless. |
| `outbox.ts` additive `"soil_core_observation"` item type + `job-session-sync.ts` wiring | Checkpoint 1 | `outbox.ts`'s existing `enqueue`/`flush`/`getPending` (unmodified) | Reuses the existing IndexedDB offline outbox exactly like every other Job Session item type — no second offline architecture. |
| `app/actions/soil-sampling.ts` | Checkpoint 1 | `app/actions/job-sessions.ts` (`pauseJobSessionAction`/`resumeJobSessionAction`/`finishJobSessionAction`/`confirmJobSessionActualAction`, all unmodified, called directly by the UI) | Deliberately does not duplicate any generic Job Session lifecycle action — only plan/start/record/resume/list-past-samples are genuinely new. |
| `app/(app)/soil-sample/[fieldId]/` (`SoilSamplePageClient.tsx`) | Checkpoint 1 | `LocationTrackingProvider`/`NetworkStateProvider` (`web-location-tracking-provider.ts`/`web-network-state-provider.ts`, unmodified), same pattern `ActiveJobSessionView.tsx` already established | One new UI for a new activity type, not a second GPS/offline UI architecture. Entry point: `FieldDrawer.tsx`'s Soil tab, "Start soil sample". |

## Fertiliser Vertical V1, Checkpoint 2 (Laboratory Evidence, 2026-09-13)

New domain surface, pending its own Checkpoint 2 Codex audit round:

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `soil-interpretation.ts` | Checkpoint 2 | `nutrients.ts` (`pIndexFromMgL`, `kIndexFromMgL`, `resolvePIndexConservatively`, `cropGroupForFieldUse`, `soilMaterialForOrganicCarbonStatus` — all reused, none re-derived) | `interpretLabResult` — pure function producing a standalone, persistable `SoilInterpretation` from raw lab values. Preserves `AMBIGUOUS_STATUTORY_BOUNDARY` rather than silently resolving it. |
| `lab-results.ts` / `soil-interpretations.ts` (`src/lib/farm-data/`) + `20260913000000_lab_results.sql` / `20260913010000_soil_interpretations.sql` | Checkpoint 2 | — | Two new tables. `lab_results.job_session_id` is `unique` — the structural enforcement that a CompositeSample has at most one LabResult. `soil_interpretations` is insert-only/versioned (a methodology change adds a row, never rewrites one). |
| `orchestration/lab-result/index.ts` | Checkpoint 2 | `src/lib/farm-data/soil.ts`'s `addSoilTestToField` (**unmodified**) | `recordLabResultForCompositeSample` persists the raw LabResult + a real SoilInterpretation, then calls the *existing* `addSoilTestToField` — the same function the legacy manual Soil-screen entry already uses — to apply the result to `Field.fertility`. This is the one bridge that makes Checkpoint 3's already-built, already-audited `calculateNutrientPlan` pick up the new guided-sampling evidence chain with zero engine changes. **`getLabStatusForCompositeSample` never reads `soil_interpretations` back as a trusted value** (Codex audit CRITICAL, rounds 2-4 — `authenticated`'s unrestricted insert grant on that table means no column, including server timestamps, can be trusted to distinguish a genuine row from a fabricated one) — it recomputes `interpretLabResult` fresh from the real `lab_results` row every time instead. |
| `types.ts`'s additive `SoilTest.compositeSampleId`/`labResultId` | Checkpoint 2 | — | Non-breaking additive fields — every existing `SoilTest` value (legacy manual entries) simply omits them. |
| `app/actions/lab-results.ts` | Checkpoint 2 | — | `submitLabResultAction`, `getLabStatusForCompositeSampleAction`. |
| `app/actions/soil-sampling.ts`'s `listFieldCompositeSamplesAction` | Checkpoint 2 (additive) | `lab-results.ts`'s `getLabResultForSession` | Now resolves each CompositeSample's real `status` (`"awaiting_lab_result"` vs `"lab_result_received"`) instead of the Checkpoint 1 permanent placeholder. |

## Fertiliser Vertical V1, Checkpoint 3 (Complete Fertiliser Decision Chain, 2026-09-12)

Scope: Requirement → Net Requirement → Product Allocation → farm-wide
Purchase Requirement (tonnes). No engine rewrite — every figure below is
either a new, separately-inspectable field derived from
`calculateNutrientPlan`'s own already-verified arithmetic, or a pure unit
conversion of `aggregateFarmFertiliserDemand`'s own already-exact kg
totals. Checkpoint 3 Codex audit gate: **CLOSED**, 3 rounds (2 High
fixed round 1; 1 High fixed round 2; clean round 3) — see
`IMPLEMENTATION_LOG.md`'s own round-by-round account.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `types.ts`'s additive `NutrientPlan.netRequirement` | Checkpoint 3 | — | Non-breaking additive field — `requirement.value` less `organicApplication`'s own offset, floored at 0 kg/ha, computed once inside `calculateNutrientPlan` and exposed for the first time as its own inspectable `TrackedValue`. Previously only an unnamed internal local feeding `purchasedProducts`' own allocation; the allocation itself is unchanged, this only makes the same real number visible to a caller. |
| `nutrients.ts`'s `calculateNutrientPlan` | Checkpoint 3 (additive) | — | Computes and returns `netRequirement` alongside the pre-existing `requirement`/`organicApplication`/`purchasedProducts` — no change to any existing field's value. Codex audit HIGH (round 1): `netRequirement` originally re-derived its figure from `requirement.value`/`organicApplication.offset*` — both already rounded for display — rather than the actual unrounded `remainingN/P/K` fed to `allocatePurchasedProducts`; rounding each side before subtracting can disagree with rounding the true remaining amount at a boundary (10.5 gross / 10.4 offset: real remaining 0.1 rounds to 0, but round(10.5)-round(10.4)=1), so the exposed field could materially disagree with the blend it purports to explain. Fixed by rounding `remainingN/P/K` themselves (the exact values already used for allocation) — provably consistent by construction. |
| `fertiliser-plan.ts`'s `roundKgToTonnes` / `toFarmFertiliserPurchaseRequirementTonnes` | Checkpoint 3 | `aggregateFarmFertiliserDemand` (already-exact per-product kg totals, unmodified) | Documented rounding policy: nearest 0.01 t (10 kg), applied exactly once to each already-exact farm-level kg total — never by summing individually-rounded per-field/per-line tonnages, which would silently drift for a small real requirement (see the function's own test: three real 4 kg allocations round to 0 t individually but 0.01 t as a genuine 12 kg farm total). |
| `app/actions/fertiliser-plan.ts`'s `getFarmFertiliserDemandAction` | Checkpoint 3 (additive) | `toFarmFertiliserPurchaseRequirementTonnes` (new dependency) | New `purchaseRequirementTonnes` field on the existing `FarmFertiliserDemandActionResult` — a real, exact conversion of the same `demand` this action already computed (pre-`toFarmInputDemand` mapping), never a second, independently-derived figure. Every existing field on this result is unchanged. |
| `FarmFertiliserPurchaseRequirementCard.tsx` (`src/components/farm/`) | Checkpoint 3 | `getFarmFertiliserDemandAction` (already-existing action, previously unused by any UI) | The farm-wide Purchase Requirement screen (campaign item E) — deliberately farm-wide, not field-scoped, unlike every other card on the Nutrients screen; renders only products with a genuine remainder (Codex audit HIGH round 1: gates on the exact `remainingTotalKg`, never the rounded `remainingTotalTonnes` display figure — a real sub-5kg remainder rounds to "0.00 t" but is not genuinely zero). Codex audit HIGH round 2: a kept sub-5kg line still rendered a flat "0.00 t still to buy" — a real, positive remainder displayed as an actionable zero is exactly as misleading as omitting the line; `formatRemainingTonnes` now shows an honest "< 0.01 t" whenever the exact kg is positive but rounds to 0.00 t for display. Wired into `NutrientsPageClient.tsx` below the existing per-field `RemainingFertiliserRequirementCard`. |

**Deliberately not extended this checkpoint** (assessed, not implemented —
both genuinely out of scope for a "reuse existing engines, do not
rewrite" checkpoint, not oversights):
- **Over/under-supply variance reporting on `allocatePurchasedProducts`**
  (campaign item B) — its 3-step waterfall computes an exact continuous
  kg/ha rate per product to hit the remaining requirement; there is no
  discrete bag/tonne rounding in this model to create real over-supply.
  The one genuine gap — a future catalogue product failing
  `FERTILISER_PRODUCT_ADMISSIBILITY` after its rate was already assumed
  in a downstream waterfall step — is real but provably inert today
  (`allocatePurchasedProducts`'s own doc comment: "for today's static
  catalogue every line passes"); wiring a disclosure for a branch no
  real or synthetic test can honestly exercise without fabricating
  catalogue data was judged worse than leaving the existing doc comment
  as the disclosure.
- **Extending `nutrient-plan-trace.ts` beyond NAP compliance to the
  requirement/organic-offset/product-allocation chain** (campaign item
  F) — already explicitly disclosed as scoped-out, real follow-up work
  in that file's own doc comment since it was written; building an
  equally source-cited `DecisionRecord` for the allocation chain is a
  same-order-of-effort undertaking as the existing NAP trace, not a
  checkpoint-3-sized addition, and rushing it risked under-sourced
  `sourceId`/`complianceChecks` entries in a file that exists precisely
  to be a rigorous, peer-reviewable audit trail.

## Fertiliser Vertical V1, Checkpoint 4 (Scientific Evidence Report, 2026-09-14)

`SOIL_SAMPLING_ARCHITECTURE.md`'s frozen object model names exactly one
genuinely new entity for this checkpoint — `ScientificEvidenceReport` —
at the end of a chain (`FertiliserPlan`, `Actual`) it itself already
marks "existing". This checkpoint builds only that: a pure, read-only
assembly of one CompositeSample's full evidence chain from sources every
other screen already independently reads and displays. No new science,
no new persisted table.

Checkpoint 4 Codex audit gate: **CLOSED**, 4 rounds (2 High fixed round
1; 1 High fixed round 2; 1 High fixed round 3; clean round 4) — see
`IMPLEMENTATION_LOG.md`'s own round-by-round account.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `orchestration/scientific-evidence-report/index.ts` | Checkpoint 4 | `soil-sampling/index.ts` (`buildCompositeSampleView`), `lab-result/index.ts` (`getLabStatusForCompositeSample` — the same never-trust-the-persisted-interpretation reader Checkpoint 2 built), `fertiliser-plan/index.ts` (`getFieldRemainingFertiliserRequirement`), `prompt/recompute.ts` (`recomputePromptByKind`), `prompt/build-all.ts` (`computeFarmGrasslandAggregates`), `domain/nutrients.ts` (`calculateNutrientPlan`, `resolveFieldSlurryAllocation`) | `buildScientificEvidenceReport(jobSessionId)` — every field on the returned `ScientificEvidenceReport` is either copied verbatim from one of those existing, already-audited readers or a single, one-line arithmetic derivation of one (`productAllocationKgField` — `purchasedProducts[].totalKg`, already computed by `calculateNutrientPlan` itself, simply projected). Fails closed (`ScientificEvidenceReportError`) for a session that doesn't exist, isn't a `soil_sampling` session, or isn't yet confirmed — never a partial report presented as complete. Codex audit HIGH (round 1): `fertilityBasisStatus` is a real three-state result (`"current"`/`"superseded_by_newer_test"`/`"unknown"`) established only from a real, later `verifiedTest.sampleDate` than this sample's own — never inferred from a `compositeSampleId` mismatch alone (that field is absent for every legacy/manual test, so a mismatch alone proves nothing about time order). `acceptedPlansTruncated` discloses whenever the underlying farm-wide `listDecisionsForFarm` read hit its own row cap, so `acceptedPlans`'s "every real plan" claim is never silently false. |
| `app/actions/scientific-evidence-report.ts` | Checkpoint 4 | `orchestration/scientific-evidence-report` (already an existing dependency) | `getScientificEvidenceReportAction` — thin, one real orchestration call, the same "actions are thin" discipline every action file in this programme follows. |
| `app/(app)/evidence-report/[jobSessionId]/` (`EvidenceReportPageClient.tsx`) | Checkpoint 4 | `getScientificEvidenceReportAction` | The report screen — computes nothing itself, renders the fetched report's own real fields section by section (Field/LPIS, Composite Sample, Lab Result, Soil Interpretation, Nutrient Requirement, Regulatory Constraints, Product Allocation kg/ha and kg/field, Application Plan & Actual, Report Identity). Printable (browser Print/Save-as-PDF) and includes a collapsible raw-JSON "machine-reproducible manifest" — the exact same object the page renders, for independent verification. Entry point: `SoilSamplePageClient.tsx`'s `CompositeSampleRow`, "View report" once a real lab result exists. |
| `AppShell.tsx` / `DesktopSidebar.tsx` / `MobileBottomNav.tsx` / `SyncStatusBanner.tsx` / `MobileDetailHeader.tsx` | Checkpoint 4 (additive) | — | CSS-only, additive `print:hidden`/`print:*` utility classes so any screen in this app (not only the evidence report) prints its own real content without the sidebar/bottom-nav/banner/back-button chrome around it. No behaviour change on screen. |

## Grassland Fertiliser Pilot Completion, Checkpoint A+B (2026-09-15)

A completion campaign against the existing Fertiliser Vertical V1
(Checkpoints 1-4, above) and the earlier Real Farm V1 phases, driven by
an external pilot-readiness audit (F1-F12). Not a new vertical — closes
real gaps in the *existing* grassland fertiliser/lime journey. Two
checkpoints landed in this entry (a real file-interleaving constraint —
see `IMPLEMENTATION_LOG.md` — made a clean 2-commit split impractical;
both are covered by the same Codex audit round below). Checkpoint A:
archived-field scope (audit F2), product-supply reconciliation (audit
F1), units/provenance disclosure (audit F7/F8/F9/F11). Checkpoint B
(partial — B2/B3/B4 only, B1 real silage/grazing-plan persistence
explicitly NOT done this round, see `IMPLEMENTATION_LOG.md`): new dated
lab results on an already-tested field (audit F4), farm-wide lime
reconciliation (audit F5), the Scientific Evidence Report reachable from
legacy/manual lab entry (audit F6/F10).

Codex audit gate: round 1 found 2 High + 1 Medium (all real, all fixed
in this same entry's commit — see `IMPLEMENTATION_LOG.md`'s own
round-by-round account); round 2 pending.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `types.ts`'s `activeFields<T>` | Checkpoint A (additive) | — | Shared helper (`fields.filter(f => !f.archivedAt)`) replacing a private duplicate that used to live only in `support-profile.ts` — now the one canonical archived-field exclusion every farm-wide aggregation call site uses (`fertiliser-plan.ts`'s action layer, `ai-context/index.ts`, `scientific-evidence-report/index.ts`'s aggregate-feeding calls). A field-specific historical lookup (e.g. resolving one already-known field by id for a past evidence report) deliberately still uses the unfiltered list — this only governs farm-wide *aggregation* denominators. |
| `nutrients.ts`'s `allocatePurchasedProducts` / `calculateNutrientPlan` | Checkpoint A (breaking — `NutrientPlan.deliveredKgHa` is a new *required* field) | — | `allocatePurchasedProducts` now returns real `deliveredKgHa` (n/p/k), summed across every included product line's full NPK analysis, not just each line's own "sizing" nutrient — a fixed 0-7-30/18-6-12/protected-urea waterfall can genuinely deliver a byproduct nutrient (e.g. 18-6-12 bought to meet a P shortfall also delivers real K) that the pre-fix code never tracked. `checkNapCompliance` now compares the statutory ceiling against this real delivered figure (`availableNKgHa/availablePKgHa` from the already-existing statutory manure ledger, plus `deliveredKgHa` — never the agronomic `organicApplication.offset` ledger, which stays a separate, never-conflated figure per this file's own existing two-ledger-separation note) instead of gross requirement, closing audit finding F1 (a plan could show "requirement met" while the real product mix already exceeded or fell short of what compliance was actually checked against). |
| `types.ts`'s `NutrientPlan.deliveredKgHa` | Checkpoint A (breaking, additive field, required) | — | New required field — every existing caller/fixture across `src/app`, `src/components`, `src/orchestration` updated in this same entry (no caller left on the old shape). |
| `PurchasedFertiliserCard.tsx` | Checkpoint A | `NutrientPlan.netRequirement` / `.deliveredKgHa` (both already-existing/new fields, not re-derived) | Corrected unit labelling (kg/ha on the Rate column, new kg/field column, "Total" renamed "Cost" — audit F7/F8) plus a new delivered-vs-needed reconciliation block per nutrient (`Math.abs(variance) >= 0.5` disclosure threshold) so a farmer can see a real product-supply excess/shortfall against the stated requirement, not just the requirement in isolation. |
| `lib/status.ts`'s `livestockCategoryLabel` | Checkpoint A (additive) | — | Surfaces the real `LivestockCategory` actually driving a group's calculations (`GroupIdentityRow.tsx`/`LivestockGroupCard.tsx`) — audit F9 (a farmer-labelled "weanlings" group stored under `suckler_cow` had no way to see which category the engine was really using). Never auto-changes the label from the category — disclosure only. |
| `domain/soil-test-history.ts`'s `resolveSoilTestChain` | Checkpoint B (additive) | `types.ts`'s `SoilTest.previous` (new optional field, additive) | Real chronological ordering for a field's `SoilTest` history — compares real `sampleDate`s, never entry order, so a backfilled OLDER lab result (a delayed report, a typo'd date corrected later) is inserted into history rather than wrongly becoming the field's active fertility evidence (Codex audit round 1 HIGH — the first version of this feature, audit finding F4, used entry order only). Both `lib/farm-data/soil.ts`'s `addSoilTestToField` and `store/farm-store.tsx`'s mock-mode `addSoilTest` call this same function so real and mock mode can never diverge on the rule. |
| `domain/fertiliser-plan.ts`'s `aggregateFarmLimeRequirement` | Checkpoint B (additive) | `types.ts`'s `Field.fertility.verifiedTest.limeRequirement` (existing field, already saved by the legacy soil-test form — never a new lime engine) | Real farm-wide lime reconciliation (audit F5) — field rate (t/ha) × real `areaHa` = field tonnes, summed to a farm total; a field with no real laboratory lime figure contributes 0 and is counted in `fieldsWithoutLimeEvidence`, never silently treated as needing none. `FieldLimeRequirement.fieldName` (Codex audit round 1 MEDIUM fix) carries the field's own real name so multiple fields' rows are distinguishable in `FarmLimeRequirementCard.tsx`. |
| `app/actions/fertiliser-plan.ts`'s `getFarmLimeRequirementAction` | Checkpoint B (additive) | `aggregateFarmLimeRequirement`, `activeFields` | Thin action wrapper; archived fields excluded via the same `activeFields` helper every other farm-wide read in this entry uses. |
| `orchestration/scientific-evidence-report/index.ts` | Checkpoint B (breaking — `ScientificEvidenceReport.compositeSample` changes from required to optional; additive `manualEntry` field; new export `buildScientificEvidenceReportForField`) | `domain/soil-interpretation.ts`'s `interpretLabResult` (the exact same recompute-from-raw-evidence reader Checkpoint 2's `getLabStatusForCompositeSample` already uses for the GPS path) | Closes audit F6/F10 — the Scientific Evidence Report is now reachable from the legacy/manual "Add soil test" workflow, not only a GPS-guided composite sample. The GPS-path function (`buildScientificEvidenceReport`) and the new field-keyed one (`buildScientificEvidenceReportForField`) share one extracted helper (`buildFieldEvidenceSections`) for every section common to both (nutrient plan, product allocation, current recommendation, accepted plans, field fertiliser status) so neither path can silently diverge on how those are computed. The manual path never fabricates a composite sample — `compositeSample` is `undefined` and `manualEntry` (sampleRef/date/laboratory/pH/P/K/Mg/organic matter/lime, copied verbatim from the field's own real `verifiedTest`) is populated instead. Every existing caller of `compositeSample` (`EvidenceReportPageClient.tsx`) updated in this same entry to handle its new optional shape. |
| `app/actions/scientific-evidence-report.ts`'s `getScientificEvidenceReportForFieldAction` | Checkpoint B (additive) | `buildScientificEvidenceReportForField` | Thin wrapper, same discipline as the existing `getScientificEvidenceReportAction`. |
| `app/(app)/evidence-report/field/[fieldId]/` (new route) + `EvidenceReportPageClient.tsx` (extended) | Checkpoint B | `getScientificEvidenceReportForFieldAction` | Same report screen, now also addressable by `fieldId` instead of only `jobSessionId` (a small discriminated-prop extension, `{jobSessionId} \| {fieldId}`) — renders the manual-entry "Laboratory result" section from `manualEntry` when `compositeSample` is absent, and a "Soil sample" section explaining this path uses no GPS-guided composite sample rather than fabricating one. Entry point: `SoilFieldCard.tsx`'s "View test" sheet, new "View scientific evidence report" link. |
| `FarmLimeRequirementCard.tsx` (new component) | Checkpoint B | `getFarmLimeRequirementAction` | Farm-wide lime requirement card (mirrors `FarmFertiliserPurchaseRequirementCard.tsx`'s own established pattern) — per-field rate/tonnes rows (each now labelled by real field name), farm total, and the same F5 "never label a partial total as complete" disclosure `aggregateFarmLimeRequirement` already carries. Wired into `NutrientsPageClient.tsx` below the existing fertiliser purchase requirement card. |

## Grassland Fertiliser Pilot Completion, Checkpoint C (2026-09-15)

Resolves audit F3 (no managed quote-request workflow) + relevant F12
content, by **selectively porting** real, already-audited work from the
`worktree-managed-quote-pilot` git worktree (branch
`worktree-managed-quote-pilot`, diverged from `farm-return-next` at
merge-base `0cf2cf2`) rather than building a new system from scratch —
per this campaign's own explicit instruction to inspect and reuse that
work deliberately, never blindly merge it. That worktree built a much
larger system (Checkpoints 1-4: farmer request → supplier enquiry →
farmer interest → supplier offer → operator allocation) than this
pilot's own acceptance criteria require (the brief explicitly excludes
"automated supplier tendering, supplier selection" from scope) — **only
Checkpoint 1** (farmer submits a request, sees/withdraws it, reference +
confirmation; admin retrieves exact submitted demand) is ported. Codex
audit round 1 CRITICAL: the first pass had also copied the Checkpoint
2-4 migration *files* into this branch's own git history purely for
`supabase migration list --linked` reconciliation convenience, even
though no Checkpoint C application code uses those tables at all — one
of them (`20260911180000_quote_pilot_checkpoint2.sql`'s
`discard_quote_enquiry_batch`) contains a real irreversible
delete-with-cascade, which `AGENTS.md` prohibits regardless of whether
current application code happens to call it. Fixed: those 6 migration
files are **not** committed to this branch at all — Dev's own already-
applied schema for them is untouched (this session did not, and does
not have standing to, revert real schema already live before this
session began) but is marked `reverted` in Dev's own migration-tracking
table (`supabase migration repair --status reverted`, tracking-only,
no schema change) so this branch's own committed migration history
never asserts or depends on those tables existing. Dormant, unused,
disclosed — never silently assumed complete or relied upon.

**Port method**: every file below was extracted with `git show
60cd91d:<path>` (commit `60cd91d`, "Managed quote pilot: reconcile
disclosure-persistence contract docs, resolve contracts_frozen gap" —
the exact commit immediately before Checkpoint 2's enquiry/tendering
code begins, confirmed by diffing it against its own merge-base and
checking no `src/app/operator/quotes/` or enquiry/offer file exists in
that diff) into this repo, adapted only where this branch's own real
drift required it (one test fixture needed the new `purchaseRequirementTonnes`
field Checkpoint A3 added to `FarmFertiliserDemandActionResult` after
the worktree forked) — every ported file typechecked and its own
existing tests passed unmodified otherwise, confirming the port was
clean. Two small genuinely new additions on top of the port: a real
lime quick-fill (below) and a minimal admin retrieval screen (the
ported Checkpoint 1 had the real operator action layer but no UI screen
yet — that arrived bundled with Checkpoint 2's enquiry UI in the
worktree, which this port deliberately excludes).

**Migrations**: both real quote-pilot migrations Checkpoint 1 needs
(`20260911080000_quote_pilot_checkpoint1.sql`,
`20260911150000_quote_pilot_disclosure_fields.sql`) were already applied
to Farm Return V1 Dev by the worktree's own earlier session (confirmed
via `supabase migration list --linked` before touching anything) — both
committed to this branch. The Checkpoint 2-4 migration files are
deliberately **not** committed (see above) — reconciled instead via
`supabase migration repair --status reverted` (tracking-only). Six new
real fix migrations this checkpoint (Codex audit round 7 LOW: this
count previously read "Seven", miscounted against the real migration
files — corrected here to match `supabase/migrations/`'s own actual
content, the authoritative source), all applied via `supabase db push
--linked`: `20260915230000_quote_pilot_submit_idempotency_payload_check.sql`
(Codex audit round 1 MEDIUM); its own genuine follow-up,
`20260915231000_quote_pilot_submit_idempotency_payload_check_round2.sql`
(Codex audit round 2 MEDIUM x2); a further follow-up,
`20260915232000_quote_pilot_idempotency_ignore_estimate_asof.sql`
(Codex audit round 3 HIGH — round 2's own new payload comparison
accidentally broke genuine idempotent retries of an "estimated"
request, since its `estimateSnapshot.asOf` is server-regenerated on
every call); `20260915233000_quote_pilot_revoke_public_execute_and_harden_operator_check.sql`
(Codex audit round 3 CRITICAL — no quote-pilot function had ever had
its default `PUBLIC` execute grant revoked, letting the real
information-disclosure primitive named on `lib/farm-data/quote-operators.ts`'s
own table row below through); and its own genuine follow-up,
`20260916000000_quote_pilot_operator_policies_and_conditional_revoke.sql`
(Codex audit round 4 HIGH — round 3's own fix broke the real operator
demand-inbox read outright, since the two real operator RLS policies
still called the exact function round 3 revoked every grant on; and
round 4 CRITICAL — round 3's own PUBLIC-revoke was incomplete for a
fresh-database replay, fixed with `to_regprocedure`-gated conditional
revokes correct on both Dev and a fresh replay); and
`20260916001000_quote_pilot_submit_reject_blank_key_and_withdrawn_retry.sql`
(Codex audit round 6 MEDIUM x2 — the idempotency key was never
validated as a real UUID, and a retry never checked whether the
matched existing request had since been withdrawn, letting a withdrawn
request be reported back as a fresh "submitted" confirmation). See
`submit_quote_request`'s/`is_quote_operator`'s own table rows below for
the full account of each. `20260911150000_quote_pilot_disclosure_fields.sql`
was also edited in place (Codex audit round 2 CRITICAL — see above);
that one edit needed no re-push since Dev's own schema already reflects
the file's real end state.

Porting the first two migrations also surfaced a real, separate,
pre-existing gap while reconciling `migration list --linked`: three real
Fertiliser Vertical V1 migrations
(`20260912000000_soil_core_observations.sql`,
`20260913000000_lab_results.sql`, `20260913010000_soil_interpretations.sql`)
had never been applied to Dev at all — fixed in the same pass via
`supabase db push --linked`. Not a Checkpoint C migration itself, but a
real gap this checkpoint's own migration-reconciliation work happened to
surface and close.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/quote-request.ts` | Checkpoint C (ported, unmodified) | — | Pure request/demand validation and compatible-grouping logic — one product/quantity/unit ask with a delivery window per request; `groupCompatibleQuoteDemand`'s exact-product-and-exact-window grouping (deliberately not overlap-based, see the function's own doc comment); `quoteQuantityToKgIfKnown` never guesses a bag-to-kg conversion without a verified pack weight. |
| `lib/farm-data/quote-requests.ts` | Checkpoint C (ported, unmodified) | — | Every write goes through security-definer RPCs (`submit_quote_request`/`revise_quote_request`/`withdraw_quote_request`) — real idempotency key support (prevents duplicate demand from a repeated click/retry), real optimistic-concurrency revision numbers (`StaleQuoteRequestRevisionError`, never a silent overwrite of a concurrent edit), immutable per-revision snapshots. Codex audit round 1 MEDIUM: `submit_quote_request`'s own idempotency-key early-return path never compared the newly-submitted payload against what that key originally committed — a real retry sequence this app's own client allows (an ambiguous failure leaves the form editable, same key reused) could return a reference for a request whose real stored product/quantity/delivery window/address differs from the form just submitted. Fixed via `20260915230000_quote_pilot_submit_idempotency_payload_check.sql`: both the early-return path and the concurrent-insert race path compare every field and raise `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` on a genuine mismatch. Codex audit round 2 MEDIUM x2 (re-review): that comparison still omitted the disclosure fields (early-return path) and the entire delivery snapshot + disclosure fields (the separate race-path copy, already drifted from the early-return path's own more complete check). Fixed via a genuinely new follow-up migration, `20260915231000_quote_pilot_submit_idempotency_payload_check_round2.sql` (this repo's own established "new migration per fix round, never edit an already-applied one" convention) — extracted the comparison into one shared internal helper, `_quote_request_payload_matches` (revision + delivery snapshot + disclosure, all in one place), both paths now call. Codex audit round 3 HIGH (re-review): that same helper's exact-equality check on the whole `estimate_snapshot` JSONB broke genuine idempotent retries of an "estimated" request, because its own `asOf` field is regenerated fresh (`new Date().toISOString()`) on every real call — a real, unchanged retry would always produce a different `asOf` and be wrongly rejected as a different payload. Fixed via `20260915232000_quote_pilot_idempotency_ignore_estimate_asof.sql`: the comparison now excludes `asOf` specifically (`jsonb - 'asOf'`) while every other real estimate field still must match exactly. Codex audit round 6 MEDIUM x2 (re-review, first round with 0 Critical/0 High): the idempotency key itself was never validated (a direct caller could submit `''`/arbitrary text), and neither retry path checked whether the matched existing request had since been withdrawn — a withdrawn request could be reported back as a fresh, active "submitted" confirmation, directly undermining Checkpoint C's own "receive unique reference + confirmation" requirement. Fixed via `20260916001000_quote_pilot_submit_reject_blank_key_and_withdrawn_retry.sql`: `submit_quote_request` now rejects any key that isn't a real, well-formed UUID, and both retry paths raise a clear `IDEMPOTENCY_KEY_REUSED_REQUEST_WITHDRAWN` error instead of confirming a withdrawn request. `revise_quote_request` uses a structurally different, already-correct mechanism (`expected_revision_number`) the idempotency-key findings above do not apply to. |
| `lib/farm-data/farm-delivery-details.ts`, `lib/farm-data/quote-operators.ts` | Checkpoint C (`farm-delivery-details.ts` ported unmodified; `quote-operators.ts` ported + round 3-4 fix) | — | Reusable farmer delivery-details CRUD (separate from a request's own immutable delivery snapshot); real security-definer allow-list check — never derived from any farmer-editable field. Codex audit round 3 CRITICAL: the original `is_quote_operator(uuid)` accepted an arbitrary caller-supplied user id instead of deriving the caller's own real identity internally, AND (like every other quote-pilot function) had never had its default `PUBLIC` execute grant revoked — together, any anonymous caller could query real operator-membership status for any arbitrary real user id. Fixed via `20260915233000_quote_pilot_revoke_public_execute_and_harden_operator_check.sql`: a new, zero-argument `is_quote_operator_for_current_user()` RPC derives `auth.uid()` internally (can only ever answer for the real caller's own identity) and is the only path `quote-operators.ts` now calls; the old `is_quote_operator(uuid)` is not dropped (`AGENTS.md`'s forward-only rule) but has every grant revoked, `PUBLIC` included, leaving it inert. Codex audit round 4 HIGH (re-review): that same round-3 revoke broke the real operator demand-inbox read outright — the two real operator RLS policies (`quote_requests_operator_read`/`quote_request_revisions_operator_read`) still called the now-fully-revoked `is_quote_operator(uuid)` inside their own `USING` clause, and an RLS policy expression runs under the querying role's own privileges. Fixed via `20260916000000_quote_pilot_operator_policies_and_conditional_revoke.sql`: both real policies updated in place (`alter policy ... using (...)`, never `drop policy`) to call the new `is_quote_operator_for_current_user()` instead — the same real function this module already calls. |
| `orchestration/quotes/index.ts` | Checkpoint C (ported + additive extension — new `limeOption`/`QuoteRequestLimeOption`, new `getFarmLimeRequirementAction` dependency) | `app/actions/fertiliser-plan.ts`'s `getFarmFertiliserDemandAction` (unmodified, reused verbatim for prefill — never re-derived) | `getQuoteRequestPrefillContext` reshapes real farm-wide fertiliser demand for the request form; `submitQuoteRequestOrchestrated`'s own server-side re-lookup refuses a caller-claimed `"estimated"` quantity basis unless a real `FarmInputDemand` row for that exact product genuinely exists (Checkpoint 1's own Codex audit HIGH fix, unmodified). New: also reuses `getFarmLimeRequirementAction` (Checkpoint B3) for a real lime figure — deliberately kept OUT of the `estimateSnapshot`/`"estimated"` provenance path (lime is not a `FarmInputDemand` row; see `QuoteRequestLimeOption`'s own doc comment). |
| `app/actions/quote-requests.ts`, `app/actions/quote-operator.ts` | Checkpoint C (ported, unmodified) | `orchestration/quotes` | Thin action layer — every farmer action re-resolves the caller's own real farm server-side; every operator action calls `requireQuoteOperator()` first, defense in depth alongside RLS. |
| `components/farm/RequestQuoteSheet.tsx` | Checkpoint C (ported + additive extension — real lime figure shown for reference) | `getQuoteRequestPrefillContextAction` | The farmer's own "Request a quote" form — pre-submit disclosure with an enforced affirmative checkbox, real disclosure-version/acceptance-timestamp persistence, product prefill from real farm-wide demand OR fully manual entry, plus (when the farm has real lime evidence) a purely informational real lime-total banner near the manual-entry fields. Codex audit HIGH (Checkpoint C round 1): the first version auto-quick-filled the manual fields from that real figure on selection, then submitted it as `quantityBasis: "farmer_entered"` — a real, calculated figure mislabeled as if the farmer had typed it themselves. Fixed: the banner never auto-fills anything; a farmer who wants to request lime types the figure into the manual fields themselves, at which point `"farmer_entered"` is genuinely, unambiguously true. Codex audit MEDIUM (Checkpoint C round 1): the confirmation screen (with the real reference) used to be unmounted the instant submission succeeded, because both real parents closed the sheet in the same `onSubmitted` callback `handleSubmit` itself fired immediately on success — a farmer never actually saw their own reference. Fixed: `onSubmitted` now fires only from the confirmation screen's own "Done" button, once the farmer has genuinely seen it. Codex audit HIGH (Checkpoint C round 5): the lime banner labelled a genuinely PARTIAL total (`fieldsWithoutLimeEvidence > 0`) as "your farm's real total lime requirement" — the same "partial presented as complete" shape `FarmLimeRequirementCard.tsx`'s own audit-F5 disclosure exists to prevent. Fixed: a partial total is now called "the real lime total from laboratory results on file so far... real but partial, not your farm's complete lime requirement" (the same honest framing that card already established); a genuinely complete total keeps the original "real total" wording. Codex audit LOW (Checkpoint C round 6): the farmer's reusable delivery-details profile is saved independently before the quote RPC, so a subsequent RPC failure leaves it changed regardless — assessed as genuinely intentional (a separate real entity from the request's own immutable delivery snapshot, the same "saved regardless of an unrelated later failure" behaviour a profile edit elsewhere in this app already has), documented as such rather than changed. Codex audit HIGH (Checkpoint C round 7): selecting a real "estimated" product option prefilled the editable quantity field with `Math.round(opt.remainingRequirementKg)` — a real calculation inside a React component. Fixed by removing the rounding entirely; the exact real value now prefills verbatim (the true precise figure was already separately preserved in `estimateSnapshot`, never lost, but the prefilled starting point a farmer might accept as-is was previously altered). Codex audit HIGH (Checkpoint C round 8, corrected round 9): round 7 fixed the actual prefill, but the option label text next to it still displayed the same figure at 0dp then 6dp — both could genuinely approximate/truncate it, undermining the exact prefill just below. Fixed (round 9, final): `formatNumber(remainingRequirementKg, 20)` — 20 fractional digits exceeds real JS-number precision, so the label now genuinely never truncates either. A second, narrow Codex re-review (round 9b) independently confirmed both the HIGH and a related LOW (missing aggregate-precision test on the operator screen, see that row) are closed — `AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=0`. Entry point: `input-planner/page.tsx` (real-mode only — no demo-mode quote data fabricated for a farm that isn't real). |
| `app/(app)/quotes/` (`QuotesPageClient.tsx`) | Checkpoint C (ported; precision display fixed rounds 8-9) | `listMyQuoteRequestsAction` | The farmer's own real quote-request history — status (`requested`/`withdrawn`) derived server-side, never client-set; withdraw action; reopens the same real data on reload (a farmer can navigate away and come back). Codex audit HIGH (Checkpoint C round 8, corrected round 9): the farmer's own submitted quantity displayed at 1dp then 6dp, both of which could genuinely truncate a real fractional value. Fixed (round 9, final): `formatNumber(quantity, 20)` — 20 fractional digits exceeds what a JS `number` can even accurately represent, so no real value is ever truncated. |
| `app/operator/` (`layout.tsx` ported unmodified; `quotes/page.tsx` new; `OperatorQuotesClient.tsx` new, precision display fixed rounds 8-9) | Checkpoint C (admin retrieval, audit F3/F12) | `getOperatorDemandInboxAction` (ported, unmodified) | The real admin retrieval screen the campaign requires — "Admin must retrieve exact submitted demand via authorised workflow." Deliberately minimal: renders `OperatorDemandInbox` (compatible-demand groups + the full raw request list, reference/farm/product/quantity/delivery window/status), nothing more — no supplier-enquiry/offer/allocation UI (out of this pilot's scope; the worktree's own later checkpoints built that, not ported). Access gated entirely by `layout.tsx`'s real `is_quote_operator_for_current_user` check (redirects to `/today` otherwise), mirroring the exact same "actions are thin, layout enforces access, component only renders" discipline every other screen in this app follows. Codex audit LOW (Checkpoint C round 5): the empty-groups message wrongly said an empty `groups` array meant every real request was "individually distinct or withdrawn" — `groupCompatibleQuoteDemand` groups even a single genuinely distinct active request (a real group of size 1), so an empty array specifically means no real active request exists. Fixed with an accurate message. Codex audit HIGH (Checkpoint C round 8, corrected round 9): this screen's own header claims "exactly as submitted"; the per-request quantity displayed at 1dp then 6dp, both truncating a real fractional value contrary to that claim. Fixed (round 9, final): `formatNumber(quantity, 20)`, genuinely never truncating. The `resolvedTotalKg` group-total SUM was separately fixed round 8 from 0dp to a deliberately more conservative 2dp (real kg-level precision without exposing genuine float-summation noise); Codex audit LOW (round 9) found this had no fractional regression test — fixed with one (`500.25` → "500.25 kg total"). |

Checkpoint C's Codex audit gate is CLOSED as of round 9 (0 Critical / 0
High across all 9 rounds, including round 9's own second, narrower
re-verification pass — see `IMPLEMENTATION_LOG.md`'s Checkpoint C round
9 entry for the full account). `contracts_frozen` is `true` again in
`BUILD_STATE.json` as of this section's own closing commit.

## Fertiliser Overview and Stock Visuals (2026-09-17)

A new farm-wide **Fertiliser Plan landing page** (`src/app/(app)/fertiliser-plan/`),
using `docs/design/farm-return-fertiliser-overview-concept.png`'s own
visual language (a cylindrical slurry tank with a fill line/capacity
markings; a vertical segmented stock column, solid/hatched/empty) as
DESIGN GUIDANCE for real dynamic SVG/CSS components built with this
app's own tokens — never the image itself, and none of its invented
taglines/logo. Preserves everything that already existed: `/nutrients`
(now labelled "Field Nutrient Plan" in nav — see `nav-items.ts`) is
completely unchanged, still the real, individually field-scoped plan
with its full scientific-engine detail; the quote workflow
(`RequestQuoteSheet`, `/quotes`) is reused verbatim, never reimplemented.

**Before assuming anything was missing**, this campaign inspected the
real existing model first (per its own brief's explicit instruction):
`Housing.storageCapacityM3`/`storageFillPct` already existed and were
already a real, direct "% of storage volume" farmer entry (never a depth
reading — `housing/page.tsx`'s own "Current fill (%)" field), and
`SlurryAllocation.volumeM3` already gave real per-tank allocated volume.
Only two things were genuinely missing, confirmed by reading the code,
not assumed: (1) `storageFillPct` carried no provenance at all — no way
to tell a real farmer-typed fill level from a never-touched default, and
no "last updated" timestamp; (2) there was no fertiliser/lime STOCK
record anywhere in this app at all (only recommended/planned/confirmed-
applied *demand*, never a farmer's own physical stock count). Both
closed with the smallest reliable addition, not a new subsystem — see
the migration row below.

**Disclosed scope limit, confirmed with the product owner mid-campaign**:
this is NOT an inventory/order-management system. No delivery,
application or movement automatically adjusts a running stock balance —
there is no reliable source of automatic stock movements anywhere in
this app (no delivery-receipt record exists, and a confirmed fertiliser
Actual's own product/quantity cannot always resolve to a real kg figure
— `fertiliser-plan.ts`'s own long-standing header explains why). Each
`fertiliser_stock_records` row is a full, dated, point-in-time
observation ("as of this date, I have X kg of Product Y"), never a
delta; the CURRENT balance is simply the most recent record, and a
farmer corrects a mistaken figure by adding a NEW record — CLAUDE.md
"provenance is permanent" — never editing an old one (enforced at the
database layer too: insert/select only, no update/delete policy at
all). The stock visual's own "confirmed incoming delivery" (hatched)
band is therefore always `0`/never rendered this build — kept as a real,
typed field for a future campaign to populate, never faked with 0
treated as "nothing incoming" vs. an actual delivery.

**Migration**: `supabase/migrations/20260917000000_fertiliser_stock_and_slurry_provenance.sql`
(applied to Farm Return V1 Dev via `supabase db push --linked`) —
additive and forward-only, two independent changes: (1)
`housing.storage_fill_status`/`storage_fill_recorded_at`, `not null
default 'estimated'` backfill for every existing row (this app cannot
honestly tell, after the fact, whether an old value was ever
farmer-confirmed — never upgraded to `'farmer_recorded'` retroactively;
`storage_fill_recorded_at` stays genuinely null for those same rows);
every NEW `createHousing`/`updateHousing` call stamps both together,
real, going forward. (2) `fertiliser_stock_records` (new table) — farm-
scoped, RLS owner-read + owner-insert only, no update/delete policy at
all (see the scope-limit paragraph above).

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/fertiliser-stock.ts` | New | `nutrients.ts`'s `knownFertiliserProductComposition` (indirectly, via the remaining-requirement figures it's fed — never re-derives composition itself) | Pure: `FertiliserStockRecord`/`currentFertiliserStockByProduct` (most-recent-record-per-product, ties broken by insert time, never summed/averaged) and `buildFertiliserStockBand` (the solid/hatched/empty band arithmetic — worked example verified by test: 100/1000 stock with no incoming tracked = 10% solid/90% shortfall; the brief's own optional "+400 incoming" variant = 10/40/50). A `"not_recorded"` vs `"recorded"` discriminated result keeps "stock genuinely unknown" from ever rendering the same as "confirmed zero" (brief: "Unknown is not zero"). Handles a zero remaining requirement safely (no division by zero) and discloses real surplus explicitly rather than clamping it away. Codex audit HIGH (round 1): product identity was matched by the raw, case/whitespace-sensitive string, splitting one real balance ("Urea"/"urea"/" Urea ") into two; fixed with a new exported `normaliseFertiliserProductKey` matching key, the map's own real key from round 1 onward — the farmer's own original spelling is still always what's stored/displayed. Codex audit MEDIUM (round 1): `validateNewFertiliserStockRecordInput`'s date check only confirmed `new Date(value)` parsed, which silently accepts a nonexistent calendar date like `2026-02-30` (JS rolls it over to a real `2026-03-02`); fixed with a new `isValidCalendarDateString` requiring an exact `YYYY-MM-DD` round-trip. 31 unit tests (24 original + 7 from these two fixes). |
| `domain/slurry-storage.ts` | New | — | Pure: `buildSlurryTankView` (one real tank's volume/fill/allocated/unallocated from already-captured `Housing`/`SlurryAllocation` fields, never `Housing.slurryEstimate` — that figure is a still-placeholder PROJECTED-PRODUCTION estimate, and mixing it with a real captured fill level would conflate "physically in the tank now" with "projected to produce", exactly what the brief's DATA INTEGRITY section forbids) and `buildFarmSlurryStorageOverview` (farm-wide fill = total volume ÷ total capacity, verified by test to NOT equal an average of each tank's own percentage across unequal tank sizes — the brief's own explicit instruction). Codex audit HIGH (round 1): `SlurryTankVisual.tsx` was clamping fill percentage and deriving the fill/allocated split itself — real arithmetic outside `src/domain/`; fixed with a new pure `computeSlurryTankDisplayProportions`, returning the real, bounded 0-1 fill/allocated fractions a tank illustration needs, the component now only maps them to its own SVG pixel constants. 13 unit tests (9 original + 4 from this fix). |
| `domain/fertiliser-plan.ts` | Additive extension (`aggregateFarmNutrientRequirementKg`, new) | Everything else on this already-frozen module, unmodified | New pure function: real farm-wide N/P/K NUTRIENT kg totals (distinct from this same module's existing PRODUCT kg/tonnes totals — the brief's own explicit "distinguish nutrient kg from fertiliser product kg/tonnes" instruction) — sums each already-recomputed field's own `requirementKgHa x areaHa`; excludes a field with no real requirement or a non-finite/non-positive area, never treating it as a zero-and-included contributor. 4 new unit tests. |
| `lib/farm-data/fertiliser-stock.ts` | New | — | `listFertiliserStockRecordsForFarm`/`createFertiliserStockRecord` — insert/select only, matches the migration's own RLS grants exactly; no update/delete function exists at all. |
| `lib/farm-data/housing.ts` | Additive extension (`createHousing`/`updateHousing` now take an explicit `storageFillStatus`) | — | Codex audit CRITICAL (round 1): the first version unconditionally stamped `'farmer_recorded'` whenever `storageFillPct` was present — but `housing/page.tsx`'s form silently converts a genuinely BLANK "Current fill (%)" field to `0` before calling this, so an unentered value was presented as a real, timestamped farmer confirmation. Fixed: `storageFillStatus?: "estimated" \| "farmer_recorded"` is now an explicit, caller-decided input (default `"estimated"`, the safe default) — `housing/page.tsx` computes `fillPctEntered = fillPct.trim() !== ""` and passes the real answer, never inferred from the resulting number (a real, deliberate `0` is exactly as valid a farmer entry as any other). `farm-store.tsx`'s mock-mode `addHousing`/`updateHousing` mirror the identical logic. Codex audit CRITICAL (round 2): round 1's own fix only closed the ADD path — `housing/page.tsx`'s `startEdit` prefills the fill field from the shed's own existing value, so an EDIT that never touched that field still re-stamped it as a fresh farmer confirmation. Fixed with a new `fillPctTouched` state (`housing/page.tsx`) — an edit that never touches the fill field now omits `storageFillPct`/`storageFillStatus` from the update payload entirely, so `updateHousing` here leaves the row's real existing value/provenance completely untouched, per its own `if (input.storageFillPct !== undefined)` guard (unchanged — this module's own contribution to the round 2 fix is that the guard is now correctly reachable/skippable by the caller, not a change to this file itself). Verified live against Farm Return V1 Dev, not just unit tests: a real shed created via the actual UI with the field left blank persisted `estimated`/`null`; the same shed then edited with `75` typed in persisted `farmer_recorded` with a real timestamp. Round 3 (focused re-review): confirmed clean, 0/0/0/0. |
| `app/actions/fertiliser-plan-overview.ts` | New | `app/actions/fertiliser-plan.ts`'s `getFarmFertiliserDemandAction`/`getFarmLimeRequirementAction` (unmodified, reused verbatim — never recomputed); `orchestration/prompt/recompute.ts`'s `recomputePromptByKind` (the identical real fertiliser-recommendation engine every per-field screen already calls, run once per active field, reused for BOTH the field-breakdown list and the farm-wide N/P/K total so the engine only runs once per field) | `getFertiliserPlanOverviewAction` — the one real, farm-scoped read behind the landing page; archived fields excluded via `activeFields` before any aggregation, the identical rule every other farm-wide aggregation in this app already applies (Checkpoint A, audit finding F2). `addFertiliserStockRecordAction` — validates (`validateNewFertiliserStockRecordInput`) then inserts one new, immutable stock record; never updates. Codex audit HIGH (round 1, product-matching): every product lookup against `currentFertiliserStockByProduct`'s map now goes through `normaliseFertiliserProductKey`, matching that module's own fix — see its row above. 8 unit tests. |
| `lib/format.ts` | Additive extension (`formatNonNegative`, new) | Everything else on this already-established module, unmodified | Codex audit HIGH (round 2): round 1's own bare 2dp/1dp fix (below) only moved the false-zero display threshold, never removed it — a value smaller still (e.g. 0.004 kg) kept rendering as a flat "0". `formatNonNegative(value, maximumFractionDigits)` generalises `FarmFertiliserPurchaseRequirementCard.tsx`'s own pre-existing `formatRemainingTonnes` pattern ("< 0.01 t" rather than a misleading "0.00 t") into a shared, reusable formatter — checks the ACTUAL rounded output text, not a naive threshold comparison, so it stays correct at the real `Intl.NumberFormat` rounding boundary. This module's first real test file, 5 unit tests. Round 3 (focused re-review): confirmed clean, 0/0/0/0. |
| `components/farm/SlurryTankVisual.tsx`, `components/farm/FertiliserStockColumnVisual.tsx` | New | — | Dynamic SVG/CSS visuals (this app's own `--color-fr-*` tokens, never the concept image) — a real tank illustration with fill line/capacity ticks/allocated-vs-unallocated split, and a real segmented stock column (solid/hatched/empty, plus a visually distinct grey-hatch "Stock not recorded" state). Every part has a text equivalent alongside the graphic (brief: "never rely on colour alone"); transitions are `motion-safe:` only (brief: "respect reduced-motion preferences"). Codex audit HIGH (round 1) x2: `SlurryTankVisual.tsx` performed real domain arithmetic itself (see `domain/slurry-storage.ts`'s row above for the fix); every real kg/m³/percentage figure across both files displayed at 0dp, letting a genuine small positive figure show as a flat "0" — fixed with new local `formatKg`/`formatM3`/`formatPct` helpers at 2dp (kg/m³) / 1dp (%). Codex audit HIGH (round 2): that round-1 fix still let an even smaller real value display as a false "0" — the same local helpers now call the new shared `formatNonNegative` (`lib/format.ts`'s own row above) instead of a bare `formatNumber`. Round 3 (focused re-review): confirmed clean, 0/0/0/0. |
| `components/farm/AddFertiliserStockRecordSheet.tsx` | New | `Sheet` (`components/ui/Sheet.tsx`, unmodified — same overlay primitive `RequestQuoteSheet`/`FertiliserPlanSheet` already use) | The one, deliberately small stock-update form — product (from known demand products, lime, or a free-text "Other product…"), quantity, unit (kg/t only — "bags" excluded everywhere in this app, no verified bag weight exists), as-of date, source, optional note. Its own copy states plainly this is a dated observation, not a live balance. Codex audit HIGH (round 1): the product-dropdown prefill used a plain, case-sensitive `.includes()` against `defaultProduct`, so a differently-cased match would silently fall through to the free-text path and perpetuate the split-balance bug; fixed to match via `normaliseFertiliserProductKey`. Codex audit MEDIUM (round 1): `handleSubmit` had no `try`/`catch`/`finally` — a real server-action failure left Save permanently disabled with no explanation; fixed with real error handling and an honest, retryable failure message. 6 unit tests (3 original + 3 from these two fixes). |
| `app/(app)/fertiliser-plan/` (`page.tsx`, `FertiliserPlanOverviewClient.tsx`) | New | `RequestQuoteSheet` (reused exactly as `input-planner/page.tsx` already does it, never reimplemented) | The landing page itself: farm summary (season/fields/area/completeness, N/P/K nutrient kg vs. product kg/tonnes, incomplete/excluded fields disclosed by count and by name in the field breakdown), slurry storage section, fertiliser stock section, field breakdown (name/area/seasonal use/status, each row linking to `/nutrients?field=<id>` — the field's own existing detailed plan, never reimplemented), and an actions row (update stock, resolve missing inputs → `/fields`, view scientific evidence → `/reports`, request/review quotes → the existing quote workflow). Codex audit HIGH (round 1): the farm-wide N/P/K total displayed at 0dp; fixed to 2dp, same reasoning as the two visual components' own identical fix. Codex audit HIGH (round 2): same round-2 `formatNonNegative` fix as the two visual components' own identical finding. Round 3 (focused re-review): confirmed clean, 0/0/0/0. 8 unit tests. |
| `app/(app)/housing/page.tsx` | Additive extension (`fillPctTouched` state, new) | Everything else on this pre-existing page, unmodified | Codex audit CRITICAL (round 2): `startEdit` prefills the fill field from the shed's own existing value, so saving an edit that never touched that field still re-stamped it as a fresh farmer confirmation (round 1's own fix only closed the ADD path). Fixed with a new `fillPctTouched` boolean, set only by the fill input's own `onChange`, reset on every fresh add/edit — an untouched edit now omits `storageFillPct`/`storageFillStatus` from the update payload entirely. This page had no test file at all before this finding — new `page.test.tsx`, 4 unit tests (render via `FarmProvider` mock mode, a small in-test probe component reading the real `useHousingList()` state directly, since the pre-existing `ShedCard.tsx` this page reuses has no visible fill-provenance badge of its own to assert against). Round 3 (focused re-review): confirmed clean, 0/0/0/0. |
| `components/shell/nav-items.ts` | Additive extension | — | New `/fertiliser-plan` entry takes the "Fertiliser Plan" label; the pre-existing `/nutrients` entry is relabelled "Field Nutrient Plan" so the two aren't confused for the same screen — `/nutrients` itself, its route, and every existing deep link into it (`?field=<id>`) are completely unchanged (CLAUDE.md: never remove an approved screen without explicit instruction — this only relocates a nav label). |

The Fertiliser Overview and Stock Visuals campaign's Codex audit gate is
CLOSED as of round 3 (0 Critical / 0 High / 0 Medium / 0 Low, a focused
re-review scoped to round 2's own two fixes — see
`IMPLEMENTATION_LOG.md`'s "Fertiliser Overview and Stock Visuals —
Codex audit round 3" entry for the full account; rounds 1-2 found and
fixed 2 real Critical + 4 real High + 2 real Medium findings across the
full campaign). `contracts_frozen` is `true` again in `BUILD_STATE.json`
as of this section's own closing commit.

## Slurry Evidence & Composition V1 (2026-09-19)

A bounded, direct implementation increment (not a sequenced
`BUILD_PLAN.md` checkpoint — no Codex-audit-gate round was run against
it; verified via targeted + full unit test suites, `tsc`/`eslint`/build,
and a live check against `Farm Return V1 Dev`, disclosed here honestly
rather than implying an audit history that didn't happen). Establishes
the canonical slurry composition/evidence layer the existing Table 9-8
organic offset (`nutrients.ts`) was missing: which shed/tank a result
belongs to, its dry matter % and (recorded but not yet consumed) total
N/P/K, source/provenance, and whether it's assumed, farmer-provided or
laboratory-measured — reusing `DataStatus` (`"estimated"`/
`"farmer_adjusted"`/`"verified"`) rather than a competing enum.

**Genuine scientific boundary, not silently resolved**: Teagasc Table
9-8 (`SLURRY_TABLE_9_8`, `nutrients.ts`) has no parameter for an
arbitrary measured total N/P/K composition — only DM% (one of 4
published columns) and application rate vary its output. There is no
Teagasc-sourced rule anywhere in this repo converting a measured total
N/P/K into an available-nutrient-per-hectare figure. Resolution: DM% has
a clean, unambiguous path and is wired live into
`slurryAvailableKgHa`'s existing call inside `calculateNutrientPlan`;
measured/farmer-provided N/P/K is stored and displayed with full
provenance but deliberately NOT consumed by the engine — building that
conversion is a real scientific/product decision for the app owner, not
something this increment decides unilaterally.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/slurry-composition.ts` | New | — | Pure: `SlurryComposition` (modelled on `SoilTest`'s whole-record shape + `fertiliser_stock_records`' insert-only/no-update-no-delete storage discipline — the two closest existing precedents, not a third competing scheme), `validateNewSlurryCompositionInput`, and `currentSlurryCompositionByHousing` (the real tier-then-recency resolution per housing — a `"verified"` result always outranks a `"farmer_adjusted"` one regardless of which is more recent, per the brief's own explicit hierarchy; ties within a tier broken by `sampleDate` then `recordedAt`). 15 unit tests. |
| `domain/nutrients.ts` | Additive extension (`slurryComposition?` input, `resolveEffectiveSlurryComposition`, `NutrientPlan.organicApplication.dmPct`/`dmPctEvidence`, new) | Everything else on this already-frozen module, unmodified — `SLURRY_TABLE_9_8`/`slurryAvailableKgHa`/`NATIONAL_AVG_SLURRY_DM_PCT` are reused exactly as they were, never duplicated | The one real insertion point the brief's own investigation identified: `calculateNutrientPlan`'s previously-unconditional `const dmPct = NATIONAL_AVG_SLURRY_DM_PCT` now resolves through `resolveEffectiveSlurryComposition(input.slurryComposition)` — measured/farmer-provided DM% (if the caller resolved a current record for the contributing housing) replaces the national average; omitted input is byte-identical to prior behaviour (every pre-existing caller, unchanged). `organicApplication.dmPct`/`.dmPctEvidence` (status/source/sourceDate/compositionRecordId) make this retrievable on the plan itself. 8 new unit tests (2 unit + 3 orchestration + 3 hierarchy/provenance), full existing nutrients suite unchanged/green. |
| `lib/farm-data/slurry-composition.ts` | New | — | `listSlurryCompositionRecordsForFarm`/`createSlurryCompositionRecord` — insert/select only, matches the migration's own RLS grants; no update/delete function exists. |
| `app/actions/farm.ts` | Additive extension (`addSlurryCompositionRecordAction`, new) | Everything else on this already-established module, unmodified | Validates (`validateNewSlurryCompositionInput`) then inserts one new, immutable composition record; revalidates `/housing`, `/nutrients`, `/today`, `/plan`. |
| `store/farm-store.tsx` | Additive extension (`slurryCompositionRecords` state, `addSlurryComposition` action, `useSlurryCompositionRecords()` hook, new) | Everything else, unmodified | Mirrors `addHousing`'s exact real-vs-mock-mode branching (`persistRemote`/local-id fallback). Mock/demo farm seeds `[]` (the "Estimated" state shown honestly, not a fabricated example lab record). `(app)/layout.tsx`'s real-mode `initialState` now also reads `listSlurryCompositionRecordsForFarm`. |
| `orchestration/prompt/fertiliser-recommendation.ts`, `orchestration/prompt/build-all.ts` | Additive extension (`slurryComposition?` trailing param, new) | Everything else, unmodified | `promptForFertiliserRecommendation` forwards the same optional param straight into `calculateNutrientPlan` (matching its own `pBuildUpCompliance` precedent). `buildAllRealPrompts` (Today/Plan) resolves `currentSlurryCompositionByHousing` once per batch and passes the per-field record through. **Disclosed, deliberate scope cut**: `recompute.ts`/`getFarmFertiliserDemand`/Decision persistence/GPS matching/scientific-evidence-report still call these without the new param — safe (identical, unchanged fallback behaviour), just not yet benefiting from a farmer's entered composition; a real, bounded follow-up, not a silent gap. |
| `app/(app)/nutrients/NutrientsPageClient.tsx`, `components/farm/OrganicNutrientsCard.tsx` | Additive extension | Everything else, unmodified | Resolves and passes the field's effective composition into both of this screen's `calculateNutrientPlan` calls; `OrganicNutrientsCard` gained a "Dry matter used: X% [status] [source]" row (`StatusBadge`/`SourceBadge`, reused — `components/ui/StatusBadge.tsx`, unmodified) — the brief's own §7 explainability requirement, live-verified against Farm Return V1 Dev. |
| `components/farm/SlurryCompositionCard.tsx`, `components/farm/AddSlurryCompositionSheet.tsx` | New | `Sheet` (`components/ui/Sheet.tsx`, unmodified) | The farmer-facing card (Estimated/Farmer-provided/Laboratory states, "Why does this matter?" progressive disclosure, never a fabricated N/P/K figure for the Estimated state — no Teagasc rule in this repo publishes one) and its entry sheet (status-first "how do you know this?", DM% required, N/P/K optional with an explicit "not yet used in calculations" disclosure). Live-verified end-to-end against Farm Return V1 Dev (record created via the real UI, confirmed in the real database, reflected back in the real card). |
| `app/(app)/housing/page.tsx`, `components/farm/SuggestedAllocationCard.tsx`, `app/(app)/spreading/page.tsx` | Additive extension | Everything else, unmodified | Renders `SlurryCompositionCard`; the previously permanently-`disabled` "Refine estimate" button is now a real, enabled "Slurry analysis" button opening the new sheet (tank dimensions genuinely remain unbuilt — only slurry analysis entry is new). Brief §8: `SuggestedAllocationCard`'s mock-fixture-only priority/score (no real computing logic exists) is explicitly gated `isRealMode ? [] : slurryAllocations`, with a new honest "isn't assessed yet" empty state (never a blank card) — this was already functionally inert for a real farm (mock ids never match real UUIDs) but is now an explicit, disclosed gate rather than an incidental one; `spreading/page.tsx`'s `mockSpreadingScores` gated the identical way, matching that page's own pre-existing `isRealMode ? [] : mockPlannedApplications` precedent. |

**Migration**: `supabase/migrations/20260919000000_slurry_composition_records.sql`
(applied to Farm Return V1 Dev via `supabase db push --linked`, forward-
only, additive) — `slurry_composition_records` (new table), farm- and
housing-scoped, RLS owner-read + owner-insert only, no update/delete
policy at all — the same append-only discipline
`fertiliser_stock_records` already established.

**Deliberately deferred** (disclosed, not silently dropped): consuming
measured N/P/K (needs a new Teagasc-sourced rule this repo doesn't have
— a product/scientific decision for the app owner); wiring
`slurryComposition` through `recompute.ts`/`getFarmFertiliserDemand`/
Decision persistence/`scientific-evidence-report`; a full
`CalculationRun`/Audit Trail step-level entry for slurry composition
(`RecommendationAuditTrailCard.tsx`'s trace architecture) — a larger,
bespoke-per-step architecture change out of this increment's bounded
scope; field slurry prioritisation/allocation/weather scoring (explicitly
out of scope per the campaign brief).

## Slurry Application Context V1 (2026-09-19)

A bounded, direct implementation increment (not a sequenced
`BUILD_PLAN.md` checkpoint — verified via targeted + full unit test
suites, `tsc`/`eslint`/build; zero real `slurry_allocations` rows exist
farm-wide on `Farm Return V1 Dev` as of this campaign, confirmed via
`supabase db query --linked`, so this wiring change is inert for every
real farm today). Replaces `calculateNutrientPlan`'s previous
unconditional assumption that every slurry application is spring +
splashplate with a real, evidenced table-selection resolver keyed off
this field's own captured `SlurryAllocation.applicationMethod`.

**Reconciling the two existing Teagasc sources**: `SLURRY_TABLE_9_8`
(spring/splashplate) and `SPRING_LESS_SLURRY_TABLE` (spring/LESS,
already present but previously unwired) are both genuinely spring-scoped
by their own sourcing, and no evidenced spring/summer/autumn/winter
boundary exists anywhere in this repo. Resolution: table selection
varies by METHOD only (real, evidenced, already captured); a real
application date, when captured, is disclosed but never branches
selection — inventing a date-based rule without an evidenced source
would itself be a fabricated scientific number. `"incorporate_24h"`/
`"other"`/no captured method-that-fails-to-match → honest
`BLOCKED_INSUFFICIENT_EVIDENCE`/`AMBIGUOUS`, never a silent fallback to
splashplate once a real, different method is on file.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/nutrients.ts` | Additive extension (`resolveAvailableSlurryNutrients`, `AvailableSlurryNutrientResult`, `NutrientPlan.organicApplication.availableNutrientAssessment`, new; dead `slurryTiming`/`slurryMethod` `CalculateNutrientPlanInput` fields removed — never had a real caller) | `SLURRY_TABLE_9_8`/`slurryAvailableKgHa`/`SPRING_LESS_SLURRY_TABLE`/`slurryAvailableSpringLessKgHa`, unmodified — called, never duplicated; reuses `input-gates.ts`'s existing `requireSlurryApplicationMethod` (the same gate `lessMethodCompliance` already used) for method resolution rather than a second, competing branch | `calculateNutrientPlan`'s previous unconditional `slurryAvailableKgHa(rateM3ha, dmPct, pIndex, kIndex)` call is now `resolveAvailableSlurryNutrients({ allocation: slurryAllocation, applicationRateM3ha: rateM3ha, dmPct, pIndex, kIndex })`; `offsetN/P/K` floor to 0 (never a fabricated non-zero credit) whenever the resolver's own status isn't `"OK"` — the plan itself stays actionable (chemical-fertiliser blend still computed from a 0 organic credit), only the organic offset is withheld. No captured method at all reproduces the byte-identical pre-existing spring/splashplate figures (`assumedDefault: true`, disclosed, never silent). 19 new unit tests (resolver-level, brief §13 items 1-6/9) + 7 new `calculateNutrientPlan`-orchestration tests (items 7/8/9/10); full existing 162-test nutrients suite unchanged/green. |
| `domain/types.ts` | Additive extension (`SlurryAllocation.applicationDate`, `NutrientPlan.organicApplication.availableNutrientAssessment`, new) | Everything else, unmodified | `applicationDate?: TrackedValue<string>` lives on `SlurryAllocation` — composition (`SlurryComposition`) describes what's in the tank; this describes how/when THIS allocation's slurry is applied, the narrowest correct home per the brief's own data-model principle. Distinct from `job-actual.ts`'s `SlurrySpreadingActual` (a separate, later-stage, job-session-confirmed retrospective record, not consumed by `calculateNutrientPlan` — deliberately left unintegrated this increment). `organicApplication.availableNutrientAssessment`'s shape structurally mirrors `AvailableSlurryNutrientResult` rather than importing it (avoids a `types.ts` <-> `nutrients.ts` cycle), matching `dmPctEvidence`'s own established precedent one field above. |
| `domain/evidence.ts` | Additive extension (`SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE`, `SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD` reason codes, new) | Everything else, unmodified | |
| `lib/farm-data/slurry.ts`, `app/actions/farm.ts`, `store/farm-store.tsx` | Additive extension (`updateSlurryApplicationDate`/`updateSlurryApplicationDateAction`, new) | Everything else, unmodified | Mirrors `updateSlurryApplicationMethod`'s exact existing pattern (fetch-then-`farmerAdjust`-then-update; mock-mode optimistic local update + `persistRemote`) at every one of its 5 wiring points. |
| `components/farm/FieldDrawer.tsx` | Additive extension | Everything else, unmodified | Slurry application-method selector's label changed from "Slurry application method" to the brief's own suggested copy, "How will this slurry be spread?" (existing `FieldDrawer.test.tsx` selectors updated accordingly, no behaviour change); gained a new "Application date" date input beside it, and one concise "Why does spreading method matter?" sentence (brief §9 — no Learning Centre). |
| `components/farm/OrganicNutrientsCard.tsx` | Additive extension | Everything else, unmodified | New `AvailableNutrientAssessment` block: for a real, evidenced (`"OK"`) result, discloses the application method (including an explicit "Assumed default" pill when `assumedDefault`), application date (when captured) and "Scientific basis: Teagasc-backed available nutrient estimate (<source>)"; for any other status, the brief's own exact copy, "Available nutrient contribution not yet assessed for this application context.", with one line of honest detail — never a fabricated N/P/K figure. Suppressed entirely when no slurry was applied this run (`"NOT_APPLICABLE"`). |

**Migration**: `supabase/migrations/20260919010000_slurry_allocation_application_date.sql`
(forward-only, additive — a single nullable `jsonb` column on the
existing `slurry_allocations` table, same shape as its existing
`application_method` column; no existing row touched).

**Deliberately deferred** (disclosed, not silently dropped): a genuine
Teagasc summer/autumn/winter cattle-slurry availability source, if the
app owner can supply/confirm one — currently a real, disclosed scientific
gap, not something approximated here; unifying `SlurryAllocation`
(forward-looking, consumed by `calculateNutrientPlan`) with
`job-actual.ts`'s `SlurrySpreadingActual` (retrospective, job-session-
confirmed) into one model; wiring the resolver's output through
`recompute.ts`/`getFarmFertiliserDemand`/Decision persistence/GPS
matching/`scientific-evidence-report` (same disclosed, bounded-scope cut
the prior Slurry Evidence & Composition V1 campaign made for
`slurryComposition` — this campaign's `resolveAvailableSlurryNutrients`
is additive at the exact same layer, so those callers keep their
existing, unaffected behaviour); measured-N/P/K conversion (still out of
scope, unchanged from the prior campaign); field prioritisation/
allocation/weather scoring (explicitly out of scope per the campaign
brief).

## Economic Opportunity Engine, Phase 1 — Auditable Domain Foundation (2026-09-20)

A gated build programme, not a `BUILD_PLAN.md` checkpoint. Phase 0 was a
read-only audit of Farm Return's existing scientific/financial/provenance
architecture (no file changed). This phase, Phase 1, adds a **domain-type
foundation only** for a future Economic Opportunity Engine — no market
price, fertiliser cost, slurry value, ROI or opportunity-ranking
calculation ships here. `EconomicOpportunityAssessment` is a domain type
at this stage: not persisted, not ranked, not displayed, not connected to
slurry or Today.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/money.ts` | Phase 1, new; hardened by an independent Codex review the same day (2026-09-20) | `decimal.js` (new direct dependency — no suitable exact-decimal library previously existed in this repo, confirmed by Phase 0's audit and re-verified before adding it) | Canonical serialisable `MoneyAmount { amount: <decimal string>, currency: CurrencyCode }` — never a persisted `Decimal` instance. `CurrencyCode` is currently `"EUR"` only (the one currency the product requires — CLAUDE.md) but is a real, explicit field on every value, never inferred from a name like `priceEur`. `addMoney`/`subtractMoney`/`compareMoney`/`equalsMoney`/`negateMoney` all fail closed (throw) on a currency mismatch — no FX conversion exists or is planned for this phase. No rounding: `addMoney`/`subtractMoney` format their result at the wider of the two operands' own decimal places, which is always lossless for an exact decimal sum/difference. `"-0"` is rejected outright (negative zero has no economic meaning). `moneyFromNumber` rejects a value needing more than 6 decimal places to represent exactly — the shape real floating-point contamination takes (`decimal.js` does **not** fix an already-inexact JS number: `moneyFromNumber(0.1 + 0.2, "EUR")` would otherwise silently produce `"0.30000000000000004"`, not `"0.3"`). **Known, accepted limitation, not fixed**: `MoneyAmount.amount` is not byte-canonical across equal values of different scale — `"0"`, `"0.0"`, and `"0.00"` are all separately valid strings for the same economic zero (this is a side effect of the intentional scale-preservation design in `addMoney`/`subtractMoney`, not an oversight). Use `equalsMoney`/`compareMoney` for economic equality — never raw string or `JSON.stringify` equality. |
| `domain/economic-opportunity.ts` | Phase 1, new; hardened by an independent Codex review the same day (2026-09-20) | `evidence.ts` (`EngineOutcome<T>`, `ok`/`blockedInsufficientEvidence`/etc. — imported, never duplicated), `money.ts` (`MoneyAmount`, `compareMoney`) | `VatTreatment` (`exclusive\|inclusive\|exempt\|unknown`) and `PriceBasis` (`per_kg\|per_tonne\|per_bag\|per_unit\|lump_sum`) — vocabulary/shape only, no calculation, deliberately named to align with the unmerged `managed-quote-pilot` worktree's own schema (Phase 0 found it materially well-designed) **without importing, merging, rebasing or querying that worktree in any way**. `EconomicEffectType` mirrors `evidence.ts`'s own `REASON_CODES`/`isRegisteredReasonCode` open-vocabulary pattern exactly (`ECONOMIC_EFFECT_TYPES` is a starter registry, not a closed enum). `EconomicCreditClaim`/`validateNoDuplicateCreditClaims` is the structural double-counting guard (§3D below) — detects an *exact* duplicate `creditKey` **after trim + case-fold normalisation** (so `"field:F1:N"` and `"FIELD:F1:N"` still collide as the same claim), reporting the original strings involved; partial/overlapping resource claims (different field, different nutrient) remain an explicit known future responsibility, not attempted here. `validateCounterfactualStructure` requires both a `"baseline"` and an `"intervention"` `EconomicScenario`. `validateScenarioReferences` (new) rejects a duplicate `EconomicScenario.id` and any `EconomicEffect.scenarioId` that does not match a declared scenario. `validateEffectSignConsistency` (new) rejects a negative `MoneyAmount` alongside an effect's own `direction` — `direction` (`"benefit"\|"cost"`) is this domain's one sign convention, so `amount` must always be a non-negative magnitude. `validateAssessmentStructure` now runs all four checks together. `createEconomicValueRange(lower, central, upper)` requires all three real values as arguments — nothing is ever defaulted or derived. |
| `domain/evidence.ts` | Additive extension (`ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE`, `ECONOMIC_ASSESSMENT_MISSING_BASELINE_SCENARIO`, `ECONOMIC_ASSESSMENT_MISSING_INTERVENTION_SCENARIO`, `ECONOMIC_DUPLICATE_CREDIT_CLAIM`, `ECONOMIC_ASSESSMENT_DUPLICATE_SCENARIO_ID`, `ECONOMIC_EFFECT_ORPHAN_SCENARIO_REFERENCE`, `ECONOMIC_EFFECT_AMBIGUOUS_SIGNED_AMOUNT` reason codes, new) | Everything else, unmodified | The smallest reason-code vocabulary Phase 1's own structural validators/tests need — no wider economic reason-code taxonomy is added speculatively. |

**No database work**: no migration, no table, no RLS change. A future
"Economic Opportunity Ledger" is out of this phase's scope entirely —
these types are designed to be suitable for future immutable
serialisation (plain JSON-compatible shapes, caller-supplied deterministic
IDs, ISO datetime strings rather than `Date` instances, no functions
embedded in a result), but nothing here is wired to `decisions` or any new
table. `decisions.decided_by` is unchanged (still `'farmer'`-only).

**Existing behaviour unchanged**: `nutrients.ts`, `fertiliser-plan.ts`,
`calculateFarmSlurryNutrientValueEur` (`finance.ts`),
`statutory-manure-value.ts`, `price-resolution.ts`, `market.ts`, Today's
opportunity/priority modules, `BestOpportunitiesCard`, and the unmerged
`managed-quote-pilot` worktree were not read for modification and are not
touched by this phase's diff (`finance.ts`'s slurry counterfactual was
read only as a design precedent for §3A below). `units.ts` is unmodified —
Phase 1 needed no new quantity, since no unit conversion happens in this
phase at all (no price × quantity costing, no €/tonne conversion — both
explicitly deferred). Both new modules are checked by a structural test
asserting they contain no hand-written kg↔tonne conversion (no `"1000"`
token, no `KG_PER_TONNE`/`TONNE_TO_KG` constant) anywhere in their source.

### Invariants

#### 3A. Counterfactual

No economic return exists without an explicit comparison. Every
`EconomicOpportunityAssessment`'s `scenarios` must include at least one
`"baseline"` scenario (what is expected to happen without the evaluated
change) and at least one `"intervention"` scenario (what changes) —
enforced by `validateCounterfactualStructure`. The engine must never
present a gross theoretical asset/input value as an incremental farm
return: "slurry contains €700 of nutrients, therefore spreading it creates
€700 of return" is exactly the fabrication this invariant exists to
prevent. The only question a real assessment may answer is "what economic
outcome changes compared with the baseline plan?" — see Example A/B below.
`calculateFarmSlurryNutrientValueEur` (`finance.ts`) is the one existing
precedent in this codebase that already computes a real with/without
counterfactual; Phase 1's `EconomicScenario`/`validateCounterfactualStructure`
generalise its *shape*, not its code.

#### 3B. Zero vs unknown

`EconomicEffect.amount` is an `EngineOutcome<MoneyAmount>` — reusing the
exact same fail-closed type every scientific calculation in this codebase
already returns, not a parallel status system. A quantified `€0.00` result
is a real `ok(zeroMoney("EUR"), evidenceState)` — a genuine, successful
economic result. Missing evidence, insufficient evidence, an unsupported
calculation, or "not applicable" are each a distinct non-`OK`
`EngineOutcome` status and must never be read or converted as if they were
`€0`. There must never be an economic equivalent of `unknown ?? 0` — the
exact failure class Phase 0's audit found had already caused one real
CRITICAL bug in the scientific layer (`local-buffer-override-gate.ts`,
a missing measured distance defaulting to `0` fabricated a legal-
prohibition claim). See Example C/D below.

#### 3C. Economic effect

Every monetary effect (`EconomicEffect`) has an explicit semantic identity
(`type: EconomicEffectType`, an open, reviewed starter vocabulary — see
the module table above), an explicit `direction` (`"benefit" | "cost"`),
an explicit `EngineOutcome<MoneyAmount>`, evidence/provenance references
(via that `EngineOutcome`'s own `explain`/`evidenceState`), an explicit
baseline/intervention relationship (`scenarioId`), and a resource/credit
identity where appropriate (`creditClaim`). `ECONOMIC_EFFECT_TYPES` is
deliberately small and not exhaustive — the type stays a plain `string`
so a real future effect type can ship before this list is updated
(mirrors `REASON_CODES`/`isRegisteredReasonCode`'s existing, unobjected-to
pattern).

#### 3D. Double counting

Two economic effects must never independently take credit for the same
underlying economic change — e.g. a slurry nutrient value effect and an
avoided-fertiliser-purchase effect must not both monetise the same
displaced nutrient. `EconomicCreditClaim.creditKey` is a deterministic
identity for the underlying resource/economic event an effect claims
credit for; `validateNoDuplicateCreditClaims` fails closed (an explainable
`ECONOMIC_DUPLICATE_CREDIT_CLAIM` reason) when two effects in one
assessment share the same `creditKey` after trim + case-fold
normalisation (a Codex review, 2026-09-20, found the original exact-string
check trivially bypassed by `"field:F1:N"` vs `"FIELD:F1:N"` — the same
real claim written with different casing — and hardened it to close that
specific gap). This remains deliberately narrow beyond that: it does not
attempt to recognise `"F1:N"` and `"field:F1:nitrogen"` as the same claim.
Partial or overlapping resource claims (two claims over the same field
but different nutrient elements, say) are **not** resolved by this
phase — that is an explicit known future responsibility for a real
farm-wide allocator, not guessed at here. See Example B below.

#### 3E. Cash vs economic value

`EconomicImpactKind` (`"CASH" | "ECONOMIC"`) is a real, explicit
classification every `EconomicEffect` carries — distinguishing money
actually received/paid/avoided in the relevant cash period from wider
incremental farm value. Phase 1 represents this distinction at the type
level only; nothing calculates either yet, and no aggregate/rollup field
exists on `EconomicOpportunityAssessment` (summing effects into one
number is a real methodology decision — credit assignment, cash/economic
separation — this phase deliberately does not make).

#### 3F. Uncertainty

No monetary confidence percentage is ever fabricated — `EvidenceState.
GENERIC_FALLBACK` must never be presented as, say, "73% confidence."
`EconomicValueRange { lower, central, upper }` exists for the case where
a real methodology later produces a genuine range, but
`createEconomicValueRange` requires all three `MoneyAmount`s as explicit
arguments (same currency, `lower <= central <= upper`) and throws rather
than defaulting or deriving an absent bound — a range can never be
silently invented from a single point value. Where no real range
methodology exists, an effect's `amount` stays a single `EngineOutcome
<MoneyAmount>` (exact/quantified, or a non-`OK` status) — Phase 1 does
not fabricate a range to look more sophisticated than the underlying
evidence supports.

#### 3G. Methodology limitations

An assessment (`EconomicOpportunityAssessment.limitations`) and an
individual effect (`EconomicEffect.limitations`) can each carry explicit,
plain-language methodology caveats — e.g. "Costs the current Farm Return
fertiliser allocation plan; does not claim global least-cost
optimisation" (relevant because `nutrients.ts`'s product blend allocator
is a deterministic scientific/product plan, not a true least-cost
optimiser — Phase 0's audit finding). Limitations belong in the domain
result itself, not in disconnected UI copy a future screen might omit.

### Worked examples (non-production)

**A. Valid — avoided fertiliser purchase**
Baseline fertiliser cost: €800. Intervention fertiliser cost: €500.
Avoided fertiliser purchase (the delta, not either total): **+€300**.

**B. Invalid — double count**
Slurry nutrient value: +€300, and avoided fertiliser purchase: +€300,
where both refer to the same displaced fertiliser nutrient. Two effects
sharing that one real underlying change must share one `creditKey` —
`validateNoDuplicateCreditClaims` rejects this pair with
`ECONOMIC_DUPLICATE_CREDIT_CLAIM`, not a silently-summed +€600.

**C. Valid zero**
Baseline = €500. Intervention = €500. Incremental value = **€0** — a
real, successful `ok(zeroMoney("EUR"), evidenceState)` result, not the
absence of one.

**D. Unknown**
A required supplier price is unavailable. Incremental value = **NOT
QUANTIFIED** — a `BLOCKED_INSUFFICIENT_EVIDENCE` (or similar non-`OK`)
`EngineOutcome`, reason code `ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE`. Never
`€0`.

## Economic Opportunity Engine, Phase 3 — Auditable Fertiliser Price Resolution V1 (2026-09-20)

Phase 2 (Fertiliser Market Evidence V1) built the immutable, append-only
`market_price_observations` evidence store — real CSO AJM09 rows, when any
exist, but Phase 2's own live Dev round-trip inserted and then deleted its
verification rows, so the table's genuine content is empty at the time
this phase ships (confirmed by the owner's own independent read-only
query before this phase began: `total_rows = 0`). Phase 3 adds the
**selection** layer on top of that evidence — turning a bounded set of
persisted observations into one auditable, fully-provenanced price for
one Farm Return product — and nothing more: no fertiliser cost, no
slurry value, no avoided-purchase cost, no opportunity ranking, no Today
change.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/market-price-resolution.ts` | Phase 3, new | `market-evidence.ts` (`MarketPriceObservation`, `MarketEvidenceMappingKind`), `money.ts` (`MoneyAmount`, read-only — no arithmetic performed), `economic-opportunity.ts` (`PriceBasis`, `VatTreatment`), `evidence.ts` (`EngineOutcome<T>`, `ok`, `blockedInsufficientEvidence`, reusing the existing `ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE` reason code — no new reason code needed), `price-resolution.ts` (`PriceSourceLevel`, type-only, for vocabulary consistency — see "Scope boundary" below) | Pure — no Supabase import, no IO of any kind. `resolveMarketReferencePrice(candidates, mappedProduct, asOfDate, knownAt?)` selects the single best eligible observation deterministically (never a database/array natural-order dependency) and returns `EngineOutcome<AuditableMarketPriceResolution>`. |
| `server/market/cso-fertiliser-repository.ts` | Additive extension (`findObservationsByMappedProduct`, new) | Everything else in this file, unmodified | The one new read query this phase needs: every persisted observation for one Farm Return product (any reference period, any revision) — an unranked, bounded candidate set. `UNSUPPORTED_MAPPING` rows always have `mapped_product = null` (Phase 2's own constructor invariant), so filtering on a real product name already naturally excludes them before the resolver ever sees them. |
| `server/market/market-reference-price-loader.ts` | Phase 3, new | `cso-fertiliser-repository.ts` (read), `market-price-resolution.ts` (pure resolve) | The one seam where IO and methodology meet (brief §4) — `loadMarketReferencePrice(client, params)` does nothing but load candidates and hand them to the pure resolver. No ranking, no decision logic lives here. |

**Eligibility.** `UNSUPPORTED_MAPPING` can never resolve a product-specific
price (redundant, explicit defence-in-depth check here, on top of Phase
2's own constructor invariant that already makes the combination
impossible to construct). `EXACT_PRODUCT_MATCH` resolves as a genuine
product-specific reference (`evidenceState: "MEASURED"`).
`CATEGORY_BENCHMARK` resolves too, but always carries an explicit
`limitations` entry naming the real source label and the real product it
stands in for — e.g. *"Urea (46% N) national benchmark; not an exact
Protected Urea product price."* — and uses `evidenceState: "DERIVED"`,
never `"MEASURED"`. The resolver never promotes a benchmark's
`mappingKind`; it only ever passes through whichever kind the selected
observation actually has.

**Time semantics — the core of this phase.** Two independent, never-conflated
concepts:
- `asOfDate` ("YYYY-MM-DD", required) — the decision date. An observation
  whose `referencePeriod` is a calendar month after `asOfDate`'s own
  month is never selected; among eligible reference periods, the most
  recent one wins. No staleness/freshness policy exists anywhere in this
  phase — old data may be selected if it is the latest eligible evidence,
  and its real `referencePeriod` stays visible in the result, never
  disguised as "current."
- `knownAt` (ISO datetime, optional) — a knowledge-cutoff distinct from
  `asOfDate`. **Defaults to the end of `asOfDate`'s own calendar day
  (`${asOfDate}T23:59:59.999Z`) when omitted — never to "no cutoff at
  all."** (Corrected in the Phase 3 independent review, §2, CRITICAL: the
  original implementation treated an omitted `knownAt` as fully
  unconstrained, so a caller who set only a historical `asOfDate` — the
  natural, easy-to-make mistake — would silently get a resolution
  contaminated by a revision retrieved *after* that date, breaking
  historical reproducibility. Reproduced concretely: `asOfDate:
  "2026-09-30"` with `knownAt` omitted resolved to a 647 revision not
  retrieved until 20 October, before the fix.) An observation retrieved
  after the effective `knownAt` is ineligible. A caller who genuinely
  wants "the best current understanding, applied retroactively to a past
  reference period" remains fully able to ask for that — explicitly, by
  passing today's real timestamp as `knownAt` — it is simply no longer
  the silent default. Worked example (byte-identical to the brief's
  own): July 2026 priced €645, retrieved in September; revised to €647,
  retrieved in October. Resolving as known-on-30-September → €645.
  Resolving as known-on-31-October → €647. Both variants are in
  `market-price-resolution.examples.ts` (Example C).
- Deterministic tie-break: when two eligible revisions of the winning
  reference period share the exact same `retrievedAt`, the lexically
  greater `contentHash` wins. The full `MarketPriceResolutionTrace`
  (selected + every rejected candidate with its own reason) is sorted
  independently of input order too — reordering the candidates passed
  into `resolveMarketReferencePrice` produces a byte-identical result,
  not just the same winner (test-verified: a genuine bug caught during
  this phase's own build, where the *trace's* rejected-candidate order
  depended on input order even though the winning selection did not —
  fixed before this phase's gate run, not left as a known limitation).

**Unavailable, never fabricated.** No eligible observation for the
requested product/`asOfDate`/`knownAt` → `blockedInsufficientEvidence`
with the existing `ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE` reason code —
never `€0`, never an automatic substitution to a different product. This
is the actual, real behaviour `loadMarketReferencePrice` returns today
against the genuinely empty Dev table (Example D).

**Exact money — no arithmetic.** `resolveMarketReferencePrice` never
calls `Number()`/`parseFloat`/`parseInt` on a monetary value and performs
no arithmetic at all — the resolved `MoneyAmount` is always literally the
selected observation's own `price`, unchanged (test-verified: `amount`
is the exact same object reference as the winning observation's `price`
field, not a recomputed copy).

**Provenance is never stripped.** `AuditableMarketPriceResolution` keeps
every field brief §7 requires — source/dataset/series identity, mapping
kind, price basis, VAT treatment (never "cleaned up" out of `"unknown"`),
geography, reference period, retrieval timestamp, `observationIdentity`
(the selected observation's own `contentHash`), and
**`observationDatabaseId`** — the actual `market_price_observations.id`
database row UUID, when the caller's candidate set carried one (added in
the Phase 3 independent review, §4: a content hash is effectively a
unique content identity in practice, since it is computed over the same
fields that would make two genuinely different observations collide
require a SHA-256 collision, but it is not a direct, navigable row
reference — a future Economic Opportunity Ledger should be able to store
a plain foreign key to the exact row consumed, not reconstruct one by
re-deriving a hash query. `null` only for candidates built from plain
fixtures with no backing row, e.g. pure unit-test data — a real
repository-loaded candidate, via `cso-fertiliser-repository.ts`'s
`MarketPriceObservationWithId`, always carries one).

**Evidence state.** Every resolved market-reference price uses
`IRISH_MODEL` — never `MEASURED` or `DERIVED` (corrected in the Phase 3
independent review, §9, MEDIUM: `evidence.ts`'s own authoritative
vocabulary defines `MEASURED` as "Direct farm/lab measurement" and
`DERIVED` as "Calculated deterministically from measured inputs" —
neither describes a raw official CSO national statistic, which Farm
Return neither measures on-farm nor calculates. `IRISH_MODEL`'s own
definition — "Official/current Irish model output such as Met Éireann
SMD" — is the exact fit, uniformly for both `EXACT_PRODUCT_MATCH` and
`CATEGORY_BENCHMARK`: the evidence *source* is equally official in both
cases, so `EvidenceState` does not re-encode the product-mapping-quality
distinction that `mappingKind` and the mandatory `limitations` entry
already carry more precisely).

**Scope boundary — deliberately NOT built this phase.**
`price-resolution.ts`'s existing generic hierarchy
(`farmer_entered > supplier_quote > market_reference > historical_benchmark
> unavailable`, `resolvePrice()`) is **read-only referenced, never
modified**: its `ResolvedPrice.valueEurPerUnit` is a plain JS `number`,
and Phase 3's own boundary forbids any float conversion of a
`MoneyAmount` in this phase. `AuditableMarketPriceResolution.sourceTier`
is typed as the exact `"market_reference"` member of that same
`PriceSourceLevel` union purely for vocabulary consistency, so a later
phase that DOES wire this into `resolvePrice()` — an explicit later
decision, not made here — has a self-identifying tier to map from. The
existing hierarchy precedence (farmer-entered and supplier-quote both
outrank market-reference) is proven unchanged by new pure tests calling
the existing, unmodified `resolvePrice()` with fixtures — not by new
integration between the two resolvers.

**Two coexisting, deliberately unmerged fertiliser price sources — do not
mix them in one economic assessment.** (Phase 3 independent review §11.)
The repository now contains two independent sources of "a fertiliser
price": (1) `market.ts`'s embedded historical CSO snapshot — legacy,
currently feeds real production scientific-recommendation *cost
reporting* only (`nutrients.ts`'s `PRODUCTS.pricePerTonneEur`), and (2)
the audited `market_price_observations` evidence store this and Phase 2
built — new, currently feeds nothing in production. A future economic
calculation must pick exactly one of these per assessment and must never
silently combine a legacy `market.ts` figure with an audited
`resolveMarketReferencePrice` figure as if they were the same evidence
tier — they carry different provenance guarantees (the audited path has
exact-decimal `MoneyAmount`, explicit VAT/price-basis/mapping-quality
metadata, and a reproducible resolution trace; the legacy path has none
of that). This is a documentation boundary, not a code change: no guard
was added, because no live caller currently reads from both sources for
one figure — this note exists so a future integration phase does not
introduce that mistake.

**Science/economics firewall verified.** `nutrients.ts`'s
`PRODUCTS.pricePerTonneEur` (private, not exported) continues reading
`market.ts`'s embedded historical CSO snapshot via `latestPoint()`,
exactly as before Phase 2 or Phase 3 — confirmed by inspection (no new
import of `market-price-resolution.ts`/`cso-fertiliser-repository.ts`
anywhere in `nutrients.ts`, `fertiliser-plan.ts`, or any scientific
calculation module) and by running `nutrients.test.ts`/
`fertiliser-plan.test.ts`/`market.test.ts` unmodified as part of this
phase's own gate. No scientific recommendation output changes because of
Phase 3. `market_price_observations` never determines N/P/K/lime
requirement, legal eligibility, or slurry nutrient availability.

**No database work.** No migration, no schema change — Phase 3 only
reads the table Phase 2 already created.

**Existing behaviour unchanged.** `market.ts`, `nutrients.ts`,
`fertiliser-plan.ts`, `price-resolution.ts`, `supplier_quotes`,
`financial_assumptions`, the Managed Quote worktree, Today's
opportunity/priority modules, and `BestOpportunitiesCard` were not
modified by this phase's diff.

## Economic Opportunity Engine, Phase 4 — Auditable Fertiliser Costing Engine V1 (2026-09-20)

Answers exactly one question: **"what is the indicative cost of THIS
existing Farm Return fertiliser plan, using THIS specific audited price
evidence?"** — not the cheapest programme, not what a farmer would save,
not slurry's value, not which opportunity Today should rank first. **FERTILISER
PLAN COST != ECONOMIC OPPORTUNITY. FERTILISER PLAN COST != LEAST-COST
OPTIMUM.** No counterfactual exists yet (no baseline/intervention
comparison, no `AVOIDED_FERTILISER_PURCHASE` effect, no "savings" wording
anywhere) — Phase 5 will build that comparison on top of this phase's
cost primitive.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/fertiliser-plan-cost.ts` | Phase 4, new; hardened by an independent Codex review the same day (2026-09-20) | `money.ts` (`MoneyAmount`, `multiplyMoney` — new, additive), `units.ts` (`exactKgToTonnes`/`exactQuantityFromRoundedNumber` — new, additive), `market-price-resolution.ts` (`AuditableMarketPriceResolution`, consumed as an already-resolved input — this module never calls the resolver itself), `evidence.ts` (`EngineOutcome<T>`, six new reason codes — two from the initial build, four from the review's fixes below) | Pure — no Supabase import, no IO. `costFertiliserProductLine(input, priceResolution)` costs one canonical quantity occurrence against one already-resolved price; `buildFertiliserPlanCostAssessment(...)` combines already-costed lines into one plan-level result with a single `aggregateOutcome`. |

**Quantity precision boundary — the phase's own gating requirement
(brief §5), mirroring Phase 1's identical rule for money.** The canonical
recommended quantity this module consumes is `FertiliserProduct.totalKg`
(`types.ts`), which `nutrients.ts`'s `productLine` already publishes
pre-rounded to exactly 1 decimal place (`Math.round(totalKg * 10) / 10`,
`nutrients.ts:1537`) — a real, defined, deterministic boundary, not an
arbitrary unrounded floating-point result. `units.ts`'s new
`exactQuantityFromRoundedNumber(value, maxDecimalPlaces, label)` documents
and enforces exactly that boundary: it promotes the already-rounded
number into an exact canonical decimal string and **rejects** anything
needing more than the documented precision to represent exactly — the
shape an unexpected, un-rounded, or floating-point-contaminated value
would take. This module never calls `Number()`/`parseFloat()`/native
`*`/`/` on a monetary or quantity value.

**Price input — Phase 3's resolver only.** `costFertiliserProductLine`
takes an already-resolved `EngineOutcome<AuditableMarketPriceResolution>`
as a parameter; it never reads `market.ts` directly, never reads
`market_price_observations` bypassing `resolveMarketReferencePrice`, and
never invents a second price-selection function. Every provenance field
Phase 3 produces (`observationDatabaseId`, `observationIdentity`,
source/dataset/series identity, `mappingKind`, `referencePeriod`,
`retrievedAt`, price basis, VAT treatment, `limitations`) survives
unstripped into the line's own `calculationTrace`.

**Product/price identity enforced (independent review, CRITICAL).** A
plan line (`input.product`) and its resolved price
(`priceResolution.value.mappedProduct`) are two structurally separate
values with no shared type-level link — nothing originally stopped a
caller from pairing a line for one product with a price resolved for a
different one (e.g. costing a 0-7-30 line against an 18-6-12 price),
which computes a mathematically "correct" multiplication while silently
attributing the wrong product's price. `costFertiliserProductLine` now
checks `resolvedPrice.mappedProduct === input.product` and fails closed
with `ECONOMIC_FERTILISER_COST_PRODUCT_MISMATCH` on any mismatch, before
any arithmetic happens. A resolved price whose own `amount` is negative
(physically nonsensical, and not structurally forbidden anywhere
upstream) is likewise rejected with the new
`ECONOMIC_FERTILISER_COST_NEGATIVE_PRICE`, rather than silently producing
a negative plan cost.

**Resolution-context consistency enforced (independent review, brief
§8).** `buildFertiliserPlanCostAssessment` now verifies every
successfully-priced line's own `priceResolution.value.trace.asOfDate`/
`trace.knownAt` matches the assessment's own declared `asOfDate`/
`knownAt` exactly — an assessment can no longer claim one decision
date/knowledge cutoff while silently embedding a line priced under a
different one. A mismatch fails the aggregate closed with
`ECONOMIC_FERTILISER_PLAN_COST_RESOLUTION_CONTEXT_MISMATCH`, naming the
line and the two conflicting date/cutoff pairs.

**Legacy `market.ts`/`nutrients.ts` cost is never read.** The new
auditable answer costs the canonical recommended PRODUCT + QUANTITY only
(`FertiliserProduct.name`/`totalKg`), against Phase 3's independently
audited price evidence — `PRODUCTS.costEur`/`pricePerTonneEur` (the
legacy embedded-CSO-snapshot figure) is not imported anywhere in this
module and keeps working exactly as before for its existing production
consumers (Purchased Fertiliser, Dashboard, Finance, Input Planner).

**Exact vs. benchmark preserved, never promoted.** `EXACT_PRODUCT_MATCH`
(0-7-30, 18-6-12) costs as a genuine product-specific indicative national
benchmark. `CATEGORY_BENCHMARK` (Protected Urea, costed via generic Urea
46% N evidence) costs too — Phase 3 already made that evidence eligible —
but the line **and** the assessment both inherit the mandatory proxy
limitation (*"Urea (46% N) national benchmark; not an exact Protected
Urea product price."*), unchanged from Phase 3, never silently upgraded.

**Missing/unsupported price — never €0, never a silent legacy fallback,
never a partial total presented as complete.** A blocked
`priceResolution` produces an identically-blocked `lineCost` (the same
`reasonCode`/detail propagated through `propagateNonOk`, never a second,
invented reason — the true cause is the price gap). A resolved price
whose `priceBasis` is not `"per_tonne"` (the only basis V1 costing
reconciles against a kg quantity) fails closed with the new
`ECONOMIC_FERTILISER_COST_UNSUPPORTED_PRICE_BASIS` reason code, rather
than guessing a bag weight or unit count. At the assessment level, **one
blocked required line makes the whole `aggregateOutcome` fail closed**
with the new `ECONOMIC_FERTILISER_PLAN_COST_INCOMPLETE` reason code,
naming exactly which product(s)/field(s) are missing in `missingInputs` —
never a numeric partial sum silently presented as the complete plan cost
(no `quantifiedSubtotal` field exists at all — the brief explicitly
permits skipping it "if a partial subtotal adds unnecessary complexity",
and a clear BLOCKED status with named causes was judged simpler and more
honest than a second, easily-misread partial number).

**Plan-line completeness/uniqueness enforced (independent review,
CRITICAL).** Originally, `buildFertiliserPlanCostAssessment` aggregated
whatever `lines` array a caller supplied with no anchor to the real
canonical plan being costed — a caller who omitted a required product
(both remaining lines pricing successfully) got back a "complete" `OK`
aggregate silently understating the real plan cost, and a caller who
accidentally supplied the same `(product, fieldId)` line twice got a
silently doubled total. `BuildFertiliserPlanCostAssessmentInput` now
requires an explicit `expectedLineKeys: readonly {product, fieldId?}[]`
— the canonical plan's own complete line-identity set — and
`buildFertiliserPlanCostAssessment` fails the aggregate closed with the
new `ECONOMIC_FERTILISER_PLAN_COST_LINE_INTEGRITY_VIOLATION` reason code
(naming every missing/duplicate/unexpected identity) unless the supplied
`lines` match that set exactly, no more, no fewer, no duplicates.

**VAT/delivery basis pass through unchanged.** AJM09's `vatTreatment` is
`"unknown"` and stays `"unknown"` all the way through a line's own
`calculationTrace` — this module never adds, removes, or assumes VAT or a
delivery basis. A computed plan cost is an indicative benchmark figure
with an undetermined VAT/delivery basis, not yet actual farmer cash
expenditure.

**Units — exact-decimal kg↔tonne, never a hand-written conversion.**
`units.ts` gained `exactKgToTonnes`/`exactTonnesToKg` (decimal.js-based,
additive — `FEED_DRY_MATTER`/`FRESH_FORAGE_MASS`'s existing plain-`number`
`* 1000`/`/ 1000` conversions were unsuitable here, since Phase 1's exact
decimal-string arithmetic must hold all the way to the final money
multiplication). **Deliberately distinct from `fertiliser-plan.ts`'s own
`roundKgToTonnes`/`KG_PER_TONNE`** (Checkpoint 3) — that is a real,
different, intentionally-lossy DISPLAY conversion (rounds to the nearest
0.01 t for farm-purchasing UI) and is never reused here, since rounding
before an exact monetary multiplication would silently discard precision
the multiplication itself must preserve. A shared structural test
(`economic-opportunity.test.ts`'s "unit-safety structural check", now
covering `fertiliser-plan-cost.ts` too) asserts no `"1000"` literal or
`KG_PER_TONNE`/`TONNE_TO_KG` token exists in this module's own source.

**Exact money — `multiplyMoney`, new.** `money.ts` gained
`multiplyMoney(price, quantity)` (additive) — multiplying two finite
exact decimals is always itself an exact finite decimal (unlike
division), so this never rounds: `500 kg (0.5 t) × €645/t` resolves to
exactly `€322.5`, not a display-rounded value stored as the domain
result (golden case B, test-verified, and the historical
unit-mismatch failure class — `1,000 kg × €900/tonne` — is explicitly
regression-tested to resolve to exactly `€900`, golden case A).

**Aggregation is exact and deterministic.** `buildFertiliserPlanCostAssessment`
sums only fully-quantified lines via `addMoney` (never
`Array.reduce`-with-JS-numbers), sorts lines deterministically by
`(product, fieldId)` before computing anything (never database or
caller input-array order — test-verified: reordering input lines produces
a byte-identical `aggregateOutcome` and line ordering), and always
includes the mandatory methodology limitation verbatim: *"This is the
cost of Farm Return's current deterministic fertiliser plan. It does not
claim to be the globally least-cost fertiliser programme."*

**Farm-level exact sum, never `fertiliser-plan.ts`'s own float-summed
total.** `sumExactFertiliserQuantitiesKg(product, totalKgByField)` exists
because `aggregateFarmFertiliserRecommendation`'s existing
`recommendedTotalKg` is a plain JS `+=` sum of already-rounded per-field
numbers — safe for its own existing display purpose, but not the
exact-decimal discipline this module requires (brief §20: "any farm total
must be the exact sum of the canonical plan quantities being assessed").
Returns a decimal **string**, never coerced back to `number` (a
multi-field exact sum can legitimately need more precision than any
single field's own 1-decimal-place rounding boundary) — feeds into
`FertiliserPlanCostLineInput`'s `exactTotalKg` variant, a discriminated
alternative to the normal per-field `totalKg: number` input.

**Science/economics firewall verified.** This module imports nothing from
`nutrients.ts`/`fertiliser-plan.ts` (test-enforced: source-text check for
`allocatePurchasedProducts`/`calculateNutrientPlan`/a `./nutrients`
import) — it only ever costs a `totalKg` figure it is handed, never
recomputes or influences one. Changing only the price evidence passed to
`costFertiliserProductLine` leaves the line's own `quantity`/
`convertedQuantityTonnes` byte-identical (test-verified) — price can
never feed back into the scientific plan. `nutrients.test.ts`/
`fertiliser-plan.test.ts` run unmodified as part of this phase's own
gate; no scientific recommendation output changes because of Phase 4.

**No database work.** No migration, no new table — this phase's output
is a reproducible domain assessment, not a persisted one.

**Worked example (non-production).**

```
Farm Return plan:      500 kg 18-6-12
Audited market evidence: €645/t (AJM09 012, EXACT_PRODUCT_MATCH,
                          reference period 2026-07)

Calculation:  500 kg = 0.5 t
              0.5 × €645 = €322.5

Result:  Indicative plan cost = €322.5
Not:     "farmer saves €322.5"
```

**Existing behaviour unchanged.** `market.ts`, `nutrients.ts`,
`fertiliser-plan.ts`, `price-resolution.ts`, `market-price-resolution.ts`,
`supplier_quotes`, `financial_assumptions`, the Managed Quote worktree,
Today's opportunity/priority modules, and `BestOpportunitiesCard` were
not modified by this phase's diff.

## Economic Opportunity Engine, Phase 5 — Slurry Direct Economic Assessment V1 (2026-09-21)

Answers exactly one question: **"for this one explicit, already-scientific
slurry application action, what is the direct fertiliser-plan cost
difference between the canonical Farm Return plan WITHOUT it (baseline)
and WITH it (intervention), using consistent audited price evidence?"**
Not which field should get slurry, not the whole-farm value of the
tank/shed, not grass/feed/livestock value, not confirmed cash saving. The
chain: **explicit slurry action → supported nutrient contribution →
baseline canonical fertiliser plan → intervention canonical fertiliser
plan → audited plan costs (Phase 4, both) → direct cost difference.**

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/slurry-direct-economic-assessment.ts` | Phase 5, new | `nutrients.ts`'s `calculateNutrientPlan` (called TWICE by the CALLER, never by this module), `fertiliser-plan-cost.ts` (`buildFertiliserPlanCostAssessment`/`costFertiliserProductLine`, unmodified), `market-price-resolution.ts` (`AuditableMarketPriceResolution`, consumed as an already-resolved input set — this module never calls the resolver itself), `economic-opportunity.ts` (`EconomicScenario`/`EconomicEffect`, one new registered effect type), `money.ts` (`subtractMoney`/`addMoney`/`compareMoney`/`zeroMoney`/`isZeroMoney`) | Pure — no Supabase import, no IO, no re-derivation of N/P/K requirement or available-slurry-nutrient tables. `buildSlurryDirectEconomicAssessment(input)` takes two already-computed `NutrientPlan`s and one already-resolved price set; produces one deterministic assessment. |

**The critical gate (brief §5) — confirmed real, preserved, not
invented.** `calculateNutrientPlan` floors an unsupported/blocked/
ambiguous slurry-nutrient-resolution to a zero *arithmetic* offset
internally (`nutrients.ts:1911-1914` — its own doc comment: *"Never a
fabricated non-zero credit... floors to the same safe 'no organic
contribution counted' state"*), but it ALSO exposes the real,
unstripped `EngineOutcome` this floor was built from, as
`NutrientPlan.organicApplication.availableNutrientAssessment`
(`types.ts:651`), plus a convenience `requirementProvisional.isProvisional`
flag documented as `true` exactly when that floor was silently applied
(`types.ts:679-691`). This module reads
`interventionPlan.organicApplication.availableNutrientAssessment.status`
BEFORE treating the two plans' costs as economically comparable — only a
genuine `"OK"` intervention science result may proceed to a direct cost
comparison. Anything else (unsupported method, unsupported timing,
ambiguous captured method, no slurry applied at all —
`NOT_APPLICABLE`) fails the whole assessment closed with
`ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE`, never silently
comparing a baseline plan against an intervention plan whose "with
slurry" arithmetic was actually identical to "without slurry." This was
NOT a STOP condition — the existing architecture already exposes exactly
the signal needed; the gate simply had to be built to read it.

**Counterfactual invariance validated structurally, not assumed.**
`baselinePlan.requirement` (the gross, pre-slurry-offset N/P/K
requirement — a pure function of soil/livestock/silage/field inputs,
wholly unrelated to slurry) must exactly equal
`interventionPlan.requirement`. Any difference means some input besides
the evaluated slurry action changed between the two calculation runs
(wrong soil evidence, wrong field, wrong livestock snapshot, ...), and
the assessment fails closed with
`ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION` — this check
is computed purely from the two plan OUTPUTS, so it works without this
module ever seeing the raw scientific inputs that produced them.

**Reuses the canonical science engine twice — never re-derives it.** The
CALLER runs the real `calculateNutrientPlan` once with the evaluated
`SlurryAllocation` absent (baseline) and once with it present
(intervention); this module only ever consumes the two resulting
`NutrientPlan` objects. No N/P/K formula, no available-slurry-nutrient
table, no product allocator exists inside this module — `nutrients.test.ts`
runs unmodified as part of this phase's own gate.

**Price evidence held constant across both scenarios — Phase 4's own
guard, reused, not re-implemented.** A caller resolves ONE price per
product (the union of products either plan requires) under one shared
`asOfDate`/`knownAt`, and this module passes that identical resolved set
into BOTH the baseline and intervention `buildFertiliserPlanCostAssessment`
calls with the identical `asOfDate`/`knownAt`. Phase 4's own
`findResolutionContextViolations` check (unmodified) therefore already
enforces "held constant" for free — this module never resolves baseline
today and intervention tomorrow, and never re-implements that check
itself.

**Only Phase 4 multiplies quantity by price.** Both plans are costed
exclusively through `buildFertiliserPlanCostAssessment`/
`costFertiliserProductLine` — this module performs no `quantity × price`
arithmetic of its own anywhere. Phase 4 already owns product-price
identity, plan-line completeness/duplicate-protection, exact kg→tonne
conversion, exact money multiplication, and price-resolution-context
consistency; Phase 5 inherits all of it by construction rather than
re-checking any of it.

**Direct cost difference — exact, never forced positive.**
`directCostDifference: EngineOutcome<MoneyAmount>` is `OK` only when the
science gate passed, the counterfactual invariance check passed, AND
both plan costs are themselves fully quantified
(`aggregateOutcome.status === "OK"` on both). The magnitude is always a
non-negative `MoneyAmount` (`subtractMoney` of whichever cost is larger);
sign lives entirely in `directCostDifferenceDirection`
(`"benefit"|"cost"|"zero"`), mirroring `EconomicEffect.direction`'s own
non-negative-amount convention (`validateEffectSignConsistency`, Phase
1) rather than introducing a second, competing sign representation. A
real intervention-costs-more result is a valid, reportable `"cost"`
outcome, never silently clamped to zero or hidden.

**Effect semantics — one honest type, never overstated.** The single
effect this module produces uses the NEW registered effect type
`AVOIDED_FERTILISER_PLAN_COST` (`economic-opportunity.ts`, additive to
`ECONOMIC_EFFECT_TYPES`) rather than `AVOIDED_FERTILISER_PURCHASE` — the
evidence is a baseline-vs-intervention INDICATIVE plan-cost comparison,
never proof a farmer actually purchased, or will purchase, less
fertiliser; using the stronger existing type would overstate what the
evidence proves. An intervention-costs-more result instead produces an
`ADDITIONAL_INPUT_COST` effect with `direction: "cost"` — never a
negative `AVOIDED_FERTILISER_PLAN_COST` amount. Every effect is
classified `impactKind: "ECONOMIC"`, never `"CASH"`, without separate
purchase-avoidance evidence — Phase 4's price is an indicative national
benchmark, not proof of an actual avoidable cash payment
(`SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION`, present on every quantified
effect verbatim: *"This is an indicative fertiliser-plan cost
difference, not confirmed cash saving. Existing fertiliser stock,
committed purchases and actual supplier pricing are not yet incorporated
into this assessment."*).

**Exactly one deterministic credit claim — Phase 1's guard exercised for
real, for the first time.** `creditClaim.creditKey` is built
deterministically from `evaluatedActionId` (a stable identity — e.g. the
real database row id of the `SlurryAllocation` being assessed, supplied
by the caller, since the pure `SlurryAllocation` domain type
deliberately carries no id of its own — `types.ts`'s established
"stay free of a database dependency" convention) plus `fieldId`. Never
two independent effects (a "slurry value" and a separately-labelled
"avoided cost") monetise the same physical change — there is exactly one
effect, one credit key, per evaluated action. Test-verified against
Phase 1's real `validateNoDuplicateCreditClaims`: a single real effect
always passes; two different evaluated actions produce distinguishable
keys; re-running the SAME evaluated action id twice correctly collides
(proving the guard is real, not merely "distinct by construction" of
this module's own code).

**Realisation cost — a real tri-state, never a numeric default.**
`RealisationCostInput = {status:"quantified", amount} | {status:"known_zero"} | {status:"unknown"}`.
Net return (`netEconomicResult`) is `OK` only when `directCostDifference`
is itself `OK` AND realisation cost is `"quantified"` or `"known_zero"`
— an `"unknown"` realisation cost always yields
`ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNKNOWN_REALISATION_COST`
(`BLOCKED_INSUFFICIENT_EVIDENCE`), never silently equal to the gross
direct benefit. A known incremental cost exceeding the gross benefit
produces a correctly-signed net **cost** (`direction: "cost"`, a
non-negative magnitude), never a negative "benefit."

**Finite-resource limitation — always present.** Every V1 assessment
(supported or not) carries `SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION`
verbatim: *"This assessment measures the direct fertiliser-plan cost
difference for this evaluated slurry application. It does not yet
account for the opportunity cost of allocating finite slurry away from
alternative eligible fields."* Farm-wide allocation across competing
fields is explicitly Phase 6's responsibility, not attempted here.

**No new slurry science, no grass/feed/livestock value, no statutory-value
reuse.** This module adds no new availability factor, timing rule, or
DM interpolation — an unsupported real-world context (e.g. a real
September/late-summer application with no evidenced table) correctly
returns `NOT_QUANTIFIED` via the science gate above, never an invented
rule. `statutory-manure-value.ts` (a different evidence class, for
compliance, not market value) is not read anywhere in this module.

**No farm-wide optimisation, no persistence.** This module assesses
exactly one caller-supplied evaluated action — it never loops over
fields, never chooses an allocation, never builds a ranking. No new
database table or migration — Phase 7 owns the immutable Economic
Opportunity Ledger; this phase's output remains a reproducible domain
assessment.

**Worked example (non-production).**

```
Field: 10 ha, P Index 2, K Index 2, real stocking rate from real herd.
Evaluated action: 200 m³ cattle slurry, spring, splashplate — a real
                   scientifically-supported context
                   (SLURRY_TABLE_9_8, spring, splashplate).

Baseline plan (no evaluated action):   real chemical fertiliser blend,
                                        real Phase 4 cost.
Intervention plan (with evaluated
  action):                             real, genuinely different chemical
                                        fertiliser blend (slurry N/P/K
                                        offsets purchased requirement),
                                        real Phase 4 cost.

Direct cost difference: baseline cost − intervention cost (exact Money
                         subtraction, only when both are fully quantified).

Result:  Indicative direct fertiliser-plan cost benefit = <real €, from
         the actual engine output for this fixture>
Not:     "the slurry contains €X of value" (brief §1's own prohibited
         example — this module never multiplies kg N/P/K by a €/kg
         nutrient price; the only monetary figure anywhere is the real
         Phase 4 plan-cost difference).
```

**Existing behaviour unchanged.** `nutrients.ts`, `fertiliser-plan.ts`,
`fertiliser-plan-cost.ts`, `market-price-resolution.ts`,
`statutory-manure-value.ts`, `price-resolution.ts`, `supplier_quotes`,
`financial_assumptions`, the Managed Quote worktree, Today's
opportunity/priority modules, and `BestOpportunitiesCard` were not
modified by this phase's diff. `ECONOMIC_EFFECT_TYPES` gained one new
registered value (`AVOIDED_FERTILISER_PLAN_COST`) — additive, no
existing value changed or removed.

## Economic Opportunity Engine, Phase 6 — Finite-Resource Whole-Farm Slurry Allocation V1 (2026-09-21)

Phase 5 answers "what is the audited economic effect of ONE defined
slurry action on ONE field?". Phase 6 answers "given a finite volume of
slurry available on the farm, which of several CANDIDATE actions should
be selected to maximise total scientifically-supported audited economic
return, without allocating more slurry than actually exists?" — a
resource-allocation problem over ALREADY-COMPUTED Phase 5 results, never
a new economic calculation.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/slurry-whole-farm-allocation.ts` | Phase 6, new | `slurry-direct-economic-assessment.ts` (`SlurryDirectEconomicAssessment`, consumed as an already-computed input per candidate — this module never calls `buildSlurryDirectEconomicAssessment` itself), `economic-opportunity.ts` (`validateNoDuplicateCreditClaims`, unmodified), `money.ts` (`addMoney`/`subtractMoney`/`compareMoney`/`negateMoney`/`zeroMoney`/`isZeroMoney`), `units.ts` (`exactQuantityFromRoundedNumber`) | Pure selection/optimisation arithmetic only — no scientific calculation, no fertiliser costing, no price resolution anywhere in this module. |

### Core architectural rule

Phase 6 must **consume** Phase 5 assessments, never recreate any part of
the chain Phase 5 already owns (slurry nutrient science, fertiliser
requirements, product allocation, fertiliser costing, price resolution,
economic benefit calculation). A caller runs
`buildSlurryDirectEconomicAssessment` once per candidate action exactly
as Phase 5's own module describes, then hands the finished
`SlurryDirectEconomicAssessment` objects in here. This module decides
**which** valid candidates are selected; Phase 5 remains authoritative
for **what each one is worth**.

### STOP-condition review — all six resolved, none triggered

**STOP A (additive economics invalid) — resolved by design, not
avoided.** Two allocations on the SAME field can genuinely interact
(discrete fertiliser-plan/product-mix non-linearity — "€300 + €250 might
only be €400 together"), and Phase 5 has no multi-action joint
counterfactual to value that combination correctly. Two allocations on
DIFFERENT fields cannot interact economically — each field's
`NutrientPlan`/`FertiliserPlanCostAssessment` is a self-contained
calculation with no shared discrete resource across fields other than
the finite slurry pool itself (which IS this module's own volume
constraint). This module therefore enforces **at most one selected
candidate per field** within a single result — provably safe under the
current architecture, so no multi-action counterfactual needed
inventing. The real consequence (this module cannot yet jointly value
two genuinely-separate, non-overlapping applications on the same field,
e.g. a spring application plus a later top-up) is disclosed as an
explicit output limitation
(`SLURRY_WHOLE_FARM_ALLOCATION_SAME_FIELD_LIMITATION`), never silently
dropped.

**STOP B (no trustworthy finite-availability representation) — not
triggered.** `AvailableSlurryVolumeInput` requires the caller to state
explicitly whether available volume is known or unknown; `"unknown"`
blocks the whole result (`ECONOMIC_SLURRY_ALLOCATION_UNKNOWN_AVAILABLE_VOLUME`)
rather than defaulting to zero or unlimited.

**STOP C (identity cannot prevent double-use) — not triggered.**
`evaluatedActionId` reuses Phase 5's own stable identity (the real
`SlurryAllocation` database row id). A candidate set containing a
duplicate `evaluatedActionId` is rejected outright as a structural
input-integrity failure
(`ECONOMIC_SLURRY_ALLOCATION_DUPLICATE_CANDIDATE_IDENTITY`) — silently
deduplicating would require guessing which duplicate was intended. The
one-candidate-per-field rule plus the real Phase 1
`validateNoDuplicateCreditClaims` (run over every SELECTED effect, not
merely trusted from the field-exclusivity design) give defence in
depth.

**STOP D (Phase 5 API insufficient) — not triggered.** Every candidate's
economic value is read directly off its own already-built
`SlurryDirectEconomicAssessment.netEconomicResult`/`.directCostDifference`
— never estimated, interpolated, or recomputed.

**STOP E (quantity arithmetic unsafe) — resolved by reuse, not
avoided.** `SlurryAllocation.volumeM3` carries no existing documented
rounding boundary (unlike `nutrients.ts`'s `totalKg`, which Phase 4
could cite a specific `Math.round(x*10)/10` boundary for). Rather than
treating this as unsafe, this module reuses `units.ts`'s
`exactQuantityFromRoundedNumber` — the same tool Phase 4 used for
`totalKg` — with its own newly-documented Phase 6 policy boundary
(`SLURRY_VOLUME_MAX_DECIMAL_PLACES = 2`). A volume needing more
precision than that to represent exactly is rejected as an invalid
candidate, never silently truncated.

**STOP F (currency aggregation unsafe) — not triggered.**
`CurrencyCode` is currently `"EUR"` only, and `addMoney`/`subtractMoney`
already throw on a real mismatch (Phase 1's own guard, reused). This
module wraps its own total-folding in a try/catch specifically to
convert that throw into a blocked `EngineOutcome`
(`ECONOMIC_SLURRY_ALLOCATION_CURRENCY_MISMATCH`) rather than an
uncaught exception — no FX conversion invented.

### Non-linearity, never interpolated

`200 m³ → €321 benefit` does NOT imply `100 m³ → €160.50` — fertiliser
products are discrete, product combinations can change step-wise, and
oversupply/limiting-nutrient effects are non-linear. Every candidate
quantity Phase 6 considers has its OWN real, independently-computed
Phase 5 assessment; this module never scales or interpolates between
two known values.

### Resource conservation — structurally enforced

`Σ selected volume ≤ available volume`, computed and compared in exact
decimal (`decimal.js`, via `exactQuantityFromRoundedNumber`), never
binary floating point. A candidate with negative or non-finite volume,
or one needing more precision than the documented policy boundary,
is excluded as invalid input rather than silently accepted or
truncated.

### Optimisation — exact, never greedy, with a documented scale boundary

Exact recursive enumeration over per-field "choice groups" (each
group's options: select none, or exactly one of its comparable
candidates), comparing every FEASIBLE complete assignment by total
audited net economic value. This is exact by construction — proven
against the brief's own greedy-failure counterexample (available=10;
A=6 units/€90; B=5 units/€80; C=5 units/€80 — a greedy highest-single-
value approach picks A alone (€90); the true optimum is B+C together
(€160); this module's test suite asserts the correct B+C result, not
A). Complexity is `O(∏ᵢ(optionsInGroupᵢ + 1))` — exponential in the
number of distinct fields with a candidate, appropriate for the
small/medium pilot scale this phase targets. `MAX_ENUMERATED_COMBINATIONS`
(2,000,000) bounds this explicitly; exceeding it produces a clearly-
labelled blocked result
(`ECONOMIC_SLURRY_ALLOCATION_EXACT_OPTIMISATION_INFEASIBLE_AT_SCALE`)
rather than silently hanging or swapping in an approximate algorithm —
a genuine DP/ILP formulation is the documented future scaling path, not
attempted in V1.

### Deterministic tie-breaking

Where two feasible solutions have exactly equal total value: (1) fewer
selected actions wins (this alone implements the brief's own stated
rule that a genuine zero-value candidate must never be preferred over
selecting nothing, since both are worth exactly zero); (2) lower total
volume used; (3) lexicographically-smallest sorted selected
`evaluatedActionId`s. Never input array order, insertion order, random
IDs, or current time — test-verified via repeated reordering/shuffling
of the same candidate set.

### Blocked candidates — never €0, always excluded with a reason

A candidate whose Phase 5 `netEconomicResult` is anything other than a
genuine `"OK"` is excluded from comparison entirely
(`{kind: "not_economically_comparable", phase5Status, reasonCode,
missingInputs}`) — never converted to €0, a low score, or a fallback
estimate. A comparable-but-not-chosen candidate gets its own distinct
reason (`{kind: "not_selected_by_optimiser"}`), so a reviewer can
distinguish "science/price blocked this" from "this was simply
outperformed."

### Totals and limitations

`totalGrossEconomicEffect`/`totalNetEconomicResult` are safely additive
because every selected candidate is independent (at most one per
field — STOP A) and Phase 5's own contract guarantees net-OK implies
gross-OK. Every distinct limitation carried by a selected candidate's
own assessment is forwarded unchanged (cash/stock, proxy/
CATEGORY_BENCHMARK, unknown VAT, not-least-cost, ...) EXCEPT
`SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION` specifically,
which this module deliberately replaces with its own, narrower,
still-accurate `SLURRY_WHOLE_FARM_ALLOCATION_SCOPE_LIMITATION` — the
Phase 5 text says the opportunity cost of allocating slurry elsewhere is
"not yet accounted for," which becomes misleading once forwarded
unchanged inside a result that IS resolving exactly that trade-off
across the candidates it was given (Phase 6's real residual limitation
is narrower: only the SUPPLIED candidates are considered — a real
eligible field with no supplied candidate is not).

### No farm-wide optimisation beyond candidate selection, no persistence

This module never proposes a candidate action itself (it selects only
among what the caller supplies), never touches Today, never ranks
across economic domains (grass/feed/livestock remain out of scope), and
creates no new database table or migration — Phase 7 owns the immutable
Economic Opportunity Ledger.

### Existing behaviour unchanged

`slurry-direct-economic-assessment.ts`, `fertiliser-plan-cost.ts`,
`market-price-resolution.ts`, `economic-opportunity.ts`'s existing
exports, Today's opportunity/priority modules, and
`BestOpportunitiesCard` were not modified by this phase's diff (one new
export set added to `slurry-whole-farm-allocation.ts` only).

## Economic Opportunity Engine, Phase 7 — Audited Opportunity Record / Decision Ledger V1 (2026-09-21)

A **recording, evidence and state-transition layer, not another economic
engine**. Answers "what exactly was calculated, from which evidence, for
which action/resource/field, at what point in time, under which
assumptions and limitations — and can a later layer consume this result
without reinterpreting, recomputing or weakening its provenance?" Never
adds money, recomputes a total, re-runs any scientific/pricing/costing
calculation, or recalculates a Phase 5/6 output — every economic fact in
a record is either the authoritative Phase 5/6 result object itself
(deep-cloned) or a value read directly off it.

| Module | Ships with | Wraps (unmodified) | Notes |
|---|---|---|---|
| `domain/audited-opportunity-record.ts` | Phase 7, new | `slurry-direct-economic-assessment.ts` (`SlurryDirectEconomicAssessment`, embedded as an already-computed input, never recomputed), `slurry-whole-farm-allocation.ts` (`SlurryWholeFarmAllocationResult`, same), `evidence.ts` (`EngineOutcome<T>`, `ok`/`blockedInsufficientEvidence`) | Pure domain types/factories — no Supabase import, no migration, no API route, no sync. Persistence is explicitly a later phase's responsibility (STOP G, below). |

### STOP-condition review — all seven resolved, none triggered

**STOP A (authoritative output lacks required provenance) — not
triggered.** Phase 5's `SlurryDirectEconomicAssessment` already exposes
`evaluatedActionId`/`fieldId`/`evaluatedActionVolumeM3` (the exact fields
Phase 6's own adversarial review found a binding gap around and closed)
and Phase 6's `SlurryWholeFarmAllocationResult` already exposes
`selected[].evaluatedActionId`/`.fieldId`/`.assessment` — everything this
phase needs already exists. Taken further than "checked":
`createAuditedActionOpportunityRecord`'s only economically-meaningful
parameter is the real assessment object itself — there is no separate
`evaluatedActionId`/`fieldId`/`volumeM3`/`amount` parameter a caller
could supply and mismatch against it. The volume/field/action-binding
attack class (the exact defect Phase 6's own review found and fixed) is
not merely checked here; it is structurally impossible by API design.

**STOP B (immutable snapshot impossible) — not triggered.** Both source
result shapes are entirely plain, JSON-safe values (decimal *strings* via
`MoneyAmount`, ISO date strings, nested plain objects/arrays, string-
literal discriminated unions) — no `Decimal` instances, `Date` objects,
functions, or class instances anywhere. `structuredClone` (the exact
mechanism `evidence.ts`'s own `ok()` already uses to solve the identical
"caller could mutate this after the fact" problem) gives a real,
disconnected copy — no earlier contract needed to change.

**STOP C (duplicate identity ambiguous) — resolved by design, not
avoided.** `assessment.id` (the calculation's own identity) and
`assessment.evaluatedActionId` (the real-world action's identity) are
already two different fields on the authoritative source object.
Recording the same `assessment.id` twice is "the same calculation
recorded twice" (a future persistence layer's job to reject via a real
uniqueness constraint on `assessmentId`, which this phase's read-model
exposes for exactly that purpose); a genuinely new `assessment.id`
sharing the same `evaluatedActionId` is "the same real action
legitimately reassessed" — representable via `supersedesRecordId`, with
`validateSupersession` anchoring the relationship to matching
`evaluatedActionId`, never merely a shared field.

**STOP D (blocked-vs-zero incompatible with serialisation) — not
triggered.** `EngineOutcome<T>`'s discriminated union is itself built
from plain string/object values, so it survives a `JSON.stringify`/
`JSON.parse` round trip exactly — proven directly by this module's own
tests using a real quantified-zero case and a real blocked case.

**STOP E (exact money/quantity serialisation unsafe) — not triggered.**
`MoneyAmount`/`evaluatedActionVolumeM3`/`volumeM3` are already decimal
*strings*, never `Decimal` instances or `number`s — a JSON round trip of
a string is lossless by construction, proven with a real multi-decimal-
place amount.

**STOP F (Phase 6 lineage insufficient) — resolved by design, not
avoided.** `buildAuditedWholeFarmDecisionRecord` does not duplicate each
selected candidate's full Phase 5 detail into the Phase 6 record — the
caller must have already built each selected candidate's own
`AuditedActionOpportunityRecord`, and this function verifies every one is
correctly bound (matching `evaluatedActionId`, matching `assessmentId`,
matching `fieldId`) to the exact assessment Phase 6 actually selected,
then references them by id (`constituentActionRecordIds`, deterministically
ordered). One canonical source of truth per fact: the Phase 5 record owns
the full audit trail for "why this number"; the Phase 6 record owns "what
was selected and its own net/gross contribution" (data Phase 6 itself
already computed).

**STOP G (persistence dependency) — not triggered.** Every type/function
here is a pure domain value/function. The domain contract is fully
provable — and is proven, by this module's own 30 tests — without any
persistence architecture; `assessmentId` uniqueness and
`supersedesRecordId` chains are deliberately shaped so a *future*
persistence layer can enforce real constraints on top of this contract,
not so this phase has to simulate a database in memory.

### Immutable evidence vs. mutable decision state — structurally separate types

`AuditedActionOpportunityRecord`/`AuditedWholeFarmDecisionRecord` carry no
lifecycle/decision field at all. `OpportunityDecisionState` carries only
`{ opportunityRecordId, status: "active"|"accepted"|"rejected"|"completed",
updatedAt }` — no monetary field of any kind, and it references a record
only by its `id`, never by embedding it. `updateOpportunityDecisionState`
returns a brand-new state object, never mutates its input or touches a
record. Changing decision state therefore cannot mutate an economic
snapshot not because of a runtime check, but because there is no field
through which it could — test-verified by running a record through a full
`active → accepted → completed` lifecycle and asserting the record's own
JSON snapshot is byte-identical throughout. "Completed" is never read as
"cash was actually realised" for the identical reason: with no monetary
field on decision state, there is nothing for `"completed"` to
reinterpret — that reconciliation stays explicitly out of Phase 7's scope.

### Blocked assessments produce real audit records, never fabricated opportunities

`createAuditedActionOpportunityRecord` always succeeds structurally
(mirroring `buildSlurryDirectEconomicAssessment`'s own "always returns a
complete object" pattern) — a blocked Phase 5 assessment still produces a
real, fully-readable record; it simply carries `quantified: false`,
`netDirection: null`, `currency: null`, derived directly from the same
`EngineOutcome` discriminant the assessment itself already carries, never
a second, separately-maintained status flag that could drift out of sync.

### Lineage and supersession

`validateSupersession(newRecord, priorRecord)` rejects: self-supersession
(also rejected at construction time, in both record builders, as a
structural impossibility rather than a domain-evidence gap), a claimed
prior-record reference that doesn't match the record actually supplied,
a two-hop circular supersession (A claims to supersede B, while B already
claims to supersede A), and cross-action supersession (superseding a
record for a *different* `evaluatedActionId` merely because it shares a
field). A true N-hop cycle needs a real store to walk the full chain — a
future persistence layer's job, not this stateless domain function's.

### Serialisation and determinism

All record fields are plain JSON-safe values; both record types round-
trip through `JSON.stringify`/`JSON.parse` with full semantic equivalence
(test-verified, including a real blocked case and a real multi-decimal
monetary value). `constituentActionRecordIds` is sorted by
`evaluatedActionId` before mapping to record ids, so reordering the
caller's own `constituentActionRecords` array never changes the stored
lineage order.

### No persistence, no ranking, no UI

This phase creates no Supabase table, no migration, no API route. It does
not rank opportunities, does not touch Today, does not build cash-flow
realisation/accounting reconciliation, and does not implement AI-generated
wording. Phase 8+ decides how these records enter a real persisted ledger
and how a ranking layer consumes them.

## Economic Opportunity Engine, Phase 7.1 — Canonical Integrity, Scientific Provenance & Assessment Fingerprinting (2026-09-22)

New module `domain/assessment-integrity.ts`. Replaces Phase 7's raw
`JSON.stringify` constituent-binding check (which correctly closed a real
HIGH-severity defect — see Phase 7's own adversarial-review section above)
with a declared, versioned, cryptographic content fingerprint, without
weakening anything that check already caught.

### Three distinct identities, never conflated

- **`evaluatedActionId`** — which real-world action (e.g. a
  `SlurryAllocation` row) this is about.
- **`assessmentId`** — which particular calculation of that action (the
  same action may legitimately have several assessments over time, e.g.
  after a price update).
- **`assessmentFingerprint`** — is the immutable audited CONTENT of this
  specific assessment exactly what originally produced it? A deterministic
  SHA-256 digest over an explicit canonical payload, tied to an explicit
  `integritySchemaVersion` (currently `1`).

### NOT a digital signature

A content fingerprint proves "this content matches what produced this
fingerprint" only when the STORED fingerprint itself is trustworthy — it
does not protect against an actor able to modify both the content and its
stored fingerprint together. The real guarantee: "all trusted engine
layers can deterministically prove they refer to exactly the same
canonical audited assessment content." A future persistence layer wanting
genuine tamper-resistance against a compromised store needs a server-held
HMAC/signature, append-only audit controls, or restricted write
permissions — explicitly out of scope here, documented not implemented.

### Canonicalisation contract (`canonicalizeValue`)

Deterministic, domain-agnostic, fail-closed:

- **Objects**: keys sorted lexicographically — independent of JS
  insertion order.
- **Arrays**: never reordered by the generic function — whether a given
  array is semantically ordered (`scenarios`: always `[baseline,
  intervention]`, preserved) or unordered (`limitations`: a set of
  distinct caveats, SORTED by the payload builders before canonicalisation)
  is a domain decision made once, by `buildPhase5IntegrityPayload`/
  `buildPhase6IntegrityPayload` — the generic canonicaliser never guesses.
- **Missing key vs. explicit `null`**: different. Every integrity payload
  type has no optional fields (nullable facts use `null` explicitly), so
  this ambiguity can only arise from a genuinely-optional upstream
  sub-object (e.g. `CounterfactualInvarianceCheckResult.reasonCode?`,
  correctly absent when `valid: true`).
- **`undefined`**: rejected outright — never silently treated as `null` or
  omitted mid-object.
- **Differently-scaled equal decimal strings** (`"0"` vs `"0.00"`, `"200"`
  vs `"200.0"`): treated as DIFFERENT canonical values — a deliberate
  choice. `money.ts`'s own contract already states `MoneyAmount.amount` is
  "not byte-canonical across scale" and mandates `equalsMoney`/
  `compareMoney` — never string equality — for ECONOMIC comparison. This
  fingerprint is a stricter, lower-level CONTENT/byte fingerprint, not an
  economic-equality check: every real calculation path in this codebase
  produces a given amount through exactly one deterministic arithmetic
  function, so two different scale representations of an economically
  equal amount can only arise from a genuinely different computation path
  or a substituted value — exactly the divergence this mechanism exists to
  catch, not smooth over.
- **Fail-closed, not silently omitted**: `NaN`/`Infinity`/`undefined`/
  functions/symbols/`Date`/`Map`/`Set`/class instances/circular references
  all throw rather than being dropped or coerced — test-verified for each.

### Integrity payloads

`Phase5AssessmentIntegrityPayload` embeds the real `SlurryDirectEconomicAssessment`
almost wholesale (`scienceSupport`, `counterfactualInvariance`,
`evaluatedActionVolumeM3`, both full `FertiliserPlanCostAssessment`
contents, `directCostDifference`, `effect`, `realisationCost`,
`netEconomicResult`, sorted `limitations`) rather than hand-picking leaf
fields, so no materially significant nested fact (a product, a price
observation's identity, a CATEGORY_BENCHMARK proxy disclosure) can be
accidentally left out. The only exclusions are `createdAt` at every level
(the assessment's own and each nested `FertiliserPlanCostAssessment`'s) —
pure calculation-instance timestamps, mirroring Phase 2's own
`canonicalContentHashInput` excluding `retrievedAt`/`ingestionBatchId`
from CSO observation content identity: two runs of the same real
science/prices/quantities at different clock times are the same audited
CONTENT.

`Phase6AssessmentIntegrityPayload` includes, per selected candidate, its
own identity/volume/net/gross contribution (data Phase 6 itself already
computed) PLUS that constituent's own already-computed Phase 5 fingerprint
— never the full duplicated Phase 5 content, preserving Phase 7's "one
canonical source of truth per fact" design. `buildPhase6IntegrityPayload`
requires a caller-supplied map of constituent fingerprints and fails
closed (`ASSESSMENT_INTEGRITY_MISSING_CONSTITUENT_FINGERPRINT`) if any
selected action's fingerprint is missing — never silently skipped.

### Fingerprint construction / verification

`computeAssessmentFingerprint(payload, hash)`: canonicalise → hash → attach
`{schemaVersion, algorithm: "SHA-256", digest}`. `verifyAssessmentFingerprint(payload,
expected, hash)`: validates schema version and algorithm explicitly reject
unsupported ones rather than attempting a best-effort comparison across
versions), recomputes, compares exactly. A mismatch is always reported as
`ASSESSMENT_INTEGRITY_FINGERPRINT_MISMATCH` — never silently regenerated
or replaced.

Both hash-consuming functions take `hash: (input: string) => string` as a
REQUIRED parameter rather than importing `node:crypto` — `assessment-integrity.ts`
stays Node-independent, mirroring `market-evidence.ts`'s own established
"domain module stays hash-input-only, the caller (which has real
`node:crypto` access) supplies the hash function" split. Real callers
(tests, and any future server-side caller) supply Node's
`createHash("sha256").update(input, "utf8").digest("hex")`.

### Phase 7's constituent-binding check, hardened not replaced

`buildAuditedWholeFarmDecisionRecord` (`audited-opportunity-record.ts`)
now: (1) keeps the pre-existing `assessmentId`/`fieldId` string checks; (2)
recomputes the constituent's Phase 5 fingerprint from the AUTHORITATIVE
`result.selected[].assessment` Phase 6 actually chose; (3) separately
verifies the supplied record's OWN `assessment` field still matches its
OWN stored `assessmentFingerprint` (catching internal drift, e.g. a record
built outside `createAuditedActionOpportunityRecord`); (4) compares the
two fingerprints. A new, more precise reason code
(`ECONOMIC_OPPORTUNITY_RECORD_CONSTITUENT_FINGERPRINT_MISMATCH`) fires
specifically when id/fieldId match but content genuinely differs — the
original forged-constituent adversarial-review attack (a 1 m³ forged
assessment sharing a real 200 m³ selection's id/fieldId) is re-regression-tested
against this new mechanism and still correctly rejected, now under the
more precise code rather than the generic "missing" one.

Both `AuditedActionOpportunityRecord` and `AuditedWholeFarmDecisionRecord`
gained a real `assessmentFingerprint: AssessmentFingerprint` field,
computed once at construction from the same deep-cloned content the record
stores — re-verifiable later via `verifyAssessmentFingerprint` against
that same embedded content.

### STOP-condition review (brief's nine named conditions)

All nine checked directly against the real code; none triggered — full
write-up in `assessment-integrity.ts`'s own header. Notable: STOP B
(scientific provenance missing) — verified directly in `nutrients.ts`
(not assumed) that every evidenced slurry path already carries a real,
specific citation ("Teagasc Green Book Table 9-8", "Teagasc spring/LESS
cattle-slurry available-nutrient table (GFT047)", "Teagasc summer/LESS
cattle-slurry available-nutrient table (Signpost Fact Sheet 07)") — this
phase fingerprints those real citations unchanged, invents nothing. STOP C
(applicability unprovable) — `resolveAvailableSlurryNutrients` already
fails closed on every unevidenced method/timing combination; a real,
structural, already-enforced gate, not a documentation-only claim.

### Tests

41 new tests in `assessment-integrity.test.ts` (canonical key-order
independence, array-order preservation, missing-vs-null, fail-closed on
NaN/Infinity/undefined/functions/symbols/Date/Map/Set/class-instances/circular-references,
fingerprint determinism/verification/schema-version/algorithm rejection,
a real positive assessment's full scientific audit trace to fingerprint,
a real blocked-science assessment staying honestly blocked, mutation
tests for every brief-listed semantically material field including a real
different-price rebuild through the full pipeline, and array-ordering
policy tests) plus 2 new regression tests in
`audited-opportunity-record.test.ts` (the re-verified forged-constituent
attack under the new mechanism, plus its positive control). Full
repository suite: 2992/2992 passed across 210 files; `tsc --noEmit`/`npm
run lint`/`npm run build` all clean.

## Economic Opportunity Engine, Phase 8 — Opportunity Eligibility & Deterministic Ranking (2026-09-22)

New module `domain/opportunity-ranking.ts`. A validation/eligibility/
comparability/ranking layer over ALREADY-TRUSTED Phase 7/7.1 records —
never a second opportunity-generation or calculation engine. Reaffirms,
never weakens, the [Non-Negotiable Audit & Scientific Provenance
Principle](#non-negotiable-audit--scientific-provenance-principle) above:
Phase 8 may only rank opportunities that have already passed the Phase 7.1
integrity contract, and it has no authority to reconstruct, repair, invent
evidence for, recompute economics for, reinterpret science for, regenerate
fingerprints for, bypass blocked evidence in, turn unknown into zero for,
or infer cash from economic value for anything it ranks.

### What Phase 8 reads, never computes

`TrustedOpportunityRecord` is the real union of Phase 7's two record types
(`AuditedActionOpportunityRecord | AuditedWholeFarmDecisionRecord`) — no
`unknown as ...` cast exists anywhere in this module. The only arithmetic
performed anywhere in `opportunity-ranking.ts` is `compareMoney` (a pure
comparison) for sorting — no `addMoney`/`subtractMoney`/`multiplyMoney`
call exists. Every ranked amount is the record's own authoritative
`netEconomicResult.amount`/`totalNetEconomicResult.amount`, read verbatim.

### Trust boundary — no fingerprint recomputation

This module deliberately has no `hash` parameter at all. Fingerprint
verification is Phase 7.1's job, already done once at record-construction
time; Phase 8's own "integrity prerequisite" check is a cheap structural
sanity check only — a well-formed 64-hex-char SHA-256 digest shape plus an
accepted `integritySchemaVersion` per policy — never a redundant
re-verification of content Phase 8 has no business re-hashing.

### Eligibility — never a single boolean

`OpportunityEligibilityReason` is a structured, discriminated union
(`not_quantified`, `integrity_not_verified`, `unsupported_source_engine_version`,
`unsupported_record_engine_version`, `lifecycle_excluded`, `superseded`,
`stale_evidence`, `adverse_outcome_excluded`, `zero_outcome_excluded`,
`parent_child_double_count`, `duplicate_assessment`,
`identity_content_conflict`, `incomparable_currency`) — every excluded
opportunity keeps its structured reason plus its own limitations, never a
bare `eligible: false`.

### Six ordered exclusion passes

1. **Structural** (per-record, independent): integrity well-formedness,
   accepted record/source engine version, `quantified`, lifecycle state,
   freshness.
2. **Supersession**: any record with `supersedesRecordId !== null` marks
   its target superseded, regardless of the superseding record's own
   further eligibility (a deliberate, conservative choice — a superseded
   historical record never resurfaces merely because its replacement fails
   some unrelated check).
3. **Duplicate vs. conflict**: records sharing an `assessmentId` are
   grouped; same fingerprint digest = genuine duplicate recording (keep
   exactly one, deterministically by lowest record `id`); different digest
   = an integrity conflict (`identity_content_conflict`) — neither side
   ranks, since same identity with different content must never be
   confused with a legitimate reassessment (that requires a NEW
   `assessmentId`).
4. **Parent/child double counting** (the highest-risk area): a Phase 6
   whole-farm decision's real `constituentActionRecordIds` (already
   verified by Phase 7 against Phase 6's own selection) suppresses its own
   selected Phase 5 children — but only while the parent itself remains
   eligible. An excluded parent (failed an unrelated check) does not
   suppress its real, independently-valid children.
5. **Adverse/zero policy**: `"cost"`-direction excluded unless
   `includeAdverseOutcomes`; `"zero"`-direction excluded only if
   `includeZeroOutcomes` is explicitly set `false` (default `true` — a
   genuine quantified €0 is a real, auditable outcome, never conflated with
   unknown).
6. **Currency comparability**: never combines currencies into one raw
   ranking; only the largest single-currency group (by count, tie-broken
   alphabetically) ranks — built as a real structural guard even though
   `CurrencyCode` is EUR-only today, the same discipline Phase 6 already
   applied to its own currency-mismatch defence.

### Ranking objective and determinism

Ranks the authoritative NET economic amount only (never gross — `quantified`
is tied to the net result at Phase 5/6's own construction time, so a
gross-only-quantified record is already excluded before ranking).
Comparator: eligibility → direction class (benefit=0, zero=1, cost=2) →
`compareMoney` descending within benefit / ascending magnitude within cost
→ a fully documented, non-economic, stable tie-break (`sourcePhase` →
`primaryIdentity` → `assessmentId` → `recordId`, plain string comparison,
never locale-sensitive). Never depends on input array order, object
insertion order, or current time — proven by repeated-shuffle tests.

### Double-counting: lineage primary, Phase 1 validator as confirmation

Per the brief's own §27: lineage (`constituentActionRecordIds`) is the
PRIMARY double-counting mechanism (pass 4 above); the real, unmodified
Phase 1 `validateNoDuplicateCreditClaims` is additionally run over the
FINAL ranked set's own effects as a defence-in-depth CONFIRMATION, exposed
as `OpportunityRankingResult.creditValidation` — not a second exclusion
mechanism, not a reimplementation.

### STOP-condition review (brief's ten named conditions)

All ten checked directly against the real code; none triggered — full
write-up in `opportunity-ranking.ts`'s own header. Several resolved by
design rather than merely avoided: STOP D (parent/child) resolved because
Phase 7 already built and verified the exact lineage needed; STOP G
(currency) trivially not triggered today (`CurrencyCode` is EUR-only) but
the real guard is built structurally anyway.

### What Phase 8 deliberately does not consider (brief §35/§36)

Urgency, weather windows, regulatory deadlines, operational feasibility,
farmer preference, risk, cash availability, time-value/discounting across
incompatible planning horizons, cross-effect-type comparability beyond
what Phase 5/6 currently produce (avoided-fertiliser-plan-cost only in
V1). None of these are silently assumed absent — they are explicitly out
of scope for this phase, to be addressed by future audited policy
contracts, not smuggled in here.

### Tests

31 new tests in `opportunity-ranking.test.ts`, including a real Phase 5
positive-benefit integration case built through the actual scientific/
costing pipeline (brief §44) and a real Phase 6 whole-farm-decision-plus-
constituents integration case built through the actual optimiser (brief
§45), plus every required invariant (trust, unknown≠€0, no-recomputation,
supersession, duplicate safety, reassessment safety, parent-child safety,
currency safety, determinism, input-order independence, policy
traceability, audit continuity) and all twelve lettered test scenarios
(A–L) from the brief. Full repository suite: 3030/3030 passed across 211
files; `tsc --noEmit`/`npm run lint`/`npm run build` all clean.

## Economic Opportunity Engine, Phase 9 — Recommendation Policy / "What Matters" Selection Contract (2026-09-22)

New module `domain/recommendation-selection.ts`. A recommendation-policy /
selection / actionability-gate / presentation-candidate-selector layer over
Phase 8's already-trusted, already-ordered `OpportunityRankingResult` —
never a second economic ranking engine, never a science engine. Reaffirms,
never weakens, the [Non-Negotiable Audit & Scientific Provenance
Principle](#non-negotiable-audit--scientific-provenance-principle) above:
Phase 9 may only select from opportunities Phase 8 has already ranked, and
has no authority to recalculate economics, reinterpret scientific evidence,
regenerate opportunity value, repair blocked records, convert unknown to
zero, fabricate urgency, fabricate actionability, create AI scores,
override integrity failures, or detach a recommendation from its audited
record.

### Phase 8's order is authoritative — Phase 9 never re-ranks

`evaluateRecommendation` iterates `rankingResult.ranked` in exactly the
order Phase 8 produced it. There is no `compareMoney`/sorting-by-amount/
score calculation anywhere in this module — the only "arithmetic" is a
`===` comparison against an already-computed `direction` string and array
indexing against `policy.maxSelectedRecommendations`. Phase 9 may filter,
select, defer or suppress from within that fixed order; it may never
create a new economic ordering.

### Selection rule (deliberately narrow pilot scope)

Select the single highest-Phase-8-ranked opportunity that is: (a) a genuine
`benefit` direction (never zero, never cost/adverse — those are separate,
future recommendation classes, brief §24/§25); (b) in a lifecycle state the
policy explicitly permits as a *new* recommendation (`recommendableLifecycleStates`,
narrower than and separate from Phase 8's own `eligibleLifecycleStates`,
which only decides visibility/audit inclusion); (c) known-actionable under
an explicit, caller-supplied `actionabilityByRecordId` policy input — a
missing entry defaults to `"unknown"`, and unknown is never treated as
actionable. No urgency score, no weather score, no regulatory score, no
farmer-preference score, no AI judgment of any kind exists anywhere in this
phase.

### Structured, never-silent outcomes

Every candidate resolves to one explicit `RecommendationCandidateReason`
(`selected` / `eligible_not_selected` / `deferred` / `suppressed` /
`not_applicable`), never a bare boolean. Reason codes:
`SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY`,
`LOWER_RANKED_THAN_SELECTED`, `ACTIONABILITY_UNKNOWN`,
`NOT_CURRENTLY_ACTIONABLE`, `ALREADY_ACCEPTED`, `ALREADY_COMPLETED`,
`USER_REJECTED`, `LIFECYCLE_NOT_RECOMMENDABLE`, `POLICY_NOT_APPLICABLE`
(the not-a-positive-benefit case). `PARENT_DECISION_SELECTED`/
`CHILD_SUPPRESSED_BY_PARENT` are deliberately NOT implemented — Phase 8's
own hardened pass 6 already fully resolves parent/child double counting
before this module ever sees `ranked`, so these reason codes would never
fire; implementing them would mean rebuilding logic Phase 8 already owns.

### "No current recommendation" is a first-class, valid outcome

`RecommendationSelectionOutcome` is a two-variant union: `{status: "OK",
evaluation}` (a real, successful evaluation — `evaluation.
primaryRecommendation` may legitimately be `null` with an explicit
`noRecommendationReasonCode` of `NO_RANKED_OPPORTUNITIES` /
`NO_POSITIVE_CURRENT_RECOMMENDATION` / `NO_ACTIONABLE_CURRENT_RECOMMENDATION`)
versus `{status: "BLOCKED", reasonCode, detail}` (malformed/untrusted
input — an actionability map referencing an unknown `recordId`, or a
structurally malformed ranking result with duplicate `recordId`s/ranks —
defence-in-depth validation, never a re-verification of Phase 8's own
economics). These are never conflated: a valid empty result is not an
engine failure.

### Why this module does not reuse `EngineOutcome<T>`/`EvidenceState`

A deliberate design choice, not an oversight: attaching a scientific
`EvidenceState` tag (`MEASURED`/`DERIVED`/`IRISH_MODEL`/...) to a pure
workflow/business-rule decision would misrepresent its nature — recommendation
policy and actionability are explicitly *not* science (brief §45), the same
class of mistake Phase 7.1's own review already flagged once (reusing
`MEASURED` for a national market statistic that was never farm-measured).
`RecommendationSelectionOutcome` is its own small, honest union built for
what it actually describes.

### Rank continuity and audit trail

A `RecommendationCandidateEvaluation.economicRank` is Phase 8's own rank,
retained as historical fact and never relabelled — selecting rank 2 because
rank 1 was deferred/suppressed never rewrites rank 2 as "rank 1"
economically. `assessmentFingerprint` is deliberately NOT re-embedded here,
matching the exact precedent `RankedOpportunity` itself already set (Phase
8 doesn't duplicate the fingerprint into its own output either) — a caller
who already holds the full `TrustedOpportunityRecord` can look up the
complete fingerprint/audit chain by `recordId`. One canonical source of
truth per fact, referenced by id, the same discipline every phase since 6
has used.

### Determinism and snapshot semantics

`evaluateRecommendation` takes an explicit `evaluatedAt` parameter — no
`Date.now()`/`new Date()` exists anywhere in the module. The caller-supplied
`policy`/`actionabilityByRecordId` are `structuredClone`d at the start of
evaluation, so later mutation of the caller's own objects cannot
retroactively alter an already-returned result.

### STOP-condition review (brief's ten named conditions)

All ten checked directly against the real code; none triggered — full
write-up in `recommendation-selection.ts`'s own header. Several resolved by
design: STOP D (parent/child) resolved because Phase 8 already fully owns
that decision before this module's input even arrives; STOP G (audit
identity) resolved by following the exact reference-by-id precedent Phase
6/7/8 already established, rather than re-embedding data.

### What Phase 9 deliberately does not consider (brief §46-49)

Urgency, weather windows, regulatory deadlines, operational feasibility,
farmer preference, risk, cash availability. Each would need its own
audited evidence contract before influencing recommendation selection —
none are smuggled in as a placeholder field here.

### Tests

28 new tests in `recommendation-selection.test.ts`, including a real Phase
5/7/8 integration case built through the actual scientific/costing/ranking
pipeline (brief §50) with full audit-continuity assertions, plus all
fifteen lettered test-matrix scenarios (A-O) and the required invariants
(Phase 8 order preservation, no-recalculation, determinism, policy
traceability, unknown fail-closed, lifecycle/economic-snapshot separation,
empty validity, audit continuity, structured reasons). Full repository
suite: 3060/3060 passed across 212 files; `tsc --noEmit`/`npm run lint`/
`npm run build` all clean.

## Economic Opportunity Engine, Phase 10 — Audited Actionability Evidence Contract (2026-09-22)

New module `domain/recommendation-actionability.ts`. Reaffirms, never
weakens, the [Non-Negotiable Audit & Scientific Provenance
Principle](#non-negotiable-audit--scientific-provenance-principle) above,
extended to a fact Phase 9 previously had to take on bare, unprovenanced
faith: *why* an opportunity is considered actionable, not actionable, or
unknown. As the principle itself states, "no downstream recommendation may
detach from the exact audited calculation that produced it" — Phase 10
applies that same discipline to the operational/workflow claim sitting
alongside the economic one, not just the economic claim itself.

### The critical design question, answered honestly

Investigated directly rather than assumed: this codebase has no weather
engine, no regulatory-deadline engine, no operational-constraint engine,
and no farmer-declaration capture mechanism. The ONLY real, authoritative
evidence source for actionability today is Phase 7's own workflow
lifecycle state (`OpportunityDecisionStatus`). Consequence, stated plainly
rather than worked around: `assessWorkflowStateActionability` — the one
real, production-wired derivation — can honestly produce `NOT_ACTIONABLE`
(for an exact, completed audited action) or `UNKNOWN` (everything else); it
can never honestly produce `ACTIONABLE` from real pilot data, because
nothing in this codebase yet proves an opportunity CAN currently be acted
on. Per the brief's own words: "It is valid for many pilot opportunities to
remain UNKNOWN. Correct uncertainty is preferable to fabricated
actionability." The general-purpose `createActionabilityAssessment`
constructor DOES support a real `ACTIONABLE` state (so the contract is
ready for a genuine future evidence source — a farmer declaration, a
weather rule, an operational-constraint engine), exercised in tests with
realistic fixture evidence, but no production code path in this phase ever
fabricates that claim for a real pilot opportunity.

### Precise, non-generous lifecycle interpretation

The phase's central discipline: `active` → `UNKNOWN` (merely "not yet
resolved," never proof of actionability). `accepted` → `UNKNOWN` (a
farmer's decision to accept is not evidence the action can physically be
performed right now — Phase 9's OWN selection policy already suppresses
accepted opportunities from new-recommendation surfacing; Phase 10 must
not duplicate that policy decision by claiming it as actionability
evidence). `rejected` → `UNKNOWN` (rejection is a workflow/farmer decision,
not proof the action is physically impossible — Phase 9's own policy
handles suppression separately). `completed` → the ONLY state that
supports `NOT_ACTIONABLE`, and only for the exact audited action
(identity-bound via `boundAssessmentId`, so a genuinely new reassessment of
the same real-world action is never silently blocked by an old completed
record).

### Evidence-category vocabulary — one implemented, six documented

`ActionabilityEvidenceCategory` declares `WORKFLOW_STATE` (real,
implemented), `UNKNOWN` (the honest fallback), and five documented-only
placeholders for future evidence engines: `PLANNING_WINDOW`,
`OPERATIONAL_CONSTRAINT`, `REGULATORY_RULE`, `WEATHER_CONDITION`,
`FARMER_DECLARATION`, `SYSTEM_OBSERVATION` — each with a doc comment
stating what real provenance it would need (source/timestamp/applicability/
jurisdiction/rule-version as relevant) before any future phase implements
it. None of the five has a derivation function in this phase.

### Identity binding — never trust a caller-attached assessment

Every `ActionabilityAssessment` carries `opportunityRecordId` (the real
Phase 7 record id) and `boundAssessmentId` (the record's own
`assessmentId` at evaluation time). `validateActionabilityBinding`
cross-checks both against a record's CURRENT state — a wrong-opportunity
attachment is rejected (`ACTIONABILITY_EVIDENCE_IDENTITY_MISMATCH`), and an
assessment made against a since-superseded economic assessment is rejected
as stale (`RECOMMENDATION_ACTIONABILITY_STALE_ASSESSMENT_BINDING`) rather
than silently carried across a reassessment.

### Conflicting evidence fails closed, no invented precedence

`combineActionabilityEvidence` resolves genuinely conflicting evidence (one
source says actionable, another says not_actionable, for the same bound
opportunity/assessment) to `UNKNOWN` with an explicit
`UNKNOWN_CONFLICTING_EVIDENCE` reason — it never arbitrarily prefers one
evidence category over another, since no existing domain rule establishes
such a precedence.

### No economic fields, no urgency score

`ActionabilityAssessment` has no monetary field of any kind (no
`MoneyAmount`, no score, no 1-10/0-100/high-medium-low rating) —
structurally prevented from ever becoming a second ranking layer. Tri-state
plus reason/provenance only.

### Phase 9 integration — a wrapper, not a redesign

`deriveVerifiedActionability(rankingResult, assessmentsByRecordId)` is a
pure function producing exactly the `ReadonlyMap<string,
RecommendationActionability>` shape `evaluateRecommendation` already
accepts. **Zero changes were made to `recommendation-selection.ts`** —
Phase 9's own already-hardened, adversarially-reviewed selection logic is
untouched; Phase 10 wraps its existing input boundary rather than
redesigning it (brief §9's explicit "replace or wrap" allowance).

### Dual audit chain

A selected recommendation is traceable two ways from the same `recordId`:
the economic chain (Phase 8 → Phase 7.1 fingerprint → Phase 6/5 →
science/economics, all pre-existing) and the actionability chain — a pure,
deterministic function of `(record, decisionState)`, re-derivable at any
time by a reviewer holding the same real `OpportunityDecisionState` a
caller already threads through Phase 8/9. No redundant reference field was
added to Phase 9's own result type to carry this — one canonical source of
truth per fact, re-derivable by id, the same discipline every phase since 6
has used.

### Why this module does not reuse `EngineOutcome<T>`/`EvidenceState`/`SourceId`

The same deliberate choice Phase 9 already made for recommendation policy,
extended: actionability is a workflow/policy fact, not a scientific claim
(brief §45) — attaching a scientific evidence-state tag or reusing
`SourceId`/`SOURCE_REGISTER` (both genuinely scientific/market citation
vocabularies) would misrepresent its nature, the exact mistake Phase 7.1's
own review already flagged once (reusing `MEASURED` for a national market
statistic that was never farm-measured).

### STOP-condition review (brief's ten named conditions)

All ten checked directly against the real code; none triggered — full
write-up in `recommendation-actionability.ts`'s own header. STOP B (no
authoritative evidence) resolved by the honest design-question answer
above, not by fabricating a source. STOP D (lifecycle overreach) resolved
by the precise interpretation above. STOP A/I (Phase 9 redesign) resolved
by the wrapper design — zero lines changed in `recommendation-selection.ts`.

### What Phase 10 deliberately does not implement

Weather actionability, regulatory-deadline actionability,
operational-constraint actionability, farmer-declaration capture, the What
Matters UI, persistence. Each documented-only evidence category is a real
place for a future phase to plug in without a breaking type change.

### Tests

22 new tests in `recommendation-actionability.test.ts`, including a real
Phase 5/7/8/9 integration case (brief §40) proving a production caller can
go from zero real evidence (→ deferred, `ACTIONABILITY_UNKNOWN`) to a real,
provenanced actionable assessment (→ selected) with no naked
caller-supplied `"actionable"` anywhere in the path, plus all sixteen
required-test-matrix items (provenanced actionable/not-actionable, missing
provenance rejected for both, wrong-opportunity and stale-assessment
binding rejected, conflicting evidence resolves to unknown, precise
lifecycle interpretation for all four real states, unknown-top-rank
selects next actionable, mutation-does-not-alter-snapshot, deterministic
repeat, structural no-economics/no-science confirmation). Full repository
suite: 3085/3085 passed across 213 files; `tsc --noEmit`/`npm run lint`/
`npm run build` all clean.

## Economic Opportunity Engine, Phase 11A — Audited Spreading
Actionability Foundation (2026-09-22)

Answers: "What do we currently know, from real production evidence, about
whether this exact slurry action is legally and operationally eligible
for further spreading-suitability evaluation?" A composition layer only
— it invents no regulatory rule, no scientific coefficient, no weight,
and produces no 0-100 score. That is a future Phase 11B's job, which
will consume this module's output.

### What this module composes — real, existing code only

- `checkSpreadingWindowGate` (`spreading-window-gate.ts`) — the real,
  date-validated statutory closed-period calendar gate. Deliberately
  NOT `checkSpreadingLegalGate`'s ground-conditions path: that module's
  own header documents four real Codex audit rounds that tried wiring
  weather/ground booleans into it and reverted every time, because
  `SpreadingGroundConditions` has no timestamp/source field of its own
  — reusing it here would reintroduce a defect this codebase already
  found and fixed. Real rainfall evidence is instead exposed as its own,
  separately-provenanced evidence item (below), never smuggled into a
  boolean that structurally can't carry its own provenance.
- `checkNationalBufferDistance` (`buffer-gate.ts`) — only when a caller
  supplies real application-geometry distance data; `UNKNOWN` otherwise.
- `checkCommonageFertiliserGate` (`commonage-gate.ts`) — only when a
  caller supplies real commonage status; `UNKNOWN` otherwise.
- `getWeatherForField`/`meteireannLocationForecastProvider` (real,
  live-verified Met Éireann production integrations) — field-bound via
  the real `Field.centroid`, explicit `evaluatedAt`, fail-closed to
  `UNKNOWN` on any fetch/parse failure, never a fabricated reading.

### Live regulatory verification (not trusted from memory or prior claims)

The Irish Statute Book returned HTTP 403 to automated fetching in this
session, so `closed-period-calendar.ts`'s real
`CLOSED_PERIOD_BY_ZONE_MATERIAL` table was independently cross-checked
against real, dated 2026 farming-press reporting instead: every
zone-specific reopening date (Zone A 13 Jan, Zone B 16 Jan, Zone C
1 Feb for organic fertiliser; Zone C chemical fertiliser reopening
14 Feb; the national 15 Sept/1 Oct/1 Nov closure starts) matched the
codebase's table exactly. No conflict was found.

`closed-period-calendar.ts`/`spreading-window-gate.ts` also carry their
own extensive, already-documented limitation (`BLOCKERS.md`, four real
Codex audit rounds, deliberately reverted rather than patched): the
closed-period table has no evidenced "year of applicability" and
matches its mm-dd pattern against any year indefinitely. This is a
real, pre-existing, already-documented gap this phase inherits by
composing the frozen gate — not one Phase 11A introduces or is
authorised to fix.

### Canonical tri-state — reused `EngineOutcome`, not a parallel system

`classifyFoundationConditionState` maps a real, unstripped
`EngineOutcome` (`OK`/`NOT_APPLICABLE` → `PASS`; `LEGAL_PROHIBITION` →
`BLOCKED`; `BLOCKED_INSUFFICIENT_EVIDENCE`/`AMBIGUOUS`/`UNKNOWN` →
`UNKNOWN`) into the brief's own tri-state vocabulary for the
aggregate's per-condition summary — the full outcome (reason codes,
consequence text) is always preserved alongside the tri-state, never
discarded.

### Aggregate state — `READY_FOR_SCORING` is not `ACTIONABLE`

`BLOCKED` if any mandatory gate is `BLOCKED`. `UNKNOWN` if there is no
blocker but any tracked evidence item (including SMD/soil temperature,
which are always unavailable today) is unresolved.
`READY_FOR_SCORING` only if every currently-tracked evidence item is
genuinely available and every gate passes — this means a future scoring
engine has its required inputs, never that the opportunity is
actionable. This phase does not change Phase 10's production
`ACTIONABLE` reachability: it remains **NO** — this module's output
never enters Phase 10 (a future Phase 11B, not this phase, will
translate a real score into a real Phase 10 `ActionabilityAssessment`).

### SMD and soil temperature — honestly unavailable, never inferred

No real per-field production source exists for either in this
codebase. `spreading.ts`'s `DUNSANY_VALIDATION_SERIES` is explicitly
quarantined validation data — this module never imports it. Both
resolve to a structured `{availability: "UNKNOWN", reasonCode:
"SOURCE_UNAVAILABLE"}`, never a numeric 0, never an inference from
rainfall/air temperature/county averages.

### Wind and crop-demand — investigated honestly, both unavailable

No real field-bound wind observation/forecast provider exists in this
codebase (repo-wide search). `calculateNutrientPlan` produces a real
per-field nutrient requirement, but treating it as a "crop-demand
signal for spreading timing" would be a new interpretation this phase
is not authorised to invent — both report `UNKNOWN` in the Phase 11B
score-input readiness contract, pending real future evidence sources.

Explicitly stated: rainfall observations and forecasts do not, by
themselves, prove a field is not waterlogged, flooded or otherwise
unsuitable for spreading. Validation datasets must never be presented
as live farm evidence. This foundation may correctly report `UNKNOWN` /
`NOT_READY_FOR_SCORING` even when regulatory and rainfall evidence are
both favourable.

### STOP-condition review (brief's ten named conditions)

All ten checked directly against real code and the live regulatory
verification above — none triggered. STOP B (gates cannot be safely
composed) was resolved by the deliberate composition choice documented
above (calendar-only gate; weather evidence exposed separately, never
fed into `SpreadingGroundConditions`). STOP D (validation data reaching
production) was resolved structurally — the module never imports from
`./spreading`, proven by a dedicated test. STOP J (truthful output
forced positive) was resolved by design — `READY_FOR_SCORING` is
honestly unreachable today given SMD/soil-temperature unavailability,
and the aggregate correctly reports `UNKNOWN` rather than being forced.

### No score, no weights, no invented threshold

Solar radiation is never retrieved, inferred, or referenced anywhere in
this module (structurally tested). No numeric score, subscore, weight,
or classification band appears anywhere in this module's output — those
belong entirely to a future Phase 11B.

### Tests

25 tests in `spreading-actionability-foundation.test.ts`, including a
real end-to-end trace (`calculateNutrientPlan` → real, live
`getWeatherForField`/`meteireannLocationForecastProvider` calls, no
fetch mocking) proving the real production pipeline composes correctly
and honestly resolves `UNKNOWN`/`BLOCKED` — never `READY_FOR_SCORING` —
given today's real evidence availability. Full repository suite:
3110/3110 passed across 214 files; `tsc --noEmit`/`npm run lint`/
`npm run build` all clean.

## Economic Opportunity Engine, Phase 11B — Audited Rainfall Window
## Score v1

`src/domain/rainfall-window-score.ts` answers one narrow question:
**how favourable is the rainfall window around this exact proposed
slurry-spreading evaluation time?** It does not claim the field is not
waterlogged, that it is trafficable, that spreading is legally
permissible, or that the action is `ACTIONABLE` — those remain separate
audited propositions (Phase 11A's regulatory gates; a future
ground-condition evidence contract; Phase 10).

**Naming.** The output is always the "Rainfall Window Score" — never
"Spreading Score", "Suitability Score", "Trafficability Score" or
"Agronomic Score". v1 measures rainfall only, and the name says so.

**What it means.** `100` means the rainfall evidence v1 represents is
highly favourable; `0` means highly unfavourable. It does NOT mean legal
compliance, probability of successful spreading, field trafficability,
waterlogging probability, nutrient retention, or scientific certainty.

**Inputs and windows.** Two components, for an explicit caller-supplied
evaluation time `T` (never a hidden clock):

- **Historical**: cumulative observed rainfall over `[T-72h, T)`. Reuses
  `weather-service.ts`'s own existing `rollingRainfall` 72h window
  directly — this module performs no new observation retrieval or
  aggregation of its own; it consumes the one real implementation
  `weather-observations.ts` already owns, including its existing
  completeness semantics (`totalMm: null`, never 0, whenever the window
  isn't fully covered).
- **Forecast**: cumulative forecast rainfall over `[T, T+48h)`, from real
  `ForecastPoint` windows (`forecast-provider.ts`'s live Harmonie model,
  which covers ~90h at 1-hour resolution — well past 48h). This module
  explicitly verifies the surviving windows tile `[T, T+48h)` exactly —
  no gap, no overlap, no double-count — before trusting the sum; any
  violation fails the component closed to `UNKNOWN` rather than summing
  a partial or ambiguous total.

**Freshness.** Reuses each provider's own existing freshness
classification. Unlike Phase 11A's STALE-tolerant-with-limitation
convention (appropriate for a regulatory PASS), this score requires
`LIVE` data — a `STALE` observation or forecast resolves that component
to `UNKNOWN`, per the brief's explicit instruction not to let stale
data silently stand in for current conditions.

**Field-centroid binding.** Reuses Phase 11A's hardened
`queriedCentroid` mechanism exactly (`WeatherForFieldResult`/
`ForecastResult.queriedCentroid`) — never a second, independently-trusted
location field. A mismatch against this assessment's own declared
`fieldCentroid` forces `UNKNOWN`. A companion **time-binding** check
(new in this phase) additionally verifies the historical window's own
`windowEnd` equals this assessment's `evaluatedAt` — rejecting weather
fetched for a different evaluation time than the one this score
assessment declares.

**Missing data never silently zero-fills or renormalises.** If either
component (historical or forecast) is `UNKNOWN`, the final score is
`UNKNOWN` too — never a misleading complete 0-100 computed from only the
available half.

**Model-policy provenance (not scientific authority).** The anchor
curves and the 40/60 historical/forecast weighting are Farm Return's own
versioned calibration choices (`RAINFALL_WINDOW_SCORE_IE_V1`), never
presented as a Met Éireann or Teagasc rule — only the raw rainfall totals
are real evidence. Forecast conditions are weighted higher (60%) than
retrospective context (40%) because the model evaluates an *upcoming*
spreading window — a product rationale, not a scientific proof.

**Exact arithmetic.** All computation uses `decimal.js` (this
codebase's own established convention — see `money.ts`'s header), never
native `Number` multiplication/division for score output. The worked
example (500kg-cost-style precision, not rounded internally): 8mm
historical (subscore 81, interpolated between the 5mm→90 and 10mm→75
anchors) and 4mm forecast (subscore 90, interpolated between the
3mm→95 and 5mm→85 anchors) → `81 × 0.40 + 90 × 0.60 = 86.4` exactly.

**Blocked-opportunity composition choice.** This module takes only real
weather-provider results as input, never a Phase 11A assessment — a
deliberate choice, not an oversight. It keeps the score independently
computable as diagnostic weather evidence regardless of Phase 11A's
regulatory state, without coupling this module to Phase 11A's internal
type. The invariant "a high score can never override a `BLOCKED`
regulatory result" holds today because nothing in the repository wires
this module's `score` into Phase 11A's `aggregateState` or Phase 10's
`ACTIONABLE` (confirmed by grep) — Phase 10 is deliberately left
unchanged by this phase; a future adapter, not this one, will decide how
a Rainfall Window Score participates in actionability policy.

### STOP-condition review

All ten checked directly against real code — none triggered. STOP A/B
(sufficient 72h/48h coverage) were resolved by reuse: `weather-service.ts`
already fetches and aggregates a 72h rolling window, and the live
Harmonie forecast already covers well past 48h at 1-hour resolution — no
new provider capability was needed. STOP C (ambiguous aggregation) was
resolved by the explicit tiling verification in
`aggregateForecastRainfall`, not an assumption from the parser's own doc
comment. STOP I (score converted into `ACTIONABLE`) was resolved by
design — confirmed by grep, no reference to Phase 10, `VerifiedActionabilityMap`,
or `"ACTIONABLE"` exists anywhere in this module.

### No SMD, soil temperature, wind or solar radiation

None of these are consumed as a data input anywhere in this module
(structurally tested — no `soilTemperatureC`, `windSpeedMps`,
`solarRadiationWM2`, or SMD field is ever read). v1's total 0-100 score
is entirely rainfall-window based; this is intentional, not a
placeholder awaiting future weighting.

### Tests

51 tests in `rainfall-window-score.test.ts`, covering the exact worked
example, every anchor and boundary on both curves, monotonicity and
boundedness as property tests, an independent from-scratch oracle
(200 seeded historical/forecast pairs, comparing against production
without importing its interpolation function), missing/incomplete/stale/
wrong-field/duplicate-interval/negative-rainfall failure modes for both
windows, mutation-safety, and determinism. Full repository suite:
3167/3167 passed across 215 files; `tsc --noEmit`/`npm run lint`/
`npm run build` all clean.

## Economic Opportunity Engine — What Matters Pilot,
## `SLURRY_ACTIONABILITY_POLICY_IE_V1`

`src/domain/slurry-actionability-policy.ts` is the first real production
evidence producer feeding Phase 10 — it combines Phase 11A's regulatory
foundation, Phase 11B's frozen Rainfall Window Score, and adaptive
farmer confirmation into one audited `ActionabilityAssessment`, using
Phase 10's own unmodified `createActionabilityAssessment` constructor
as its sole output path (no naked cast, no second actionability
vocabulary).

**System-first inference.** Farm Return does not ask the farmer to
confirm conditions already resolved by trusted system evidence. No
air-temperature data exists anywhere in the production weather path
(confirmed by repo-wide search before this module was written) — there
is no defensible automated frost-clearing rule to build, so frost/snow
always requires a farmer declaration when reached rather than an
invented inference.

**Precedence (first decisive result wins, evaluated in this order):**
1. Phase 11A regulatory `BLOCKED` → `NOT_ACTIONABLE`, absolute — nothing,
   including a favourable score or a farmer declaration, overrides a
   statutory closed period, buffer restriction or commonage restriction.
2. Phase 11A regulatory `UNKNOWN` → `UNKNOWN`.
3. Rainfall Window Score unavailable → `UNKNOWN`.
4. Rainfall Window Score `< 70` → `NOT_ACTIONABLE`. The threshold
   `MINIMUM_RAINFALL_WINDOW_SCORE = "70"` is `FARM_RETURN_MODEL_POLICY`
   — not legislation, not a Met Éireann or Teagasc threshold — compared
   with exact `decimal.js` arithmetic (`69.999...` fails, `70` passes).
5. Any physical condition (trafficability, visible waterlogging/standing
   water, frost/snow) confirmed unfavourable by a valid farmer
   declaration → `NOT_ACTIONABLE`.
6. Any physical condition unresolved → `UNKNOWN`, with the exact
   unresolved condition codes surfaced as `requiredConfirmations` —
   adaptive, never a fixed questionnaire; only the conditions still
   genuinely open are asked about.
7. Everything resolved favourably → `ACTIONABLE`.

**Rainfall Window Score alone cannot establish field trafficability or
the absence of waterlogging** — until SMD or direct field evidence
exists, physical ground condition legitimately requires farmer
confirmation. This is expected, not a gap to route around.

**Farmer-declaration evidence** (`FarmerDeclarationEvidence`) is an
immutable, assessment-scoped snapshot bound to declaration ID, field ID,
action ID, the exact `boundAssessmentId`/`evaluatedActionId`, evaluation
timestamp, declaration timestamp, condition code, boolean value, and
`provenance: "FARMER_DECLARATION"`. No actor-identity/authentication
concept exists anywhere in this domain layer today (confirmed by
repo-wide search), so `declaredByActorId` is left optional rather than
inventing one. No invented validity-period expiry (no 6h/12h/24h global
window) — `validateFarmerDeclarationBinding` rejects a declaration whose
`opportunityRecordId`/`fieldId` doesn't match the target
(`SLURRY_ACTIONABILITY_DECLARATION_WRONG_FIELD`) or whose
`boundAssessmentId`/`evaluatedActionId` no longer matches — a
reassessment of the same action requires a fresh declaration
(`SLURRY_ACTIONABILITY_DECLARATION_STALE_ASSESSMENT`).

**Identity binding on every input.** Before evaluating anything,
`evaluateSlurryActionability` verifies the supplied Phase 11A foundation
and Phase 11B rainfall score both actually describe the exact target
opportunity/field/assessment/action — a mismatch is rejected outright
(`SLURRY_ACTIONABILITY_FOUNDATION_IDENTITY_MISMATCH`,
`SLURRY_ACTIONABILITY_FOUNDATION_STALE_ASSESSMENT_BINDING`, and the
`RAINFALL_SCORE_` equivalents), never silently trusted because it was
merely passed as a parameter.

**`what-matters-presentation.ts`** is pure orchestration glue: it takes a
real Phase 8 `OpportunityRankingResult` plus one
`SlurryActionabilityEvaluation` per ranked candidate, builds a
`VerifiedActionabilityMap` the only way that's possible
(`deriveVerifiedActionability`), runs Phase 9's real, unmodified
`evaluateRecommendation`, and maps the result into a small UI-facing
discriminated union (`actionable` / `needs_confirmation` / `blocked` /
`unknown` / `none`). It adds no new selection, ranking or actionability
logic of its own — Phase 8 remains the sole economic-rank authority, and
a selected lower-ranked candidate always retains its real
`economicRank` (never relabelled to `1`).

**UI (`WhatMattersPilotCard.tsx`).** Reuses the existing `PromptCard`
visual language rather than introducing a new card style. Renders
exactly the unresolved farmer question(s) for `needs_confirmation`
results; never flips its own display state to "actionable" — the
caller re-runs the real domain path
(`evaluateSlurryActionability` → `buildWhatMattersPilotPresentation`)
with the farmer's new declaration and passes the freshly recomputed
result back in as a prop, exactly like every other piece of state in
this engine. Always labels the metric exactly "Rainfall Window Score".
Honest language throughout — a `blocked` result never implies legal
prohibition unless the real regulatory gate actually produced one; an
`unknown` result says "more field information is needed," never
"unsafe," unless evidence actually establishes that.

**Scope note (superseded — see "What Matters Live On Today Page" and
"V1 Realisation Cost Benchmark" below).** This component was not wired
into `today/page.tsx`'s live data flow in the initial pilot pass
described above. A subsequent, separate integration task
(`src/app/actions/what-matters-pilot.ts`) has since wired it in for
real: the old `Prompt`/`select-primary.ts` path no longer determines
that page's What Matters recommendation slot.

### Tests

32 tests across `slurry-actionability-policy.test.ts` (all 15 core
precedence/binding/determinism cases including the exact 69.999/70
threshold boundary), `what-matters-pilot.e2e.test.ts` (all 10 required
end-to-end scenarios plus a real audit-continuity case, tracing
`calculateNutrientPlan` → Phase 5 → Phase 7/7.1 → Phase 8 → policy →
Phase 10 → Phase 9 → presentation through real domain functions, with
Phase 11A/11B evidence as controlled fixtures — the same "real ranking,
controlled evidence" split `recommendation-selection.test.ts` already
established), and `WhatMattersPilotCard.test.tsx`.

## Economic Opportunity Engine — V1 Realisation Cost, Farmer-Entered
## Contractor Rate (supersedes the automatic `SLURRY_REALISATION_COST_IE_V1` benchmark)

`src/domain/slurry-realisation-cost.ts` supplies Phase 5's
`realisationCost` input (`slurry-direct-economic-assessment.ts`'s own
documented "incremental realisation cost — contractor spreading,
transport" tri-state) for the live What Matters pilot.

**Revision history — why this is no longer an automatic system value.**
The original V1 design supplied this cost automatically from a fixed,
versioned Farm Return pilot benchmark (`SLURRY_REALISATION_COST_IE_V1`,
€120/ha, explicitly labelled non-authoritative). An independent Codex
audit raised the same CRITICAL finding twice, even after that
disclosure: `SCIENTIFIC_RULES.md`'s fail-closed rule requires an
unsupported production financial number to remain `unknown`, not be
substituted with a labelled guess, however clearly disclosed. The
owner's explicit decision was to honour that rule rather than override
it. The automatic benchmark constant and its `resolveSlurryRealisationCostV1`
resolver no longer exist in this module.

**The realisation cost now comes ONLY from a real, farmer-entered
contractor-cost-rate declaration** — genuine `FARMER_DECLARATION`
evidence (`FarmerContractorCostDeclaration`, `createFarmerContractorCostDeclaration`),
immutable, bound to the exact opportunity record / economic assessment
/ evaluated action / field it applies to
(`validateFarmerContractorCostDeclarationBinding`) — the same
identity-binding discipline `slurry-actionability-policy.ts`'s own
`FarmerDeclarationEvidence` already established for physical-condition
declarations, deliberately reused rather than inventing a second
pattern. It is never described anywhere (code, docs, UI) as a market
benchmark, an FCI rate, or any other externally-authoritative figure —
it is the farmer's own declared cost, nothing more.

**One deliberate difference from `FarmerDeclarationEvidence`:** a
contractor-cost-rate binding does NOT require an exact `evaluatedAt`
match. Physical ground-condition declarations are genuinely
time-sensitive (the ground itself can change between one evaluation
and the next); a farmer's contractor rate is not — it remains valid for
as long as it is bound to the same real economic assessment
(`boundAssessmentId`, which already changes once per calendar day via
`asOfDate`). Requiring a fresh rate entry on every page refresh within
the same day would be a real UX regression with no corresponding audit
benefit.

**Calculation.** `realisationCost = fieldAreaHa × declaration.ratePerHa`,
using `Field.areaHa` — the one authoritative, farmer-polygon-derived
area Farm Return already holds (`types.ts`, `field-boundary.ts`) —
never a caller-supplied duplicate. Exact `decimal.js` arithmetic
throughout (`money.ts`'s `multiplyMoney`); e.g. `5ha × €120/ha → €600`,
exactly, no floating-point drift. The rate itself is validated as a
finite, strictly-positive canonical decimal — a zero or negative
"cost" is rejected outright, never accepted as a real contractor rate.

**Missing rate — and missing/invalid area — never becomes a fabricated
cost.** No valid declaration for this exact target, a non-finite,
negative, zero, or over-precise area (`units.ts`'s
`exactQuantityFromRoundedNumber`, the same discipline Phase 4 already
applies to product quantities) all resolve to `{status: "unknown"}` —
never a default rate, never a default area, and never a `known_zero`
cost for a field whose area could not actually be established.

**Provenance.** `SlurryRealisationCostResolution` retains the field ID,
the exact area used (or `null` if unresolved), the real
`FarmerContractorCostDeclaration` actually used (or `null`), and a
human-reconstructible `calculationExpression` (e.g.
`"5 ha × €120/ha = €600"`) — a reviewer can verify the figure, and its
farmer-declared origin, without reading source code. The What Matters
presentation layer threads this FULL structured object through to the
selected `actionable` result's `costAssumption` field, exactly as
before; `WhatMattersPilotCard` derives its own short display line from
the real object.

**Capture UI.** `ContractorCostRateInput` (`WhatMattersPilotCard.tsx`)
is the smallest possible capture control — a `€ [___] / ha` input plus
Save, performing NO economics itself. Saving calls the real
`saveFarmerContractorCostRate` server action, which validates the raw
rate, persists it, then re-runs the full audited chain through the real
domain path — never a local UI toggle.

**Persistence and the client/server trust boundary (Codex audit
CRITICAL + HIGH, fixed).** The rate is persisted in
`slurry_contractor_cost_declarations` (one row per farm per declaration,
insert/select-only, the same discipline `fertiliser_stock_records`/
`slurry_composition_records` already established — a correction is a
NEW row, never an edit; `src/lib/farm-data/slurry-contractor-cost.ts`).
The public Server Action surface (`evaluateWhatMattersPilot`,
`confirmWhatMattersPilotCondition`, `saveFarmerContractorCostRate`)
never accepts a `FarmerContractorCostDeclaration` object, or even a raw
rate string, as an input to READ the current rate — `evaluateWhatMattersPilot`
always fetches the farm's one latest persisted row itself
(`getLatestContractorCostRateForFarm`) and constructs every trusted
declaration server-side from it, exactly once per real target, inside
`buildRealCandidates`. `saveFarmerContractorCostRate` is the only entry
point that WRITES a new rate, and validates it
(`validateContractorCostRate`) before that write, returning a
structured `{status: "error"}` for an invalid rate rather than silently
discarding it later. Two real, independently-caught Codex findings drove
this design, in order: (1) an earlier revision accepted a caller-supplied
`FarmerContractorCostDeclaration[]` directly on an exported Server
Action — a client could submit an arbitrary rate/currency/timestamp/
provenance; (2) a later revision fixed that but still accepted a raw
rate + reused the client-suppliable `evaluatedAt` as the declaration's
own `declaredAt`, and held the "current" rate only in React state (lost
on every reload) — both fixed by moving the rate to real, server-owned
persistent storage, with `declaredAt` sourced from the database row's
own `created_at`, never from any request parameter.

**Net, not gross.** No UI-side cost arithmetic exists anywhere — the
headline economic-benefit figure on the card is Phase 5's own real
`netEconomicResult` (gross fertiliser-plan-cost difference minus this
realisation cost), computed once, in the domain layer, and never
recomputed in React.

### Tests

`slurry-realisation-cost.test.ts` (declaration validation, wrong-field/
stale-assessment binding attacks, exact arithmetic from a real
declaration, missing-rate/missing-area fail-closed cases, latest-valid-
declaration-wins reassessment case, full provenance reconstruction)
plus real-boundary regression coverage in `what-matters-pilot.test.ts`
(no persisted rate → unknown, never €120; a persisted rate → the real
Phase 5 input receives a quantified cost; an invalid area still
produces `{status: "unknown"}` even with a valid rate; a real
candidate's net result is no longer blocked solely by an unknown
realisation cost once a rate is declared; `saveFarmerContractorCostRate`
rejects zero/negative rates with a structured error before ever calling
`createContractorCostRateRecord`; a valid save persists the rate for the
real farm and the result echoes it back) and `WhatMattersPilotCard.test.tsx`
(`ContractorCostRateInput`'s own positive-rate-only validation and
disabled-while-saving state).

## Campaign A — Slurry recommendation evidence foundation

New contracts:

- `buildSlurryEvidenceContext` (`src/domain/slurry-evidence-context.ts`,
  `slurry_evidence_context_v1.0.0`). This is the canonical, read-only
  evidence boundary for slurry planning: active fields, farmer answers,
  soil P/K provenance, recorded DM, store physical volume versus nutrient
  content, and planned versus completed applications.
- `resolveSoilIndexProvenance` (`src/domain/soil-index-provenance.ts`,
  `soil_index_provenance_v1.0.0`).

Additive changes to existing contracts (no existing consumer affected):

- `CalculateNutrientPlanInput.slurryCompositionUnresolved?`: blocks the
  slurry credit with `SLURRY_COMPOSITION_SOURCES_UNRESOLVED` instead of
  falling back to 6.3 %.
- `NutrientPlan.soilIndexProvenance?`.
- A trailing `slurryCompositionUnresolved?` argument on
  `promptForFertiliserRecommendation`.
- `soilTestAgeValidityForFertility`: the 4-year rule is now judged on the
  laboratory's own P Index.
- `computeFarmGrasslandAggregates` and `buildAllRealPrompts` now exclude
  archived fields themselves.

For the full finding-by-finding status, see
`SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md` §13.

## Campaign C — remaining programme (2026-09-30)

New proposed contracts. They are not frozen and not wired into production.

| Module | Wraps (unmodified) | Notes |
|---|---|---|
| `domain/slurry-rate-allocation.ts` (`buildSlurryRateAllocation`, `slurry_rate_allocation_v0.3.0-draft`; v0.1.0-draft until per-nutrient P/K Increment 4, v0.2.0-draft until Fertiliser Vertical Increment 2c, both 2026-10-02) | `NutrientPlan` from `calculateNutrientPlan` (consumed, never recomputed; since v0.3.0 `fieldRequirement`, `fieldRemainingRequirement` (soil index from `fieldRequirement.p/k.soilIndex`), `organicApplication.availableNutrientByNutrient`, `availableNutrientBasis`, `rateM3ha`, `totalM3` and the paired `offset*`; v0.2.0 read `requirementByNutrient` / `netRequirementByNutrient` / `fertilityEvidenceByNutrient`) | Keeps planned application, crop requirement (canonical arms, unrounded), available slurry nutrient, organic share limit, allocated credit, organic excess over requirement (P/K from the requirement-limit records; N recorded only), remaining chemical requirement (canonical arms), rate constraints and final rate separate. Requirement comparisons are exact (no rounding interval). Tillage → requirement constraints `NOT_EVALUATED`; no-livestock / no-grassland-area grazing → `UNDETERMINED`, never 0. Each constraint record carries rule ID, evidence class, claim IDs, version, input, limit, output, binding and reason. `finalAllowedRate` is always DEFERRED. Every record has `affectsProductionOutput: false`. Consumer (Fertiliser Vertical Increment 2d, 2026-10-02): the read-only Nutrients-page planned slurry evaluation (`lib/slurry-diagnostic-presentation.ts` → `components/farm/SlurryDiagnosticCard.tsx`), which displays `plannedApplication`, `availableSlurryNutrient`, `requirement`, `remainingChemicalRequirement` and `organicExcessOverRequirement` unchanged and derives no number. Design: `campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` |
| `domain/campaign-c-expert-validation.ts` (`compareExpertValidationCase`, `expertValidationCoverage`, `expertValidationCalibration`) | — | Storage shape and comparison arithmetic for the future blinded validation (`campaign-c/EXPERT_VALIDATION_PROTOCOL.md`). No tolerance or verdict is invented |

No frozen contract changed (`nutrients.ts`, `types.ts` and `slurry-whole-farm-allocation.ts`
are untouched). `contracts_frozen` stays `true`.

## CC-FU-B — slurry DM% provenance on the available-nutrient assessment (2026-10-01)

Breaking frozen-contract change, authorised by the product owner 2026-10-01
(contract-change protocol steps 1–4; `contracts_frozen` was `false` for this
change's audit cycle and was restored to `true` in its close-out commit after the clean
audit `audit-20261001T213452Z-78269`).

| Module | Change | Callers |
|---|---|---|
| `domain/nutrients.ts` | `resolveAvailableSlurryNutrients` gains a **required** `dmPctStatus: EffectiveSlurryComposition["status"]` input. An `"OK"` outcome's `evidenceState` is now `weakestEvidenceState([table/method state, DM% state])`, where the DM% state is `MEASURED` only for `verified` and `IRISH_DEFAULT` for `farmer_adjusted`/`estimated` (the `fertilityEvidence` precedent). `EffectiveSlurryComposition.status` narrowed from `DataStatus` to `"estimated" \| SlurryCompositionStatus` — exactly what `resolveEffectiveSlurryComposition` already returned — so an `"unavailable"` DM% cannot reach the resolver | `calculateNutrientPlan` (passes `effectiveSlurryComposition.status`; the unresolved-composition path still blocks before the resolver); tests only otherwise |
| `domain/evidence.ts` | Additive: `weakestEvidenceState` exported (moved unchanged from `fertiliser-plan-cost.ts`) | `fertiliser-plan-cost.ts`, `nutrients.ts` |

No value, status, reason code, fail-closed path, table or timing rule changed;
engine version stays `nutrient_engine_v1.2.0` (the protocol requires no bump
for a label-only change). Consumers of `availableNutrientAssessment`
(`slurry-direct-economic-assessment.ts`, `slurry-rate-allocation.ts`,
`what-matters-no-recommendation.ts`, `OrganicNutrientsCard`,
`fertiliser-recommendation.ts`) branch on `status`/`reasonCode`/values only;
`assessment-integrity.ts` serialises the outcome, so new audit records carry
the truthful label.

## Per-nutrient P/K Increment 1 — per-nutrient fertility evidence (2026-10-02)

Additive frozen-contract change under the protocol's non-breaking carve-out
(steps 1–3; `contracts_frozen` stays `true`). Design:
`campaign-c/PER_NUTRIENT_PK_DESIGN.md` §2 CP1 Target A, §4 row 1.

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive: `NutrientPlan.fertilityEvidenceByNutrient: { p: EngineOutcome<{ index: SoilIndex }>; k: EngineOutcome<{ index: SoilIndex }> }`. Each arm is OK when its own index exists (`MEASURED` only for a `verified` index, otherwise `IRISH_DEFAULT`); otherwise `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` listing only its own input (`fertility.pIndex` or `fertility.kIndex`) | No production reader yet. Hand-built `NutrientPlan` fixtures (`EvidenceReportPageClient.test.tsx`, `what-matters-pilot.test.ts`) gained the field without changing their assertions |
| `domain/nutrients.ts` | `calculateNutrientPlan` resolves each arm once from the tracked index and derives the paired `fertilityEvidence` from the two arms as their conjunction (private `soilIndexEvidence` / `pairedFertilityEvidence`) | — |

The paired `fertilityEvidence` and every other existing field are unchanged
(fixture-matrix digest equality against the engine at `b4d3c29`). The
Index-1 placeholder (CP3) and the paired `missingInputs` are unchanged. Engine
version stays `nutrient_engine_v1.2.0`.

## Per-nutrient P/K Increment 2 — per-nutrient slurry credit (2026-10-02)

Additive frozen-contract change under the protocol's non-breaking carve-out
(steps 1–3; `contracts_frozen` stays `true`). Design:
`campaign-c/PER_NUTRIENT_PK_DESIGN.md` §2 CP4, §4 row 2. Descoped to CP4 only
(audit F001): placeholder removal (CP3) is withdrawn and blocked on CC-B5.

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive: `NutrientPlan.organicApplication.availableNutrientByNutrient: { n; p; k }`, each `EngineOutcome<{ kgHa: number; soilIndexAdjustmentApplied?: boolean }>`. N needs no index. A known P or K arm applies only its own index's Index 1/2 factor. An unknown arm is `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` and lists only its own input. A table-level block or `NOT_APPLICABLE` is every arm's outcome. With both indices, the arms equal the paired assessment's `n`/`p`/`k` | No production reader yet. Hand-built fixtures (`EvidenceReportPageClient.test.tsx`, `what-matters-pilot.test.ts`, `OrganicNutrientsCard.test.tsx`) gained the field; their assertions are unchanged |
| `domain/nutrients.ts` | `resolveAvailableSlurryNutrients` keeps its export signature and results. Its body is now one private table selection (`selectSlurryAvailabilityTable`, no soil index) plus the paired derivation. The per-nutrient view is derived from the same selection. `applyLowSoilIndexAvailability` is split into its P and K halves; no coefficient, table or timing rule changed. `calculateNutrientPlan` keeps the internal Index-1 placeholder and every placeholder-fed computation (gross P/K, product sizing, buffer material, statutory manure value, NAP check, retained `offsetN`) exactly as at `bfdad74`; the per-nutrient view reads only the real indices | — |

Every pre-existing `NutrientPlan` field is unchanged except `calculationVersion`.
This is proven by fixture-matrix digest equality against the engine at `b4d3c29`,
plus the CC-B5 buffer regression cases.
Engine version `nutrient_engine_v1.2.0` → `nutrient_engine_v1.3.0`, because the
new view releases a new production figure for mixed fields. Stored records are
not rewritten.

## Per-nutrient P/K Increment 3 — per-nutrient gross and net requirement (2026-10-02)

Additive frozen-contract change under the protocol's non-breaking carve-out
(steps 1–3; `contracts_frozen` stays `true`). Design:
`campaign-c/PER_NUTRIENT_PK_DESIGN.md` §2 CP2 Target A, §4 row 3. Released
beside the retained internal Index-1 placeholder (product owner, 2026-10-02;
CP3 stays blocked on CC-B5) on condition that no arm carries a
placeholder-derived number.

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive: `NutrientPlan.requirementByNutrient` and `NutrientPlan.netRequirementByNutrient`, each `{ n; p; k: EngineOutcome<number> }` (kg/ha). An unknown P or K arm is `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` listing only its own input and carries no number; missing silage evidence blocks every arm (`MISSING_SILAGE_PLAN_DATA`), as it blocks `requirement`. N follows `requirement`'s rule | No production reader. Hand-built fixtures (`EvidenceReportPageClient.test.tsx`, `what-matters-pilot.test.ts`) gained the fields; their assertions are unchanged |
| `domain/nutrients.ts` | `calculateNutrientPlan`: each OK gross arm is `Math.round` of the same `grossX` local `requirement` uses, released only when that nutrient's own index exists (a known P or K gross never reads the other index). Each net arm is `Math.round(max(0, grossX − credit))` from one shared per-nutrient calculation, where the credit is the `availableNutrientByNutrient` arm (`NOT_APPLICABLE` = known zero credit); a blocked gross arm or any other non-OK credit arm (blocked, ambiguous, unsupported, unresolved composition) blocks the net arm. Never derived from the paired `offset` / `remainingX`. Evidence state: `IRISH_DEFAULT` weakened by the credit's state | — |

The legacy `requirement`, `netRequirement`, `offset`, `remainingX`,
`offsetP` / `offsetK`, product allocation, statutory and buffer computations
are unchanged; every pre-existing field equals the engine at `b4d3c29`
except `calculationVersion` (fixture-matrix digest equality, plus the CC-B5
buffer regression cases). With both indices, gross arms equal
`requirement.value` and every OK net arm equals `netRequirement.value`.
Engine version `nutrient_engine_v1.3.0` → `nutrient_engine_v1.4.0` (new
production figures for mixed fields). Stored records are not rewritten.

## Per-nutrient P/K Increment 5b — known P or K in CSV and Evidence Report (2026-10-02)

Consumer update only; no frozen `src/domain/` or `src/lib/farm-data/` module
changes. Design: `campaign-c/PER_NUTRIENT_PK_DESIGN.md` §4 row 5.

| Module | Change | Callers |
|---|---|---|
| `lib/nutrient-card-presentation.ts` | New pure export `mixedRequirementReport(plan)`: for a field with exactly one soil index (the 5a `mixed` state) the per-nutrient gross / organic offset / net from `requirementByNutrient`, `availableNutrientByNutrient`, `netRequirementByNutrient`, `null` for an unknown or withheld value (the missing nutrient in every row), plus the D3 line and provenance (`status`, `source`, the plan's `calculationVersion`, the per-nutrient evidence outcomes, slurry DM% evidence, and the `requirementProvisional` notice when the card shows it — audit F001); `undefined` otherwise. Derives no number | `lib/reports.ts`, `orchestration/scientific-evidence-report/index.ts` |
| `orchestration/scientific-evidence-report/index.ts` | Additive optional `ScientificEvidenceReport.mixedNutrientRequirement`, set only when `nutrientPlan` is absent and the field is mixed. `reportVersion` unchanged; the report has no hash or fingerprint. Fully indexed and no-index reports omit the key, so they are unchanged | `EvidenceReportPageClient.tsx` renders per-nutrient rows ("—" for null), the calculation version, the D3 line and any provisional notice; the manifest keeps the provenance |
| `lib/reports.ts` | Mixed rows: P/K requirement and organic-offset columns from `mixedRequirementReport`; unknown keeps `INSUFFICIENT_EVIDENCE` / `NOT_APPLICABLE`, never 0. Other rows and columns unchanged | — |

`promptForFertiliserRecommendation` is unchanged: its blocked basis lists only
the missing index.

## Per-nutrient P/K Increment 5b completion — slurry credit basis (CC-B6) (2026-10-02)

Additive frozen-contract change under the protocol's non-breaking carve-out
(steps 1–3; `contracts_frozen` stays `true`). Authorised by the product owner
2026-10-02. Resolves CC-B6 (`BLOCKERS.md`).

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive: `NutrientPlan.organicApplication.availableNutrientBasis: EngineOutcome<{ applicationMethod?; assumedDefault; applicationRateM3ha; dmPct; applicationDate?; timingCategory; timingAssumed; ruleId; source; scientificBasisNote }>`, same field meanings as `availableNutrientAssessment.value`. OK whenever the slurry table selection is OK, independent of the soil indices; a table-level block (method, timing, DM%, unresolved composition, conflicting methods) or `NOT_APPLICABLE` is its outcome otherwise. With both indices it equals the paired assessment's corresponding fields and evidence state | `lib/nutrient-card-presentation.ts` `mixedRequirementReport` (`evidence.availableNutrientBasis`) → Evidence Report mixed section. Hand-built fixtures (`EvidenceReportPageClient.test.tsx`, `what-matters-pilot.test.ts`, `OrganicNutrientsCard.test.tsx`) gained the field; their assertions are unchanged |
| `domain/nutrients.ts` | `calculateNutrientPlan` derives it from the same `selectSlurryAvailabilityTable` result as `availableNutrientByNutrient` and the paired assessment (private `availableSlurryNutrientBasis`); no second derivation | — |

No value, status, reason code or existing field changed (fixture-matrix digest
equality against `b4d3c29` with the new field excluded, plus the CC-B5 buffer
regression cases). Metadata only, so the engine version stays
`nutrient_engine_v1.4.0` (CC-FU-B precedent).

## Fertiliser Vertical Completion, Increment 1 — canonical per-field nutrient requirement (2026-10-02)

Additive contract change under the non-breaking carve-out (steps 1–3; `contracts_frozen` stays
`true`). **Canonical source of truth for a field's N, P and K requirement:**
`NutrientPlan.fieldRequirement` (`FieldNutrientRequirement`, `field_nutrient_requirement_v1`).

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive `FieldNutrientRequirement` / `FieldNutrientRequirementArm` and `NutrientPlan.fieldRequirement`. Per nutrient: `KNOWN` (unrounded `kgHa`, `totalKg` = kgHa × area as an `EngineOutcome`, evidence state, source, Green Book `ruleRefs`, `limitations`), `UNKNOWN` (reason code + missing inputs, no number) or `NOT_APPLICABLE` (tillage). P and K also carry their own `soilIndex` outcome. Plus `areaHa`, `cropContext` (basis, planned use, silage target-yield context, grazing stocking rate) and `engineVersion` | none yet — no production consumer reads it |
| `domain/nutrients.ts` | `calculateNutrientPlan` builds it from the same unrounded `grossX` locals as `requirement`, released only where `requirementByNutrient`'s arm is OK (own index only — never the Index-1 placeholder, CC-B5) | — |

Complete data: `Math.round(kgHa)` equals the published `requirement` for every Index 1–4
combination, grazing and silage. No existing output changed (192-case digest baseline, with the
new field excluded); engine stays `nutrient_engine_v1.4.0`.

**LEGACY_COMPATIBILITY_PATH** (paired outputs keep their behaviour; the canonical output differs):
- *Tillage* — paired `requirement` is computed from grassland tables and gated by callers
  (`isTillageField`: Nutrients page, CSV report, fertiliser prompt); canonical is `NOT_APPLICABLE`
  (`TILLAGE_FIELD_NOT_SUPPORTED`). Migration: those consumers move to the canonical arm.
- *Grazing with no usable farm grassland area* (≤ 0) — the stocking rate floors to 0, so the
  paired `requirement` carries a fabricated grazing N/P/K; canonical is `UNKNOWN`
  (`MISSING_GRASSLAND_AREA`) for all three (audit F001, `audit-20261002T181432Z-14310`).
- *Grazing with no recorded livestock* — paired `requirement` uses Table 12-3's clamped lowest
  row, gated by callers (`hasNoRecordedLivestock`); canonical is `UNKNOWN`
  (`MISSING_LIVESTOCK_DATA`). The domain mirrors that one-line rule (domain cannot import
  orchestration).
- *Mixed P/K fields* — paired `requirement` / `netRequirement` / purchasing / NAP / statutory /
  buffer stay paired; the buffer path still reads the internal placeholder (CC-B5, open).
- *Silage N* — first-cut N yield scaling stays unapplied (`N_YIELD_SCALING_NOT_APPLIED`
  limitation; supported range unverified).

Downstream consumers not yet migrated (next increments): slurry rate-allocation layer (reads
`requirementByNutrient`, unwired), remaining chemical requirement / product recommendation
(paired `netRequirement`, `allocatePurchasedProducts`), farm fertiliser aggregation
(`getFarmFertiliserDemand`), quote basket, CSV report, Evidence Report, fertiliser prompt.

Increment 2 design (slurry recommendation / allocation consuming `fieldRequirement`, the
canonical remaining chemical requirement, staged plan and open decisions):
[FERTILISER_VERTICAL_SLURRY_DESIGN.md](FERTILISER_VERTICAL_SLURRY_DESIGN.md). Design only;
no contract changed.

## Fertiliser Vertical Completion, Increment 2b — canonical remaining chemical requirement (2026-10-02)

Additive contract change under the non-breaking carve-out (steps 1–3; `contracts_frozen` stays
`true`). **Canonical source of truth for a field's remaining chemical N, P and K requirement:**
`NutrientPlan.fieldRemainingRequirement` (`FieldNutrientRemainingRequirement`,
`field_nutrient_remaining_v1`), design §2.1.

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive `FieldNutrientRemainingRequirement` / `FieldNutrientRemainingArm` and `NutrientPlan.fieldRemainingRequirement`. Per nutrient: `KNOWN` (unrounded `kgHa` = max(0, requirement − credit), `totalKg` = kgHa × area as an `EngineOutcome`, `requirementKgHa`, `creditKgHa`, `creditBasis` `NO_SLURRY_PLANNED` / `SLURRY_CREDIT`, evidence state), `UNKNOWN` (reason code, missing inputs, `cause` `REQUIREMENT_UNKNOWN` / `SLURRY_CREDIT_UNKNOWN`, no number) or `NOT_APPLICABLE` (follows the requirement arm, tillage). Plus `requirementContractVersion`, `engineVersion`, `fieldId`, `areaHa` | none yet — no production consumer reads it |
| `domain/nutrients.ts` | `calculateNutrientPlan` builds it once (`buildFieldNutrientRemainingRequirement`) from `fieldRequirement`'s arms and `organicApplication.availableNutrientByNutrient`. Credit `NOT_APPLICABLE` (no slurry planned) is a known zero credit, as in `netRequirementByNutrient`; any other non-OK credit is `UNKNOWN`, never 0. Evidence state is the weakest of requirement and credit (`weakestEvidenceState`); `MISSING_FIELD_AREA` total as `fieldRequirement`. No table selection, availability factor or gross requirement is re-derived | — |

Where the requirement arm is `KNOWN` and the `netRequirementByNutrient` arm is OK,
`Math.round(kgHa)` equals it for every Index 1–4 combination, grazing and silage, with no slurry,
splashplate, spring/summer LESS and the assumed default method. The organic excess
(credit − requirement) is not encoded here; it is the allocation layer's figure (design §2.2). No
existing output changed (192-case digest baseline with the new field excluded; CC-B5 buffer
regression cases); engine stays `nutrient_engine_v1.4.0` (design D8, Increment 1 precedent).
The LEGACY_COMPATIBILITY_PATHs listed for Increment 1 are unchanged: the paired `netRequirement`
and `allocatePurchasedProducts` still read the paired remaining figures until Increment 2e.

## Fertiliser Vertical Completion, Session 2b — canonical product recommendation (2026-10-03)

**Breaking** frozen-contract change (full 4-step protocol): `contracts_frozen` was `false` for this
change's audit cycle and was restored to `true` by the close-out commit after the clean final
audit `audit-20261003T074523Z-23978` (`2a24b10..ac50e14`, 0/0/0/0). Engine
`nutrient_engine_v1.4.0` → `nutrient_engine_v1.5.0`; stored records are not rewritten. Design
§3 row 2e (products part) with product-owner decisions of 2026-10-03: D3 option (a); legacy
tillage / no-livestock / no-grassland-area purchase figures retired; D2 not authorised; D4 /
CC-B5 statutory buffer behaviour unchanged.

| Module | Change | Callers |
|---|---|---|
| `domain/types.ts` | Additive `FieldPurchaseStatus` and required `NutrientPlan.purchaseStatus`: `RECOMMENDED`; `RECOMMENDED_CREDIT_NOT_COUNTED` (reason, inputs; provisional); `NONE_NEEDED` (`REMAINING_ZERO` / `BELOW_PRODUCT_THRESHOLD`); `PROHIBITED` (`COMMONAGE_…` / `WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED`); `WITHHELD_MIXED_EVIDENCE`; `UNKNOWN` (reason, inputs); `NOT_APPLICABLE` (reason). Products exist only for the two `RECOMMENDED*` statuses | every consumer below |
| `domain/nutrients.ts` | `calculateNutrientPlan` publishes `purchasedProducts` / `deliveredKgHa` / `estimatedFieldCostEur` from `buildFieldPurchase`: all three `fieldRequirement` arms KNOWN and remaining arms KNOWN → `allocatePurchasedProducts` on the unrounded remaining arms; remaining unknown only for a table-level slurry-credit block → on the full requirement arms (the paired path's no-credit figure); unresolved composition → `UNKNOWN`; requirement `NOT_APPLICABLE` / `UNKNOWN` → none (mixed P/K → `WITHHELD_MIXED_EVIDENCE`). Commonage → `PROHIBITED` whatever the requirement; a water-buffer prohibition suppresses a sized blend. `allocatePurchasedProducts`, catalogue, prices, credit and requirement unchanged | — |
| `orchestration/prompt/fertiliser-recommendation.ts` | Basis from `purchaseStatus` (`NONE_NEEDED` / `PROHIBITED` → `NO_FERTILISER_CURRENTLY_RECOMMENDED`; `UNKNOWN` / `WITHHELD` → blocked with their reason; composition keeps its assessment outcome). `FertiliserRecommendationSummary` gains additive optional `provisional` | `build-all.ts`, `recompute.ts`, `fertiliser-plan/index.ts`, `NutrientsPageClient.tsx` |
| `domain/finance.ts` | Farm requirement and slurry value count `UNKNOWN` / `WITHHELD` as blocked, skip `NOT_APPLICABLE` | Finance / Input Planner |
| `domain/fertiliser-plan.ts` | `aggregateFarmFertiliserRecommendation(plans: Pick<NutrientPlan, "purchasedProducts" \| "purchaseStatus">[])` sums only `RECOMMENDED*` plans | `getFarmFertiliserDemand` |
| `domain/slurry-direct-economic-assessment.ts` | New block `ECONOMIC_SLURRY_ASSESSMENT_PURCHASE_NOT_RECOMMENDABLE` when either plan's purchase is `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` | What Matters pilot |
| `lib/reports.ts`, `orchestration/scientific-evidence-report/index.ts`, `EvidenceReportPageClient.tsx`, `PurchasedFertiliserCard.tsx` (new required `purchaseStatus` prop), `NutrientsPageClient.tsx` | Read the status through the pure `lib/purchase-status-presentation.ts`; never present `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` as nothing needed; credit-not-counted shown as provisional | — |

Fully indexed grassland fields keep identical products, delivered supply and cost (192-case digest
with `purchaseStatus` excluded and v1.5.0 normalised; NAP delivered-total equality and
no-credit equality in `nutrients.purchase-status.test.ts`). **LEGACY_COMPATIBILITY_PATH:** the
paired blend from `remainingX` is still computed internally and decides only the national buffer
material (CC-B5) and the NAP delivered-supply total, so every statutory / NAP / buffer output is
unchanged, including for tillage, no-livestock and mixed fields whose published products are now
empty. The paired `requirement` / `netRequirement` keep their legacy behaviour. Full list of
changed production outputs: `IMPLEMENTATION_LOG.md` (Session 2b).

## Fertiliser Vertical Completion, Session 3b — canonical farm aggregation and quote basket (2026-10-03)

Additive frozen-contract change (`finance.ts`); `contracts_frozen` was `false` for this change's audit
cycle and was restored to `true` by the close-out commit after the clean final audit
`audit-20261005T185737Z-56534` (`cd9b315..ce1d3c9`, 0/0/0/0). No nutrient science,
product selection, price, statutory, NAP, buffer or schema change; engine `nutrient_engine_v1.5.0`.

| Module | Change | Callers |
|---|---|---|
| `domain/fertiliser-plan.ts` | New canonical `aggregateFarmFertiliserPurchasing(FarmFertiliserAggregationFieldInput[]) → FarmFertiliserAggregation` (`farm_fertiliser_aggregation_v1.0.0`) over field `purchaseStatus` + `purchasedProducts` only: INCLUDED (`RECOMMENDED`, `RECOMMENDED_CREDIT_NOT_COUNTED` provisional), NO_PURCHASE (`NONE_NEEDED`), EXCLUDED (`PROHIBITED`, `NOT_APPLICABLE`), UNRESOLVED (`UNKNOWN`, `WITHHELD_MIXED_EVIDENCE`, malformed sized blend). Products keyed `name\|npkAnalysis`, exact kg sums, field contributions, `null` (never €0) for an unknown price, bag conversion `UNAVAILABLE`, display tonnes rounded up (`roundKgUpToDisplayTonnes`). Status `READY` / `READY_WITH_PROVISIONAL_ITEMS` / `INCOMPLETE`. New `buildFarmFertiliserQuoteBasket(aggregation, {farmId, createdAt}) → FarmFertiliserQuoteBasket` (`farm_fertiliser_quote_basket_v1.0.0`, review only, not persisted). `toFarmFertiliserProductTotals`; `aggregateFarmFertiliserRecommendation` (signature unchanged) is now a view of the canonical aggregation | below |
| `domain/finance.ts` | `calculateFarmFertiliserRequirement` sums through the canonical aggregation (unresolved fields add to `fieldsWithBlockedEvidence`; same figures); `FarmFertiliserRequirement` gains required `provisionalFieldCount` | Input Planner, Dashboard, Finance, `InputSummaryCard` |
| `orchestration/fertiliser-plan/index.ts` | `getFarmFertiliserDemand` takes optional `slurryCompositionRecords` (resolved per field as `recomputePromptByKind`), builds plans for every field, returns `aggregation`; `demand`'s recommended column is `toFarmFertiliserProductTotals(aggregation)` | demand action, AI context |
| `app/actions/fertiliser-plan.ts` | `FarmFertiliserDemandActionResult` gains `aggregation` and `basket`; reads recorded slurry composition | Nutrients card, quote prefill (unchanged use) |

Retained, unchanged: planned / confirmed / remaining product totals, Prompt-based
`fieldsWithBlockedEvidence`, `toFarmFertiliserPurchaseRequirementTonnes` (nearest 0.01 t),
quote-request prefill, `calculateFarmSlurryNutrientValueEur`. No supplier, email, RFQ, payment or
marketplace behaviour. Detail: `IMPLEMENTATION_LOG.md` (Session 3b).

## Fertiliser Vertical Completion, Session 4 — fertiliser quote request (2026-10-05)

New module plus one additive export on a frozen module (`supplier-quotes.ts`);
`contracts_frozen` was `false` for this change's audit cycle and was restored to `true` by the
close-out commit after the final audit `audit-20261006T070039Z-89410` (`1e92b1e..0cadec0`,
0 Critical / 0 High). No nutrient science, slurry,
product selection, aggregation, price, statutory or schema change; engine
`nutrient_engine_v1.5.0`. The scientific calculation ends at `FarmFertiliserQuoteBasket`; the
quote request is the commercial layer on top of it.

| Module | Change | Callers |
|---|---|---|
| `domain/fertiliser-quote-request.ts` (new) | `createFertiliserQuoteRequestDraft(basket, {requestId, createdAt}) → FertiliserQuoteResult<FertiliserQuoteRequest>` (`fertiliser_quote_request_v1.0.0`) copies basket lines verbatim: per line `canonicalQuantityKg` / `canonicalDisplayTonnes` (never edited) and a separate `requestedTonnes` / `requestedQuantityKg` (starts at the basket's 0.01 t round-up; `requestedBelowCanonical` discloses a farmer reduction), identity `name` + `npkAnalysis` (no catalogue id), `estimatedCostEur` (basket estimate for the canonical quantity, `null` never €0, `costBasis: "ESTIMATE"`), `provisional`. Request carries basket/aggregation/engine versions, `basketStatus`, `isCompleteFarmRequirement`, `unresolvedFields`, `unsupportedProducts`, `coverage` (`WHOLE_FARM` / `WHOLE_FARM_PROVISIONAL` / `PARTIAL` for an INCOMPLETE basket), `details` (recipients, delivery location, optional delivery window via `validateQuoteDeliveryWindow`, contact, farmer note), `readyAt`, `cancelledAt`, `deliveryAttempts`. `setRequestedQuantity`, `setQuoteRequestDetails` (both return a new request, edits drop back to DRAFT), `parseRequestedTonnes` (positive, ≤ 0.01 t precision), `fertiliserQuoteRequestIssues`, `markFertiliserQuoteRequestReady` (DRAFT → READY_TO_SEND; delivery location and contact required; idempotent), `recordFertiliserQuoteDeliveryAttempt` (provider-neutral; SENT only for a SUCCEEDED attempt with a provider reference to a listed recipient; FAILED retryable; SENT terminal), `cancelFertiliserQuoteRequest`, `renderFertiliserQuoteRequestText` (deterministic supplier text; no price, field, recipient contact or version). `FERTILISER_QUOTE_DELIVERY_CAPABILITY` = `UNAVAILABLE` / `NO_SUPPLIER_DELIVERY_INTEGRATION` | `FertiliserQuoteRequestFlow`, `FarmFertiliserPurchaseRequirementCard` |
| `lib/fertiliser-quote-request-presentation.ts` (new) | Status / coverage / issue wording, truthful submit label ("Prepare quote request" while delivery is unavailable), delivery prefill from `farm_delivery_details` | `FertiliserQuoteRequestFlow` |
| `lib/farm-data/supplier-quotes.ts` | Additive `listSupplierNamesForFarm(farmId)` — distinct supplier names from the farm's recorded quotes (names only) | `listKnownSupplierNamesAction` |
| `app/actions/quote-requests.ts` | Additive `listKnownSupplierNamesAction()` (farm resolved server-side) | `FertiliserQuoteRequestFlow` |
| `components/farm/FertiliserQuoteRequestFlow.tsx` (new), `FarmFertiliserPurchaseRequirementCard.tsx` | "Prepare quote" creates one DRAFT (stable `crypto.randomUUID()` id, held in the card for the basket's life) and opens: 1 review requirement (canonical vs requested t, provisional, estimated cost), 2 quote details (suppliers from recorded quotes or typed, delivery location/window, contact, note), 3 final review of the exact supplier text → "Prepare quote request" → READY_TO_SEND (action removed once ready; cancel available) | Nutrients page |

**Partial policy.** An INCOMPLETE basket may proceed only as an explicitly partial request: the
request keeps `basketStatus: "INCOMPLETE"`, `isCompleteFarmRequirement: false` and the unresolved
fields, the UI labels it "Partial request" naming those fields, and the supplier text is headed
"(partial)" and states it covers only part of the farm's requirement. A provisional basket is
labelled provisional to the farmer and the supplier.

**Delivery and persistence boundary.** No email provider, supplier API, RFQ or webhook boundary
exists; Farm Return contacts no supplier and nothing is marked SENT. The farmer copies the final
text and sends it themselves. The request is not persisted (client session only; lost on reload).
The Managed Quote Pilot (`quote_requests`, one product per request to the operator inbox) is not
reused: its "estimated" provenance is tied to `FarmInputDemand`, not the basket, and bridging it
needs a schema decision. Next: durable persistence and a real delivery provider, each separately
authorised; `recordFertiliserQuoteDeliveryAttempt` is the boundary a provider would call.

## Fertiliser Vertical v1 freeze — Session 5 end-to-end QA (2026-10-06)

`FERTILISER_VERTICAL_V1: COMPLETE` (closure: `FERTILISER_VERTICAL_SLURRY_DESIGN.md` §9). No
frozen-contract change: every canonical contract above is unchanged — `nutrient_engine_v1.5.0`,
`farm_fertiliser_aggregation_v1.0.0`, `farm_fertiliser_quote_basket_v1.0.0`,
`fertiliser_quote_request_v1.0.0`. The end-to-end invariants are pinned in
`src/domain/fertiliser-vertical.e2e.test.ts`.

| Module | Change | Callers |
|---|---|---|
| `lib/purchase-status-presentation.ts` | Additive `nothingToBuyMessage(FieldPurchaseStatus) → string \| null` — NONE_NEEDED / PROHIBITED wording, shared by the farm field groups (`farm-fertiliser-basket-presentation.ts`, same text) and the field card | `PurchasedFertiliserCard`, `farmFieldGroups` |
| `components/farm/PurchasedFertiliserCard.tsx` | NONE_NEEDED / PROHIBITED render their reason, never an empty table with €0 | Nutrients page |
| `components/farm/FertiliserQuoteRequestFlow.tsx` | Quote-details form state held by the flow (Session 4 F002); UI state only, not persisted | `FarmFertiliserPurchaseRequirementCard` (keys the flow by `requestId`) |

Legacy compatibility paths (classified in §9 of the design): NAP delivered-supply blend, paired
`requirement` / `netRequirement` and `toFarmFertiliserProductTotals` are REQUIRED_COMPATIBILITY;
CC-B5, D3, D2 and CC-B3 are BLOCKED_BY_FUTURE_DECISION; `aggregateFarmFertiliserRecommendation`
has no production caller and is retained until a separately authorised frozen-contract cleanup.

## Plan Operating System v1, Phase 0 — Plan kernel (2026-10-09)

New, **non-frozen** pure modules under `src/domain/plan/` (barrel `index.ts`), kernel version
`plan_kernel_v0.1.0`. Campaign contract: `.agent/campaigns/plan-operating-system-v1/CAMPAIGN.md`.
No frozen-contract change, no persistence, schema, migration, UI, workflow, economics or
scientific/regulatory value. Reuses `subject.ts` (`SubjectRef`), `iso-datetime.ts`
(`isValidIsoUtcDateTime`) and `source-register.ts` (`SourceId`) unchanged. Plan holds intent and
work state only; it stores `SubjectRef`s, never canonical facts. The persisted Act `jobs` table
(`lib/farm-data/mappers.ts` `JobRecord`/`JobStatus`) and GPS `job-session-*` are unrelated and
untouched; no mapping between them is defined in Phase 0.

| Module | Contract |
|---|---|
| `goal.ts` | `PlanGoal` (farmer outcome text, status, subject refs — no numeric target), `PlanProgramme` |
| `scope.ts` | `TargetScope` = `STATIC` members \| `DYNAMIC` `MEMBERS_OF` selector with addition policy `ABSORB_INTO_JOB` / `FOLLOW_ON_WORK`. `resolveScope` against supplied `ScopeReality`: removed members always leave; UNKNOWN membership keeps last members and reports UNKNOWN (never empty) |
| `completion.ts` | `CompletionContract` union `DATA_COMPLETION` / `OPERATIONAL_RECORD` / `DECISION` / `MANUAL`; `CanonicalEvidence` input; `evaluateCompletion` → state (`COMPLETE`/`PARTIAL`/`NOT_STARTED`/`UNKNOWN`/`NO_TARGETS`/`NOT_EVIDENCE_LINKED`) and `PlanProgress` (`MEMBER_COUNT` with separate missing/unknown, `NOT_MEASURABLE`, `UNKNOWN`). Unsupplied evidence or unlisted members are UNKNOWN, never zero |
| `status.ts` | `PlanJobStatus` lifecycle `PROPOSED`/`PLANNED`/`IN_PROGRESS`/`COMPLETED`/`OBSOLETE`/`CANCELLED` and legal transition table |
| `readiness.ts` | `deriveReadiness` → `ReadinessState` + every `ReadinessReason`; precedence CLOSED > dependency > legal window > weather > input > other blocker > UPCOMING > NEEDS_ATTENTION > READY. Only COMPLETED satisfies a dependency; unknown jobs/blockers and UNKNOWN blockers fail closed |
| `dependencies.ts` | `JobDependencies` (job ids + shared blocker ids), `PlanBlocker` (WEATHER/LEGAL_WINDOW/INPUT/OTHER; ACTIVE/CLEARED/UNKNOWN), `jobsAffectedByBlocker` |
| `timing.ts` | `RecommendedWindow` and `HardDeadline` distinct kinds; a hard deadline requires a `HardDeadlineAuthority` (`REGISTERED_SOURCE` `SourceId`, farmer-confirmed commitment or canonical record). No dates defined |
| `priority.ts` | `SystemPriorityTier` hierarchy `HARD_OBLIGATION` > `AVOID_MATERIAL_LOSS` > `EXPECTED_NET_RETURN` > `INFORMATION_VALUE`; tier comparison only, no scores |
| `farmer-order.ts` | `FarmerWorkingOrder`; `moveInFarmerOrder` (audited), `reconcileFarmerOrder` (keeps existing positions, appends newcomers), `sortByFarmerOrder`. Priority changes never reorder existing positions |
| `override.ts` | `PlanDeferral` (`SNOOZE`/`DEFER`, audited, readiness unchanged); `farmerCompleteJob`: MANUAL completes directly; an evidence-linked job with incomplete canonical evidence needs explicit acknowledgement and records `FarmerCompletionOverride` with canonical state, missing and unknown members |
| `action-route.ts` | `PlanActionRoute` (`LIVESTOCK_GROUP`, `FIELD_SOIL_SAMPLE`, `FIELD_NUTRIENT_PLAN`, `NONE`) and `actionRouteHref` to existing routes only |
| `job.ts` | `PlanJob`, `PlanCreationSource` (Farm Return routine/seasonal/data-gap/programme, adviser-approved, farmer manual, follow-on), `createPlanJob`, `transitionJobStatus`, `setJobDependencies`, `setSystemPriority`, `planJobIdentityKey` (action + scope + window dedup identity), `addSupportingReason` |
| `audit.ts` | `PlanAuditEvent` union (created, status, readiness, scope, dependency, progress, completed, farmer override, deferral set/cleared, farmer order, system priority, follow-on proposed), each with job id, explicit instant and kernel version |
| `reevaluate.ts` | `reevaluatePlanJob(job, context)` — pure: scope → OBSOLETE on empty known scope → canonical completion (auto-complete, PARTIAL → IN_PROGRESS) → readiness; returns updated job, evaluations, audit events and an optional `PlanFollowOnProposal`. Closed jobs still report canonical completion |

Tests: `src/domain/plan/*.test.ts` (fixture `test-fixtures.ts`, generic subjects only).

## Cattle C0 — Evidence, rule & regulatory architecture (2026-10-09)

New, **non-frozen** pure modules under `src/domain/cattle/` (barrel `index.ts`), architecture
version `cattle_evidence_v0.1.0`, integrity payload version 1. Campaign contract:
`.agent/campaigns/cattle-engine-v1/CAMPAIGN.md`. Infrastructure only: no cattle science, law,
veterinary rule, persistence, schema, migration, UI or AI call; tests use fictional `SYNTH-*`
fixtures. No frozen-contract change.

**Reuse decisions.** Canonicalisation and fingerprinting reuse `assessment-integrity.ts`'s
`canonicalizeValue`/`computeAssessmentFingerprint`/`verifyAssessmentFingerprint` unchanged
(sorted keys, preserved array order, fail-closed on `undefined`/NaN/class instances, caller-
supplied SHA-256 `hash`, digest-shape check). Cattle payloads are wrapped with a `kind`
(`CATTLE_SOURCE_MATERIAL`/`CATTLE_RULE_DEFINITION`/`CATTLE_EVIDENCE_PACK`) and payload version,
so they never collide with each other or with assessment fingerprints. `audit-trace.ts`'s
`canonicalSha256` was not used: it drops `undefined` and coerces NaN silently. `evidence.ts`'s
`EngineOutcome`/`EvidenceState` describe calculated-value strength and lack rule pass/fail,
conflicting evidence, review-required and unsupported states, so cattle rules use their own
`CattleEvaluationState` instead of a lossy mapping. `source-register.ts`'s closed `SourceId`
register is unchanged; a cattle source may link to it via `registeredSourceId`. Dates reuse
`iso-datetime.ts`.

| Module | Contract |
|---|---|
| `source.ts` | `CattleEvidenceSource` (stable id, publisher, `CattleSourceAuthorityKind`, jurisdiction/context, version, content fingerprint, retrieved/checked, lifecycle `ACTIVE`/`HISTORICAL`/`SUPERSEDED`/`REVIEW_REQUIRED`); `SourceVersionRef`; `computeSourceContentFingerprint`; `checkSourceBinding` → `CURRENT` only on exact id+version+fingerprint with one ACTIVE entry, otherwise a change/review status; `findSourceVersion` exact historical lookup |
| `information.ts` | `CattleInformationClass` (FACT/OBSERVATION/INTENT/RULE/DERIVED_VALUE/PREDICTION/OBLIGATION_OR_CONSTRAINT/RECOMMENDATION), `ProvenanceRef`, `CattleInputItem`, `RequiredInputDescriptor` (accepted classes + unit); `resolveInput` → KNOWN / MISSING / CONFLICTING (no winner chosen); wrong class or unit rejected, never converted |
| `rule.ts` | `CattleRuleVersion` (id, integer version, classification, `HARD_GATE`/`ADVISORY` role, jurisdiction, `[effectiveFrom, effectiveTo)`, applicability, required inputs, assumptions, limitations, fail-closed `UnknownConflictPolicy`, source bindings, versioned `implementation` identity (`RuleImplementationRef`), supersession, required review dimensions, production state); `computeRuleFingerprint` (all content except `productionState`); `validateRuleVersion` (classification minimum review dimension, legal ⇒ hard gate, intent/inference ⇒ never hard gate, source authority must suit classification — advisory science cannot ground a legal rule); `resolveEffectiveRuleVersion` (PRODUCTION/SUPERSEDED only; a successor transitively excludes every ancestor, walked through the complete PRODUCTION/SUPERSEDED history so an expired intermediate still links the chain; a missing/unreleased/duplicated/cross-rule/non-decreasing/cyclic link reachable from an effective candidate ⇒ `INVALID_SUPERSESSION_LINEAGE`; none ⇒ `NO_EFFECTIVE_VERSION`, several ⇒ `AMBIGUOUS_EFFECTIVE_VERSIONS`); `getRuleVersion`; `RuleReviewRecord`/`evaluateRuleReviews` — SCIENTIFIC/LEGAL/VETERINARY judged separately, bound to rule id + version + fingerprint, latest wins, tie ⇒ REJECTED |
| `evaluation.ts` | `CattleEvaluationState` PASS/FAIL/INSUFFICIENT_EVIDENCE/NOT_APPLICABLE/CONFLICTING_EVIDENCE/UNSUPPORTED/REVIEW_REQUIRED; `CattleRuleImplementation` (predicate + id + version); `computeImplementationLogicFingerprint`/`implementationRef` (id + version + predicate source text, `CATTLE_RULE_IMPLEMENTATION` kind; native/bound source ⇒ `null`, never bindable) — `RuleImplementationRef.logicFingerprint` is rule content, so approval binds the exact logic and predicates must be self-contained (captured scope is not bound); `evaluateCattleRule` (captures the supplied implementation once into a frozen snapshot — the same captured predicate reference is identity-checked, fingerprinted, recorded and executed, and the caller's object is never re-read; source-text fingerprinting is deterministic content binding only, not a signature, provenance proof or tamper resistance; precedence UNSUPPORTED (incl. implementation identity or recomputed logic fingerprint ≠ rule's bound `implementation`) > REVIEW_REQUIRED (non-production, unapproved version, any non-CURRENT source) > applicability > required inputs > predicate; predicate sees KNOWN values only); `evaluateEffectiveCattleRule` (unresolvable, incl. invalid lineage ⇒ UNSUPPORTED record with `rule: null` and the lineage issue codes); `RuleEvaluationRecord` binds exact version, rule fingerprint, implementation identity, source checks and reviews, and holds deep copies only (no caller aliasing) |
| `evidence-pack.ts` | `RecommendationEvidencePack`; `buildRecommendationEvidencePack` derives hard-gate outcomes and outcome (FAIL ⇒ `BLOCKED`, review ⇒ `REVIEW_REQUIRED`, unknown/conflict/unsupported/not evaluated ⇒ `INSUFFICIENT_EVIDENCE`, no proposal ⇒ `NO_RECOMMENDATION`, else `ACTIONABLE`); `actionableActionId` only when ACTIONABLE; favourability never consulted; invalid structure reported not repaired; fingerprint excludes only `generatedAt`; `verifyRecommendationEvidencePack` checks stored fingerprint and rebuild consistency |
| `integrity.ts` | `computeCattleFingerprint`/`verifyCattleFingerprint` wrappers, `sameFingerprint` |

Known limitations: a pack trusts the supplied `RuleEvaluationRecord`s (verification cannot
re-run rule predicates); pack `inputs` are not cross-checked against each record's `usedInputs`;
source-change detection compares against the supplied catalogue only (no connector); the
fingerprint is change detection, not a signature. Tests: `src/domain/cattle/*.test.ts`.

## Cattle C1 — Canonical animal lifecycle (2026-10-09)

C0 is **frozen** at its accepted semantics (`61c1124`); C1 changes no C0 file except additive
barrel exports in `src/domain/cattle/index.ts`. New, **non-frozen** pure modules
`animal-ledger.ts`, `animal-snapshot.ts`, `animal-register.ts`; tests `animal.test.ts`
(synthetic `SYNTH-*` data). No persistence, schema, migration, UI, connector, legal, veterinary
or scientific rule.

**Ownership.** Cattle owns canonical animal truth; Plan/Adviser/Finance/integrations consume a
projected `AnimalSnapshot` and never hold competing animal state.

**Identity.** `FarmReturnAnimalId` (opaque, immutable) is the only primary identity; species is
`BOVINE`. External identifiers are dated `EXTERNAL_IDENTIFIER` assertions (opaque `scheme` +
exact `identifier`; no tag-format rule, no normalisation). A changed identifier never creates an
animal and an old one is never erased (`externalIdentifiers.history`).

**Information boundary.** The ledger holds facts and observations of state only:
`DATE_OF_BIRTH` (calendar date), `SEX` (biological `FEMALE`/`MALE` only — no production class),
`BREED` (source code-system/code/label plus verbatim composite components — no breed enum, no
inferred genetics), `EXTERNAL_IDENTIFIER`, `LOCATION` (opaque `HOLDING`/`FIELD`/`HOUSING`/
`EXTERNAL`/`OTHER` ref), `MANAGEMENT_GROUP` (opaque ref), `LIFECYCLE_STATUS` (neutral
`PRESENT`/`DEPARTED`/`DECEASED`; no legal meaning). A fact `value: null` records a
source-reported unknown.

**Operational provenance** (`AnimalDataProvenance`, distinct from C0 `CattleEvidenceSource`):
source category (`OFFICIAL_REGISTRY`, `BREEDING_PERFORMANCE_DATABASE`, `FARMER`,
`VETERINARY_SOURCE`, `DEVICE`, `EXTERNAL_FARM_SOFTWARE`, `MART_MARKET`, `PROCESSOR`, `OTHER` —
none implies a connected integration), opaque source system/record ref/actor, optional
`observedAt`, required `receivedAt`. Assertion id and `supersedes` sit on the assertion.

**Bitemporal.** `receivedAt` is knowledge time; `validFrom`/`validTo` (inclusive start,
exclusive end; `null` = open) is valid time. `projectAnimalSnapshot(ledger, {effectiveAt,
knowledgeCutoff})` requires both explicitly — no clock read. Only assertions with `receivedAt <=
knowledgeCutoff`, and only supersessions known by then, exist for the projection, so a snapshot
built at an earlier cutoff is reproducible after later corrections. Interval kinds apply at
`effectiveAt`; DOB/sex/breed are not interval-scoped. Times are strict UTC strings compared via
a fixed-width key, `animalInstantKey` (no `Date` objects). Instant-typed fields (`validFrom`,
`validTo`, `provenance.receivedAt`, `provenance.observedAt`) compare by instant, so `…:00Z` and
`…:00.000Z` are equal in duplicate-id and correction-competition comparison; stored assertions,
evidence and history keep the original spelling. DOB is a calendar date and every non-instant
field compares exactly.

**Append-only / supersession.** A correction is a new assertion whose `supersedes` lists earlier
same-kind assertion ids; nothing is deleted. Same id + identical content (instants compared as
instants) is idempotent — one original spelling is kept, chosen independently of input order,
and append never rewrites a stored assertion's spelling; same id + different content (incl.
provenance) fails the build. Self-supersession is rejected at
ingestion; at projection a target not known by the cutoff, a cross-kind link (taints both
dimensions) or a cycle ⇒ `INVALID_EVIDENCE` (fail closed); several live corrections of one
target with different content ⇒ `CONFLICTING_EVIDENCE`. Each correction branch is followed
through corrections-of-corrections to its live terminal descendants (bounded, visited-set
traversal of known-by-cutoff links), and those terminals are what compete, so superseding one
side of a competition never detaches it from the other. The competition ends only when the
terminals agree in content or one correction supersedes every branch; the chain stays in
history. For interval kinds only terminals effective at `effectiveAt` compete, so a
competition confined to another period stays in history (`supersededBy`) but never
contaminates an unrelated snapshot; DOB/sex/breed compare every live terminal.

**Resolution.** Each dimension (per scheme for identifiers) is `KNOWN` / `UNKNOWN` /
`CONFLICTING_EVIDENCE` / `INVALID_EVIDENCE` with evidence (full assertions + provenance),
superseded ids and issue codes. Absence ⇒ `UNKNOWN` (never a default; missing location is not
the home farm). Agreeing active assertions stay `KNOWN` with every source; differing active
values ⇒ `CONFLICTING_EVIDENCE` with no winner — no source precedence, never latest-wins. Any
two distinct overlapping locations (no hierarchy is modelled in C1), groups, lifecycle statuses
or identifiers within one scheme conflict.

**Determinism / aliasing.** Input is `structuredClone`d once per item (getters read once;
proxies/functions rejected as not cloneable), validated, rebuilt from known fields and
deep-frozen; ledgers are sorted by assertion id. Projection, history and append re-materialise
the supplied ledger via `rematerialiseAnimalLedger` (header read once; a hand-built ledger is
re-validated) and projection returns a detached deep-frozen snapshot; input order never changes
the result. Only a supported C1 header is accepted: `species` other than `BOVINE` ⇒
`CATTLE_ANIMAL_UNSUPPORTED_SPECIES` (never coerced), `ledgerSchemaVersion` other than 1 ⇒
`CATTLE_ANIMAL_UNSUPPORTED_LEDGER_SCHEMA_VERSION` (never read as current), a non-object or
mistyped header ⇒ `CATTLE_ANIMAL_MALFORMED_LEDGER_HEADER`; all fail closed.

**Snapshot fingerprint.** `computeAnimalSnapshotFingerprint`/`verifyAnimalSnapshotFingerprint`
reuse `assessment-integrity.ts` canonicalisation and SHA-256 pipeline unchanged over `{kind:
"CATTLE_ANIMAL_SNAPSHOT", animalSnapshotPayloadVersion: 1, payload: snapshot}` — a distinct
wrapper from C0's `{kind, cattlePayloadVersion, payload}`, so no collision and no C0/slurry/
fertiliser fingerprint change. The whole snapshot is bound (schema version, `effectiveAt`,
`knowledgeCutoff`, known assertion ids, states, values, evidence/provenance, issues). Change
detection only — not a digital signature. A C0 evidence pack can bind it via
`targetScope.snapshotRef`.

**Register.** `checkExternalIdentifierRegister(ledgers, query)` reports two different animals
claiming the same scheme+identifier in valid time at the query (both kept, never merged);
non-overlapping historical reuse is not a conflict; invalid identifier evidence, invalid
ledgers, duplicate animal ledgers and invalid query times are issues (`clear: false`).

**Exclusions.** No weights, growth, condition scoring, breeding/fertility, health/disease,
medicines, feed, economics, goals or advice; no registration/movement/disease rules; no
AIM/ICBF/NVPS/HPRA connector or field; no persistence or UI.

## Cattle C2 — Regulatory lifecycle engine (2026-10-11)

C0 (`61c1124`) and C1 (`c5b25f2`) are **frozen**; C2 changes no C0/C1 file except one additive
`export * from "./regulatory";` line in `src/domain/cattle/index.ts`. New, **non-frozen** pure
modules under `src/domain/cattle/regulatory/` (barrel `regulatory/index.ts`); tests
`regulatory/obligation.test.ts` (synthetic `SYNTH-*` rules, sources, windows and animals only).
Engine, contracts and interfaces only: **no real legal, scheme, veterinary or welfare duty,
deadline, window length or interpretation**; no persistence, schema, migration, UI, AI,
network or connector. `PRODUCTION_OBLIGATION_CATALOGUE` is **empty** — real content must
arrive through a separately authorised, evidence-reviewed task using the C0
source/rule/review lifecycle.

**Reuse decisions.** Rule identity, classification, gate role, applicability, required inputs,
effective period `[effectiveFrom, effectiveTo)`, supersession, reviews, production state and
source currency stay on the C0 `CattleRuleVersion` and are evaluated only through C0
(`resolveEffectiveRuleVersion`, `evaluateEffectiveCattleRule`, `evaluateCattleRule`,
`checkSourceBinding` via evaluation) — never copied or re-implemented. Animal state comes only
from C1 (`rematerialiseAnimalLedger`, `projectAnimalSnapshot`, `animalAssertionHistory`,
`computeAnimalSnapshotFingerprint`, `compareInstants`/`animalInstantKey`,
`deepFreezeAnimalValue`). Fingerprints reuse `assessment-integrity.ts` canonicalisation and
SHA-256 unchanged; because C0's `CattleFingerprintKind` is a closed union in frozen
`integrity.ts`, C2 follows C1's precedent and wraps as `{kind, obligationPayloadVersion: 1,
payload}` with new kinds `CATTLE_OBLIGATION_TERMS` and `CATTLE_OBLIGATION_STATE` — distinct from
C0's and C1's wrappers, so no existing kind, payload version or canonicalisation changes. C1's
provenance materialiser and supersession traversal are module-private, so C2 validates the same
`AnimalDataProvenance` contract itself and implements the generic append-only bitemporal
machinery once (`bitemporal-records.ts`) for later phases to import.

| Module | Contract |
|---|---|
| `obligation-time.ts` | Strict-UTC instant arithmetic by integer civil-day maths (no `Date`, no clock, no timezone): `addObligationOffset` (closed units `DAY` = 86 400 s, `HOUR` = 3 600 s), `utcStartOfCalendarDate`, `obligationInstantJustBefore` (−1 ns), `canonicalObligationInstant` (one 9-digit spelling), `utcCalendarDateOf`; outside years 0000–9999 ⇒ `null` (fail closed) |
| `obligation-definition.ts` | `ObligationDefinition` (obligation id, rule id + version, `recordedAt` knowledge time, `ObligationTerms`: opaque `obligationKind`, closed `ObligationAnchor` `DATE_OF_BIRTH` / `LIFECYCLE_STATUS_START(status)` / `LOCATION_START(locationKind\|null)`, window `{opensAfter, dueAfter, boundary}` with closed boundary `INCLUSIVE_START_EXCLUSIVE_END` (default) / `INCLUSIVE_START_INCLUSIVE_END` and `dueAfter > opensAfter`, closed `timeBasis` `UTC` / `HOLDING_LOCAL_TIME` (recognised, unsupported), `windowSource` `SourceVersionRef`); `computeObligationTermsFingerprint`; `obligationTermsMarker` — the rule version must carry it in C0 `assumptions`, so C0's rule fingerprint and version-bound reviews cover the exact terms; `ObligationCatalogue` (canonical data only: definitions, rule versions, sources, reviews — no executable code) + `materialiseObligationCatalogue` (canonical check, copied, rebuilt from known fields, sorted, deep-frozen; any malformed admitted entry, contradictory duplicate or obligation bound to two rule ids fails the whole catalogue; source `retrievedAt`/`checkedAt` must be strict-UTC instants and every fingerprint — source content, rule source bindings, window source, review rule fingerprint, implementation logic fingerprint — must have the current assessment-integrity schema version, `SHA-256` and a 64-lowercase-hex digest); `PRODUCTION_OBLIGATION_CATALOGUE` (empty) |
| `obligation-evidence.ts` | `ObligationFulfilmentEvidence` (`FULFILMENT` with valid-time `fulfilledAt`, or `RETRACTION` that must supersede ≥ 1 record; obligation id + exact rule id/version claimed; `occurrenceAnchor` `null` for single-occurrence anchors else the anchor instant; `AnimalDataProvenance` with `receivedAt` knowledge time; `supersedes`); `createObligationEvidenceLog` / `appendObligationEvidence` (any invalid record, self-supersession or same id + different content fails the log; identical duplicates idempotent, instants compared by instant); `resolveObligationEvidence` (corrections may only link within one obligation) |
| `bitemporal-records.ts` | Generic `collectBitemporalRecords` / `resolveBitemporalRecords`: knowledge-cutoff filtering, supersession known by the cutoff only, unknown-target / out-of-scope / cycle links reported, live terminal descendants per corrected target, disagreeing terminals reported as a competition with no winner |
| `obligation-anchor.ts` | `obligationInputsFromSnapshot` — C1 → C0 inputs under fixed keys `cattle.animal.species/dateOfBirth/sex` (FACT), `cattle.animal.lifecycleStatus/location.kind/location.ref/managementGroup` (OBSERVATION), `cattle.animal.externalIdentifier.<scheme>` (FACT); items only for KNOWN dimensions, one per supporting C1 assertion (provenance = assertion id + `receivedAt`); breed not exposed. `obligationInputDimensionState`. `deriveObligationOccurrences` (see below) |
| `obligation-engine.ts` | `ObligationState`, `evaluateAnimalObligations` → `AnimalObligationEvaluation` of `ObligationStateRecord`s; `verifyObligationStateRecord`; `evaluateHerdObligations` |
| `obligation-hard-gates.ts` | `projectObligationHardGates`, `obligationStateToPackState` |
| `canonical-input.ts` | `toCanonicalPlainData` (canonical plain-data check from property descriptors — no getter invoked, no function executed — returning a detached deep-frozen copy or the path of the first non-canonical position), `canonicalField` |
| `obligation-implementations.ts` | `createObligationImplementationRegistry` (trusted code builds it; malformed or conflicting entries throw), `findObligationImplementation` (exact id + version; an untrusted look-alike registry resolves nothing), `PRODUCTION_OBLIGATION_IMPLEMENTATIONS` (empty) |
| `obligation-integrity.ts` | `computeObligationFingerprint` / `verifyObligationFingerprint`, `CATTLE_OBLIGATION_PAYLOAD_VERSION` |

**Version and knowledge selection.** The C0 evaluation date is the UTC calendar date of
`effectiveAt`. Only rule versions whose definition `recordedAt <= knowledgeCutoff`, and only
reviews with `reviewedAt <= knowledgeCutoff`, are visible; evidence provably received after the
cutoff is not admitted. **Catalogue knowledge admission** (per record, before any validation,
decided only by canonical records known at the cutoff — so a record first known after it,
however malformed or contradictory, never changes an earlier reconstruction): definitions
(`recordedAt`), reviews (`reviewedAt`) and sources (`retrievedAt`) provably after the cutoff are
set aside unvalidated; a rule version is relevant only when an admitted definition or review
names it — irrelevant ones cannot affect any obligation at that cutoff and are not validated. An
unreadable knowledge time or identity fails closed. Without a cutoff every record is validated.
**Evidence append** keeps stored records exactly as stored: an identical duplicate (instants by
instant) is idempotent and never rewrites a stored spelling or a historical fingerprint. A PRODUCTION/SUPERSEDED version with no definition at all ⇒
UNSUPPORTED (never silently skipped). When C0 finds no effective released version but exactly
one unreleased version is in force, it is evaluated through `evaluateCattleRule` and the
obligation is REVIEW_REQUIRED. The rule in force at `effectiveAt` governs every occurrence (no
"law at time of trigger" transitional semantics).

**Occurrences.** `DATE_OF_BIRTH`: one occurrence at the UTC start of the C1 birth date (UTC
time basis). `LIFECYCLE_STATUS_START` / `LOCATION_START`: an occurrence at `t` when a live C1
assertion matching the anchor starts at `t`, C1 resolves the dimension at `t` KNOWN and
matching, and one nanosecond earlier it was not KNOWN with the same value (continuations are not
new starts); conflicting / invalid C1 state at or just before `t` ⇒ that occurrence's anchor is
conflicting / invalid. No C1 evidence of the dimension ⇒ UNKNOWN; evidence but no matching
start ⇒ `NOT_TRIGGERED` (never NOT_APPLICABLE) only when the dimension is resolved: C1 is probed
at the query and at every live assertion's `validFrom`/`validTo`; invalid or conflicting at any
probe, or UNKNOWN at the query or a probe not after it ⇒ INVALID / CONFLICT / UNKNOWN (that
precedence; each state is tracked independently of evidence ids, so an evidence-free UNKNOWN
gap between intervals counts). With C0 PASS the anchor must also be resolved for the whole
life (`resolveObligationAnchor`, as for NOT_APPLICABLE): an unresolved period could conceal
further occurrences, so it is reported as its own record (`occurrence: null`, reason
`CATTLE_OBLIGATION_ANCHOR_UNRESOLVED_PERIOD`, INVALID_EVIDENCE / EVIDENCE_CONFLICT / UNKNOWN)
alongside any known occurrences — a satisfied occurrence never hides it, and the hard-gate
projection folds it into the rule's state. Without occurrences the worse of the derivation and
the whole-life resolution is reported. Evidence admission precedes validation (animal and herd):
evidence provably received after the cutoff — even malformed or unattributable — is set
aside before validation or herd partitioning. **Canonical input contract** (human architecture
decision, 2026-10-12): C2 authoritative evaluation consumes canonical plain-data inputs. Runtime
materialisation of arbitrary caller objects is an adapter responsibility. Historical
reproducibility is guaranteed over admitted canonical records. Executable rule implementations
are trusted code bindings, not caller-provided data: rule data names an implementation only by
its C0 `RuleImplementationRef` (id, version, logic fingerprint), and the engine takes a trusted
registry (`obligation-implementations.ts`) whose entries C0 `evaluateCattleRule` checks against
that binding exactly as C0 defines (unregistered or mismatched ⇒ UNSUPPORTED). Canonical plain
data (`canonical-input.ts`) is strings, finite numbers, booleans, `null`/`undefined`, plain
arrays and plain objects of enumerable data properties — no functions, symbols, bigints,
accessors, hidden or symbol-keyed properties, class instances, cycles or excessive depth.
Request data (query, ledger(s), evidence, catalogue), evidence-log inputs and projected
evaluations that are not canonical are rejected before evaluation
(`CATTLE_OBLIGATION_NON_CANONICAL_INPUT`, `CATTLE_OBLIGATION_CATALOGUE_NON_CANONICAL`,
`CATTLE_OBLIGATION_EVIDENCE_NON_CANONICAL`, `CATTLE_OBLIGATION_HARD_GATE_INPUT_NON_CANONICAL`);
canonical data is copied once and only the detached copy is used. Proxy-dependent behaviour is
outside the contract; the engine does not defend against adversarial JavaScript objects past
this boundary. Occurrence id `<obligationId>|<anchorKind>|<t>`.

**Window.** `opensAt = anchor + opensAfter`, `dueAt = anchor + dueAfter`; inclusive start;
exclusive end unless the rule declares `INCLUSIVE_START_INCLUSIVE_END`. Unrepresentable ⇒
UNSUPPORTED.

**State precedence** (first match wins). Rule level (one record, `occurrence: null`):
UNSUPPORTED (catalogue invalid; obligation absent as known by the cutoff — definitions recorded
later never change the result; released version approved by the cutoff without terms recorded
by it — a released version with neither is not yet known; C0 UNSUPPORTED incl. no/ambiguous effective version, invalid lineage,
implementation absent or mismatched; terms marker absent; window source not a rule binding;
unsupported time basis) > REVIEW_REQUIRED (unreleased version in force; C0 REVIEW_REQUIRED) >
INVALID_EVIDENCE > EVIDENCE_CONFLICT > UNKNOWN > INSUFFICIENT_EVIDENCE (C0 lacked a KNOWN input;
decided from the referenced C1 dimension states; non-C1 key or rejected class/unit ⇒
INSUFFICIENT_EVIDENCE) > NOT_APPLICABLE (C0, KNOWN inputs only, and only for a RESOLVED anchor
— `resolveObligationAnchor`: the birth date is KNOWN and, for interval anchors, the dimension is
KNOWN at the UTC start of the birth date, at every live `validFrom`/`validTo` up to the query and
at the query, with no conflicting/invalid state at any live boundary; otherwise the anchor's
INVALID_EVIDENCE > EVIDENCE_CONFLICT > UNKNOWN — a query before birth has no life to cover) > BLOCKED (HARD_GATE FAIL) /
ADVISORY_FAIL (ADVISORY FAIL). Anchor level (C0 PASS): INVALID_EVIDENCE > EVIDENCE_CONFLICT >
UNKNOWN > NOT_TRIGGERED. Occurrence level: anchor invalid ⇒ INVALID_EVIDENCE > anchor conflict ⇒
EVIDENCE_CONFLICT > UNSUPPORTED (window) > INVALID_EVIDENCE (log invalid, supersession defect,
record whose occurrence shape does not fit the anchor) > EVIDENCE_CONFLICT (competing
corrections; counted fulfilments disagreeing on timeliness) > SATISFIED (fulfilled in window) >
SATISFIED_LATE (fulfilled after due end) > REVIEW_REQUIRED (only evidence for another rule
version — never counted) > UPCOMING > OUTSTANDING > OVERDUE. Evidence counts only for the exact
evaluated rule version, received by the cutoff and fulfilled by `effectiveAt`; fulfilment
before the window opens never satisfies it. No source precedence, no latest-wins.

**Output record.** `ObligationStateRecord`: `informationClass: "OBLIGATION_OR_CONSTRAINT"`,
animal, obligation id/kind, classification and gate role verbatim from C0 (all eight
classifications preserved), exact rule ref + rule fingerprint, terms fingerprint, the complete
C0 `RuleEvaluationRecord`, occurrence (anchor + C1 assertion ids), window, state, reason codes,
evidence summary (considered / superseded / counted records / before-window / not-yet-occurred /
other-version / conflicting / invalid / unattributed ids), C1 snapshot fingerprint,
`effectiveAt`, `knowledgeCutoff` (canonical spelling) and a `CATTLE_OBLIGATION_STATE`
fingerprint over everything else. Results sorted by obligation id then occurrence id;
evaluation detached and deep-frozen; inputs read/cloned once. Invalid query times / obligation
ids / ledger ⇒ `ok: false`.

**Hard-gate projection.** Entries for HARD_GATE obligations and (fail closed) obligations with
no resolved gate role; ADVISORY excluded. Record fingerprints and animal/time consistency are
re-verified first (mismatch ⇒ `ok: false`). Pack mapping (engine convention, not law):
SATISFIED / SATISFIED_LATE → PASS; NOT_APPLICABLE → NOT_APPLICABLE; BLOCKED / OVERDUE → FAIL;
REVIEW_REQUIRED → REVIEW_REQUIRED; UNSUPPORTED → UNSUPPORTED; EVIDENCE_CONFLICT → C0's
conflicting-evidence state; everything else → INSUFFICIENT_EVIDENCE. Entries fold to one
pack-compatible `RuleEvaluationRecord` per requested rule id (most restrictive: FAIL >
REVIEW_REQUIRED > UNSUPPORTED > conflicting evidence > INSUFFICIENT_EVIDENCE > PASS >
NOT_APPLICABLE) plus `requiredHardGateRuleIds`, ready for `buildRecommendationEvidencePack`
(BLOCKED ⇒ pack BLOCKED; empty catalogue ⇒ pack INSUFFICIENT_EVIDENCE).

**Herd.** `evaluateHerdObligations` evaluates each distinct valid animal (sorted; input-order
independent). Identity admission precedes validity filtering: every readable animal id is
counted across all supplied ledgers, valid or not, so two or more ledgers claiming one id are
reported once as a duplicate (in addition to each invalid-ledger issue) and that animal is not
evaluated (never merged); an unreadable id is reported as an invalid ledger and no id is
invented; evidence for an unevaluated animal is reported; evidence with no
readable animal id is reported and offered to every animal so each evidence log fails closed.

**Known limitations.** No real obligation content exists (empty catalogue). Source catalogue
lifecycle is not bitemporal in C0, so reproducing an earlier cutoff after a source lifecycle
change requires supplying the source catalogue as it then stood; a malformed catalogue entry
admitted at a cutoff fails that cutoff. NOT_APPLICABLE for interval anchors needs the dimension
recorded for the animal's whole life to the query, so a partially recorded history stays UNKNOWN
(conservative by contract). Only the UTC time basis, `DAY`/`HOUR` offsets and three anchor kinds are
supported (no calendar-month offsets, local time, location hierarchy or departure anchors).
The rule version in force at `effectiveAt` governs past occurrences; evidence bound to another
version needs review. Supplied predicates are trusted as C0 documents (source-text binding only).
Fingerprints are change detection, not signatures; the projection trusts records whose
fingerprints verify.

**Exclusions.** No registration, BVD, TB, movement, procedure or welfare rule; no AIM/DAFM/ICBF
connector, field mapping or API shape; no health/medicines (C3), weights (C4), performance
(C5), goals (C6), veterinary programmes (C7), recommendation selection (C8), Plan integration
(C9) or UI (C10); no persistence, schema, migration or AI.

## Cattle C3 — Health & medicines engine (2026-10-12)

C0 (`61c1124`), C1 (`c5b25f2`) and C2 (frozen by its campaign receipt) are **frozen**; C3 changes
no earlier file except one additive `export * from "./health";` line in
`src/domain/cattle/index.ts`. New, **non-frozen** pure modules under `src/domain/cattle/health/`
(barrel `health/index.ts`); tests `health/health.test.ts` (synthetic `SYNTH-*` animals,
products, authorisations, food-product codes, routes, periods, doses and practitioners only).
Engine, contracts and interfaces only: **no real product, authorisation number, withdrawal
period, dose, route, vaccine or veterinary schedule**, and no product catalogue ships with the
engine (CAT-INV-027); no diagnosis inference, prescribing or dose/route choice; no persistence,
schema, migration, UI, AI, network or HPRA/EMA/NVPS connector or API shape. Shared contract:
`docs/farm-return-next/cattle/` (CAT-INV-001–014, 016, 017, 021–027; 018/019 for periods).

**Reuse decisions.** Canonical boundary: C2 `toCanonicalPlainData`/`canonicalField` on the whole
request (collections and elements) and on every projection passed back in. Animal identity and
state only through C1 (`rematerialiseAnimalLedger`, `projectAnimalSnapshot`,
`computeAnimalSnapshotFingerprint`, `isValidAnimalInstant`/`animalInstantKey`/`compareInstants`,
`deepFreezeAnimalValue`, `BOVINE_SPECIES`); the `AnimalDataProvenance` contract is re-validated
here because C1's materialiser is module-private (C2 precedent). Append-only collection and
as-of-cutoff supersession reuse C2 `collectBitemporalRecords`/`resolveBitemporalRecords`
unchanged (for health records and for product versions). Exact UTC period arithmetic reuses C2
`addObligationOffset`/`isValidObligationOffset`/`canonicalObligationInstant`/`utcCalendarDateOf`.
Fingerprints reuse `assessment-integrity.ts` canonicalisation and SHA-256 unchanged through the
phase-local wrapper `{kind, healthPayloadVersion: 1, payload}` (template: C2
`obligation-integrity.ts`) with new kinds `CATTLE_HEALTH_TIMELINE`, `CATTLE_MEDICINE_LEDGER`,
`CATTLE_WITHDRAWAL_GATE` — no existing kind, payload version or canonicalisation changes. Pack
compatibility uses C0 `RuleEvaluationRecord`/`buildRecommendationEvidencePack` as C2's hard-gate
projection does. No C2 obligation logic is used or duplicated.

| Module | Contract |
|---|---|
| `health-records.ts` | `HealthRecord` kinds `HEALTH_OBSERVATION` (`OBSERVED_SIGN` / `SUSPECTED_CONDITION`, finding as supplied), `SYMPTOM`, `DIAGNOSIS` (condition + `diagnosedByRef`), `VETERINARY_EVENT` (closed `VISIT`/`EXAMINATION`/`PROCEDURE`/`OTHER`, practitioner ref), `TREATMENT` (course; prescription/practitioner refs), `MEDICINE_ADMINISTRATION` (product id or `null`, recorded authorisation/label, batch, dose `{amount, unit}` / route / site exactly as supplied, administered-by, prescription ref, `treatmentRecordId`, prescriber-specified withdrawal periods per food product), `RETRACTION` (supersedes ≥ 1, no time, no claim). Common: record id, C1 animal id, valid time `occurredAt` (`null` = not supplied), `HealthRecordProvenance` (C1 provenance + closed `actorRole` `VETERINARIAN`/`LABORATORY`/`FARMER`/`FARM_STAFF`/`SYSTEM`/`OTHER`; `receivedAt` knowledge time), optional source document `SourceVersionRef` (fingerprint shape validated), `supersedes`. `materialiseHealthRecord` (unknown field, malformed value or finding ⇒ rejected, never repaired); `isDiagnosingProvenance`: a DIAGNOSIS only from `VETERINARIAN` via `VETERINARY_SOURCE`, or `LABORATORY` via `VETERINARY_SOURCE`/`OTHER` — anything else is rejected (`CATTLE_HEALTH_DIAGNOSIS_SOURCE_NOT_DIAGNOSTIC`); `healthLinkAllowed`: corrections stay within their kind (a symptom can never be corrected into a diagnosis), a retraction may retract any non-retraction record; content key (instants by instant) and claim key (provenance/source/links excluded); `healthRecordInformationClass` (observation/symptom/diagnosis ⇒ OBSERVATION; event/treatment/administration ⇒ FACT) |
| `authorised-product.ts` | `AuthorisedProductRecord` (identity product id + version; `supersedesVersions`; authorisation scheme/number; label; lifecycle `ACTIVE`/`HISTORICAL`/`REVIEW_REQUIRED`; species authorisations with withdrawal entries `{foodProduct, route\|null, period\|null, multiDoseBasis\|null}` unique per (food product, route); source binding publisher + `SourceVersionRef` + `retrievedAt`/`checkedAt`). Knowledge time = the later of retrieved/checked. `admitProductRecords` (provably-later records set aside unvalidated; identity collisions among the admitted, invalid copies included, found before validity; any malformed admitted record fails closed); `ProductBinding` (precedence below); `ProductVersionRef`. `resolveProductRecords`/`bindAdministrationProduct` are module-internal (not in the barrel; reached only through `projectAnimalHealth`) |
| `withdrawal.ts` | Types only in the barrel: `AdministrationWithdrawal`, `WithdrawalGateEntry`, `WithdrawalGateState` `CLEAR`/`IN_WITHDRAWAL`/`UNKNOWN`/`EVIDENCE_CONFLICT`. `computeAdministrationWithdrawal`/`foldWithdrawalGate` are module-internal (trust validated, detached records; reached only through `projectAnimalHealth`) |
| `health-engine.ts` | `projectAnimalHealth(request, hash)` → `AnimalHealthProjection` (timeline, medicine ledger view, withdrawal gate, source refs); `verifyAnimalHealthProjection` |
| `health-hard-gates.ts` | `projectWithdrawalHardGates`, `withdrawalStateToPackState`, `withdrawalGateRuleId` |
| `health-integrity.ts` | `computeHealthFingerprint`/`verifyHealthFingerprint`, `CATTLE_HEALTH_PAYLOAD_VERSION` |
| `health-input.ts` | module-internal canonical readers (fingerprint/source-ref shape, supplied quantities); not in the barrel |

**Request and admission.** `AnimalHealthRequest` = `{ledger, healthRecords, productRecords,
query: {effectiveAt, knowledgeCutoff, foodProducts (opaque codes, non-empty, unique, matched
exactly), timelineFilter?: {kinds|null, occurredFrom|null (inclusive), occurredTo|null
(exclusive)}}}`. Order: whole-request canonical check (`CATTLE_HEALTH_NON_CANONICAL_INPUT`) →
query + C1 ledger → knowledge admission (health `provenance.receivedAt`; product
`retrievedAt`/`checkedAt` — a readable time after the cutoff sets the record aside before any
validation; an unreadable one fails closed) → identity before validity (same id + different
content, invalid copy included ⇒ `CATTLE_HEALTH_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT` /
`CATTLE_HEALTH_PRODUCT_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT`; identical content with
equivalent instant spellings is idempotent, one spelling kept independent of input order) →
content validation → supersession at the cutoff (unknown target / out-of-scope / cycle ⇒
`ok: false`; competing live corrections reported with no winner) → valid-time view (records that
occurred by `effectiveAt`, or whose time is unknown; later ones are `notYetOccurredRecordIds`).
Any malformed admitted record, collision or health supersession defect ⇒ `ok: false` (fail
closed). Query times are echoed in canonical nine-digit spelling. No clock read.

**Product binding** (per administration; first match wins): `UNKNOWN` (no product id, or no
record known by the cutoff) > `INVALID` (a revision names a version not known by the cutoff, or a
cycle) > `EVIDENCE_CONFLICT` (competing revisions or more than one live version — no precedence,
no latest-wins) > `REVIEW_REQUIRED` (live version not ACTIVE) > `UNSUPPORTED` (no exact `BOVINE`
species authorisation) > `EVIDENCE_CONFLICT` (authorisation recorded on the administration
differs exactly) > `BOUND` (the single live version known at the cutoff).

**Withdrawal end** (per administration and food product; REQUIRED: BOUND binding, known
administration instant, exactly one applicable period, a computable period and, for a course, a
supplied basis): one BOVINE entry for the food product whose route equals the administration's
route or is `null` (supplied as not route-specific); an administration without a recorded route
matches only when no route-specific entry exists. `period: null` ⇒ UNKNOWN. Computation only for
whole non-negative `DAY` (86 400 s) / `HOUR` (3 600 s) amounts, exact UTC; any other unit or a
fractional amount ⇒ UNKNOWN (no conversion, no rounding). A supplied zero is data. A course
(TREATMENT with more than one live administration known by the cutoff, by `treatmentRecordId`)
needs a supplied `multiDoseBasis` (`PERIOD_FROM_EACH_ADMINISTRATION`), else UNKNOWN. A supplied
prescriber period must itself be computable; the later end governs (`governingPeriod`), so a
longer prescriber period is honoured and a shorter one never shortens the product period.
Non-bound binding ⇒ UNKNOWN (EVIDENCE_CONFLICT for a conflicting binding). **Boundary
convention (engine convention, not law):** the end is exclusive — strictly before it ⇒ in
withdrawal; at it ⇒ not.

**Withdrawal gate** (per queried food product, over live administrations in view):
EVIDENCE_CONFLICT (competing administration corrections, or any conflicting computation) >
UNKNOWN (any administration unknown) > IN_WITHDRAWAL (`inWithdrawalUntil` = latest end; every end
known and the latest after `effectiveAt`) > CLEAR. Each entry lists the administration ids and
product versions used. CLEAR is the only resolved-looking state; it asserts only that no
administration in the supplied medicine record known by the cutoff holds the food product in
withdrawal at `effectiveAt` (reason `CATTLE_HEALTH_WITHDRAWAL_NO_RECORDED_ADMINISTRATION` when the
record is empty) — completeness of the supplied medicine record is the adapter's responsibility.

**Outputs.** `HealthTimeline` (entries ordered by occurred-at instant, unknown time last, then id;
status LIVE/SUPERSEDED with `supersededBy`, `inCompetition`, information class, full record;
competitions; kind/period filter; unknown-time records outside a period filter listed, never
silently dropped). `MedicineLedgerView` (administrations in view incl. superseded history,
chronological; binding, course size, treatment-record-known flag, per-food-product withdrawals;
product versions used). `WithdrawalGateProjection` (entries + the ledger fingerprint it is bound
to). Fingerprints are result fingerprints over semantic payloads (canonical instant keys, sorted
sets; the output keeps each record's original spelling, CAT-INV-011): each binds animal id,
canonical `effectiveAt`/`knowledgeCutoff`, the C1 snapshot fingerprint and its content; the
timeline also binds every known record id; the gate binds the ledger fingerprint. Input order,
key order and equivalent instant spellings do not change them; any material field does. Results
are detached and deep-frozen.

**Hard-gate projection.** `projectWithdrawalHardGates(projection, hash)` re-verifies the three
fingerprints (mismatch or non-canonical ⇒ `ok: false`) and emits one pack-compatible
`RuleEvaluationRecord` per food product: requested rule id `CATTLE_HEALTH_WITHDRAWAL:<food
product>`, gate role HARD_GATE, `rule`/`ruleFingerprint`/`implementation`/`classification`
`null` (an engine projection, not a C0 rule), reason codes binding the gate fingerprint, plus
`requiredHardGateRuleIds` and the bound product `sourceRefs` (for `additionalSourceRefs`).
Mapping (engine convention): CLEAR → PASS; IN_WITHDRAWAL → FAIL (pack BLOCKED); UNKNOWN →
INSUFFICIENT_EVIDENCE (missing input `cattle.health.withdrawal.<food product>`);
EVIDENCE_CONFLICT → C0 conflicting evidence.

**Known limitations.** No product content ships (empty by contract): with no supplied product
records every administration's withdrawal is UNKNOWN. The bound product version is the single
live version known at the cutoff; the engine does not decide which historical
product-information version governed a past administration. Only `DAY`/`HOUR` periods compute;
other units stay UNKNOWN. Course membership is only by explicit `treatmentRecordId`; ungrouped
repeat administrations are independent (the latest end still governs the gate). A product not
authorised for BOVINE in the supplied data is UNSUPPORTED even when a prescriber supplies a
period. Any competing administration correction puts every food product in conflict. A
malformed admitted product record, even for an unrelated product, fails the projection closed.
The C1 snapshot fingerprint bound into every payload is representation-sensitive (C1
behaviour). Fingerprints are change detection, not signatures.

**Exclusions.** No diagnosis inference, condition classification, risk scoring, prescribing,
dose/route choice or SPC interpretation beyond the supplied structured fields; no vaccination or
health programmes (C7), weights (C4), recommendations (C8), Plan (C9) or UI (C10); no
persistence, schema, migration, AI, network or connector.

## Cattle C4 — Weight observations & groups (2026-10-12)

C0 (`61c1124`), C1 (`c5b25f2`), C2 and C3 (frozen by their campaign receipts) are **frozen**; C4
changes no earlier file except one additive `export * from "./weights";` line in
`src/domain/cattle/index.ts`. New, **non-frozen** pure modules under `src/domain/cattle/weights/`
(barrel `weights/index.ts`); tests `weights/weights.test.ts` (synthetic `SYNTH-*` animals, groups,
devices, quality schemes and weights only). Canonical weight observations, a group-scope resolver
over C1 group history and the C5 read contract only: **no ADG, gain, trend, coverage or target
logic** (C5), no weight conversion factor, no group truth (C1 owns `MANAGEMENT_GROUP`), no legacy
`src/domain/types.ts` / `livestock.ts` / `src/lib/farm-data/` change or adapter, no persistence,
schema, migration, UI, AI, network or device/scale connector. Weight is never an animal property:
the C1 ledger and snapshot are untouched. Shared contract: `docs/farm-return-next/cattle/`
(CAT-INV-001–014, 018, 019, 021–024, 026, 027).

**Reuse decisions.** Canonical boundary: C2 `toCanonicalPlainData`/`canonicalField` on the whole
request (collections and elements) and on every read contract passed back in. Instants: C1
`isValidAnimalInstant`/`animalInstantKey`/`compareInstants`; canonical spellings via C2
`canonicalObligationInstant`. Provenance: the C1 `AnimalDataProvenance` contract
(`ANIMAL_DATA_SOURCE_CATEGORIES`), re-validated here because C1's materialiser is module-private
(C2/C3 precedent). Append-only collection and as-of-cutoff supersession reuse C2
`collectBitemporalRecords`/`resolveBitemporalRecords` unchanged. Generic canonical readers
(`isRecord`, `hasOnlyFields`, `oneOf`, `nullableRef`, `rawIdentityKey`) are imported from C3
`health/health-input.ts` (their first implementation; no C3 output is read). Group membership
only through C1 `rematerialiseAnimalLedger`, `projectAnimalSnapshot` (`managementGroup`),
`animalAssertionHistory` and `assertionContentKey`. Fingerprints reuse `assessment-integrity.ts`
canonicalisation and SHA-256 unchanged through the phase-local wrapper
`{kind, weightPayloadVersion: 1, payload}` (template: C2 `obligation-integrity.ts`) with new kinds
`CATTLE_WEIGHT_SERIES`, `CATTLE_GROUP_SCOPE`, `CATTLE_WEIGHT_READ_CONTRACT` — no existing kind,
payload version or canonicalisation changes.

| Module | Contract |
|---|---|
| `weight-observation.ts` | `CattleWeightObservation` (distinct from the legacy `WeightObservation`): `recordId`, C1 `animalId`, valid time `observedAt` (strict UTC, required), `weight {value, unit}` as recorded, `method`, `deviceRef\|null`, `quality {scheme, value: string\|number}\|null` verbatim, `conditionsNote\|null` verbatim, `provenance` (C1 `AnimalDataProvenance`; `receivedAt` = knowledge time; `provenance.observedAt` = the source's own recorded time, preserved, never valid time), `supersedes`. Closed `WEIGHT_UNITS` (`KILOGRAM`, `POUND`); `WEIGHT_UNIT_CONVERSIONS` (`KILOGRAM` → `IDENTITY`; `POUND` → `null`); `canonicalWeightOf` (`CONVERTED` kg / `UNSUPPORTED`; trusts validated record weights; module-internal, not in the barrel). Closed `WEIGHT_COLLECTION_METHODS` (`SCALE`, `WEIGHBRIDGE`, `ESTIMATE_VISUAL`, `ESTIMATE_TAPE`, `DERIVED_EXTERNAL`, `UNKNOWN`); `weightMeasurementBasis` read from the method name (`MEASURED`/`ESTIMATED`/`DERIVED`/`UNKNOWN`); `weightInformationClass` (`DERIVED_EXTERNAL` ⇒ DERIVED_VALUE, else OBSERVATION). `materialiseWeightObservation` (unknown field, non-numeric / zero / negative value, missing or unknown unit, unknown method, malformed instant / device / quality / note / provenance / supersedes ⇒ rejected, never repaired; module-internal, not in the barrel); content key (instants by instant), claim key (provenance and links excluded); `weightLinkAllowed` (same animal AND same method) |
| `weight-series.ts` | `projectWeightSeries(request, hash)` → `WeightSeriesProjection` (one `AnimalWeightSeries` per requested animal); `weightSeriesPayload`. `projectCanonicalWeightSeries` and `latestKnownWeightOf` are module-internal (not in the barrel) |
| `group-scope.ts` | `resolveGroupScope(request, hash)` → `ScopeResolution`; `scopeResolutionPayload`. `readScopeRequest`/`resolveValidScope` are module-internal |
| `weight-read-contract.ts` | `buildWeightReadContract(request, hash)` → `WeightReadContract` (the C5 read contract); `verifyWeightReadContract` |
| `weight-integrity.ts` | `computeWeightFingerprint`/`verifyWeightFingerprint`, `CATTLE_WEIGHT_PAYLOAD_VERSION` |

**Units and number representation (NUMERIC_SEMANTICS.md decisions).** A weight value is a
finite, strictly positive IEEE-754 binary64 JavaScript number, kept exactly as recorded with its
unit (CAT-INV-011). The canonical unit is the kilogram. The only conversion is the `KILOGRAM`
identity: the canonical value *is* the recorded value — no arithmetic, so no rounding and no
platform-dependent result (CAT-INV-018/019). `POUND` is recognised but has no conversion in this
campaign (a factor needs separately reviewed external evidence), so its canonical value is
`UNSUPPORTED` and the record keeps its recorded value/unit. Any other unit, a missing unit, or a
non-numeric, zero or negative value is rejected; NaN/±Infinity are rejected at the canonical
boundary. Weights compare by canonical kg value (numeric equality), never by formatting.

**Request and admission.** `WeightSeriesRequest` = `{observations, animalIds (explicit set,
unique opaque ids), query: {effectiveAt, knowledgeCutoff}}`. Order: whole-request canonical check
(`CATTLE_WEIGHT_NON_CANONICAL_INPUT`) → query + animal set → knowledge admission (a readable
`provenance.receivedAt` after the cutoff sets the record aside before any validation; an
unreadable one fails closed) → identity before validity (same id + different content, invalid
copy included ⇒ `CATTLE_WEIGHT_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT`; identical content with
equivalent instant spellings is idempotent, one spelling kept independent of input order) →
content validation of **every** admitted record, whichever animal it names → supersession at the
cutoff (unknown / not-yet-known target, another animal or another method, cycle, self ⇒
`ok: false`; competing live corrections reported with no winner) → valid-time view. Query times
are echoed in canonical nine-digit spelling; neither defaults to the other. No clock read.

**Series** (per animal): `observations` = live observations with `observedAt <= effectiveAt`,
chronological (instant, then id); `history` = every known record of the animal (superseded and
not-yet-observed included) with status LIVE/SUPERSEDED, `supersededBy`, `inCompetition`,
`inView`; `notYetObservedRecordIds`; `competitions`; `knownRecordIds`. Each entry carries the
full record (recorded value/unit, method, device, supplied quality, conditions note,
provenance), the canonical weight, the measurement basis and the information class.

**Latest-known weight** (REQUIRED: the live observations in view, the latest such instant `L`,
the observations at `L` and their competition state; first match wins): `NONE` (no live
observation in view — never zero) > `EVIDENCE_CONFLICT` (more than one live observation at `L`,
whatever their values — never averaged; or an observation at `L` in a competing-correction
branch; `candidateKg` lists the distinct convertible values) > `UNSUPPORTED` (the single
observation at `L` has no exact kg conversion; an earlier weight is never substituted) > `KNOWN`
(canonical kg of the single observation at `L`). Agreeing same-instant observations under
different record ids are a conflict by this contract: the adapter supersedes a duplicate entry.

**Group scope.** `GroupScopeRequest` = `{scope: {kind: "GROUP", groupRef, ledgers (C1
AnimalLedgers)} | {kind: "EXPLICIT_SET", animalIds}, query: {effectiveAt, knowledgeCutoff,
historyFrom? (GROUP only, strictly before effectiveAt)}}`. Per animal, from the C1
`managementGroup` resolution at the same instant and cutoff: C1 INVALID_EVIDENCE ⇒ `INVALID`;
CONFLICTING_EVIDENCE ⇒ `EVIDENCE_CONFLICT` (whichever groups compete); UNKNOWN (including no
group evidence) ⇒ `UNKNOWN`; KNOWN ⇒ `MEMBER` (exactly `groupRef`) / `NOT_MEMBER`. REQUIRED for
MEMBER/NOT_MEMBER: a KNOWN C1 group. Output: `members`, `notMembers`, `unknown`, `conflict`,
`invalid` (sorted; unresolved animals never silently in or out), and each animal's state, group,
competing groups, C1 issues and evidence assertions. History: membership at `historyFrom` and
at every MANAGEMENT_GROUP interval bound known by the cutoff in (`historyFrom`, `effectiveAt`],
each projected through C1 and kept where it changes (complete, since membership is piecewise
constant between bounds). Herd scope = the explicit set, every animal MEMBER by declaration, no
ledger and no history. A malformed ledger, a repeated animal with a different ledger (identical
repeats are idempotent) or a malformed query fails closed.

**C5 read contract.** `buildWeightReadContract({observations, scope, query}, hash)` →
`{effectiveAt, knowledgeCutoff, scope: ScopeResolution, series: one AnimalWeightSeries per
scope member in member order, fingerprint}`; scope and series are projected at the same
(`effectiveAt`, `knowledgeCutoff`). C5 must report the scope's unknown/conflict/invalid sets
(their weights are not included). `verifyWeightReadContract` re-checks canonicality, payload
version, every fingerprint, and the bindings (times, scope sets vs animal states, series vs
members, observations vs history, latest vs observations); any defect ⇒ `valid: false`, never a
throw.

**Fingerprints.** All three are result fingerprints over semantic payloads (canonical instant
keys, sorted sets, C1 assertions by `assertionContentKey`; the output keeps original spellings,
CAT-INV-011). A series binds animal id, canonical times, its known record ids and every output
field — another animal's records never change it; input order, key order and equivalent instant
spellings do not; any value, unit, method, device, quality, note, provenance, instant,
correction or query time does. The scope binds kind, group ref, times, every animal's state and
evidence, the sets and the history. The read contract binds times, the scope fingerprint and
each member's series fingerprint. Change detection only, not signatures.

**Known limitations.** Only kilograms convert; `POUND` (and any future unit) is UNSUPPORTED
until a reviewed conversion exists. A correction cannot change the collection method, so a
differently collected weight is a new observation (and conflicts at the same instant). There is
no retraction record kind: an erroneous observation can only be corrected. `observedAt` is
required; a weight without an instant is rejected, not placed. Group membership is C1's
`MANAGEMENT_GROUP` dimension only; presence/lifecycle is not combined (consumers read the C1
snapshot). Completeness of the supplied observations and ledgers is the adapter's
responsibility. Any malformed admitted observation, for any animal, fails the projection closed.

**Exclusions.** No ADG, gain, trend, coverage, target comparison or performance interpretation
(C5); no goals (C6), programmes (C7), recommendations (C8), Plan (C9) or UI (C10); no legacy
weight/animal code change or legacy-to-canonical adapter; no persistence, schema, migration, AI,
network, device or scale connector.

## Cattle C5 — Performance engine (2026-10-13)

C0 (`61c1124`), C1 (`c5b25f2`), C2, C3 and C4 (frozen by their campaign receipts) are **frozen**;
C5 changes no earlier file except one additive `export * from "./performance";` line in
`src/domain/cattle/index.ts`. New, **non-frozen** pure modules under
`src/domain/cattle/performance/` (barrel `performance/index.ts`); tests
`performance/performance.test.ts` (synthetic `SYNTH-*` animals, groups, sources, targets,
policies, thresholds and weights only). Deterministic gain / ADG, coverage, explicit trend and
target comparison, an optional labelled prediction and scope aggregation over the C4 read
contract: **no built-in target, growth curve, ADG constant, tolerance, minimum interval, quality
threshold or trend boundary** (CAT-INV-027); legacy `livestock.ts` constants (e.g.
`targetADGForAnimalType`) are neither imported nor duplicated. No persistence, schema,
migration, UI, AI, network or clock. Shared contract: `docs/farm-return-next/cattle/`
(CAT-INV-001–006, 009, 010, 012, 014, 018–023, 025, 027).

**Reuse decisions.** Inputs only through C4: `verifyWeightReadContract` re-verifies the supplied
`WeightReadContract` (every fingerprint and binding) and the C4 series entries (canonical kg,
measurement basis, method, supplied quality, competition state) are the only weight evidence —
no raw weight record is read and no C4 internal module is imported (CAT-INV-014/023). Canonical
boundary: C2 `toCanonicalPlainData`/`canonicalField` on the whole request. Instants: C1
`isValidAnimalInstant`/`animalInstantKey`/`compareInstants`/`intervalCovers`; canonical
spellings via C2 `canonicalObligationInstant`. Definitions: append-only collection and
as-of-cutoff supersession through C2 `collectBitemporalRecords`/`resolveBitemporalRecords`
unchanged; source binding is a C0 `SourceVersionRef` validated by C3 `sourceVersionRefOf`
(assessment-integrity fingerprint shape, CAT-INV-024); review state is C0
`CattleRuleProductionState`; optional C0 `RuleVersionRef`. Generic readers (`isRecord`,
`hasOnlyFields`, `oneOf`, `rawIdentityKey`) from C3 `health/health-input.ts`. Fingerprints reuse
`assessment-integrity.ts` canonicalisation and SHA-256 unchanged through the phase-local
wrapper `{kind, performancePayloadVersion: 1, payload}` (template: C2 `obligation-integrity.ts`)
with new kinds `CATTLE_PERFORMANCE_ANIMAL_RESULT` and `CATTLE_PERFORMANCE_RESULT` — no existing
kind, payload version or canonicalisation changes.

| Module | Contract |
|---|---|
| `elapsed-time.ts` | Day convention `UTC_EXACT_ELAPSED_SECONDS_PER_86400` v1 (`PERFORMANCE_DAY_CONVENTION`, `PERFORMANCE_DAY_CONVENTION_VERSION`); `exactElapsed`, `elapsedDaysOf`, `isPositiveElapsed` are module-internal (not in the barrel) |
| `performance-definitions.ts` | `PerformanceTarget` (`targetId`, `version`, `supersedesVersions`, `metric` `{kind: "ADG", valueKgPerDay}` \| `{kind: "WEIGHT_AT", at, valueKg}`, `tolerance {below, above} \| null`, `applicability {goalRef, productionSystemRef, animalIds, attributes}`, `validFrom`/`validTo` (inclusive/exclusive), `reviewState`, `provenance {sourceRef (required), ruleRef \| null, receivedAt, actor}`); `PerformancePolicy` (`policyId`, `version`, `supersedesVersions`, `rule` `MINIMUM_INTERVAL {minimumDays}` \| `ACCEPTED_BASES {acceptedBases}` \| `TREND {fallingBelowKgPerDay, risingAboveKgPerDay}`, `provenance`); `DefinitionVersionRef`; `PolicyResolution` (`NONE` / `SUPPLIED` / `EVIDENCE_CONFLICT`). Admission/materialisation helpers are module-internal |
| `performance-derivation.ts` | points, interval / period derivation, coverage, trend, target comparison and prediction (functions module-internal; types exported): `IntervalDerivation` (`DERIVED_VALUE` with `CalculationTrace`), `PerformanceCoverage`, `TrendClassification`, `TargetComparison`, `WeightPrediction` |
| `performance-engine.ts` | `evaluatePerformance(request, hash)` → `PerformanceEvaluation` (per-animal `AnimalPerformance` + `PerformanceAggregate`) |
| `performance-integrity.ts` | `computePerformanceFingerprint`/`verifyPerformanceFingerprint`, `CATTLE_PERFORMANCE_PAYLOAD_VERSION` |

**Request and admission.** `PerformanceRequest` = `{weights: WeightReadContract, query:
{effectiveAt, knowledgeCutoff, windowFrom?, projectionAt?}, targets, policies, contexts}`. Order:
whole-request canonical check (`CATTLE_PERFORMANCE_NON_CANONICAL_INPUT`) → query (window start
strictly before `effectiveAt`, projection strictly after) → contexts → C4 contract verification
(`CATTLE_PERFORMANCE_WEIGHT_CONTRACT_INVALID`) and time binding: the contract must be projected
at exactly the query's `effectiveAt`/`knowledgeCutoff` by instant
(`CATTLE_PERFORMANCE_WEIGHT_CONTRACT_TIME_MISMATCH`) — the caller passes the same times to C4 →
targets and policies admitted at the cutoff: a readable `provenance.receivedAt` after the cutoff
sets the record aside before any other read; an unreadable one fails closed; identity
(`id@version`) before validity (an invalid copy still collides); malformed content or provenance
(no `sourceRef`, malformed fingerprint) ⇒ `ok: false`; supersession at the cutoff (unknown
version, cycle, policy of another kind ⇒ `ok: false`); more than one live version of an id, or
competing revisions ⇒ that id is EVIDENCE_CONFLICT (no winner). A later target / policy revision
is therefore invisible at an earlier cutoff. Contexts (`{animalId, goalRef?,
productionSystemRef?, attributes?}`) are query context, not records: an absent field is UNKNOWN;
a duplicate animal with different content fails closed (identical repeats idempotent); a context
for an animal that is not a scope member is unused.

**Day convention and number representation.** Values are IEEE-754 binary64. Elapsed time is the
exact signed integer pair (seconds, nanoseconds) between the two C1 instant keys (whole seconds
via ECMAScript `Date.parse` of the already strictly validated `YYYY-MM-DDTHH:MM:SSZ` prefix —
pure parsing, no clock or local time); elapsed days = (seconds + nanoseconds / 10^9) / 86 400 in
that order (one correctly rounded division for whole-second instants). Gain = end kg − start kg
(negative kept, never clamped); ADG = gain ÷ elapsed days (kg/day). Nothing is rounded; tolerance
bands are `target − below` / `target + above` in binary64; every comparison uses the unrounded
values with no epsilon (CAT-INV-019).

**Points and derivations** (precedence lists also in the module headers). Live C4 observations in
view are grouped by instant: CONFLICT (more than one at the instant, or in a competing-correction
branch) > EXCLUDED (single observation whose basis a supplied ACCEPTED_BASES policy rejects;
reported in `quality.excludedRecordIds`; a CONFLICT point is never excluded) > UNSUPPORTED (no
exact kg) > USABLE. Interval (two points): INVALID (elapsed ≤ 0) > EVIDENCE_CONFLICT (a
MINIMUM_INTERVAL / ACCEPTED_BASES policy in conflict, or a CONFLICT point) > UNSUPPORTED >
INSUFFICIENT_EVIDENCE (supplied minimum interval not met: elapsed days < minimum days) >
INVALID (gain or ADG not finite binary64: `..._VALUE_NOT_REPRESENTABLE`) > DERIVED. Period = first → last non-excluded window point: policy conflict ⇒ EVIDENCE_CONFLICT;
fewer than two points ⇒ INSUFFICIENT_EVIDENCE (or the single point's CONFLICT / UNSUPPORTED);
else the interval rule. Per-interval list over consecutive non-excluded points. Every derivation
is a `DERIVED_VALUE` identified by its source record ids + convention version; a DERIVED value
carries the trace (formula, convention + version, START/END inputs with record id, canonical
instant, kg, recorded value/unit, method, basis, information class and supplied quality, exact
elapsed, units, bounding policy). Evidence basis: UNKNOWN if any input basis is UNKNOWN, else the
common basis, else MIXED (no ESTIMATED/DERIVED ranking asserted). Mixed collection methods ⇒
`CATTLE_PERFORMANCE_MIXED_COLLECTION_METHODS`; no supplied minimum interval / quality policy ⇒ no
threshold applied and `..._NO_MINIMUM_INTERVAL_POLICY` / `..._NO_QUALITY_POLICY` limitations.
Coverage (descriptive): observation and point counts by state, first/last instant, span days,
largest gap days, interval count (`null` spans with fewer than two points).

**Trend.** No live TREND policy ⇒ `NO_POLICY` (never a default); conflicting TREND policies ⇒
EVIDENCE_CONFLICT; period not DERIVED ⇒ its state; else FALLING (ADG < fallingBelow), RISING
(ADG > risingAbove), FLAT (both bounds inclusive).

**Target comparison** (per animal, one per known target id; REQUIRED: one live target version
with a finite band, a resolved observed metric, every applicability input it restricts on
KNOWN, review state PRODUCTION). Precedence: target versions in conflict ⇒ EVIDENCE_CONFLICT >
a band bound not finite binary64 ⇒ INVALID (`..._VALUE_NOT_REPRESENTABLE`, bounds `null`) >
observed metric unresolved ⇒ INVALID / EVIDENCE_CONFLICT / INSUFFICIENT_EVIDENCE (ADG: the
period; WEIGHT_AT: the point at exactly `at` among all in-view observations — none,
unsupported, excluded or `at` after `effectiveAt` ⇒ INSUFFICIENT_EVIDENCE; CONFLICT ⇒
EVIDENCE_CONFLICT; required evidence is resolved before any applicability or review outcome,
CAT-INV-009) > a restricted context field absent ⇒ INSUFFICIENT_EVIDENCE
(`..._APPLICABILITY_UNKNOWN`; applicability inputs must be KNOWN before "not applicable") >
`effectiveAt` outside the target validity, animal not in the target's animal set, or a known
goal / production system / attribute mismatch ⇒ TARGET_NOT_APPLICABLE > review state not
PRODUCTION ⇒ TARGET_UNVERIFIED > BEHIND (observed < lower) / AHEAD (observed > upper) /
ON_TRACK. No known target ⇒ `targetOutcome: "NO_TARGET"` and no
comparison. A comparison never supplies a target; a prediction is never compared.

**Prediction (optional).** Only when `projectionAt` is supplied: `informationClass:
"PREDICTION"`, method `LINEAR_EXTRAPOLATION_OF_PERIOD_ADG` (last period kg + period ADG ×
elapsed days to `projectionAt`), fixed assumptions and limitations; `NOT_PROJECTED` (with the
period state) when the period is not DERIVED, or with `INVALID` when the projected weight is not
finite binary64. Never an observation, never used for comparison or
aggregation.

**Aggregation.** Over the contract's scope: members (in member order), and the C4 membership
`unknown` / `conflict` / `invalid` sets reported (no weights exist for them). Period ADG and gain
distributions: `count/min/max/mean/median` over DERIVED values only (mean = ascending-order sum ÷
n, or Σ v ÷ n when that sum is not finite; even-count median = (a + b) ÷ 2, or a ÷ 2 + b ÷ 2 when
not finite); unresolved animals listed by state; no known value ⇒ `statistics: null` (never zero).
`noTargetAnimalIds`; per target id the members by comparison state.

**Fingerprints.** Both are result fingerprints over semantic payloads (every C5 output instant in
canonical nine-digit spelling, sorted sets, explicit unknown states). The animal result binds
`effectiveAt`, `knowledgeCutoff`, window, projection instant, the resolved policies, the exact
target definitions relied on and every output field (including the C4 series fingerprint,
context and target refs/values); the
evaluation binds the same plus the C4 contract fingerprint, the exact target definitions relied
on and the aggregate. Input order, key order and equivalent instant spellings do not change them;
any weight, target, policy, source binding, context, window or time does. Change detection only,
not signatures.

**Known limitations.** Weight-at-date targets need an observation at exactly the target instant
(no interpolation). Policies have no validity period (admission by knowledge time and version
supersession only). Applicability contexts are caller-supplied query context (goal matching
arrives through C6); reproducing a historical result requires resupplying the same context.
Interior conflicted / unsupported points do not change the period value (they are reported in
the interval list and quality). Review state is as supplied with the target version; C5 does not
evaluate C0 review records. A target's validity is checked at `effectiveAt`.

**Exclusions.** No built-in target, growth curve, breed/sex standard, ADG constant, tolerance or
trend threshold; no goals/intent management (C6), programmes (C7), recommendations or economics
(C8), Plan (C9), UI (C10), feed modelling, persistence, schema, migration, AI, network or clock;
no change to `livestock.ts`, legacy types, C4 or any earlier phase.

## Cattle C6 — Production goal engine (2026-10-13)

C0 (`61c1124`), C1 (`c5b25f2`), C2, C3, C4 and C5 (frozen by their campaign receipts) are
**frozen**; C6 changes no earlier file except one additive `export * from "./goals";` line in
`src/domain/cattle/index.ts`. New, **non-frozen** pure modules under `src/domain/cattle/goals/`
(barrel `goals/index.ts`); tests `goals/goals.test.ts` (synthetic `SYNTH-*` animals, scopes,
goals, actors, registries, rules and targets only). Explicit, versioned, bitemporal production
intent — information class **INTENT, never FACT** — with history, structural intent-conflict
reporting, a reproducible `GoalSnapshotRef`, data-only goal → rule / target routing and
explicit-ref C5 target applicability. **No inferred goal, no default goal, no built-in route,
target or science** (CAT-INV-022/027). No persistence, schema, migration, UI, AI, network or
clock. Shared contract: `docs/farm-return-next/cattle/` (CAT-INV-001–014, 021–023, 025–027).

**Reuse decisions.** Canonical boundary: C2 `toCanonicalPlainData`/`canonicalField` on every
whole request. Instants: C1 `isValidAnimalInstant`/`animalInstantKey`/`compareInstants`/
`intervalCovers`; canonical spellings via C2 `canonicalObligationInstant`. Append-only collection
and as-of-cutoff supersession through C2 `collectBitemporalRecords`/`resolveBitemporalRecords`
unchanged. Provenance source categories are C1 `ANIMAL_DATA_SOURCE_CATEGORIES`; calendar dates C0
`isValidCalendarDate`; rule routes name a C0 `RuleVersionRef`. Target weight units and the only
conversion come from the C4 barrel (`WEIGHT_UNITS`, `WEIGHT_UNIT_CONVERSIONS`): kilograms are the
identity, any other unit stays as recorded with canonical value UNSUPPORTED — no factor invented.
C5 is consumed only as its canonical output (`PerformanceEvaluation`, re-verified with C5
`verifyPerformanceFingerprint`) through the C5 barrel; no raw C4/C5 record or internal module is
read (CAT-INV-014/023). Generic readers (`isRecord`, `hasOnlyFields`, `oneOf`, `nullableRef`,
`rawIdentityKey`, `fingerprintOf`) from C3 `health/health-input.ts`. Fingerprints reuse
`assessment-integrity.ts` canonicalisation and SHA-256 unchanged through the phase-local wrapper
`{kind, goalPayloadVersion: 1, payload}` (template: C2 `obligation-integrity.ts`) with new kinds
`CATTLE_GOAL_SNAPSHOT`, `CATTLE_GOAL_PROJECTION`, `CATTLE_GOAL_ROUTING` and
`CATTLE_GOAL_TARGET_APPLICABILITY` — no existing kind, payload version or canonicalisation changes.

| Module | Contract |
|---|---|
| `goal-declaration.ts` | `ProductionGoalDeclaration` (`goalId`, `version`, `supersedesVersions`, `action` `DECLARE` \| `END` \| `WITHDRAW`, `subject` `{kind: "ANIMAL", animalId}` \| `{kind: "SCOPE", scopeRef}`, `goalType` ∈ `PRODUCTION_GOAL_TYPES` = `BREEDING`/`FINISHING`/`REPLACEMENT`/`RETAIN`/`SALE`, `targetWeight {value, unit, canonical}` \| `null`, `targetDate` (`YYYY-MM-DD`) \| `null`, `targetOutcome {scheme, code}` (opaque, source-coded) \| `null`, `validFrom`/`validTo` (inclusive/exclusive, `null` = open), `declaredBy {actor, role ∈ GOAL_DECLARER_ROLES}`, `provenance {sourceCategory, sourceSystem, sourceRecordRef, receivedAt}`); `GoalVersionRef`; `GOAL_TYPE_REF_PREFIX` / `goalTypeRef`. Admission and materialisation helpers are module-internal |
| `goal-projection.ts` | `projectProductionGoals(request, hash)` → `GoalProjection` (status, `inForce`, `activeGoals`, `conflicts`, `suggestions`, `history`, `issues`, `snapshot: GoalSnapshotRef`, fingerprint); `verifyGoalSnapshotRef({snapshot, declarations}, hash)`; `MUTUALLY_EXCLUSIVE_GOAL_TYPE_PAIRS` |
| `goal-routing.ts` | `routeProductionGoals({declarations, query, registry}, hash)` → `GoalRouting`; `GoalRoutingRegistry` / `GoalRoutingEntry` / `GoalRoute`; `EMPTY_GOAL_ROUTING_REGISTRY` |
| `goal-target-applicability.ts` | `resolveGoalTargetApplicability({declarations, query, performance}, hash)` → `GoalTargetApplicability` |
| `goal-integrity.ts` | `computeGoalFingerprint`/`verifyGoalFingerprint`, `CATTLE_GOAL_PAYLOAD_VERSION` |

**Records, identity and time.** Identity is `goalId` + `version` (exact strings); a `goalId` may
not start with `CATTLE_GOAL_TYPE:` (reserved for goal-type refs). Same identity + identical
content (instants by instant) is idempotent; same identity + different content — an invalid copy
included — fails closed (CAT-INV-008). A correction, an ending and a withdrawal are new versions
naming earlier versions of the same goal in `supersedesVersions`; `END` and `WITHDRAW` must
supersede at least one version, and `END` must carry a `validTo`. Every known version of a goal
must share its subject and standing (`IDENTITY_SCOPE_MISMATCH` otherwise), so a SYSTEM record can
never supersede, end, withdraw or become a declared goal. Valid time is the declaration period
`[validFrom, validTo)`; knowledge time is `provenance.receivedAt`. Admission order: a readable
`receivedAt` after the cutoff sets the record aside before any other read (CAT-INV-003/004); an
unreadable one fails closed (CAT-INV-005); identity before validity; content, declarer and
provenance validation; supersession at the cutoff (unknown target, out-of-scope link or cycle ⇒
fail closed); more than one live version, or competing corrections, of one goal ⇒ version conflict
with no winner (CAT-INV-026). A later goal change is therefore invisible at an earlier cutoff, and
the history (every known version for the subject, live or superseded, with its superseding
versions) is reportable.

**Projection** (query `{subject, effectiveAt, knowledgeCutoff}`; a malformed request or query ⇒
`ok: false`, `CATTLE_GOAL_*` request codes). A goal is in force when its single live version is not
a withdrawal and its period covers `effectiveAt`. REQUIRED: a fully admissible ledger and a single
resolved live version for each goal of the subject that could be in force. Status precedence:
**INVALID** (any admitted record malformed, an identity collision, an identity-scope mismatch or an
invalid link anywhere in the supplied ledger; no goal reported) > **INTENT_CONFLICT** (a declared
goal's competing versions could be in force — `COMPETING_VERSIONS` — or a structural conflict) >
**ACTIVE** (≥ 1 declared goal in force) > **NONE** (no declared goal in force; never a default).
`activeGoals` is non-empty only when ACTIVE. SYSTEM records are listed under `suggestions` (standing
`SUGGESTED`) and are never in force, never ACTIVE and never in the snapshot.

**Structural compatibility matrix (complete).** Two declared goals in force for the identical
subject at the same instant conflict only when (a) their types are mutually exclusive by
definition — exactly `SALE` vs `RETAIN` (`MUTUALLY_EXCLUSIVE_GOAL_TYPES`) — or (b) they share a
type but declare different outcome fields (`SAME_TYPE_DIFFERENT_OUTCOME`). Every other combination
(for example `FINISHING` with `BREEDING`) is reported as declared; judging it is a product
decision outside C6.

**`GoalSnapshotRef`** = `{goalPayloadVersion, subject, effectiveAt, knowledgeCutoff, status, goals
(in-force goal version refs), conflicts (kind + refs), fingerprint}`. `CATTLE_GOAL_SNAPSHOT` is a
result fingerprint over the subject, both canonical times, the status, the complete materialised
content of every goal version in force or in conflict, and any ledger issues. Input order, key
order, equivalent instant spellings, records for other subjects and goals not in force at
`effectiveAt` do not change it; any goal type, outcome, unit, version, declarer, knowledge time,
period, either query time or status does. `verifyGoalSnapshotRef` re-projects at the snapshot's
own subject and times and requires an identical snapshot, so a recommendation bound to an old
snapshot stays reproducible after later goal changes. `CATTLE_GOAL_PROJECTION` binds the whole
projection, history and suggestions included.

**Routing.** The registry is data (`{registryId, version, entries}`; entry `{entryId, receivedAt,
match: {kind: "GOAL_TYPE", goalType} | {kind: "GOAL_ID", goalId}, routes: ({kind: "RULE", ruleId,
version} | {kind: "TARGET", targetId})[]}`), never executable, and ships empty
(`EMPTY_GOAL_ROUTING_REGISTRY`). Entries are admitted at the cutoff by `receivedAt` (later
invisible, unreadable fails closed), identity before validity; a malformed registry or entry ⇒
`ok: false`. Each ACTIVE goal gets the sorted union of routes of the entries matching its exact
type or exact id (`ROUTED`) or `NO_ROUTED_RULES`. Overall state: `GOAL_INVALID` >
`GOAL_INTENT_CONFLICT` > `NO_ACTIVE_GOAL` > `ROUTED` > `NO_ROUTED_RULES`; unresolved goals are never
routed. Routing names rules / targets and evaluates neither. `CATTLE_GOAL_ROUTING` binds the
snapshot, registry id / version and every admitted entry.

**C5 target applicability.** Animal subjects only. The C5 evaluation must verify and be evaluated
at exactly the query's times (`..._PERFORMANCE_INVALID` / `..._PERFORMANCE_TIME_MISMATCH`). Each
target version is validated by C5's own `materialisePerformanceTarget` and must already be in its
materialised form; anything C5 rejects fails closed as `..._PERFORMANCE_INVALID`. C6 keeps no copy of
C5's target or provenance schema (CAT-INV-014/023/024) and adds only its own checks: the version
belongs to its target id and was received no later than the cutoff. Only each target's id, versions
and `applicability.goalRef` are read. A `goalRef` matches an ACTIVE goal
when it equals exactly its `goalId` (`GOAL_ID`) or `goalTypeRef(goalType)` (`GOAL_TYPE`) — no fuzzy,
case-folded or bare-type match. Per-target precedence: `TARGET_EVIDENCE_CONFLICT` (C5 versions in
conflict) > `NOT_GOAL_SPECIFIC` (`goalRef: null`) > `GOAL_INVALID` > `GOAL_INTENT_CONFLICT` >
`APPLICABLE` / `NOT_APPLICABLE` (ACTIVE without a match, or NONE). Target validity, animal set,
other applicability fields and review state remain C5's comparison.
`CATTLE_GOAL_TARGET_APPLICABILITY` binds the snapshot, the C5 evaluation fingerprint and every
per-target result.

**Known limitations.** A malformed record anywhere in the supplied ledger makes every subject's
projection INVALID (whole-ledger fail closed); adapters should supply the relevant ledger. Scope
goals are projected only for that scope ref — scope membership is not resolved, and an animal does
not inherit a scope's goals. Routing entries cannot be retired by data (a changed registry is a new
registry version); reproducing a routing or applicability result requires resupplying the same
registry or C5 evaluation. Target weight in a unit without an exact conversion is UNSUPPORTED
canonically. C5 still receives its goal context as caller-supplied `goalRef`s; C6 does not change C5.

**Exclusions.** No goal inference from facts (sex, age, category) and no suggestion generation;
no compatibility semantics beyond the structural matrix; no biological or economic target,
programme (C7), recommendation (C8), Plan (C9) or UI (C10); no persistence, schema, migration, AI,
network or clock; no change to any earlier phase.

## Cattle C7 — Veterinary health-programme engine (rebuilt 2026-10-14)

**Rebuilt from the C7 phase base (`fea84ae`)** under a human decision after the first C7
implementation did not converge under repair-in-place (post-closure audit finding: an unversioned
product reference bypassed C3 product binding). The earlier attempt stays in the campaign history;
this section is the complete acceptance contract of the rebuild. C0–C6 are **frozen** (campaign
receipts); C7 changes no earlier file except one additive `export * from "./programmes";` line in
`src/domain/cattle/index.ts`. New, **non-frozen** pure modules under `src/domain/cattle/programmes/`
(barrel `programmes/index.ts`); tests `programmes/programmes.test.ts` (synthetic `SYNTH-*` data only).
A declared veterinary / risk-based programme framework deriving per-occurrence state at an explicit
instant: **not a vaccination or prescribing engine** — no universal or default schedule, no product /
dose / timing choice, no diagnosis, no conversion of a risk signal into a programme, no real
programme content; `PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS` is **empty** (CAT-INV-027). No
persistence, schema, migration, UI, AI, network, connector or clock. Shared contract:
`docs/farm-return-next/cattle/` (CAT-INV-001–014, 016, 017, 021–028).

**Reuse decisions.** Canonical boundary: C2 `toCanonicalPlainData`/`canonicalField` on the whole
request and on every evaluation passed back in. Instants: C1 `isValidAnimalInstant`/
`animalInstantKey`/`compareInstants`; canonical spellings and exact UTC arithmetic via C2
`canonicalObligationInstant`/`addObligationOffset`/`obligationOffsetSeconds`/`isValidObligationOffset`/
`utcStartOfCalendarDate`/`utcCalendarDateOf`. Append-only collection and as-of-cutoff supersession
through C2 `collectBitemporalRecords`/`resolveBitemporalRecords` unchanged. Production state, review
dimensions and minimum dimensions per classification are C0's; provenance source categories are C1
`ANIMAL_DATA_SOURCE_CATEGORIES`; shape readers (`isRecord`, `oneOf`, `rawIdentityKey`,
`fingerprintOf`, `sourceVersionRefOf`, `nullableRef` — wrapped so a missing value is never `null`)
and `VETERINARY_EVENT_TYPES` come from C3. Animal facts only through C1 (`rematerialiseAnimalLedger`,
`projectAnimalSnapshot`, `computeAnimalSnapshotFingerprint`); group membership only through C4
`resolveGroupScope`; C3 health only through C3 `projectAnimalHealth` (gates via
`projectWithdrawalHardGates`) and C2 obligations only through C2 `evaluateHerdObligations` (gates via
`projectObligationHardGates`), both **invoked by C7 over the request's canonical C3 / C2 evidence**
(predecessor composition, below) — a derived C3 projection or C2 evaluation is never accepted as input.
C3 withdrawal, C3 product binding and C2 obligation state are never re-derived (CAT-INV-014/023). Pack compatibility via C0
`RuleEvaluationRecord` / `buildRecommendationEvidencePack`. Fingerprints reuse
`assessment-integrity.ts` unchanged through the phase-local wrapper
`{kind, programmePayloadVersion: 1, payload}`: `CATTLE_PROGRAMME_DEFINITION` (review / semantic),
`CATTLE_PROGRAMME_ANIMAL_STATUS` and `CATTLE_PROGRAMME_STATUS` (result).

| Module | Contract |
|---|---|
| `programme-fields.ts` | `PROGRAMME_FIELD_POLICY` (the one field-presence policy, below; compile-time checked against the record interfaces), `ProgrammeFieldRule`, `ProgrammeRecordType`, `conformsToPolicy`, `explicitNullableRef`, `explicitRefList`. Module-internal |
| `programme-definition.ts` | `HealthProgrammeDefinition` (`programmeId`, `version`, `supersedesVersions`, `classification` ∈ `VETERINARY_PROGRAMME` / `FARMER_INTENT`, `declaredBy {role VETERINARIAN \| FARMER, actor}` — classification ⇔ role, `validFrom`/`validTo`, `applicability` `EXPLICIT_SET {animalIds}` \| `GROUP {groupRef}` \| `CRITERIA {sex, bornOnOrAfter, bornBefore}` (≥ 1 non-null), `actions` (`actionId`, opaque `actionKind`, `productRef {productId, productVersion} \| null`, `schedule {anchor FIXED_INSTANT{at} \| DATE_OF_BIRTH, window {opensAfter, dueAfter, boundary}, repeat {interval, count} \| null}`, `completion {recordKind, eventTypes, matchCriteria}`, `gates`, `gateRole` — never HARD_GATE for FARMER_INTENT), C0 `productionState`, `provenance {sourceCategory, sourceSystem, sourceRecordRef, receivedAt, sourceDocument}`); `ProgrammeReviewRecord`; `computeProgrammeDefinitionFingerprint`; `programmeInformationClass`; `PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS` (empty); `PROGRAMME_MAX_OCCURRENCES_PER_ACTION` (1000, an engine resource bound). Admission is module-internal |
| `programme-completion.ts` | `ProgrammeCompletionRecord` (`recordId`, animal, programme id + exact `programmeVersion`, `actionId`, exact `occurrenceId`, `COMPLETION` with `evidence` `{DECLARED, completedAt}` \| `{HEALTH_RECORD, healthRecordId}`, or `RETRACTION` (`evidence: null`, supersedes ≥ 1), `declaredBy` veterinarian / farmer, `provenance`, `supersedes` within one animal / programme / action / occurrence). Types only in the barrel |
| `programme-schedule.ts` | `ProgrammeOccurrence`; `programmeOccurrenceId` = JSON `["<programmeId>","<actionId>","<animalId>","<anchorKind>","<canonical anchor>",<n>]` (structured, unambiguous, version-independent) |
| `programme-evidence.ts` | The resolved-evidence model: `EvidenceResolution<T>` (resolved value, or an unresolved outcome `INVALID_EVIDENCE` / `EVIDENCE_CONFLICT` / `REVIEW_REQUIRED` / `UNKNOWN` / `INSUFFICIENT_EVIDENCE` with reason codes) and the only translations of predecessor states into it (C1 resolution, C3 product binding, C4 membership). Module-internal |
| `programme-consumed.ts` | The ONE consumed-field schema (CAT-INV-028): for every C1 / C2 / C3 / C4 field C7 reads — owner, payload version, presence, null semantics, runtime type, frozen vocabulary, identifier / instant / date format, nested structure; `consume(spec, value)` validates and types the value by the schema alone (`ConsumedOf<S>`), so reading an undeclared predecessor field does not compile. Vocabularies are frozen runtime constants or lists compile-checked to equal the frozen unions. Module-internal |
| `programme-predecessors.ts` | THE predecessor composition boundary: invokes the frozen C1 / C4 / C3 / C2 engines over canonical evidence (C1 `rematerialiseAnimalLedger` / `projectAnimalSnapshot`; C4 `resolveGroupScope`; C3 `projectAnimalHealth` + `projectWithdrawalHardGates`; C2 `evaluateHerdObligations` + `projectObligationHardGates`), passes their outputs through the consumed-field schema and builds C7's internal evidence representation (`AnimalContext`); `ProgrammeTrustedInputs` (the C2 implementation registry). No other C7 module reads a predecessor output. Module-internal |
| `programme-membership.ts` | Membership (explicit set / C4 group / C1 criteria) at an instant with its evidence fingerprint; the occurrence anchor. Module-internal |
| `programme-matching.ts` | Completion evidence per occurrence: declarations, explicit C3 links and declared criteria, every C3 record **resolved before it is matched**. Module-internal |
| `programme-state.ts` | `PROGRAMME_OCCURRENCE_STATES`, `PROGRAMME_STATUS_PRECEDENCE`, `foldProgrammeStates`; per-occurrence state |
| `programme-engine.ts` | `evaluateHealthProgrammes(request, hash)` → `ProgrammeStatusEvaluation`; `verifyProgrammeStatusEvaluation` |
| `programme-hard-gates.ts` | `projectProgrammeHardGates(evaluation, animalId, hash)`, `programmeGateRuleId`, `programmeStateToPackState` |
| `programme-integrity.ts` | `computeProgrammeFingerprint`/`verifyProgrammeFingerprint`, `CATTLE_PROGRAMME_PAYLOAD_VERSION` |
| `programme-types.ts` | Request and output types (`HealthProgrammeRequest`, `ProgrammeStatusEvaluation`, `ProgrammeAnimalStatus`, `ProgrammeOccurrenceRecord`, `ProgrammeMembership`, `ProgrammeCompletionSummary` with `UnresolvedNote {ref, reason, outcome}`, issue codes); types only |

**Field-presence policy (decision B1).** Canonical C7 data distinguishes MISSING from explicit `null`
from explicit `[]` from a value. Every field of every C7-owned record must be present and not
`undefined`; a missing field is invalid and fails closed — it never acquires a meaning. An explicit
`null` / `[]` is accepted only where this table gives it a meaning; unknown fields are rejected.
C1–C4 keep their own (more lenient) semantics. R = required value, N = required (`null` permitted),
A = required array (`[]` permitted), NE = required non-empty array:

| Record type | Fields |
|---|---|
| `request` | `definitions` A, `reviews` A, `completions` A, `ledgers` A, `health` N (`null` = no C3 evidence supplied), `obligations` N (`null` = no C2 evidence supplied), `query` R |
| `healthEvidence` | `foodProducts` A (C3 requires ≥ 1), `productRecords` A, `animals` A — C3's canonical inputs |
| `healthAnimal` | `animalId` R, `healthRecords` A (`[]` = supplied, none recorded; an evaluated animal not listed has no C3 evidence supplied) |
| `obligationEvidence` | `catalogue` R, `obligationIds` A, `evidence` A — C2's canonical inputs |
| `query` | `effectiveAt` R, `knowledgeCutoff` R |
| `definition` | `programmeId` R, `version` R, `supersedesVersions` A (`[]` = supersedes none), `classification` R, `declaredBy` R, `validFrom` R, `validTo` N (`null` = open-ended), `applicability` R, `actions` NE, `productionState` R, `provenance` R |
| `declarer` | `role` R, `actor` R |
| `definitionProvenance` | `sourceCategory` R, `sourceSystem` N, `sourceRecordRef` N, `receivedAt` R, `sourceDocument` N (`null` = no document binding) |
| `sourceDocument` | `sourceId` R, `version` R, `contentFingerprint` R |
| `fingerprint` | `schemaVersion` R, `algorithm` R, `digest` R |
| `applicabilityExplicitSet` | `kind` R, `animalIds` NE |
| `applicabilityGroup` | `kind` R, `groupRef` R |
| `applicabilityCriteria` | `kind` R, `sex` N, `bornOnOrAfter` N, `bornBefore` N (`null` = no such criterion) |
| `action` | `actionId` R, `actionKind` R, `productRef` N (`null` = no product constraint), `schedule` R, `completion` R, `gates` A (`[]` = no gates), `gateRole` R |
| `productRef` | `productId` R, `productVersion` N (`null` = any **C3-BOUND** version) |
| `schedule` | `anchor` R, `window` R, `repeat` N (`null` = a single occurrence) |
| `anchorFixedInstant` / `anchorDateOfBirth` | `kind` R, `at` R / `kind` R |
| `window` | `opensAfter` R, `dueAfter` R, `boundary` R |
| `offset` | `amount` R, `unit` R |
| `repeat` | `interval` R, `count` R |
| `completionCriteria` | `recordKind` N (`null` = declarations only), `eventTypes` N (non-empty for VETERINARY_EVENT, else `null`), `matchCriteria` R |
| `review` | `reviewId` R, `programmeId` R, `programmeVersion` R, `definitionFingerprint` R, `dimension` R, `decision` R, `reviewer` R, `reviewedAt` R, `supersedes` A |
| `reviewer` | `role` R, `actor` R |
| `completion` | `recordId` R, `animalId` R, `programmeId` R, `programmeVersion` R, `actionId` R, `occurrenceId` R, `kind` R, `evidence` N (`null` only for a RETRACTION), `declaredBy` R, `provenance` R, `supersedes` A |
| `completionProvenance` | `sourceCategory` R, `sourceSystem` N, `sourceRecordRef` N, `receivedAt` R |
| `evidenceDeclared` / `evidenceHealthRecord` | `kind` R, `completedAt` R / `kind` R, `healthRecordId` R |

**Predecessor evidence resolution (core rule).** A resolved C7 outcome (COMPLETED, NOT_APPLICABLE,
DUE, OVERDUE, BLOCKED, a PASS gate) may depend only on predecessor evidence that is **resolved for
every dimension required to establish it**. An explicit `null` may waive a *matching constraint*; it
never waives the requirement for authoritative predecessor evidence. Every matcher runs (1)
evidence authority / resolution, then (2) value matching; only a resolved, matching record counts.
The only translations of predecessor states (`programme-evidence.ts`):

| Predecessor state | C7 resolution |
|---|---|
| C1 `KNOWN` | resolved |
| C1 `UNKNOWN` / `CONFLICTING_EVIDENCE` / `INVALID_EVIDENCE` | UNKNOWN / EVIDENCE_CONFLICT / INVALID_EVIDENCE |
| C4 `MEMBER` / `NOT_MEMBER` | resolved (member / non-member) |
| C4 `UNKNOWN` / `EVIDENCE_CONFLICT` / `INVALID`, scope rejected, animal absent | UNKNOWN / EVIDENCE_CONFLICT / INVALID_EVIDENCE / INVALID_EVIDENCE / UNKNOWN |
| C3 product binding `BOUND` | resolved (the bound product version) |
| C3 binding `UNKNOWN` / `UNSUPPORTED` / no medicine-ledger entry | INSUFFICIENT_EVIDENCE |
| C3 binding `INVALID` / `EVIDENCE_CONFLICT` / `REVIEW_REQUIRED` | INVALID_EVIDENCE / EVIDENCE_CONFLICT / REVIEW_REQUIRED |
| C3 record `SUPERSEDED` (explicitly linked) / unknown time / unknown product id / unknown record | INSUFFICIENT_EVIDENCE |
| C3 record `inCompetition` | EVIDENCE_CONFLICT |
| C3 projection not supplied where C3 evidence is needed | INSUFFICIENT_EVIDENCE |

Required dimensions per completion path (a waived dimension is not required):

| Path | Authority required before any match | Value matching |
|---|---|---|
| Declaration `DECLARED` | admitted, live, not competing, exact governing version | `completedAt` vs window and `effectiveAt` |
| Explicit link `HEALTH_RECORD` | projection supplied; record known (else not yet occurred / unknown), LIVE, not competing; for MEDICINE_ADMINISTRATION with a `productRef`: product id identified **and** C3 binding `BOUND`; valid time known | record kind = `recordKind` (`null` ⇒ not accepted); event type ∈ `eventTypes`; product id = `productId`; bound version = `productVersion` when non-null |
| Declared criteria (`matchCriteria`) | projection supplied (window opened); among LIVE records of `recordKind` that could match (event type declared / product id equal or unidentified) with a time in or unknown relative to the window: not competing, time known, product identified and C3 binding `BOUND` | as above, inside the window, by `effectiveAt` |
| Membership | C4 / C1 resolution of every declared criterion (a `null` criterion is not a dimension) | member / listed / criteria equal |
| Anchor | C1 date of birth KNOWN (`DATE_OF_BIRTH`) | — |
| Evidence exclusivity (human decision on review finding H1) | a C3 record evidences at most one occurrence of an action: a record claimed for two or more occurrences of the same action (live governing-version links naming them, and/or — under declared criteria — the opened window holding its known time) is EVIDENCE_CONFLICT in every claiming occurrence and counts in none; the same record may evidence different actions | — |
| Declarer role (human decision on review finding M1) | a declaration's VETERINARIAN role counts only with provenance `sourceCategory` VETERINARY_SOURCE, otherwise it is a FARMER declaration (B2 applies); a VETERINARY_PROGRAMME definition needs VETERINARY_SOURCE provenance (else `..._INVALID_CLASSIFICATION`) | — |
| Gates | supplied C2 / C3 hard-gate state for every declared gate (not supplied ⇒ blocking) | PASS / NOT_APPLICABLE do not block |

**Predecessor composition (C7 architecture review 2026-10-14, after findings F003 / F007 / F008).** A
supplied derived predecessor output cannot be authenticated: its fingerprints can be recomputed, and
proving it was derived from evidence would mean restating the predecessor's derivation inside C7. So C7
never accepts one. It **composes** its predecessors: the request carries their canonical evidence (C1
ledgers; C3 health records, product records and food products; C2 catalogue, obligation ids and fulfilment
evidence) and C7 invokes their frozen engines in-process — delegation to the authoritative interpreter,
which CAT-INV-023 permits — so every C2 / C3 result C7 reasons over is authoritative by construction. The
only non-canonical input is C2's trusted implementation registry, passed as
`evaluateHealthProgrammes(request, hash, {obligationImplementations})` exactly as C2 itself takes it
(never request data). Each engine output passes the consumed-field schema (CAT-INV-028: version, type,
vocabulary, format; `consume` returns a fresh copy of only declared fields) before C7 reads it; every
state translation is exhaustive at runtime. Evidence a frozen engine rejects fails the request closed
(`..._HEALTH_EVIDENCE_INVALID` / `_UNKNOWN_ANIMAL` / `_DUPLICATE_ANIMAL`, `..._OBLIGATION_EVIDENCE_INVALID`
incl. C2 herd and catalogue issues, `..._OBLIGATION_IMPLEMENTATIONS_MISSING`). Completeness of the canonical
evidence supplied is the adapter's responsibility, as for C2 / C3 themselves. `productVersion: null` means
any C3-BOUND version. Hostile JavaScript stays outside the canonical contract.

**What C7 binds per predecessor (downstream binding rule, CAT-INV-021 / 023).** C7 binds each owner's
canonical admitted output, never the raw input the owner derived it from: C1 — the snapshot fingerprint
(C1's documented representation-sensitive result fingerprint) for the facts and anchor it reads; C4 — the
`CATTLE_GROUP_SCOPE` fingerprint of every membership resolution consulted; C3 — the timeline, medicine-ledger
and withdrawal-gate fingerprints; C2 — the `CATTLE_OBLIGATION_STATE` record fingerprints. The raw C1
ledger, C3 health / product records and food products, and C2 catalogue / evidence / obligation ids are
passed to their owners and never bound by C7: knowledge-cutoff admission, normalisation, ordering,
canonical equality, equivalence and exclusion of future knowledge belong to the owner, and a raw input that
leaves the owner's output unchanged leaves C7's result byte-identical. C7's own inputs (definitions,
reviews, declarations, query) are bound as C7 materialises and admits them.

**Request and admission.** `HealthProgrammeRequest` = `{definitions, reviews, completions, ledgers (C1;
the animals evaluated, one each), health (canonical C3 evidence | null), obligations (canonical C2 evidence
| null), query {effectiveAt, knowledgeCutoff}}`. Whole-request canonical check
(`CATTLE_PROGRAMME_NON_CANONICAL_INPUT`) → field policy → query → definitions / reviews / declarations
admitted at the cutoff (a readable knowledge time after the cutoff sets the record aside before any
other read; unreadable ⇒ fail closed; identity before validity; content and provenance validation;
supersession with unknown target / out-of-scope link / cycle ⇒ fail closed) → C1 ledgers → C3 composed per
listed animal (its own ledger, the query's times, unfiltered) → C2 composed for the herd of evaluated
ledgers (the predecessor composition above). Any malformed admitted record or rejected predecessor evidence
⇒ `ok: false`.
Issue refs use structured identities (`["<programmeId>","<version>"]`, `["<programmeId>"]`); evidence notes
carry a `refKind` (DECLARATION / HEALTH_RECORD / OCCURRENCE) and conflicts are listed separately as
`conflictingDeclarationIds` / `conflictingRecordIds`, so identities of different namespaces never collapse. Output instants use the
canonical nine-digit spelling. No clock read.

**Versions and review.** Effective-boundary supersession: a version's effective period at a cutoff
is `[validFrom, min(validTo, validFrom of each known direct superseder))`. Exactly one effective
version governs; none ⇒ `NOT_IN_FORCE`; more ⇒ `VERSION_CONFLICT` (no winner). Reviews bind programme
id + version + `CATTLE_PROGRAMME_DEFINITION` fingerprint (all content except production state,
supersession links and knowledge-time provenance); a dimension is APPROVED only when ≥ 1 live bound
review exists and all approve, REJECTED when any rejects, else PENDING. APPROVED = `PRODUCTION` and
every C0 minimum dimension APPROVED.

**Schedule.** Anchor `FIXED_INSTANT` or `DATE_OF_BIRTH` (UTC start of the C1 birth date). Occurrence
n < count: `base = anchor + n × interval`, window `[base + opensAfter, base + dueAfter)` (inclusive end
only for `INCLUSIVE_START_INCLUSIVE_END`); `dueAfter > opensAfter`; repeat windows never overlap.
Before `opensAt` ⇒ before; inside ⇒ in; at or after the end ⇒ after. Unrepresentable ⇒ INVALID_EVIDENCE.

**State precedence** (first match wins). Programme level, per animal: EVIDENCE_CONFLICT (version
conflict) > REVIEW_REQUIRED (not APPROVED) > membership at `effectiveAt` (unresolved ⇒ its outcome;
resolved non-member ⇒ NOT_APPLICABLE). Action level: anchor unresolved ⇒ its outcome; unrepresentable
anchor ⇒ INVALID_EVIDENCE. Occurrence level: INVALID_EVIDENCE (unrepresentable window) >
NOT_APPLICABLE (window opens outside the governing effective period) > GROUP membership when the window
opened (opened windows; unresolved ⇒ its outcome; non-member ⇒ NOT_APPLICABLE) > **evidence outcomes**
— any unresolved candidate, competing declaration / record, or counted completions disagreeing on
timing — folded in `PROGRAMME_STATUS_PRECEDENCE` > REVIEW_REQUIRED (a VETERINARY_PROGRAMME HARD_GATE
action whose counted completions are all NON_VETERINARY — rulings B2 / M2, below; retained as evidence,
never by themselves a pass; `CATTLE_PROGRAMME_COMPLETION_NEEDS_VETERINARY_AUTHORITY`) >
COMPLETED > REVIEW_REQUIRED (only other-version declarations) > UPCOMING > BLOCKED (window open or
passed and a declared gate not PASS / NOT_APPLICABLE) > DUE > OVERDUE. `PROGRAMME_STATUS_PRECEDENCE`:
REVIEW_REQUIRED > INVALID_EVIDENCE > EVIDENCE_CONFLICT > UNKNOWN > INSUFFICIENT_EVIDENCE > BLOCKED >
OVERDUE > DUE > UPCOMING > COMPLETED > NOT_APPLICABLE; an empty set never folds to a resolved state
(INVALID_EVIDENCE). A programme also reports `NOT_IN_FORCE` / `NO_ANIMALS_EVALUATED`; explicit-set
members without a ledger make it INSUFFICIENT_EVIDENCE. Unresolved required evidence never surfaces as
COMPLETED, NOT_APPLICABLE, DUE, OVERDUE or a PASS gate (CAT-INV-009/022).

**Outputs and fingerprints.** `ProgrammeStatusEvaluation` = `{programmePayloadVersion, effectiveAt,
knowledgeCutoff, outcome NO_PROGRAMME | NONE_IN_FORCE | EVALUATED, animalIds, programmes}`; each
`ProgrammeStatus` carries classification, information class, version state, governing version (+ review
state + live bound review records), conflicting versions, full version history, scope summary, status
and one `ProgrammeAnimalStatus` per evaluated animal: membership (with `evidenceFingerprint`: C4
`CATTLE_GROUP_SCOPE` / C1 snapshot / `null` for an explicit set), folded status, records (occurrence,
state, reason codes, completion summary — counted completions with authority, declarer role and record
provenance, unresolved
candidates with their outcome —, gate checks, `membershipAtOpen` for GROUP windows opened), unmatched
declaration ids, every known declaration for the animal and programme, and input fingerprints (C1
snapshot; C3 timeline / medicine ledger / withdrawal gate; C2 record fingerprints). Sorted, detached,
deep-frozen. **Result dependency set = result binding set**: `CATTLE_PROGRAMME_ANIMAL_STATUS` binds
both canonical times, every animal-status field and the complete governing / conflicting version
records with review state and bound review records; `CATTLE_PROGRAMME_DEFINITION` (review fingerprint:
reviewed content without production state, supersession links and knowledge-time provenance) is never
the result binding on its own; `CATTLE_PROGRAMME_STATUS` binds the whole evaluation. Equivalent instant
spellings and input order change none of them; every material dependency change changes all three
(the frozen C1 snapshot fingerprint is representation-sensitive by design).

**Hard-gate projection.** Only `HARD_GATE` actions of veterinarian programmes (governing, or any
version in conflict) → one `RuleEvaluationRecord` per action, `requestedRuleId`
`CATTLE_PROGRAMME_ACTION:["<programmeId>","<actionId>"]` (JSON), classification `VETERINARY_PROGRAMME`,
rule / fingerprint / implementation `null`, reviews from the governing review (version conflict: the C0
minimum dimensions as PENDING), reason codes `CATTLE_PROGRAMME_STATE_<state>:["<actionId>","<occurrenceId>"]`
(records without an occurrence add their reason codes) plus the animal-status fingerprint, `missingInputs` =
the gate rule id; `requiredHardGateRuleIds`,
programme `sourceRefs`; the evaluation is re-verified first (mismatch ⇒ `ok: false`). COMPLETED → PASS;
NOT_APPLICABLE / UPCOMING → NOT_APPLICABLE; OVERDUE / BLOCKED → FAIL; REVIEW_REQUIRED → REVIEW_REQUIRED;
EVIDENCE_CONFLICT → conflicting evidence; DUE / UNKNOWN / INSUFFICIENT_EVIDENCE / INVALID_EVIDENCE →
INSUFFICIENT_EVIDENCE; folded with the programme-level record in C2's restrictiveness order.
FARMER_INTENT programmes are never hard gates and never presented as veterinary or legal.

**Acceptance: every defect class of the first C7 attempt is a regression test** (semantic list, not
finding numbers): counted completion masking unresolved evidence; result fingerprints omitting
completion / review / definition provenance; review fingerprint used as result binding; C2 records
accepted on envelope alone; C3 records accepted on envelope alone; historical group-membership
evidence unbound; ambiguous hard-gate / occurrence / issue identities; required collections missing or
`null` read as `[]`; missing fields acquiring meaning; resolved-state fallbacks; farmer-only completion
of a veterinary hard gate; unversioned product reference bypassing C3 binding (and every other
null-waives-authority path); one C3 record completing several occurrences of an action; a
self-asserted veterinarian role; an unchecked C2 payload version; evidence-note identity collisions;
farmer-recorded C3 evidence alone passing a veterinary hard gate, and a farmer link weakening a resolved
completion; malformed, re-sealed, self-contradictory or incomplete predecessor output reaching evaluation
(findings F003 / F007 / F008) — closed structurally by predecessor composition and proved by the
composition-boundary matrix (every forged / stale / re-sealed / inconsistent derived output at every
injection position), the canonical-evidence tests, a schema matrix generated from the consumed-field
schema over the engines' outputs, and an import allowlist plus type-level drift guard.

**Evidential authority for veterinary hard gates (human rulings B2 and M2).** Every counted completion
carries an `authority`: VETERINARY when a veterinarian-authored completion declaration (role
VETERINARIAN with VETERINARY_SOURCE provenance, M1) or a veterinary-recorded C3 record (C3 provenance
VETERINARY_SOURCE with actor role VETERINARIAN) establishes it — the only veterinary corroboration the
frozen contracts carry (C3 prescription / treatment references are not resolved by C3 and are not used);
otherwise NON_VETERINARY. Farmer-recorded or farmer-declared evidence is valid evidence and is always
retained, but for a VETERINARY_PROGRAMME HARD_GATE action an occurrence whose counted completions are all
NON_VETERINARY is REVIEW_REQUIRED (`CATTLE_PROGRAMME_COMPLETION_NEEDS_VETERINARY_AUTHORITY`) and its gate
never passes; a farmer-recorded record linked by a veterinarian is corroborated. **Monotonicity:** every
independent path is evaluated (a linked record is also a criteria candidate), so adding resolved evidence
never weakens a resolved completion; a genuine conflict or unresolved candidate evidence still prevents a
resolved state. Advisory actions and FARMER_INTENT programmes are unaffected.

## Cattle C8 — Recommendation engine (2026-10-15)

C0–C7 are **frozen** (campaign receipts); C8 changes no earlier file except one additive
`export * from "./recommendations";` line in `src/domain/cattle/index.ts`. New, **non-frozen** pure
modules under `src/domain/cattle/recommendations/` (barrel `recommendations/index.ts`); tests
`recommendations/recommendations.test.ts` (synthetic `SYNTH-*` animals, obligations, products,
programmes, goals, actions, models, rules, sources, value keys, amounts and currency codes only). A
deterministic, evidence-first recommendation engine emitting verified C0 Recommendation Evidence
Packs from one sealed context per animal. **No invented benefit, value, probability, cost, price,
target, ranking weight or effect constant**; no diagnosis, prescribing, treatment choice or legal
interpretation; no clock, network, persistence, schema, migration, UI, Plan job (C9) or AI call
(CAT-INV-017/027). Shared contract: `docs/farm-return-next/cattle/` (CAT-INV-001–028; 015 and 020
primary).

**Reuse decisions.** Canonical boundary: C2 `toCanonicalPlainData` on the whole request. Instants:
C1 `animalInstantKey`/`compareInstants`; canonical spellings, `addObligationOffset` and
`utcCalendarDateOf` from C2. Predecessors only through their frozen engines (below). Pack assembly and
verification: C0 `buildRecommendationEvidencePack` / `verifyRecommendationEvidencePack` unchanged
(never forked); model rules through C0 `evaluateCattleRule` (validation, effective window, version-bound
reviews, source currency and implementation binding stay C0's); implementations resolved with C2
`findObligationImplementation` from the one trusted registry. Append-only economic observations
through C2 `resolveBitemporalRecords`. Money through the existing `money.ts` exports
(`createMoneyAmount`, `zeroMoney`, `addMoney`, `subtractMoney`, `compareMoney`). The consumed-field
schema machinery (`valid`, `consume`, `FieldSpec`) and the C2 / C3 surfaces (`C2_EVALUATION`,
`C3_PROJECTION`) are imported from C7's `programme-consumed.ts` (generic machinery implemented once);
generic readers (`rawIdentityKey`) from C3 `health-input.ts`. Fingerprints reuse
`assessment-integrity.ts` unchanged through the phase-local wrapper
`{kind, recommendationPayloadVersion: 1, payload}` with new result kinds `CATTLE_RECOMMENDATION_CONTEXT`,
`CATTLE_RECOMMENDATION_RECORD`, `CATTLE_RECOMMENDATION_HERD` and the semantic kind
`CATTLE_RECOMMENDATION_MODEL_CONTENT` (model content bound into its rule version) — no existing kind, payload version or
canonicalisation changes. `livestock.ts` economic functions (`calculateFinishingBudget`,
`calculateSellNowVsFinish`, `targetADGForAnimalType`, `concentrateKgPerDay`, `FINISHING_KILL_OUT_PCT`,
`WEANLING_*`) embed constants and are **not** used (pre-start clarification 2).

| Module | Contract |
|---|---|
| `candidate-actions.ts` | `CandidateActionDefinition` (`actionKind` unique per registry, `recordedAt` knowledge time, `description`, `tier` ∈ `RECOMMENDATION_PRIORITY_TIERS`, `benefitClaim` `NONE` (no model may be named) \| `MODELLED`, `applicableGoalTypes` (`null` = goal-independent), `trigger` (closed vocabulary below), `prerequisites {sources ⊆ C2_OBLIGATION/C3_WITHDRAWAL/C7_PROGRAMME, gateRuleIds}`, `evidenceRequirements` (context parts), `effectModelRef` / `economicModelRef` `{modelId, version} \| null`, `assumptions`, `limitations`); `CandidateActionRegistry {registryId, version, definitions}`; `DEFAULT_CANDIDATE_ACTION_REGISTRY` (frozen). Admission is module-internal |
| `recommendation-models.ts` | `RecommendationModelRecord` (`modelId`, `version`, `recordedAt`, `role` `EFFECT` \| `ECONOMIC`, `rule` C0 `CattleRuleVersion` — ADVISORY, no applicability, no required inputs —, `expectedEffect` (EFFECT only, opaque statement), `value {form: NET_OF_BOUND_OBSERVATIONS, benefitKeys, costKeys}` (ECONOMIC only)); `ModelEvaluation`. Admission / evaluation module-internal |
| `economic-context.ts` | `EconomicObservation` (`observationId`, `valueKey`, `amount` canonical non-negative decimal string, `currency` explicit code, `observedAt` valid time, `receivedAt` knowledge time, `source` `SourceVersionRef`, `supersedes`); `EconomicKeyEvidence` (per relevant key: the complete consulted closure + `EconomicKeyResolution` `KNOWN` / `UNKNOWN` / `CONFLICT`, bound id, in-view candidates, competitions); `resolveKeyEvidence`; `EconomicValuation` / `computeEconomicValuation`; the projections `candidateValueOf`, `valuationStepInputs`, `valuationInputItems`, `valuationSourceRefs`; `COMPUTABLE_CURRENCIES` (`EUR`, compile-checked to `money.ts` `CurrencyCode`) |
| `recommendation-consumed.ts` | THE consumed-field schema (CAT-INV-028) for every C1–C7 output C8 reads (`RECOMMENDATION_CONSUMED_SURFACES`); owned-record shape check (no undeclared field). Module-internal |
| `recommendation-exact.ts` | Exact consumed contracts for every C0 record C8 CARRIES: `RULE_EVALUATION_RECORD`, `EVIDENCE_PACK`, `exact` / `exactValid`, `CarriedRuleEvaluation`; `C0_EXACTNESS` compile-time completeness against the frozen C0 types. Module-internal |
| `evaluation-context.ts` | THE construction boundary: `buildEvaluationContexts`, `sealEvaluationContext`; `RecommendationTrustedInputs`. Module-internal except the trusted-input type |
| `recommendation-engine.ts` | `recommendCattle(request, hash, trusted)` → `CattleRecommendationResult`; `verifyCattleRecommendation(recommendation, request, hash, trusted)` (authoritative, by reproduction); `readVerifiedCattleRecommendation(recommendation, request, hash, trusted)` → `VerifiedCattleRecommendation` (the ONLY public way to read a stored recommendation's record and explanation — after full reproduction); `checkCattleRecommendationIntegrity(recommendation, hash)` (integrity only); `CATTLE_RECOMMENDATION_ENGINE_VERSION` |
| `recommendation-explanation.ts` | MODULE-INTERNAL, non-authoritative pack readers (`readPackDecision`, `renderRecommendationExplanation`, `deriveRecommendationRecord`; fixed template over pack / record fields) — not exported from the C8 index |
| `recommendation-contracts.ts` | request, `CattleEvaluationContext`, candidate, record and herd types (types only) |
| `recommendation-integrity.ts` | `computeRecommendationFingerprint` / `verifyRecommendationFingerprint`, `CATTLE_RECOMMENDATION_PAYLOAD_VERSION` |

**Request (canonical evidence only; field-presence policy as C7 B1 — every field present, `null` /
`[]` only where meaningful, unknown fields rejected).** `CattleRecommendationRequest = {query
{effectiveAt, knowledgeCutoff}, ledgers (C1, the animals in scope), obligations {catalogue,
obligationIds, evidence} | null (C2), health {foodProducts, productRecords, animals [{animalId,
healthRecords}]} | null (C3), weights {observations} | null (C4), performance {targets, policies,
contexts, windowFrom} | null (C5; requires weights), goals {declarations, routingRegistry} | null (C6),
programmes {definitions, reviews, completions} | null (C7), economics {observations}, models {records,
reviews, sources}, actions (registry)}`. It never carries a derived predecessor output (no C4 read
contract, C5 evaluation, C6 projection, C7 evaluation or C2 / C3 result — clarification 6). The only
trusted, non-canonical input is the C2 implementation registry (`trusted.obligationImplementations`),
required with C2 evidence, passed unchanged to C2 and C7 and the only source of model implementations
(clarification 4). Order: whole-request canonical check (`CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT`) →
field policy (`..._INVALID_REQUEST`, `..._PERFORMANCE_WITHOUT_WEIGHTS`) → query (canonical nine-digit
spellings, neither defaulted from the other) → C8-owned admission → predecessor composition → sealing.

**C8-owned admission (CAT-INV-003/004/005/008/024).** Registry definitions (`recordedAt`), model records
(`recordedAt`), model reviews (`reviewedAt`), model sources (later of `retrievedAt` / `checkedAt`) and
economic observations (`receivedAt`): a readable knowledge time after the cutoff sets the record aside
before any other read; an unreadable one fails closed; identity (action kind; model id + version;
observation id) is judged among admitted records before validity — equivalent instant spellings are
idempotent, any other difference (an invalid copy included) fails closed; every admitted record is
validated (strict UTC instants, assessment-integrity fingerprints, closed vocabularies) and any defect
fails the request closed; admitted copies carry canonical instant spellings. Relevance is decided by
admitted records only (CAT-INV-006): the context holds only models an admitted definition references,
their reviews and bound sources, and the economic resolutions of the value keys those models name.

**Predecessor composition (CAT-INV-023 delegation; C7 architecture review; clarifications 1/3/5).** In
`evaluation-context.ts` only: C1 `rematerialiseAnimalLedger` / `projectAnimalSnapshot` /
`computeAnimalSnapshotFingerprint` per ledger; C2 `evaluateHerdObligations` (herd) +
`projectObligationHardGates` per animal; C3 `projectAnimalHealth` + `projectWithdrawalHardGates` per
listed animal; per animal C4 `buildWeightReadContract` (explicit set of that animal) → C5
`evaluatePerformance` over that contract (applicability contexts passed unchanged; C8 never derives a
`goalRef`) → C6 `projectProductionGoals` / `routeProductionGoals` and `resolveGoalTargetApplicability`
over that C5 evaluation; C7 `evaluateHealthProgrammes` over the same canonical C1 / C2 / C3 evidence
(C2 / C3 run twice from one evidence set — duplicate deterministic work, never reconciled) +
`projectProgrammeHardGates` per animal. Every output passes the consumed-field schema; evidence a frozen
engine rejects fails the request closed (`..._OBLIGATION_` / `HEALTH_` / `WEIGHT_` / `PERFORMANCE_` /
`GOAL_` / `PROGRAMME_EVIDENCE_INVALID`, `..._HEALTH_EVIDENCE_UNKNOWN_ANIMAL` / `_DUPLICATE_ANIMAL`,
`..._INVALID_LEDGER`, `..._DUPLICATE_ANIMAL`, `..._OBLIGATION_IMPLEMENTATIONS_MISSING`). No predecessor
admission, normalisation, ordering, equivalence or derivation rule is restated.

**Sealed context (CAT-INV-015).** `CattleEvaluationContext` per animal = `{effectiveAt,
knowledgeCutoff, evaluationDate, animal {snapshotFingerprint}, obligations | health | weights |
performance | goals | programmes (each SUPPLIED with the owner's per-animal output bindings — C2 record
fingerprints, states and gate records; C3 three view fingerprints, withdrawal states, gate records and
product source refs; C4 contract + series fingerprints and latest-weight state; C5 evaluation + animal
fingerprints; C6 snapshot ref, status, active goal types, routing and target-applicability
fingerprints; C7 animal-status fingerprints, occurrence states and gate records — or `NOT_SUPPLIED`,
never defaulted), actions, models, modelEvaluations (each referenced model evaluated once through C0 at
`evaluationDate`, no inputs), economics, fingerprint}`. Sealing rejects any part whose echoed
`effectiveAt` / `knowledgeCutoff` differ by instant (`CATTLE_RECOMMENDATION_CONTEXT_TIME_MISMATCH`); the
context is deep-frozen; evaluation reads nothing else. **Binding (CAT-INV-021):** owner outputs, never
raw predecessor inputs; C3 / C4 / C5 / C6 are per animal, so another animal's evidence changes this
animal's result only through a consumed owner output. C1's snapshot fingerprint stays
representation-sensitive (C8 always passes canonical query spellings).

**Triggers (closed vocabulary; context only).** `WEIGHT_MISSING_OR_STALE {staleAfter}` (C4 latest NONE;
or, only with a supplied `staleAfter`, latest instant + `staleAfter` ≤ `effectiveAt`);
`OBLIGATION_STATE {states}`; `WITHDRAWAL_STATE {states}`; `PROGRAMME_ACTION_STATE {states,
classifications, actionKinds | null}`; `GOAL_STATUS {statuses}`; `UNCONDITIONAL`. A trigger is NOT met
only over resolved predecessor states; when no state meets it and a relevant predecessor state is
unresolved (C2 UNKNOWN / INSUFFICIENT_EVIDENCE / EVIDENCE_CONFLICT / INVALID_EVIDENCE / UNSUPPORTED /
REVIEW_REQUIRED; C3 UNKNOWN / EVIDENCE_CONFLICT; C7 UNKNOWN / INSUFFICIENT_EVIDENCE / EVIDENCE_CONFLICT /
REVIEW_REQUIRED / INVALID_EVIDENCE, programme-level records included; C6 INVALID / INTENT_CONFLICT) it
is UNRESOLVED; its part not supplied ⇒ UNRESOLVED. Eligibility by goal type: ACTIVE with a matching type
⇒ eligible; NONE / ACTIVE without match ⇒ not eligible; INVALID / INTENT_CONFLICT or goals not supplied
⇒ unresolved (never "not eligible").

**Default registry** (`DEFAULT_CANDIDATE_ACTION_REGISTRY`, `CATTLE_DEFAULT_DATA_GAP_ACTIONS` v1): every
entry `benefitClaim: NONE`, no model, no prerequisite gate, goal-independent, limitation
`CATTLE_RECOMMENDATION_DATA_GAP_ACTION_CLAIMS_NO_BENEFIT`: `RECORD_WEIGHT` (VALUE_OF_INFORMATION;
C4 no weight in view; `staleAfter: null` — no staleness interval ships), `RESOLVE_OBLIGATION_EVIDENCE`
(SAFETY_LEGAL_WELFARE; C2 OUTSTANDING / OVERDUE / UNKNOWN), `REVIEW_WITHDRAWAL_STATUS`
(SAFETY_LEGAL_WELFARE; C3 UNKNOWN), `COMPLETE_PROGRAMME_ACTION` (SAFETY_LEGAL_WELFARE; DUE / OVERDUE
occurrence of a VETERINARY_PROGRAMME), `DECLARE_PRODUCTION_GOAL` (VALUE_OF_INFORMATION; C6 NONE). No
`REQUEST_VETERINARY_REVIEW` default ships (no supplied sourced rule or programme action kind exists in
production; a supplied registry may declare it with `PROGRAMME_ACTION_STATE` and explicit action kinds).

**Required evidence before exclusion (audit F007).** A definition is excluded as "not a candidate"
(trigger / eligibility resolved negative) only when nothing it requires is unresolved: any required
context part not supplied (evidence requirement or prerequisite gate source), any named prerequisite gate
found in no supplied source (audit F007 of 2026-10-16T135236Z), any supplied prerequisite gate whose C0 state
is not resolved (only PASS / NOT_APPLICABLE / FAIL resolve) or any unresolved trigger / eligibility keeps it
(structural, audit F007 of 2026-10-17T074415Z: exclusion is decided on the candidate's own gate fold, the one
place every kind of required evidence becomes a check) a non-actionable candidate even when the other resolved negative (trigger state
`NOT_MET` / eligibility `NOT_ELIGIBLE` recorded; never selectable; INSUFFICIENT_EVIDENCE when proposed).

**Status / evidence precedence (per candidate, first match).** REQUIRED context part not supplied
(trigger, eligibility, evidence requirement or prerequisite source) ⇒ NOT_EVALUATED gate
`CATTLE_RECOMMENDATION_REQUIRES:<PART>` > trigger over unresolved predecessor states ⇒
`CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:<KIND>_<STATE>` (every C4 latest-weight state is translated
explicitly before staleness: `EVIDENCE_CONFLICT` / `UNSUPPORTED` ⇒ `..._UNRESOLVED:WEIGHT_<STATE>`, audit
F007 of 2026-10-16T170605Z) > goal unresolved ⇒
`CATTLE_RECOMMENDATION_GOAL_UNRESOLVED:<status>` > trigger / eligibility resolved negative ⇒ not a
candidate > any prerequisite gate (C2 / C3 / C7 projection record, or a named gate id) not PASS /
NOT_APPLICABLE, or absent ⇒ NOT_CLEAR, and effect and value are **not evaluated** (favourability never
consulted) > gates CLEAR ⇒ effect, then value; EFFECT_NOT_SUPPORTED ⇒ not selectable > ranking.
**Gate identity (CAT-INV-026).** A named gate id is looked up in every supplied source (never first
match); records sharing a rule id collapse only when identical (labelled by the fixed source order
C2 → C3 → C7), and differing records under one rule id — across or within sources, or between a gate and
a model rule in the pack — fail the request closed (`CATTLE_RECOMMENDATION_GATE_IDENTITY_AMBIGUOUS`);
there is no implicit precedence. Generated gates (a named gate absent from every source, recorded
NOT_EVALUATED; an unresolved-evidence marker such as `CATTLE_RECOMMENDATION_REQUIRES:<part>`) are in the
same identity space: a generated id equal to a supplied gate, to another generated gate or to any rule
record in the pack fails closed the same way, so a record can never decide a generated gate in C0. A
pack that C0 derives as ACTIONABLE for a proposal that is not selectable fails the request closed
(`CATTLE_RECOMMENDATION_PACK_OUTCOME_INCONSISTENT`).
**CAT-INV-028 — trust boundaries and contract ownership (campaign-level clarification; human
architecture decision 2026-10-15; binding for C8 and every later phase).** Validation must follow trust
boundaries and contract ownership. Data entering the system across an external, persisted, imported,
deserialised, user-controlled or otherwise untrusted boundary is untrusted and must be validated before
use. An output returned directly in-process by an approved frozen engine is trusted to satisfy that
engine's published domain contract. A downstream engine is not responsible for reimplementing every
owner-specific invariant already guaranteed by a frozen predecessor. Therefore C2 owns C2 domain
invariants, C3 owns C3 domain invariants, C7 owns C7 domain invariants and C8 owns C8 domain
invariants. C8 must continue to validate: C8-owned inputs and outputs; genuine external / persistence /
deserialisation boundaries; required structural presence; identity / reference consistency C8 itself
relies upon; shared cross-engine protocol invariants owned by the architecture. C8 must not duplicate
arbitrary predecessor-specific domain constraints purely to survive mutation of an object returned
directly from a frozen in-process engine.
**Fault model (audit and tests).** In scope: the canonical request (external input); a stored /
reloaded recommendation (`verifyCattleRecommendation` — every field at every level is untrusted, it is
checked structurally first and then reproduced from its original request; anything it cannot verify is
invalid, never a thrown error); C8-owned
records (registry, models, observations, the recommendation); the shared C0 protocol shape of records
returned by frozen in-process engines (required presence, runtime type, no undeclared field); fields
whose correctness C8 independently owns or relies upon. Out of scope: arbitrary post-return corruption
of an approved frozen in-process engine's owner-specific domain values. **F005 disposition (audit
2026-10-15T194252Z):** changing a C2 rule version to 0 (C2 owns the rule-version constraint) or replacing
C3's owner-defined null `rule` with an object (C3 owns that invariant) are not valid C8 adversarial
faults; C8 does not duplicate those C2 / C3 constraints.

**Carried records (shared C0 protocol shape; C8 architecture review 2026-10-15).** No raw predecessor or C0
object is carried into the sealed context or the evidence pack. Every C0 `RuleEvaluationRecord` C8
carries — C2 / C3 / C7 hard-gate records and C0 model rule evaluations — and the C0 pack C8 stores are
validated against an EXACT schema (`recommendation-exact.ts`): every field of the frozen C0 type at
every nesting level, runtime type, frozen vocabulary and format, and no undeclared field; only the
projected copy is carried. Completeness is compile-checked (`Covers<spec, C0 type>`: the schema's keys
equal the type's keys at every level and the projection is assignable to it), so omitting a C0 field is
a type error. A malformed gate record fails its part closed (`..._OBLIGATION / HEALTH /
PROGRAMME_EVIDENCE_INVALID`); a malformed model record leaves the model UNAVAILABLE
(`..._MODEL_EVALUATION_MALFORMED`); a malformed pack fails the request closed (`..._PACK_INVALID` /
`..._PACK_MALFORMED`). Structure only (the shared C0 protocol): no C0 / C2 / C3 / C7 derivation and no
owner-specific value constraint is restated (CAT-INV-028 as clarified above).

**Model eligibility (CAT-INV-016 / 025; human decision D1, 2026-10-15).** C0 PASS is necessary, not
sufficient: C0 classifications legitimately differ in what they require (a FARMER_INTENT rule needs no
source and no review), so C8 applies its own role-specific policy before evaluation
(`MODEL_ELIGIBILITY`): EFFECT models only SCIENCE_TARGET, SCIENCE_CONSTRAINT or SYSTEM_INFERENCE;
ECONOMIC models only SYSTEM_INFERENCE; never FARMER_INTENT, LEGAL_REQUIRED, LEGAL_CONDITIONAL,
SCHEME_CONDITIONAL or VETERINARY_PROGRAMME. Independently of classification: at least one source
binding, SCIENTIFIC among the required reviews, production state PRODUCTION (a SUPERSEDED version is
never current). Ineligible ⇒ UNAVAILABLE (`..._MODEL_NOT_ELIGIBLE:<reason>:<model>`), never a request
failure. A PASS counts only when the carried C0 record itself evidences approval — every review
dimension APPROVED with SCIENTIFIC among them, every bound source CURRENT — otherwise UNAVAILABLE
(`..._MODEL_APPROVAL_NOT_EVIDENCED`). **Scientific approval versus economic validation:** approval of an
EFFECT model is scientific approval of its effect statement; approval of an ECONOMIC model covers its
value FORM only (which bound observation keys are benefits and which are costs) — never the prices.

**Model content binding (CAT-INV-025).** A model's rule version must carry
`recommendationModelContentMarker(model)` (`cattle-recommendation-model-content:<modelId>:<digest>` of
`CATTLE_RECOMMENDATION_MODEL_CONTENT`) in `assumptions`, so the C0 rule fingerprint a review approves
covers the effect statement and value form; otherwise the model is UNAVAILABLE
(`..._MODEL_CONTENT_NOT_BOUND_TO_RULE_VERSION`) and never supports an effect or a value.
**Effect:** no model ⇒ `EFFECT_UNKNOWN`; model not admitted / role mismatch / content not bound /
implementation not in the trusted registry / not eligible / approval not evidenced ⇒ `EFFECT_UNKNOWN`; C0 PASS ⇒ `EFFECT_SUPPORTED` (the model's statement — no magnitude
or probability), FAIL ⇒ `EFFECT_NOT_SUPPORTED`, any other C0 state (REVIEW_REQUIRED, UNSUPPORTED, …) ⇒
`EFFECT_UNKNOWN`. **Value:** REQUIRED an admitted, eligible ECONOMIC model with an evidenced C0 PASS and every named key KNOWN
in one computable currency; value = Σ benefit − Σ cost (exact decimal, `money.ts`); otherwise
`VALUE_UNKNOWN` with reasons (`..._VALUE_INPUT_<state>:<key>`, `..._VALUE_CURRENCY_MIXED`,
`..._VALUE_CURRENCY_NOT_COMPUTABLE`, model state).

**Monetary precision (CAT-INV-019; audit F006).** The canonical money layer (`money.ts`) computes through
`decimal.js` at that library's configured significant-digit precision (documented in `money.ts`
`multiplyMoney`; 20); beyond it `addMoney` / `subtractMoney` would round. C8 reads that limit from the
same configuration (`MONEY_ARITHMETIC_PRECISION`; no C8 constant, never raised locally) and never feeds
the arithmetic an amount or a sum that could exceed it: an observation whose amount needs more digits
fails the request closed (`..._ECONOMIC_OBSERVATION_PRECISION_UNSUPPORTED`); a net value whose exact
result could need more digits (Σ of N terms each below 10^k needs at most k + digits(N − 1) integer
digits) is `VALUE_UNKNOWN` (`..._VALUE_PRECISION_UNSUPPORTED:<bound>><precision>`). Nothing is silently
rounded, so ranking and identity tie-breaking only ever compare exact values.

**Money (NUMERIC_SEMANTICS.md decision).** Canonical exact decimal string + explicit currency code
(`money.ts` `MoneyAmount`), non-negative magnitudes in observations; exact add / subtract / compare;
never binary floating point, never rounded (CAT-INV-019). No implicit currency and no conversion:
differing currencies are never combined or compared (no exchange-rate observation contract exists);
only `EUR` (the `money.ts` currency) computes. Ranking compares canonical unrounded values; money
equality is amount + currency + the bound observations used (recorded per value).

**Economic provenance — one canonical evidence object (human architecture decision 2026-10-16;
closes the F003 economic-provenance family).** INVARIANT: every economic fact C8 derives is a pure
function of one canonical, fingerprinted evidence object, and everything downstream projects from it —
nothing re-collects or reconstructs economic evidence. (1) Per relevant value key, `EconomicKeyEvidence`
holds the resolver's COMPLETE consulted closure — every admitted observation of the key known by the
cutoff, in full, sorted by id: superseded ancestors, records observed after `effectiveAt`, out-of-view
corrections and competitors included — and the resolution derived from that closure alone by the one
resolver `resolveKeyEvidence` (C2 `resolveBitemporalRecords`; state, bound observation id, in-view
candidate ids, every correction competition). The sealed context stores these objects
(`context.economics`), so the context fingerprint binds every observation that could affect a
resolution. (2) Per candidate, `computeEconomicValuation` derives `EconomicValuation` from the key
evidence only: model, value form, each key's role (a reference into the key evidence), outcome
(`VALUE_KNOWN` amount + currency, or `VALUE_UNKNOWN` reasons — unknown / conflicting key, mixed or
non-computable currency, unsupported precision), the observations summed, and the complete consulted
evidence (the union of its keys' closures). (3) Projections, each a single function: the candidate value
(`candidateValueOf` — read by ranking, the candidate step, the record and the explanation); the pack's
valuation step (`valuationStepInputs`); the pack's economic inputs (`valuationInputItems`) and source
references (`valuationSourceRefs`). A valuation never attempted (economic model not PASS, gates not
clear) adds nothing to the pack; its keys' evidence is still bound in the context. Observations of
irrelevant keys or received after the cutoff are outside every closure and change no fingerprint.
Integrity re-resolves each stored key from its stored closure and requires the stored resolution
exactly (`..._STORED_ECONOMICS_INCONSISTENT`); authoritative verification reproduces the whole object.
Recommendation payload version 2 (the context's economics shape changed; C8 had not shipped).

**Selection and ranking (total, stable).** Selectable candidates first, by tier
(SAFETY_LEGAL_WELFARE → AVOID_MATERIAL_LOSS → EXPECTED_NET_RETURN → VALUE_OF_INFORMATION), then within a
tier `VALUE_KNOWN` before `VALUE_UNKNOWN` (unknown never zero, never best), known values exactly and
higher first, then action identity; non-actionable candidates after, by tier then identity (values never
consulted). Equal keys are recorded as ties broken by `ACTION_IDENTITY`. Proposed: the first selectable
candidate; else the first NOT_CLEAR candidate (its prerequisite gates in the pack ⇒ C0 BLOCKED /
REVIEW_REQUIRED / INSUFFICIENT_EVIDENCE); else none ⇒ NO_RECOMMENDATION. A gate-clear candidate with a
negative effect model is never proposed. Action identity = JSON `["<actionKind>","ANIMAL","<animalId>"]`.

**Evidence pack (C0, reused).** `recommendationId` `CATTLE_RECOMMENDATION:<context digest>`; engine
version; ruleset `["<registryId>","<version>"]`; `evaluationDate` (UTC date of `effectiveAt`);
`knownAt` = `generatedAt` = the canonical knowledge cutoff (no clock is read; `generatedAt` is excluded
from the C0 fingerprint); target scope `{ANIMAL, animalId, CATTLE_ANIMAL_SNAPSHOT:<digest>}`; intent =
the C6 goal snapshot ref (or `null`); inputs = every consumed owner-output binding plus the bound
economic observations used by any candidate; rule evaluations = the proposed action's prerequisite gate
records plus the (ADVISORY) model evaluations of every candidate consulted for ranking or rejection —
never another action's gates, so only the proposal's gates decide C0's outcome; required hard gates = its
gate checks; calculation steps = for the proposal, then every alternative in rank order: the gate fold,
then ONE step per consulted gate check (`Prerequisite gate <rule> of the <proposed action | alternative
<id>>`: `rule` = the record's `RuleVersionRef`, or `null` for a generated gate; inputs = state, gate
source, satisfied, `controlsPackOutcome` (true only for the proposal), the pack input key binding the
owner output, gate role, classification, rule fingerprint, reason codes, source checks and reviews;
output = the state), then the CANDIDATE step (`Candidate <label>`: action id / kind, tier with basis
`REGISTRY_DECLARED_UNREVIEWED`, benefit claim, trigger, eligibility, gate state, selectability, the full
effect — including the effect model's statement — and value), then one MODEL step per consulted model
(`<Effect | Economic> model ["<id>","<version>"] of the <label>`: role, identity, content fingerprint,
effect statement / value form, the model rule's assumptions and limitations; `rule` = the model's C0
rule version), then — whenever a valuation was attempted (economic model PASS, gates clear), in EVERY
outcome — `Economic valuation of the <label>`, the single serialization of the canonical valuation (model,
form, outcome, observations summed) and each key's complete canonical evidence; then the registered
actions not considered
(trigger / eligibility resolved negative, with reasons per action kind); then ranking (rank order, each
candidate's ranking basis — selectable, tier with basis `REGISTRY_DECLARED_UNREVIEWED`, value — and
every recorded tie). Decision provenance (CAT-INV-021): every candidate's gates, every exclusion,
the ranking basis and every tie are in the pack; alternatives' gates enter ONLY as calculation steps
and sources, which C0 never treats as gates, so they cannot affect the proposal's C0 outcome. Sources =
the bound sources of every consulted gate record of every candidate (C2 included), gate product /
programme sources and observation sources (plus C0's from rule records); assumptions / limitations / uncertainties
(missing parts, unresolved gates, unknown effect / value reasons); every candidate; every non-proposed
candidate rejected with structured reasons (`..._GATE_<state>:<rule>`, `..._EFFECT_NOT_SUPPORTED`,
`..._RANKED_BELOW:<action>`). The built pack is read and stored only as its exact validated copy, then
re-verified with `verifyRecommendationEvidencePack`; an invalid, malformed or unverifiable pack fails the
request closed (`..._PACK_INVALID` / `..._PACK_UNVERIFIED`). A pack C0 derives as ACTIONABLE for a
proposal C8 considers not selectable fails closed (`..._PACK_OUTCOME_INCONSISTENT`).

**The pack is the single source of decision evidence (audit F003; bounded repair 2026-10-15).**
canonical inputs → complete evidence pack → decision record derived from the pack → explanation derived
from the pack. `deriveRecommendationRecord(pack)` and `renderRecommendationExplanation(pack)` take the
pack and nothing else; the engine's record IS `deriveRecommendationRecord(pack)` (a pack that does not
carry the decision evidence fails the request closed, `..._PACK_DECISION_UNREADABLE`), so anything the
record or explanation shows — including an effect model's statement — is in the pack by construction.
Evidence labels are recovered through the pack's own model steps and C0 rule evaluations. The
proposal's consulted models' rule assumptions and limitations are in the pack's (and so the record's)
assumptions / limitations, tagged `CATTLE_RECOMMENDATION_MODEL_ASSUMPTION:` /
`..._MODEL_LIMITATION:["<id>","<version>"]:<text>`. The integrity check requires the stored
record to equal the one its pack derives. **Trust boundary (human architecture decision 2026-10-17,
Option 1).** The pack readers are NON-AUTHORITATIVE and module-internal: they run only on a pack the engine
has just built, or inside the integrity check (which returns no decision content); no public function
derives a recommendation, record or explanation from a caller-supplied pack, and a valid fingerprint,
schema or provenance chain never substitutes for decision verification. A stored recommendation's record
and explanation are read publicly only through `readVerifiedCattleRecommendation(recommendation, request,
hash, trusted)`, which runs `verifyCattleRecommendation`'s full reproduction and, only on success, returns
the REPRODUCED (deep-frozen) recommendation, record and explanation; any failure returns only
`{ ok: false, reasonCode, detail }`. As defence in depth the internal readers (`readPackDecision`,
`renderRecommendationExplanation`, `deriveRecommendationRecord`) treat their pack as untrusted (audits F009
/ F010): canonical plain data first, then the exact C0 pack shape, then every JSON-carried decision field
(trigger, eligibility, effect, value) against its exact shape, then C8's own state-dependent semantics
(only a SUPPORTED effect states one and names its model; only a KNOWN value carries a canonical
`money.ts` amount, a currency C8 computes (`COMPUTABLE_CURRENCIES`; audit F010 of 2026-10-16T230804Z) and
sorted observations; NOT_EVALUATED names no model; benefit claim and gate
state in vocabulary; selectability exactly C8's rule) and ONE claim-support rule (`claimsSupported`, audit F010 of
2026-10-17T000348Z): a candidate's claims are readable only when the pack's own steps carry them, as the engine
writes them — gates not clear ⇔ effect and value NOT_EVALUATED; benefit claim NONE consults no model; a
SUPPORTED / NOT_SUPPORTED effect is its effect-model step's PASS / FAIL with the same statement; a KNOWN value is
its economic-model step's PASS (a model is read only through `consultedModel`: exactly one model step whose rule id
and version, role, identity and recorded state equal its one C0 rule evaluation's — audit F010 of
2026-10-17T010211Z; approval labels come from that reconciled evaluation) and its `Economic valuation of the <label>` step's outcome, model and summed
observations — and ONE pack-outcome reconciliation rule
(`packOutcomeReconciled`, audit F010), applied on every reader path including an absent proposal: no
proposal is exactly NO_RECOMMENDATION with no actionable id; `actionableActionId` is the proposal exactly
when ACTIONABLE; the pack is ACTIONABLE exactly when its proposed action is selectable, a non-selectable
proposal has gates not clear, and a proposal never yields NO_RECOMMENDATION;
anything malformed reads as `null`, never a throw or a bare cast.

**Record and explanation.** `RecommendationRecord` (information class RECOMMENDATION): recommended
action, outcome / `actionable` (true only for C0 ACTIONABLE), structured reason codes, deterministic
explanation (fixed template over pack / record fields; no model call), expected outcome (effect +
value, or `EFFECT_UNKNOWN` / `VALUE_UNKNOWN`), regulatory status (`NO_PREREQUISITE_GATES` /
`GATES_SATISFIED` / `GATE_FAILED` / `GATE_REVIEW_REQUIRED` / `GATE_UNRESOLVED` + C0 hard-gate outcomes),
evidence `{type, strength, effectBasis, valueBasis, priorityBasis}` — type `DATA_GAP_OR_OBLIGATION` /
`MODELLED` / `NONE`; strength `PREDECESSOR_STATE` / `MODELLED_EFFECT_AND_VALUE` / `MODELLED_EFFECT` /
`MODELLED_VALUE` / `UNMODELLED` / `NONE`; `effectBasis` `SCIENTIFICALLY_APPROVED_EFFECT_MODEL` only when the
effect record evidences approval; `valueBasis` `APPROVED_VALUE_FORM_OVER_UNVALIDATED_OBSERVATIONS` (never
"validated prices"); `priorityBasis` `REGISTRY_DECLARED_UNREVIEWED` — sources, assumptions, limitations, unknowns, missing context parts, pack id +
fingerprint. **Herd:** per-animal results (sorted by animal id) and an ordering by proposed tier (none
last), then outcome (BLOCKED, REVIEW_REQUIRED, INSUFFICIENT_EVIDENCE, ACTIONABLE, NO_RECOMMENDATION), then
— between two ACTIONABLE animals — known value (exact, higher first, unknown after), then animal id; ties
recorded; no cross-animal averaging.

**Fingerprints.** `CATTLE_RECOMMENDATION_MODEL_CONTENT` is a semantic fingerprint of a model's id,
version, role, rule id / version, expected effect and value form (benefit / cost keys as sets); the other
kinds are result fingerprints. `CATTLE_RECOMMENDATION_CONTEXT` binds both canonical times,
every part binding, the admitted registry, relevant models / reviews / sources, model evaluations and
economic resolutions (canonical instant spellings in admitted copies). `CATTLE_RECOMMENDATION_RECORD`
binds the context, candidates, non-candidates, ties, pack and record; `CATTLE_RECOMMENDATION_HERD` binds
the times, per-animal record fingerprints and the ordering. Input order, key order, the order of any
set-valued C8-owned field (model benefit / cost keys; a definition's goal types, trigger state lists,
prerequisites, evidence requirements, assumptions and limitations; an economic observation's `supersedes` —
canonicalised at admission before identity, audits F011) and equivalent instant spellings do not change them; any material input, cutoff, effective time, registry version, tier, model
or observation does. `checkCattleRecommendationIntegrity` (and so `verifyCattleRecommendation` before it
reproduces) re-verifies the C0 pack, the context and record fingerprints, the exact C0 pack contract of the stored pack and record = `deriveRecommendationRecord(pack)`
with the pack ↔ context identity link; a malformed stored recommendation is invalid
(`CATTLE_RECOMMENDATION_MALFORMED` / `..._PACK_MALFORMED`), never a thrown error; never repairs.
**Stored recommendations — authoritative verification is FULL REPRODUCTION (human architecture decision
2026-10-16, Option 1; supersedes the earlier context-validation and replay-as-authority repairs for the
F005 family).** A stored recommendation crosses a genuine trust boundary (CAT-INV-028), and its sealed
context's cut-down C1–C7 views cannot be proven valid by inspection; C8 therefore restates no
predecessor rule to try. `verifyCattleRecommendation(recommendation, request, hash, trusted)` — the ONLY
authoritative verification — (1) runs the integrity checks below, (2) re-runs `recommendCattle` over the
ORIGINAL request with the same trusted dependencies, so every C1–C7 view is re-derived by its owning
frozen engine and every model evaluation by C0, (3) selects the reproduced recommendation for the same
animal and (4) requires it to equal the stored recommendation exactly. It fails closed without the
request (`CATTLE_RECOMMENDATION_VERIFICATION_REQUEST_REQUIRED`), when the request does not reproduce a
recommendation — including missing trusted dependencies (`..._REPRODUCTION_FAILED`) — and on any
difference (`..._REPRODUCTION_MISMATCH`). Callers must keep the original request with the stored
recommendation. **Integrity only.** `checkCattleRecommendationIntegrity(recommendation, hash)` returns
`{ intact, authoritative: false }` — never `valid` — and confirms only: canonical plain data (CAT-INV-001
/ 002; a getter is never invoked); the complete stored structure (`STORED_RECOMMENDATION`: every field
and part, with vocabularies and formats, no undeclared field) and the relationships C8 establishes
(payload versions; animal identity record ↔ context ↔ pack target scope ↔ snapshot ref; times and
evaluation date; candidates, exclusions and ties ↔ the pack's own decision steps —
`..._STORED_<STRUCTURE | ANIMAL | SNAPSHOT | TIMES | EVALUATION_DATE | CANDIDATES | EXCLUSIONS |
TIES>_...`); the C0 pack (`verifyRecommendationEvidencePack`); the record the pack derives; an exact
replay of the C8 engine over the stored context (`..._REPLAY_MISMATCH`); both fingerprints. It does NOT
establish that a recommendation is scientifically, semantically or decision-valid. Fingerprints are
change detection, not signatures; a later correction or late record never alters the recommendation
reproduced at an earlier cutoff.

**Known limitations.** No production model, effect or economic content ships, so with the default
registry every expected outcome is `EFFECT_UNKNOWN` / `VALUE_UNKNOWN`. Model rules receive no animal
inputs (C8 v1): a model is a governed, sourced, approved assertion, evaluated once per context; a model
rule with applicability or required inputs is rejected. One economic form (`NET_OF_BOUND_OBSERVATIONS`);
no currency conversion (only `EUR` computes); no effect magnitude or probability. Model implementations
share the trusted C2 implementation registry (clarification 4). Lifecycle / presence of an animal is not
interpreted (adapters supply the animals in scope). Completeness of the supplied canonical evidence is
the adapter's responsibility (C2 / C3 / C7 precedent). A malformed admitted record anywhere in a C8-owned
collection (registry, models, observations) fails the request closed. Reproducing a recommendation
requires resupplying the same registry, models and observations (they are versioned data, not stored by
C8). **Disclosed limitations (human decisions D2 / D3, 2026-10-15), in every pack's limitations:**
economic observation amounts and source references are bound but NOT independently validated — no
catalogue or authority check exists for prices (C0 has no authority kind for market prices)
(`CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATIONS_NOT_INDEPENDENTLY_VALIDATED`); an economic model's approval
covers its value form only (`..._ECONOMIC_MODEL_APPROVAL_COVERS_VALUE_FORM_ONLY`); action priority tiers
are declared by the candidate-action registry, which carries no review state
(`..._ACTION_PRIORITY_TIERS_REGISTRY_DECLARED_UNREVIEWED`). Safeguards: the record's `valueBasis` /
`priorityBasis`, the ranking step's tier basis and the explanation text ("approved value form over
economic observations not independently validated", "registry-declared priority") always state these
bases; nothing presents a price as validated or a tier as reviewed. **Verification:** boundary fault
injection at every seam C8 calls (C2 / C3 / C7 gate projectors, C0 model evaluation, C0 pack builder)
enumerates mutations from the REAL frozen outputs (never from C8's schema) and requires fail-closed
behaviour; a decision-provenance oracle checks that every decision in a record appears in its pack.

**Exclusions.** No real legal, veterinary, scientific or economic content; no diagnosis, prescribing,
treatment / dose / product / timing choice or legal interpretation; no AI / LLM narrative; no Plan job
creation (C9) or UI (C10); no persistence, schema, migration, network, connector or clock; no change to
C0–C7, `livestock.ts`, `money.ts` or any frozen contract.

## Plan compatibility amendment (C8P1, cattle campaign)

Additive Plan kernel contract change (human architecture decision 2026-10-17, C9 pre-build and blocker
reviews B2–B6) so C9 can represent cattle work without coercing cattle concepts into Plan concepts that
mean something else. Nothing existing is renamed, removed or changes meaning; Plan imports no
`src/domain/cattle/` module. Pinned by `src/domain/plan/cattle-compatibility.test.ts`.

- **`SubjectType`** (`src/domain/subject.ts`) gains `CATTLE_ANIMAL` (id = cattle C1 `FarmReturnAnimalId`)
  and `CATTLE_GROUP` (id = cattle C1 `MANAGEMENT_GROUP` value), each with a `SUBJECT_TYPE_NOTES` entry.
  Neither is the V1 `IndividualAnimal.id` / `LivestockGroup.id` (`ANIMAL` / `ANIMAL_GROUP`) nor
  interchangeable with them; refs of different types with the same id are different subjects
  (`isSameSubject`, `subjectKey`, `normaliseSubjects`, `scopeIdentityKey`, `planJobIdentityKey`).
- **`PlanCreationSource`** (`src/domain/plan/job.ts`) gains an additional union member
  `{ kind: "FARM_RETURN"; reason: "OBLIGATION" | "RECOMMENDATION" | "COMPOSITE" }`. `OBLIGATION` — work
  derived from an obligation owned by a canonical domain. `RECOMMENDATION` — work proposed by a Farm
  Return system recommendation that no adviser has approved (never `ADVISER_APPROVED`). `COMPOSITE` —
  work supported by more than one distinct Farm Return origin; the creation source does not carry the
  origins, the producer retains them (`supportingReasons` and its own canonical object). `ROUTINE`,
  `SEASONAL`, `DATA_GAP`, `PROGRAMME` unchanged; `JOB_CREATED` carries the source unchanged.
- **`SYSTEM_PRIORITY_TIERS`** (`src/domain/plan/priority.ts`) gains `ROUTINE_MANAGEMENT` as the fifth and
  LAST tier (rank 4): normal farm-management work to be planned for which the authoritative evidence
  establishes none of a hard legal/compliance obligation, avoidance of material loss, expected net return
  or an information-gathering objective. Last so it never outranks a tier with an evidenced objective;
  the four original tiers keep ranks 0–3 and their relative order.
- **`HardDeadlineAuthority`** (`src/domain/plan/timing.ts`) gains
  `{ kind: "VERSIONED_SOURCE"; sourceId: string; version: string; contentFingerprint: AssessmentFingerprint }`
  — a Plan-owned structural reference with the same fields as cattle C0 `SourceVersionRef`
  (`AssessmentFingerprint` from the shared `assessment-integrity.ts`), binding the canonical source
  identity, version and content fingerprint a deadline originates from. `hardDeadline()` accepts it
  unchanged (still rejects an invalid due instant). Never used for a derived evaluation record.

**Exclusions.** No C9 adapter or cattle → Plan mapping; no cattle file change; no change to existing Plan
behaviour, readiness, completion, scope resolution, audit events or routes; `REGISTERED_SOURCE`,
`ADVISER_APPROVED`, `ANIMAL`, `ANIMAL_GROUP` and the existing tiers keep their meaning.

## Cattle C9 — Plan interface (2026-10-19)

C0–C8 and the C8P1-frozen Plan kernel are unchanged; C9 changes no earlier file except one additive
`export * from "./plan-interface";` in `src/domain/cattle/index.ts`. New, **non-frozen** pure modules under
`src/domain/cattle/plan-interface/` (barrel `index.ts`); tests `plan-interface.test.ts`, `plan-tables.test.ts`
(fixtures `plan-test-fixtures.ts`, synthetic `SYNTH-*` data). Governed by the C9 binding design freeze
(B1–B6, D1–D4, 2026-10-19). No persistence, schema, migration, UI, route, clock, network or model call; no
Plan code change (pinned by a byte-digest guard over every `src/domain/plan` file and `subject.ts`).

**Ownership.** C9 owns only the Cattle → Plan translation. Cattle keeps animal truth, obligations, health,
performance, goals, programme state and recommendations; Plan receives existing Plan types only and holds
no copy of a cattle record.

| Module | Contract |
|---|---|
| `plan-interface.ts` | `planCattleWork(request, hash, trusted)` → `{ ok, result: CattlePlanResult }` or `{ ok: false, issues }`. Any issue fails the whole request closed (no proposals). Result detached, deep-frozen, fingerprinted |
| `plan-delegation.ts` | Canonical boundary: whole request through `toCanonicalPlainData`, field policy exactly `{ cattle, groupScopes: { groupRef }[] }` (refs opaque; a set — deduplicated, sorted). Delegation (B1, pinned shapes): C8 `recommendCattle(cattle, hash, trusted)`; C2 `evaluateHerdObligations` over the C1-rematerialised request ledgers sorted by animal id; C7 `evaluateHealthProgrammes({...programmes, ledgers, health, obligations, query})`; C4 `resolveGroupScope` per group over `cattle.ledgers` — all at C8's admitted echoed canonical `effectiveAt` / `knowledgeCutoff`. Each raw result is handed to its adapter where it is obtained; only admitted DTOs (`Delegated`) leave the module. B1 equivalence (over admitted fingerprints, `plan-adapters.ts`): per animal, C9's C2 record and C7 animal-status fingerprints must equal C8's sealed-context ones (`CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH` otherwise) |
| `plan-vocabulary.ts` | Every compiled table (`satisfies Record<…>` over the frozen vocabularies; runtime `lookup` → `undefined`, never a default): C2 / C7 state and C8 outcome → proposal / state blocker / completion meaning (B6); C0 gate state → blocker status (D3); C4 membership (B2); C8 default kinds → tier (D4), modelled tier map, origin (B3), fold whitelist (D2); C4 / C6 completion-evidence states. THE vocabulary table `CATTLE_PLAN_VOCABULARY` (rows → family, completion form, owning records that prove completion) and `completionContractFor(row, identity, effectiveAt)` |
| `plan-adapters.ts` | THE predecessor adapter boundary (F004 architecture review 2, Outcome C): one C9-owned DTO, exhaustive `DtoSpec` (`satisfies`) and adapter per consumed family — viewpoint, C2 records, C7 records, C8 recommendations with the sealed-context parts C9 reads (weights, goals, C2 / C7 fingerprints), C4 group scope — plus B1 equivalence over admitted fingerprints and the relation that a proposed C8 action names exactly one candidate |
| `plan-work-items.ts` | Canonical `CattlePlanWorkItem`s from the admitted DTOs (selection and mapping only); C9's status / evidence precedence list (header); D2 folding (`parseRestatementCitation`, `foldRestatements`) |
| `plan-merge.ts` | Identity = Plan `planJobIdentityKey` (called, never restated); `groupWorkItems` / `mergeProposalGroups` / `summariseGroup` (merge algebra); projections `projectProposal` → `PlanJobInput`, `projectBlockers` → `PlanBlocker[]`; `cattleAnimalScope`, `cattleGroupScope` |
| `plan-evidence.ts` | `CanonicalEvidence` (vocabulary-driven) and `ScopeReality` (all-or-unknown), from the SAME admitted DTOs as the work items (no second reader of predecessor output) |
| `plan-admission.ts` | The admission layer: C9 validated primitives (`C9Ref`, `C9Text`, `C9Instant`, `C9Fingerprint`, `C9SourceRef`, `C9Vocab`, brands minted only by `admitDto`), the `DtoSpec` reader `admitDto`, and the defence-in-depth field tables of C9's finished canonical records (`satisfies Fields<…>`, `admit`); issue `CATTLE_PLAN_ADMISSION_FAILED` |
| `plan-integrity.ts` | Phase-local fingerprint wrapper `{kind, cattlePlanPayloadVersion: 1, payload}`; kind `CATTLE_PLAN_INTERFACE_RESULT` |
| `plan-contracts.ts` | Types only |

**Mappings (design freeze).** Subjects: C1 animal id → `CATTLE_ANIMAL`, C1 management group →
`CATTLE_GROUP` (never `ANIMAL` / `ANIMAL_GROUP`). Every C2 / C7 / C8 output is per animal, so every proposal
is individual-animal `STATIC` work; `cattleGroupScope(groupRef)` (`DYNAMIC MEMBERS_OF CATTLE_GROUP →
CATTLE_ANIMAL`, `ABSORB_INTO_JOB`) is exported for group jobs and resolved by the `ScopeReality` C9
produces for each requested group. Proposals (B6): C2 `UPCOMING` / `OUTSTANDING` / `OVERDUE` /
`ADVISORY_FAIL` work; `BLOCKED` with an `ACTIVE` state blocker; `UNKNOWN` / `INSUFFICIENT_EVIDENCE` /
`EVIDENCE_CONFLICT` / `INVALID_EVIDENCE` / `UNSUPPORTED` / `REVIEW_REQUIRED` evidence-resolution work with
an `UNKNOWN` blocker; C7 the same pattern where a concrete programme action exists (a programme-level
record proposes nothing); C8 `ACTIONABLE`, `BLOCKED` (ACTIVE), `REVIEW_REQUIRED` / `INSUFFICIENT_EVIDENCE`
(UNKNOWN) with a concrete proposed action. States producing no proposal are listed in
`withoutProposal` with a reason (never silently dropped). Creation source (B3): C2 `OBLIGATION`, C7
`PROGRAMME`, C8 `benefitClaim: NONE` `DATA_GAP`, modelled `RECOMMENDATION`, several distinct origins in
one group `COMPOSITE` (projection only; never `ADVISER_APPROVED`). Priority (B4): C2 legal / scheme
`HARD_GATE` in a resolved state `HARD_OBLIGATION`, other resolved C2 work `ROUTINE_MANAGEMENT`, unresolved
C2 `INFORMATION_VALUE` (never promoted; classification kept in the basis); C7 `ROUTINE_MANAGEMENT`; C8 by
the compiled kind table, modelled actions by tier (`AVOID_MATERIAL_LOSS`, `EXPECTED_NET_RETURN`,
`VALUE_OF_INFORMATION` → `INFORMATION_VALUE`) — anything else, including a modelled
`SAFETY_LEGAL_WELFARE`, fails closed (`CATTLE_PLAN_ACTION_KIND_UNMAPPED`). Timing (B5 / D1): a C2 legal /
scheme `HARD_GATE` record with a window and exactly one `CURRENT` rule source check →
`HARD_DEADLINE { dueIso: window.dueAt, authority: VERSIONED_SOURCE <that bound ref> }` plus the
recommended window `opensAt..dueAt`; two or more checks or a non-`CURRENT` one → recommended window only
and an `UNKNOWN` `DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED` blocker (provenance keeps every check);
other C2 and every C7 window → `RECOMMENDED_WINDOW`; no window / C8 → no timing. Instants pass through in
the owner's canonical spelling. Route: always `{ kind: "NONE", reason: "MANUAL_TASK" }`.

**Blockers (D3).** Kind `LEGAL_WINDOW` for a C3 withdrawal gate, otherwise `OTHER`. Status from the C0
gate state: PASS / NOT_APPLICABLE `CLEARED`, FAIL `ACTIVE`, every unresolved state (incl. C8
`NOT_EVALUATED`, C7 `NOT_SUPPLIED`) `UNKNOWN`. Consumed gates: each C7 action gate check and each
prerequisite gate check of the proposed C8 action (all, cleared ones `CLEARED`); plus the B6 state blocker
of C2 / C7 items and the D1 deadline blocker. Id = `CATTLE_PLAN_BLOCKER:` + JSON `[sourceFamily (incl.
gate source), output id, output fingerprint digest, gate rule id, "CATTLE_ANIMAL", animal id, obligation /
occurrence id or null]`; one blocker per id, shared by every job; one id with different content fails
closed (`CATTLE_PLAN_BLOCKER_IDENTITY_CONFLICT`). A C8 proposal whose consulted gates contradict its C0
outcome is an invariant failure (`CATTLE_PLAN_OUTCOME_GATES_INCONSISTENT`).

**Folding (D2).** A C8 work item folds into C2 / C7 work only when every trigger reason code parses under
the frozen C8 grammar (strict: frozen state vocabulary, exact JSON, re-serialises to itself), each cited
item exists among C9's own items with the same family, animal, citation and consumed state, and the kind is
whitelisted (`RESOLVE_OBLIGATION_EVIDENCE` ↔ C2, `COMPLETE_PROGRAMME_ACTION` ↔ C7). It then becomes
supporting provenance (its origin and blockers move with it) of every cited item; otherwise it is a
separate proposal and its origin stays on its own item only. Folding decides job identity only: a
successfully folded C8 restatement does not create a second job, but its `DATA_GAP` / `RECOMMENDATION`
origin and complete provenance remain part of the canonical proposal group (`CattlePlanSupport.origin`;
group `origins` = every item's own origin plus each folded restatement's, `itemOrigins`). Creation source
is projected from that complete canonical origin set by the one B3 rule (so authoritative C2 / C7 work with
a folded restatement projects `COMPOSITE`). The fold reads its input as a set: an exact duplicate counts
once; a same-key conflict is never folded and fails closed in the group summary.

**Merge algebra.** Groups are the SET of items sharing `planJobIdentityKey`; merging is set union
(associative, commutative, idempotent, order-independent, no source precedence). One summary derives:
reasons / blocker ids / window bases unioned; earliest hard deadline by instant, projected authority the
canonical minimum, every authority kept; highest tier, bases unioned; equal action key, scope, window,
vocabulary row (so completion contract, title, route) by construction and checked; one origin → its
reason, several → `COMPOSITE`. The same item key with different content fails closed.

**Completion evidence (one vocabulary).** `completionContractFor` and `buildCanonicalEvidence` read the
same rows. Windowed C2 / C7 work: `OPERATIONAL_RECORD` with `recordKind = CATTLE_PLAN_COMPLETION:<job
identity>`; the evidence entry under that key is AVAILABLE with the owners' counted records (C2
`countedEvidence` → `CATTLE_OBLIGATION_FULFILMENT:<evidenceId>` at `fulfilledAt`; C7 `completion.counted`
→ declaration or C3 health-record id at `completedAt`) only when EVERY owner occurrence mapping to that
identity is completed by its owner, AVAILABLE with none when all are resolved and some not done, and
UNAVAILABLE when any is unresolved or not applicable. Window-less owner work: `MANUAL`. C8
`RECORD_WEIGHT`: `OPERATIONAL_RECORD` `CATTLE_WEIGHT_OBSERVATION:<animal>`, `notBeforeIso` = the request
`effectiveAt`; evidence = C4's latest-known weight bound by C8's sealed context (KNOWN → one record
`CATTLE_WEIGHT_SERIES:<digest>` at `observedAt`; NONE → none; unresolved / not supplied → UNAVAILABLE). C8
`DECLARE_PRODUCTION_GOAL`: `DATA_COMPLETION` `CATTLE_PRODUCTION_GOAL_IN_FORCE`; C6 ACTIVE → PRESENT (goal
snapshot ref), NONE → MISSING, unresolved / not supplied → not listed (UNKNOWN). Every other C8 kind:
`MANUAL`. Unknown is never complete.

**Scope reality (B2).** Per requested group, from C4 only: every animal MEMBER / NOT_MEMBER → `KNOWN` with
the MEMBER animals; any UNKNOWN / EVIDENCE_CONFLICT / INVALID → the selector `UNKNOWN` with reason
`CATTLE_GROUP_MEMBERSHIP_UNRESOLVED:{unknown, conflict, invalid}` (Plan then keeps the last members).

**Fingerprint.** `CATTLE_PLAN_INTERFACE_RESULT` (result fingerprint, FINGERPRINTS.md purpose 3) over the
canonical objects — both canonical times, work items (each with its consumed output id and fingerprint),
groups, group scopes (C4 scope fingerprint), canonical evidence and `withoutProposal` — never the Plan
projections. A consumed upstream change changes it; input order, equivalent instant spellings and inputs
no consumed output depends on do not. Change detection, not a signature.

**Reuse decisions.** Plan `planJobIdentityKey`, `recommendedWindow`, `hardDeadline`,
`systemPriorityRank`, `subjectRef` are called, never restated; C2 `toCanonicalPlainData`; C1
`rematerialiseAnimalLedger`, `compareInstants`, `deepFreezeAnimalValue`; C0 `compareSourceVersionRefs`;
C7 `programmeGateRuleId`; `assessment-integrity.ts` canonicalisation and SHA-256 unchanged. No cattle
derivation is restated.

**Admission boundary (CAT-INV-028 as clarified 2026-10-15; F004 architecture review 2, Outcome C,
2026-10-20).** Data flow: approved frozen engine → raw result → C9 predecessor adapter → admitted C9 DTO →
canonical C9 work items / groups → grouping, merge, evidence, timing, blockers, fingerprint → Plan
projection. The C2 / C4 / C7 / C8 outputs C9 obtains by invoking the frozen engines in-process are trusted
for their owners' domain semantics: C9 re-runs no predecessor business rule and never uses a predecessor
fingerprint as a validator. Binding invariant: no value from C2, C4, C7 or C8 may influence a C9-derived
identifier, decision, timing value, canonical key, completion reference, blocker, provenance reference,
fingerprint input or Plan projection until every raw operand whose validity C9 independently relies upon
has passed the appropriate C9-owned admission predicate; once admitted, downstream C9 derivation accepts
only admitted C9 values or canonical C9 objects, never raw predecessor records. The adapters
(`plan-adapters.ts`) are that admission boundary: each consumed family has one C9-owned DTO and one
exhaustive `DtoSpec` (`satisfies`: a DTO field without an admission node is a type error; specs name only
what C9 consumes, never the full predecessor shapes). `admitDto` copies exactly those operands,
untransformed — no interpolation, `JSON.stringify`, optional chaining, default or coercion before
admission — and admits each by presence, runtime type, format (`isOpaqueRef`, `isValidAnimalInstant`,
`fingerprintOf`, `sourceVersionRefOf`) and published vocabulary membership (C0 classification, gate role,
source-binding status and evaluation state; C2 / C7 states and window boundaries; C7 classification and
gate source; C8 outcome, tier, benefit claim and gate source; C4 / C6 states), plus the cross-object
consistency C9 relies on (B1 equivalence over admitted fingerprints; a proposed C8 action names exactly
one candidate). Only then are the values C9 primitives (`C9Ref`, `C9Text`, `C9Instant`, `C9Fingerprint`,
`C9SourceRef`, `C9Vocab` — brands minted nowhere else); every identifier / key / completion-reference
constructor (`obligationActionKey`, `programmeActionKey`, `recommendationActionKey`, `c2OutputId`,
`c7OutputId`, `obligationFulfilmentRecordId`, `programmeDeclarationRecordId`, `healthRecordRecordId`,
`weightSeriesRecordId`, `goalSnapshotRecordId`, blocker identities) accepts only them. Raw predecessor
results are confined to `plan-delegation.ts` / `plan-adapters.ts` / `plan-admission.ts` (static boundary
test: downstream modules import no predecessor result type or engine and apply no optional chaining or
nullish default); work items AND completion evidence derive from the same admitted DTOs. Any failure is
`CATTLE_PLAN_ADMISSION_FAILED` (ref `<where>:<raw path>`, `where` = `VIEWPOINT` / `C2` / `C7` / `C8` /
`C4:<groupRef>`), no proposals, never a throw. Defence in depth (not the boundary): the finished canonical
records (viewpoint, work items, no-proposal records, group scopes, `CanonicalEvidence`) are still checked
against their field tables and the identities C9 derives (item key, citation, action key, blocker id)
before grouping, merge or projection — a check of a derived value never establishes that its operands
were valid. `planNotBeforeBound` / `completionContractFor` never turn an invalid viewpoint into a
permissive cut-off (`null` ⇒ the proposal fails closed).

**Known limitations.** No C2 / C7 / C8 output is group-level work, so no proposal is `DYNAMIC`. A C7
action gate that is failing is an `ACTIVE` blocker even while C7 reports the occurrence `UPCOMING`. The
B5 hard deadline applies to every proposal-producing windowed legal / scheme hard-gate record, including
evidence-resolution work. `RECORD_WEIGHT` completes only on a weight observed at or after the request
`effectiveAt` (a back-dated weight received later leaves it open). The default-kind table interprets a
kind by its registered name. C9 composes predecessors per request; it persists nothing, and no public API
turns a stored C9 object or C8 pack into authoritative Plan work (CAT-INV-028 unchanged).

**Exclusions.** No Plan type, variant, route or behaviour change; no cattle calculation or evidence
reinterpretation; no real legal, veterinary, scientific or economic content; no persistence, scheduling,
notification, connector, migration, UI (C10) or AI.

## Cattle C10 — Cattle UX reference experience (2026-10-20)

Authority: `.agent/campaigns/cattle-engine-v1/C10_BRIEF.md` (human C10 overnight authorisation, 2026-10-20) and `C10_PREBUILD_REVIEW.md`. C10 consumes the frozen C1–C9 public exports and the Plan kernel; it changes no earlier module.

### Modules

- `src/domain/cattle/presentation/` — pure view-models over frozen outputs at one viewpoint (`CattleOutputs`): `buildAnimalProfile`, `buildHerd` / `animalRow`, `animalWork` / `workVM`, `buildAnimalTimeline`; display tables (`display-states.ts`) total over every frozen vocabulary C10 renders (`satisfies Record<…>`); display formatting (`format.ts`, the only place display rounding lives); the component boundary (`view-state.ts`: `Listing`, `NonEmpty`, `Details`, `SealedInput`); weights with their measurement basis and the chart (`weight-view.ts`); the Animal plan screen view-model (`plan-view.ts`: `planScreenView`); `cost-view.ts` (`costView`, the one display reading of a cost summary); `numeric-input.ts` (`stepDecimalText`, `canonicalNumberText` — exact form editing); `plan-timeline.ts` (`planTimeline`, the plan timeline from `PlanIntervals`). No clock, React, server or persistence import.
- `src/domain/animal-plan/` — the isolated C10 capability domain (never an input to C8, C9 or the Plan kernel): `cost-ledger.ts` (`AnimalCostEntry`, `summariseAnimalCosts`, `costPerKgLiveweight`), `mart-valuation.ts` (`MartValuationProvider`, `MartComparableResult`, `valueAnimalAtMart`), `plan-economics.ts` (`computeAnimalPlanEconomics`), `plan-intervals.ts` (`derivePlanIntervals` — the one plan-interval derivation), `plan-dates.ts` (date-only arithmetic). Exact decimals (`decimal.js`); definitions in `docs/evidence-register.md`, "Cattle C10 — animal plan definitions".
- `src/server/cattle-demo/` (server-only, demonstration mode only) — the `SYNTH-*` demonstration catalogue and herd, a stateless replay through C1 `projectAnimalSnapshot`, C4 `buildWeightReadContract` / `resolveGroupScope`, C5 `evaluatePerformance` (incl. `projectionAt`), C6 `projectProductionGoals`, C3 `projectAnimalHealth`, C8 `recommendCattle`, C9 `planCattleWork` and Plan `createPlanJob` / `reevaluatePlanJob`; fixture cost entries and a DEVELOPMENT_FIXTURE mart provider.
- `src/app/(app)/cattle/` — routes `/cattle`, `/cattle/groups/[groupRef]`, `/cattle/animals/[tag]`, `/cattle/animals/[tag]/plan`; server functions `loadCattleHerd`, `loadCattleAnimal`, `projectCattleWeight` (refuse outside demonstration mode; validate the caller's session, tag, scenario and date before any engine runs).
- `src/components/cattle/` — screens and the client demo session (`CattleDemoSessionProvider`, `demo-session.ts` zod contract), photo boundary (`AnimalPhotoStore`, session-only adapter).

### Contracts

- Data honesty: Supabase configured ⇒ `CattleUnavailable` and refusing server functions; only demonstration mode renders `SYNTH-*` data, always labelled.
- Time: the demonstration viewpoint is fixture-supplied (`2026-10-16T09:00:00Z`); session action k happens at base + (k + 1) × 10 min. No clock in any domain, view-model or replay path.
- Work: Plan jobs are created from C9 proposals and re-evaluated by the Plan kernel at every later viewpoint; order = `compareSystemPriority` then job id; completion, readiness and status are the kernel's. RECORD_WEIGHT closes only by a weight observed at or after the viewpoint the gap was raised (C9 `WEIGHT_OBSERVED_SINCE`); a back-dated weight does not.
- Timing: C9 windows are shown as "Recommended window"; "Must be done by" appears only for a C9 `hardDeadline`. A `LEGAL_WINDOW` blocker on withdrawal is described as an engine check, not a legal ruling.
- Projection: only C5's labelled PREDICTION (`LINEAR_EXTRAPOLATION_OF_PERIOD_ADG`); feed / housing inputs never change it. A failed projection request is its own reason (`PROJECTION_REQUEST_FAILED`), never a perpetual pending state.
- **Housing facts vs planning assumptions (2026-10-21 repair, audit F011): unknown facts block the economics that depend on them; an explicit planning assumption may enable a scenario but never becomes recorded fact.** `AnimalPlanEconomicsInput.currentHousing` is the OBSERVED state as a `HousingObservation` (`KNOWN { housed }` or `UNKNOWN { reason: NOT_RECORDED | RECORDS_DISAGREE | RECORD_INVALID | RECORD_UNAVAILABLE | LOCATION_NOT_SPECIFIC }`). `AnimalPlanAssumptions.assumedCurrentHousing` (`"OUTDOORS" | "HOUSED" | null`) is used only when the observed state is unknown; an observed state always wins. The result reports `housing: { observed, basis: OBSERVED | ASSUMED | UNKNOWN, assumption, housedNow }`. With basis UNKNOWN every result in `HOUSING_DEPENDENT_RESULTS` (housed / outdoor days, housing cost, holding cost, total cost by sale, projected direct profit, return from holding, cost per kg at sale) is UNKNOWN (`CURRENT_HOUSING_UNKNOWN`) — with or without a planned housing date; with basis ASSUMED those results are computed and the screen marks each "Assumed housing". No default ever sets an assumption.
- Economics: `projectedDirectProfit = projectedSaleValue − recordedDirectCosts − forecastDirectHoldingCost`; `currentSellNowMargin = currentEstimatedMarketValue − recordedDirectCosts`; `returnFromHolding = projectedDirectProfit − currentSellNowMargin`; unknown inputs ⇒ UNKNOWN with reasons, never zero.
- Valuation: provider result carries mart, report date, freshness (caller-supplied stale-after days), comparable category, basis, observed range, central derivation, live vs fixture; €/kg × liveweight is labelled DERIVED.
- Failed evaluation: a null C4 / C5 output (fail-closed upstream) renders `EVALUATION:UNAVAILABLE` ("Couldn't be read") for weight, gain, target, trend and projection — never "not weighed" or "needs another weight"; the chart is not drawn.
- **Availability invariant (2026-10-21 repair, audit F005 family `UNAVAILABLE_AS_EMPTY`): C10 never collapses unavailable / unknown / unresolved / failed data into a known-empty state.** Every view-model value that aggregates an owner output is an `Availability<T>` (`availability.ts`): `{ state: "KNOWN", value }` (may legitimately be empty / zero) or `{ state: "UNAVAILABLE", display }` with an `UNAVAILABLE_DISPLAY` state (`EVALUATION:UNAVAILABLE`, `SCOPE:UNAVAILABLE`, `PLANNING:UNAVAILABLE`, `COST:UNAVAILABLE`); no empty array, zero or `null` stands in for "not produced". Applies to: group scope (members, count, location, unresolved, performance counts) and group work counts; the herd's open-work count; each animal row's next job; the profile's open work, chart, medicines, programmes, obligations and cost summary (`AnimalCostRead`). Owner absence is the owner's answer — `null`, `{ ok: false }`, or no entry for the animal (C4 / C5 emit one per requested animal) — and C10 keeps the owner's own specific states (`WEIGHT:NONE`, `GOAL:NONE`, `IDENTITY:UNKNOWN`, `MEMBERSHIP:*`) wherever the owner produced one. A missing C1 snapshot makes identity fields `EVALUATION:UNAVAILABLE` (never "not recorded"); a missing C6 projection makes the goal unavailable; a missing C3 projection makes withdrawal and medicines unavailable. The timeline lists the families it couldn't include (`timelineGaps`, incl. costs). Enforced by `src/components/cattle/availability-invariant.test.tsx` (owner-failure mutation matrix over the real engine outputs, rendered).
- **Explicit admission (2026-10-21 structural repair, invariant A extended; audit F005 third recurrence): every owner-derived value a component, form or plan calculation consumes crosses the C10 boundary as an explicit state — never a bare `T | null`, an empty array, `0` or a fallback that could mean either "none" or "unknown".** The weight is `LatestWeightVM` (`KNOWN { kg, observedAt } | NONE | CONFLICT { candidatesKg } | UNSUPPORTED | UNAVAILABLE`, `latestWeightOf`); the plan reads it as `CurrentWeightRead` (`currentWeightInput`: `NOT_WEIGHED | WEIGHTS_DISAGREE | UNIT_NOT_SUPPORTED | WEIGHTS_UNAVAILABLE`, each its own `CURRENT_WEIGHT_*` reason); the record-weight sheet's line is `previousWeightLine` — "No earlier weight recorded." only for C4 NONE, "Previous weight couldn't be determined — records disagree (…)" for a conflict, "Previous weight couldn't be checked." when unavailable; nothing is averaged or picked. Housing is `HousingObservation`; the goal is `GoalRead` (`ACTIVE { targetWeight: KNOWN | NOT_SET | UNRESOLVED } | NONE | UNRESOLVED`) and the plan's `saleDateSource` is `GOAL | NO_GOAL_DATE | GOAL_UNRESOLVED` (an unresolved goal is never "no goal"); costs are read once through `costView` (`UNAVAILABLE | NONE_RECORDED | NOT_IN_EURO | UNREADABLE | RECORDED` with exact totals). Herd rows say "records disagree" / "can't be read" rather than "not recorded" for a disputed breed, sex or location; a group's work is its counts, "Nothing currently needs attention" (KNOWN empty) or "Work couldn't be checked" (`PLANNING:UNAVAILABLE`); a group's membership is a count (may be 0) or "Membership couldn't be checked" (`SCOPE:UNAVAILABLE`). The timeline also lists unreadable group / location history and a missing per-animal weight series; a work item whose C8 record couldn't be read says so. Local UI state (form drafts, the session photo store) stays ordinary optional state. Enforced by `availability-invariant.test.tsx` (owner-failure mutations over the real replay, incl. the plan surface), `c10-invariants.test.ts(x)` and `cattle-boundary.test.ts` (no bare nullable weight / housing / goal prop in components).
- **Numeric precision (invariant B): presentation formatting may round; editing and saving never reduce precision.** A form field's canonical value is its exact decimal text; the record-weight sheet starts from the exact previous weight (`canonicalNumberText`) and every stepper adds an exact decimal step (`stepDecimalText`, `decimal.js`): 548.24 + 5 = 553.24. Display rounding stays in `format.ts`; no component rounds, truncates or re-parses a value (enforced statically in `cattle-boundary.test.ts`; chart axis geometry excepted).
- **One plan-interval derivation (invariant C, audit F012): `derivePlanIntervals` resolves plan start, sale, housing basis (observed / assumed / unknown), the outdoor and housed phases (`[from, to)` whole UTC days; housing today ⇒ housed every remaining day; a planned housing date is unused when housed now), totals and date validity once.** `computeAnimalPlanEconomics` returns it as `intervals` and takes every day count from it; the plan timeline is `planTimeline(economics.intervals)` (wording and bar proportions only). No component or other C10 module computes plan days (enforced statically).
- **Component boundary (2026-10-21 presentation-boundary repair, audit 75774 — F005 fourth recurrence): farmer-facing cattle components never interpret domain absence, failure, uncertainty or provenance; those are decided in `src/domain/cattle/presentation` and arrive as explicit states (`view-state.ts`).** A domain collection is a `Listing<T>` — `ITEMS { items: NonEmpty<T> } | EMPTY { display } | UNAVAILABLE { display }` — so known-empty wording ("No weights recorded yet", "No open jobs for this animal", "No animals are recorded in this group") is authored only in `EMPTY_DISPLAY` and unavailable wording only in `UNAVAILABLE_DISPLAY`; an explanatory list is a `Details<T>` (declared "empty means nothing further to show"); owner reads a component must pass back unread (the plan economics inputs) are a `SealedInput<T>` read only by `planScreenView`. The weight chart is `WeightChartVM` (`weightChartOf`): CHART (≥ 1 plottable value), NOT_CHARTABLE (records exist, none plottable — e.g. an unsupported unit; the records are listed), EMPTY (C4 has no observation in view and C5 no point) or UNAVAILABLE (C4 or C5 produced nothing for the animal, or they disagree) — never "no weights" unless EMPTY. The Animal plan component holds form state only and renders `PlanScreenVM` (`planScreenView`: every figure a KNOWN cell or "Unknown — why", assumption / fixture / estimate marks decided). Enforced by `src/components/cattle/component-boundary.test.ts` with the TypeScript checker over every exported cattle component: R1 no plain array and no nullable non-text value anywhere in a domain- or server-declared prop type (index signatures included; sealed inputs not walked); R2 the domain is imported only through `@/domain/cattle/presentation`; R3 no read of a sealed input; R4 no component-written `??` / `||` fallback text; R5 no emptiness test on a domain collection; R6 no component-written absence wording outside a reviewed allowlist of UI copy — each rule proven on planted fixtures, including the shipped F005 chart bypass.
- **Housing from the location kind only (2026-10-21, authorised product interpretation, audit F011 recurrence):** `LOCATION_KIND_HOUSING` / `housingObservationOf`: C1 location kind `HOUSING` ⇒ `KNOWN { housed: true }`; `FIELD` ⇒ `KNOWN { housed: false }`; `HOLDING`, `EXTERNAL`, `OTHER` ⇒ `UNKNOWN { reason: LOCATION_NOT_SPECIFIC }`; missing / disputed / unreadable / unavailable location ⇒ `UNKNOWN` with its own reason; an unlisted kind ⇒ `RECORD_INVALID`. Never inferred from the opaque ref, a label or farming practice. UNKNOWN blocks every housing-dependent figure until the farmer states an assumption (above).
- **Measurement basis (2026-10-21, audit F013; material provenance survives the boundary):** a KNOWN latest weight carries `basis: WeightBasisVM` from C4 — the `measurementBasis` and `observation.method` of the single record `latest.recordIds[0]` (no C0–C9 change). Only a MEASURED (scale / weighbridge) weight is "Weighed {date}"; an estimate is "Tape estimate · {date}" / "Visual estimate · {date}", an external figure "External figure · {date}", an unrecorded method "Method not recorded · {date}" — in the current-weight metric, the record sheet's previous-weight line, the herd row, the activity timeline and the chart (solid only when measured; legend "Weighed" only when a measured point exists). The plan and the mart estimate name an estimated current weight. A KNOWN C4 weight whose record can't be found is UNAVAILABLE, never shown without its provenance. The C4 `KNOWN` display label is basis-neutral ("Weight recorded").
- **Audit 97274 repair (2026-10-21; F005 fifth recurrence, F013 second, F014 new):** (1) *Goal target:* `AnimalProfileVM.goal.summary` is the resolved goal line — an ACTIVE goal always states its target weight as KNOWN (kg), UNRESOLVED (the recorded value and unit, "can't be converted to kg") or "no target weight set", and its date or "no target date set"; the chart's `GoalOverlay` is SHOWN / UNRESOLVED (with a note) / NOT_SHOWN; saving a plan over an unresolved recorded target says it replaces it. Component rule **R7 OMISSION** (component-boundary test): no `cond ? text : ""` on a possibly-missing value — a component never silently drops part of a line. (2) *Information class:* a timeline entry's class is the owner's `informationClass` through one total table (`timelineClassOf`, `satisfies Record<CattleInformationClass, …>`): C4 `DERIVED_VALUE` is "Calculated", never "Observation"; a C3 record with no class is "Record", never promoted to "Fact". (3) *Denominators:* `computeAnimalPlanEconomics` never makes a non-finite result KNOWN (`RESULT_NOT_FINITE`), and a projected weight that isn't positive is UNKNOWN (`PROJECTION_NOT_POSITIVE`) together with every figure that uses it (sale value, profit, return, cost per kg at sale). Frozen C5 is unchanged: its PREDICTION is returned as before; C10 decides only whether it can be shown (see the next entry).
- **Claude audit 2026-10-22-1 repair (2026-10-23; CL-001 – CL-004, independent Claude audit, not Codex):** (1) *One projection admission:* `admitProjectedWeight(kg)` (animal-plan) is the only reading of a C5 PROJECTED weight in C10 — USABLE only when positive and finite, else NOT_USABLE (`PROJECTION_NOT_POSITIVE` / `PROJECTION_INVALID`). The plan economics, the profile projection (`PREDICTION:NOT_USABLE`, no label) and the chart overlay (`ChartOverlay` NOT_USABLE with a note, nothing drawn) all use it, so a negative C5 straight line is never shown as a weight anywhere. (2) *One goal read:* `goal-read.ts` reads a C6 declaration once — target KNOWN / UNRESOLVED (recorded value and unit) / NOT_SET, used by the goal line, chart, timeline and plan; the timeline keeps an unconvertible target as recorded. `GoalRead` ACTIVE carries **every** goal C6 has in force (C6 reports several and chooses none; only SALE+RETAIN or one type with two outcomes is INTENT_CONFLICT). C10 never picks one: `soleActiveGoal` yields a goal only when exactly one is in force, so with several the goal line lists them all, the chart draws no goal line (a note says why), no projection date is taken from a goal (`PREDICTION:SEVERAL_GOALS`), and the plan's goal-weight row, target box and sale date take none (`SaleDateSource` SEVERAL_GOALS). A declared goal date that isn't ahead is named (`GOAL_DATE_NOT_AHEAD`), never "no goal date". (3) *Deadline wording:* a C9 hard deadline (sourced authority; `dueIso` exclusive — the Plan kernel counts any later instant as late) reads "Must be done before {date}", like its window; C7 programme `DUE` reads "In its recommended window", never "Due now".
- **Claude audit 2026-10-22-1 Medium repair (2026-10-23; CL-005, CL-006, CL-009; authorised product decisions):** (1) *Display precision:* `formatProjectedKg` — a positive projected weight never reads "0 kg"; below half a kilogram it is "<1 kg" (profile, chart, plan). The canonical value is unchanged; a zero / negative / non-finite projection stays NOT_USABLE. (2) *Planning horizon:* `admitProjectedWeight(kg, daysAhead)` also refuses a projection more than `PLAN_PROJECTION_HORIZON_DAYS` = 90 days ahead (`PROJECTION_BEYOND_HORIZON`; day count `projectionDaysAhead` in plan-intervals.ts, the plan's own `totalDays`). It is a C10 decision-use safeguard, not a C5 limit or biological rule: the plan keeps the farmer's sale date, cost forecasts stay, and every projection-dependent figure (projected weight, sale value, cost per kg at sale, projected direct profit, return from holding) is UNKNOWN with "too far away for Farm Return's current straight-line weight forecast"; the profile says `PREDICTION:BEYOND_HORIZON` and the chart draws nothing (note). Order: invalid / not positive before horizon. (3) *Goal version history:* each C6 goal version on the timeline is marked from C6's own record state — `SUPERSEDED` ("Superseded", or "— goal ended" / "— goal withdrawn" from the replacing record's action via `supersededBy`), `CONFLICT` (a version in a C6 intent conflict), `CURRENT` ("Current goal": in force and C6 ACTIVE), `NOT_IN_FORCE` (a live declaration outside its valid period); END / WITHDRAW records carry their own titles. `TimelineEntryVM.markerLabel` holds the words (a corrected weight stays "Corrected"). Plan defaults read only goals in force (`GoalRead`). Also (CL-013, same figures): per-kg money is grouped ("€4,615.49/kg") and the plan's return heading carries the year.
- **Strict audit 59009 repair (2026-10-23; F015 – F018, structural):** (1) *No unowned first-item selection:* `headlinePerformance` reads EVERY C5 target comparison — one comparison is its own state; several with one state share it (`target.summary` "On track across 2 targets"); several that differ are `TARGET:MIXED` ("Mixed target results"), never the first one's state — and `target.comparisons` lists each with its own state, value, band and the source of the EXACT version C5 compared (`comparison.target`; conflicting versions said as such). C3 withdrawals are kept per queried food product (`health.withdrawals`, a medicine's withdrawal per product, `saleWithdrawalNotices` one notice per product that bears on the date, naming it; no product-to-slaughter rule invented). A job's headline over several open blockers in different states is `BLOCKER:MIXED`; each blocker's wording uses that blocker's own kind. Every remaining first-item read in presentation is a guarded singleton or annotated `first-item:` with its owner order (Plan-kernel job priority) — enforced by a structural test. (2) *No numeric rewriting:* `parseNumericInput(raw, NumericFieldSpec)` is the one reader of farmer-typed numbers (`NUMERIC_FIELDS` WEIGHT_KG / TARGET_KG / PLAN_AMOUNT, all positive-only): raw text is kept as typed; "." or "," is the decimal separator (input convenience; canonical text uses "."); exponents, letters, several separators, signs on positive-only fields, too many decimals and out-of-range values are refused with a farmer message; a comma before exactly three digits ("1,000") and grouped forms are refused ("Enter the number without a thousands separator."). `stepNumericInput` steps exactly (548.24 + 5 = 553.24) and never overwrites text that isn't a valid number. The plan passes the economics only parsed values; an invalid field is refused there with its message. A structural test bans `.replace(`, `Number(`, `parseFloat(`, `parseInt(` and `type="number"` in cattle components. (3) *Price basis:* a per-head comparable reads €/head (`formatEuroPerHead`), never €/kg, and the projected sale value hint "× projected weight" appears only for a per-kg price (the per-head projection stays UNKNOWN). (4) *Modal:* Record Weight uses the shared `src/components/ui/Sheet` (focus trap, Escape, focus restore, nested-sheet registry); the cattle copy is removed; the scale reading is focused inside the trapped panel.
- **Strict audit 76481 repair (2026-10-23; F001 JOB_PROVENANCE_LIFETIME):** a Plan job's "Why?" is its ORIGINAL justification, kept with the job for its whole life. The demo replay records each job's `origin` (`CattlePlanJobOrigin`) at the run that creates it: the C9 proposal group with the job's identity and — when that group cites C8 outputs (an item or a folded restatement) — the C8 record whose `packId` IS the cited output id (`jobOrigin`; a C8 failure or no record with that id is UNAVAILABLE, never a record of the same kind from elsewhere; no citation is NOT_C8). `workVM` builds the explanation from the origin only; `why.raised` gives when it was raised and, separately, whether the latest run still proposes the work (STILL_RAISED / NO_LONGER_RAISED with a farmer sentence / UNKNOWN / CLOSED). A job with no recorded origin, or an unreadable origin record, says its evidence isn't shown — nothing is borrowed from a later run. Blocker wording still reads the latest run's group (blockers are current state), falling back to the origin's.
- Currency: the plan computes in euro only (`PLAN_CURRENCY`); a cost ledger in any other currency makes recorded costs UNKNOWN (`COSTS_NOT_IN_EURO`) and is shown with its ISO code (`formatMoney`), never a € sign. No exchange rate is used.
- Inputs: a recorded weight is submitted exactly as entered; rounding is display-only (see invariant B).
- Views: every demonstration screen loads through `useDemoView`, keyed by screen identity (route, tag, scenario) and session; an empty session shows the server-rendered view, a superseded response is dropped, a pending view is marked busy. A session action refused at capacity (40) is reported and never shown as saved.
- Saving: a refused save is always reported (independent of draft state); the status never implies an unsaved plan was saved.
- Withdrawal and sale date: `saleWithdrawalNotice` reads the C3 withdrawal gate's own `inWithdrawalUntil` against the planned sale date (the end's calendar day counts as inside); IN_WITHDRAWAL without an end, UNKNOWN and EVIDENCE_CONFLICT always show a check-first notice. A notice, not a legal determination; it does not block saving.

### Known limitations

- No persistence: weights, saved plans (C6 goal versions), plan drafts and photos live in the browser tab only; cost entries and mart prices are fixtures. Storage owners and migrations for weights, goals, the cost ledger and photos are open decisions.
- No weight-staleness rule (2026-10-21): the demonstration runs the frozen default C8 registry unchanged (`DEMO_ACTION_REGISTRY === DEFAULT_CANDIDATE_ACTION_REGISTRY`), so RECORD_WEIGHT is raised only when no usable weight is in view. The latest weight's date is shown as information only. A staleness policy is a future, separately authorised product decision.
- Boundaries kept as isolated adapters (no persistence in C10): weights and goals are cattle-contract semantics written through the demo session (C4 observations, C6 declarations) — C10 orchestrates, never redefines; photos are an application / media capability behind `AnimalPhotoStore` (session-only adapter), outside every cattle engine; the animal cost ledger is an economics capability C10 consumes (`AnimalCostRead`), not owns; mart valuation stays behind `MartValuationProvider` (fixture only, never scraped or live); non-euro costs stay UNKNOWN in the euro plan — FX belongs to a future economics layer with source, rate, currency pair, effective date and provenance.
- C8 explanation text and reason codes are machine strings; C10 maps known codes to farmer sentences and keeps the rest under "Technical detail".
- Herd views replay the whole demonstration herd (~1 s cold); animal views replay one animal.
- Small positive projections (2026-10-21; display amended 2026-10-23): the plan uses C5's PREDICTION whenever it is a positive weight within the 90-day planning horizon. A declining animal can be projected to a fraction of a kilogram, shown as "<1 kg" (never "0 kg"), with a correspondingly huge cost per kg at sale. That is exact arithmetic over a labelled prediction; no plausibility floor is applied because none is sourced (AGENTS.md: no invented scientific number). Only a zero / negative / non-finite projection is refused (`PROJECTION_NOT_POSITIVE` / `PROJECTION_INVALID`).

### Exclusions

No change to C0–C9, the Plan kernel, `src/lib/farm-data/`, `supabase/`, configs or dependencies; no AI, network, scraping or live market data; no feed-response, price-forecast or health model; legacy `/livestock` unchanged.
