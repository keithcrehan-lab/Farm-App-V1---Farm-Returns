# Phase V3 — Plan — Codex visual audit log

Reference: `docs/product/farm-return-next-v1.1/media/image1.png` panel 1
("PLAN — Upcoming work & opportunities") — a literal colour *and*
composition reference for this exact screen, unlike images 2–6.

| Round | Commit | Fidelity | Verdict | Dashboard drift | Headline fix that round |
|---|---|---|---|---|---|
| 1 | fa4a6ea | 5.0/10 | REDESIGN REQUIRED | MEDIUM | (two stacked equal Cards -> one continuous flow with FarmSectionHeading) |
| 2 | 89749b6 | 5.6/10 | REDESIGN REQUIRED | HIGH | Progressive disclosure, 2-line descriptions, calmer empty-state copy, serif titles |

## Outcome: BLOCKED_HUMAN, same oscillation pattern as Today/Farm

Round 2 directly contradicts round 1: round 1 said the fully-expanded
15-row list "dominates the screen and reads like an administrative
queue," fixed by grouping into one Card with 5-at-a-time progressive
disclosure; round 2 then said that same fix is "a dense five-row
administrative queue inside one large bordered card... remove the
enclosing queue-like card." This is the identical oscillating-taste
signature already documented for Today (marker style, card position —
`docs/visual-audit/rebuild/v1-today/AUDIT_LOG.md`) and Farm (map
containment — `docs/visual-audit/rebuild/v2-farm/AUDIT_LOG.md`): a
further round is likely to flip the same finding back, not converge.

Two more findings are genuine but out of scope for a visual-only phase:

1. **Raw evidence-state/reason codes in real Prompt descriptions**
   (`NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE`, `UNKNOWN_COMMONAGE_STATUS`,
   "missing: FIELD_COMMONAGE_STATUS") — raised in both rounds, escalating
   Medium to High. This is real orchestration-layer content
   (`describeBlockedBasis`, `src/orchestration/prompt/index.ts`), shared
   by every screen that shows a blocked Prompt (Today, Plan,
   `ExpandedPromptSheet`). A blind text-mangling filter in the
   presentation layer risks producing nonsensical fragments for Prompt
   kinds this phase didn't enumerate one by one; rewriting the real
   copy is a domain-content decision, the same call already made for
   Phase V1's "Calendar open — View details" wording.
2. **"Ask AI positioned as a prominent header action rather than the
   small, persistent bottom affordance shown in the literal Plan
   reference."** Genuinely correct and well-evidenced — every one of
   image1's 8 panels shows a wide "✦ Ask AI" pill sitting just above the
   bottom nav, not a header button. This is a real, systemic, cross-
   screen placement change (every screen in this app puts Ask AI in the
   header today), which is exactly Phase V7's own named scope ("ASK AI:
   use image1's language... clean contextual overlay") — not a
   Plan-specific fix to make unilaterally here.

One Low finding was checked and deliberately not applied: shortening
"Genuine opportunities" to "OPPORTUNITIES" would break
`plan/page.test.tsx`'s own exact-text assertion
(`screen.getByText("Genuine opportunities")`) — the existing, real,
farmer-facing label is being kept.

Per the rebuild brief's own §14, Plan is marked **BLOCKED_HUMAN on list-
density taste (the same oscillation already logged for Today/Farm) and
on the raw-code/copy-cleanup decision**, and the Ask AI placement finding
is carried forward as evidence for Phase V7. The programme continues to
Phase V4 (Records).
