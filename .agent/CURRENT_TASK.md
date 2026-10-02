# Task: Per-nutrient P/K Increment 2 — per-nutrient slurry credit and placeholder removal

Task ID: per-nutrient-p-k-increment-2-per-nutrient-slurry-credit-and-placeholder-removal-20261002
Starting HEAD: bfdad749abf831934052aadf9f34e17df15dfe5c
Verify command: `npm run typecheck && npm run build`

## Objective

Implement Increment 2 of `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md` (§4 row 2;
CP4 Target A then CP3 Target A): a per-nutrient slurry-credit view, built from one shared
table/method/timing selection inside the resolver, then removal of the internal Index-1
placeholder, with the retained slurry N taken from the per-nutrient path. Every existing
output except `calculationVersion` stays identical.

Scientific basis is settled (GAP-04 RESOLVED: the P Index governs P, the K Index governs K).
The per-nutrient Index 1/2 factor is the existing `applyLowSoilIndexAvailability` logic split
per argument — not a new rule. No new coefficient, table or timing rule.

## Scope

1. CP4 Target A (additive): refactor `resolveAvailableSlurryNutrients` (`src/domain/nutrients.ts`)
   so the table/method/timing/DM selection runs once and both the existing paired outcome and a
   new per-nutrient result are derived from it, never duplicated. Its export signature is
   unchanged. Add `organicApplication.availableNutrientByNutrient: { n; p; k }` per the design
   (`EngineOutcome<{ kgHa; soilIndexAdjustmentApplied?: boolean }>` arms; types in
   `src/domain/types.ts`). N needs no index. The known P or K arm applies only its own index's
   factor. The unknown arm is `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX`.
   Any table-level block (method, timing, DM%, unresolved composition, conflicting methods)
   blocks every arm, exactly as the paired outcome is blocked today. Evidence state per arm
   follows the existing rules (including CC-FU-B's DM% provenance).
2. CP3 Target A: remove the internal `pIndex ?? 1` / `kIndex ?? 1` placeholder from
   `calculateNutrientPlan`. Every index-dependent call runs only when its index exists. The
   retained slurry N (`organicApplication.offsetN`, CC-B2 F003) comes from the per-nutrient N
   arm. Every existing blocked output (requirement, netRequirement, napCompliance,
   statutoryManureValue, purchasedProducts, etc.) keeps exactly today's status, value, reason
   code and `missingInputs`.
3. Engine version bump `nutrient_engine_v1.2.0` → `nutrient_engine_v1.3.0` (design: the new
   view emits a new production figure for mixed fields; lineage must distinguish it). Stored
   records are not rewritten. Record the reason wherever the existing version-change
   convention requires (tests asserting the version, IMPLEMENTATION_LOG, evidence register
   if that is the convention for engine bumps).
4. Record the additive contract change under the non-breaking carve-out in
   `docs/farm-return-next/DOMAIN_CONTRACTS.md` (steps 1–3; `contracts_frozen` stays `true`).
   Update the design's §6 Status ("Increment 2 done"); minimal IMPLEMENTATION_LOG entry.

## Out of scope

- Any consumer change: allocation layer, economics, What Matters, reports, UI, prompts and
  `requirementProvisional` wording all stay as they are and keep reading the paired fields.
- Per-nutrient requirement/net (Increment 3), purchasing, statutory outputs, decisions D1–D4,
  the paired `missingInputs` correction (not authorised), Campaign B/C rules, migrations,
  harness, push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository (this session cannot
  delete files). Any one-off script must live in the OS temp directory outside the repo.
- Reuse the existing pre-change baseline `src/domain/nutrients.fertility-evidence-baseline.json`
  (digests of every pre-existing plan field at `b4d3c29`; Increment 1 changed no output). Extend
  its test so the comparison excludes only the new field(s) and normalises `calculationVersion`
  values from v1.3.0 back to v1.2.0 before hashing; nothing else may be normalised.

## Acceptance criteria

- Every pre-existing `NutrientPlan` field equals the baseline for all 192 matrix cases, except
  `calculationVersion` (now `nutrient_engine_v1.3.0`).
- Retained-N invariant holds for every missing-index case.
- No placeholder-derived number appears in any output.
- Per-nutrient arms: factor applied only from the arm's own index; table-level blocks block all
  arms; unknown arm blocked with only its own input.
- CC-B2 / CC-B4A regression tests unchanged and passing.

## Required tests

- The extended baseline matrix (above).
- `availableNutrientByNutrient` matrix: method × timing × DM% × P/K presence × Index 1–4,
  asserting each arm's status, value, `soilIndexAdjustmentApplied`, evidence state; fully
  indexed arms equal the paired assessment's n/p/k.
- Existing nutrients, reference-case, report and economics tests pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any existing output other than `calculationVersion` would
change, if a consumer must change beyond test fixtures gaining the new field, if the per-nutrient
factor needs a rule beyond splitting `applyLowSoilIndexAvailability`, if removing the
placeholder changes any blocked output, or if the change cannot be additive under the protocol.
