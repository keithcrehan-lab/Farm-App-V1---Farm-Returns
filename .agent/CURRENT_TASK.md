# Task: FV Session 3b — farm aggregation and quote basket

Task ID: fv-session-3b-farm-aggregation-and-quote-basket-20261003
Starting HEAD: cd9b315a162f81dea710e60292fe4f9110039fcc
Verify command: `npm run typecheck && npm run build`

## Programme goal

Finish the Farm Return fertiliser vertical end-to-end: field nutrient requirement → slurry evaluation → remaining chemical requirement → chemical product recommendation → whole-farm aggregation → quote-ready basket. Sessions 1 and 2 are complete. This session completes the whole-farm purchasing layer using the now-canonical field-level outputs. Do not reopen field science unless a genuine correctness blocker is discovered.

## Current canonical state

Engine `nutrient_engine_v1.5.0`. Chemical product recommendation runs on the canonical remaining requirement. Each field exposes `NutrientPlan.purchaseStatus` (`FieldPurchaseStatus`): RECOMMENDED, RECOMMENDED_CREDIT_NOT_COUNTED, NONE_NEEDED, PROHIBITED, WITHHELD_MIXED_EVIDENCE, UNKNOWN, NOT_APPLICABLE. Consumers already understand these statuses. Fully indexed supported fields preserve prior valid product outputs. Legacy compatibility paths remain internal only for CC-B5 buffer behaviour and the NAP delivered-supply total — do not modify them.

## Objective

Build one canonical whole-farm fertiliser aggregation and quote-ready basket. The farmer sees: what products are required; total quantity of each; which fields contribute; estimated total cost; which fields are excluded from purchasing and why; provisional fields separately identified; a quote-ready representation of the supported purchasing requirement. Aggregation and basket preparation only — no external supplier messaging, payment, marketplace or group-buy infrastructure.

Core principle: whole-farm purchasing is derived from canonical field-level purchase outputs (field purchaseStatus + field purchasedProducts → canonical farm aggregation → quote-ready basket). Do not recalculate nutrient requirements or product selection at farm level. No second purchasing engine.

## Scope

Canonical aggregation contract (create or reuse a whole-farm aggregation type) distinguishing:
- Included fields: RECOMMENDED, RECOMMENDED_CREDIT_NOT_COUNTED — may contribute purchasable quantities.
- No-purchase fields: NONE_NEEDED — contribute no quantity; remain visible as genuinely requiring no purchase.
- Excluded/unresolved fields: PROHIBITED, WITHHELD_MIXED_EVIDENCE, UNKNOWN, NOT_APPLICABLE — contribute no quantity; remain visible with explicit reason/status; never silently omitted in a way implying completeness.

Product aggregation: aggregate identical products across included fields (by stable product ID if one exists, never by display name alone). Per product: canonical identity, name, N-P-K analysis where available, total raw required quantity, unit, field contributions, estimated product cost, provisional/verified status where relevant.

Field contribution traceability: per aggregated product, a field breakdown (field → quantity); compact/collapsible UI is fine; no opaque totals.

Quantity handling: use existing canonical field purchase quantities; determine what the product recommendation represents (product kg etc.); aggregate the most precise existing quantity; do not round each field then sum if that changes the farm requirement materially; derive farmer-facing kg/tonnes; bags only if catalogue metadata has package size, otherwise record bag conversion as unavailable — do not invent package sizes. Preserve unrounded aggregation internally; display rounding must never go below the canonical aggregate; reuse an existing verified purchase-rounding rule if one exists; no new commercial rounding rule.

Cost: farm-level estimated cost from existing canonical product prices only; per product and total; a missing/invalid price is never €0 — cost is partially unknown with the affected product identified.

Provisional: RECOMMENDED_CREDIT_NOT_COUNTED contributes products but is visibly provisional; farm totals indicate a provisional contribution; preserve the existing reason (planned slurry credit not counted). Mixed/unresolved: WITHHELD_MIXED_EVIDENCE contributes nothing; surface e.g. "2 fields require more information before fertiliser can be included"; no speculative quantity; no D3 N-only purchasing. PROHIBITED: nothing, reason preserved, no statutory reinterpretation. NONE_NEEDED: nothing, explicitly distinct from UNKNOWN/WITHHELD/PROHIBITED/NOT_APPLICABLE. Tillage/NOT_APPLICABLE: not in grassland demand, no placeholder quantities.

Quote-ready basket: canonical basket derived from the farm aggregation with enough information for a future supplier quote request without recalculation: farm/basket identifier if an existing suitable ID exists; calculation/engine version; creation timestamp if the architecture supports it; product identity; analysis; aggregate quantity; unit; estimated cost where available; field contribution count; provisional flag; unresolved-field summary; currency; evidence/calculation version references already available. No supplier-specific integration.

Basket status (use better existing names if the architecture has them): READY (all purchasing-relevant fields resolved, all included products supported); READY_WITH_PROVISIONAL_ITEMS (one or more contributions provisional); INCOMPLETE (one or more purchasing-relevant fields UNKNOWN or WITHHELD). Never READY merely because some products aggregate. An INCOMPLETE basket still shows the known subtotal, clearly stated as incomplete, never presented as the final whole-farm requirement.

UI: use the existing fertiliser plan / farm-demand surface; no app redesign. Show a farm fertiliser requirement summary (product, quantity, cost, field count; total estimated cost) with fields needing no fertiliser, fields excluded/prohibited, fields awaiting evidence and provisional contributions; compact summary with drill-down. Add a farmer-facing "Prepare quote" action (or existing quote/request terminology) that creates/opens/reviews the canonical basket only — no email, external API, RFQ submission, marketplace or payment.

Existing farm demand already reads purchaseStatus: trace it first; reuse it if fundamentally correct; do not build a second farm-demand model if a narrow change makes it canonical; identify, replace and test any legacy assumptions. Trace consumers of farm demand, product totals, estimated fertiliser cost, quote/basket state, reports and prompts; ensure none can count UNKNOWN as zero, treat withheld fields as complete, double-count products, or double-count slurry-adjusted requirement.

Documentation: BUILD_STATE, IMPLEMENTATION_LOG, fertiliser vertical design/status, domain contracts where canonical aggregation/basket contracts are introduced. Document the canonical farm aggregation source, basket status semantics, treatment of each purchaseStatus, provisional handling, incomplete subtotal behaviour, legacy farm-demand paths retired or retained, and the next session dependency. Also log (do not fix) the agent-start limitation: task IDs are truncated at 80 characters, so distinct long titles can collide (it fails safely with TASK_ID_EXISTS).

## Out of scope

External supplier submission; email quote requests; group-buy marketplace; payment; supplier comparison; price negotiation; live pricing API; N-only mixed-field purchasing; autonomous slurry-rate recommendation; D2 selector; CC-B5; CC-B3 migration; GPS; news; unrelated UI work; agent-start tooling fix. No nutrient science, product-selection, statutory or migration change.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files). If a quick check script cannot be run, rely on repository tests. Presentation-state selection in pure tested helpers; no calculation in components. Run targeted suites during implementation; the full suite once at the end if repository rules require it.

## Acceptance criteria

Canonical whole-farm product aggregation exists, derived from field purchasedProducts and purchaseStatus; quantities aggregate correctly; field traceability retained; farm cost without fake zero prices; NONE_NEEDED distinct from unresolved/excluded; provisional contributions visible; mixed/unknown fields create no speculative demand; basket status distinguishes ready/provisional/incomplete; quote-ready basket exists and can be reviewed in the UI; no external supplier integration; no nutrient science or statutory changes; targeted tests, typecheck and build pass; full suite passes if required; no unresolved Critical/High; nothing pushed.

## Required tests

Deterministic tests: 1 two fields with the same product aggregate correctly; 2 different products stay separate; 3 field quantities sum exactly; 4 NONE_NEEDED contributes zero and stays identified; 5 WITHHELD_MIXED_EVIDENCE contributes nothing and makes the basket incomplete; 6 UNKNOWN likewise; 7 PROHIBITED contributes nothing; 8 NOT_APPLICABLE contributes nothing; 9 RECOMMENDED_CREDIT_NOT_COUNTED contributes and makes provisional state visible; 10 all-supported farm → READY; 11 provisional contribution → READY_WITH_PROVISIONAL_ITEMS; 12 unresolved purchasing field → INCOMPLETE; 13 known subtotal visible for INCOMPLETE; 14 unknown price never €0; 15 identical products neither double-count nor split; 16 field traceability preserved; 17 aggregation uses canonical purchasedProducts and purchaseStatus; 18 no nutrient calculation repeated at farm level; 19 no statutory output change; 20 existing fully indexed field recommendations unchanged.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> only if: farm aggregation cannot be based on canonical purchasedProducts without changing nutrient science; a new product-selection rule is required; a new statutory interpretation is required; product quantities cannot be aggregated without an undefined commercial rule; a database migration is required for the minimum viable basket; external supplier behaviour is required; completing the work would materially expand outside aggregation/basket preparation. Otherwise continue until complete (fix defects, failing targeted tests, Critical/High findings, consumer updates, docs).
