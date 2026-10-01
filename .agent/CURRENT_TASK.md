# Task: Per-nutrient P/K architecture design

Task ID: per-nutrient-p-k-architecture-design-20261001
Starting HEAD: 6535b8421ad6b02d14522cc48a943fdcd21d4672
Verify command: `npm run typecheck && npm run build`

## Objective

Produce the architecture design for independent per-nutrient P/K handling: when a field has
a known soil P Index but no K Index (or the reverse), the known nutrient's requirement, slurry
credit and outputs can be used instead of withholding P and K together. This is a DESIGN task:
the deliverable is one design document. No production code, test, migration or contract
changes in this task.

Scientific basis is already settled and must not be reinterpreted: GAP-04 is RESOLVED
(SOURCE_DIRECT, REPOSITORY_VERIFIED) — the P Index governs P and the K Index governs K
(`CLM-GB-9-8-FN3`; `docs/farm-return-next/campaign-c/AI_ADJUDICATION_2026-09-29.md` GAP-04).

## Scope

Write `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md`, building on (not
repeating) the six change points in `docs/farm-return-next/campaign-c/RATE_ALLOCATION_ARCHITECTURE.md`
§5. For each change point give: the current frozen shape (with file references), one or two
concrete target shapes, the consumers affected (verified against the code, not copied), the
fail-closed behaviour for the unknown nutrient, and a recommendation.

The document must also cover:
- A staged delivery plan: independently shippable increments in a safe order, each naming
  the frozen-contract changes it needs (per `docs/farm-return-next/DOMAIN_CONTRACTS.md`'s
  contract-change protocol), its tests, and whether an engine-version bump is required.
- Decisions that are NOT engineering and need the product owner or Campaign B review,
  stated as explicit open questions with the options and their consequences — at minimum
  purchased multi-nutrient blends against an unknown requirement (change point 5) and
  statutory P outputs (`napCompliance` / `statutoryManureValue`, change point 6).
- What stays unchanged: CC-B2 / CC-B4A guarantees, engine values for fully-indexed fields,
  Campaign B statutory outputs until reviewed.
- Add a one-line pointer to the new document from `RATE_ALLOCATION_ARCHITECTURE.md` §5 and
  a short IMPLEMENTATION_LOG.md entry. Do not change BLOCKERS.md statuses.

## Out of scope

- Any change under `src/`, `supabase/`, `scripts/`, or to any test.
- Implementing any increment; changing frozen contracts; engine version changes.
- New scientific interpretation, invented coefficients, or reopening GAP-04, CC-B2, CC-B4A.
- Campaign B statutory interpretation; migrations; harness/runner; push/deploy; external research.

## Acceptance criteria

- The design document exists, covers all six change points with verified file references,
  the staged plan and the explicit product-owner/Campaign B decisions.
- Every claim about current code is checked against the repository, not inferred.
- No file outside `docs/` (and the task files) changes.

## Required tests

- None new (documentation only). The verify command must still pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if the design would need a scientific rule not already
REPOSITORY_VERIFIED, if current code contradicts RATE_ALLOCATION_ARCHITECTURE.md §5 in a way
that changes the scientific basis, or if completing it requires changing any non-doc file.
