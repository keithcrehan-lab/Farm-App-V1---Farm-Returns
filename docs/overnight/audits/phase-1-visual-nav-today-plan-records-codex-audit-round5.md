# Codex audit — Phase 1 (visual patterns / nav cutover / Today-Plan-Records) — round 5

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT (this round's target): `fa1e577` (round-3 remediation).
PHASE_COMMIT: `12e6883` — "Fix Codex round-4 findings: Sheet
topmost-tracking reopen freshness, shared scroll-lock/focus-restore
instead of per-instance corruption" (see
`docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round4.md`
for the findings this commit fixes).

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction ("Use a temporary output path for Codex's final message and
copy it into the audit log").

---

codex
- MEDIUM — [Sheet.tsx:180](/private/tmp/farm-return-audit-phase1-r5/src/components/ui/Sheet.tsx:180): The global position is mutated during render, so it is not reliable under concurrent or suspended rendering. A Sheet can receive position N, suspend while reconciling its children, then another independently opened Sheet can receive N+1 and commit first. When the suspended Sheet later commits and becomes visible, it retains N and is incorrectly treated as underneath the earlier-committed Sheet. The render-phase retry does preserve parent-before-child ordering in an uninterrupted render, but it does not establish actual open/commit recency. Positioning needs a commit-safe design that also explicitly represents nesting, rather than using a module-global render side effect for both concepts.

- LOW — [Sheet.test.tsx:215](/private/tmp/farm-return-audit-phase1-r5/src/components/ui/Sheet.test.tsx:215): The nested-close regression test substantively detects the original overflow/final-focus corruption, but it never asserts the newly claimed intermediate focus handoff to the remaining outer Sheet. It also covers only two Sheets; a three-level close sequence would better verify the shared registry's intended invariant. Inspection indicates the current map logic itself handles three or more entries correctly.

- LOW — The requested round-4 audit record, `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round4.md`, is absent from commit `12e6883`; only round 1 and round 2 records exist under that directory. Consequently, the commit contains dangling audit references and the exact source record could not be independently compared.

The queued microtask is guarded by current registry membership/topmost status, so a Sheet closed before its task runs will not steal focus. The independently-reopened-Sheet test genuinely exercises the stale-position fix, and the overflow/final-focus test genuinely fails the former per-instance restoration behavior. Focused tests could not be executed because dependencies are unavailable (`vitest: command not found`).

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=2
GATE: PASS
tokens used
24,375

---

## Disposition (this session, after this round completed)

**MEDIUM — module-level render-time position is not Suspense/transition-safe.**
Evaluated, not fixed. Verified by grep across every real `Sheet` call
site (`src/components/next/ExpandedPromptSheet.tsx`,
`src/components/next/AskAI.tsx`, `src/components/shell/MoreSheet.tsx`)
and their ancestors: no `Suspense`, `useTransition`/`startTransition`,
or `use()` appears anywhere in this path. Every real Sheet-opening state
change in this app today is a plain synchronous `setState` from a click
handler, so the specific race Codex describes (a suspended render
committing late with a stale position) has no reachable trigger in this
codebase as it stands. Recorded here as a reviewed architectural
constraint, not a demonstrated bug — revisit if a future call site ever
opens a `Sheet` from inside a transition or a `Suspense` boundary (see
`BLOCKERS.md`).

**LOW — missing intermediate-focus assertion.** Fixed, commit `97dd484`.
The existing nested-close test now also asserts that closing the inner
Sheet hands focus to the still-open outer Sheet's own panel (not just
that the final state is correct after everything closes). Doing so
surfaced a genuine test-timing gap, not a production bug — closing a
Sheet triggers the same render-phase `wasOpen` reset used by the
open-side position assignment, which needs one further microtask tick
to settle before a synchronous test's DOM assertions are safe. Fixed
with the same `await Promise.resolve()` pattern already used after the
initial mount.

**LOW — round-4 audit record absent from commit `12e6883`.** No action
needed — this is expected sequencing, not an oversight. This session's
convention (matching rounds 1-2) is to fix code and audit-record
documentation as separate commits: the round-4 *fix* is `12e6883`; the
round-4 *audit record* (this file's own predecessor) and this round-5
record are committed together as documentation, alongside the
overnight-log/matrix updates, per the resumed session's own remediation
plan.

No further Critical/High findings from this round. Per the session's
remediation policy (fix any valid Critical/High/Medium, evaluate and
document the rest), this closes the round-4→round-5 fix/verify cycle
for Phase 1's nested-Sheet work. Two LOW findings remain open from
round 4 itself (incomplete `spreading_window` action-test coverage;
untested `JobHistoryCard` `updatedAt` display regression) — see
`IMPLEMENTATION_MATRIX.md`/`BLOCKERS.md`, deliberately not addressed in
this pass (out of Critical/High/Medium scope).
