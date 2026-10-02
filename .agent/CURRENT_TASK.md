# Task: Fertiliser Vertical Completion — Increment 2b: canonical remaining chemical requirement

Task ID: fertiliser-vertical-completion-increment-2b-canonical-remaining-chemical-require-20261002
Starting HEAD: 172d1542659e83694281e3a7bdd5339e6beb8838
Verify command: `npm run typecheck && npm run build`

## Objective

Fertiliser Vertical Completion — Increment 2b: implement the canonical remaining chemical
requirement exactly as specified in `docs/farm-return-next/FERTILISER_VERTICAL_SLURRY_DESIGN.md`
§2.1 and §3 row 2b: an additive `NutrientPlan.fieldRemainingRequirement`
(`FieldNutrientRemainingRequirement`, `field_nutrient_remaining_v1`) computed once in
`calculateNutrientPlan` from `fieldRequirement` and the per-nutrient slurry credit arms
(`organicApplication.availableNutrientByNutrient`). No existing output changes; no consumer reads it.

## Scope

- `src/domain/types.ts`: `FieldNutrientRemainingArm`, `FieldNutrientRemainingRequirement` and the
  `NutrientPlan.fieldRemainingRequirement` field, per §2.1 (KNOWN with unrounded kgHa, totalKg
  outcome, requirementKgHa, creditKgHa, creditBasis, evidenceState; UNKNOWN with reasonCode,
  missingInputs and cause REQUIREMENT_UNKNOWN | SLURRY_CREDIT_UNKNOWN; NOT_APPLICABLE).
- `src/domain/nutrients.ts`: build it from `fieldRequirement` and the credit arms, applying §2.1's
  rules per nutrient: requirement NOT_APPLICABLE → NOT_APPLICABLE; requirement UNKNOWN → UNKNOWN
  (REQUIREMENT_UNKNOWN, its reason/inputs); credit NOT_APPLICABLE (no slurry planned) → known zero
  credit (NO_SLURRY_PLANNED); credit OK → max(0, requirement − credit), unrounded; any other credit
  outcome → UNKNOWN (SLURRY_CREDIT_UNKNOWN), never 0. totalKg = kgHa × area, MISSING_FIELD_AREA as
  `fieldRequirement` does. evidenceState = weakest of requirement and credit (existing
  `weakestEvidenceState`). Never re-derive table selection, availability factors or gross requirement.
- Additive contract change under the non-breaking carve-out (steps 1–3; `contracts_frozen` stays
  `true`) recorded in `docs/farm-return-next/DOMAIN_CONTRACTS.md`. Engine version stays
  `nutrient_engine_v1.4.0` (Increment 1 precedent, design D8). Hand-built `NutrientPlan` fixtures
  gain the field without changing assertions. Exclude the new field in the existing 192-case digest
  baseline test (as Increment 1 did for `fieldRequirement`); nothing else normalised.
- Update the design's status (2b done), `BUILD_STATE.json` `fertiliser_vertical`, IMPLEMENTATION_LOG.

## Out of scope

- The draft allocation layer (2c), any consumer or UI (2d/2e), the organic-excess figure (the
  allocation layer's job, §2.2), purchasing (D3), statutory/buffer (D4, CC-B5), Phase 5/6, any value,
  rule or table change, migrations, harness, push/deploy.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files).
If a quick check script cannot be run, rely on repository tests.

## Acceptance criteria

- Invariant: where the requirement arm is KNOWN and the per-nutrient net arm is OK,
  `Math.round(kgHa)` equals `netRequirementByNutrient`'s value, for every Index 1–4 / grazing /
  silage / slurry-method case.
- P/K independent; unknown credit (missing own index, LATE_SUMMER, unsupported method, unresolved
  composition, method conflict) → UNKNOWN; no slurry → known zero credit; tillage NOT_APPLICABLE;
  no livestock / no grassland area UNKNOWN; totals and MISSING_FIELD_AREA; never 0 for an unknown.
- Every pre-existing output unchanged (digest baseline and CC-B5 buffer regression cases pass).

## Required tests

The cases listed in the design's §3 row 2b, driven by real `calculateNutrientPlan` output, plus
existing nutrients, reference-case, report and economics tests.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any existing output would change, if the arm cannot be built from
the existing operands without a second derivation, if the change is not additive under the protocol,
or if an engine-version bump would be required.
