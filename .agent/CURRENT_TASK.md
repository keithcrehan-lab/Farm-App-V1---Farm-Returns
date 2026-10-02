# Task: Per-nutrient P/K Increment 5a — show known P or K on the Nutrients cards

Task ID: per-nutrient-p-k-increment-5a-show-known-p-or-k-on-the-nutrients-cards-20261002
Starting HEAD: 7864c9ece15fcfbb54b477522d9b4be7e1310d87
Verify command: `npm run typecheck && npm run build`

## Objective

Implement the first part of Increment 5 of `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md`
(§4 row 5, "5a"): on the Nutrients page, show a known P (or K) requirement and slurry credit for a
field whose other soil index is missing, using the per-nutrient fields from Increments 1–3, with the
product owner's D3 wording (decided 2026-10-02). UI/content only.

## D3 wording (product owner, 2026-10-02 — use exactly; mirror for K known / P missing)

Nutrient requirement card, P known / K missing:
- values: N and P from `requirementByNutrient`; K shown as "—" (never 0);
- pill: "P shown · K needs a soil test";
- line: "K requirement isn't shown because this field's soil K Index is missing. Add a soil test
  to complete the plan."

Organic nutrients card, P known / K missing (slurry allocated):
- slurry credit values: N, P from `organicApplication.availableNutrientByNutrient` (rounded for
  display, as the card rounds today); K shown as "—" (never 0);
- pill: "N and P credit included";
- line: "K credit isn't counted until the soil K Index is recorded."

## Scope

- `src/components/farm/NutrientRequirementCard.tsx` and `src/components/farm/OrganicNutrientsCard.tsx`.
- Put the state/label selection in one small pure, tested presentation helper under `src/lib/`
  (no agronomy/financial calculation in components; it only reads the per-nutrient outcomes).
- Mixed state = exactly one of `fertilityEvidenceByNutrient.p` / `.k` is OK.
- Requirement card mixed state: no "Total for field" NPK sum (an unknown must not be summed as
  0) — omit the total. Keep the existing status/source/version badges, taken from the known arms.
- Organic card: keep CC-FU-A behaviour for the neither-index case ("N credit included"); in the
  mixed case use the D3 pill/line instead of "Not yet assessed". Also, in any missing-index state,
  show "—" (not 0) for a withheld P/K slurry credit.
- Fully indexed fields and no-index fields: unchanged except the "—" for withheld credit above.
- `PurchasedFertiliserCard`, NAP card, buffer, purchasing: unchanged (D1 option a: no products
  while either index is missing).
- Update the design's §6 Status ("Increment 5a done"), record D3 in §5, minimal IMPLEMENTATION_LOG.

## Out of scope

- CSV export, Evidence Report, fertiliser prompt (Increment 5b); any domain/engine change;
  `requirementProvisional` (frozen); decisions D1/D2/D4; CC-B5; migrations; harness; push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository (this session cannot delete
  files). If a quick check script cannot be run, rely on repository tests.

## Acceptance criteria

- Mixed fields (P-only, K-only, Index 1–4): the cards show the known values and D3 wording; the
  unknown nutrient is "—"; no NPK total; no number derived for the unknown nutrient anywhere.
- Fully indexed and no-index fields render as today (apart from "—" for withheld credit).
- No React component contains a calculation; the helper is pure and tested.

## Required tests

- Helper unit tests (all states). Component tests rendering the cards from real
  `calculateNutrientPlan` output for P-only, K-only, both, neither (the existing
  `slurry-credit-messaging.test.tsx` pattern), asserting values, "—", D3 text, no total in mixed
  state, and unchanged output for fully indexed fields. Existing card tests pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if a domain/engine change is needed, if the D3 text cannot be shown
truthfully for a state, or if a fully indexed field's display would change beyond "—" for withheld credit.
