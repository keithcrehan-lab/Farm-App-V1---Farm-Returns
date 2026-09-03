# Farm Return Next — Visual Alignment / UI Rebuild — Final Report

**Starting SHA:** `a3df614` (the prior session's read-only visual capture
of the pre-rebuild app — `docs/visual-audit/current/`)
**Ending SHA:** see `git log -1 farm-return-next` at the time this report
was written; this document is not re-edited to chase a moving HEAD.
**Branch:** `farm-return-next` only — `main` untouched throughout.

## What this phase was

A dedicated presentation-layer rebuild per a detailed brief: replace the
app's remaining legacy visual shell with the approved Farm Return Next
light visual system (`media/image1.png`), applying the spatial
composition and interaction patterns of `media/image2.png`–`image6.png`
(dark mock-ups, composition-only references — never their colour
treatment) — while preserving every existing scientific/domain engine,
Supabase architecture, RLS, Prompt/Decision contract, and test suite
exactly as they were. `docs/product/farm-return-next-v1.1/
VISUAL_ACCEPTANCE_CONTRACT.md` was written first and is the durable
source of truth this report, and every future visual-acceptance
decision, should be checked against.

## Screens rebuilt (with independent Codex visual audits)

| Screen | Reference | Rounds | Final fidelity | Final dashboard drift | Status |
|---|---|---|---|---|---|
| **Today** | image2.png (composition) | 9 | 6.2/10 | LOW | Rebuilt; `BLOCKED_HUMAN` on final polish |
| **Farm / Field exploration** | image3.png (composition) | 2 | 6.8/10 | MEDIUM | Rebuilt; `BLOCKED_HUMAN` on map/detail-panel layout |
| **Plan** | image1.png panel 1 (literal) | 2 | 5.6/10 | HIGH* | Rebuilt; `BLOCKED_HUMAN` on list-density taste |

*Plan's dashboard-drift reading oscillated (MEDIUM → HIGH) between the
two rounds on a direct contradiction (see below) — not a regression from
round 1's real fix, a scoring-noise artifact of the same taste question.

None of these three reached the Visual Acceptance Contract's own formal
§8 threshold (fidelity ≥ 8.5, drift NONE/LOW, no unresolved Critical/High)
— this is reported plainly, not glossed over. Each did achieve real,
durable, independently-verified structural improvement over its starting
state (see each phase's own `docs/visual-audit/rebuild/<phase>/AUDIT_LOG.md`
for the full round-by-round account), and none regressed once fixed.

## Screen rebuilt without a visual audit (real constraint, disclosed)

| Screen | What changed | Why no Codex round |
|---|---|---|
| **Records** | Real calendar-day grouping (`ActivityTimelineCard`'s new `dayLabel`/`entryTimestamp`), serif title, single-surface layout matching Plan's own pattern | No populated timeline is reachable in this environment without fabricating data (`records/page.tsx` returns an honest empty state whenever Supabase isn't configured, and no real farmer Supabase session is reachable from the headless capture pipeline used for every other phase). Grouping/sort correctness verified instead by 13 passing unit tests across real multi-day fixtures. |

## Screens not attempted this session (each for a disclosed, real reason)

| Screen | Reason |
|---|---|
| **Active GPS Job Mode** (V5) | Only reachable from within a real active job session; the app's own `demoMode` branch is an explicit "not available here" stub, not a populated preview. Making unverifiable changes to an already-heavily-audited real-time GPS/offline flow was judged too risky without a screenshot to check against. |
| **Finish Job / Confirm Actual** (V6) | Same reachability constraint as V5. |
| **Ask AI placement** (V7) | Not attempted as its own phase, but a real, well-evidenced finding was surfaced during Plan's own audit: every one of image1's 8 reference panels shows Ask AI as a persistent bottom pill, not the header button this app uses everywhere today. Logged in `BLOCKERS.md` for whoever picks up V7. |
| **Livestock** (V8) | A real, complex 436-line functional screen; the reference composition overlays livestock counts on a real field map — a materially bigger rebuild than remaining session scope allowed to do with verified rigor. |
| **Satellite / Vegetation** (V9) | No existing screen to rebuild — the real domain/server code (CDSE scene discovery) has zero UI consumers yet. Building one from scratch is net-new feature work, not a visual rebuild. |
| **Legacy V1 screens** (Feed Optimiser, Finance, Input Planner, Soil, Housing, Silage, Livestock economics, Market Prices, Reports, Settings) | Out of the way of the core Today/Farm/Plan/Records priority per the brief's own §6; none reached before this session's natural scope boundary. |

## New reusable shell components (durable, tested, available to future phases)

- `src/components/farm/MapHero.tsx` — full-bleed real Mapbox satellite
  surface; renders each field's own real `polygon`/`centroid` as GL
  layers and map-pin markers; camera bounds-fit and (opt-in)
  fly-to-selection; honest "not configured" fallback, never a fake map.
- `src/components/farm/WeatherHeroChip.tsx` — compact real-weather chip,
  same audited `/api/weather/observations` pipeline as
  `CurrentConditionsCard`.
- `src/components/next/FarmSectionHeading.tsx` — plain uppercase-tracked
  section label, replacing per-section bordered `Card`s with one
  continuous flow (Plan, Records).
- `src/components/next/PromptCard.tsx`'s new `variant="light"` — a
  white/warm floating-card treatment for a map-overlay context, directly
  resolving the recurring "dark and tactical" finding.
- `src/lib/status.ts`'s new `promptStatusTone` — a field's map-marker
  tone derived from its own genuine leading Prompt, not a land-use
  category.

## A real bug found and fixed by this process

`MapHero`'s selected-field boundary highlight (`fr-field-line`/
`fr-field-fill` paint) was applied once, inside the map's one-time
`load` event handler — correct for whatever field was selected at first
load, silently frozen after that. A later selection change updated
markers (a separate effect that does re-run) but never touched the
boundary layers' own paint. Caught by Farm's own Codex audit round 1,
fixed with `map.setPaintProperty` re-applied on every relevant render.
This is exactly the kind of defect the screenshot-and-audit loop this
process required is designed to catch — not found by code review alone.

## Functional quality gate

Full `scripts/quality-gate.sh` (test/typecheck/lint/build) was run and
green after every phase's changes, every round, with no test ever
weakened to make the rebuild easier: **116 test files / 1509 tests
passing** at every commit in this phase (unchanged count from the
session's starting point — no coverage was removed). Every commit is
on `farm-return-next`; none target or touch `main`. No production
Supabase/database write occurred — all screenshot capture used this
app's own existing mock/demo-mode fallback (`isSupabaseConfigured()`
false) with the real Mapbox token still present, using the existing,
approved `src/data/mock-farm.ts` fixture, never invented data.

## Remaining blockers (see `docs/farm-return-next/BLOCKERS.md` for full detail)

1. Today: `BLOCKED_HUMAN` on marker/pin styling and exact primary-card
   position — a genuine, oscillating design-taste call across audit
   rounds, not a defect a further round is likely to resolve.
2. Farm: `BLOCKED_HUMAN` on the full-bleed-map-vs-FieldDrawer
   information architecture — a real IA decision beyond a visual-only
   rebuild's charter.
3. Plan: `BLOCKED_HUMAN` on the same list-density oscillation, plus a
   real, disclosed decision on raw evidence-code copy cleanup (shared
   orchestration-layer content, not Plan-specific).
4. Records: no populated-timeline visual acceptance yet — needs a real
   farmer session or seeded demo data this environment doesn't have.
5. Ask AI's real placement (bottom pill, per every image1 panel) is a
   genuine, well-evidenced, cross-cutting finding for Phase V7.
6. `PageHeader`'s desktop `weather` prop defaults to a hardcoded,
   fabricated "12°C · Light Rain" reading on ~20 screens — pre-existing,
   not introduced by this phase, logged for a future pass.
7. V5/V6/V8/V9 and every legacy V1 screen remain visually unaddressed.

## Final answer

**Does the current build visually represent the Farm Return Next product
we approved?** Partially, and unevenly. The four highest-priority
screens named by the brief — Today, Farm, Plan, Records — are
materially closer to "opening your farm" than before this phase: a real
aerial map with real field pins replaces a flat SVG schematic on three
of them; the "dark and tactical" and "GIS overlay" failure modes that
dominated early audit rounds were both durably fixed and never
regressed; Plan and Records no longer read as stacks of generic
dashboard cards. None of the four has reached the Visual Acceptance
Contract's own formal acceptance bar, and five of the nine planned
screens (plus every legacy V1 screen) were not reached at all this
session. A farmer opening Today, Farm, Plan, or Records today would
reasonably see meaningful progress toward "their farm, not a dashboard"
— but would still find several rough edges, and would find the rest of
the app (Livestock, GPS Job Mode, Confirm Actual, Satellite, every
legacy screen) visually unchanged from before this phase began.
