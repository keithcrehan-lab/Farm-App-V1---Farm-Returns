# Farm Return — build rules for Claude Code

Farm Return is a free, premium-quality Irish farm management and financial
intelligence platform. The full product definition lives in `/docs` and the
approved visual references live in `/design/reference`. Read
`docs/product-requirements.md` before making product decisions; it is the
source-of-truth hierarchy's top level (see `design/reference/README.md`).

**Farm Return V1 is frozen** at tag `v1-baseline-2026-08-29`
(`9c8a952b77227ddfbd44c7efabf8e5bdd06c77f4`) — validated, live-verified
against `Farm Return V1 Dev`. Active development happens on
`farm-return-next` and its descendants, building the **Farm Return Next**
orchestration/operating-system layer described in
`docs/farm-return-next/MASTER_SPEC.md` — the source-of-truth top level for
that programme, on top of (not instead of) this file and
`docs/product-requirements.md`, which still describe the preserved V1
entities, calculations and provenance model. See also `AGENTS.md` (the
same rules, tool-agnostic, for Codex and any other agent working this
repo) and `docs/farm-return-next/BUILD_PLAN.md` (the live build plan and
autonomy/gating rules).

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

### Farm Return Next-specific never rules

- Never commit to, or open a PR targeting, `main` from this programme's
  work — `farm-return-next` and its descendants only.
- Never deploy to production or run a migration against a production
  database — `.env.local` targets `Farm Return V1 Dev` only, same as V1.
- Never force-push or rewrite published history on any shared branch.
- Never make a destructive database change — every migration stays
  forward-only, the convention every V1 migration already followed.
- Never duplicate a `src/domain/`/`src/lib/farm-data/` calculation or
  query inside the new orchestration layer — call the existing export
  (`docs/farm-return-next/DOMAIN_CONTRACTS.md`).
- Never progress a `docs/farm-return-next/BUILD_PLAN.md` checkpoint past
  an unresolved Critical or High Codex-audit finding.
- Never skip a checkpoint's Codex audit because Codex is temporarily
  unavailable — retry (`scripts/codex-audit.sh`), don't proceed unaudited.

## Every material recommendation carries metadata

Value, status (farmer-adjusted / verified / estimated), source, source
date/version, calculation version, confidence (where meaningful), and
regulatory status (planning advice vs. compliance value). See
`docs/evidence-register.md` and spec section 15.

## Build order

V1's UI-first, Phase 0-8 build order (`docs/product-requirements.md` §
Delivery phases) is **complete** — that history is preserved at
`v1-baseline-2026-08-29` and this section no longer governs active work.
Farm Return Next's live build order is
`docs/farm-return-next/BUILD_PLAN.md`: Checkpoint 0 (this framework),
Checkpoint 1 (orchestration contracts, sequential), Checkpoint 2+
(parallelisable verticals once contracts are frozen). Its own gating
rules — full quality gate and independent Codex audit at every checkpoint
boundary, all Critical/High findings resolved before progressing — apply
in place of this section.

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

## Repository shape

See `docs/product-requirements.md` § Technical architecture for V1's
repository layout, stack and reusable component inventory (unchanged) and
`docs/farm-return-next/ARCHITECTURE.md` for Next's orchestration layer
added on top of it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
