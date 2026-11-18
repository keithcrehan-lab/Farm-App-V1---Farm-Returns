# Grass intake research preview — scope and status (2026-11-18)

Branch `integration/grass-intake-live-wiring-20261118`, base `8bf56ee8` (live Topaz). Local only: not committed,
pushed, merged or deployed, and no SQL applied. **This is not a full activation and not a production release.**

## What is connected
- **Engines, copied unchanged from `e4fce8a`** with their tests. Their dependencies are byte-identical to the base.
  `grass-intake-evidence-{ledger,row,resolution,gates}`, `teagasc-{dairy-midseason,suckler-paddock}-intake`,
  `grass-session-segment-demand` (domain), and `grass-intake-evidence` and `grass-field-segment-demand`
  (server-only adapters). The two Teagasc modules are identical at `440edfa`. These are not copied: the mass-balance
  adapter `grass-segment-demand-windows`, the readiness modules, and the draft migration `20261117150000_grass_intake_evidence.sql`.
- **Gate** `src/lib/farm-data/grass-intake-preview.ts`. It runs these checks in order:
  1. Private env `GRASS_INTAKE_RESEARCH_PREVIEW` must be exactly `on`. When it isn't, nothing is queried.
  2. The field id must be a UUID.
  3. The existing app-admin check must pass: a confirmed owner email **and** an `app_admins` row.
  4. The existing adapter is called. It binds the farm with `getFarmForCurrentUser`.

  The window is fixed on the server: the 7 days to the request, rounded down to the minute. The browser can't
  pass a farm or dates. The result is reduced to these statuses: READY, HELD, NO_RECORDED_GRAZING, UNAVAILABLE or
  DISABLED. It carries only versions, bounded reason families and own-farm provenance ids (capped). Raw reasons,
  which contain ids and timestamps, never leave the server. A missing table (`42P01`/`PGRST205`) returns
  `EVIDENCE_SCHEMA_UNAVAILABLE`, and any other error returns `READ_FAILED`.
- **UI** `GrassIntakePreview`. It's a collapsed "Grass intake — research preview" section at the foot of the Grass
  screen. It renders only when `page.tsx` reports flag on + admin. It checks the field selected on the map, once per
  click, with no polling. It's labelled "Research preview — planning allocation, not measured grass eaten". HELD and
  UNAVAILABLE show plain reasons with no figure. Partial windows say the unrecorded time is unknown, not zero. It
  claims no agronomist sign-off.
- **Unchanged:** the live cover, wedge, forecasts, demand, fertiliser, Cattle, Today and Plan. No existing data is
  written, and there's no mass-balance deduction.

## Still blocked (BLOCKERS `GRASS-INTAKE-PREVIEW-1`)
1. Schema: owner approval and a staging rehearsal of the draft evidence migration.
2. A farm input persistence (evidence write) interface, which must come with the approved schema.
3. A scientist decision on planning allocation vs measured disappearance.
4. Carried over from the source branch: GRASS-S3-ROWCAP, GRASS-S4-FEED, GRASS-S5-CHAIN.

## Verification
The new and updated tests are `grass-intake-preview.test.ts` (flag-off zero SQL, authorisation, scope, READY/HELD,
missing schema) and `GrassPageClient.test.tsx` (absent by default, live cover untouched). **Not yet run:** this
session couldn't get approval to run vitest, `tsc` or ESLint. They are owed before any commit. The source branch's
own results for the copied engines (199 integration / 373 pure tests, green) are reused, not re-run.
