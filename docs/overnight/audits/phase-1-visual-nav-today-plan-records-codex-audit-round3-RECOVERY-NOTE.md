# Round-3 Codex audit — RECOVERY NOTE (original transcript lost)

**This is not a Codex audit transcript.** It is a recovery note written
by the session that resumed this work, explaining why no round-3
transcript exists and what can and cannot be honestly reconstructed
about it. Do not treat anything below as Codex's own words — it is this
session's own reconstruction from evidence, clearly labeled as such.

## What happened

A prior session ran a third Codex audit round against commit `77c95b7`
("Fix Codex round-2 findings..."), received findings from it, and
implemented fixes for those findings directly in the working tree. That
session was cut off by a hard usage-session limit before it could:

- save the round-3 audit transcript to `docs/overnight/audits/` (unlike
  rounds 1 and 2, both of which are present in this directory),
- run the quality gate against the fixes,
- commit the fixes,
- update `OVERNIGHT_BUILD_LOG.md` / `IMPLEMENTATION_MATRIX.md`, or
- write the "Morning handoff" section.

Direct evidence of the cutoff: `docs/overnight/claude-terminal.log`
(committed in the same session, as an uncommitted working-tree file at
the time this was discovered) contains exactly one line:

```
You've hit your session limit · resets 11:50pm (Europe/Dublin)
```

The fixes themselves survived as uncommitted working-tree changes across
12 files and were found, verified, and committed by a resuming session
(this one) as commit `fa1e577`. **The original round-3 Codex prompt,
Codex's own full reasoning, and its exact severity classifications are
gone and cannot be recovered.** No attempt is made below to reconstruct
Codex's original wording or to invent a plausible-looking transcript —
only what is directly evidenced by the surviving code and its own
inline comments is listed.

## Findings evidenced by the surviving remediation (not Codex's original words)

Each item below cites the specific code comment in the surviving diff
that names it as a round-3 fix, plus this session's own independent
assessment of whether the fix was actually correct (it verifies the
claim, it does not simply repeat it).

1. **Nested-Sheet Escape bug** (`src/components/ui/Sheet.tsx`, prior
   doc comment above `openSheetStack`). Claimed: two open `Sheet`s (an
   outer `ExpandedPromptSheet` and a nested `AskAIButton` overlay) each
   registered an independent `document`-level `keydown` listener, so one
   Escape press closed both instead of just the topmost. The fix
   shipped in `77c95b7`'s working tree used push-order-in-effect
   tracking. **This session found that fix itself was subtly wrong**
   (React fires mount effects child-first, parent-second, so the wrong
   Sheet ended up "on top" of the stack for the exact nested-mount case
   it was meant to fix) — caught by the surviving test
   (`Sheet.test.tsx`'s nested-sheets test) failing against the
   unmodified round-3 code once the quality gate was actually run. Fixed
   properly in `fa1e577` (render-position-based tracking, not effect
   push order).

2. **Desktop Ask AI affordance missing** (`PageHeader.tsx`'s new
   `actions` prop doc comment, and matching comments in
   `today/plan/records/fields` pages). Claimed: every v1.1 primary
   screen showed Ask AI only in its mobile-only header; desktop had no
   equivalent. Verified correct on inspection — `PageHeader` previously
   had no slot for arbitrary header content, and none of the four pages
   passed one. The fix (an optional `actions` slot, real
   `AskAIButton` wired into it on all four screens) is straightforward
   and was not found to have any correctness issue.

3. **`calculationVersion` not rendered** (`ExpandedPromptSheet.tsx`'s
   inline comment). Claimed: the value was computed and handed to Ask
   AI's own context object but never actually shown in the Prompt's own
   evidence box, contradicting the "a Prompt's own trace must be
   inspectable" rule. Verified correct — the prior code path indeed only
   read `inputs.length` to decide whether to render the evidence box at
   all, with no rendering of `calculationVersion` anywhere in it.

4. **`JobHistoryCard` timestamp inconsistency** (`JobHistoryCard.tsx`'s
   inline comment). Claimed: the row displayed
   `job.decision.decidedAt` while `RecordsPageClient`'s merged timeline
   (the round-2 fix) sorts by `job.updatedAt` — a displayed date that
   could silently disagree with the row's own sorted position. Verified
   correct by reading both files together.

## Round-4's independent role

Because round 3's own transcript cannot be recovered, **round 4
(`phase-1-visual-nav-today-plan-records-codex-audit-round4.md`) is the
authoritative independent verification of the four claims above** — not
this recovery note, and not the original (lost) round-3 report. Round 4
re-examined the actual code in `fa1e577` (this session's corrected
version of the round-3 remediation) from scratch, independently of any
claim made by round 3 or by this note, and found two further real
MEDIUM issues in the Escape-bug fix specifically (both fixed in this
session's follow-up commit `12e6883`; see round 4's own file for
detail and disposition) plus two LOW issues deliberately left open.

Treat this note as historical context for *why* round 3's own file is
missing, not as a substitute for it.
