# Farm Return Next — master specification

**Status:** active. **Source:** the product owner's architecture brief given
directly in chat on 2026-08-29, on branch `farm-return-next`, cut from tag
`v1-baseline-2026-08-29`. This is the only architecture document for Next
that exists — there is no separate external spec file to reconcile against.
If one exists outside this repo, it supersedes this document wherever they
conflict; until supplied, this file is authoritative for Next. See
`BLOCKERS.md` for what's still an open assumption pending confirmation.

This file is the top of the source-of-truth hierarchy for **Next**, the
same role `docs/product-requirements.md` plays for V1. It does not replace
`product-requirements.md` — V1's entities, calculations and provenance model
are inherited whole (see "Relationship to V1" below) and that document
still describes them.

## What Farm Return Next is

Farm Return V1 is a **record-keeping and calculation** platform: the farmer
enters data, the domain engines compute a plan or a figure, the farmer
reads it. Farm Return Next turns the same domain model into a **decision
and action loop** — the app increasingly tells the farmer what to do next,
lets them act from inside it, and learns from what actually happened.

Next is an **orchestration and operating-system evolution, not a rewrite**.
Every validated V1 domain calculation, persistence pattern and provenance
rule is preserved and reused as-is; Next adds a layer on top that observes,
prompts, and closes the loop from estimate to actual.

## Core product loop

**Observe → Estimate → Prompt → Decide → Act → Confirm → Actual → Learn**

| Stage | What happens | Maps onto (V1-inherited) |
|---|---|---|
| **Observe** | The app ingests whatever it can see without asking: farmer-entered records, phone GPS while the farmer is on the farm, weather/market data already wired in V1, time (season, closed periods, housing calendar). | Existing `farm-store.tsx` state, `src/domain/weather-*`, `market.ts`. |
| **Estimate** | A domain engine turns Observe's inputs into a number or a status. | `src/domain/*.ts` — unchanged, reused verbatim. |
| **Prompt** | The app surfaces one specific, actionable suggestion derived from the estimate ("spreading window opens tomorrow 6am-11am on Back Field", "soil test on Home Field is 4 years old — NAP ceiling will downgrade at year 5"). | New: `DOMAIN_CONTRACTS.md`'s "Prompt" contract, consuming Estimate outputs only — never a new calculation. |
| **Decide** | The farmer accepts, edits, or dismisses the prompt (or a documented auto-rule decides, only where the brief already allows planning-advice automation — never a compliance decision). | New: a `Decision` record, farmer-adjusted per the existing provenance model. |
| **Act** | The app creates a real record from the decision — a job, a planned application, a stock movement — the same shape a farmer would have hand-entered in V1. | Existing `src/lib/farm-data/*` mutation functions — reused, not duplicated. |
| **Confirm** | The farmer marks the job done, ideally from GPS job mode while still on the field. | New: job/telemetry layer (`ARCHITECTURE.md`). |
| **Actual** | What really happened is recorded against the same field/record the Estimate was made for — e.g. an actual spread rate, an actual cut date, an actual weight. | Existing `TrackedValue`/provenance model — an "actual" is just a `verified`-status value replacing an `estimated` one, exactly as V1 already models a farmer-entered lab result superseding an estimate. |
| **Learn** | The gap between Estimate and Actual is recorded and used to calibrate *future estimates' confidence* — **never** to alter a scientific/regulatory constant. | New, tightly scoped — see `SCIENTIFIC_RULES.md`'s "Learn boundary". |

This loop is why Next is additive: Estimate, Act's persistence, and
Confirm/Actual's provenance semantics are all V1 machinery. Only Observe's
telemetry ingestion, Prompt, Decide's UI, and Learn's calibration layer are
new.

## Telemetry model

**The phone is the initial and only required telemetry device.** GPS
location, camera, and manual data entry through the phone are sufficient
for every stage of the core loop to function for every farmer on day one.

Hardware/CAN-bus/BLE/LiDAR integrations are **future, optional
extensions**. No stage of the core loop may be designed such that it
*requires* one to function — a feature that only works with external
hardware is a Phase 2+ extension of an already-working phone-only feature,
never the only way to reach a capability.

## Product surface (phone-first)

Full feature set the software-only product must ultimately reach — the
complete approved experience, built incrementally per `BUILD_PLAN.md`:

**Primary mobile IA, locked (product-owner decision, 2026-09-01, see
`UX_DESIGN.md` for the full account and `BLOCKERS.md` for the decision
record):** `Today | Farm | + | Plan | Records`. Five slots; the centre
`+` is the universal Start/Record action, not a conventional destination
— there is no longer a separate "Activity" tab. Final *visual*
implementation of this IA remains pending an approved design reference
(`CLAUDE.md`'s screen workflow) — the IA/naming decision itself does not.

- **Today** — what matters on this farm right now: open Prompts, windows,
  decisions, confirmations and exceptions. Absorbs the Prompt/Decide
  surface a separate "Activity" tab previously described — there is one
  daily-entry-point destination, not two.
- **Farm** — the connected, map-first farm world/state (fields, including
  fragmented land blocks under one holding; livestock; housing; machinery
  profiles; inventory) — V1's Fields/Livestock/Housing/Soil screens,
  reorganised under this IA, not rebuilt.
- **+ (centre)** — Start Job / Record Activity and other high-frequency
  capture actions. Entered from the tab bar directly, or from a Today/
  Farm Prompt or an Act-stage job — not a screen with its own persistent
  content, an action surface.
- **Plan** — nutrient/spreading/silage/feed/finance/input planning,
  modelled as a real stage progression (Suggested → Planned → Window
  Approaching → Ready) — V1's Nutrients/Spreading/Silage/Feed Optimiser/
  Finance/Input Planner screens, reorganised under this IA.
- **Records** — completed jobs, Actuals, evidence and historical records
  — V1's Reports screen extended with the new job/telemetry history.
- **GPS job mode** — a focused, large-touch-target, offline-tolerant
  full-screen mode for executing one job (a spreading run, a field walk) on
  a phone in a farmyard or field, ending in a Confirm. Entered via `+`.
- **Weather windows** — V1's Met Éireann integration surfaced as an
  actionable window ("safe to spread"), not just a conditions readout.
- **Satellite field intelligence** — a Next-only capability, not present
  in V1. Provider decided (product-owner decision, 2026-09-01): the
  official Copernicus Data Space Ecosystem, initial source Sentinel-2
  Level-2A surface-reflectance imagery, behind a provider boundary so the
  source can be replaced/supplemented later without rewriting the domain
  layer — see `BLOCKERS.md`. Initial scope is field/vegetation
  intelligence; NDVI/vegetation indices are never presented as direct
  grass biomass — precision biomass prediction stays out of scope unless
  genuine calibration evidence exists.
- **Notifications** — surfacing Prompt-stage suggestions and Confirm
  reminders. Canonical first channel decided (product-owner decision,
  2026-09-01): in-app, with real lifecycle states (unread/viewed/
  acted-on/dismissed/expired), built independently of any push vendor —
  push delivery is a future adapter over the same canonical model, not a
  blocker for shipping in-app notifications. See `BLOCKERS.md`.
- **Offline operation** — GPS job mode and Today must work with no
  connectivity in the field, syncing when the phone reconnects.
  Architecture decided (product-owner decision, 2026-09-01): IndexedDB is
  the canonical client-side durable outbox — a service worker/background
  sync may attempt automatic flushing where supported, but the system
  must remain correct without it. See `ARCHITECTURE.md`.
- **Estimated → actual learning** — the Learn stage, scoped per
  `SCIENTIFIC_RULES.md`. Sequenced after a genuine numeric Estimate exists
  that can be compared with a genuine Actual — not built merely to
  complete the vertical. See `BLOCKERS.md`.

None of this is new domain science. Every one of these screens is a new
*view and interaction* over calculations `src/domain/` already performs (or
a documented, evidenced extension of one, built the same way V1's were —
see `docs/evidence-register.md`) plus the new orchestration layer.

## Relationship to V1 — what's preserved, what's new

**Preserved and reused, unchanged, as the frozen `v1-baseline-2026-08-29`
baseline:**
- Every `src/domain/*.ts` calculation and its tests (fail-closed nutrients,
  statutory gates, finance, livestock, price resolution, provenance, audit
  trail, weather ingestion).
- Every `src/lib/farm-data/*.ts` persistence/mapper function and the
  Supabase schema/RLS model (including the just-validated cross-farm
  integrity migration).
- The provenance model (`estimated` / `farmer_adjusted` / `verified`,
  source + timestamp + calculation version) — Learn's "Actual" stage is
  this model, not a new one.
- The design system (`src/components/{ui,farm,finance,shell}`) and the
  "one product, two compositions" rule.
- `docs/evidence-register.md`'s evidence discipline for any new production
  number.

**New in Next:**
- The Observe/Prompt/Decide/Act/Confirm orchestration layer
  (`ARCHITECTURE.md`).
- Telemetry ingestion (phone GPS/camera) and offline sync.
- GPS job mode UI.
- The Learn calibration layer (estimate-confidence only).
- Notifications.
- Satellite field intelligence (provider/source decided — Copernicus
  CDSE, Sentinel-2 L2A, see above and `BLOCKERS.md`; the required
  `docs/evidence-register.md` entry and per-algorithm evidence are still
  pending, built alongside Vertical H itself, not before).

## Non-goals for this phase

- Rewriting or "improving" any V1 domain calculation. A defect found in one
  is fixed in place, in `src/domain/`, with the same evidence discipline
  V1 used — not routed around in a new layer.
- Any hardware/CAN/BLE/LiDAR integration.
- Any change to `main` or to the production database.
- A new design language — Next screens extend V1's existing tokens/
  components.

## Open questions

Tracked in `BLOCKERS.md` rather than guessed here. As of 2026-09-01, the
product owner has decided: GPS job-mode offline architecture (IndexedDB
outbox, revision/version conflict detection, no silent last-write-wins),
telemetry retention (30-day raw GPS, permanent durable derived evidence),
the primary mobile IA (`Today | Farm | + | Plan | Records`), the
notification channel (in-app first, push as a future adapter), and the
satellite provider (Copernicus CDSE, Sentinel-2 L2A). Still genuinely
open: the auto-rule boundary for Decide (which suggestion classes, if
any, may act without a farmer confirming), and Vertical E's final visual
implementation (the IA decision is locked; an approved design reference
for it is not).
