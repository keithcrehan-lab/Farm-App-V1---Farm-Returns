# Cattle C10 — pre-build review (read-only, 2026-10-20)

Scope authorised by the human C10 overnight authorisation (2026-10-20). This review was made before any C10 code was written. HEAD `6e81831`; C0–C9 frozen (receipts validate; `agent-campaign-run --dry-run`: C10 `PHASE_NOT_READY` only because of the local PLACEHOLDER hold).

## 1. Frontend architecture found

- Next.js 16.3 App Router; signed-in routes live under `src/app/(app)/` with `AppShell` (`src/components/shell`). Navigation: `src/components/shell/nav-items.ts` (primary: Farm · What Matters · Plan · Market · Finance; everything else under More, incl. `/livestock`).
- Tailwind v4 with tokens in `src/app/globals.css`. The Farm Spatial V2 token namespace (`--fr-v2-*`: forest `#173f2d`, graphite, paper, stone, rule, plum = livestock, motion 140–240ms, flat planes, no shadows inside data screens) and `design/farm-spatial-v2/DESIGN_CONTRACT.md` ("a container must earn its border", "canvas, not card grid", typography-led hierarchy) already match the requested design direction. C10 uses those tokens; it adds no design system, no dependency and no chart library (charts are hand-built SVG).
- Data honesty: `isSupabaseConfigured()` (`src/lib/supabase/env.ts`). `.env.local` **is configured**, so `npm run dev` is real-account mode by default; Next's `@next/env` never overrides a variable already present in the process environment, so `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev` runs local demonstration mode.
- Legacy V1 livestock (`/livestock`, `livestock_individuals`, `livestock_weight_observations`) is a separate model without knowledge-time provenance; C10 does not adapt it and does not change it.

## 2. Frozen outputs C10 consumes (public exports only)

| Need | Frozen owner / export |
| --- | --- |
| Identity (tag, breed, sex, DOB, group, location, lifecycle) | C1 `createAnimalLedger`, `projectAnimalSnapshot` (`AnimalResolution` states KNOWN / UNKNOWN / CONFLICTING_EVIDENCE / INVALID_EVIDENCE) |
| Group membership incl. unresolved members | C4 `resolveGroupScope` / `buildWeightReadContract` (`scope.unknown/conflict/invalid`) |
| Weights (series, latest, method/basis, conflicts) | C4 `buildWeightReadContract` |
| Performance (points, period gain/ADG, target comparison, trend, coverage) | C5 `evaluatePerformance` |
| Weight projection (straight line, labelled PREDICTION) | C5 `evaluatePerformance` with `query.projectionAt` (`LINEAR_EXTRAPOLATION_OF_PERIOD_ADG`) — the only authorised projection |
| Goal (type, target weight, target date, history, conflicts) | C6 `projectProductionGoals` |
| Health timeline, medicine ledger, withdrawal gate | C3 `projectAnimalHealth` |
| Recommendation record, explanation, evidence labels, sealed context states (obligations, programmes, withdrawal, weights, goals) | C8 `recommendCattle` |
| Plan work (work items, proposals, blockers, timing, hard deadline only when sourced, completion contracts, evidence) | C9 `planCattleWork` |
| Job lifecycle, completion by canonical evidence, readiness, priority order | Plan kernel `createPlanJob`, `reevaluatePlanJob`, `compareSystemPriority` |

Every engine takes a caller-supplied synchronous SHA-256 (`CattleHash`). The browser has no synchronous SHA-256, so the frozen engines run **server-side** (Node `crypto`) and the client receives detached view-models only.

## 3. Persistence / API patterns

There is no canonical cattle persistence (no table, adapter, server action or route). No migration is authorised. Therefore:

- Real-account mode (Supabase configured): honest "no canonical cattle records connected" state; no synthetic or fixture value is rendered.
- Demonstration mode (Supabase not configured): a `SYNTH-*` demonstration herd is built server-side and run through the real frozen engines. Farmer actions (record weight, save plan) are appended to an in-browser **demo session** (never persisted); each server call replays fixtures + session through the engines statelessly. The server action refuses in real-account mode and treats the session as untrusted input (validated at the C10 boundary, then again by every frozen engine's canonical boundary).

## 4. Isolation of the five new capabilities

| Capability | Owner / location | Status tonight |
| --- | --- | --- |
| Animal forward plan (sale date, target, feed, housing) | sale date + target weight = a new C6 goal version (canonical C6 input, demo session); feed / housing assumptions = C10 plan draft (`src/domain/animal-plan/`) | demo session only |
| Projected direct return | `src/domain/animal-plan/plan-economics.ts` — pure, exact decimal (`decimal.js`), formulas from the authorisation §12–13 | pure domain, tested |
| Direct-cost ledger | `src/domain/animal-plan/cost-ledger.ts` (entry contract incl. DIRECT vs ALLOCATED, source, currency, effective date); demo entries are fixtures | contract + fixtures; persistence awaits an architecture decision |
| Mart valuation | `src/domain/animal-plan/mart-valuation.ts` (provider interface + result contract + freshness); `src/server/cattle-demo/` fixture provider, labelled FIXTURE / not live | interface + fixture; no live source exists in the repo |
| Photos | `src/components/cattle/photos/` (client-only session store behind an `AnimalPhotoStore` interface; object URLs; never uploaded) | UI-only session; persistence awaits a storage decision |

None of these touches C0–C9 semantics, C8's economic model (mart fixtures and the cost ledger are never C8 observations), Plan semantics, `src/lib/farm-data/`, `supabase/` or any migration.

## 5. Decisions fixed by this review

- Primary work item = the animal's open Plan jobs ordered by the Plan kernel (`compareSystemPriority`), never a C10 ranking.
- Record Weight completion uses C9's frozen contract: a weight observed at or after the viewpoint the gap was raised at completes the job through `reevaluatePlanJob`; a back-dated weight does not, and the UI says so.
- The demonstration registry adds one synthetic, labelled staleness setting to `RECORD_WEIGHT` (the default registry has none, so an animal with any weight never raises the job). It is demo data, not a production policy.
- Feed and housing assumptions change forecast cost only, never projected weight (no response model exists); the UI states this.
- "Projected direct profit" is used everywhere; never "profit".
- Times: the demonstration viewpoint is fixture-supplied (`2026-10-16T09:00:00Z`) and advances only by recorded session actions; no clock is read in a domain or view-model path.
