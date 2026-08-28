# Real Mode Completion Phase 33 — financial reconciliation

For each major financial figure a real farmer sees: data inputs, quantity,
price, price source, calculation, output, known limitations. Every
function named here is real code, not a description of intent — file
references are exact.

## Fertiliser cost (`/finance`, `/nutrients`, `/input-planner`)

- **Inputs**: real farm fields (`useFields()`), each field's real
  planned use/soil P-K index/area, real livestock groups (for organic-N
  stocking rate), real slurry allocations.
- **Calculation**: `calculateNutrientPlan` (`nutrients.ts`) per field —
  Teagasc Green Book P/K build-up/maintenance tables + S.I. 588/2025 NAP
  ceilings → a real product-level purchase list
  (`NutrientPlan.purchasedProducts`). `calculateFarmFertiliserCostEur`/
  `calculateFarmFertiliserRequirement` (`finance.ts`) sum this across
  every field.
- **Price source**: product prices are code constants in `nutrients.ts`
  (sourced from the same evidence base as the N/P/K tables) — not yet
  farmer-overridable per-product; the whole-farm `financial_assumptions`
  `fertiliser_price_eur_per_t` key (Phase 3/14) is farmer-editable and
  shown with its resolved source tier (Phase 20/21), but not yet
  consumed by this calculation (documented gap, Phase 14/20).
- **Output**: real €, drillable via `BreakdownToggle` on `/input-planner`
  (Phase 15) — `byProduct` shows exactly which product/tonnage/cost made
  up the total.
- **Limitations**: cut-only grassland's NAP ceiling is `planning_advice`
  (Green Book table), not `compliance_value` (no current statutory
  extract for it) — shown via `NapComplianceCard`'s regulatory-status
  pill, not hidden.

## Slurry nutrient replacement value (`/finance`)

- **Calculation**: `calculateFarmSlurryNutrientValueEur` (`finance.ts`)
  runs `calculateNutrientPlan` twice per field with a real slurry
  allocation (once with it, once without) and takes the difference — "how
  much less chemical fertiliser this field needed because slurry supplied
  part of its requirement." Same Green Book/NAP tables and product prices
  as fertiliser cost above, not a separate invented €/kg-nutrient rate.
- **Limitation**: deliberately distinct from `Housing.slurryEstimate`
  (still an explicitly `"(mock)"`-tagged placeholder — the real S.I.
  588/2025 excretion-rate coefficient this needs is a documented, open
  blocker). This figure only answers "given the volume already allocated,
  what did applying it save," not "how much slurry will this shed
  produce."

## Concentrate feed cost (`/finance`)

- **Inputs**: real livestock groups (category, count, weight).
- **Calculation**: `calculateFarmConcentrateFeedCostBreakdown`
  (`finance.ts`, new this session, Phase 15) — per group, one of three
  real models: `calculateFinishingBudget` (Teagasc DMD tables, exact
  lookup, no interpolation), `calculateWeanlingConcentrateStrategies`
  (real trial-evidence variable-ADG curve), or a real sourced zero (dry
  spring-calving suckler cow, no concentrate). A group with no matching
  real model contributes nothing and isn't cited as a source — never a
  guessed average.
- **Price source**: `STEER_CONCENTRATE_PRICE_EUR_PER_TONNE`/
  `WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE` (`livestock.ts`, €350/t) —
  real, sourced from the same workbook as the DMD tables, but not yet
  farmer-editable per-group (the whole-farm `concentrate_feed_price_eur_per_t`
  assumption exists but isn't consumed here — same documented gap as
  fertiliser above).
- **Output**: drillable via `BreakdownToggle` on `/finance` (Phase 15) —
  real per-group € contribution.

## Grass/silage cost (`/finance`)

- **Calculation**: `calculateFarmGrassAndSilageCostEur` (`feed-cost.ts`) —
  real Teagasc Spring 2026 Grange Feed Costings Model €/t DM figures
  applied to real grazing hectares and each field's own silage plan
  yield, with a real cash-vs-economic (land-charge) basis toggle matching
  the source sheet's own instruction.
- **Limitation**: the "1st + 2nd cut bale silage" rate is a documented
  proxy for this farm's actual single-cut bale system, not an exact
  match — flagged in-code and on-screen, not hidden.

## Livestock value (`/finance`, `/livestock`)

- **Calculation**: real head count × real (or `"estimated"`-status
  Farm-Return-assumption) average weight × `INDICATIVE_LIVEWEIGHT_EUR_PER_KG`
  (€2.50/kg, named "indicative" throughout, never presented as a market
  price). Real per-animal sell-now-vs-finish economics
  (`calculateSellNowVsFinish`) use real CSO mart prices (weanlings) or a
  Bord-Bia-style €/kg-carcass formula (other groups) instead, where a
  group has a real pricing model registered.

## Margin / revenue / cashflow (`/finance`, `/dashboard`)

- **Status**: intentionally, visibly mock (`"Sample data"` badge on
  every card that shows these). No real sales-timing/sales-log data
  source exists in this app to build a real monthly cashflow curve or a
  real total-revenue figure from — confirmed a genuine gap, not
  something buildable this session (would need farmer sales-log entry, a
  distinct future feature).

## Bulk-buy regional demand/price/saving (`/input-planner`)

- **Status**: `userRequirementQty` is real (this farm's own aggregated
  demand). Regional demand/current price/target price/saving are
  labelled "(example)"/"illustrative" (Phase 13, prior session) — a
  confirmed blocker per `docs/evidence-register.md` (both source
  workbooks: "a live merchant quote is the only thing that can close
  this").

## Financial assumptions / supplier quotes / price hierarchy (`/finance`)

- **Real, farmer-editable, and source-labelled** (Phase 14/20/21): a
  farmer can view/set five financial assumptions and record real supplier
  quotes; `resolvePrice()` (`price-resolution.ts`) resolves the real
  hierarchy (farmer-entered → supplier quote → market reference →
  historical benchmark → unavailable) for the one key with a real market-
  reference tier (fertiliser, CSO 18-6-12).
- **Limitation, stated plainly**: none of this is yet consumed by the
  fertiliser/feed cost calculations above — the assumption/quote/
  hierarchy layer is real and working, but the cost engines still read
  their own code-constant prices. This is the single largest "not fully
  reconciled" gap this document surfaces, named once here rather than
  repeated in every section above.

## No unexplained euro figure

Every euro figure a real signed-in farmer can see on `/finance`,
`/nutrients`, `/input-planner`, or `/livestock` traces to one of the
categories above — real calculation, real reference data, or explicitly
labelled sample/illustrative data. None found this pass that doesn't.
