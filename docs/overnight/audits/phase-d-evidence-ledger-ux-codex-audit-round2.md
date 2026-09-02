# Codex audit — Phase D: Evidence Ledger / provenance UX — round 2

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `b0d84ec` (round-1 target)
PHASE_COMMIT: `fe41165` — "Fix Codex round-1 findings against Phase D
(Evidence Ledger / provenance UX): 1 HIGH + 1 MEDIUM, both resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

- **MEDIUM — Real provenance is rendered as `[object Object]` or `undefined`.** Both cards' `formatInputsSnapshot` helpers stringify every value with `String(value)`. The production `local_buffer_override` Prompt stores the structured `waterBufferContext` object in `inputsSnapshot`, so its historical row displays `waterBufferContext=[object Object]`, concealing the recorded status, distances, source, and evidence tracking data. Other real producers store optional fields such as `rawPMgL`, `plannedUse`, and `actualDistanceM`, which can appear as the misleading literal `undefined`. This does not genuinely fix round 1's provenance finding for all real Prompt shapes. Serialize structured values meaningfully and represent absent values explicitly or omit them; add object, array, `null`, and `undefined` coverage to both card tests.

The round-1 HIGH is fixed: `isEvidenceState` accepts exactly own keys of `EVIDENCE_STATE_UI_LABEL`, rejects all other runtime types without throwing, and both persisted-history consumers use it before indexing the map. No missed persisted decision/job evidence-state consumer was found.

The `truncate` layout is effective: the text sits inside a `min-w-0 flex-1` container and Tailwind's truncation applies overflow hiding, ellipsis, and no wrapping. The duplicated formatter is presentational rather than domain calculation logic.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. The finding was
evaluated as legitimate and fixed:

**MEDIUM (structured/absent values rendered meaninglessly)** — correct:
`String(value)` on a real structured value (the production
`local_buffer_override` Prompt's own `waterBufferContext` object)
produces the literal, meaningless `"[object Object]"`, discarding
exactly the provenance this round's own fix exists to surface; an
absent optional field (`rawPMgL`, `plannedUse`, `actualDistanceM` on
other real producers) could likewise render as the literal string
`"undefined"`. Fixed in both `formatInputsSnapshot` copies:
`undefined`/`null` values are now omitted entirely from the summary
(this app's own established "never render a placeholder for missing
data" convention, not a new one invented here), and an object/array
value is `JSON.stringify`'d rather than coerced through `String`.

New tests in both card test files: a real structured value serialises
meaningfully (never `[object Object]`), an undefined/null field is
omitted (never the literal `"undefined"`), and a snapshot whose every
field is undefined/null shows no inputs line at all.

Re-run: 35/35 tests pass across `DecisionHistoryCard.test.tsx` (13, up
from 9) and `JobHistoryCard.test.tsx` (19, up from 17).

Quality gate: re-run for this increment.
