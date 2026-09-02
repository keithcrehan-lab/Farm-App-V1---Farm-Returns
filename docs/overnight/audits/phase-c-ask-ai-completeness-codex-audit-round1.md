# Codex audit — Phase C: contextual Ask AI completeness — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `0632bd9` (last verified baseline, closure of Phase B)
PHASE_COMMIT: `7a8fa5c` — "Phase C: contextual Ask AI completeness —
real evidence-tier provenance in AskAIContext"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
Found one MEDIUM and one LOW issue.

- MEDIUM — `AskAI.tsx`: `AskAIFact` does not enforce its documented mutual exclusivity. A normal, type-safe caller can supply both `evidenceState` and `farmerActual: true`; rendering silently prefers "Farmer confirmed" and hides the scientific evidence tier. Model this as a mutually exclusive union or reject conflicting metadata explicitly.

- LOW — `AskAI.test.tsx`: the evidence-tag test asserts `>= 1`, so the fact's value alone satisfies it. The integration assertion in `ExpandedPromptSheet.test.tsx` can likewise pass without the tag because the pre-existing Pill plus fact value provide two matches. Query the provenance tag directly, or give it an accessible semantic marker. The Today call-site behavior also has no direct regression test.

Other requested checks passed:

- All `EngineOutcome` non-OK statuses remain raw statuses; only `OK` exposes `evidenceState`.
- Current real callers supply valid evidence-state values. A typo requires bypassing the exported TypeScript contract; it would silently omit the tag rather than throw.
- The overlay still clearly presents tags as visible context and states that no AI provider is connected.
- No fabricated number, new calculation, or breaking existing string caller was found.
- Searches confirm satellite coverage has no UI consumer and `GateConstraintCard` has no production caller.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=1
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. Both findings evaluated
as legitimate and fixed:

1. **MEDIUM (evidenceState/farmerActual could both be set)** — correct:
   `AskAIFact` was an object with two independent optional fields, so a
   type-safe caller could set both, and the render logic's own
   if/else-if chain silently preferred `farmerActual`, hiding a real
   evidence tier that was also supplied. Fixed: `AskAIFact` is now a
   genuine discriminated union — three variants (`evidenceState` only,
   `farmerActual: true` only, neither), with `never` fields making the
   invalid combination a compile-time error for every future caller, not
   a runtime ambiguity. Added a test that asserts the invalid
   combination is a real `@ts-expect-error`, not merely "undesirable at
   runtime."
2. **LOW (weak test assertions)** — correct: the evidence-tag test's
   `>= 1` count and the integration test's shared "Official model" text
   with the pre-existing Pill both meant the tag itself was never
   directly verified. Fixed: added `data-testid="ask-ai-fact-tier"` to
   the tag element itself, and rewrote every provenance test in
   `AskAI.test.tsx` to query that testid directly (present with the
   right text, or absent) rather than counting ambiguous text matches.

Re-run: 22/22 tests pass across `AskAI.test.tsx` (13, up from 8) and
`ExpandedPromptSheet.test.tsx` (13, unaffected).

Quality gate: re-run for this increment.
