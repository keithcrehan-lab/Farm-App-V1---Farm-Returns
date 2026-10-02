# Task: Per-nutrient P/K design — fix increment sequencing (F002)

Task ID: per-nutrient-p-k-design-fix-increment-sequencing-f002-20261002
Starting HEAD: 24290042fdda40ee43bc9ebf89a7a6a0019e207f
Verify command: `npm run typecheck && npm run build`

## Objective

Resolve the open Medium audit finding F002 against
`docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md` (final audit
`.agent/history/audit-20261001T215417Z-81243.md`): the staged delivery plan removes the
Index-1 placeholder in Increment 1, but the retained slurry N credit still depends on the
paired resolver returning OK (`src/domain/nutrients.ts` ~2046–2051, the CC-B2 F003 branch),
which needs both indices. The per-nutrient resolver entry point only arrives in Increment 3
(CP4). As written, Increment 1 would lose the retained N credit for missing-index fields.

Documentation-only correction of the design's sequencing. No code changes.

## Scope

Edit `PER_NUTRIENT_PK_DESIGN.md` only (plus a one-line IMPLEMENTATION_LOG.md entry):
- Re-sequence so the placeholder is removed only once N can be resolved without both
  indices. Preferred: Increment 1 becomes CP1 only (additive `fertilityEvidenceByNutrient`,
  placeholder kept internally exactly as today); placeholder removal (CP3) moves into
  Increment 3 together with CP4's shared table selection / per-nutrient entry point.
  Choose a different sequencing only if the repository shows the preferred one is unsafe,
  and say why.
- Update CP3's text ("Consumers" / "Recommendation") so it states this dependency on CP4
  explicitly, and keep its rationale that no placeholder-derived number may sit beside a
  real one once per-nutrient outputs are released.
- Add to the affected increments' Tests column an explicit invariant: for every
  missing-index case, retained slurry N (`organicApplication.offsetN`) and every existing
  output equal today's engine at every increment, until a named decision changes them.
- Keep every line reference in the edited text accurate against the current code.

## Out of scope

- Any other change to the design's content, decisions D1–D4, or other increments.
- The Low F003 finding (Codex sandbox could not run `next build`); nothing to change.
- Any file under `src/`, `supabase/`, `scripts/`, tests, BLOCKERS.md statuses, contracts.

## Acceptance criteria

- No increment removes the placeholder before N can be resolved without both indices.
- CP3 and the staged plan agree; the retained-N invariant is explicit in the Tests column.
- Only `PER_NUTRIENT_PK_DESIGN.md` and `IMPLEMENTATION_LOG.md` (plus task files) change.

## Required tests

- None new (documentation only); the verify command passes.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if resolving F002 needs a scientific rule not already
REPOSITORY_VERIFIED, a change outside documentation, or a change to decisions D1–D4.
