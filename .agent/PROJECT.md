# Farm Return — agent project context

Durable context for every agent session. Read it once per session. Where
code, tests or the docs listed below disagree with this file, **the code
and those docs win**. Check them before you rely on anything here.

## Purpose

Farm Return is a free Irish farm management and financial intelligence
platform. The numbers come from deterministic agronomic, nutritional and
financial engines. AI may explain those numbers but never invents them.
Financial intelligence is free; there is no paywall on core farm economics.

## Authoritative sources (read only the ones your task touches)

- `CLAUDE.md` / `AGENTS.md`: build rules and never-rules (binding)
- `docs/product-requirements.md`: V1 entities, calculations, provenance
- `docs/farm-return-next/MASTER_SPEC.md`: Next programme top level
- `docs/farm-return-next/BUILD_PLAN.md`: checkpoints, severity taxonomy
- `docs/farm-return-next/DOMAIN_CONTRACTS.md`: frozen contracts
- `docs/farm-return-next/SCIENTIFIC_RULES.md`, `docs/evidence-register.md`
- `docs/farm-return-next/MANAGED_QUOTE_PILOT_ARCHITECTURE.md`: quote pilot

## Architecture

- Next.js 16 (App Router, breaking changes vs. older Next: read
  `node_modules/next/dist/docs/` before writing Next code), React 19,
  TypeScript, Supabase (Postgres + RLS), Vitest, Playwright.
- `src/domain/`: pure, versioned, unit-tested calculation modules. **All**
  agronomy/feed/slurry/spreading/financial formulas live here.
- `src/lib/farm-data/`: data queries. `src/orchestration/`: the Next
  layer, which calls domain/farm-data exports and never duplicates them.
- `src/app/`: routes and server actions. `src/components/`: reusable UI
  (reuse it, don't make near-duplicates). `supabase/`: forward-only migrations.
- Mobile and desktop share one domain model, one component library and one
  set of design tokens.

## Frozen milestones

- V1 is frozen at tag `v1-baseline-2026-08-29` (`9c8a952b`).
- Jev shadow router Phase 1A is audited and closed at `89eb12cb`. It is
  optional tooling (`scripts/jev-router/`) and **not** a dependency of the
  `.agent` workflow. It may later become an optional provider or router.

## Fail-closed domain rules

- Never invent a scientific, regulatory or financial number. When the
  evidence is insufficient, return `BLOCKED_INSUFFICIENT_EVIDENCE` (the
  existing convention). Never substitute a plausible guess or a default.
- **UNKNOWN is never zero.** A missing, unknown or unavailable input stays
  unknown or blocked all the way to the UI. Never coerce it to `0`, `''`,
  `false` or an empty list that renders as a real value.
- Real signed-in accounts never see mock or fabricated figures. Show an
  honest empty or unavailable state instead.
- Rule sets are versioned, sourced and updateable, never permanent
  constants. Modelled or station data is never presented as a sensor
  measurement.

## Provenance and audit

- Every material value carries: value, status (estimated /
  farmer-adjusted / verified), source, source date/version, calculation
  version, confidence where meaningful, and regulatory status.
- Replacing an estimate keeps the original value, source and timestamp.
  The working value changes; history does not.
- Records are farm-scoped. Identity and farm binding are checked
  server-side, and no cross-farm read or write is allowed.

## Hard safety rules

Never push, merge to `main`, force-push, rewrite history, `reset --hard`,
deploy, or run migrations against production. Never make destructive DB
changes (migrations are forward-only). Never edit secrets or `.env*`, and
never commit credentials or tokens.

## Commands

- `npm test` (Vitest run) · `npx vitest run <path>` (targeted)
- `npm run typecheck` · `npm run lint` · `npm run build`
- `scripts/quality-gate.sh`: all four, fail-fast (checkpoint boundaries)

## Working economically

Search for and read only the files the task touches. Don't re-read files
you've already read. Don't narrate progress. Keep final reports short and
factual, and state only checks you actually ran.
