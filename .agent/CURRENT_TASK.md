# Task: Fertiliser Vertical Completion — Session 1: farmer-facing slurry diagnostic

Task ID: fertiliser-vertical-completion-session-1-farmer-facing-slurry-diagnostic-20261002
Starting HEAD: bcb625ae646dbc78ff647a421eb55c193135c7ff
Verify command: `npm run typecheck && npm run build`

## Programme goal

Finish the Farm Return fertiliser vertical end-to-end: field nutrient requirement → slurry evaluation/allocation → remaining chemical requirement → chemical product recommendation → whole-farm aggregation → quote-ready basket. This session must move that chain forward and must not drift into unrelated work.

## Current status

Already complete: canonical per-field N/P/K requirement (`NutrientPlan.fieldRequirement`); independent P/K unknown semantics; canonical remaining requirement (`fieldRemainingRequirement`); slurry rate-allocation layer `slurry_rate_allocation_v0.3.0-draft` (`src/domain/slurry-rate-allocation.ts`, `buildSlurryRateAllocation`) with exact unrounded comparisons, explicit organic excess over requirement, mixed P/K evaluation; no production output changes yet. The allocation layer remains unwired and has `affectsProductionOutput: false`. Design: `docs/farm-return-next/FERTILISER_VERTICAL_SLURRY_DESIGN.md` (this is its Increment 2d).

## Objective

Complete the farmer-facing read-only per-field slurry diagnostic. For each field the farmer must see: current planned slurry application; nutrient contribution from that slurry; field nutrient requirement; remaining nutrient requirement after slurry; excess nutrient where applicable; unknown states independently by nutrient. This is an evaluation of the farmer's planned slurry. It is NOT an autonomous slurry-rate recommendation.

## Authorised decisions

- D1 — authorised: the read-only slurry diagnostic may be exposed to the farmer.
- D2 — not authorised: do NOT generate or prescribe a recommended slurry rate; evaluate only the farmer's existing/planned rate.
- D3 — deferred: do not build mixed-field chemical product purchasing.
- D4 — do not change current Campaign B statutory-buffer behaviour; keep any legacy compatibility path isolated.

## Scope

Wire the existing canonical field requirement and slurry rate-allocation output into the existing Nutrients / field detail experience. Do not duplicate domain calculations in the UI; the UI consumes canonical outputs. Where supported, show:
- Planned slurry: m³/ha; total slurry volume for the field; slurry DM/basis/provenance where already available.
- Nutrient contribution: N, P, K independently.
- Field requirement: N, P, K independently.
- Remaining after slurry: N, P, K independently.
- Excess: where planned slurry exceeds a known nutrient requirement, show the excess explicitly; do not clamp it to zero; do not label an excess as illegal, unsafe or prohibited unless an existing verified rule supports that wording.

Unknown semantics — UNKNOWN IS NEVER ZERO: P known/K unknown → show P result, K unknown; P unknown/K known → show K, P unknown; both unknown → both unknown; N independent. Do not block the entire diagnostic because one nutrient is unknown.

No planned slurry: show a concise state such as "No slurry planned"; do not invent a rate; do not imply slurry should be spread.

Unsupported / not evaluated (e.g. tillage): use the domain layer's existing status; no UI fallback calculations.

Wording — do not say: "Recommended slurry rate", "You should spread", "Approved", "Safe to spread", "Legal to spread". Preferred: "Planned slurry", "Slurry contribution", "Remaining requirement", "Evaluation", "Nutrient excess".

## Out of scope

Recommended slurry-rate selector; chemical product recommendation; whole-farm aggregation; quote basket; supplier workflow; GPS; news; alerts; CC-B3 migration; unrelated UI redesign; harness/tooling work. Must not alter: field nutrient requirement; slurry nutrient science; chemical fertiliser requirement; product recommendation; statutory buffer logic; share caps; 90 kg K interpretation; slurry selector science. No new provisional rule may become active.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files). If a quick check script cannot be run, rely on repository tests. Put presentation-state selection in a small pure, tested helper under `src/lib/` (as `nutrient-card-presentation.ts` does); components only render.

## Acceptance criteria

Farmer-facing slurry diagnostic exists; uses canonical outputs; planned slurry contribution visible; remaining N/P/K visible; mixed known/unknown nutrients independent; unknown never zero; excess visible; no autonomous slurry-rate recommendation; no statutory or nutrient-calculation behaviour change; targeted tests, typecheck and build pass; no unresolved Critical/High; nothing pushed.

## Required tests

Deterministic tests, preferably component tests consuming real canonical domain outputs (`calculateNutrientPlan` → `buildSlurryRateAllocation`): 1 complete field with planned slurry; 2 no planned slurry; 3 P known/K unknown; 4 P unknown/K known; 5 both P and K unknown; 6 known nutrient excess displayed; 7 no excess; 8 tillage/NOT_EVALUATED; 9 unsupported case; 10 unknown never rendered as zero; 11 no autonomous recommendation wording; 12 no duplicate calculation logic in UI; 13 existing Nutrients page behaviour unaffected outside this slice.

Visual review: if existing dev data naturally provides a suitable field, review it; do not mutate farm data. Otherwise record VISUAL_REVIEW_OUTSTANDING (the build agent cannot drive a browser; the reviewer will check afterwards).

## STOP conditions

BUILD_RESULT: BLOCKED <reason> only if: wiring the diagnostic would change underlying production calculations; a new scientific interpretation is required; statutory behaviour would change; canonical outputs cannot support the UI without redesigning frozen contracts; implementation would require a migration; scope expands into product purchasing or quoting.
