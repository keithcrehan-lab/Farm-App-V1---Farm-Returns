# Task: FV Session 5 — end-to-end QA and v1 freeze

Task ID: fv-session-5-end-to-end-qa-and-v1-freeze-20261006
Starting HEAD: 2c580371c7462421eb69b32146367b6df91fb8fe
Verify command: `npm run typecheck && npm run build`

## Programme goal

Formally complete and freeze Fertiliser Vertical v1. Completed flow: field nutrient requirement → slurry evaluation → remaining chemical requirement → chemical product recommendation → whole-farm aggregation → quote-ready basket → quote-request preparation. Sessions 1–4 are complete. This is NOT a new feature phase: prove the full vertical works coherently end-to-end, fix genuine cross-layer defects, remove only obsolete compatibility code that is now safe to remove, and mark Fertiliser Vertical v1 complete. No new science, commercial features or infrastructure.

Canonical contracts: nutrient engine `nutrient_engine_v1.5.0`; `FarmFertiliserAggregation` (`farm_fertiliser_aggregation_v1.0.0`); `FarmFertiliserQuoteBasket`; `FertiliserQuoteRequest` (`fertiliser_quote_request_v1.0.0`); quote lifecycle DRAFT → READY_TO_SEND → SENT / FAILED / CANCELLED. No external supplier-delivery provider exists; nothing is SENT unless a future provider records delivery.

## Objective

Validate the entire fertiliser workflow across representative farm states. Fix only defects that break scientific correctness, canonical data flow, purchase correctness, aggregation correctness, quote correctness, farmer-facing truthfulness or status propagation. When complete: all critical paths agree; no layer reinterprets UNKNOWN as zero; no consumer recalculates nutrient requirements or bypasses canonical purchasing/aggregation; quote preparation uses canonical basket values; v1 documented COMPLETE.

## Scope

Deterministic end-to-end tests/fixtures (real `calculateNutrientPlan` → field purchase → `aggregateFarmFertiliserPurchasing` → `buildFarmFertiliserQuoteBasket` → `createFertiliserQuoteRequestDraft` → final review text):
- A fully supported grassland farm (multiple fields, valid indices, livestock/grassland context, planned slurry where applicable, supported products): field requirement → slurry contribution → remaining → products → aggregation → basket → request; all quantities reconcile.
- B no slurry planned: requirement correct; no fabricated slurry contribution; remaining correct; products, aggregation and basket correct.
- C provisional slurry credit (RECOMMENDED_CREDIT_NOT_COUNTED): contributes to demand; provisional propagates; basket READY_WITH_PROVISIONAL_ITEMS; request keeps the provisional warning; no false verified wording.
- D mixed P/K (WITHHELD_MIXED_EVIDENCE): no unsafe blend; known nutrient evidence preserved; no speculative quantity; basket INCOMPLETE; known subtotal visible; any request explicitly partial.
- E unknown field: UNKNOWN never 0; no fabricated demand; basket INCOMPLETE; reason propagates.
- F NONE_NEEDED: recognised as assessed; no product; not confused with UNKNOWN; farm can still be READY.
- G PROHIBITED: no product; reason survives to aggregation; no statutory rule recalculated at farm/quote level.
- H NOT_APPLICABLE / tillage: no grassland purchase fabricated; excluded correctly; no misleading "no fertiliser needed" wording.
- I no livestock / no usable grassland: no legacy fabricated purchase returns; canonical UNKNOWN survives.
- J unknown product cost: quantity kept; cost null; known costs available; total never converts unknown to €0.
- K farmer edits requested quantity: canonical unchanged; requested stored separately; requested-below-canonical warning works; quote text reflects requested quantity; requirement untouched.
- L incomplete + provisional: both warnings propagate simultaneously through aggregation → basket → request → final review text (previous cross-layer defect; pin end-to-end).

Global invariants to assert: UNKNOWN never zero; only the canonical nutrient engine determines requirement (aggregation and quote creation never recompute need); whole-farm totals derive only from field purchaseStatus + purchasedProducts; canonical quantity immutable, requested quantity separate; the seven purchase statuses never collapse into the same meaning; basket integrity (READY no unresolved purchasing fields; READY_WITH_PROVISIONAL_ITEMS resolved with a provisional contribution; INCOMPLETE at least one UNKNOWN / WITHHELD / malformed field); quote integrity (INCOMPLETE → partial; provisional → provisional; no external delivery → never SENT).

Legacy-path review: trace remaining fertiliser legacy paths and categorise each as REQUIRED_COMPATIBILITY, SAFE_TO_REMOVE or BLOCKED_BY_FUTURE_DECISION (expected: CC-B5 buffer path; NAP internal path; D3 mixed purchasing; D2 recommended slurry rate; CC-B3 persistence). Remove only code that is unquestionably superseded and covered by tests; if uncertain retain and document why.

UI consistency review of the core surfaces only (Nutrients / field requirement, slurry diagnostic, fertiliser plan, farm fertiliser requirement, quote basket, quote request flow): fix genuine semantic contradictions (e.g. "nothing needed" vs UNKNOWN, field vs farm quantities differ, provisional warnings disappear, basket vs quote totals differ, stale legacy labels). No redesign.

Medium F002 (Session 4 deferred): Back from final review → details clears entered quote details. Fix if reproducible, with a regression test; no persistence beyond this UI-state fix.

Visual review: the build agent cannot drive a browser — record what needs visual review; the reviewer will attempt it afterwards. Use deterministic component/end-to-end tests and record limitations (VISUAL_REVIEW_NOT_REPRODUCIBLE_WITH_CURRENT_DEV_DATA where applicable); this alone does not block v1.

Documentation: BUILD_STATE, IMPLEMENTATION_LOG, Fertiliser Vertical design/status, relevant domain contracts; a concise final closure section stating `FERTILISER_VERTICAL_V1: COMPLETE` with the completed capability chain, canonical contracts/versions, post-v1 deferrals, compatibility paths and evidence that end-to-end QA passed. Do not claim deferred capabilities are complete.

## Out of scope

Durable quote persistence (browser-session state accepted for v1; no migration); email/provider/RFQ sending (READY_TO_SEND sufficient); agent-start task-ID issue; harness/tooling; CC-B3; GPS; news; stash cleanup (the reviewer checks it). Post-v1 deferrals, documented, not built: autonomous recommended slurry rate; D3 N-only/mixed purchasing; CC-B5 redesign; CC-B3; durable quote persistence; supplier email/API; marketplace/group buying; payment; GPS; package-size/bag conversion; live pricing. No new science; nutrient science and statutory behaviour unchanged unless fixing a proven implementation defect.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files). If a quick check script cannot be run, rely on repository tests. Targeted tests while fixing; the full suite once at final verification.

## Acceptance criteria

Representative end-to-end scenarios pass; field → farm → basket → quote quantities reconcile; UNKNOWN never zero; status propagation correct; no duplicate nutrient/purchasing engine; canonical vs requested quantities separate; provisional + incomplete warnings survive end-to-end; F002 fixed if reproducible; no farmer-facing semantic contradiction in the core flow; nutrient science and statutory behaviour unchanged; no new unsupported science; targeted tests, typecheck, lint, build and full suite pass; no unresolved Critical/High affecting the vertical; docs mark v1 COMPLETE; nothing pushed.

## Required tests

Scenarios A–L above as deterministic end-to-end tests, the global invariants, and the F002 regression test.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> only if a genuine blocker prevents closure (e.g. a cross-layer defect whose fix needs new science, a statutory change, a migration or an unauthorised product decision). Medium/Low findings do not block v1 unless they materially affect scientific truth, purchasing quantity, quote integrity, status truthfulness or data loss in the active workflow.
