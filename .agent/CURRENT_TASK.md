# Task: Fertiliser Vertical Completion — Increment 1: canonical per-field nutrient requirement

Task ID: fertiliser-vertical-completion-increment-1-canonical-per-field-nutrient-requirem-20261002
Starting HEAD: c2a6b3826679adc3212a77e8f071444af60c8873
Verify command: `npm run typecheck && npm run build`

## Objective

Create one canonical, production-safe per-field nutrient requirement output for N, P and K that downstream slurry allocation, chemical fertiliser recommendation, farm aggregation and quoting can rely on.

This increment is complete only when every field has a deterministic nutrient requirement state for each nutrient: KNOWN; UNKNOWN / insufficient evidence; NOT_APPLICABLE where genuinely appropriate. Unknown values must never silently become zero.

Do not build slurry allocation, product optimisation, aggregation or quoting in this increment.

Repository context: the per-nutrient P/K programme (`docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md`, Increments 1–5, engine `nutrient_engine_v1.4.0`) already added `NutrientPlan.fertilityEvidenceByNutrient`, `requirementByNutrient`, `netRequirementByNutrient`, `organicApplication.availableNutrientByNutrient` / `availableNutrientBasis`, and isolated the internal Index-1 placeholder (blocked on CC-B5). Use existing types if they are sufficient; build on them rather than duplicating them.

## Programme context

Increment 1 of the Fertiliser Vertical Completion programme. Target workflow: field nutrient requirement → slurry recommendation/allocation → remaining chemical requirement → product recommendation → whole-farm aggregation → quote request. This task makes the first step canonical and trustworthy.

## Current constraints

Preserve all existing verified scientific behaviour unless this task explicitly proves a current behaviour is semantically wrong. Do not alter: Campaign B regulatory behaviour; slurry timing rules; 90 kg K provisional interpretations; slurry rate selector; organic-share-cap interaction; CC-B3 persistence; GPS/job logging; quote workflow; supplier logic; product verticals outside fertiliser. Do not change production science without repository-supported evidence.

## Required trace before editing

Trace the nutrient-requirement flow end-to-end and identify: where N, P and K requirements are calculated; where soil P index, soil K index, target yield and crop/use type enter; where missing P/K values are replaced, defaulted or represented; every place an Index-1 placeholder is still used; every place unknown requirement is converted to zero; every paired P/K structure that still prevents independent nutrient truth; every downstream consumer of N, P, K, paired requirement and provisional/blocked status; which outputs are frozen production contracts; which per-nutrient outputs are draft/unwired. Do not assume the paired output is canonical merely because production uses it.

## Canonical field requirement contract

One per-field structure downstream code can consume. Use existing types if sufficient; if a new type is necessary keep it small and explicit. Independently for N, P, K: status; kg/ha requirement where known; soil index where applicable (P, K); reason where unknown; evidence/provenance. Also expose: field area; total kg per field where known; crop/use context; target yield context where relevant; engine/rule version; evidence source/rule IDs where already available. Do not merge P and K uncertainty (P known/K unknown, P unknown/K known, both unknown; N known while P/K unknown).

## UNKNOWN semantics

UNKNOWN IS NEVER ZERO. No 0 requirement for missing/unsupported evidence; no Index-1 placeholder in the canonical output; retain a reason code. A legacy production path may still internally use a placeholder for existing statutory behaviour if removing it would alter Campaign B outputs: keep it isolated, never exposed through the canonical requirement, document the divergence, preserve the relevant Campaign B blocker (CC-B5).

## Fully indexed fields

The canonical output must reproduce existing valid production requirements exactly, subject only to rounding representation. If a mismatch is discovered, determine whether the new logic or the existing output is semantically wrong; do not silently choose. If resolving needs a scientific interpretation not already repository-supported: BUILD_RESULT: BLOCKED <reason>.

## Missing-index behaviour

Support P known/K unknown, P unknown/K known, both unknown, both known. Do not force paired blocking for legacy consumers. If frozen production types cannot represent this without a broad contract change, do not break them: complete the canonical per-nutrient requirement alongside the legacy paired output, prove equivalence for complete-data cases, document downstream migration, keep production consumers unchanged unless the change is narrow and explicitly safe.

## N requirement

Confirm and preserve current supported N behaviour. If N yield scaling remains blocked (supported yield range not repository-verified), do not invent a range; record the limitation in the canonical status/provenance. Do not reopen that question.

## P/K requirement

Canonical P depends on P evidence/index only; canonical K on K only. Do not remove legacy paired behaviour from statutory or purchasing paths unless explicitly in scope and safe.

## Requirement totals

For each known nutrient: kg/ha × field hectares = total kg. No total for unknown nutrients (unknown, not zero). Preserve sufficient precision internally; round only for presentation.

## Canonical output reachability

Identify where the canonical requirement should eventually feed (slurry allocation, remaining chemical requirement, product recommendation, farm aggregation, quote basket). Do not wire those systems in this increment unless they already consume the same requirement safely.

## Legacy compatibility

Do not break farmer-facing production behaviour unless fixing a directly proven correctness defect. Record every divergence as LEGACY_COMPATIBILITY_PATH with affected consumer, reason, migration dependency, blocker if applicable.

## Required tests

Complete data: P and K both known — canonical N, P, K match existing supported requirements. Partial: P known/K unknown; P unknown/K known; both unknown (N still known where supported). Unknown semantics: unknown P, K and unknown totals are not 0; no Index-1 placeholder in canonical output. Totals: kg/ha × hectares correct; internal precision avoids rounding reversal. Regression: complete-data nutrient-plan behaviour unchanged; Campaign B statutory behaviour unchanged; CC-B2 / CC-B4A behaviour unchanged where applicable.

## Documentation

Update only what is needed: BUILD_STATE, IMPLEMENTATION_LOG, relevant domain contract documentation, blockers if a real downstream migration or legacy divergence is confirmed. Document canonical source of truth, legacy compatibility paths, downstream consumers not yet migrated, next increment dependency.

## Out of scope

Slurry allocation; slurry store optimisation; chemical product recommendation; D1 purchasing policy; whole-farm aggregation; quote basket; supplier workflow; GPS; news; alerts; CC-B3 migration; UI redesign.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files). If a quick check script cannot be run, rely on repository tests.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if: canonical N/P/K requirements require an unsupported scientific rule; complete-data equivalence cannot be established and needs scientific adjudication; implementation requires a frozen production contract change broader than this increment; statutory Campaign B behaviour would change; a migration is required; the task expands into allocation, purchasing or quoting; required evidence is unavailable.

## Acceptance criteria

One canonical per-field N, P and K requirement; P and K uncertainty independent; unknown never zero; field totals for known requirements; complete-data results match supported existing outputs; legacy placeholder isolated from canonical output; Campaign B/statutory outputs unchanged; required tests pass; no unresolved Critical/High; nothing pushed.

## Scope

As stated in the task brief above; nothing beyond it.
