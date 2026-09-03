# Phase V4 — Records — visual audit note

Reference: `docs/product/farm-return-next-v1.1/media/image1.png` panel 2
("RECORDS — Activity history & timeline") — a literal colour+composition
reference, same as Plan's panel 1.

## No Codex visual-audit round this phase — documented, not skipped silently

`records/page.tsx` returns an honestly empty timeline whenever Supabase
isn't configured (this environment's only reachable mode) — there is no
seeded mock/demo jobs-or-decisions data anywhere in this app to render a
populated screenshot from, by design (`CLAUDE.md`: never fabricate farm
data). A real farmer's authenticated Supabase session (seen once earlier
in this work session via the browser extension) has real data, but is not
reachable by this phase's own headless Playwright capture pipeline.

Auditing only the honest empty state (the one real screenshot this phase
could capture, `v4-records-mobile-after.png`) would be a low-value,
low-information review — there is close to nothing in it for an auditor
to score beyond "is a blank state calm," which this phase already
verified by inspection (serif title, plain centered copy, no fabricated
placeholder rows). The real work this phase delivers — real calendar-day
grouping (`ActivityTimelineCard.tsx`'s new `dayLabel`/`entryTimestamp`),
matching image1's own "TODAY — 29 AUG 2025" section labels — is verified
instead by 13 passing unit tests across real fixtures spanning multiple
calendar days (`ActivityTimelineCard.test.tsx`, `RecordsPageClient.test.tsx`),
confirming the grouping/sort logic is correct even though this phase
cannot show what the populated result visually looks like.

**Not resolved, carried forward**: a future phase (or this one, revisited
once a real farmer session is reachable from a capture pipeline) should
run the full screenshot + Codex-audit loop against a real populated
timeline before Records is considered visually accepted under the
Visual Acceptance Contract's own §8 threshold. Nothing in this phase's
own changes is provisional or a placeholder — the grouping logic is real
and will render correctly the moment real data exists — only the visual
acceptance step itself is deferred, for a real, disclosed reason.
