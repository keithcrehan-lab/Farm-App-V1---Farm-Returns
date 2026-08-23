# Farm Return — product requirements

Source: `Farm_Return_Product_Build_Specification`, v1.0, 23 August 2026, Ireland.
This document is the top of the source-of-truth hierarchy (see
`design/reference/README.md`) — where a generated number or sample name in a
reference screenshot conflicts with this document, this document wins.

## Product mission

Build a free, premium-quality Irish farm management and financial
intelligence platform that helps farmers understand their farm, forecast the
inputs they will need, make better evidence-based decisions, and access
lower input prices through aggregated bulk purchasing.

## 1. Product vision and commercial model

Farm Return is not a conventional subscription farm-recording app. The free
product must be genuinely valuable and create the demand network that powers
the purchasing business model.

**Core proposition:** a free farm-management, profitability and
decision-support platform that uses mapped land, soil, livestock, forage,
input and financial data to forecast farm requirements and aggregate farmer
demand to reduce the cost of agricultural inputs.

### Free product scope

| Area | Free capability |
|---|---|
| Farm & fields | Farm profile; field mapping; areas; field names; land use; crop/silage intention; field history. |
| Soil & nutrients | Mapped soil profile; planning assumptions; farmer overrides; soil-test upload; fertiliser and lime requirements; cost estimates. |
| Livestock | Groups/categories; weights where known; housing assignment; breeding basics; current/forecast value; feed requirements. |
| Housing & slurry | Sheds; slatted storage; animal assignment; housing period; estimated slurry production; nutrient value and allocation. |
| Silage | Planned cuts; expected yield; actual harvest; pit/bales; silage analysis; winter forage balance; production cost. |
| Finance | Whole-farm revenue, costs, margin, cashflow, enterprise costs, livestock/feed/fertiliser cost views. |
| Weather/spreading | Field-level weather/soil-condition score, hard regulatory blockers, seasonal and near-term spreading windows. |
| Input Planner | 12-month forecast of fertiliser, lime, feed, minerals, silage inputs and other requirements; timing, stock-on-hand and confidence. |
| Bulk purchasing | Forecast → farmer-confirmed → committed demand; regional groups; supplier tenders/offers; savings tracking. |

### Longer-term intelligence layer (Phase 7+, not free-core)

- Advanced breeding, calving/lambing and replacement optimisation.
- Least-cost and profit-optimised feeding strategies using animal targets,
  forage analysis and current market prices.
- Sell-now versus finish/overwinter scenario modelling with sensitivity
  analysis.
- Multi-year whole-farm scenarios, benchmarks and AI-supported decision
  explanations.
- Additional integrations with labs, processors, marts, banks/accountants
  and farm sensors where commercially and legally appropriate.

## 2. Product architecture and connected farm model

The application must behave like **one connected digital farm**, not a
collection of forms.

```
FARM
├─ Fields / Parcels
│  ├─ Soil profile + soil tests
│  ├─ Planned use: grazing / silage / crop
│  ├─ Nutrient requirement
│  ├─ Slurry / fertiliser applications
│  └─ Yield / harvest / field cost
├─ Livestock
│  ├─ Animal groups / individuals later
│  ├─ Weight / goal / market value
│  ├─ Housing assignment
│  └─ Feed requirement
├─ Housing
│  ├─ Shed type / capacity
│  ├─ Slurry storage
│  └─ Housing periods
├─ Forage & Feed Inventory
├─ Inputs & Stock on Hand
├─ Finance
└─ Plans / Forecasts
   ├─ Nutrient plan
   ├─ Feed plan
   ├─ Spreading plan
   └─ Input Planner → Bulk Purchasing
```

### Data precedence

| Priority | Data status | Example |
|---|---|---|
| 1 | Verified | Laboratory soil test, silage analysis, measured weight, confirmed invoice/price. |
| 2 | Farmer adjusted | Farmer changes P/K assumption, drainage, price, yield or feed quantity. |
| 3 | Farm Return estimate | Calculated from farm data and evidence-backed assumptions. |
| 4 | Mapped/public source | Irish Soil Information System, Met Éireann data, public price benchmark. |

**Never overwrite provenance.** When the farmer replaces an estimate with an
actual value, retain the original value, source, timestamp and rule/model
version. The working value changes; history is not destroyed. See
`docs/data-model.md` for how this is modeled.

## 3. Data capture order and onboarding

The capture order is designed so each answer unlocks later calculations and
reduces future input burden:

1. **Create farm** — name/location, primary enterprise(s), preferred units,
   only essential identifiers.
2. **Map fields** — draw/import boundaries; hectares/acres auto-calculated;
   assign simple field names.
3. **Assign field use in bulk** — grazing, first/second-cut silage, mixed,
   tillage/crop; multi-select across fields.
4. **Add livestock once** — categories/groups and numbers; optional average
   weight/age/breed.
5. **Add housing** — shed type; link existing livestock groups; housing
   period; tank details only if the farmer wants a refined estimate.
6. **Review soil planning assumptions** — mapped soil data pre-populated;
   P/K assumptions batch-editable; no repeated field-area entry.
7. **Upload or enter soil tests** — assign to mapped fields; verified values
   override planning assumptions.
8. **Generate nutrient and organic-manure plan** — from field use + soil +
   livestock/housing/slurry.
9. **Generate silage/feed balance and financial forecast** — silage
   intention automatically becomes expected forage production and feed
   value.
10. **Generate Input Planner** — derived requirements consolidated into
    forecast purchases; farmer confirms rather than retyping quantities.
11. **Activate weather/spreading layer** — field geometry, drainage and
    nutrient plan already known; only live external conditions added.

**UX test for every new form:** *Does Farm Return already know this? Can it
derive it? Can it offer a safe assumption?* Only information the farmer
uniquely knows should be requested.

## 4. Screen inventory and navigation

Map-led, finance-aware interface: clean white surfaces, dark green
navigation, strong status colour semantics.

| Route | Mobile | Desktop | Primary purpose |
|---|---|---|---|
| `/dashboard` | Home | Dashboard | Farm-at-a-glance, financial forecast, actions, alerts, opportunities. |
| `/fields` | Map | Farm Map / Fields | Field boundaries, planned use, crop/silage allocation, per-field drilldown. |
| `/soil` | Soil | Soil | Mapped soil, P/K assumptions, verified tests, fertility status. |
| `/livestock` | Livestock | Livestock | Animal groups, numbers, weight/value, goals, housing link. |
| `/housing` | Contextual | Housing / Slurry | Shed assignment, slurry inventory, organic nutrient value. |
| `/silage` | Contextual | Silage & Fields | Cuts, expected/actual yield, forage balance and cost. |
| `/nutrients` | Nutrients | Fertiliser Plan | N/P/K requirement, slurry offset, products, field cost. |
| `/spreading` | Spreading | Spreading | 0–100 field score, forecast windows, regulatory hard stops, application plan. |
| `/feed-optimiser` | Finance/context | Feed Optimiser | Least-cost / balanced / faster-finish strategies. |
| `/input-planner` | Inputs | Input Planner | 12-month purchasing forecast and bulk-buy opportunities. |
| `/finance` | Finance | Finance | Revenue, cost, margin, cashflow, enterprise economics. |
| `/market-prices` | Context/More | Market Prices | Live/benchmark cattle, feed and fertiliser prices. |
| `/reports` | More | Reports | Farm plans, financial summaries, nutrient reports, exports. |
| `/settings` | More | Settings | Farm profile, units, data permissions, integrations, source preferences. |

Full navigation shell, component inventory and per-screen layout notes are
in `design/screen-specification.md`.

## 5. Fields, soil and nutrient engine

The soil module must distinguish mapped physical soil properties from
fertility assumptions and verified laboratory results.

### Field soil record

| Layer | Captured/derived fields |
|---|---|
| Geometry | Field ID/name, polygon, area, centroid, optional LPIS reference, current/planned use. |
| Mapped soil | Soil association, dominant series/group, texture, drainage, depth, organic carbon/peat status, coverage percentage, dataset/version. |
| Planning fertility | P Index, K Index, optional pH planning value only if supportable, source = "Farm Return assumption" or farmer-adjusted. |
| Verified test | Sample date, laboratory, field/sample reference, P, K, pH, lime requirement, optional Mg/organic matter, report file. |
| Calculation outputs | Gross N/P/K requirement, organic nutrient contribution, chemical top-up, recommended products, tonnes/kg and estimated cost. |

**Critical scientific rule:** do not infer an actual P or K Index from the
national soil map. The map supplies physical soil context only; P/K
fertility is a planning assumption until adjusted or verified by soil
analysis.

### Calculation pipeline

```
Field geometry + planned use
        ↓
Mapped soil/drainage + P/K working values
        ↓
Crop/grass/silage nutrient requirement (versioned Irish rule set)
        ↓
Organic manure available and allocated
        ↓
Remaining N/P/K requirement
        ↓
Candidate fertiliser products / least-cost valid combination
        ↓
Quantity + timing + estimated € cost
        ↓
Input Planner forecast
```

Detail engine spec: `docs/agronomy-engine.md`.

## 6. Livestock, housing and slurry engine

Livestock numbers are entered once. Housing uses those existing groups;
slatted housing creates an estimated slurry source that feeds nutrient and
input planning.

### Livestock group MVP

| Field | Purpose |
|---|---|
| Group/category | Suckler cows, dairy cows, bull, calves, weanlings, stores, steers, heifers; sheep equivalents later. |
| Count | Single source used across finance, housing, feed and forecasts. |
| Average weight / age | Optional initially; valuable for feed-cost and growth models. |
| Breed/type / sex | Optional or group-level; supports advanced feed/finishing logic. |
| Current system | Grazing/housed and housing assignment. |
| Goal | Maintain, grow, breed, sell as store, finish for slaughter; advanced mode. |
| Value | Public-market estimate, farmer adjustment, actual sale/purchase later. |

### Slatted shed logic

1. When a farmer selects a slatted shed, link the shed to previously entered
   animal groups rather than asking for animal numbers again.
2. Estimate slurry production from animal category and housing duration
   using the current regulatory/storage coefficient set; mark it estimated.
3. Allow optional refinement using tank dimensions/capacity, observed fill
   level, dilution/soiled water and slurry analysis.
4. Convert estimated/analysed slurry to available N/P/K using a versioned
   organic-manure rule set, with application method and timing considered.
5. Allocate slurry to fields by nutrient need and agronomic/regulatory
   constraints before calculating chemical fertiliser top-up.

## 7. Silage and winter-feed engine

Silage is a field-level production decision that must automatically affect
nutrient demand, feed availability and farm economics.

### Silage data entered once

| Data | Capture behaviour |
|---|---|
| Planned cut | First, second, third; farmer choice; bulk edit across mapped fields. |
| Harvest system | Pit or bale. |
| Target cut window | Farm Return suggestion based on system/science; editable by farmer. |
| Expected yield | Evidence-backed estimate; farmer can adjust; replaced by actual harvest. |
| Expected quality | Planning assumption such as DMD; upload lab analysis for verified value. |
| Intended use | Own livestock, sale or both. |
| Actual output | Tonnes/pit estimate or bale count; moisture/DM if known. |
| Production cost | Fertiliser/slurry, contractor/machinery, wrap/bales and other direct costs. |
| Feed inventory | Automatically converts output to usable forage inventory and feed cost basis. |

### Cross-module effects

- Marking a field for silage changes the nutrient recommendation and raises
  priority for recycling slurry P and K where appropriate.
- Expected silage dry matter becomes an asset in the winter-feed budget,
  reducing predicted purchased feed if sufficient.
- Actual silage analysis changes feed-optimiser concentrate requirements and
  therefore livestock input cost and projected margin.
- If winter feed is forecast short, Farm Return compares second-cut
  production, purchased forage and concentrate-replacement scenarios.
- Silage inputs such as wrap and contractor requirements can appear in Input
  Planner when the relevant harvest system is selected.

## 8. Financial intelligence

Free core capability, fed automatically by the operational farm model.

| Area | Examples of calculated / captured values |
|---|---|
| Revenue | Livestock sales/value change, crop/silage sales, subsidies/other farm income, actual transactions later. |
| Feed | Silage production cost, concentrates, straights, minerals, purchased forage, grazing cost assumptions. |
| Fertiliser & lime | Nutrient-plan product quantities × benchmark/farmer/bulk-buy prices; slurry nutrient value shown separately. |
| Livestock | Estimated/current value, feed cost/head/day, cost to target, sale scenario margin. |
| Field/enterprise | Cost/ha, feed production cost/t DM, gross margin, direct cost by field/enterprise. |
| Cashflow | Expected timing of major input purchases and expected sales/income. |
| Opportunity layer | Potential input savings, alternative feed strategies, bulk-buy savings, feed deficit actions. |

**Price provenance:** each price must have a source and date — public
benchmark, farmer price, invoice/contract, supplier quote or Farm Return
bulk price. Calculations must automatically refresh when the active price
source changes.

Detail engine spec: `docs/finance-engine.md`.

## 9. Feed optimiser and livestock economics

The advanced optimiser solves for a target outcome under nutrition, intake,
animal-performance and market constraints — it is not a generic AI ration
suggestion.

### Free livestock cost layer

- Use livestock groups, housing period, forage inventory/quality and
  benchmark feed prices to estimate feed cost by group, head/day and
  season.
- Let the farmer replace public benchmark prices with their actual
  merchant/contract price once; reuse it everywhere.
- Use actual silage analysis when available; otherwise a clearly-labelled
  planning assumption.
- Financial screen shows the cost driver, not only total spend: silage,
  concentrate, grass, minerals, bedding/housing, other variable costs.

### Advanced optimiser

| Input | Examples |
|---|---|
| Animal state | Group, sex/type, age, current weight, body condition/fat score where available, breed category. |
| Goal | Target weight/carcass, target date, sell as store, finish for slaughter, target daily gain. |
| Forage | Silage/grass inventory, DM/DMD/energy/protein analysis, cost basis. |
| Purchased feeds | Barley, maize, beet pulp, soya/other protein, compounds, minerals; nutrient profile and current price. |
| Constraints | Expected DMI, minimum fibre/forage, protein/energy requirements, safe inclusion ranges, mineral needs. |
| Market | Current cattle price by relevant grade/category; sensitivity range and price date. |
| Objective | Lowest feed cost, balanced/highest forecast margin, or faster finish. |
| Output | Ration options, kg/head/day, expected ADG, days to finish, feed cost/head, expected sale value, margin and sensitivity. |

**Optimisation principle:** optimise profit, not just price per tonne. A
slightly more expensive daily ration can produce a better margin if it
reaches market specification sooner or uses shed capacity more efficiently.

Detail engine spec: `docs/feed-engine.md`.

## 10. Spreading conditions engine

Every mapped field can receive a live suitability score, but regulatory and
environmental blockers must override any numerical score.

- **Two related scores:** slurry/organic manure spreading score; chemical
  fertiliser spreading score. Both use the same field geometry,
  soil/drainage, planned application, crop demand and live weather inputs,
  but can use different thresholds/weights.
- **Hard-stop rules:** where current Irish rules prohibit or make spreading
  unsafe (closed periods, wet/flooded/frozen/heavy-rain conditions), the UI
  must show a hard stop such as "0 — Do not spread" with the reason. A hard
  stop is not merely a low score.

### Indicative score components (validate before production)

| Component | Role |
|---|---|
| Forecast rainfall | Near-term wash-off/runoff risk; regulatory forecast requirement where applicable. |
| Soil moisture / trafficability | Drainage class and available SMD/modelled wetness; prevents damage/runoff. |
| Soil temperature & trend | Agronomic uptake context; never present a modelled station value as an in-field sensor measurement. |
| Crop/grass demand | Nutrient uptake window and planned application need. |
| Drainage/topographic/environmental risk | Field-specific risk modifiers and required buffers. |
| Application conditions | Wind/operational suitability and product/application method where relevant. |

### Time horizons

- **Seasonal plan:** target weeks/periods and expected quantity based on
  nutrient need.
- **Near-term planner:** 5–10 day field score forecast.
- **Live action:** best current window; when application is marked
  complete, update remaining nutrient requirement and input stock.

## 11. Input Planner and bulk purchasing

The commercial heart of Farm Return: turn the connected farm model into
forecast demand, then aggregate that demand to win better prices.

### Input Planner inputs

| Farm data | Forecast produced |
|---|---|
| Mapped fields + soil + planned use | Fertiliser, lime and crop/silage input volumes. |
| Livestock + housing | Feed/mineral demand, bedding where relevant, slurry production. |
| Silage plan + actual forage inventory | Purchased feed requirement after own-feed contribution. |
| Feed optimiser | Potential straights/compound requirements under selected livestock strategy. |
| Existing stock on hand | Subtract stock already owned from purchasing requirement. |
| Historical/benchmark/current prices | Forecast cost and savings range. |
| Calendar/season | Required-by month/window for procurement aggregation. |

### Demand states

| State | Meaning | Commercial use |
|---|---|---|
| Forecast | Farm Return estimates the farmer will need the quantity. | Network demand signal; not a commitment. |
| Farmer confirmed | Farmer reviews and confirms/adjusts the forecast. | Higher-confidence demand pool. |
| Committed to buying group | Farmer opts into a specific procurement event/offer. | Supplier tender/negotiation quantity. |
| Purchased | Accepted quote/order recorded. | Revenue, savings and stock update. |

### Required page components

- Forecast spend, potential savings and planning-confidence headline cards.
- Category breakdown: fertiliser, feed, lime, minerals, silage inputs,
  contractor/other where meaningful.
- Quantity, estimated cost, timing and confidence for each line.
- Annual purchasing timeline showing concentration of demand by month.
- Stock-on-hand deduction: required quantity − existing stock = purchase
  requirement.
- Bulk-buy opportunity cards showing user requirement, regional
  confirmed/committed demand, target/current price and potential saving.
- One-tap quantity confirmation and adjustment instead of recreating an
  order from scratch.
- Post-purchase savings ledger and input-stock update.

**Network effect:** better farm data → better demand forecast → larger
buying groups → stronger supplier pricing → measurable farmer savings →
greater retention and more complete data.

## 12. Design system and responsive behaviour

Full token values are in `design/design-system.md`. Summary direction:
high-end fintech/consumer software applied to farming, not a generic admin
dashboard. Inter/Inter Display typography; deep forest green navigation and
key financial/action colour used purposefully; white/off-white surfaces with
low-elevation soft cards and generous whitespace; status colour semantics
(green = good/optimal/confirmed, amber = attention/marginal, red =
blocked/risk, blue = information/data/weather); rounded, refined corners;
satellite/aerial field map as hero surface; calm legible charts; Lucide-style
line icons; subtle motion respecting reduced-motion; mobile is focused and
vertically progressive, desktop uses multi-column overview without becoming
a spreadsheet wall.

- **Mobile navigation:** canonical bottom nav — Home, Map/Fields, Livestock,
  Inputs/Planner and contextual/More. Detail module pages may expose Soil,
  Nutrients, Spreading and Finance as direct tabs or contextual routes.
- **Desktop navigation:** dark-green left rail — Dashboard, Fields/Farm Map,
  Soil, Livestock, Silage & Fields, Fertiliser Plan/Nutrients, Feed
  Optimiser, Input Planner, Finance, Market Prices, Reports, Settings.
  Spreading can be first-class if the final route inventory includes it
  separately.
- **Responsive rule — one product, two compositions:** do not merely scale
  the mobile layout wider. Desktop adopts the approved multi-column
  dashboard, persistent left navigation and side-by-side analytical cards,
  sharing the same components, tokens and data model as mobile.

## 13. Technical architecture and repository structure

Start with a UI-first MVP using realistic mock data; domain calculations and
integrations are added after the approved visual shell is stable.

### Recommended stack

| Layer | Recommendation |
|---|---|
| Application | Next.js + TypeScript. |
| Styling | Tailwind CSS with Farm Return tokens; shadcn/ui only as low-level primitives, not default styling. |
| Icons | Lucide; custom agricultural icons only when needed. |
| Charts | Recharts or equivalent deterministic chart library. |
| Maps | MapLibre/Mapbox or suitable satellite mapping provider; field polygon drawing/editing. |
| Forms | React Hook Form + Zod. |
| Database/auth | Supabase/Postgres once the mock-data UI is approved. |
| Domain engine | Pure TypeScript modules/functions with versioned rules and unit tests; no calculations embedded in React components. |
| Testing | Vitest/unit tests for domain logic + Playwright E2E and visual regression. |
| Deployment | Vercel initially; environment variables for API/provider keys. |

### Repository shape

```
farm-return/
├─ design/
│  ├─ reference/mobile/
│  ├─ reference/desktop/
│  ├─ design-system.md
│  └─ screen-specification.md
├─ docs/
│  ├─ product-requirements.md
│  ├─ data-model.md
│  ├─ agronomy-engine.md
│  ├─ feed-engine.md
│  ├─ finance-engine.md
│  └─ evidence-register.md
├─ src/
│  ├─ app/{dashboard,fields,soil,livestock,housing,silage,nutrients,spreading,feed-optimiser,input-planner,finance,market-prices,reports,settings}/
│  ├─ components/{ui,farm,maps,charts,finance}/
│  ├─ domain/{farm,soil,nutrients,livestock,slurry,silage,feed,finance,inputs}/
│  ├─ data/mock-farm.ts
│  └─ lib/
├─ tests/{unit,e2e,visual}/
├─ CLAUDE.md
└─ package.json
```

### Core reusable components

- **Shell:** AppShell, DesktopSidebar, MobileBottomNav, PageHeader.
- **Cards/status:** MetricCard, FinancialHeroCard, OpportunityCard,
  AlertCard, StatusBadge, ConfidenceBadge, SourceBadge.
- **Map/fields:** FarmMap, FieldPolygonLayer, FieldCard, FieldDrawer,
  MapLegend.
- **Soil:** SoilIndexSelector, SoilSourcePanel, TestUploadCard.
- **Nutrients:** NutrientBars, OrganicNutrientCard, ProductRecommendationTable.
- **Livestock:** LivestockGroupCard, GoalCard, EconomicsSummary.
- **Spreading:** ScoreRing, ForecastDayCard, HardStopAlert.
- **Inputs:** InputRequirementRow, PurchaseTimeline, BuyingOpportunityCard.
- **Finance/market:** MarketPriceRow, CashflowChart, MarginComparison,
  SensitivityTable.

## 14. Claude Code implementation workflow

See `CLAUDE.md` for the operative rules. Screen build order (Phase 1):

1. Desktop Dashboard + Mobile Home.
2. Fields/Farm Map.
3. Soil.
4. Livestock.
5. Housing/Slurry.
6. Silage.
7. Nutrients/Fertiliser.
8. Spreading.
9. Finance.
10. Livestock Economics.
11. Feed Optimiser.
12. Input Planner.
13. Market Prices, Reports, Settings.

Only after Phase 1–2 are approved do real engines replace mock outputs, one
domain at a time: soil/nutrients → livestock/housing/slurry → silage/feed
inventory → finance → spreading → feed optimiser → Input Planner/bulk
buying. Each engine receives deterministic tests and an evidence/version
record before its values are allowed onto production screens.

## 15. Quality, science and regulatory governance

Farm Return is trusted only if a farmer can understand what a number means,
where it came from and how current it is. Every material recommendation
carries: value, status, source, source date/version, calculation version,
confidence (where meaningful), regulatory status, and a plain-English "Why?"
explanation that does not overstate certainty.

### Scientific governance rules

- Use Teagasc nutrient and livestock research as the primary Irish
  agronomic/nutritional evidence base, supplemented by current statutory
  requirements.
- Treat the 1:250,000 Irish soil map as broad physical soil context, never a
  substitute for field soil testing.
- Keep agronomic recommendations separate from statutory compliance logic;
  the rules engine is versioned and updateable.
- For weather/spreading, use authoritative Irish weather/agrometeorological
  data and never claim station/model data is an in-field sensor
  measurement.
- Public prices are benchmarks: display date and source, and allow farmer
  actual prices or supplier/bulk-buy quotes to supersede them.
- Have an Irish agronomist/nutritionist review production formulas and
  scoring thresholds before launch; automated tests lock verified examples.

### Visual QA acceptance criteria

- All approved UI elements present and navigable.
- No generic default component styling where a Farm Return reference
  exists.
- No text clipping or overflow at target mobile/desktop sizes.
- Keyboard/focus accessibility and touch targets appropriate for mobile.
- Core flows usable without hover-only interactions.
- Visual regression screenshots checked before merging major screen
  changes.
- Mock demo values clearly separated from real engine output during
  development.

## 16. Delivery phases and roadmap

| Phase | Scope | Exit gate |
|---|---|---|
| 0 — Repository/design contract | References, docs, route map, tokens, CLAUDE.md, mock farm dataset. | Architecture approved; no feature code yet. |
| 1 — Pixel-accurate UI prototype | All major mobile/desktop screens with mock data and complete navigation. | Visual regression accepted against reference pack. |
| 2 — Central farm data model | Farm, fields, land use, livestock, housing, inputs, finance entities with mock persistence. | Enter-once dependencies proven end-to-end. |
| 3 — Soil/nutrient MVP | Irish soil overlay, editable P/K assumptions, tests, slurry offset, product/cost calculation. | Known test cases independently validated. |
| 4 — Silage/livestock/finance | Silage plans, forage inventory, feed cost estimation, livestock economics, free financial dashboard. | Whole-farm forecast updates when field/livestock data changes. |
| 5 — Weather/spreading | Field score, hard stops, forecast windows and application recording. | Rules/data-source review + field-level end-to-end tests. |
| 6 — Input Planner/bulk buying | Forecast demand, stock deduction, demand confirmation, buying-group workflow and saving ledger. | Pilot procurement event can be run from forecast to accepted offer. |
| 7 — Advanced optimiser | Least-cost/profit feed optimiser, market sensitivity, sell/finish scenarios. | Nutrition model reviewed and validated against known scenarios. |
| 8 — Future premium intelligence | Advanced breeding, forecasting, benchmarking, integrations and adviser tools. | Only after free core has strong adoption and validated demand. |

**We are currently completing Phase 0.**

## 17. Approved visual reference pack

See `design/reference/README.md` for the full index and source-of-truth
notes. These are design references, not sources for production numerical
calculations — all sample names and figures in them are illustrative.

## 18. Authoritative Irish evidence framework

See `docs/evidence-register.md` for the full source list (Teagasc, Met
Éireann, Irish Statute Book, CSO, Bord Bia, etc.) with URLs and what each
source is the evidence base for. Production rules must be rechecked against
the latest published sources at implementation and periodically thereafter.

**Implementation warning:** public scientific and regulatory guidance
changes. The application must not encode guidance as permanent constants.
Keep rule sets versioned, sourced and updateable, and review licensing/API
terms before using external datasets commercially.

## Build objective

A farmer should be able to map a field, assign its purpose, enter livestock
and housing once, and then watch Farm Return automatically connect soil,
nutrients, slurry, silage, feed, financial forecasts, spreading conditions
and purchase requirements. The experience should feel visually premium and
operationally simple even though the model underneath is sophisticated.

## Open questions to resolve before/during Phase 1

1. **Desktop detail screens.** Only two composite master boards and nine
   mobile detail screens were supplied — no full-resolution desktop crops
   for Soil, Nutrients, Housing/Slurry, Silage, Livestock Economics, Feed
   Optimiser or Spreading beyond what's visible in the master boards. We'll
   extrapolate desktop layouts from the master boards' desktop panels and
   the mobile detail screens' content using the shared component library
   and responsive rule (§12); flag any screen where this is a judgement
   call during Phase 1 review rather than silently guessing.
2. **Auth/accounts.** Not specified — assumed out of scope for Phase 0–1
   (mock single-farmer session), needed by Phase 2 (Supabase auth).
3. **Mapping provider account.** MapLibre/Mapbox needs an API key and
   billing account. Phase 1 can ship field maps against the static
   reference imagery / a placeholder tile layer; wire in a live provider
   once credentials exist.
4. **Regional buying-group/supplier backend** (Phase 6) is unspecified
   beyond the UI/demand-state model — needs its own design pass when we
   reach that phase.
