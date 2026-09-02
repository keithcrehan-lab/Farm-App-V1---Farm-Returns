# Codex audit — Phase 1 (visual patterns / nav cutover / Today-Plan-Records) — round 4

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT (this round's target): `fa1e577` — the round-3 remediation commit
(see `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round3-RECOVERY-NOTE.md`
for why round 3's own original transcript does not exist and this round
is therefore the first independent verification of that commit's claims).
PHASE_COMMIT: `fa1e577675d...` (see `git show fa1e577` in this repository
for the exact full SHA; this is the "Fix Codex round-3 findings" commit).

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction ("Use a temporary output path for Codex's final message and
copy it into the audit log").

---

codex
## MEDIUM

- [Sheet.tsx](/private/tmp/farm-return-audit-phase1-r4/src/components/ui/Sheet.tsx:132) does not reliably identify the topmost sheet. Its position is assigned once, on the component's first render, so it represents component/render order—not opening order or current visual stacking. If two independent mounted sheets open in the opposite order, or an older sheet reopens while another remains open, Escape closes whichever instance originally rendered later. The new test covers only simultaneous parent-before-child rendering and misses independent sheets and reopen sequences.

- Nested sheets still corrupt global modal state in [Sheet.tsx](/private/tmp/farm-return-audit-phase1-r4/src/components/ui/Sheet.tsx:135). Each effect independently captures and restores `document.body.style.overflow` and focus. With simultaneous nested mounting, the child effect records the original overflow, then the parent records `"hidden"`; closing the child unlocks scrolling while the parent remains open, and closing the parent subsequently restores `"hidden"` permanently. Child-first effects also focus the inner panel before the parent effect refocuses the underlying outer panel. The Escape-only nesting test does not inspect scrolling or focus.

## LOW

- The new server-action coverage remains incomplete. [decisions.test.ts](/private/tmp/farm-return-audit-phase1-r4/src/app/actions/decisions.test.ts:141) says it covers the "other three" Prompt kinds but tests only `soil_test_age` and `local_buffer_override`. The successful `spreading_window` recomputation path remains untested; its only direct action test verifies rejection when `material` is absent.

- The timestamp behavior is implemented correctly, but its display regression is untested. [RecordsPageClient.test.tsx](/private/tmp/farm-return-audit-phase1-r4/src/app/(app)/records/RecordsPageClient.test.tsx:60) proves sorting uses `updatedAt`, while no test supplies divergent dates and asserts that [JobHistoryCard.tsx](/private/tmp/farm-return-audit-phase1-r4/src/components/farm/JobHistoryCard.tsx:138) displays the formatted `updatedAt` rather than `decidedAt`.

The desktop Ask AI wiring and calculation-version rendering are correct, and their added assertions exercise the rendered affordances/content. Dependencies are absent, so tests could not be independently executed; `git diff --check` passed.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=2 LOW=2
GATE: PASS
tokens used
62,483

---

## Disposition (this session, after this round completed)

Per the session's own remediation policy (fix any valid Critical/High/
**Medium** finding before progressing, not just Critical/High), both
MEDIUM findings above were treated as valid on inspection of the actual
code and fixed in commit `12e6883` ("Fix Codex round-4 findings..."):

1. Topmost-tracking reopen freshness — a Sheet's render-order position
   is now reassigned on every closed→open transition (via `useState`,
   following React's own sanctioned "adjusting state when a prop changes
   during rendering" pattern), not fixed once at first-ever render.
2. Shared scroll-lock/focus-restore — `document.body.style.overflow` and
   the pre-modal focused element are now captured once (when the first
   Sheet in a stack opens) and released once (when the last closes),
   via a shared module-level registry, instead of each Sheet instance
   independently capturing/restoring and corrupting the others' state.

Two regression tests were added (independently-reopened-Sheet targeting;
scroll-lock/focus correctness across a nested close-inner-then-outer
sequence) — both fail against the pre-fix code and pass against the fix.
`scripts/quality-gate.sh --json` was re-run clean after the fix:
1321/1321 tests, typecheck/lint/build all pass.

The two LOW findings (incomplete `spreading_window` action-test coverage;
untested `JobHistoryCard` `updatedAt` display regression) were
deliberately **not** fixed in this pass — out of the Critical/High/
Medium scope this session's remediation policy requires acting on
immediately. Carried forward as open, named items (see
`IMPLEMENTATION_MATRIX.md` and `BLOCKERS.md`).

See `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round5.md`
for the independent re-audit of commit `12e6883` (the fix for this
round's own findings).
