# Task: Per-nutrient P/K Increment 1 — per-nutrient fertility evidence

Task ID: per-nutrient-p-k-increment-1-per-nutrient-fertility-evidence-20261002
Starting HEAD: b4d3c29dc6f42f462f4f27bb6c508145135a6533
Verify command: `npm run typecheck && npm run build`

## Objective

Implement Increment 1 of `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md` (§4,
row 1; CP1 Target A): add an additive `NutrientPlan.fertilityEvidenceByNutrient` field that
reports soil-fertility evidence for P and K independently. No existing output changes.

## Scope

- `src/domain/types.ts`: add
  `fertilityEvidenceByNutrient: { p: EngineOutcome<{ index: SoilIndex }>; k: EngineOutcome<{ index: SoilIndex }> }`
  to `NutrientPlan`, documented as the per-nutrient view whose conjunction is the existing
  paired `fertilityEvidence`.
- `src/domain/nutrients.ts` (`calculateNutrientPlan`): compute each arm from the same
  tracked indices the paired `fertilityEvidence` uses, applying the existing rule per
  nutrient: OK when that nutrient's index exists, `MEASURED` only if that index is
  `verified`, otherwise `IRISH_DEFAULT`; when absent, `BLOCKED_INSUFFICIENT_EVIDENCE` /
  `MISSING_SOIL_FERTILITY_INDEX` listing only that nutrient's input
  (`fertility.pIndex` or `fertility.kIndex`). Derive or cross-check so the paired outcome is
  provably the conjunction of the arms; do not duplicate the index resolution.
- Additive contract change under the non-breaking carve-out of the contract-change protocol
  in `docs/farm-return-next/DOMAIN_CONTRACTS.md` (steps 1–3; `contracts_frozen` stays `true`):
  record the new field in `DOMAIN_CONTRACTS.md`.
- Hand-built `NutrientPlan` fixtures in tests that must type-check may need the new field;
  add it there without changing what they assert.
- Minimal `IMPLEMENTATION_LOG.md` entry; note "Increment 1 done" in the design's §6 Status.

## Out of scope

- The Index-1 placeholder (CP3) — it stays exactly as today (it waits for CP4, Increment 2).
- The optional correction of the paired `missingInputs` (design §1): NOT authorised.
- Any consumer change (real-alerts, reports, fertiliser-recommendation, UI, allocation layer).
- Any existing value, status, reason code, `missingInputs`, evidence state or fail-closed path;
  the engine version (`nutrient_engine_v1.2.0`) stays unchanged.
- Increments 2–8, decisions D1–D4, Campaign B/C rules, migrations, harness, push/deploy.

## Acceptance criteria

- `fertilityEvidenceByNutrient` is present on every plan; each arm follows the rule above.
- For every case, every pre-existing `NutrientPlan` field is identical to the pre-change engine.
- Retained-N invariant: for every missing-index case, `organicApplication.offsetN` and every
  existing output equal today's engine.
- `DOMAIN_CONTRACTS.md` records the additive field; `contracts_frozen` remains `true`.

## Required tests

- Four-case fertility matrix (both present, P only, K only, neither) × each slurry method
  (splashplate, spring LESS, summer LESS, assumed default) × Index 1–4, asserting each arm's
  status, `evidenceState`, `missingInputs`, and that every existing field equals the
  pre-change output (snapshot/equality against the paired fields and offsets).
- Status precedence: verified vs farmer_adjusted vs estimated index per arm.
- Existing nutrients, reference-case, report and economics tests still pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any existing output would change, if a consumer must change
to compile beyond adding the field to fixtures, if the change is not additive under the
protocol, or if an engine-version bump would be required.
