# Farm Return Next — current implementation log

Historical record through frozen Campaign B: [unchanged archive](history/IMPLEMENTATION_LOG-through-b24c266.md).
Read historical sections only for a specific investigation. Rotate completed campaigns into
`history/` with their boundary SHA, retain a link here, and append one concise entry per task.
The archive and Git retain full provenance; no historical entry is deleted.

## Fertiliser Vertical Completion — Session 2b: canonical product recommendation — starting 2a24b10 (2026-10-03)

Breaking frozen-contract change (full protocol; `contracts_frozen` false for this audit cycle, restored by the close-out commit after a clean audit). Engine `nutrient_engine_v1.4.0` → `nutrient_engine_v1.5.0`; stored records are not rewritten. `calculateNutrientPlan` now sizes `purchasedProducts` / `deliveredKgHa` / `estimatedFieldCostEur` in `buildFieldPurchase` from `fieldRemainingRequirement` (or, when slurry is planned but its credit cannot be assessed, the full `fieldRequirement` — the same no-credit figure the paired path produced) and returns the new `NutrientPlan.purchaseStatus` (`FieldPurchaseStatus`, `types.ts`): `RECOMMENDED`, `RECOMMENDED_CREDIT_NOT_COUNTED` (provisional), `NONE_NEEDED` (`REMAINING_ZERO` / `BELOW_PRODUCT_THRESHOLD`), `PROHIBITED` (commonage whatever the requirement; water buffer for a sized blend), `WITHHELD_MIXED_EVIDENCE` (D3 a), `UNKNOWN` (reason + inputs), `NOT_APPLICABLE` (tillage). `allocatePurchasedProducts`, the catalogue, prices, credit and requirement are unchanged. The paired blend stays internal as a LEGACY_COMPATIBILITY_PATH for the CC-B5 national buffer material and the NAP delivered-supply total only, so every statutory / NAP / buffer output is unchanged (D4, CC-B5).

Changed production outputs (before → after):
- Engine, tillage fields: products / delivered / cost from grassland tables → `[]` / 0 / 0, `NOT_APPLICABLE` (`TILLAGE_FIELD_NOT_SUPPORTED`). Paired `requirement` unchanged.
- Engine, grazing fields with no recorded livestock: clamped-35 kg N blend → `[]` / 0 / 0, `UNKNOWN` (`MISSING_LIVESTOCK_DATA`); on commonage `PROHIBITED`.
- Engine, grazing fields with no usable farm grassland area: blend from a 0 stocking rate → `[]` / 0 / 0, `UNKNOWN` (`MISSING_GRASSLAND_AREA`).
- Engine, every plan: `calculationVersion` v1.4.0 → v1.5.0; new `purchaseStatus`. Fully indexed grassland fields (incl. LATE_SUMMER / unsupported method / method conflict, now `RECOMMENDED_CREDIT_NOT_COUNTED`), mixed, no-index, silage-without-plan and unresolved-composition fields: products / delivered / cost unchanged.
- Fertiliser prompt (`fertiliser-recommendation.ts`): basis read from `purchaseStatus` (`basisFromPurchaseStatus`). No-grassland-area grazing: OK / `NO_FERTILISER_CURRENTLY_RECOMMENDED` → `BLOCKED (MISSING_GRASSLAND_AREA)`; no-livestock grazing with an empty legacy blend: `NO_FERTILISER_CURRENTLY_RECOMMENDED` → `BLOCKED (MISSING_LIVESTOCK_DATA)`; credit-not-counted: summary gains additive `provisional` {headline, detail} and the description a "Provisional — …" sentence. Farm demand (`getFarmFertiliserDemand`) follows the prompt: those fields leave Recommended / Planned and count in `fieldsWithBlockedEvidence`.
- `finance.ts`: `calculateFarmFertiliserRequirement` / `calculateFarmSlurryNutrientValueEur` count an `UNKNOWN` / `WITHHELD` purchase as blocked (before: no-grassland-area grazing products summed / € difference added) and skip `NOT_APPLICABLE`.
- `fertiliser-plan.ts` `aggregateFarmFertiliserRecommendation`: sums only `RECOMMENDED` / `RECOMMENDED_CREDIT_NOT_COUNTED` plans (signature now also picks `purchaseStatus`).
- CSV (`lib/reports.ts`) "Purchased products": `UNKNOWN` / `WITHHELD` → `INSUFFICIENT_EVIDENCE` (before: product list); credit-not-counted rows append ` (provisional: slurry nutrient credit not included)`.
- Evidence Report: `productAllocationKgField` absent for `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` (before: `[]` or legacy list); Product allocation shows the reason instead of "No real product recommended." and a provisional line for credit-not-counted.
- `PurchasedFertiliserCard`: new required `purchaseStatus` prop; `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` show the reason (before: table / €0). Nutrients page passes it and offers "Plan this application" only for a sized blend; the plan sheet's recommendation carries `provisional`.
- `slurry-direct-economic-assessment.ts`: a baseline or intervention plan whose purchase is `UNKNOWN` / `WITHHELD` / `NOT_APPLICABLE` blocks with `ECONOMIC_SLURRY_ASSESSMENT_PURCHASE_NOT_RECOMMENDABLE` (before: costed as a €0 plan).

Presentation selection lives in the pure `src/lib/purchase-status-presentation.ts`. Tests: `nutrients.purchase-status.test.ts` (76, real engine: published blend = legacy blend via the NAP delivered total for grazing / silage × Index 1–4 × no slurry / splashplate / spring and summer LESS; credit-not-counted equals the no-credit figures for LATE_SUMMER, unsupported timing, unsupported method, method conflict; composition UNKNOWN; mixed WITHHELD with the known remaining arm; no index, tillage, no livestock, no grassland area, silage without plan; NONE_NEEDED; commonage / buffer PROHIBITED; CC-B5 buffer isolation); 192-case digest baseline passes with `purchaseStatus` excluded and v1.5.0 normalised; prompt, finance, CSV, Evidence Report, card, fertiliser-plan aggregation, economic assessment and presentation-helper tests. Version assertions updated; two hand-built `NutrientPlan` fixtures gain `purchaseStatus`. One legacy prompt test (commonage, no livestock) still passes because commonage is a decided `PROHIBITED`.

## Fertiliser Vertical Completion — Session 1 (Increment 2d): farmer-facing slurry diagnostic — starting bcb625a (2026-10-02)

Read-only per-field planned slurry evaluation on the Nutrients page (D1 authorised; D2: evaluates the farmer's planned rate only, no rate generated). `NutrientsPageClient` builds `buildSlurryRateAllocation({ plan, plannedUse })` over its existing `plan`; new pure helper `src/lib/slurry-diagnostic-presentation.ts` selects states only (no arithmetic); new `SlurryDiagnosticCard` renders planned rate / total / DM% basis and, per N/P/K independently, slurry contribution, field requirement, remaining requirement and organic excess (unclamped; known 0 shown "None"); unknown values show "Unknown" with their own reason, never 0. No slurry → "No slurry planned for this field."; tillage → "Not evaluated" (also rendered beside the existing no-recommendation disclosure). Share caps, 90 kg K, external constraints and the deferred rate are not shown. `slurry-rate-allocation.ts` comment only (logic, version `v0.3.0-draft`, `affectsProductionOutput: false` unchanged). No `NutrientPlan`, statutory, purchasing or migration change. Tests: `SlurryDiagnosticCard.test.tsx` (12, real `calculateNutrientPlan` → allocation outputs: complete, none planned, P-only, K-only, neither, excess, no excess, tillage, unsupported method, unknown≠0, forbidden wording, canonical-value identity / no arithmetic) and 3 page tests in `NutrientsPageClient.test.tsx`. VISUAL_REVIEW_OUTSTANDING (build agent cannot drive a browser).

## Fertiliser Vertical Completion — Increment 2c: slurry rate-allocation layer on canonical requirement — starting 6e270cb (2026-10-02)

Draft layer only (`slurry-rate-allocation.ts`, still unwired; no production output, frozen module, Campaign C rule, cap or threshold changed). `buildSlurryRateAllocation` → `slurry_rate_allocation_v0.3.0-draft`, per design §2.2: reads `fieldRequirement` (soil index from its `p/k.soilIndex`) and `fieldRemainingRequirement` instead of `requirementByNutrient` / `netRequirementByNutrient` / `fertilityEvidenceByNutrient`. Differences from v0.2.0 for fully indexed fields, all pinned by tests: (1) version; (2) `cropRequirement` (rounded quantities) → `requirement` (canonical arms, unmodified, unrounded) and `remainingChemicalRequirement` → canonical `fieldRemainingRequirement` arms (each rounds to the paired figure); (3) new `plannedApplication` (`NONE_PLANNED` | `PLANNED` with rate, `totalM3`, `availableNutrientBasis`) and `organicExcessOverRequirement` (P/K = requirement-limit outputs; N same exact comparison, recorded only, no constraint record); (4) P/K requirement-limit and Index 3 share comparisons are exact against the unrounded requirement — the ±0.5 kg/ha interval and its UNDETERMINED band are removed, so excess values, share limits and the 90 kg K output use the unrounded requirement and available = requirement is NOT_BINDING with excess 0; (5) reason/unknown wording from canonical arms (`crop requirement UNKNOWN (<reasonCode>)`; an unknown available nutrient's reason). Tillage → P/K requirement limits, share limits and 90 kg K `NOT_EVALUATED` with `TILLAGE_FIELD_NOT_SUPPORTED`; grazing without livestock / grassland area → `UNDETERMINED`, limit unknown, never 0; mixed P/K evaluates only the known nutrient. Share caps, 90 kg K, external constraints, `organicAllocatedNutrient`, `finalAllowedRate` DEFERRED (name kept, design's `recommendedRate`) and `affectsProductionOutput: false` unchanged. Tests remapped plus tillage / no-livestock / no-grassland-area × method/timing × Index 1–4, mixed P-only/K-only, organic excess positive/zero, exact comparisons, equality boundary, table-level blocks, no-selector regression. Docs: `DOMAIN_CONTRACTS.md` Campaign C row, `RATE_ALLOCATION_ARCHITECTURE.md` §2 (source discrepancy from design §7 fixed; stale "withholds P and K together" corrected), design status, `BUILD_STATE.json`.

## Fertiliser Vertical Completion — Increment 2b: canonical remaining chemical requirement — starting 172d154 (2026-10-02)

Additive `NutrientPlan.fieldRemainingRequirement` (`FieldNutrientRemainingRequirement`, `field_nutrient_remaining_v1`, `types.ts`), built once in `calculateNutrientPlan` (`buildFieldNutrientRemainingRequirement`, `nutrients.ts`) from `fieldRequirement` and `organicApplication.availableNutrientByNutrient`, per design §2.1: requirement NOT_APPLICABLE / UNKNOWN pass through (`REQUIREMENT_UNKNOWN`); no slurry planned is a known zero credit (`NO_SLURRY_PLANNED`); an OK credit gives unrounded max(0, requirement − credit) with field total (`MISSING_FIELD_AREA` as `fieldRequirement`) and the weakest evidence state; any other credit is UNKNOWN (`SLURRY_CREDIT_UNKNOWN`), never 0. Nothing re-derived. Tests (`nutrients.test.ts`) from real engine output: rounding equality with `netRequirementByNutrient` for every Index 1–4 / grazing / silage / slurry method; P/K independence; LATE_SUMMER, unsupported method, unresolved composition, method conflict and missing own index → UNKNOWN; tillage NOT_APPLICABLE; no livestock / grassland area UNKNOWN; totals and `MISSING_FIELD_AREA`; excess floors to a known 0. Digest baseline excludes the new field; two hand-built `NutrientPlan` fixtures gain it with assertions unchanged. Additive change recorded in `DOMAIN_CONTRACTS.md`; engine stays `nutrient_engine_v1.4.0` (D8). No consumer reads it.

## Fertiliser Vertical Completion — Increment 2a: slurry recommendation design — starting af3036d (2026-10-02)

Documentation only: `FERTILISER_VERTICAL_SLURRY_DESIGN.md`. Traced every slurry module against the code (callers, frozen / production / draft / unwired status, where unknown becomes 0, rule evidence class). Findings: no engine ranks fields or chooses a rate (the rate is farmer volume ÷ area); Phase 6 and the Campaign C rate layer have no production caller; only `planned` allocations feed `calculateNutrientPlan`; no canonical (unrounded, `fieldRequirement`-based) remaining chemical requirement exists. Design: an additive `NutrientPlan.fieldRemainingRequirement` computed in `nutrients.ts`, the draft layer evolved to consume it, and staged increments 2b–2f. Only 2b and 2c need no decision; 2d–2f are gated on the recorded product-owner, Campaign B and Campaign C decisions (D1–D8, including CC-B5 and mixed P/K purchasing). No production code, test, contract or engine version changed.

## Fertiliser Vertical Completion — Increment 1: canonical per-field nutrient requirement — starting c2a6b38 (2026-10-02)

Additive `NutrientPlan.fieldRequirement` (`FieldNutrientRequirement`, `types.ts`; built in `calculateNutrientPlan`, `nutrients.ts`): independent N/P/K arms (`KNOWN` with unrounded kg/ha, field total, evidence state, Green Book table refs and limitations; `UNKNOWN` with reason, no number; `NOT_APPLICABLE` for tillage), each P/K arm with its own soil-index outcome, plus area, crop/use and target-yield context and engine version. Built from the same unrounded gross locals as `requirement` and released only where `requirementByNutrient`'s arm is OK, so it never reads the Index-1 placeholder (CC-B5 stays open). Complete data reproduces the published requirement for every Index 1–4 combination (grazing and silage); no existing output changed (192-case baseline, field excluded); engine stays v1.4.0. Legacy compatibility paths (tillage, no-livestock grazing, mixed paired outputs, silage N scaling) and unmigrated consumers recorded in `DOMAIN_CONTRACTS.md`. The build session ended without a result marker (CLI JSON failure) after the engine/type change; fixtures, tests and docs completed by hand: 9 new tests (complete-data equality, P/K independence and invariance, unknown never 0, totals, tillage, no livestock, silage without plan, missing area). Primary audit F001 (HIGH): a farm grassland area ≤ 0 floored the stocking rate to 0 and the canonical grazing arms read KNOWN 0; fixed — grazing N/P/K are `UNKNOWN` (`MISSING_GRASSLAND_AREA`), paired output unchanged, regression test added. Pre-existing, out of scope: a NaN `farmGrasslandAreaHa` throws inside the statutory P lookup (`napEnhancedPBuildUpKgHa`) before any requirement is built.

## Visual check — Nutrient requirement card header badges (2026-10-02)

Rendered bounds checked for the badge fix (`e49be34`, audit F001 Medium) on a temporary, uncommitted page (deleted afterwards), from real `calculateNutrientPlan` output: paired (both indices), mixed (P only) and insufficient-evidence (neither) headers. At 390 px every header's furthest content edge is 351 px inside a 372 px card (badges wrap under the title; header 102 px, or 72 px for insufficient evidence); at 1440 px every header stays on one row (36 px) with content at 1067 px inside a 1088 px card. Targeted card tests (7) and `npm run build` pass locally. Closes F001 of `audit-20261002T151*` and the header overflow noted in the Increment 5a visual check.

## Nutrient requirement card header badge overflow on mobile — starting c6745a6 (2026-10-02)

Layout only, follow-up to the 5a visual check. `NutrientRequirementCard.tsx` passes `flex-wrap` to its `CardHeader` in all three states and its badge group is now `min-w-0 flex-wrap` instead of `shrink-0`, so at 390 px the status and source badges wrap under the title inside the card; on desktop, where everything fits, the header renders as before. Shared `Card`/`CardHeader` unchanged. `OrganicNutrientsCard` checked: its header has no badges (the `SourceBadge` sits in the body's wrapping row), so no change. New component tests pin the wrap classes for the paired, mixed and insufficient-evidence states; the layout still needs a visual check at 390 px.

## Per-nutrient P/K Increment 5b completion — slurry basis for mixed fields (CC-B6) — starting 21ba183 (2026-10-02)

Resolves CC-B6 and the 5b final audit's F001/F002 (`.agent/history/audit-20261002T141848Z-19789.md`). Engine, additive and metadata only (product owner, 2026-10-02): `NutrientPlan.organicApplication.availableNutrientBasis` exposes the one shared slurry table selection's method, rate, DM%, date, timing (and whether assumed), `ruleId`, `source` and `scientificBasisNote`, independent of the soil indices; a table-level block or `NOT_APPLICABLE` is carried unchanged. With both indices it equals the paired assessment's basis fields. No value, status or reason code changed; engine version unchanged (`nutrient_engine_v1.4.0`); the 192-case baseline digests are unchanged with the new field excluded. `mixedRequirementReport` carries it into the Evidence Report's mixed section, whose page shows method, timing, rate/DM, rule/source and scientific basis. Tests: engine basis assertions across the Increment 2 matrix; orchestration and page matrices from real `calculateNutrientPlan` output for P-only, K-only, both, neither and tillage.

## Visual check — per-nutrient P/K Increment 5a and CC-FU-A (2026-10-02)

Mobile (390 px, rendered in a fixed-width frame) and desktop (1440 px) review of `NutrientRequirementCard`, `OrganicNutrientsCard` and `PurchasedFertiliserCard`, rendered from real `calculateNutrientPlan` output on a temporary, uncommitted dev page (deleted afterwards) for P-known/K-missing, K-known/P-missing, neither index and both indices (verified Index 2, 33 m³/ha spring LESS at 6% DM). D3 wording, "—" for the unknown nutrient, no NPK total in the mixed state, CC-FU-A's "N credit included" for the neither-index case, and unchanged fully indexed cards all render as specified at both sizes; text wraps cleanly at 390 px. This closes CC-FU-A's open Medium (visual review outstanding). Pre-existing, not caused by this work: at 390 px the requirement card header's source badge ("Teagasc Green Book (5th Ed., 2020)") overflows the card edge on every state, including the unchanged fully indexed card — a separate small layout follow-up.

## Per-nutrient P/K Increment 5b — known P or K in CSV, Evidence Report and prompt — starting 552e709 (2026-10-02)

Reporting/content only. New pure `mixedRequirementReport` (`src/lib/nutrient-card-presentation.ts`, reusing the 5a selection and D3 line) gives a mixed field's per-nutrient gross / organic offset / net, `null` for unknown or withheld values (the missing nutrient in every row). CSV (`src/lib/reports.ts`): mixed rows export the known P or K requirement and credit; the unknown keeps `INSUFFICIENT_EVIDENCE` (or `NOT_APPLICABLE` for tillage), never 0; N, products (D1 a) and NAP columns unchanged. Evidence Report: additive optional `ScientificEvidenceReport.mixedNutrientRequirement`, set only when `nutrientPlan` is absent and exactly one index is known; the page renders per-nutrient rows with "—" and the D3 line. `reportVersion` unchanged; fully indexed and no-index reports omit the key. Prompt verified, no change: the blocked basis lists only the missing index (`missingInputs`), pinned by new tests. No engine change.

## Per-nutrient P/K Increment 5a — show known P or K on the Nutrients cards — starting 7864c9e (2026-10-02)

UI/content only, D3 wording (product owner, 2026-10-02). New pure helper `src/lib/nutrient-card-presentation.ts` selects the card state from `fertilityEvidenceByNutrient`, `requirementByNutrient` and `availableNutrientByNutrient`; it derives no number. Mixed fields: known values, unknown "—", no NPK total, badges Green Book/estimated with the plan's calculation version. Any missing-index state: withheld P/K slurry credit "—". `OrganicNutrientsCard` gained a required `fertilityEvidenceByNutrient` prop (`NutrientsPageClient` passes it). CC-FU-A mixed-case test expectations moved to the D3 wording; neither-index and fully indexed output unchanged. No engine, contract or purchasing change.

## Per-nutrient P/K Increment 4 — remap slurry rate-allocation layer — starting 259f30c (2026-10-02)

`slurry-rate-allocation.ts` now reads `requirementByNutrient`, `availableNutrientByNutrient`, `netRequirementByNutrient` and `fertilityEvidenceByNutrient` instead of the paired fields; version `slurry_rate_allocation_v0.1.0-draft` → `v0.2.0-draft`; still unwired (`affectsProductionOutput: false`). Product-owner decision 2026-10-02: a table-blocked slurry credit makes the layer's remaining chemical requirement unknown (UNKNOWN is never zero) although the paired net counts it as 0. Mixed fields get the known nutrient's records (invariant to the other index); fully indexed records otherwise unchanged. The build session ended without a result marker and its recovery verification failed on three test expectations (a premise about paired net status that does not hold for unresolved composition; available slurry N compared with the rounded `offsetN` instead of the unrounded arm). Expectations corrected by hand; no engine or frozen module changed.

## Per-nutrient P/K Increment 3 — per-nutrient gross and net requirement — starting 418a440 (2026-10-02)

Product owner (2026-10-02) authorised releasing these figures beside the retained internal Index-1 placeholder (CP3 stays blocked on CC-B5), with safeguards: no placeholder-derived number in any arm, an invariance test, no consumer reads. Added `NutrientPlan.requirementByNutrient` / `netRequirementByNutrient` (`types.ts`, `nutrients.ts`). Gross arms are `Math.round` of the same `grossX` locals as `requirement`, released only from the nutrient's own index; N keeps `requirement`'s rule. Net arms come from one shared per-nutrient remaining calculation over `availableNutrientByNutrient` (`NOT_APPLICABLE` = zero credit; any other non-OK credit blocks), never the paired `remainingX` / `offset`. Legacy outputs unchanged. Engine `nutrient_engine_v1.3.0` → `nutrient_engine_v1.4.0`; stored records not rewritten; version assertions updated. Baseline digest test also excludes the new fields and maps v1.4.0 → v1.2.0; all 192 cases still match `b4d3c29`. New matrix: 11 slurry/silage scenarios × P/K × Index 1–4 × other index absent/1–4 (invariance, no-placeholder, fully-indexed equality), positive-credit mixed case, grazing and CC-B5 cases. Hand-built fixtures gained the fields. Design §4 re-decision and §6 status recorded; `DOMAIN_CONTRACTS.md` entry added (non-breaking carve-out, steps 1–3; `contracts_frozen` stays `true`).

## Per-nutrient P/K Increment 2 descope — restore Index-1 placeholder (F001) — starting 647677f (2026-10-02)

Audit F001 (HIGH): removing the placeholder changed `nationalBufferDistanceStatus`, because the placeholder-sized blend chooses the buffer material. Per the product owner's decision, Increment 2 is now CP4 only. `nutrients.ts` restores `pIndex ?? 1` / `kIndex ?? 1` and every placeholder-fed internal computation exactly as at `bfdad74`, and removes `purchaseRequirementUnknown`. `availableNutrientByNutrient` stays and reads only the real indices. Engine stays `nutrient_engine_v1.3.0`. New CC-B5 buffer regression tests (audited case and P-missing mirror). New blocker CC-B5; design doc CP3 marked blocked; `DOMAIN_CONTRACTS.md` Increment 2 entry corrected.

## Per-nutrient P/K Increment 2 — per-nutrient slurry credit and placeholder removal — starting bfdad74 (2026-10-02)

Added `organicApplication.availableNutrientByNutrient` (`types.ts`, `nutrients.ts`). The resolver body now runs one private table selection, and the paired assessment and the per-nutrient view are both derived from it. The resolver's export signature is unchanged. Removed the Index-1 placeholder. `offsetN` comes from the N arm. An unknown P or K requirement keeps the chemical-fertiliser buffer context. Engine `nutrient_engine_v1.2.0` → `nutrient_engine_v1.3.0`, because a new production figure is released for mixed fields; stored records are not rewritten. Version assertions in the tests were updated. The baseline digest test now also excludes the new field and normalises only `calculationVersion` (v1.3.0 → v1.2.0); all 192 cases still match `b4d3c29`. New per-nutrient matrix: 4 methods × 4 timings × 3 DM% × 25 P/K presence/index cases, plus block, no-placeholder and buffer cases. Non-breaking carve-out, steps 1–3; `contracts_frozen` stays `true`.

## Per-nutrient P/K Increment 1 — per-nutrient fertility evidence — starting b4d3c29 (2026-10-02)

Additive `NutrientPlan.fertilityEvidenceByNutrient` (`types.ts`, `nutrients.ts`); the paired `fertilityEvidence` is now derived from the two arms as their conjunction. Non-breaking carve-out, steps 1–3; `contracts_frozen` stays `true`; engine stays `nutrient_engine_v1.2.0`. Two hand-built test fixtures gained the field. New matrix test (4 methods × 4 presence cases × Index 1–4 × 3 statuses) checks each arm and compares a digest of every pre-existing field with `nutrients.fertility-evidence-baseline.json`, generated from the engine at `b4d3c29`. Index-1 placeholder and paired `missingInputs` unchanged.

## Per-nutrient P/K design — F002 increment sequencing — starting 2429004 (2026-10-02)

Docs only: `PER_NUTRIENT_PK_DESIGN.md` Increment 1 is now CP1 only, and CP3 placeholder removal moves to Increment 2 with CP4. CP2 gross+net is in Increment 3, so no figure is released beside the placeholder. Retained-N invariant added to the Tests column.

## Per-nutrient P/K architecture design — starting 6535b84 (2026-10-01)

Design only: added `campaign-c/PER_NUTRIENT_PK_DESIGN.md` (change points CP1–CP7 with
code-verified references, staged Increments 1–8, open decisions D1–D4) and a pointer from
`RATE_ALLOCATION_ARCHITECTURE.md` §5. No code, test, contract, engine-version
(`nutrient_engine_v1.2.0`) or BLOCKERS status change. GAP-04, CC-B2 and CC-B4A not reopened.

## CC-FU-B close-out — final audited commit 40cce09 (2026-10-01)

Closed by agent-run (2 model calls). Primary audit `audit-20261001T213452Z-78269` over
`5443257..40cce09`: 0 Critical, 0 High, 0 Medium, 0 Low — a clean primary audit of the
complete task delta at the closing HEAD, so it is the final audit. Runner verification
(category E) passed: task verify, targeted tests, typecheck, lint, build and full suite.
`contracts_frozen` restored to `true`; CC-FU-B resolved; CC-FU-C stays open.

## CC-FU-B slurry DM% provenance label — starting 5443257 (2026-10-01)

Labels/provenance only; no nutrient value, status, reason code or fail-closed path changed;
engine `nutrient_engine_v1.2.0`; no migration. CC-FU-C stays open.

- Frozen-contract change (product owner authorised 2026-10-01): `nutrients.ts`
  `resolveAvailableSlurryNutrients` gains a required `dmPctStatus`; its OK `evidenceState`
  is the weaker of the table/method state and the DM% state (`verified` → `MEASURED`,
  otherwise `IRISH_DEFAULT`). `EffectiveSlurryComposition.status` narrowed to what it
  already returned. `evidence.ts` now exports `weakestEvidenceState` (moved from
  `fertiliser-plan-cost.ts`). Only caller `calculateNutrientPlan` updated. See
  `DOMAIN_CONTRACTS.md` "CC-FU-B".
- **In-flight worktree agents: rebase before continuing.** `contracts_frozen` is `false`
  for this change's audit cycle; the close-out commit restores it.
- Consumers reviewed: economics, rate allocation, What Matters, UI and fertiliser prompt
  read `status`/values only; the audit export serialises the outcome unchanged in shape.
- Tests: `nutrients.test.ts` CC-FU-B block (resolver and plan; LESS spring/summer,
  splashplate spring; verified/farmer_adjusted/estimated); `evidence.test.ts`.

## CC-FU-A slurry nutrient-credit messaging — starting 29614a1 (2026-10-01)

UI wording only. No nutrient calculation, slurry engine, Campaign C rule or frozen contract
changed; engine `nutrient_engine_v1.2.0`; no migration.

- Trace: `requirementProvisional.headline` ("Slurry nutrient credit not included") is
  rendered only by `NutrientRequirementCard` and `PurchasedFertiliserCard`, and both show
  "Insufficient evidence" instead when a soil index is missing, so the headline never
  reached a missing-index farmer. The visible inaccuracy was `OrganicNutrientsCard`'s
  "Not yet assessed" beside the retained slurry N offset.
- Fix: `OrganicNutrientsCard` shows "N credit included" / "Slurry N credit is included.
  P and K credit isn't counted yet." when the assessment is `MISSING_SOIL_FERTILITY_INDEX`
  and `offsetN > 0`; all other cases unchanged.
- Tests: `slurry-credit-messaging.test.tsx` renders all three cards from real
  `calculateNutrientPlan` output (missing P, K, both; complete indices; unsupported method).
- Visual review outstanding: on 2026-10-01 no field on the signed-in dev farm had slurry
  allocated or a missing soil index, so the changed card state could not be captured at
  mobile/desktop sizes. Review it when a field reaches that state.

## Campaign C remaining programme close-out — final audited commit f1366c5 (2026-09-30)

The remaining programme is closed. Still no production output change; engine
`nutrient_engine_v1.2.0`; no frozen contract changed; no migration. Campaign C remains
AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT.

- Audit fixes to the unwired `slurry-rate-allocation.ts`:
  - F001 (`c7cbb09`): requirement and Index 3 share comparisons within ±0.5 kg/ha of the
    rounded `NutrientPlan` requirement are UNDETERMINED, not BINDING/NOT_BINDING.
  - F002 (`c7cbb09`): the 90 kg K first-cut guidance is evaluated only when `plannedUse` is
    `silage_1st_cut`; otherwise NOT_EVALUATED, with no remainder.
  - F003 (`f1366c5`): external rate constraints must supply, and keep, the upstream
    evaluated input and output.
- Final task audit `audit-20260930T130919Z-50109` over `465a523..f1366c5`: 0 Critical,
  0 High, 0 Medium, 0 Low. Full `npm test` (254 files, 4099 tests) and build passed on
  `f1366c5`.

## Campaign C remaining programme — starting 465a523 (2026-09-30)

Architecture, deferral and validation preparation. **No production output changed.** The
engine stays `nutrient_engine_v1.2.0`. No frozen contract changed, and there was no
migration. Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING and
DRAFT.

- Follow-ups were logged as BLOCKERS `CC-FU-A` (card headline), `CC-FU-B` (LESS `MEASURED`
  label) and `CC-FU-C` (January as SPRING). No code changed for them.
- Added `slurry-rate-allocation.ts`, an unwired layer over a finished `NutrientPlan`.
  - It keeps requirement, available nutrient, share limit, allocated credit, remaining
    chemical requirement, rate constraints and final rate separate.
  - Every constraint carries full provenance.
  - Share caps are recorded, with binding UNDETERMINED on Index 1/2 (interaction
    provisional).
  - The 90 kg K guidance is recorded and NOT_ENFORCED.
  - `finalAllowedRate` is always DEFERRED, with no min(P, K).
- N yield scaling stays deferred: no stored source states a range.
- Per-nutrient P/K is deferred (architecture): it touches frozen shapes, about 11
  consumers, blend purchasing and statutory outputs.
- CC-B3 is designed (`CC_B3_PERSISTENCE_DESIGN.md`) and ready for a migration task.
- The blinded 50-case protocol, the `campaign-c-expert-validation.ts` types and
  comparison, and an empty template were added. Validation has not taken place.
- Record: `campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` and `SOURCES_AND_CLAIMS.md` §8.
  Nothing was pushed.

## Campaign C verified rules within existing architecture — starting 942cc81 (2026-09-29)

Implementation review of the REPOSITORY_VERIFIED Teagasc rules against the existing engine.
**No production output changed**; engine stays `nutrient_engine_v1.2.0`; no migration.
Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT.

- Organic share caps (P 50% / K 75%): IMPLEMENTATION_DEFERRED_ARCHITECTURE — they govern how
  much organic fertiliser to plan; the engine takes the planned slurry volume as an input and has
  no rate/allocation layer, and capping the credit would apply the AI_PROVISIONAL stacking reading.
- 90 kg K spring guidance: DEFERRED_EXACT_RULE_PROVISIONAL — no existing 90 kg rule; slurry-K
  counting is AI_PROVISIONAL; slurry K credit still not truncated.
- Yield scaling: P ±4 / K ±25 ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED (stored 5/6 t rows
  reproduced); N ±25 IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR (only 5/6 t rows, no stated
  range, no statement for the grazed-previous-year rate; silage plans mock-only in real mode).
- Rate principles: organic-before-chemical balance and nutrient-content determination
  ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED; rate-by-requirement IMPLEMENTATION_DEFERRED_ARCHITECTURE;
  `AI_PROVISIONAL_RATE_SELECTOR_V1` not implemented.
- Tests (`nutrients.test.ts`): over-cap LESS credit subtracted in full after the unchanged
  availability factors; P/K yield rows; N not yield-scaled; no rate selector; engine version.
- Record: `campaign-c/SOURCES_AND_CLAIMS.md` §7. Nothing pushed.

## Campaign C stored Teagasc evidence ingestion — starting 0c58a8c (2026-09-29)

Inspected the five frozen snapshots in
`docs/scientific-engine/v3/external_teagasc_2026-09-29/` directly (no web access) and recorded
sources, SHA-256, locators and classifications in SOURCES_AND_CLAIMS §6
([AI_ADJUDICATION §6](campaign-c/AI_ADJUDICATION_2026-09-29.md)).

- **REPOSITORY_VERIFIED / SOURCE_DIRECT, READY_FOR_IMPLEMENTATION_REVIEW:**
  - the 50% P / 75% K Index 1/2 share caps (kept separate from the × 0.50 / × 0.90 factors);
  - the 90 kg K spring text;
  - "February to April" wording;
  - N 25 kg per t DM (P 4 / K 25 already implemented).
- **Stay AI_PROVISIONAL / AI_REVIEW_ONLY (IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION):**
  - the exact 1 Feb – 30 Apr boundary;
  - the slurry-K 90 kg reconciliation;
  - `AI_PROVISIONAL_RATE_SELECTOR_V1` (the cereal source is P-led and states no min(P, K));
  - the cap/availability interaction, downgraded from the earlier SOURCE_DIRECT label because
    the source does not state it.
- The consistency test now recomputes the snapshot SHA-256 values and checks every quoted
  locator against the stored page text.
- **Unchanged:** production code, engine `nutrient_engine_v1.2.0`, reference-case JSON,
  Campaign B. The rule set stays DRAFT with EXPERT_VALIDATION_PENDING.

## Campaign C AI scientific adjudication (evidence-gated) — starting 2b6da92 (2026-09-29)

Recorded the authorised AI external Teagasc review as `SRC-AI-REVIEW-2026-09-29`
(EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW; no fingerprint and no local copy
claimed). The record is
[campaign-c/AI_ADJUDICATION_2026-09-29.md](campaign-c/AI_ADJUDICATION_2026-09-29.md).
Claims `CLM-AIR-*` are in SOURCES_AND_CLAIMS §5.

- **Status:** AI_SCIENTIFIC_ADJUDICATION with EXPERT_VALIDATION_PENDING. CC-B1 is
  AI_ADJUDICATED_EXPERT_VALIDATION_PENDING. Nothing is expert-approved, and the rule set
  stays DRAFT.
- **Production evidence gate:** only REPOSITORY_VERIFIED rules may change production. The
  following are AI_REVIEW_ONLY and deferred for evidence ingestion:
  - the organic share caps;
  - the 90 kg K spring-constraint reconciliation;
  - the February spring start;
  - N yield scaling;
  - `AI_PROVISIONAL_RATE_SELECTOR_V1`.
- **Already implemented, now frozen by regression tests:**
  - 6% LESS P = 0.5 and 7% LESS P = 0.6;
  - the 50%/90% availability factors (crop requirement untouched);
  - slurry K credit not truncated at 90;
  - no DM interpolation (6.3% blocks);
  - timing labels unchanged;
  - P/K yield scaling.
- **Deferred:**
  - GAP-04 paired P/K architecture (CC-B4A retained);
  - GAP-05 Level B and GAP-07/08 inputs;
  - GAP-08 crop-cycle persistence (no migration).
- **Unchanged:** no production code, engine `nutrient_engine_v1.2.0`, reference-case JSON,
  Campaign B and statutory outputs. No migration, push or deploy.

## CC-B1 Campaign C science adjudication — starting 0a92745 (2026-09-29)

Evidence-review task using repository evidence only. No production code, reference-case
JSON, migration, UI or Campaign B change. The record is
[campaign-c/ADJUDICATION_CC-B1.md](campaign-c/ADJUDICATION_CC-B1.md).

- CONF-01 is RESOLVED_WITH_SCOPE (6% spring LESS P 0.5 kg/m³, Green Book Tables
  9-1/9-4/9-8 against a single non-retained quotation). CONF-04 is RESOLVED_WITH_SCOPE
  (Feb–Apr; January OUT_OF_SCOPE). Both are pending §4 re-verification and reviewer
  ratification.
- CONF-02 is UNRESOLVED_CONFLICT (internal to the Green Book). CONF-03, GAP-01 and
  GAP-02..08 are INSUFFICIENT_EVIDENCE.
- Corrected CONFLICTS.md's claim that CONF-01 was "confirmed from a primary read".
  Added claims `CLM-GB-9-11-TXT` and `CLM-GB-14-INTRO`.
- Campaign C remains DRAFT. CC-B1 remains open, narrowed to the evidence requests in the
  record.

## CC-B4A close-out — final audited commit b6f0aea (2026-09-29)

CC-B4 is **RESOLVED** through the narrow CC-B4A correction. Campaign C remains DRAFT and not
approved; CC-B1 and CC-B3 remain open; no CONF or GAP item is resolved.

- Implementation `1b3d126` (engine `nutrient_engine_v1.1.0` → `nutrient_engine_v1.2.0`);
  primary audit `audit-20260929T113853Z-31803`: 0 findings. Final audit F001 (HIGH, frozen
  contract flag not flipped) fixed in `b6f0aea`. Final task audit
  `audit-20260929T135623Z-55385` over `b5f90c3..b6f0aea`: 0 Critical, 0 High, 0 Medium,
  0 Low.
- `BUILD_STATE.json.contracts_frozen` restored to `true` in this bookkeeping commit
  (DOMAIN_CONTRACTS.md close sequence, commit B); this commit is audited afterwards like any
  other.
- Independent per-nutrient P/K evidence was intentionally not implemented; it remains a
  possible separate architecture task.
- Retrospective process note (recorded, not silently corrected): CC-B2 (`c5d64c4`..`65bdedb`)
  also changed `calculateNutrientPlan`'s fail-closed behaviour in frozen `nutrients.ts`
  (F001: missing index → blocked LESS assessment; F003: N kept) without flipping
  `contracts_frozen` to `false` during its audit cycle, and none of its audits flagged it.
  CC-B2 is closed and clean, so no live risk remains from that gap.

## CC-B4A splashplate missing-index guard — starting b5f90c3 (2026-09-29)

Narrow production correction following the blocked CC-B4 investigation; not Campaign C
implementation and not a per-nutrient P/K redesign. Status: fixed in code, awaiting
independent audit.

- Root cause: `calculateNutrientPlan` fills a missing P/K Soil Index with an Index-1
  placeholder; the CC-B2 guard blocked only LESS (`ruleId !== "SLURRY_TABLE_9_8"`), so the
  captured and assumed-method splashplate branches returned an OK assessment with
  placeholder-derived P/K and `soilIndexAdjustmentApplied: { p: true, k: true }`, which
  `slurry-direct-economic-assessment` treated as supported science.
- Correction: the guard now applies to every OK slurry assessment, so a missing P or K index
  gives `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` (no value, so no
  adjustment metadata). N is kept through the existing F003 path; P and K offsets stay
  withheld together as before (paired fertility evidence). Requirement, products, NAP,
  statutory value and report exports were already withheld and are unchanged. Complete-data
  splashplate and all LESS behaviour unchanged.
- Implementation correction (LIFECYCLE §8): `nutrient_engine_v1.1.0` (affected: OK
  splashplate assessment on a placeholder index) → `nutrient_engine_v1.2.0`; stored v1.1.0
  records are not rewritten and are identifiable by `calculationVersion`. No new science.
- Reachability: `CONFIRMED_PRODUCTION_PATH` (`calculateNutrientPlan` → Nutrients, Scientific
  Evidence Report, What Matters economics). Live user exposure: UNKNOWN.
- Tests: CC-B4A block in `nutrients.test.ts` (3 missing cases × captured/assumed method,
  8 complete-data index pairs, version) and a What Matters economics case in
  `slurry-direct-economic-assessment.test.ts`; 7 of them fail against the pre-fix guard.
- Independent per-nutrient P/K evidence intentionally not implemented. Campaign C remains
  DRAFT; CC-B1 and CC-B3 remain open.
- Contract change (audit F001, HIGH): this changes `calculateNutrientPlan`'s fail-closed
  behaviour in frozen `nutrients.ts`, so `BUILD_STATE.json.contracts_frozen` is set to `false`
  for the CC-B4A audit cycle; no new worktree tasks are delegated while it is `false`, and
  in-flight worktree agents must rebase before continuing. It returns to `true` only in a
  separate bookkeeping commit after a clean final audit (DOMAIN_CONTRACTS.md close sequence).

## CC-B2 close-out — final audited commit 65bdedb (2026-09-29)

CC-B2 / RISK-01 is **RESOLVED** as a narrow production correction. Campaign C remains
DRAFT and not approved; this close-out records no scientific approval.

- Production correction: spring and summer LESS credit apply the existing Index 1/2
  factors (P × 0.50 by P Index, K × 0.90 by K Index); N unchanged. Engine version
  `nutrient_engine_v1.0.0` → `nutrient_engine_v1.1.0` (implementation correction).
- Audit remediation: F001 (missing index → OK placeholder-adjusted LESS assessment) and
  F002 (engine version) in `cac1d01`; F003 (missing P/K index erased the LESS N credit;
  N now kept, P/K uncredited) in `48ecdd6`; F004 (Organic nutrients card showed the
  unsupported-DM explanation for a missing soil index; now names the missing P and/or K
  index) in `65bdedb`, reviewed at desktop and 390×844.
- Final task audit `audit-20260929T101524Z-8042` over `d38561c..65bdedb`: 0 Critical,
  0 High, 0 Medium, 0 Low. Full `npm test` (252 files, 4006 tests), typecheck and build
  passed on `65bdedb`.
- Follow-up CC-B4 opened for the pre-existing splashplate missing-index behaviour (not
  introduced by CC-B2). CC-B1 and CC-B3 remain open; CONF-01..04 and GAP-01..08 untouched.

## CC-B2 LESS low-index P/K correction — starting d38561c (2026-09-29)

Narrow production correction of RISK-01 / CC-B2; not Campaign C implementation.

- `resolveAvailableSlurryNutrients` spring and summer LESS branches now apply the
  existing Index 1/2 factors (P × 0.50 by P Index, K × 0.90 by K Index; N unchanged)
  through a shared `applyLowSoilIndexAvailability` helper that `slurryAvailableKgHa`
  (Table 9-8) also uses, unchanged in behaviour. `soilIndexAdjustmentApplied` now
  reports the real adjustment. Evidence: `CLM-OM-T2-NOTE`, `CLM-GB-9-8-FN3` (existing
  repository records only; no new retrieval or approval).
- LESS applicability unchanged (exact DM rows, SPRING/SUMMER only). Unknown soil index
  keeps its existing fail-closed plan semantics (placeholder index never reaches
  requirement/products/NAP/statutory outputs). Statutory manure value and NAP untouched.
  Per-nutrient index reading matches the existing Table 9-8 path; GAP-04 stays open.
- Reachability: `CONFIRMED_PRODUCTION_PATH` — `calculateNutrientPlan` →
  `NutrientsPageClient` (Nutrients), `orchestration/scientific-evidence-report`,
  `app/actions/what-matters-pilot` (What Matters economics), plus reports/finance/
  alerts/fertiliser-plan callers. Live user exposure: UNKNOWN.
- Tests: new CC-B2 regression block and plan-level cases in `nutrients.test.ts`.
- Audit `audit-20260929T081756Z-17754` remediation: F001 — `calculateNutrientPlan` now
  returns `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` for a LESS
  `availableNutrientAssessment` when a P or K index is missing (the Index-1 placeholder
  no longer yields an OK adjusted LESS credit; pre-existing Table 9-8 behaviour
  unchanged). F002 — implementation correction (LIFECYCLE §8): `NUTRIENT_ENGINE_VERSION`
  `nutrient_engine_v1.0.0` (affected; omitted the LESS Index 1/2 reduction) →
  `nutrient_engine_v1.1.0` (corrected); stored v1.0.0 records are not rewritten and are
  identifiable by that `calculationVersion`.
- Campaign C remains DRAFT; CC-B1 and CC-B3 remain open.

## Campaign C slurry science freeze — starting 29f787a (2026-09-28)

Research and specification only. No product, domain or schema change. Campaign B
behaviour is unchanged. Package: `campaign-c/`.

Campaign C used the repository's existing structured Teagasc evidence pack,
source-register metadata, recorded quotations and previously reviewed scientific
material. WebFetch and WebSearch were disabled for the run, so no fresh external-source
retrieval or independently verifiable source fingerprinting is claimed. External source
documents must be re-verified through an authorised evidence-ingestion workflow before
the rule set can become APPROVED.

- Froze DRAFT rule set `slurry-agronomy-ie-2026-v1`. Scope: cattle slurry, first-cut
  silage, spring (Feb–Apr) LESS, mineral soils, lab P/K, lab DM of exactly
  2/4/6/7%.
- Froze reference cases CC-001..018 with variants, plus the lifecycle contract.
- **Stopped for human review:** CONF-01, CONF-02, CONF-03 and GAP-01 (STOP 1, 2, 8).
- Found RISK-01/CC-B2: the existing LESS nutrient-credit path appears to omit the
  recorded Index 1/2 P/K availability reduction. Recorded for triage; not fixed.
- Added `src/domain/campaign-c-reference-cases.test.ts` (131 checks), covering the
  Campaign C draft reference-case data and relevant existing scientific functions.
- Production implementation remains **not authorised**.

## Agent harness token efficiency — starting b24c266 (2026-09-28)

Tooling/governance only. Campaign B remains frozen; Campaign C not started.
See `.agent/HARNESS_DIAGNOSIS.md` for the firsthand flow trace and measured context sizes.
Task manifest `.agent/TASK.json` pins the base. Replaced the implicit legacy baseline audit
and stale autopilot with the task workflow; retained independent primary/remediation/final
reviews, dependency expansion, all four quality checks and Critical/High blocking.
CLI JSON usage is recorded when exposed, otherwise UNKNOWN. Archived historical state/logs
byte-for-byte. Blocker index retains unresolved legacy constraints without declaring them closed.
Validation and audit outcome will be recorded at the final checkpoint.

Primary independent audit: one High (F001, conflicting mode flags could narrow final scope).
Fixed by rejecting conflicting modes, selecting the immutable task base for primary/final,
and validating final receipt base/head/clean state. Narrow independent before/after review
resolved F001 with 0 Critical/High; it did not repeat the primary audit.

Verification: 50 orchestration cases and 8 focused harness cases passed. Sandbox-independent
watchdog cleanup is covered directly. The expanded orchestration wrapper retains every case
with a 1180/1200-second allowance. An unchanged product test timed out under concurrent load
and passed all 15 tests in isolation; the final gate uses one test worker, with assertions and
product-test time limits unchanged. Final complete gate passed: 251 test files / 3846 tests; typecheck, lint and build PASS. Logs: `.agent/history/quality-20260928T195447Z-37358/`. Final independent audit is recorded after this commit in the task runtime receipt, which must match HEAD; no task may close without it.
