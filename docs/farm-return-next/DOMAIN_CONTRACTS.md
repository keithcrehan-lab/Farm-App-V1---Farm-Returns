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

The persistence layer Act writes through: `farms.ts`, `fields.ts`,
`financial-assumptions.ts`, `housing.ts`, `individual-animals.ts`,
`livestock.ts`, `mappers.ts`, `row-types.ts`, `slurry.ts`, `soil.ts`,
`supplier-quotes.ts`.

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
