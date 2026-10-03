# Task: FV Session 2b — canonical product recommendation

Task ID: fv-session-2b-canonical-product-recommendation-20261003
Starting HEAD: 2a24b10f4c20eec3a5d959d4aef56859271631e1
Verify command: `npm run typecheck && npm run build`

## Programme goal

Fertiliser vertical: field nutrient requirement → slurry evaluation → remaining chemical requirement → chemical product recommendation → whole-farm aggregation → quote-ready basket. This session moves the chemical product recommendation onto the canonical remaining requirement (design `docs/farm-return-next/FERTILISER_VERTICAL_SLURRY_DESIGN.md` §3 row 2e, products part). No drift into unrelated work.

## Objective

Size the field's chemical fertiliser products (`purchasedProducts`, `deliveredKgHa`, `estimatedFieldCostEur`) from the canonical remaining requirement `NutrientPlan.fieldRemainingRequirement` instead of the paired `remainingN/P/K`, and make every consumer distinguish "no product needed" from "cannot recommend" so an unknown or not-applicable requirement is never presented as "no fertiliser needed".

## Authorised decisions (product owner, 2026-10-03)

- D3 = option (a): mixed P/K fields (one index known, the other missing) — products stay withheld, as today. Their canonical remaining requirement is still exposed; no blend is sized against an unknown requirement.
- Legacy paths retired: tillage fields and grazing fields with no recorded livestock or no usable grassland area stop receiving purchase figures sized from grassland tables; they carry the canonical status (NOT_APPLICABLE / UNKNOWN) instead. This changes production outputs and is authorised.
- D2 not authorised (no slurry rate recommendation). D4 / CC-B5: statutory buffer behaviour must not change.

## Scope

1. Engine (`src/domain/nutrients.ts`, `src/domain/types.ts`): add an explicit, additive per-field purchase status so no consumer infers meaning from an empty list. Rules (product-owner decisions 2026-10-03):
   - All three `fieldRequirement` arms KNOWN and all three slurry credit arms OK or NOT_APPLICABLE (no slurry) → products sized from the canonical `fieldRemainingRequirement` arms; status RECOMMENDED, or NONE_NEEDED when every remaining arm is known and zero.
   - All three requirement arms KNOWN, slurry planned, but the credit cannot be assessed at table level (LATE_SUMMER / unsupported timing, unsupported method, method conflict) → keep today's behaviour: products sized on the full requirement with no slurry credit counted (exactly today's figures); status RECOMMENDED_CREDIT_NOT_COUNTED (provisional, consistent with `requirementProvisional`).
   - Unresolved slurry composition → withheld, as today; status UNKNOWN with its reason.
   - Mixed P/K (one index missing) → withheld (D3 a); status WITHHELD_MIXED_EVIDENCE; canonical remaining still exposed.
   - Tillage → NOT_APPLICABLE; grazing with no recorded livestock or no usable grassland area → UNKNOWN with the canonical reason; no products (authorised retirement of the legacy grassland-table figures).
   Fully indexed fields must produce exactly the same products, delivered kg/ha and cost as today in every case, including the credit-not-counted cases (prove it with the existing 192-case baseline restricted to fully indexed cases, or an equivalent equality test). Do not change `allocatePurchasedProducts`, the product catalogue, prices or blend logic; never re-derive the credit or requirement.
2. Isolate the CC-B5 statutory buffer path: the buffer material decision must still see exactly the inputs it sees today (keep the legacy placeholder-sized provisional blend for that decision only, LEGACY_COMPATIBILITY_PATH), so `nationalBufferDistanceStatus` is unchanged for every case (CC-B5 regression tests pass unchanged).
3. Consumers of `purchasedProducts` / `deliveredKgHa` / `estimatedFieldCostEur` / the new status — `orchestration/prompt/fertiliser-recommendation.ts`, `domain/finance.ts` (farm demand), `domain/fertiliser-plan.ts`, `orchestration/fertiliser-plan/index.ts`, `lib/reports.ts`, `orchestration/scientific-evidence-report/index.ts`, `EvidenceReportPageClient.tsx`, `PurchasedFertiliserCard.tsx`, `NutrientsPageClient.tsx`, `domain/slurry-direct-economic-assessment.ts`: each must read the status, never treat UNKNOWN / NOT_APPLICABLE / WITHHELD as "nothing needed", and keep its existing behaviour for fully indexed fields. Farm aggregation counts non-recommendable fields as blocked/not applicable, never as zero demand.
4. Full contract-change protocol in `docs/farm-return-next/DOMAIN_CONTRACTS.md` (breaking for the retired legacy outputs): `contracts_frozen` false for this change's audit cycle (the close-out commit after a clean audit restores it). Engine version bump `nutrient_engine_v1.4.0` → `nutrient_engine_v1.5.0`; stored records not rewritten; version assertions updated; the digest baseline normalises only `calculationVersion` and excludes only new fields.
5. Docs: design status, BUILD_STATE `fertiliser_vertical`, IMPLEMENTATION_LOG (list every changed production output: which field kinds, before → after).

## Out of scope

Mixed-field purchasing (D3 b/c), slurry rate recommendation, whole-farm aggregation UI redesign, quote basket, supplier workflow, statutory/NAP/buffer changes, share caps, 90 kg K, selector, slurry science, catalogue/prices, GPS, news, alerts, CC-B3 migration, harness/tooling, push/deploy.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files). If a quick check script cannot be run, rely on repository tests. Presentation-state selection in pure tested helpers; no calculation in components.

## Acceptance criteria

- Fully indexed fields: products, delivered kg/ha, cost and every other existing output identical to today (except `calculationVersion`), including slurry-credit-not-assessable cases, which carry RECOMMENDED_CREDIT_NOT_COUNTED and are shown as provisional by every consumer.
- Mixed fields: no products, status WITHHELD_MIXED_EVIDENCE, remaining requirement still exposed.
- Tillage: no products, NOT_APPLICABLE; no-livestock / no-grassland-area grazing: no products, UNKNOWN with reason.
- No consumer presents an UNKNOWN / NOT_APPLICABLE / WITHHELD field as "nothing needed" or as zero demand (prompt, farm demand, reports, cards).
- Statutory/NAP/buffer outputs unchanged for every case (CC-B5 regression cases pass).
- Typecheck, build and targeted tests pass; no unresolved Critical/High; nothing pushed.

## Required tests

Engine: fully indexed equality (products, delivered, cost) across the existing matrix, including LATE_SUMMER / unsupported-method / method-conflict credit cases (RECOMMENDED_CREDIT_NOT_COUNTED); unresolved composition → UNKNOWN; mixed → withheld; tillage → not applicable; no livestock / no grassland area → unknown; all-zero remaining → NONE_NEEDED; buffer regression unchanged. Consumers: prompt (no "nothing recommended" for unknown/not-applicable/withheld), farm demand counting, CSV, Evidence Report, cards — driven by real `calculateNutrientPlan` output.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if fully indexed products would change, if statutory/buffer outputs would change, if a new scientific interpretation is needed, if a migration is required, or if scope expands into mixed-field purchasing or quoting.
