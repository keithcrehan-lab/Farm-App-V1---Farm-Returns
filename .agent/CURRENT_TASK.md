# Task: Per-nutrient P/K Increment 2 descope — restore Index-1 placeholder (F001)

Task ID: per-nutrient-p-k-increment-2-descope-restore-index-1-placeholder-f001-20261002
Starting HEAD: 647677f0f7a7d517bec92452a1d646f9d85332dc
Verify command: `npm run typecheck && npm run build`

## Objective

Resolve audit finding F001 (HIGH) against per-nutrient P/K Increment 2 (`647677f`;
`.agent/history/audit-20261002T*` primary audit of `bfdad74..647677f`; blocked fix report
`.agent/history/fix-20261002T093957Z-14546.md`) by descoping Increment 2, as the product owner
decided on 2026-10-02: restore the internal Index-1 placeholder (CP3 is withdrawn from
Increment 2) so no existing output changes, keep the per-nutrient slurry-credit view (CP4).

Why: at `bfdad74` the national buffer distance material (chemical 3 m vs organic 5 m) is chosen
by whether a fertiliser blend sized from the placeholder Index 1 is non-empty. Removing the
placeholder therefore changes the statutory `nationalBufferDistanceStatus` (e.g. K missing,
P Index 4, yield 0, 100 m³/ha spring LESS 6% DM, water 4 m: base `LEGAL_PROHIBITION`, HEAD `OK`).
No placeholder-free rule reproduces the base results, and changing a statutory output needs a
Campaign B decision that has not been made.

## Scope

- `src/domain/nutrients.ts`: reinstate the `pIndex ?? 1` / `kIndex ?? 1` placeholder and every
  placeholder-fed internal computation exactly as at `bfdad74`, so every pre-existing
  `NutrientPlan` output (including `nationalBufferDistanceStatus`, purchased products,
  requirement, statutory outputs, retained N `offsetN`) equals the `bfdad74` engine again.
  Remove `purchaseRequirementUnknown` (or any other new path) if it exists only to replace the
  placeholder.
- Keep `organicApplication.availableNutrientByNutrient` and the shared table selection. Its
  arms must stay placeholder-free: the unknown P/K arm is blocked with only its own input; the
  placeholder may feed only the pre-existing paired internals, never an arm.
- Keep the engine version `nutrient_engine_v1.3.0` (the per-nutrient view is still a new
  production figure).
- Regression tests: add the audited buffer case (and its K-known / P-missing mirror) asserting
  the `bfdad74` result. Keep the existing 192-case baseline test (pre-existing fields equal the
  `b4d3c29`/`bfdad74` baseline except `calculationVersion`) passing unchanged.
- Docs: in `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md` correct the claim that
  the placeholder is harmless because every output is gated on the pair (it drives the buffer
  material choice), mark CP3 as blocked on a Campaign B decision, and update §4/§6 so Increment 2
  is "CP4 only" and placeholder removal waits for that decision. Add a new active blocker row to
  `docs/farm-return-next/BLOCKERS.md` (ID `CC-B5`): the Index-1 placeholder decides the national
  buffer material when P or K is missing; pre-existing; statutory; needs Campaign B review of the
  buffer rule for an unknown purchase requirement; no output changed. Update `DOMAIN_CONTRACTS.md`
  only if its Increment 2 entry describes placeholder removal. Minimal IMPLEMENTATION_LOG entry.

## Out of scope

- Any change to the buffer rule, statutory outputs or Campaign B interpretation.
- Consumers, UI, wording, Increments 3–8, decisions D1–D4, migrations, harness, push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository (this session cannot delete
  files). Any one-off script lives in the OS temp directory outside the repo.

## Acceptance criteria

- Every pre-existing output equals the `bfdad74` engine for the 192-case baseline and the new
  buffer regression cases (except `calculationVersion`).
- `availableNutrientByNutrient` arms contain no placeholder-derived number.
- CC-B5 logged; design doc corrected; CC-B2 / CC-B4A tests pass.

## Required tests

- New buffer regression cases (above); existing baseline matrix; `availableNutrientByNutrient`
  matrix; existing nutrients, reference-case, report, evidence-report and economics tests.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if restoring the base outputs would require removing the
per-nutrient view, if any arm would need a placeholder-derived number, or if any change to a
statutory rule would be needed.
