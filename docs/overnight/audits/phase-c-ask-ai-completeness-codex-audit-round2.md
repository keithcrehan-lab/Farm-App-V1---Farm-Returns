# Codex audit — Phase C: contextual Ask AI completeness — round 2

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `7a8fa5c` (round-1 target)
PHASE_COMMIT: `a4941da` — "Fix Codex round-1 findings against Phase C
(contextual Ask AI completeness): 1 MEDIUM + 1 LOW, both resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
Found one LOW issue; no Critical, High, or Medium findings.

- LOW — The round-one test weakness is only partially fixed. The focused `AskAI` tests now correctly query `data-testid="ask-ai-fact-tier"`, and the discriminated union plus `@ts-expect-error` test provide a genuine compile-time guard. However, `ExpandedPromptSheet.test.tsx` still uses the ambiguous `getAllByText("Official model").length >= 2` assertion, so that integration test can pass without proving that the provenance tag itself rendered. `today/page.test.tsx` also still verifies only the Farm context, not the newly added leading-prompt evidence tier. Rewrite these call-site tests to query `ask-ai-fact-tier` directly.

The whole-phase pass found no fabricated production figure, duplicated domain calculation, breaking legacy `AskAIContext` caller, or higher-severity inconsistency.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=0 LOW=1
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. The finding was
evaluated as legitimate — round 1's own fix only touched
`AskAI.test.tsx`'s unit tests and missed the two call-site integration
tests that had the identical weakness — and fixed:

**LOW (call-site tests still used ambiguous text matching)** — correct:
1. `ExpandedPromptSheet.test.tsx`'s "gives Ask AI the real evidence
   tier..." test rewritten to query `getByTestId("ask-ai-fact-tier")`
   directly instead of counting `"Official model"` text occurrences
   (which the pre-existing Pill alone already satisfied).
2. `today/page.test.tsx` had no test at all for the "Leading prompt"
   evidence-tier fix — added one, mocking `buildAllRealPrompts` directly
   (the real mock `<FarmProvider>` farm/field data doesn't
   deterministically produce a known evidence tier for whichever Prompt
   ends up primary) to supply a known, real-shaped OK Prompt fixture,
   then asserting the Ask AI overlay's own tag element (scoped to the
   dialog via `within`, since the Prompt's own title also appears on the
   card behind it) shows the correct real tier.

Re-run: 18/18 tests pass across `today/page.test.tsx` (5, up from 4) and
`ExpandedPromptSheet.test.tsx` (13, unaffected in count, one assertion
strengthened).

Quality gate: re-run for this increment.
