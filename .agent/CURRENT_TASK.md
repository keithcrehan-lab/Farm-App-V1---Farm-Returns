# Task: FV Session 4 — quote request workflow

Task ID: fv-session-4-quote-request-workflow-20261005
Starting HEAD: 1e92b1e22621244c0d59adc3b09b2eb06c96ec2b
Verify command: `npm run typecheck && npm run build`

## Programme goal

Finish the Farm Return fertiliser vertical end-to-end: field nutrient requirement → slurry evaluation → remaining chemical requirement → chemical product recommendation → whole-farm aggregation → quote-ready basket → quote request. Sessions 1–3 are complete. This session turns the canonical `FarmFertiliserQuoteBasket` into a real farmer-facing quote-request workflow. Do not reopen nutrient science, slurry science, product selection or aggregation unless a genuine correctness defect is discovered.

## Current canonical state

Nutrient engine `nutrient_engine_v1.5.0`. Canonical farm purchasing: `aggregateFarmFertiliserPurchasing` → `FarmFertiliserAggregation` (`farm_fertiliser_aggregation_v1.0.0`). Canonical quote basket: `buildFarmFertiliserQuoteBasket` → `FarmFertiliserQuoteBasket` (`src/domain/fertiliser-plan.ts`), states READY / READY_WITH_PROVISIONAL_ITEMS / INCOMPLETE; it already carries product identity, N-P-K analysis, exact aggregate quantity, unit, estimated cost or null, field contribution count, provisional flag, unresolved-field summary, currency and calculation/version references. The UI's "Prepare quote" action (`FarmFertiliserPurchaseRequirementCard`) opens a read-only basket review. Existing quote code to trace and reuse: `src/orchestration/quotes/`, `RequestQuoteSheet`, `src/app/(app)/quotes`, `src/lib/farm-data/supplier-quotes.ts`.

## Objective

Create the complete farmer workflow for turning a canonical quote basket into a fertiliser quote request: review the basket; confirm/edit allowed commercial quantities; enter or select quote-request details; choose suppliers where existing architecture supports it; create the request; review exactly what is being requested; submit/send through an existing safe delivery mechanism if one exists, otherwise reach a complete internally recorded READY_TO_SEND state without inventing an external integration. Quote creation never recalculates nutrient requirements or product recommendations.

Core principle: the scientific calculation ends at the canonical basket; the quote layer is commercial. It may change requested purchasing quantities, supplier recipients, delivery details, notes and quote metadata. It must NOT change field nutrient requirement, slurry evaluation, product recommendation or the canonical farm requirement. If the farmer adjusts a quantity, preserve both the canonical requirement and the farmer-requested quantity; never overwrite the canonical calculation.

## Scope

Quote-request contract (create or reuse; use existing identifiers/types; no needless duplication), conceptually: request ID; basket/version reference; calculation engine/version reference; created timestamp; farmer/farm identifier where available; products with canonical quantity, requested quantity, unit, N-P-K analysis, estimated price where available, currency, provisional flag; basket completeness state; supplier recipients where applicable; delivery/location information where already available; farmer note; request status; submission/delivery metadata.

Lifecycle: use existing lifecycle concepts if suitable, otherwise at minimum DRAFT, READY_TO_SEND, SENT, FAILED, CANCELLED. SENT only after an actual external delivery action succeeded; with no sending integration the workflow ends at READY_TO_SEND; never fake supplier contact.

Basket eligibility: READY may proceed. READY_WITH_PROVISIONAL_ITEMS may proceed, with the farmer clearly told that one or more quantities rest on existing provisional nutrient-credit treatment. INCOMPLETE must never be presented as a final whole-farm requirement: favour existing product conventions — either block final submission or explicitly allow a partial quote request containing only known products, labelled partial, listing unresolved fields and preserving the incomplete status, never implying whole-farm coverage. Do not invent a policy if repository/product design already specifies one; if a product-policy decision is genuinely required, STOP and ask.

Commercial quantity editing: if implemented, always keep canonical calculated quantity and requested purchasing quantity separately; never mutate the canonical basket; never silently round down below the calculated requirement; reuse the existing 0.01 t purchase rounding where applicable; no bag/package rules (package sizes unavailable). Product identity stays product name + N-P-K analysis (no catalogue product ID) — do not create arbitrary IDs implying catalogue authority. kg is the canonical quantity basis; tonnes displayed with existing purchase rounding; bags unavailable.

Supplier handling: trace existing supplier/quote/contact/RFQ/group-buy code first and reuse it; if supplier records exist allow selection from them; otherwise create only the minimum provider-neutral recipient/contact structure. No marketplace, no large supplier-management system.

External sending: trace whether the repository already has email infrastructure, a server-side mail provider, supplier API, RFQ integration or webhook boundary. If a suitable integration exists, use it through the existing server-side boundary (secrets server-side) and record attempted timestamp, recipient, success/failure and provider reference. If none exists, do NOT add a new external provider: create the provider-neutral submission contract, the final request preview, READY_TO_SEND, optionally an existing safe export/copy mechanism consistent with the app, and record external delivery as a deferred integration. Never claim the request was sent.

Farmer-facing workflow on the existing "Prepare quote" action: Step 1 review requirement (products, analysis, canonical quantity, requested quantity where editable, provisional markers, known estimated cost, unresolved fields); Step 2 quote details where available (suppliers, delivery area/address, requested delivery date/period, farmer note, contact) — do not require fields the app cannot support; Step 3 final review showing exactly what the supplier will receive (each product, quantity, unit, delivery/request details, provisional/partial status); Step 4 submit — "Request quote" only if external delivery exists, otherwise truthful wording such as "Prepare quote request" / "Ready to send"; no fake success state.

Quote content: a deterministic human-readable quote-request representation a supplier can quote from without Farm Return internals (e.g. "Farm Return fertiliser quote request — Product: 18-6-12 — Quantity: 2.40 tonnes … Delivery … Notes …"); calculation/evidence versions as metadata, not supplier prose.

Persistence: trace existing data/persistence architecture first; use an existing quote/request persistence model if suitable. A small forward-only migration is allowed only if genuinely necessary to persist quote requests, does not modify nutrient/science tables, follows project migration/RLS conventions, and is Dev-only; never deploy or run against production. Prefer the narrower implementation if durable persistence can safely be deferred while the UI/domain workflow is complete. Do not create CC-B3.

Duplicate submissions: disable repeated submit while in flight; stable request ID; never multiple SENT records from one UI action; no distributed idempotency project unless an existing API requires it.

Error handling: incomplete basket; missing supplier/contact details; missing required delivery details; malformed, zero or negative requested quantity; missing product identity; external submission failure; persistence failure. Errors never corrupt the canonical basket; failed submissions stay retryable where the architecture supports it.

Reports/AI context: no broad redesign; update consumers only where needed to distinguish quote not prepared / draft / ready to send / sent / failed; do not expose contact details unnecessarily in AI context.

Documentation: BUILD_STATE, IMPLEMENTATION_LOG, Fertiliser Vertical status/design, domain contracts where quote-request contracts are introduced. Document the lifecycle, canonical vs requested quantities, provisional/incomplete handling, supplier submission boundary, external sending capability or its explicit absence, persistence behaviour, and next/final session requirements.

## Out of scope

Supplier marketplace; competitive bid comparison; group buying; payment; invoicing; order fulfilment; live product pricing; delivery tracking; N-only mixed-field policy; recommended slurry rate; CC-B5; CC-B3; GPS; news; task-ID tooling fix; stash cleanup; unrelated UI redesign. No nutrient science, product-selection, aggregation or statutory change.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files). If a quick check script cannot be run, rely on repository tests. Presentation-state selection in pure tested helpers; no calculation in components. Targeted tests during implementation; the full suite once at the end if project rules require it.

## Acceptance criteria

Canonical quote request exists, derived only from FarmFertiliserQuoteBasket; no nutrient recalculation; canonical and requested quantities distinct; READY basket can progress; provisional basket visibly provisional; incomplete basket cannot masquerade as complete; farmer can review exact quote content; supplier details attachable where supported; explicit lifecycle; SENT only after real delivery; no fake external integration; failure states safe; quote UI usable from the existing Prepare quote flow; nutrient science and statutory behaviour unchanged; targeted tests, typecheck, lint and build pass; full suite if required; no unresolved Critical/High; nothing pushed.

## Required tests

1 READY basket → request can be created; 2 READY_WITH_PROVISIONAL_ITEMS preserves provisional status; 3 INCOMPLETE cannot masquerade as complete; 4 partial request (if supported) stays explicitly partial; 5 canonical quantity preserved; 6 requested quantity stored separately; 7 requested quantity cannot mutate the canonical requirement; 8 zero quantity rejected; 9 negative quantity rejected; 10 product identity preserved; 11 estimated cost stays an estimate; 12 missing price never €0; 13 final preview matches the request payload; 14 supplier recipient preserved where supplied; 15 no supplier integration → READY_TO_SEND, not SENT; 16 successful real delivery (if implemented) → SENT; 17 failed external delivery → FAILED and retryable; 18 duplicate-click protection; 19 no nutrient calculation during quote creation; 20 no statutory output change; 21 field/product/farm canonical calculations unchanged.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> only if: quote creation requires recalculating nutrient science; a new fertiliser recommendation rule is required; an external provider must be invented/selected without prior architecture; supplier submission requires unavailable credentials/infrastructure; a regulatory/scientific decision is needed; completing the workflow would materially expand into marketplace/payment/order fulfilment; a genuine product-policy decision (e.g. partial requests) is required that repository design does not answer. Lack of an external sending provider alone is NOT a blocker — finish through READY_TO_SEND. Otherwise continue until complete.
