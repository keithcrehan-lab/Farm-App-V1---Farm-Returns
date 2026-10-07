# Farm Return — design system & tokens

Derived from spec section 12 ("Design system and responsive behaviour") and
visual audit of `design/reference/master/*.png` and `design/reference/mobile/*.png`.
This is the starting token set for Phase 1. Treat colour hex values as an
**initial estimate** — pixel-sample the reference PNGs precisely during the
Phase 1 screenshot-comparison step (`CLAUDE.md` § Screen workflow) and correct
any token that doesn't match, rather than treating these numbers as final.

## Farm Spatial V2 authority (2026-10-06)

`design/farm-spatial-v2/DESIGN_CONTRACT.md` is the **authoritative** design
contract for Farm Spatial V2 surfaces: the Farm/home spatial screen and the
Farm/Fertiliser screens migrated into it (field drawer, field nutrient plan,
whole-farm nutrient plan, fertiliser purchase/application plan, and the
Plan and Market handoffs from them). Where this file conflicts with that
contract on those surfaces, **the contract wins**. The canonical interactive
reference is
`design/reference/farm-spatial-v2/approved/farm_return_design_system_refined.html`
(immutable; visual/interaction reference only, never production data).
The data source for every element is in
`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md`.

Unmigrated legacy screens keep the guidance below unchanged. Do not
restyle them globally as a side effect of Farm Spatial V2 work.

### Conflicts resolved explicitly

| Topic | Legacy guidance below | Farm Spatial V2 surfaces |
|---|---|---|
| Composition | Card grids; "cards retain the same rounded/soft-shadow treatment"; desktop "KPI row → 2–3 column card grid" | One dominant canvas (map or information plane). "A container must earn its border." No KPI tiles and no equal-width card grids. Use rules, whitespace, typography, columns and colour planes. |
| Card radius | 16–20px everywhere (`--radius-fr-card`) | Controls ~6–10px, rows ~6–8px or no container, data planes 0–6px, bottom drawer ~18–24px top radius. Pills only for segmented controls or compact statuses. |
| Elevation | Soft card shadow on every card (`--shadow-fr-card`) | Almost none inside data screens. Restrained elevation only on map overlays and drawers. |
| Brand green | `--fr-green-700` for primary buttons, active nav and key figures | Forest `#173F2D` only for brand and confirm/commit actions. Colour carries domain meaning: cobalt (conditions, N), harvest yellow (nutrients, P), teal (grass, organic/slurry), plum (livestock, K), clay (soil, housing). |
| Hero figures | `text-hero` 36px bold sans in a dark green hero card | Large display numerals may dominate an information plane with quieter units and tabular numerals. Never in a KPI tile. |
| Category icon chips | Soft green circular chip on every card header | Not used. Domain colour lives in rules and bands, and N/P/K keep cobalt/yellow/plum identity. |
| Iconography for livestock/sheds | Optional illustration where it helps recognition | Recognisable agricultural silhouettes in the object rail. Never crude SVGs or emoji. Sheds are rail objects, not map markers. |
| Navigation | Home · Map · Livestock · Inputs · More / long desktop rail | Farm · What Matters · Plan · Market · Finance. Every existing screen stays reachable (IMPLEMENTATION_MAP §2). |
| Motion | Subtle drawers | Functional motion only: 140–220ms UI, 220–350ms drawers. Respect `prefers-reduced-motion`. |

Status semantics (good/attention/risk/info) and provenance badges are
**unchanged**. A provenance or status meaning must still be shown on V2
surfaces, rendered in the V2 visual language.

### Tokens

Farm Spatial V2 tokens use a separate `--fr-v2-*` namespace in
`src/app/globals.css`, with Tailwind utilities `*-fr-v2-*`. They are additive.
Legacy `--fr-*` values are unchanged, and only V2 surfaces may use V2 tokens.

| Token | Value | Meaning |
|---|---|---|
| `--fr-v2-forest` | `#173F2D` | Brand; confirm/commit |
| `--fr-v2-graphite` | `#171B18` | Primary structure/text |
| `--fr-v2-charcoal` | `#232824` | Secondary dark structure |
| `--fr-v2-muted` | `#69716B` | Secondary text |
| `--fr-v2-paper` | `#F8FAF8` | V2 page surface |
| `--fr-v2-rule` | `rgba(24,31,26,0.16)` | Hairline rules |
| `--fr-v2-cobalt` / `-tint` | `#356C9F` / `#E7F2FB` | Conditions, weather, information, N |
| `--fr-v2-harvest` / `-tint` / `-strong` / `-ink` | `#D19A2A` / `#FFF4C9` / `#F0C54E` / `#A9720F` | Nutrients/fertiliser, P, attention (`-ink` = legible P text on light) |
| `--fr-v2-teal` / `-tint` | `#337B74` / `#DFF2EE` | Grass, organic nutrients, slurry |
| `--fr-v2-plum` / `-tint` | `#79526F` / `#F1E8EF` | Livestock, K |
| `--fr-v2-clay` / `-tint` | `#AA644C` / `#F8E7DF` | Soil, housing, land condition |
| `--fr-v2-glass` | `rgba(18,24,20,0.86)` | Dark overlay plane on map photography (lens bar) |
| `--fr-v2-radius-plane` / `-row` / `-control` / `-drawer` | `0` / `6px` / `8px` / `20px` | Geometry (contract §6) |
| `--fr-v2-shadow-overlay` / `-drawer` | see CSS | Restrained elevation for map overlays/drawers only |
| `--fr-v2-duration-ui` / `-drawer`, `--fr-v2-ease-out` | `160ms` / `240ms`, `cubic-bezier(.16,.72,.24,1)` | Motion |

Display numerals reuse the existing `--font-display` serif stack, which is
semantically identical to the reference. Spacing stays on Tailwind's
default 4px grid.

## Brand direction

High-end fintech/consumer software applied to farming — not a generic admin
dashboard. Deep forest green + white/off-white surfaces, bold numeric
hierarchy, calm data visualisation, satellite map as hero surface.

## Colour tokens

### Core palette

| Token | Approx. hex | Usage |
|---|---|---|
| `--fr-green-900` (nav) | `#0F2818` | Desktop left rail background, dark hero card gradient base (Finance hero, Home spreading hero). |
| `--fr-green-700` (primary) | `#1B5E3E` | Primary buttons, active nav item, key financial figures, brand wordmark/logo mark. |
| `--fr-green-600` | `#2E7D4F` | Secondary green accents, chart positive lines. |
| `--fr-green-100` | `#E3F2E8` | Light green fill for status-good chips/backgrounds (e.g. "Verified" badge, good-score ring track). |
| `--fr-ink-900` | `#101828` | Primary heading/number text. |
| `--fr-ink-600` | `#475467` | Secondary/label text. |
| `--fr-ink-400` | `#98A2B3` | Placeholder/disabled/tertiary text. |
| `--fr-surface` | `#FFFFFF` | Card surfaces. |
| `--fr-surface-alt` | `#F7F8F6` | Page background (off-white, faint warm-neutral tint). |
| `--fr-border` | `#E4E7EC` | Card and input borders — subtle, low-contrast. |

### Status semantics (spec §12 — used consistently, never repurposed)

| Token | Approx. hex | Meaning |
|---|---|---|
| `--fr-status-good` | `#2E7D4F` (green) | Good / optimal / confirmed / verified. |
| `--fr-status-attention` | `#D98324` (amber) | Attention / marginal / farmer-adjusted / estimated. |
| `--fr-status-risk` | `#C0362C` (red) | Blocked / risk / hard stop / deficit. |
| `--fr-status-info` | `#2563AC` (blue) | Information / data / weather / mapped source. |

### Provenance badge mapping (drives `StatusBadge`/`SourceBadge`)

| Data status | Colour token | Example from references |
|---|---|---|
| Verified | `--fr-status-good` (green chip) | "Verified" badge, River Field soil status. |
| Farmer adjusted | `--fr-status-attention` (amber chip) | "Farmer adjusted" badge, Back Field soil status. |
| Estimated | neutral grey chip, `--fr-ink-600` on `--fr-surface-alt` | "Estimated" badge, Home/Road Field soil status. |
| Hard stop / risk | `--fr-status-risk` | River Field spreading score "0 — Do not spread". |

## Typography

- **Family:** Inter / Inter Display (system-ui, -apple-system, Segoe UI,
  Roboto as fallbacks).
- **Numeric hierarchy:** hero figures (farm margin, KPI headline numbers)
  are large and bold — approx. 32–40px / 700 weight on mobile hero cards,
  scaling up on desktop hero cards. Section metric numbers (MetricCard) sit
  around 24–28px / 700.
- **Body:** 14–16px / 400–500 for card labels and row content.
- **Secondary/compact labels:** 12–13px / 500, `--fr-ink-600`, often
  uppercase-tracked for field labels like "Mapped soil", "Drainage".
- **Type scale (Tailwind-style):**

  | Token | Size / line-height | Weight | Use |
  |---|---|---|---|
  | `text-hero` | 36px / 40px | 700 | Farm margin / hero KPI figure. |
  | `text-metric` | 24px / 28px | 700 | Card metric numbers (Total Revenue, Total Costs…). |
  | `text-title` | 20px / 26px | 600 | Page/card titles ("Dashboard", "Soil"). |
  | `text-body` | 15px / 22px | 400–500 | Default body/row text. |
  | `text-label` | 12px / 16px | 500 | Compact secondary labels, table headers. |

## Spacing & layout

- **Base unit:** 4px grid (Tailwind default spacing scale).
- **Card padding:** 16–20px mobile, 20–24px desktop.
- **Card gap:** 12–16px between stacked mobile cards; 16–24px grid gap on
  desktop multi-column layouts.
- **Page gutters:** 16px mobile, 24–32px desktop content area (inside the
  left rail).
- **Desktop left rail width:** ~240–260px, fixed, dark green.
- **Desktop content max grid:** multi-column card grid (2–4 columns
  depending on card type), never a single scaled-up mobile column.

## Radii & elevation

- **Card radius:** 16–20px (`rounded-2xl`-ish) — consistently rounded,
  refined rather than playful.
- **Control/button/chip radius:** 10–12px for buttons and inputs; full
  pill radius for status chips/badges and the segmented tab control (e.g.
  "Mapped / Assumptions / Verified Tests").
- **Elevation:** low-elevation soft shadow only (`0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)`
  equivalent) — no heavy drop shadows or skeuomorphic depth.
- **Field map imagery:** photographic satellite crop with rounded-rect mask
  matching card radius; field polygons drawn with a 2–3px white/coloured
  outline and a semi-transparent fill tinted by status/land-use colour.

## Iconography

- Lucide line-icon set as the base; consistent 20–24px stroke icons in nav
  and card headers (house, sprout/leaf, flask, tractor, bar-chart for the
  bottom nav in the references: Home / Soil / Nutrients / Spreading /
  Finance).
- Category icon chips: small circular soft-green background
  (`--fr-green-100`) containing a 16–20px line icon — used consistently for
  card section headers (Soil coverage, Nutrient requirement, Organic
  nutrients, Purchased fertiliser, etc.).
- Agricultural-specific icon assets (cow silhouette, shed illustration) only
  where they materially improve recognition — e.g. the isometric shed
  illustration on Housing & Slurry, the cow photo on Finance/Livestock
  Economics headers.

## Charts

- Simple, calm, legible — no 3D or decorative gradients beyond the
  intentional dark-green hero-card background treatment.
- Line charts (cashflow, margin trend): single or dual-series, thin
  (~2px) stroke, soft fill gradient under the line at low opacity, minimal
  gridlines.
- Bar charts (nutrient requirement N/P/K, revenue vs cost): flat fill in
  status/category colour, rounded bar end caps, value labels alongside not
  inside.
- Score rings (spreading score, soil health, planning confidence): circular
  progress ring, colour driven by status semantics (green/amber/red),
  bold centred number + `/100` or `%` suffix.
- Horizontal progress/segmented bars: silage deficit bar (green→red
  gradient with a target marker), storage fill level.

## Motion

- Subtle transitions and drawers (field drilldown slides in from a card as
  a drawer/detail screen). Respect `prefers-reduced-motion`. No animation
  that hides information (e.g. no auto-collapsing content the farmer needs
  to act on).

## Density

- **Mobile:** one focused card/section at a time, vertically progressive
  scroll, bottom nav persistent, 5 primary tabs + "More".
- **Desktop:** multi-column overview (KPI row → 2–3 column card grid →
  wide timeline/table row), persistent left rail, never a dense spreadsheet
  wall — cards retain the same rounded/soft-shadow treatment as mobile.

## Navigation structure (source of truth for `AppShell`)

**Mobile bottom nav** (5 slots, varies slightly by module per the
reference screens — canonical global set per spec §12):
Home · Map/Fields · Livestock · Inputs/Planner · More (contextual — module
pages substitute Soil/Nutrients/Spreading/Finance into the active tab
position as shown in the individual reference screens).

**Desktop left rail** (in order, per `master-02-responsive-system.png`):
Dashboard · Farm Map · Soil · Livestock · Silage & Fields · Fertiliser Plan
· Feed Optimiser · Input Planner · Finance · Market Prices · Reports ·
Settings. Spreading promoted to first-class rail item if the final route
inventory keeps it separate from Fertiliser Plan (see
`docs/product-requirements.md` §4 route table).

## Component → token mapping quick reference

| Component | Token usage |
|---|---|
| `MetricCard` | `--fr-surface`, `--fr-border`, `text-metric`, status-coloured delta text. |
| `FinancialHeroCard` | `--fr-green-900` background w/ landscape photo overlay, white text, `text-hero`. |
| `StatusBadge` / `SourceBadge` | Provenance badge mapping above, pill radius. |
| `ScoreRing` | Status-semantic ring colour, bold centred `text-metric`-scale number. |
| `HardStopAlert` | `--fr-status-risk` background tint + icon, non-dismissible styling. |
| `FieldCard` / `FieldPolygonLayer` | Satellite imagery + status-tinted polygon fill/outline. |
