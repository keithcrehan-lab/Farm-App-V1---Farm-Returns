# Farm Return — screen specification

Module-level content and layout, audited from `design/reference/`. Per the
source-of-truth hierarchy (`design/reference/README.md`), this file is more
detailed than the master boards and wins for its module if they conflict.
All sample names/figures below (Patrick Murphy / Ballybeg Farm / Keith /
John Dempsey / €47,820 etc.) are illustrative demo values from the
references — never hardcode them as anything but mock data.

## Route → reference map

| Route | Reference image(s) |
|---|---|
| `/dashboard` | `mobile/mobile-dashboard-home.png`, `master/master-01-ecosystem-overview.png`, `master/master-02-responsive-system.png` |
| `/fields` | `master/master-01-ecosystem-overview.png` (Fields Map), `master/master-02-responsive-system.png` (Map, Farm Map desktop) |
| `/soil` | `mobile/mobile-soil-overview.png`, master boards' Soil panels |
| `/nutrients` | `mobile/mobile-nutrient-planner.png`, master boards' Fertiliser Plan / Soil Map & Analysis panels |
| `/housing` | `mobile/mobile-housing-slurry.png` |
| `/silage` | `mobile/mobile-silage-planning.png` |
| `/spreading` | `mobile/mobile-spreading.png` |
| `/finance` | `mobile/mobile-finance.png`, master boards' Financial Overview panels |
| `/livestock` (economics drilldown) | `mobile/mobile-livestock-economics.png`, master boards' Livestock panels |
| `/feed-optimiser` | `mobile/mobile-feed-optimiser.png`, master board Feed Optimiser desktop panel |
| `/input-planner` | master boards' Input Planner desktop panel and mobile Input Planner summary strip |

Desktop-only detail for Housing, Silage, Livestock Economics, Feed
Optimiser and Spreading is not separately supplied — build these from the
mobile detail screen's content using the desktop grid rules in
`design/design-system.md`, and flag layout judgement calls at Phase 1
review (see `docs/product-requirements.md` § open questions).

## App shell

### Mobile bottom nav (persistent)

Icons in order, from the reference screens: **Home** (house) · module tab
2 (Map / Soil / Livestock — contextual) · module tab 3 (Livestock / Soil /
Nutrients — contextual) · module tab 4 (Inputs / Spreading — contextual) ·
**Finance** (bar-chart), plus a **More** overflow (⋯) seen on the Dashboard
"Today's Actions" style screens. Active tab is filled/coloured
`--fr-green-700`; inactive tabs are `--fr-ink-400` outline icons.
Concretely, per-screen bottom nav content observed:
- Home screen: Home · Soil · Nutrients · Spreading · Finance.
- Map/Livestock/Soil screens (master-02): Home · Map · Livestock · Inputs ·
  More.

Reconcile to the canonical 5-slot set in `docs/product-requirements.md` §12
during Phase 1; module pages substitute the active contextual tab.

### Desktop left rail (persistent, dark green `--fr-green-900`)

Logo mark + "Farm Return" wordmark top, then nav items with icon + label,
active item on a lighter green rounded pill highlight:
Dashboard · Fields (Farm Map) · Soil · Livestock · Feed Optimiser · Input
Planner (badged "NEW" in reference) · Finance · Market Prices · Reports ·
Settings — with Silage & Fields, Fertiliser Plan and Spreading as
additional rail items per the fuller `master-02` desktop rail (12 items
total, see `docs/product-requirements.md` §4/§12). User account row pinned
to the bottom of the rail (avatar initial, name, farm name, overflow menu).

### Page header pattern (desktop)

Left: page title + one-line subtitle ("Overview of your farm performance").
Right: contextual utilities — live weather chip (icon + temp + condition),
notification bell (with unread dot), season/period selector dropdown
("2026 Season" / "2027 Season").

## `/dashboard`

**Mobile — Home** (`mobile-dashboard-home.png`):
1. Header: logo, "Good morning, {name}" + subtitle, avatar.
2. **Best spreading opportunity** card: icon + label, big score `86/100`,
   suitability breakdown line ("7 fields suitable · 3 marginal · 2
   unsuitable").
3. **Farm map hero**: satellite image, field polygons labelled with name +
   per-field score badge, colour-coded by score band (green/amber/red).
4. 2×2 `MetricCard` grid: Estimated fertiliser cost (+ trend), Slurry
   available (+ % of storage), Mapped fields (+ delta this month), This
   month's savings potential (+ "See recommendations" link).

**Mobile — alternate Home layout** (`master-01`, "Hello, Patrick" variant)
adds: Farm Overview sparkline card (margin + trend chart), a KPI strip
(Livestock count, hectares "In Farm", Plan Confidence %, Alerts count),
"Today's Actions" list (priority-tagged action rows), all above a Field
Overview drawer pattern reached by tapping a field.

**Desktop — Dashboard** (`master-01`, `master-02`):
1. Page header (see App shell pattern above) with weather + notifications +
   season selector.
2. KPI card row: Forecast Farm Margin (+ sparkline), Total Revenue (+ Δ%),
   Total Costs (+ Δ%), Plan Confidence (ring), Carbon Score (ring/grade).
   Alt desktop layout (`master-02`): Farm Profit Forecast hero (big number
   + trend chart inside hero card) + Key Farm KPIs list (Gross Margin,
   Direct Costs, Stock Value, Cash Position, Debt) + Livestock Overview
   donut + Tasks & Alerts list — laid out as a 3–4 column card grid.
3. **Farm at a Glance**: satellite map card with field selector dropdown
   ("All Fields (12)"), "View all fields →" link.
4. **Livestock Overview**: total count + breakdown by category list,
   "View livestock →".
5. **Financial Overview**: donut chart (Revenue vs Costs) + margin figure,
   "View full report →".
6. **Alerts & Recommendations**: list of severity-tagged rows (red/amber/
   blue left icon chip), "View all" link.
7. **Upcoming Timeline**: horizontal Gantt-style strip, rows = category
   (Fertiliser, Silage, Slurry, Sowing, Housing…), months Jan–Dec across
   the top, coloured bars mark windows.
8. **Input Summary** card: per-category quantity + cost rows (Fertiliser,
   Feed, Lime, Minerals, Bale Wrap, Other) + Total, "View input planner →".
9. **Market Watch**: live price rows (Beef, Weanling, Barley, fertiliser
   product) with Δ% and mini sparkline.

## `/fields`

Map-led module (see spec §5, §2). Header: "Fields" list toggle ("All
Fields (12)") + Map/Soil/Zones tab control on mobile. Hero: full-bleed
satellite map with numbered/named field polygons, colour by planned use
(grass/silage/winter crop/other — legend at bottom of desktop Farm Map
card). Selecting a field opens a **FieldDrawer**: field name + area, tab
bar (Overview/Map/Soil…), "Planned Use" row with icon + edit chevron,
cutting window / est. yield summary row, "Edit Field →" CTA. Desktop Farm
Map card includes zoom controls, a layer-toggle icon, and the same
use-colour legend.

## `/soil`

**Mobile — Soil** (`mobile-soil-overview.png`):
1. Header + avatar.
2. Segmented tab control: **Mapped / Assumptions / Verified Tests** (pill
   style, active tab filled green).
3. **Soil coverage** summary card: fields mapped count, verified tests
   count, planning accuracy % (with info tooltip icon).
4. Filter chip row: All fields / Grass / Silage / Arable + funnel icon for
   more filters.
5. Field list — each row: field thumbnail (satellite crop), name + area,
   "Mapped soil" value + "Drainage" value, **provenance badge**
   (Estimated/Farmer adjusted/Verified — pill, colour per design-system.md
   provenance mapping), P Index and K Index **1–4 segmented selectors**
   (tap to set, active segment filled in status colour — green when low
   priority/good, amber/orange when farmer-adjusted), "Add soil test" /
   "Edit assumptions →" row actions. Verified rows replace the selector
   with a "Verified test on {date} — View test →" row.

Desktop: same card content reflowed into a 2–3 column field-card grid
(each card = the mobile row's content in card form) beneath a page header
and the coverage summary as a card row, per the `master-01` "Soil Map &
Analysis" panel (map + P/K/pH/organic matter summary strip alongside the
field grid).

## `/nutrients` (Fertiliser Plan)

**Mobile — Nutrient planner** (`mobile-nutrient-planner.png`):
1. Back header "Nutrient planner" + overflow menu.
2. Field identity row: thumbnail with score badge, name, area, planned use,
   "View map" pill button.
3. **Soil profile** card (chevron → detail): mapped soil type, drainage,
   source (e.g. "Teagasc + Sentinel").
4. **Fertility assumptions** card (chevron → detail): P Index / K Index
   1–4 selectors, pH status, "Add soil test" button.
5. **Nutrient requirement** card: N/P/K kg/ha figures (colour-coded per
   nutrient: N blue, P orange, K red) + "Total for field" NPK kg figure in
   a side panel.
6. **Organic nutrients** card: planned slurry application rate (m³/ha +
   total m³) alongside "Nutrient offset from slurry" N/P/K kg/ha figures.
7. **Purchased fertiliser** table: Product / N-P-K / Rate / kg/ha / Total
   €, rows for each recommended product, footer row "Estimated field cost"
   highlighted in green tint.

Desktop ("Fertiliser Plan"): field selector (dropdown, e.g. "Back Field —
First Cut Silage — High Priority") replaces the back-header pattern; the
same six card sections reflow into a 2-column layout (Nutrient
Requirement / Slurry Contribution / Fertiliser Required stacked one side,
Options/Details/Comparison tab strip + recommended-product summary card
the other), per `master-01`'s Soil Map & Analysis panel styling.

## `/housing` (Housing & Slurry)

`mobile-housing-slurry.png`:
1. Back header "Housing & Slurry" + overflow menu.
2. **Shed card**: shed name + type ("Slatted shed"), status pill
   ("Active"), isometric shed illustration, 3-stat row (Est. slurry
   volume, Storage fill level as ring/percentage, Housing period + day
   count).
3. **Assigned animal groups** list: icon + count + category + avg weight,
   green checkmark (linked), "Manage animal groups →".
4. **Estimated nutrient value (from slurry)** 3-stat row: Available N/P/K
   coloured circular icon badges (N green, P orange, K blue) + kg totals.
5. **Suggested allocation** list: ranked fields with priority badge
   (1/2/3), priority label (High/Medium/Not suitable), horizontal bar
   proportional to allocation, score + volume (m³) columns.
6. Footer dual CTA: "Refine estimate" (outline button) / "View spreading
   plan →" (filled green button).

## `/silage`

`mobile-silage-planning.png`:
1. Back header "Silage planning" + overflow menu.
2. Field identity row (thumbnail + score badge, name, area, "First-cut
   silage", "View map" pill).
3. **Silage plan** card (chevron → detail): 4-stat row — Expected DM yield
   (t DM/ha + total), Expected bales (count + kg DM basis), Cutting window
   (date range + day count), Intended use.
4. **Nutrient & cost** card (chevron, "Linked to fertiliser plan" tag):
   Slurry allocated (m³ + % of storage), Chemical fertiliser required (kg
   NPK + €), Estimated field cost (€ + €/t DM).
5. **Feed value** card: Supplies (t DM from this field), Supports (head
   count for N days).
6. **Whole-farm feed balance** card: Required winter forage vs Expected
   silage production vs Surplus/deficit (t DM, red when negative),
   horizontal green→red progress bar with a target marker line.
7. **Silage deficit risk** alert banner (amber/red tint, warning icon) with
   "View options →" CTA when in deficit.

## `/finance`

`mobile-finance.png`:
1. Header + avatar, "Finance" title + "Your farm financial overview"
   subtitle.
2. **Forecast farm margin** hero card: dark green, landscape photo
   background, period selector ("This season ▾"), big € figure + Δ% vs
   last season with up-arrow, divider, Total revenue / Operating cost
   sub-row each with their own Δ%.
3. 2×2 card grid: **Livestock value** (€ + head count + photo + "+€X vs
   last season →"), **Feed cost overview** (itemised rows: Silage,
   Concentrates, Grass, Minerals), **Fertiliser & slurry** (Estimated
   fertiliser spend + Δ%, Slurry nutrient value + "% of fertiliser spend"),
   **Cashflow this season** (€ figure + Δ% chip + mini line/area chart,
   Jan–Nov axis).
4. **Best opportunities** card: section header + 3 tappable opportunity
   chips in a row (icon, title, one-line description) — colour-coded by
   type (green = savings action, amber = buying-group, red = risk).

Desktop Financial Overview panel (per `master-01`/`master-02`): same data
reflowed into the dashboard's card grid plus a dedicated Finance page with
a larger Cashflow chart (bar, Revenue/Costs/Margin legend) and a YTD vs
Forecast Margin comparison row.

## `/livestock` → Livestock Economics drilldown

`mobile-livestock-economics.png`:
1. Back header "Livestock economics" + overflow.
2. Group identity row: icon, "{count} {breed/type} {sex}" title, "Cattle
   group" subtitle, "View group →" pill.
3. 4-stat row: Avg. liveweight, Target weight, Target date, Est. current
   value (chevron → detail).
4. **Current feed cost** card ("Based on current diet"): per-head/day +
   total-group/day €, Δ vs last week (expandable chevron).
5. **Performance forecast** card ("If current plan continues"): Avg daily
   gain, Days to finish, Forecast sale value.
6. **Cost breakdown** table: Item / Cost per head / Total group rows
   (Silage, Concentrates, Minerals, Bedding/Housing), highlighted Total
   row.
7. **Margin outlook** card: Sell now vs Finish for slaughter € per-head
   margin, "VS" divider, Margin difference callout (+€ and +%).
8. Recommendation banner (green tint, badge icon): headline + one-line
   rationale + chevron.
9. Disclaimer line + "Market assumptions →" link.

Livestock list/overview screen (per master boards): total animal count
hero stat, category breakdown rows (Suckler Cows/Weanlings/Heifers/Bull
with avg weight), each row status-tagged "On Track", "+ Add New Group" CTA.

## `/feed-optimiser`

`mobile-feed-optimiser.png`:
1. Back header "Feed optimiser" + info icon.
2. Group summary card: icon, "{count} {breed} {type}", Current weight +
   Goal (weight by date).
3. "Compare feeding strategies" section label.
4. Three selectable strategy cards — **Lowest cost**, **Balanced**
   (default-recommended, "Recommended" badge, green-tinted border/bg),
   **Faster finish** — each: radio selector, ration line (Silage/Barley/
   Beet Pulp/Maize/Minerals kg/day with coloured icon per ingredient), then
   Daily gain / Days to finish / Feed cost per head/day / Total cost per
   head stat row. Balanced card adds a green callout: "Best forecast margin
   at current feed and cattle prices."
5. Footer 2-card row: Cattle price (liveweight) + Δ vs last week, Est.
   margin uplift (Balanced vs lowest cost).
6. Disclaimer line: "Prices exclude VAT. Feed costs based on current
   contracts."

Desktop Feed Optimiser panel (`master-01`): Goal/Current Ration/Optimised
Plan/Comparison tab strip, herd summary row, 3-column strategy comparison
(Lowest Cost / Balanced [Recommended, highlighted] / Faster Finish) each
showing €/day, ADG, days, ingredient breakdown, plus a "Market sensitivity"
footer note.

## `/spreading`

`mobile-spreading.png`:
1. Header (icon + "Spreading" wordmark) + bell icon.
2. **Farm score hero**: large ring (0–100), headline ("Tomorrow looks
   strong"), subtitle "Overall farm spreading score", best-window row
   (calendar icon + date/time range), one-line condition summary (leaf
   icon).
3. **5-day forecast strip**: 5 day cards (day name/date, weather icon,
   small score ring) — today unselected, best day highlighted
   (green-tinted card background + border).
4. **Field list**, each row: field-level score ring (colour by band) +
   band label (Very good/Good/Marginal/Do not spread), field colour
   swatch/shape icon, field name, 3 detail lines (soil temp, rainfall
   forecast, drainage), chevron. Hard-stop field shown in red tint with a
   "Hard stop — do not spread" line replacing the normal detail rows.
5. **Planned applications** list: icon, type + fields, date/time, quantity
   + status pill ("Planned"), section header "See full plan →" link.

Desktop Spreading panel: same score-ring + 5-day strip pattern reflowed
horizontally alongside a field-score map (polygon fill coloured by score
band, matching the Home dashboard map treatment) and the field list as a
side panel or table.

## `/input-planner`

Per master boards' "Input Planner" desktop panel and mobile "Input Planner
Summary" strip:
1. Header: "{Year} Farm Requirements" subtitle.
2. Headline stat row: Forecast Spend €, Potential Saving €, Planning
   Confidence % (ring).
3. **All Inputs** table: Input / Requirement / Est. Cost / Timing /
   Confidence % / "Join Group" or "126 mills in group" action column —
   rows for Fertiliser, Feed, Lime, Bale Wrap, Other, each with a small
   category icon.
4. **Annual Purchasing Timeline**: month strip (Jan–Dec) with coloured bar
   segments per category showing concentration of demand, mirroring the
   Dashboard's Upcoming Timeline component but input-focused.
5. "Next major purchase" callout (top-right on mobile summary): input name
   + month + quantity.
6. Full page (not just summary) needs, per spec §11 "Required page
   components": Bulk-buy opportunity cards (user requirement vs regional
   demand vs target/current price vs saving), one-tap confirm/adjust
   control, post-purchase savings ledger — not directly visible in the
   supplied crops, build from the spec table using the established
   `MetricCard`/`OpportunityCard`/`BuyingOpportunityCard` components.

## `/market-prices`, `/reports`, `/settings`

Not directly depicted in the supplied reference crops beyond the
Dashboard's "Market Watch" card (live price rows with Δ% + sparkline) and
the Finance page's price rows. Build these as dedicated list/table pages
reusing `MarketPriceRow` (Market Prices), a report-card + export list
(Reports), and a grouped settings-form pattern consistent with the
established card/token language (Settings) — flag as needing an explicit
design pass once a reference is available, per `docs/product-requirements.md`
§ open questions.
