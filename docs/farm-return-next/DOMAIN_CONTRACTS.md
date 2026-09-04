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
`soil.ts`, `supplier-quotes.ts`, `support-profile.ts`, `telemetry.ts`.

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
| `gps-activity-detection.ts` | GPS Job Mode / Uber-style Activity Recording campaign, Phase 1, 2026-09-04 (Codex audit round 1 HIGH: dwell/sample-count/ratio rescoped to `candidateFieldEnteredAt`, not the whole observation window; round 2 HIGH x3: the current sample must itself be positive evidence before firing `candidate_start`, not just the historical aggregate; finish detection no longer gates "still in field" on speed, only genuine boundary departure; field containment is now accuracy-aware, not raw-centre-point-only; round 4 HIGH: added `candidateFieldSampleCount`, the qualifying-window sample count, so a caller persisting real detection evidence never misuses the whole window's own total; round 5 HIGH: `isUsableSample` (renamed from `hasUsableAccuracy`) now also rejects out-of-range lat/lng and a malformed `recordedAt` — previously a NaN/garbage sample could silently stall detection rather than being cleanly rejected; round 5 HIGH: `advanceFinishDetection` now uses a new three-way `classifyFieldMembership` ("inside"/"outside"/"ambiguous") instead of a bare "confidently inside or not" check — a run of genuinely ambiguous, poor-accuracy fixes near the field boundary no longer counts as departure evidence the way a confidently-outside fix does; an `activeFieldId` with no matching field entry now fails closed (`"ambiguous"`) instead of ambiguously matching nothing; round 6 HIGH: the departure window is now anchored to `firstGenuineOutsideAt` (the first genuinely `"outside"` sample since the last confirmed-inside moment, reset only on a genuine `"inside"` confirmation, untouched by an `"ambiguous"` sample in between) with a hard requirement that the *current* sample itself classify as `"outside"` before the duration/count check is even considered — closing a gap where real clock time passing through a run of merely `"ambiguous"` fixes after earlier genuine outside evidence could otherwise cross the threshold on stale evidence alone; round 6 MEDIUM: `gps-activity-candidate-controller.ts`'s `start()`/`stop()` no longer races — a concurrent `start()` joins the one in-flight promise instead of double-subscribing, and a `stop()` arriving while `start()` is still awaiting the provider is honoured the instant `start()` knows its own outcome, rather than silently no-op'ing on a not-yet-`true` `started` flag and leaving a live subscription running; round 7 MEDIUM: that same `stopRequestedDuringStart` flag could leak forward if the in-flight `start()` attempt finished *without* ever installing a subscription (platform unsupported, or `getCapability()` itself throwing) — a later, genuinely successful `start()` would then immediately undo itself reacting to an already-stale stop request; now cleared unconditionally once any in-flight attempt finishes, having already been consumed if it was genuinely relevant; round 7 MEDIUM: `ActiveJobSessionView.tsx` seeds its `session`/`finishDetection`/`tracking` state from props exactly once, at mount, with nothing re-syncing it to a later prop change — `job/[id]/page.tsx` now gives `ActiveJobSessionView` a real `key={id}`, so React never reconciles two different job sessions onto the same instance (the App Router does not itself guarantee a fresh instance just because a dynamic segment's param changed); the finish-detection reset identity inside the component also now includes `session.id`, not just `activeIntervals.length`, as defence in depth; round 8 HIGH: `firstGenuineOutsideAt` now also resets to `null` on an `"ambiguous"` sample (not just left untouched, as round 6 had it) — a long ambiguous gap no longer lets two sparse `"outside"` fixes it bridges satisfy the duration/count thresholds on stale, non-continuous evidence; sustained departure must now be shown by a genuinely unbroken run of `"outside"` samples; round 8 MEDIUM: `GpsActivityCandidateCard.tsx`'s periodic permission re-check now handles a rejected `getCapability()` explicitly (logged, never an unhandled rejection, and never treated as evidence of a denied permission) instead of only ever handling the fulfilled case; round 9 HIGH x2, new `maxSampleGapSecondsForContinuity` config: (1) the start detector previously only ever *switched* `candidateFieldId` to a different real field it stably agreed on, never dropping it just because the farmer had genuinely, stably left it — a farmer leaving the established candidate for several minutes and later returning could have both visits' evidence silently combined into one continuous-looking dwell; a stable run of samples all confidently away from the current candidate now drops it entirely, same as a fresh search. (2) both detectors now also reset their own accumulating evidence anchor across a real gap between consecutive accepted samples larger than `maxSampleGapSecondsForContinuity` (an app interruption, background suspension, or signal loss) — previously two sparse pieces of real evidence either side of such a gap, with literally nothing recorded during it, could still satisfy a duration/count threshold as if evidence had continued throughout; round 10 HIGH: round 9's own "stable departure drops the candidate" fix compared `fieldContainingSample`'s binary answer (which folds a genuinely `"ambiguous"` fix — poor accuracy near a boundary, or two real overlapping field polygons — into the same `null` as a confidently-outside one) against the candidate field id, so two merely inconclusive fixes could wrongly erase valid, still-accumulating dwell evidence; now reuses `classifyFieldMembership`'s three-way answer against the candidate field specifically, so only a confidently `"outside"` run drops it; round 11 HIGH, new `isMonotonic`: neither detector previously checked that an accepted sample's own `recordedAt` was actually after the previously accepted one's — a real, delayed/cached fix (browser geolocation timestamps are acquisition time, not delivery order) could arrive with an *earlier* timestamp than one already accepted, producing a negative gap/duration this file's own arithmetic never anticipated and letting a threshold appear satisfied almost instantly; a non-monotonic sample is now rejected outright, the same fail-closed treatment as bad accuracy or an invalid coordinate; round 12 HIGH: this row's own text had claimed the "modules with no external source" precedent applied since Phase 1, but no actual `evidence-register.md` entry was ever filed for it — added now, belatedly, following `near-field.ts`'s exact format) | `near-field.ts` (`distanceToPolygonKm`/`distanceToPolygonBoundaryKm`, unmodified — real polygon-boundary distance and boundary-edge distance, never centroid); `weather-stations.ts` (`haversineDistanceKm`, unmodified — real inter-sample speed derivation); `iso-datetime.ts` (`isValidIsoUtcDateTime`, unmodified, added round 5 — the same frozen calendar-exact UTC validator already used elsewhere, replacing this module's own weaker `Number.isNaN(new Date(...).getTime())` sample-timestamp check) | `advanceStartDetection`/`advanceFinishDetection` — pure, deterministic GPS Activity Candidate detection, entirely upstream of any real `job_sessions` row (`job-session-lifecycle.ts`'s own frozen state machine is untouched and takes over completely once a farmer confirms a candidate). Two independent detectors (start: searches every mapped field for genuine dwelling; finish: watches an already-known active field for genuine departure), never one combined machine. Every heuristic threshold (`GpsActivityDetectionConfig`) is named, centralised, and disclosed as a product heuristic, not a scientific/regulatory fact — see `evidence-register.md`'s own "Modules with no external source" section (round 12 fix: filed there, following `near-field.ts`'s/`units.ts`'s own precedent this row's text had cited since Phase 1 without ever actually filing). Fails closed on missing/non-finite/non-positive/kilometre-scale accuracy, out-of-range coordinates, and malformed timestamps (test-enforced), never counts a fast (road-speed) sample as dwelling evidence, requires `fieldSwitchStabilitySamples` consecutive agreeing samples before switching the candidate field (jitter/boundary-crossing protection), treats a boundary-ambiguous fix as genuinely inconclusive rather than either "inside" or "outside" evidence, and a terminal state (`expired`/`candidate_finish`) ignores further samples rather than reacting again. |
