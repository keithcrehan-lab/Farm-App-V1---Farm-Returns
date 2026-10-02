# Task: Fertiliser Vertical Completion — Increment 2a: slurry recommendation design

Task ID: fertiliser-vertical-completion-increment-2a-slurry-recommendation-design-20261002
Starting HEAD: af3036dc793ff53ea136561e16a036643ab3c074
Verify command: `npm run typecheck && npm run build`

## Objective

Fertiliser Vertical Completion — Increment 2a (design, documentation only). Produce the trace and
design for Increment 2 of the programme: slurry recommendation/allocation that consumes the
canonical per-field requirement `NutrientPlan.fieldRequirement` (Increment 1, `af3036d`;
`docs/farm-return-next/DOMAIN_CONTRACTS.md` "Fertiliser Vertical Completion, Increment 1").
Target workflow: field nutrient requirement → slurry recommendation/allocation → remaining
chemical requirement → product recommendation → whole-farm aggregation → quote request.

No production code, test, migration or contract change in this task. Deliverable: one design
document, `docs/farm-return-next/FERTILISER_VERTICAL_SLURRY_DESIGN.md`.

## Scope

Trace (verified against the code, with file/line references, never inferred):
1. Every existing slurry module and how they connect today: `slurry-allocation-plan.ts`,
   `slurry-whole-farm-allocation.ts`, `slurry-direct-economic-assessment.ts`,
   `slurry-rate-allocation.ts` (unwired), `slurry-storage.ts`, `slurry-timing.ts`,
   `slurry-regulatory-context.ts`, `slurry-allocation-lifecycle.ts`, `slurry-actionability-policy.ts`,
   `slurry-evidence-context.ts`, and how `calculateNutrientPlan` receives `slurryAllocation`.
2. Where slurry volumes come from (stores/housing), how fields are prioritised and how a rate per
   field is chosen today; which outputs are production, frozen, draft or unwired.
3. Which inputs each step reads from the paired `requirement` / `netRequirement` vs the
   per-nutrient / canonical fields, and where an unknown is converted to 0.
4. Which rules are REPOSITORY_VERIFIED vs AI_PROVISIONAL / AI_REVIEW_ONLY / deferred (Campaign C
   `SOURCES_AND_CLAIMS.md`, `AI_ADJUDICATION_2026-09-29.md`, `RATE_ALLOCATION_ARCHITECTURE.md`):
   share caps, rate selector, 90 kg K, timing boundaries, statutory closed periods, buffers (CC-B5).

Design:
- The target shape for "slurry recommendation per field" consuming `fieldRequirement`
  (known/unknown/not-applicable per nutrient, totals), and for "remaining chemical requirement"
  after slurry, keeping UNKNOWN never zero and P/K independent.
- A staged plan of independently shippable increments (each: modules touched, contract changes
  under the protocol, tests, version impact, whether any production output changes).
- An explicit list of decisions that are not engineering (product owner / Campaign B / Campaign C
  science), with options and consequences — at minimum how provisional Campaign C rules may or may
  not affect recommendations, mixed P/K fields, and CC-B5.
- What must stay unchanged (Campaign B statutory behaviour, frozen contracts, existing production
  outputs) and the LEGACY_COMPATIBILITY_PATHs it would retire or keep.

Add a pointer to the design from `DOMAIN_CONTRACTS.md`'s Increment 1 section and a short
IMPLEMENTATION_LOG entry; update `BUILD_STATE.json` `fertiliser_vertical.next` only.

## Out of scope

- Any change under `src/`, `supabase/`, `scripts/` or tests; contract or engine changes.
- New scientific interpretation or invented coefficients; reopening Campaign B/C decisions.
- Product recommendation, aggregation, quoting design beyond naming the hand-off interfaces.
- Migrations, harness, push/deploy, external research.

## Working method (mandatory)

Do NOT create temporary or scratch files inside the repository (this session cannot delete files).

## Acceptance criteria

- The design document exists, with a verified trace (file/line refs), target shapes, a staged
  plan, an explicit decisions list, and the unchanged/legacy list.
- Only documentation (and the task files) changes.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if the design would require a scientific rule not already
REPOSITORY_VERIFIED to be treated as production, or if completing it needs any non-doc change.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.
