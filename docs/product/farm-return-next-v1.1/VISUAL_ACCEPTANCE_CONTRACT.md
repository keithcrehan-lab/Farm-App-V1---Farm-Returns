# Farm Return Next v1.1 — Visual Acceptance Contract

Frozen at the start of the Visual Alignment / UI Rebuild phase on
`farm-return-next`, starting SHA `a3df614`. This document is the visual
source of truth every rebuilt screen is measured against — the Codex
visual-audit loop (`docs/visual-audit/rebuild/`) scores against this
contract, `FARM_RETURN_NEXT_SPEC_v1_1.md`, and the six reference images in
`docs/product/farm-return-next-v1.1/media/`, in that order. It sits
alongside, and must stay consistent with, `design/design-system.md`
(token values) — this file adds the composition/identity rules that
tokens alone can't express.

## 0. How to read the six reference images

- `image1.png` — **colour and surface reference.** Light, warm, calm,
  premium. This is the only image whose colour treatment is canonical.
- `image2.png`–`image6.png` — **spatial composition and interaction
  reference only.** Their dark theme is explicitly not the approved
  colour system (spec §8's own note). Build their layout, hierarchy and
  interaction pattern, re-themed into image1's light system.

Never re-implement the dark treatment of images 2–6. Never treat image1's
screens as layout templates to copy verbatim if a spec section describes
a different real-data-driven composition for that screen — image1 is a
colour/surface reference across several representative screens, not a
literal spec for every screen it happens to show.

## 1. Core visual identity

Farm Return Next reads as **a living model of the farmer's own farm**,
not a management console. Every primary screen should pass "does this
feel like opening my farm, or opening farm-management software?" with
"opening my farm."

- Light, warm, calm, premium, consumer-grade — not enterprise SaaS.
- Spatial and contextual — organised around real places (fields, jobs,
  the farm itself), not around data modules.
- Highly visual — aerial/satellite imagery and real field geometry are
  load-bearing UI, not decoration.
- Restrained — one strong idea per screen, not maximum information
  density.

## 2. Avoid list

A rebuilt screen must not exhibit any of the following. Any one of these
present in a Codex audit is at minimum a Medium finding; more than one on
a core screen is a `REDESIGN REQUIRED`.

- Dense KPI grids (rows of small equal-weight number tiles) as the primary composition of a core screen.
- A conventional dashboard home screen (header → stat row → stacked
  generic cards → chart).
- Stacks of equal-weight white cards with no visual hierarchy or spatial
  anchor.
- Heavy admin tables as the primary **mobile** experience (a table is
  acceptable as a secondary/expanded desktop view, never as the first
  thing a farmer sees on a phone).
- Dark tactical UI on any production light-mode screen.
- Unnecessary glassmorphism (blur-heavy panels with no functional reason
  for translucency).
- Excess borders/chrome — every extra hairline or divider must earn its
  place.
- Module-menu-first navigation (a home screen that is itself a menu of
  features).
- Generic analytics-dashboard composition on any core screen (Today,
  Farm, Field detail, Job, Confirm Actual).

## 3. Surface system

(Values from `design/design-system.md`; this section states the rules of
use.)

- Base: warm off-white / light neutral (`--fr-surface-alt`), never a cold
  grey or pure white expanse.
- Primary accent: restrained agricultural green (`--fr-green-700`/`900`)
  — used for identity, primary actions and the one hero card per screen,
  not spread across every element.
- Cards: subtle border (`--fr-border`), soft low-elevation shadow
  (`--shadow-fr-card`), generous rounded corners (`--radius-fr-card`,
  20px). No heavy skeuomorphic depth.
- Status colour is semantic only, never decorative:
  - Amber (`--fr-status-attention`) — needs-confirmation / attention only.
  - Red/orange (`--fr-status-risk`) — genuine risk or regulatory
    restriction only.
  - Blue (`--fr-status-info`) — informational / data-source context only
    (weather, mapped source, external data).
  - Green (`--fr-status-good`) — good / verified / confirmed only.
- Real aerial/satellite imagery is the preferred background/hero surface
  wherever the app already holds real field geometry (`Field.polygon`,
  `Field.centroid`) — never a flat schematic standing in for a photo once
  a real map surface is available for that context.

## 4. Typography

- Serif/display (`font-display`) for high-level farm/field headings and
  the single hero figure on a screen — used deliberately, not globally.
- Clean sans-serif (Inter, the existing default) for functional info,
  numbers, labels, body text.
- Keep the existing type scale tokens (`text-hero/metric/title/body/label`)
  — do not introduce a second scale.
- Never regress a core screen to generic admin-dashboard type treatment
  (small uniform headings, no display type anywhere).

## 5. Navigation

Today / Farm / Plan / Records remains the primary bottom nav (mobile) /
left rail (desktop) structure — unchanged by this rebuild. Moving between
them should feel like moving through one operating system built around
the farmer's own farm, not opening separate software modules: shared
shell, shared map/spatial language, shared card system, consistent
provenance treatment throughout.

## 6. Ask AI

Persistent but secondary on every screen. It must never visually compete
with, or outweigh, the farm/map/current-action content that screen exists
to show. It is a small, consistent affordance (button/chip) that opens a
contextual sheet — never a full-screen takeover, never the first thing a
farmer's eye lands on.

## 7. Canonical visual shell (component inventory)

Reusable primitives introduced or formalised by this rebuild, in
`src/components/next/` and `src/components/farm/` (do not create a
second, competing set of near-duplicates — extend these):

| Primitive | Purpose | Status |
|---|---|---|
| `MapHero` | Full-bleed real Mapbox satellite surface with field markers, used as the spatial anchor for Today/Farm/Field/Job screens | New (this rebuild) |
| `SpatialMarker` | A pin/marker placed at a real `Field.centroid` on a `MapHero`, carrying a status tone | New (this rebuild) |
| `PromptCard` | "What matters now" hero prompt card | Existing — reused |
| `PageHeader` / `MobileGreetingHeader` | Screen header shell | Existing — reused |
| `MobileBottomNav` | Primary nav | Existing — unchanged |
| `AskAIButton` / `AskAISheet` (`AskAI.tsx`) | Contextual assistant | Existing — reused |
| `Card` / `CardHeader` / `CardTitle` | Generic card surface | Existing — reused |
| `Sheet` | Bottom-sheet / modal shell | Existing — reused |
| `StatusPill` / status badge treatment | Evidence/status chip | Existing (`EVIDENCE_STATE_UI_LABEL` + status tokens) — reused |

New primitives are added only when no existing component can be
reasonably extended, per `CLAUDE.md`'s reuse rule.

## 8. Acceptance thresholds (core screens)

For Today, Farm, Field Detail, GPS Job Mode, Confirm Actual, Plan,
Records, Ask AI:

- Visual fidelity ≥ **8.5/10** against this contract + the matching
  reference image.
- Codex verdict `MATCH`, or a strong `PARTIAL` with only minor polish
  remaining.
- Dashboard drift `NONE` or `LOW`.
- No unresolved Critical/High visual-identity finding.

## 9. Non-negotiables carried over from `CLAUDE.md` / the rebuild brief

- No fabricated map data, farm metrics, or scientific/financial numbers
  introduced to make a screen match a reference more closely.
- No working domain/business logic removed or weakened to simplify a
  screenshot.
- Provenance (Estimated/Farmer Actual/Verified/etc.) stays visually
  distinct on every rebuilt screen.
