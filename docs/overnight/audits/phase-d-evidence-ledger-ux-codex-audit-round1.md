# Codex audit — Phase D: Evidence Ledger / provenance UX — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `8e323a4` (last verified baseline, closure of Phase C)
PHASE_COMMIT: `b0d84ec` — "Phase D: Evidence Ledger / provenance UX —
surface real evidence tier and calculation version in Records history"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

- **HIGH — Persisted dismissed decisions can produce an empty/invalid evidence-tier Pill.** Both `DecisionHistoryCard.tsx` and `JobHistoryCard.tsx` assume an `OK` snapshot's `evidenceState` belongs to the TypeScript union. However, `rowToDecision` performs no runtime validation, while the database constraint exempts all dismissed decisions through `outcome = 'dismissed'` in `20260829010000_decisions_jobs_client_access.sql`. Thus a real persisted dismissed row may contain `{"status":"OK","evidenceState":"UNRECOGNISED"}`. The components then call `EVIDENCE_STATE_UI_LABEL` with a missing key and render an empty green Pill, falsely implying valid provenance. Validate persisted snapshots at the mapper boundary and fail closed, or strengthen the database constraint so every `OK` snapshot has a recognized evidence state regardless of outcome. Add coverage for malformed dismissed `OK` snapshots in both cards.

- **MEDIUM — The claimed "why this number, later" ledger remains materially incomplete.** The rows expose only the tier and calculation version while discarding `inputsSnapshot`, despite that snapshot already being persisted and specifically intended to record the inputs used by the calculation. Consequently, a farmer cannot inspect which historical inputs a displayed calculation version acted upon. This is a concrete provenance gap because the same real snapshot is already safely surfaced at decision time by `ExpandedPromptSheet`; history loses it. Reusing that established presentation, potentially behind a disclosure control, would remain within the phase's no-new-calculation scope.

The `EngineOutcome` discriminant narrowing itself is correct for valid runtime data, and the shared label map is exhaustive over the compile-time `EvidenceState` union. Valid dismissed decisions with an `OK` estimate legitimately retain the estimate's tier; non-OK statuses do not reach the access. Records' dedicated decision-ID exclusion prevents the same decision from appearing simultaneously as both a job and a bare decision, so no normal-path provenance disagreement was found there.

The new positive tests exercise the rendered behavior despite repeating their fixture defaults; they do not pass merely because a fixture field exists. The negative tests correctly replace the default snapshot, but they miss the schema-permitted malformed dismissed-`OK` case above.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=1 LOW=0
GATE: FAIL

---

## Disposition

Both findings evaluated as legitimate and fixed in the same session:

1. **HIGH (unvalidated persisted evidenceState could render an empty
   Pill)** — genuinely correct: `decisions_estimate_snapshot_ok_shape`'s
   own CHECK constraint reads `outcome = 'dismissed' OR (shape
   requirements...)`, so a dismissed decision's `estimate_snapshot` can
   be persisted as `{"status":"OK", "evidenceState": <anything>}` with
   no database-level validation at all, and `rowToDecision` performs no
   runtime check on read. Fixed: new `isEvidenceState` runtime type
   guard added to `src/domain/evidence.ts` (the shared vocabulary
   module, not duplicated per call site), checked before indexing
   `EVIDENCE_STATE_UI_LABEL` in both `DecisionHistoryCard.tsx` and
   `JobHistoryCard.tsx` — an unrecognised value now renders no tier at
   all rather than an empty/`undefined` tag. New unit tests in
   `evidence.test.ts` (accepts every real state, rejects an unrecognised
   string and every non-string type without throwing) plus integration
   tests in both card test files exercising the exact malformed
   dismissed-row shape the database constraint permits.
2. **MEDIUM (inputsSnapshot still discarded)** — correct: the same real,
   already-persisted, already-farmer-visible-at-decide-time
   `inputsSnapshot` value was the one field of the three this phase's
   own first fix still dropped. Fixed: a compact, single-line
   `key=value` summary (matching this row's own established one-line-
   per-fact density, not `ExpandedPromptSheet.tsx`'s own multi-row
   `<dl>`, which would be too verbose repeated down a long scrolling
   history) added to both `DecisionRow` and `JobHistoryRow`, only
   rendered when a non-empty snapshot exists. New tests in both card
   test files for the present/absent cases.

Re-run: 45/45 tests pass across `DecisionHistoryCard.test.tsx` (9, up
from 5), `JobHistoryCard.test.tsx` (17, up from 12), and
`evidence.test.ts` (15, up from 12).

Quality gate: re-run for this increment.
