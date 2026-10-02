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
| `domain/slurry-rate-allocation.ts` (`buildSlurryRateAllocation`, `slurry_rate_allocation_v0.1.0-draft`) | `NutrientPlan` from `calculateNutrientPlan` (consumed, never recomputed) | Keeps crop requirement, available slurry nutrient, organic share limit, allocated credit, remaining chemical requirement, rate constraints and final rate separate. Each constraint record carries rule ID, evidence class, claim IDs, version, input, limit, output, binding and reason. `finalAllowedRate` is always DEFERRED. Every record has `affectsProductionOutput: false`. Design: `campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` |
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
