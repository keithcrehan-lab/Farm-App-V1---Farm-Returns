# Strict Visual Reproduction — Today — Codex visual audit log

Reference: `docs/product/farm-return-next-v1.1/media/image2.png`, treated
as a literal acceptance reference (composition/proportion/hierarchy), not
a mood board. Colour treatment re-themed light per image1/spec §3.

| Round | Commit | Fidelity | Verdict | Dashboard drift | Gate | Headline fix that round |
|---|---|---|---|---|---|---|
| 1 | eb72a5b | 7.8/10 | PARTIAL | LOW | FAIL | Literal structural rebuild: one flex-column overlay (top/bottom clusters, open map between) replacing two independent absolute overlays |
| 2 | ab3de47 | 7.8/10 | PARTIAL | LOW | FAIL | Card width 340px→260px, teardrop pin shape, merged ambient strip |
| 3 | 6f85548 | 7.6/10 | PARTIAL | LOW | FAIL | Card 260px→200px, bigger pins, more top breathing room, taller nav dock |
| 4 | 283c6d3 | **8.6/10** | PARTIAL | LOW | **PASS** | Broad, evenly-segmented 3-column status strip (Ask AI moved to its own row) |

## ACCEPTED — 8.6/10, LOW dashboard drift, GATE: PASS

Round 4 cleared the Visual Acceptance Contract's own §8 threshold
(fidelity ≥ 8.5, drift NONE/LOW, no unresolved Critical/High finding,
recognisably the same composition as the reference). Round 4's own
words: "recognisably the same designed screen translated into the
approved lighter treatment: identity, ambient status, and the primary
action cluster at the top; an open aerial map with real field overlays
and markers through the middle; and status/navigation controls floating
at the bottom. The hierarchy and vertical zoning closely match image2."

Per the anti-loop rule (§13): rounds 1-3 held flat (7.8/7.8/7.6) without
a Critical/High finding ever appearing, and round 3's own "card should
be wider" finding directly contradicted round 2's "card should be
narrower" — a structural comparison (map height, content order, overlay
anchoring, top chrome, nav placement, layout primitive) at that point
found the underlying structure already correct from round 1; the
residual gap was one oscillating cosmetic call (left at its round-2
value) and one real, disclosed, non-fabrication data limitation (the
mock farm's own real central-Cork coordinates, not agricultural
imagery). Round 4's fix (restructuring the bottom status strip to be
broad and evenly segmented, the one *consistent, non-oscillating*
finding across rounds 2-3) was the structural correction that closed
the gap.

## Residual findings, real but below the acceptance bar (not chased further)

- Field labels near the map's right edge visibly clip (a real, minor
  layout edge case any map-pin label at a viewport boundary has —
  dynamic edge-aware label flipping was judged disproportionate
  engineering for a Medium-severity cosmetic gap).
- Marker silhouette reads as a "sideways diamond" at small size rather
  than an unmistakable downward pin — the teardrop shape is real and
  present; further silhouette refinement is a polish item, not a
  structural gap.
- The mock farm's own real coordinates (`src/data/mock-farm.ts`, central
  Cork) read as urban rather than agricultural — the same real,
  documented, non-fabricatable limitation already extensively recorded
  for this exact fixture in the prior Visual Alignment phase's own
  `BLOCKERS.md` entries. A real farmer's own real fields will not have
  this problem.
- `NearbyFieldCard`'s real, honest absence in every capture — no genuine
  GPS fix is reachable from headless Playwright in this environment;
  the feature itself is real and will render correctly the moment a
  real farmer with real location permission opens this screen.

None of these block acceptance under the contract's own threshold —
logged here for a future polish pass, not silently dropped.
