# Task: Fertiliser Vertical Completion — Increment 2c: slurry rate-allocation layer on canonical requirement

Task ID: fertiliser-vertical-completion-increment-2c-slurry-rate-allocation-layer-on-cano-20261002
Starting HEAD: 6e270cb5912ff98993aeeb0b3ad0ce021905736b
Verify command: `npm run typecheck && npm run build`

## Objective

Fertiliser Vertical Completion — Increment 2c: evolve the unwired draft slurry rate-allocation layer
(`src/domain/slurry-rate-allocation.ts`, `buildSlurryRateAllocation`) exactly as specified in
`docs/farm-return-next/FERTILISER_VERTICAL_SLURRY_DESIGN.md` §2.2 and §3 row 2c, so it reads the
canonical `NutrientPlan.fieldRequirement` and `fieldRemainingRequirement` (Increments 1 and 2b) and
reports the organic excess over requirement. Version `slurry_rate_allocation_v0.2.0-draft` →
`v0.3.0-draft`. The layer stays unwired; no production output changes.

## Scope

- Inputs per §2.2: requirement ← `fieldRequirement` arms, unmodified; planned application
  (NONE_PLANNED | PLANNED with rate, total and the `availableNutrientBasis` outcome); available
  slurry nutrient ← `availableNutrientByNutrient`, unrounded; remaining chemical requirement ←
  `fieldRemainingRequirement` arms, unmodified; organic excess over requirement per nutrient from the
  P/K requirement-limit records (N recorded, not a rule). Keep `buildSlurryRateAllocation` as the
  single home — no new parallel module.
- With unrounded inputs the requirement-limit comparison is exact; remove the ±0.5 kg/ha rounding
  interval only where the layer no longer reads rounded arms.
- Tillage → every requirement constraint NOT_EVALUATED with the requirement's reason; grazing with no
  livestock or no grassland area → UNDETERMINED, never a limit of 0. Mixed P/K: the known nutrient's
  limit, excess and remaining are evaluated; the other stays unknown with its own reason; no min(P, K).
- Share caps, 90 kg K, external constraints, the recommended-rate DEFERRED record and
  `affectsProductionOutput: false` keep today's records and deferrals unchanged.
- Update the layer's rows in `docs/farm-return-next/DOMAIN_CONTRACTS.md` and
  `docs/farm-return-next/campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` (also fix the §2 source
  discrepancy the design §7 noted), the design's status (2c done), `BUILD_STATE.json`
  `fertiliser_vertical`, IMPLEMENTATION_LOG.

## Out of scope

- `nutrients.ts`, `types.ts` and every frozen module; the engine version; wiring the layer into any
  production path, UI or report (2d, gated on D1); recommended rate (D2); purchasing (D3);
  statutory/buffer (D4, CC-B5); Phase 5/6; any Campaign C rule, cap, threshold or evidence class;
  migrations; harness; push/deploy.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files).
If a quick check script cannot be run, rely on repository tests.

## Acceptance criteria

- Fully indexed fields: the layer's records equal today's except the version, exact (unrounded)
  comparisons where the rounding interval previously applied, the new fields (planned application,
  organic excess, requirement/remaining from the canonical arms), and reason wording where it now comes
  from a canonical arm. Each such difference is listed in IMPLEMENTATION_LOG.
- Tillage, no-livestock/no-area grazing and mixed P/K behave as §2.2 states; no unknown is 0.
- `affectsProductionOutput: false` on every record and result; recommended rate stays DEFERRED.

## Required tests

Existing `src/domain/slurry-rate-allocation.test.ts` remapped; new cases driven by real
`calculateNutrientPlan` output for tillage, no-livestock, no-grassland-area, mixed P/K (P-only, K-only)
× slurry method/timing × Index 1–4, organic excess (positive and zero), exact comparisons without the
rounding interval, table-level blocks, and the no-selector regression; `campaign-c-reference-cases`
passes.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any Campaign C rule or threshold would change, if a frozen module
must change, if the layer would need a production caller, or if a difference beyond those listed in
the acceptance criteria appears for fully indexed fields.
