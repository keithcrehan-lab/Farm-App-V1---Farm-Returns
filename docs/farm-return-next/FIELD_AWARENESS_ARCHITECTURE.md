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
  the existing Confirm Actual contract, not fertiliser-only.
- **`src/lib/farm-data/job-sessions.ts`**'s `listConfirmedJobSessionsForFarm(farmId)`
  already returns every confirmed session with its current `JobActualRecord`
  embedded (`primaryFieldId`, `activityType`, `completionType`,
  `confirmedAt`) — no new query needed; this campaign filters that
  existing, farm-scoped result by field rather than adding a
  "list by field" query.
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
  + `selectBestSatelliteCoverage`, using a field's real polygon bbox and
  a 30-day lookback) and real confirmed activity for that field, and
  hands both to `buildFieldAwarenessSnapshot`.
- **`src/app/actions/field-awareness.ts`** — `getFieldAwarenessAction`, a
  thin Server Action wrapper, same "never trust a client-supplied farm
  id" discipline every other action in this directory already follows.
- **`src/components/farm/FieldAwarenessCard.tsx`** — the one real
  farmer-facing surface (brief item 8), inserted into `FieldDrawer.tsx`'s
  existing "Now" tab. Fetches once per `fieldId` (no polling, no
  per-render re-fetch — item 19). Shows: latest usable observation (date
  + age, or an honest reason why not), a confidence badge, up to three
  recent confirmed activities, an attention pill only when genuinely
  warranted, and one plain-language "what this means" line. Never shows
  raw bands, index numbers, provider branding, or a technical dashboard.

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

## Known limitations

- Satellite coverage for a field can be genuinely absent for weeks at a
  time (cloud cover, tile-edge gaps) — this is disclosed via `freshness`/
  `confidence`, not hidden.
- CDSE's `statistics.vegetation` figure, when present, is scene-wide, not
  field-specific — this module never surfaces it as a field observation.
- No caching/persistence layer exists yet for satellite results — each
  `FieldAwarenessCard` mount makes a real CDSE search call. Acceptable
  for now (one field detail view at a time, no polling), but a future
  campaign wanting to expose Field Awareness through `FarmContext` or a
  farm-wide map view will need one first (see item 15's deferral above).
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
