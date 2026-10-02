# Task: Per-nutrient P/K Increment 5b completion — slurry basis for mixed fields (CC-B6)

Task ID: per-nutrient-p-k-increment-5b-completion-slurry-basis-for-mixed-fields-cc-b6-20261002
Starting HEAD: 21ba1837fe255be99178867b509d5e6ec46cbc1a
Verify command: `npm run typecheck && npm run build`

## Objective

Resolve CC-B6 (`docs/farm-return-next/BLOCKERS.md`) and the open Increment 5b audit findings
(final audit `.agent/history/audit-20261002T141848Z-19789.md`, range `552e709..9fe5b09`):
- F001 HIGH: for a mixed P/K field the Evidence Report's per-nutrient slurry credit has no
  provenance (application method/date, timing and whether it was assumed, `ruleId`, rule `source`,
  `scientificBasisNote`), because `NutrientPlan` exposes that basis only on the paired
  `availableNutrientAssessment`, which is blocked (`MISSING_SOIL_FERTILITY_INDEX`) for mixed fields.
- F002 MEDIUM: the Evidence Report page tests for mixed fields use hand-built report objects; there
  is no engine-driven page matrix and no tillage case.

Product owner, 2026-10-02: authorised a small additive engine change to expose that basis.

## Scope

1. Engine (additive, `src/domain/nutrients.ts`, `src/domain/types.ts`): expose the slurry-credit
   basis the resolver's one shared table/method/timing/DM selection (Increment 2) already computes,
   next to the per-nutrient arms — e.g. `organicApplication.availableNutrientBasis:
   EngineOutcome<{ applicationMethod?; assumedDefault; applicationRateM3ha; dmPct; applicationDate?;
   timingCategory; timingAssumed; ruleId; source; scientificBasisNote }>` (same field meanings as
   the paired assessment's value). It is OK whenever the table selection is OK, independent of the
   soil indices, and carries the table-level block otherwise. Derived from the same selection —
   never a second derivation. For a fully indexed field it equals the corresponding fields of the
   paired `availableNutrientAssessment.value`.
   - No value, status, reason code or existing field changes. No engine-version bump (metadata only,
     same precedent as CC-FU-B); if the contract-change protocol requires one, STOP.
   - Record the additive field in `docs/farm-return-next/DOMAIN_CONTRACTS.md` (non-breaking
     carve-out, steps 1–3; `contracts_frozen` stays `true`).
2. Evidence Report: `mixedRequirementReport` (`src/lib/nutrient-card-presentation.ts`) and the
   report orchestration/page carry and show that basis for a mixed field the same way the fully
   indexed section shows it (method, timing/assumed, rule/source, scientific basis), plus the
   evidence states and calculation version already retained. Fully indexed and no-index reports
   unchanged.
3. Tests (F002): an Evidence Report page/orchestration matrix driven by real
   `calculateNutrientPlan` output for P-only, K-only, both, neither and tillage, asserting the
   per-nutrient rows, "—", the D3 line, the slurry basis, and unchanged fully indexed output; engine
   tests for the new basis field (OK independent of indices; equals the paired value fields when
   fully indexed; table-level block carried; the 192-case baseline and CC-B5 cases unchanged).
4. Mark CC-B6 RESOLVED in BLOCKERS.md; update the design's §6 ("Increment 5b done") and
   IMPLEMENTATION_LOG minimally.

## Out of scope

- Any value/formula change, purchasing (D1), statutory/NAP/buffer (D2, CC-B5), placeholder removal,
  CSV changes (already done), the mobile header-badge overflow, migrations, harness, push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository (this session cannot delete
  files). If a quick check script cannot be run, rely on repository tests.

## Acceptance criteria

- Mixed-field Evidence Report shows the per-nutrient credit with its full slurry basis.
- New basis field equals the paired assessment's basis fields for every fully indexed case.
- Every pre-existing `NutrientPlan` output unchanged (baseline matrix passes unchanged).
- F002 coverage in place; CC-B6 resolved.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if the basis cannot be exposed from the existing single selection
without a second derivation, if any existing output or value would change, or if the protocol
requires an engine-version bump or a breaking change.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.
