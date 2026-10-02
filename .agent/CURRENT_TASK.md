# Task: Per-nutrient P/K Increment 4 — remap slurry rate-allocation layer (unknown is never zero)

Task ID: per-nutrient-p-k-increment-4-remap-slurry-rate-allocation-layer-unknown-is-never-20261002
Starting HEAD: 259f30c5faeddfde77b4bb49292badedd8146d73
Verify command: `npm run typecheck && npm run build`

## Objective

Implement Increment 4 of `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md` (§4 row 4):
remap the unwired slurry rate-allocation layer `src/domain/slurry-rate-allocation.ts`
(`buildSlurryRateAllocation`) from the paired `NutrientPlan` fields to the per-nutrient fields
added in Increments 1–3, so a field with a known P (or K) index and the other missing gets known
P (or K) quantities instead of both being unknown.

## Scope

- Input mapping only (the layer consumes, never recomputes):
  - crop requirement ← `requirementByNutrient` (n/p/k arms; a blocked arm → unknown with its reason);
  - available slurry nutrient ← `organicApplication.availableNutrientByNutrient` (keep today's
    "no slurry planned = known zero" rule for `NOT_APPLICABLE` with rate ≤ 0);
  - per-nutrient `soilIndexAdjustmentApplied` ← the matching per-nutrient arm;
  - remaining chemical requirement ← `netRequirementByNutrient`;
  - soil index for the organic-share record ← `fertilityEvidenceByNutrient` (the arm's own index).
  Remove the paired-shape special case for `MISSING_SOIL_FERTILITY_INDEX` once the per-nutrient
  inputs make it redundant. Update `SlurryRateAllocationInput["plan"]`'s `Pick` accordingly.
- Bump `SLURRY_RATE_ALLOCATION_VERSION` `slurry_rate_allocation_v0.1.0-draft` →
  `slurry_rate_allocation_v0.2.0-draft`; update its row in `docs/farm-return-next/DOMAIN_CONTRACTS.md`
  and the design's §6 Status ("Increment 4 done"); minimal IMPLEMENTATION_LOG entry.

## Out of scope

- `nutrients.ts`, `types.ts` and every frozen module; the engine version.
- Wiring the layer into any production path, UI or report; `affectsProductionOutput` stays `false`,
  `finalAllowedRate` stays DEFERRED.
- Any Campaign C rule, share cap, constraint, evidence class, claim ID or threshold (inputs change,
  rules do not). Decisions D1–D4, CC-B5, migrations, harness, push/deploy.

## Working method (mandatory)

- If a quick check script cannot be run (no approval available), rely on repository tests
  only; do not stop for that reason.
- Do NOT create temporary or scratch files inside the repository (this session cannot delete
  files). Any one-off script lives in the OS temp directory outside the repo.

## Decision (product owner, 2026-10-02)

The layer follows "UNKNOWN is never zero": it uses the per-nutrient arms even where the paired
fields differ. Today the paired `netRequirement` treats a table-blocked (unsupported method,
timing or DM%) slurry credit as 0 and stays known (flagged via `requirementProvisional`); the
per-nutrient `netRequirementByNutrient` arm is blocked. After the remap, such a field's
`remainingChemicalRequirement` is unknown in this unwired draft layer. Record this in the design
(§4 row 4 / §6) and IMPLEMENTATION_LOG. No production output changes.

## Acceptance criteria

- Fully indexed fields: every allocation record is identical to today's except (a) the version
  string, (b) `remainingChemicalRequirement` becomes unknown when the slurry credit is
  table-blocked (decision above), and (c) the wording of an "unknown" reason where it now comes
  from a blocked per-nutrient arm. Nothing else may differ.
- Mixed P-known/K-missing and K-known/P-missing fields: the known nutrient's crop requirement,
  available slurry nutrient, share record and remaining chemical requirement are known (from the
  per-nutrient arms); the unknown nutrient's stay unknown with a reason.
- Table-level blocks (unsupported method/timing/DM%, unresolved composition) make the available
  slurry nutrient and the remaining chemical requirement unknown for all three nutrients; the
  crop requirement stays as its own per-nutrient arm says.

## Required tests

- Existing `src/domain/slurry-rate-allocation.test.ts` passes (only version assertions updated).
- New mixed-case tests driven by real `calculateNutrientPlan` output (P-only, K-only, neither,
  both × slurry method/timing × Index 1–4), and the table-level-block cases.
- `src/domain/campaign-c-reference-cases.test.ts` passes.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any Campaign C rule or threshold would need to change, if a
frozen module must change, or if a fully indexed field's records would change beyond (a)–(c).
