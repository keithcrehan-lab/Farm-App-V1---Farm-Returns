# Task: Per-nutrient P/K Increment 3 — per-nutrient gross and net requirement

Task ID: per-nutrient-p-k-increment-3-per-nutrient-gross-and-net-requirement-20261002
Starting HEAD: 418a440f2c970b7ad8ad4e2591a87b6d31f2a20d
Verify command: `npm run typecheck && npm run build`

## Objective

Implement Increment 3 of `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md` (§4 row 3;
CP2 Target A): additive per-nutrient gross and net requirement fields. Every existing output
except `calculationVersion` stays identical.

## Authority

Product owner, 2026-10-02: authorised releasing these figures beside the retained internal
Index-1 placeholder (CP3 stays blocked on CC-B5), on condition of the safeguards below. Record
this decision in the design (§4 "must be re-decided" note) and IMPLEMENTATION_LOG.

## Scope

- `src/domain/types.ts`: add to `NutrientPlan`
  `requirementByNutrient: { n: EngineOutcome<number>; p: EngineOutcome<number>; k: EngineOutcome<number> }`
  and `netRequirementByNutrient` with the same shape (CP2 Target A). An unknown arm carries no
  number (structurally unrepresentable).
- `src/domain/nutrients.ts` (`calculateNutrientPlan`):
  - Gross arms: each known arm is `Math.round` of the same `grossX` local the paired
    `requirement` uses (same source, version, rounding; never a second derivation), computed
    only from that nutrient's own real index. N keeps today's rule (kept unless silage
    evidence is missing). The unknown P or K arm is `BLOCKED_INSUFFICIENT_EVIDENCE` /
    `MISSING_SOIL_FERTILITY_INDEX` with only its own input; silage-evidence gaps block arms
    exactly as they block the paired requirement today.
  - Net arms: one shared per-nutrient remaining calculation, computed once:
    `max(0, grossX − credit)` where the credit is CP4's `availableNutrientByNutrient` arm
    (`NOT_APPLICABLE` / no slurry allocated = a known zero credit, as the paired offset treats
    it today). Each net arm is `Math.round` of that, and is blocked if its gross arm is blocked,
    its credit arm is blocked/unknown, or the composition is unresolved (as `netEvidenceOk`
    blocks the paired net today). Never reuse the paired `remainingP` / `remainingK` / `offset`.
  - The legacy `requirement`, `netRequirement`, `offset`, `remainingX`, `offsetP` / `offsetK`,
    `allocatePurchasedProducts`, statutory and buffer computations stay exactly as they are.
- Engine version `nutrient_engine_v1.3.0` → `nutrient_engine_v1.4.0` (design: new production
  figures for mixed fields). Stored records not rewritten. Follow the existing version-bump
  convention (tests asserting the version, IMPLEMENTATION_LOG).
- Record the additive contract change under the non-breaking carve-out in
  `docs/farm-return-next/DOMAIN_CONTRACTS.md` (steps 1–3; `contracts_frozen` stays `true`).
  Update the design's §6 Status ("Increment 3 done").

## Safeguards (mandatory, from the authorisation)

- No arm may contain a number derived from the Index-1 placeholder.
- Add a test proving it: the known nutrient's gross and net arms are invariant to the
  presence/absence and value (1–4) of the other nutrient's index, and the unknown arm is
  blocked with no value.
- No consumer reads the new fields in this task.

## Out of scope

- Consumers, UI, wording, reports, allocation layer, economics, purchasing (D1), statutory (D2),
  CP3 / CC-B5, the paired `missingInputs` correction, Campaign B/C rules, migrations, harness,
  push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository (this session cannot delete
  files). Any one-off script lives in the OS temp directory outside the repo.
- Keep using the existing baseline `src/domain/nutrients.fertility-evidence-baseline.json`;
  extend its normalisation so `calculationVersion` v1.4.0 maps back to v1.2.0 and the new
  fields are excluded. Nothing else may be normalised.

## Acceptance criteria

- All 192 baseline cases and the CC-B5 buffer regression cases: every pre-existing field equals
  the baseline except `calculationVersion`.
- Fully indexed fields: gross arms equal the paired `requirement` value; net arms equal the
  paired `netRequirement` value.
- Mixed case with a positive known credit: known net arm = `round(max(0, gross − credit))` < gross.
- Retained-N invariant holds; CC-B2 / CC-B4A regression tests unchanged and passing.

## Required tests

- Gross/net arm matrix over P/K presence × Index 1–4 × slurry method/timing (incl. no slurry,
  blocked table, unresolved composition, missing silage evidence), with the invariance and
  no-placeholder safeguards above; extended baseline; existing nutrients, reference-case,
  report and economics tests.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any existing output other than `calculationVersion` would
change, if a known arm cannot be computed without the placeholder or depends on the other
nutrient's index, if a consumer must change beyond fixtures gaining the new fields, or if the
change cannot be additive under the protocol.
