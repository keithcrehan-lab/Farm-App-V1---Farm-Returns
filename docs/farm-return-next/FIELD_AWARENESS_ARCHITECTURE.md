# Field Awareness / Satellite Field Intelligence — architecture

Campaign: "Farm Awareness / Satellite Field Intelligence", baseline
commit `aa236f0` (Checkpoint 1.5 closed). This document is the required
Phase 0 findings + architecture record for that campaign.

**Naming**: the campaign brief itself uses "Farm Awareness" for
satellite/field intelligence, but that term already means something
else, real and shipped, in this codebase — the GPS Job Mode campaign's
low-power background location mode
(`LocationTrackingProvider.startFarmAwareness`,
`src/lib/location/location-tracking-provider.ts`). To avoid a genuine
naming collision with an existing, unrelated, already-audited contract,
everything built in this campaign uses **Field Awareness** — the
brief's own alternative term — exclusively.

## Phase 0 — what already existed (inspection findings)

- **`src/server/satellite/cdse-stac-client.ts`** — real, live-verified
  (2026-09-01) unauthenticated STAC catalogue search against
  `https://catalogue.dataspace.copernicus.eu/stac`
  (`searchSentinel2L2AScenes`, `buildSentinel2SearchUrl`). Returns a
  `StacSearchResult` that always resolves (`"ok"` or `"unavailable"`),
  never throws. Each `Sentinel2L2AItem` carries real STAC metadata:
  scene id, bbox, geometry, acquisition `datetime`, platform,
  constellation, cloud cover, processing level/version, product type,
  and — only when the provider's own response includes it — a
  `statistics` map of CDSE's own real, scene-*wide* pixel-classification
  percentages (e.g. a "vegetation" class).
- **`src/domain/satellite-field-coverage.ts`** — pure, tested. Given a
  field's real polygon and a set of candidate scenes,
  `selectBestSatelliteCoverage` re-checks each candidate's real footprint
  against the field polygon with `@turf/turf`'s `booleanIntersects` (not
  just a bbox overlap), then picks the least-cloud-cover match within a
  lookback window (tie-break: most recent), returning
  `EngineOutcome<SatelliteFieldCoverage>`. `BLOCKED_INSUFFICIENT_EVIDENCE`
  (`NO_RECENT_SATELLITE_SCENE_AVAILABLE`) covers every real "no usable
  observation" case — an empty candidate list, a provider outage, or a
  too-loose search bbox — never silently downgraded to a poorly-matching
  `OK`.
- **`docs/farm-return-next/BLOCKERS.md`** (product-owner decision,
  2026-09-01) already recorded the decisive limitation this whole
  campaign is built around: **real NDVI/vegetation-index computation
  from raw Sentinel-2 spectral bands is blocked by a hard policy
  prohibition on creating a CDSE account** (needed for the `oidc`/`s3`
  credentials band downloads require) — confirmed as a policy
  limitation, not a technical or network one (the STAC catalogue itself
  is reachable and needs no authentication). This decision is not
  reopened by this campaign.
- **`FieldDrawer.tsx`**'s own `TABS` comment already documented a
  deliberate deferral: a real field-scoped activity list "isn't
  buildable here without a materially larger data-layer change" because
  `FieldDrawer` reads the client-side `farm-store`, while jobs/decisions
  are fetched server-side. This directly shaped this campaign's own
  architecture decision (below) to build Field Awareness as a new
  server-side aggregator, not a retrofit of `FieldDrawer`'s existing
  tabs.
- **`src/domain/job-actual.ts`**'s `ActivityType` already has five real,
  validated variants (`fertiliser_spreading`, `slurry_spreading`,
  `silage`, `field_inspection`, `livestock_work`) — real "known farm
  activity" cross-referencing (brief item 12) is genuinely buildable from
  the existing Confirm Actual contract, not fertiliser-only. Of these,
  only the four field-scoped types carry a real `payload.fieldIds` at
  all — `livestock_work` genuinely has none (Codex audit LOW, round 5),
  so it can never actually appear in a `FieldAwarenessSnapshot`'s own
  `recentActivity`, correctly and by design (it is not field-scoped
  evidence).
- **`src/lib/farm-data/job-sessions.ts`**'s `listConfirmedJobSessionsForFarm(farmId)`
  already returns every confirmed session — up to its own real
  `MAX_CONFIRMED_JOB_SESSIONS` (200) cap, with a `truncated` flag when a
  farm has more than that — with its current `JobActualRecord` embedded
  (`primaryFieldId`, `activityType`, `completionType`, `confirmedAt`) —
  no new query needed; this campaign filters that existing, farm-scoped
  result by field rather than adding a "list by field" query. `truncated`
  is now surfaced as a real, disclosed snapshot warning when it occurs
  (Codex audit MEDIUM, round 3 — see below), not silently dropped.
- **Zero real UI callers** of `selectBestSatelliteCoverage` or
  `searchSentinel2L2AScenes` existed anywhere in `src/app`,
  `src/components`, or `src/orchestration` before this campaign —
  genuinely greenfield UI wiring.
- **`src/lib/farm-data/fields.ts`**'s own header comment documents RLS as
  the actual farm-ownership enforcement boundary for this table, with
  most mutation exports adding an explicit `farm_id` filter as defence
  in depth on top of it — except its internal `fetchField(fieldId)`
  helper, which filters by `id` alone. This campaign's own farm-scoping
  work (below) does not rely on that helper or on RLS alone.

### What's genuinely real vs. simulated today

- **Real, live**: Sentinel-2 L2A scene discovery via CDSE's STAC
  catalogue (mission, scene id, acquisition timestamp, cloud cover,
  processing metadata, real field-footprint intersection check).
- **Real, but not field-specific**: CDSE's own scene-*wide*
  vegetation-pixel-percentage statistic, when present — evidence about
  the whole ~100km-tile scene, never this field's own condition.
- **Not real, not built**: any field-specific vegetation index (NDVI or
  otherwise), any biomass/yield/growth-rate figure, any nutrient or
  disease diagnosis from imagery. None of these can be honestly computed
  today (see the BLOCKERS.md decision above) and none are simulated as a
  stand-in — this campaign fails closed rather than fabricating them.
- **Real, reused**: confirmed farm activity (silage, fertiliser/slurry
  spreading, field inspection, livestock work) from the existing GPS Job
  Session + Confirm Actual contract.
- **Spatial resolution / refresh cadence**: whatever CDSE's own
  Sentinel-2 L2A catalogue actually provides — roughly 10-20m surface
  resolution depending on band, and a real revisit interval of
  approximately 2-3 days over Ireland, subject to genuine, sometimes
  multi-day, cloud-cover gaps (Irish weather's own real tendency, not a
  Farm Return limitation).

## What this campaign built

A single, coherent, farm-scoped read model — `FieldAwarenessSnapshot`
(`src/domain/field-awareness.ts`) — answering "what does Farm Return
currently know about this field's monitoring", honestly, never more than
the evidence supports:

- **`src/domain/field-awareness.ts`** — pure domain module. Reuses
  `EngineOutcome<SatelliteFieldCoverage>` directly (no parallel
  envelope). Classifies real observation age into a `freshness` state
  (`current`/`recent`/`ageing`/`stale`/`unavailable`), derives a
  `confidence` label (`high`/`medium`/`low`) and an `attention` state
  (`normal`/`worth_watching`/`worth_checking`) from that freshness alone
  — never from a fabricated crop-condition signal, because none exists
  — and defensively re-filters any `recentActivity` entry to the
  snapshot's own field, never trusting a caller's pre-filtering (the
  same discipline Checkpoint 1.5's `buildFarmContext` already
  established). See `docs/evidence-register.md`'s "Modules with no
  external source" entry for the disclosed thresholds
  (`FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS`,
  `FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS`) — product judgement, never
  agricultural or remote-sensing science.
- **`src/orchestration/field-awareness/index.ts`** —
  `getFieldAwarenessForCurrentUser(fieldId)`: resolves the current
  user's real farm (`getFarmForCurrentUser`), re-verifies `fieldId`
  belongs to it via the already farm_id-scoped `listFieldsForFarm`
  (never a new raw `id`-only query, never RLS alone — see "Farm-scoping"
  below), then concurrently fetches real satellite coverage (CDSE search
  + `selectMostRecentUsableSatelliteCoverage` — a real, disclosed
  cloud-cover ceiling, ranked by recency among usable candidates, not
  `selectBestSatelliteCoverage`'s least-cloud-globally strategy; see
  "Codex audit round 1" below — using a field's real polygon bbox and a
  30-day lookback) and real confirmed activity for that field (matched
  on the confirmed Actual's own authoritative `payload.fieldIds`, not
  just the session's single `primaryFieldId` — see "Codex audit round
  2"), and hands both to `buildFieldAwarenessSnapshot`.
- **`src/app/actions/field-awareness.ts`** — `getFieldAwarenessAction`, a
  thin Server Action wrapper, same "never trust a client-supplied farm
  id" discipline every other action in this directory already follows.
- **`src/components/farm/FieldAwarenessCard.tsx`** — the one real
  farmer-facing surface (brief item 8), inserted into `FieldDrawer.tsx`'s
  existing "Now" tab. Re-fetches on `field.id` and `field.polygonCapturedAt`
  (not `field.id` alone — see "Codex audit round 2"; no polling, no
  per-render re-fetch otherwise — item 19). Shows: the latest satellite
  pass (date + age + real scene-wide cloud-cover percentage, or an
  honest reason why not), a confidence badge, up to three recent
  confirmed activities, an attention pill only when genuinely warranted,
  and one plain-language "what this means" line. Never shows raw bands
  or index numbers, and never lets provider branding dominate the card
  (item 21's actual concern — no logo, no visual identity) — it does
  name "Copernicus Sentinel-2" once, in a single plain-text attribution
  line, the same honest sourcing disclosure every other tracked value in
  this app already carries (`StatusBadge`'s `SourceBadge`).

## What was deliberately NOT built (and why)

- **Vegetation trend / biomass estimate** — no real field-specific signal
  exists (see Phase 0 above); inventing one would violate the brief's own
  scientific-honesty section outright.
- **Farm Map visual redesign / per-field attention overlay (item 7)** —
  `FarmMapCard.tsx` was already deliberately neutralised (no per-field
  numeric badge) in an earlier remediation pass, and there is no real
  per-field signal to justify adding one now. Building an attention
  overlay on top of monitoring-currency alone (rather than crop
  condition) risked exactly the "technical remote-sensing dashboard" the
  brief itself warns against for a signal this thin. Deferred, not
  silently dropped.
- **Live satellite calls inside `FarmContext`/`getFarmContextForCurrentUser`
  (item 15)** — would mean a live external CDSE HTTP call per field on
  every AI-context build, with no caching/persistence layer yet to make
  that cheap; a direct conflict with the brief's own performance section
  (item 19). `FieldAwarenessSnapshot`'s shape is ready for a future,
  properly-cached integration (documented here as the extension point),
  but the live fetch path is not wired into `FarmContext` this campaign.
- **Today/Prompt integration (item 10)** — a satellite-based prompt needs
  a real, non-fabricated "this looks different" trigger; no such signal
  exists (see Phase 0). The brief's own top-line instruction — "do not
  fabricate an action merely because an observation exists" — and item
  10's own "only where justified" both directly support deferring this.
- **Farmer confirmation / learning hook (item 11)** — no mature learning
  or calibration layer exists to attach farmer confirmations
  (looks normal / recently grazed / recently cut / waterlogged / other)
  to; building one now would be a new, undirected taxonomy the brief
  explicitly warns against ("do not build a large new observation
  taxonomy or fabricate learning/calibration algorithms"). The hook is
  the same one item 15 already preserves: a future feature can read
  `FieldAwarenessSnapshot` and `FieldAwarenessRecentActivity` and add a
  confirmation write path once real orchestration for that exists,
  without any change to this module's own shape.
- **Anything on the "DO NOT BUILD" list (item 22)** — AI chat, LLM
  integration, livestock UI, EID/government integrations, drone/machinery
  telemetry, paid satellite subscriptions, unsupported biomass
  prediction, disease diagnosis, broad computer-vision experimentation —
  none of it was touched.

## Farm-scoping invariant — how this campaign honours it

- `getFieldAwarenessForCurrentUser` never accepts a client-supplied farm
  id — the current farm is always resolved server-side via
  `getFarmForCurrentUser()`.
- It never queries `fields` by `id` alone (the one place in this
  codebase that does, `fields.ts`'s internal `fetchField`, relies on RLS
  as its real backstop, documented in that file's own header comment).
  Instead it reuses `listFieldsForFarm(farmId)` — which already applies
  a real, explicit `.eq("farm_id", farmId)` filter — and finds the
  target field by id within that already farm-scoped result.
- A `fieldId` that does not belong to the current farm and a genuinely
  non-existent `fieldId` are indistinguishable to the caller (both
  resolve to `null`) — deliberately: this gives a cross-farm access
  attempt no signal to work from.
- `buildFieldAwarenessSnapshot` (the pure domain layer) independently
  re-filters `recentActivity` to the snapshot's own `fieldId`, so a bug
  in the orchestration layer's own filtering can never leak another
  field's confirmed activity into a snapshot.
- No satellite provider call or activity lookup is ever made before
  field ownership is verified.
- Regression tests: `src/orchestration/field-awareness/index.test.ts`
  covers "no current farm", "field belongs to another farm", and
  "activity from another field dropped even if the caller forgot to
  filter"; `src/domain/field-awareness.test.ts` covers the same
  defence-in-depth filter at the pure domain layer.

## Evidence register

See `docs/evidence-register.md`'s "Modules with no external source"
section for the `field-awareness.ts` entry — freshness thresholds,
lookback window, and the confidence/attention classifications are all
disclosed there as product judgement, never presented as agricultural or
remote-sensing science.

## Migrations

None. No new table, no new column — `FieldAwarenessSnapshot` is computed
on demand from existing `fields`, `job_sessions`/`job_actuals` data and a
live CDSE API call; nothing is persisted.

## Codex audit round 1 — 1 High + 2 Medium + 1 Low fixed

- **HIGH — no cloud-cover usability ceiling.** The first version called
  `selectBestSatelliteCoverage`, which always returns the least-cloudy
  real candidate within the lookback window *however cloudy that
  candidate actually is* — a fully cloud-obscured (100%) scene, if it
  was the only real candidate, was selected and then classified
  "current"/"high confidence" by the UI. Fixed by adding
  `FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT` (40, disclosed in
  `docs/evidence-register.md`) and a new, purely additive
  `selectMostRecentUsableSatelliteCoverage` export on
  `satellite-field-coverage.ts` (`selectBestSatelliteCoverage` itself is
  unmodified — same behaviour, same 21 pre-existing tests unchanged) —
  a candidate above the ceiling is never selected, however recent.
- **MEDIUM — least-cloud-first selection could manufacture a stale
  classification despite recent usable coverage.** Because
  `selectBestSatelliteCoverage` ranks by cloud cover globally, a
  29-day-old 0%-cloud scene could beat a 1-day-old, still perfectly
  usable, 1%-cloud scene — an honest answer to "clearest image in the
  window" but a misleading one for "how recently have we had a usable
  look". Fixed by the same new `selectMostRecentUsableSatelliteCoverage`
  function: among candidates at or below the usability ceiling, it picks
  the *most recent*, not the least-cloudy — the actual "monitoring
  currency" question this campaign needs answered.
- **MEDIUM — a provider outage was reported identically to a confirmed
  absence of coverage.** The first version converted any
  `StacSearchResult.status !== "ok"` (timeout, network failure,
  malformed response) into the same `BLOCKED_INSUFFICIENT_EVIDENCE` a
  genuine "searched successfully, found nothing usable" case returns,
  discarding the provider's own real failure reason and telling a
  farmer "no usable satellite observation found" when the truth was "we
  couldn't check". Fixed: a provider failure now returns
  `unknown("SATELLITE_PROVIDER_UNAVAILABLE")`, and
  `buildFieldAwarenessSnapshot` gives it its own distinct warning
  ("Could not reach the satellite service to check this field just
  now.").
- **LOW — a stale test-count claim.** This document's own text (an
  earlier draft) miscounted the domain test file's test count; corrected
  once genuinely re-verified.

No cross-farm access, ownership bypass, migration, production-database
change, mock data reaching production, or GPS Job Mode regression was
found. Quality gate after this round: 1762/1762 tests (139/139 files).

## Codex audit round 2 — 2 High + 2 Medium fixed, 1 Low claim rejected

- **HIGH — round 1's cloud-cover ceiling did not close the confidence-
  inflation problem it was meant to.** `cloudCoverPercent` is real
  scene-*wide* STAC metadata (the whole ~100km tile), never a per-pixel
  check of one small field within it — passing the 40% usability
  ceiling only establishes "most of the scene was clear", not that this
  field's own pixels were visible. Genuinely confirming field-level
  visibility needs the same per-pixel band access NDVI computation
  requires, which stays blocked for the same disclosed reason. Fixed by
  reducing the claim, not by chasing an unattainable precision: UI
  wording changed from "Latest usable observation"/"a clear satellite
  look at this field" to "Latest satellite pass" (timing, not
  visibility); the real cloud-cover percentage is now shown directly;
  and `classifyFieldAwarenessConfidence` gained a second threshold
  (`FIELD_AWARENESS_CLOUD_COVER_HIGH_CONFIDENCE_MAX_PERCENT`, 15%) — a
  real, non-trivial cloud reading now caps confidence at `"medium"`,
  never `"high"`, even for an otherwise-current, still-usable scene.
- **HIGH — the fetch effect never re-ran when a field's boundary was
  mapped or edited.** `field.id` does not change when `field.polygon`
  does, so `FieldAwarenessCard` could keep showing "not mapped yet"
  after a real mapping, or a stale snapshot after a real edit. Fixed:
  the effect now also depends on `field.polygonCapturedAt`.
- **MEDIUM — a provider outage still manufactured field-directed
  advice.** `UNKNOWN` mapped to the same `"worth_checking"` attention a
  confirmed absence of coverage gets, even though an outage tells a
  farmer nothing about the field itself. Fixed:
  `classifyFieldAwarenessAttention` now takes an `isProviderOutage` flag
  and stays `"normal"` for a genuine outage.
- **MEDIUM — confirmed activity matching missed genuine secondary
  fields and had no recency window or explicit sort.** The confirmed
  Actual's own real `payload.fieldIds` (the authoritative field list for
  fertiliser/slurry/silage/field_inspection actuals) was never
  consulted, only `session.primaryFieldId`. Fixed: matches on either;
  `buildFieldAwarenessSnapshot` gained a disclosed
  `FIELD_AWARENESS_ACTIVITY_LOOKBACK_DAYS` (60) window, sorts by
  `confirmedAt` descending, and rejects a future-dated/malformed
  timestamp.
- **LOW, partially accepted** — a genuinely self-contradictory
  "satellite-field-coverage.ts unmodified" phrase in `BUILD_STATE.json`
  and a stale `selectBestSatelliteCoverage` reference in this document's
  own "What this campaign built" section (both left over from round 1's
  own edits) were real and are now corrected, along with an imprecise
  "no caching layer" claim — `cdse-stac-client.ts` does carry a real
  `next: { revalidate: 3600 }` directive, functionally defeated by the
  search URL's own second-precision timestamp (see "Known limitations"
  below for the corrected wording). **Rejected**: the same finding's
  claim that the pre-campaign baseline had 19
  `satellite-field-coverage.test.ts` tests. Directly re-verified by
  checking out `aa236f0` (this campaign's own baseline commit) and
  running that exact file in isolation: 21 tests pass, matching what
  round 1's own commit already recorded. No change made for this
  sub-claim.

No cross-farm access, ownership bypass, migration, production-database
change, or GPS Job Mode regression was found in this round either.

## Codex audit round 3 — 2 High + 2 Medium fixed, 1 Low finding

- **HIGH — round 2's cloud-cover confidence cap did not close the
  underlying inferential gap.** `cloudCoverPercent` is scene-wide, and
  no threshold on it — 15%, 5%, any value — can establish that one
  small field within the scene was genuinely visible; this is an
  inferential limit, not a calibration problem. Fixed by removing the
  cloud-cover-based degradation entirely and lowering the honest ceiling
  itself: `classifyFieldAwarenessConfidence` now never returns `"high"`
  from satellite evidence — `"medium"` is the ceiling regardless of
  freshness or cloud reading (the type still permits `"high"` for a
  genuinely different future evidence source, e.g. a farmer's own
  ground-truth confirmation). The real cloud-cover percentage stays
  directly disclosed in the UI so a farmer/reviewer can weigh it
  themselves, rather than folding it into a tier that cannot actually
  speak to field-level visibility.
- **HIGH — a narrower, related gap in the same eligibility check.**
  Field/scene eligibility uses `booleanIntersects`, not full
  containment, so a field straddling the edge of two Sentinel-2 tiles
  could match a scene that only captured part of it. **Reviewed and
  rejected for a code change** (documented per this campaign's own "a
  finding may be rejected only where there is a clear, documented
  technical/product reason" rule): this behaviour is inherited
  unchanged from `satellite-field-coverage.ts`'s own
  `filterEligibleCandidates`, part of the Checkpoint 2/Vertical H
  contract this campaign reuses — already frozen and independently
  Codex-audited across 8 rounds *before* this campaign existed. Fixing
  it would mean reopening that closed audit and changing shared
  selection semantics both `selectBestSatelliteCoverage` and this
  campaign's own `selectMostRecentUsableSatelliteCoverage` rely on, well
  outside this campaign's own scope and authority. It is also a narrow
  edge case in practice — a Sentinel-2 scene footprint is roughly
  100km x 110km, so an ordinary Irish farm field sits comfortably
  inside a single tile in the overwhelming majority of cases. Instead:
  documented honestly as a known, disclosed limitation (below) and in
  `docs/evidence-register.md`.
- **MEDIUM — confirmed-activity matching still trusted a bare
  `primaryFieldId` fallback.** Round 2's fix matched on
  `primaryFieldId OR payload.fieldIds`, but a session's `primaryFieldId`
  can genuinely diverge from what the confirmed Actual's own
  authoritative `fieldIds` says (e.g. the farmer changed the field
  selection when confirming). Fixed: the orchestration layer now matches
  on `payload.fieldIds` alone, for every field-scoped activity type;
  `primaryFieldId` is never consulted for this purpose again.
- **MEDIUM — `listConfirmedJobSessionsForFarm`'s own real `truncated`
  flag was silently discarded.** A farm with more than
  `MAX_CONFIRMED_JOB_SESSIONS` (200) real confirmed sessions could have
  its "Recent confirmed activity" section quietly present an incomplete
  list as though it were complete. Fixed: `FieldAwarenessInputs` gained
  an optional `recentActivityTruncated` flag, propagated from the
  reader's own real `truncated` value, and `buildFieldAwarenessSnapshot`
  now surfaces an honest warning when it is true.
- **LOW — three real, stale doc cross-references.**
  `docs/evidence-register.md` still named `selectBestSatelliteCoverage`
  in two places describing behaviour round 1 had already moved to
  `selectMostRecentUsableSatelliteCoverage`, and still said "a clear
  satellite look" in wording round 2 had already softened elsewhere;
  `field-awareness.ts`'s own doc comments had the identical staleness.
  All corrected in the same pass as the code fixes above.

No cross-farm access, ownership bypass, migration, production-database
change, or GPS Job Mode regression was found in this round either.

## Codex audit round 4 — 1 High + 1 Medium fixed, 1 Low fixed

- **HIGH, fixed (reframes round 3's rejected finding)** — round 3
  correctly declined to modify `satellite-field-coverage.ts`'s own
  shared, frozen `filterEligibleCandidates` (an `booleanIntersects`-only
  check inherited from Vertical H) to fix a real tile-edge partial-
  coverage gap, since doing so would reopen that closed, 8-round-audited
  contract for every caller. Round 4 correctly reframed the fix:
  `selectMostRecentUsableSatelliteCoverage` — this campaign's own new,
  still-unfrozen function — can add a stricter, *additional*,
  function-local requirement without touching the shared helper at all.
  Fixed: it now also requires `booleanContains(sceneFootprint,
  fieldPolygon)` — genuine full containment, not mere intersection —
  before a candidate counts as usable. `selectBestSatelliteCoverage`'s
  own behaviour, tests, and frozen contract remain completely untouched.
- **MEDIUM, fixed** — the round-3 activity-truncation warning was added
  to `snapshot.warnings`, but `FieldAwarenessCard.tsx` only ever read
  `warnings[0]`, and only inside `observationSummary`'s own fallback
  branch (rendered exclusively when satellite coverage is NOT `OK`). A
  genuine truncation occurring alongside perfectly normal, current
  coverage never reached the farmer at all. Fixed: the exact warning
  text is now exported as `FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING`
  from `field-awareness.ts`, and the card checks for it explicitly, in
  its own dedicated render block, independent of coverage status.
- **LOW, fixed** — `FieldAwarenessCard.test.tsx`'s own default snapshot
  fixture still defaulted to `confidence: "high"`, and two tests
  explicitly asserted "High confidence" — a state production's own
  `classifyFieldAwarenessConfidence` can no longer reach from satellite
  evidence after round 3's fix, contradicting round 3's own claim that
  every such assertion had been updated. Fixed: the default fixture and
  those two tests now use `"medium"` (what production actually
  produces); a new, explicitly-labelled test preserves coverage of the
  "high" rendering branch as a forward-compatibility case for a
  genuinely different future evidence source, not today's normal farmer
  experience.

No fabricated vegetation/biomass/yield/nutrient/disease claim, cross-farm
access, ownership bypass, Today/Prompt or AI-context integration,
migration, production-database change, or GPS Job Mode regression was
found in this round.

## Codex audit round 5 — 3 Medium fixed, 2 Low fixed, 1 High reviewed and partially accepted

- **HIGH, reviewed and partially accepted (documented rejection of the
  remainder)** — the finding argued that, without field-pixel quality
  evidence, this feature should never show a `"normal"`/no-action
  conclusion at all. Accepted and fixed: `whatThisMeans`'s own
  `"normal"` copy, "No action is required at the moment.", could be
  misread as a claim about the field's own condition — reworded to
  "Field monitoring is up to date — no satellite-related action
  needed." to make the real subject (monitoring currency) explicit.
  **Rejected beyond that**, with a documented reason
  (`FieldAwarenessCard.tsx`'s own header comment carries the full
  account): this module's scope has never claimed field-level
  visibility certainty — `freshness`/`attention`/`confidence` classify
  monitoring currency only, and `classifyFieldAwarenessConfidence`
  already never returns `"high"` from satellite evidence for exactly
  this reason (round 3). Eliminating every "normal"/positive state
  whenever any remote-sensing evidence is involved at all is an
  unfalsifiable standard no real quantitative satellite metadata could
  ever satisfy, and would make classifying monitoring currency from
  satellite evidence impossible in principle — directly contradicting
  the campaign brief's own verbatim "good" example ("Satellite
  confidence is limited because the latest usable observation is 12
  days old", implying a recent observation may legitimately read as
  reassuring about monitoring currency specifically).
- **MEDIUM, fixed** — the 30-day search window could exceed
  `cdse-stac-client.ts`'s own real `DEFAULT_LIMIT` (20), and the STAC
  endpoint's own result ordering for an unpaginated request is
  unspecified — a genuinely more recent or usable scene could silently
  fall outside the returned page. Fixed: the orchestration layer now
  requests a disclosed, generous `FIELD_AWARENESS_SATELLITE_SEARCH_LIMIT`
  (100).
- **MEDIUM, fixed** — `SatelliteFieldCoverage` never carried
  `constellation`/`processingVersion` through from the real STAC item,
  even though the brief's own item 2 explicitly names "processing/
  version info" among the provenance a satellite observation must
  preserve. Fixed: both added as purely additive, always-populated
  optional fields (`selectBestSatelliteCoverage`'s own existing callers
  and tests are unaffected).
- **MEDIUM, fixed** — the card silently truncated `recentActivity` to
  three entries with no indication of the real remainder, separate from
  (and in addition to) the database-level truncation warning already
  added in round 4. Fixed: a "+N more" line now discloses the real
  count beyond the display limit.
- **LOW, fixed** — `field-awareness.ts`'s own header comment still
  called `satellite-field-coverage.ts` "unmodified"; the orchestration
  layer's own file-level header comment still said it calls
  `selectBestSatelliteCoverage`; the new selector's own returned
  `algorithm` string still said "intersects" after round 4 changed its
  real behaviour to full containment; the evidence register's own
  description of the new selector had the same staleness. All
  corrected.
- **LOW, fixed** — the architecture doc's own claim that confirmed
  activity includes all five activity types overstated what is
  reachable: `livestock_work` has no `payload.fieldIds` at all and can
  never actually appear in a `FieldAwarenessSnapshot`. Corrected to
  state explicitly that only the four field-scoped types can appear, by
  design.

No fabricated vegetation/biomass/yield/nutrient/disease claim, cross-farm
access, ownership bypass, Today/Prompt or AI-context integration,
migration, production-database change, or GPS Job Mode regression was
found in this round.

## Codex audit round 6 — 1 High fixed, 1 High rejected (repeat of round 5), 1 Low fixed

- **HIGH, fixed — a genuine bug introduced by round 5's own wording
  change.** `classifyFieldAwarenessAttention` returns `"normal"` for
  three genuinely different real causes: no mapped boundary, a genuine
  provider outage, and genuinely current usable coverage — but round
  5's reworded copy, "Field monitoring is up to date", was shown for
  all three. This produced a real, directly self-contradicting message
  (e.g. "Field boundary is not mapped yet." immediately followed by
  "Field monitoring is up to date"). Fixed: `whatThisMeans` now takes
  the whole snapshot and gives each of the three real causes its own
  distinct, non-contradictory copy.
- **HIGH, rejected — a repeat of round 5's own already-addressed
  finding.** The identical underlying argument ("scene-wide cloud cover
  is still treated as proof of a usable field-monitoring observation")
  was raised again with no materially new angle. Rejected for the same
  documented reason round 5 already gave (see that round's own account
  above, and `FieldAwarenessCard.tsx`'s own header comment) — repeating
  an already-addressed objection does not change the analysis.
- **LOW, fixed** — `DOMAIN_CONTRACTS.md`'s own `field-awareness.ts` row
  still listed `satellite-field-coverage.ts` as an "unmodified"
  dependency, contradicting the very next row (and that module's own
  row) which correctly describe its real round-1/round-5 changes.
  Corrected to describe what this file actually consumes (the type,
  reused directly — not the modified selection functions) without the
  stale, contradictory "unmodified" claim.

No fabricated vegetation/biomass/yield/nutrient/disease claim, cross-farm
access, ownership bypass, Today/Prompt or AI-context integration,
migration, production-database change, or GPS Job Mode regression was
found in this round.

## Codex audit round 7 — 2 Medium fixed, 1 High rejected (repeat), 2 findings rejected with documented reasons

- **HIGH, rejected (third repeat of round 5's own already-addressed
  finding)** — the identical scene-wide-cloud-cover argument was raised
  a third time with no materially new angle. Rejected for the same
  documented reason rounds 5 and 6 already gave.
- **MEDIUM, fixed (genuinely new, distinct wording-precision gap)** —
  `selectMostRecentUsableSatelliteCoverage` deliberately excludes any
  candidate above the disclosed cloud-cover ceiling before picking the
  most recent survivor, so the scene shown as "Latest satellite pass"
  can genuinely be older than the single most recent real Sentinel-2
  pass over the field, if that more recent one was too cloudy. Fixed:
  the label now reads "Latest satellite pass (within the cloud limit)"
  so it never implies "the single most recent pass, full stop".
- **MEDIUM, fixed (genuine resiliency bug)** — satellite coverage and
  confirmed-activity retrieval were coupled through a single
  `Promise.all`; a real database error from the optional,
  supporting activity read discarded otherwise-valid, already-resolved
  satellite coverage entirely, rendering nothing. Fixed: the activity
  read now fails independently (`.catch`), with a distinct, honest
  `FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING` surfaced when it does
  — the satellite result still reaches the farmer. Deliberately NOT
  applied the same way to the satellite fetch's own throw paths: those
  are genuine caller/programmer bugs (invalid polygon or invalid
  selector options), which should fail loud rather than be silently
  reinterpreted as "no satellite data" — a real provider failure
  already returns `unknown(...)` rather than throwing.
- **Rejected, with a documented reason — "provenance does not survive
  through to the UI".** No such claim ("the evidence/provenance chain
  survives through to the UI") appears verbatim in this campaign's own
  documentation; the phrase traces to Codex's own prior-round summary
  language ("`EngineOutcome<SatelliteFieldCoverage>` remains intact
  through the action and component boundary"), which described the
  server-side data flow accurately, not a promise about what the
  farmer-facing card itself renders. The implicit suggestion — showing
  mission/productId/algorithm/calculationVersion/evidenceState on the
  card — is not adopted: this campaign's own brief (item 21) explicitly
  warns against exactly this ("no raw bands, unexplained index numbers,
  jargon... A small, excellent field-awareness UI is preferable to a
  large analytical dashboard"). The full provenance already exists in
  `SatelliteFieldCoverage`/`EngineOutcome`, available to a future
  drill-down, audit tooling, or `FarmContext` consumer without needing
  to be crammed onto this small card.

No fabricated vegetation/biomass/yield/nutrient/disease claim, cross-farm
access, ownership bypass, Today/Prompt or AI-context integration,
migration, production-database change, or GPS Job Mode regression was
found in this round.

## Codex audit round 8 — 1 Medium clarified, 1 Low fixed, 1 High rejected (fourth repeat)

- **HIGH, rejected (fourth repeat of round 5's own already-addressed
  finding)** — the identical scene-wide-cloud-cover argument, raised a
  fourth time with no materially new angle. Rejected for the same
  documented reason rounds 5, 6, and 7 already gave; this is now a
  closed, permanent position for this module (`docs/evidence-register.md`).
- **MEDIUM, clarified (not a bug)** — `observationAgeDays` floors
  elapsed time to whole days, so an observation 3 days 23 hours old
  floors to `3` and stays `"current"`. This is a deliberate, correct
  "N days ago" display convention — the same one used everywhere an
  elapsed-day count appears in this app — not an accidental extension
  of the documented thresholds; rounding instead would produce a worse
  inaccuracy in the opposite direction (a same-day observation reading
  as "1 day ago" past the 12-hour mark). `FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS`'s
  own doc comment now states this explicitly, and a real boundary-case
  test (3 days 23 hours → still `"current"`) locks in the intended
  behaviour.
- **LOW, fixed** — `BUILD_STATE.json`'s own `contracts_frozen_note`
  called this campaign's new contracts "unaudited", despite the same
  record documenting seven completed, genuine Codex audit rounds.
  Corrected to say the audit loop has not yet closed with a clean
  round, not that no auditing has happened.

No fabricated vegetation/biomass/yield/nutrient/disease claim, cross-farm
access, ownership bypass, Today/Prompt or AI-context integration,
migration, production-database change, or GPS Job Mode regression was
found in this round.

## Known limitations

- Satellite coverage for a field can be genuinely absent for weeks at a
  time (cloud cover, tile-edge gaps) — this is disclosed via `freshness`/
  `confidence`, not hidden.
- **Scene-wide cloud cover is not a field-level visibility guarantee**,
  at any threshold — `cloudCoverPercent` is real STAC `eo:cloud_cover`
  over the whole ~100km Sentinel-2 tile scene, not a per-pixel check of
  one field within it. `classifyFieldAwarenessConfidence` accounts for
  this by never returning `"high"` from satellite evidence alone (Codex
  audit round 3) — `"medium"` is the honest ceiling. Genuinely closing
  this gap would require the same per-pixel band access NDVI computation
  needs, which stays blocked (`BLOCKERS.md`).
- **Resolved for this campaign's own selector (Codex audit round 4)**:
  `selectMostRecentUsableSatelliteCoverage` now requires a candidate
  scene to genuinely `booleanContains` the whole field, not merely
  intersect it — a field straddling a Sentinel-2 tile edge can no longer
  be matched to a scene that only captured part of it. This is a
  function-local, additional requirement; `selectBestSatelliteCoverage`
  itself and the shared `filterEligibleCandidates` intersects check are
  unchanged, so any other real or future caller of
  `selectBestSatelliteCoverage` still has this narrow limitation (a
  Sentinel-2 scene footprint is ~100km x 110km, so an ordinary Irish
  farm field sits comfortably inside a single tile in the overwhelming
  majority of cases either way).
- CDSE's `statistics.vegetation` figure, when present, is scene-wide, not
  field-specific — this module never surfaces it as a field observation.
- No persistence layer exists for satellite results, and no genuinely
  effective caching either — Codex audit round 2 correctly noted that
  `cdse-stac-client.ts`'s own `fetch` call does carry a real Next.js
  `next: { revalidate: 3600 }` directive, but the search URL this
  campaign's orchestration layer builds includes `generatedAt` (the
  current instant, second-precision) as `dateTo`, so almost every real
  request produces a distinct cache key — the directive exists but is
  functionally defeated here. Each `FieldAwarenessCard` mount therefore
  still makes what is, in practice, a real CDSE search call. Acceptable
  for now (one field detail view at a time, no polling), but a future
  campaign wanting to expose Field Awareness through `FarmContext` or a
  farm-wide map view will need a real, deliberate caching/persistence
  layer first (see item 15's deferral above) — e.g. rounding `dateTo` to
  a coarser boundary (the hour, say) so repeated requests within a
  window genuinely share a cache key.
- No farmer confirmation/learning hook UI exists yet — the domain shape
  supports adding one without a breaking change.

## Future extension points

- `FieldAwarenessSnapshot`'s shape is ready to be exposed through
  `FarmContext` (`src/orchestration/ai-context/index.ts`) once a cached/
  persisted satellite layer makes that cheap enough to compute per farm
  context build.
- `FieldAwarenessRecentActivity` and `FieldAwarenessSnapshot` are ready
  inputs for a future farmer-confirmation/learning feature, once a real
  orchestration layer for that exists.
- A future campaign with a real per-field crop-condition signal (e.g.
  genuine CDSE credentials becoming available, or a calibrated
  vegetation-index model) can extend `SatelliteFieldCoverage` and this
  module's `attention`/`confidence` logic without changing
  `FieldAwarenessSnapshot`'s existing shape.
