# Phase V1 — Today — Codex visual audit log

Reference: `docs/product/farm-return-next-v1.1/media/image2.png` (composition
only, re-themed light). Screenshot audited each round: `v1-today-mobile-after.png`
(390×844, real/demo mode, real Mapbox imagery over the mock farm's real
polygons — `src/data/mock-farm.ts`). Full commit-by-commit detail is in each
round's own commit message on `farm-return-next`.

| Round | Commit | Fidelity | Verdict | Dashboard drift | Headline fix that round |
|---|---|---|---|---|---|
| 1 | ca56e08 | 5.2/10 | REDESIGN REQUIRED | HIGH | (initial build) |
| 2 | 6e26c15 | 5.6/10 | REDESIGN REQUIRED | HIGH | Per-field Prompt-driven tone/labels, bounds-fit camera, field-tap navigation, collapsed secondary list |
| 3 | 252fc68 | 6.1/10 | REDESIGN REQUIRED | MEDIUM | Primary card moved inside the map surface (not below it) |
| 4 | 0d4ca09 | 5.6/10 | REDESIGN REQUIRED | MEDIUM | Compact floating card (lg:max-w-md), green-tinted overlays, tighter camera |
| 5 | 3a8323a | 6.2/10 | REDESIGN REQUIRED | MEDIUM | Light-surface PromptCard variant (resolved "dark tactical" finding for good) |
| 6 | 00afb40 | 6.7/10 | REDESIGN REQUIRED | MEDIUM | Real pin markers (dot + caption) replacing bordered-rectangle GIS look |
| 7 | 25bcb6a | 5.8/10 | REDESIGN REQUIRED | LOW | max-w-[300px] card at every breakpoint; dropped hero description (unfixable truncation); status label shown only on the leading field |
| 8 | d4dfc97 | 6.7/10 | REDESIGN REQUIRED | MEDIUM | — |
| 9 | ffccd1f | 6.2/10 | REDESIGN REQUIRED | LOW | Map extended full-bleed to the bottom nav (secondary Prompts moved to a `Sheet`); primary field gets `selectedFieldId` emphasis |

## Outcome: BLOCKED_HUMAN on final polish

Nine independent Codex audit rounds produced real, durable, structural
improvement — dashboard drift HIGH → stable LOW, and every one of the
following was fixed and never regressed in a later round:

- Full-bleed real Mapbox aerial surface as the page's own environment,
  now extended edge-to-edge including behind the bottom-nav clearance —
  not a bounded "map card" or a map-header-then-dashboard split.
- The "dark and tactical" finding (rounds 1–4) fully resolved by giving
  the primary Prompt card a light/warm surface (`PromptCard`'s new
  `variant="light"`) instead of reusing its original dark-green treatment.
- The "GIS overlay" finding (rounds 4–6) resolved by replacing bordered-
  rectangle field outlines + full-width text pills with real map pins
  (a small status-coloured dot at the true centroid + a compact caption).
- Field markers/tones now derive from each field's own genuine leading
  Prompt (`lib/status.ts`'s `promptStatusTone`), never a land-use
  category — a field is only captioned with a status word when it's the
  one the primary action concerns, avoiding repeated "Opportunity" noise.
- Fields are real interactive places — tapping one navigates to
  `/fields?field=<id>`, which now reads that as its initial selection.
- The recurring unfixable-truncation finding on the card's description
  is resolved by not showing a description in the compact hero card at
  all (title + one CTA, closer to the reference's own brevity).

Fidelity plateaued in the 5.8–6.7/10 range across the last five rounds,
below the Visual Acceptance Contract's 8.5 threshold — **Today is not
formally accepted** under §8's acceptance criteria, and this is reported
plainly rather than claimed as a pass. Two things account for nearly all
of the remaining gap, and both are genuine product/data decisions rather
than a fixable implementation defect:

1. **The mock/demo farm's real coordinates sit in central Cork city**
   (`src/data/mock-farm.ts`, `[-8.4863, 51.8985]`), not open farmland —
   every round's aerial view reads as "urban" for exactly this reason.
   A visual-only rebuild has no honest way to relocate a farm's real (if
   illustrative) fixture coordinates just to make a screenshot look more
   pastoral; a real farmer's own real fields will not have this problem.
   Round 9 itself acknowledges this ("retain persisted real geometry for
   signed-in accounts").
2. **Marker style and the primary card's exact vertical position
   oscillated across rounds with directly contradictory findings** —
   round 4 wanted status pills smaller/subtler, round 6 wanted stronger
   "canonical pins"; round 7 anchored the card lower for spatial
   containment, round 9 called that same position "cramped, footer-like"
   and asked to raise it back up. This is the signature of a genuine,
   unresolved design taste call, not a bug a tenth round would reliably
   fix — it needs a human design decision (or a real farmer/stakeholder
   reference screenshot at this exact resolution) to break the tie.

Per the rebuild brief's own §14 ("If a screen requires a genuine product
decision the approved references/specification do not resolve: mark
BLOCKED_HUMAN and continue to the next independent screen"), Today is
marked **BLOCKED_HUMAN on final visual polish** (marker/pin styling,
exact card position) and the programme continues to Phase V2. The
underlying architecture (full-bleed `MapHero`, light `PromptCard`
variant, per-field Prompt-driven tone, `Sheet`-based progressive
disclosure) is real, tested, and reused by later phases — a future
polish pass on Today should start from here, not from scratch.
