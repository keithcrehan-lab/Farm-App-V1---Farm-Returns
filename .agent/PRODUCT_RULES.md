# Product and screen rules

Read for product/UI work. Shared safety, domain provenance and harness rules are
in AGENTS.md. These product principles and screen workflow remain binding.

## Canonical product principles

- **Enter once, use everywhere.** Never ask the farmer to re-enter data Farm
  Return already holds or can derive. Before adding a form field, identify
  where else it might already exist in the central farm model or whether it
  can be derived from data already captured.
- **Automatic first, refinement second.** Use maps, public data and safe
  defaults to create an initial farm model, then let the farmer improve it
  progressively.
- **Provenance is permanent.** Estimated, farmer-adjusted and verified data
  must remain visibly distinct and retain provenance (source, timestamp,
  rule/model version). When a farmer replaces an estimate with an actual
  value, retain the original value/source/timestamp — the working value
  changes, history does not.
- **Science before AI.** Deterministic agronomic/nutritional/financial
  engines produce the numbers. AI may explain, compare and summarise those
  outputs but must never invent them.
- **Financial intelligence is free.** The commercial model is bulk
  purchasing and transaction revenue, not paywalling core farm economics.
- **One product, two compositions.** Mobile and desktop share one domain
  model, one component library and one set of design tokens. Desktop is not
  mobile scaled wider — it adopts the approved multi-column layout.

## Never rules

- Never remove an approved screen element or feature without explicit
  instruction.
- Never alter the Farm Return design system to a stock framework / generic
  shadcn/admin-dashboard look. Reproduce the approved references closely.
- Never create a visually similar duplicate of an existing component —
  reuse what's in `src/components`.
- Never place agronomy, feed, slurry, spreading or financial formulas
  inside React components. All calculations live in versioned, pure
  TypeScript domain modules under `src/domain/` with unit tests.
- Never let a model (AI or otherwise) invent a production scientific,
  regulatory or financial number. Implement only documented rules with
  tests and source/version metadata (see `docs/evidence-register.md`).
- Never ask for data already available elsewhere in the central farm
  model.
- Never present modelled/station weather or soil data as an in-field
  sensor measurement.
- Never encode public scientific/regulatory guidance as a permanent
  constant — rule sets are versioned, sourced and updateable.
- Never skip the mobile + desktop review for a screen — every screen is
  reviewed at both sizes before it's considered done.

## Every material recommendation carries metadata

Value, status (farmer-adjusted / verified / estimated), source, source
date/version, calculation version, confidence (where meaningful), and
regulatory status (planning advice vs. compliance value). See
`docs/evidence-register.md` and spec section 15.

## Screen workflow (per spec section 14; still governs any V1 or Next screen)

1. Build the screen against its approved reference image(s) in
   `design/reference/` with mock data (Next screens without an approved
   reference yet: see `docs/farm-return-next/UX_DESIGN.md`'s note on this).
2. Run the app and capture the screen at the approved mobile and desktop
   viewport sizes.
3. Compare against the matching reference image: layout, spacing,
   typography, colour, radius, card dimensions, map sizing, icon scale,
   hierarchy, responsive behaviour. Do not accept a generic approximation —
   correct discrepancies and re-compare until materially consistent.
4. Only after a screen's mock-data UI is approved does its domain engine
   get implemented, one domain at a time, each with deterministic tests
   and an evidence/version record before real values reach production
   screens — V1's Phase 3+ discipline, unchanged, applied to any new Next
   domain module via `docs/farm-return-next/DOMAIN_CONTRACTS.md`'s "new
   contracts" process.

