# Finance engine

Status: **Phase 4/6 concern.** Phase 4 delivers the free whole-farm
financial dashboard; Phase 6 extends it with the Input Planner/bulk-buying
savings ledger. Not implemented until the Phase 1 UI shell and Phase 2 data
model are approved (`CLAUDE.md` § Build order).

## Principle

Finance is **not a separate input form** — it is derived automatically from
the operational farm model (spec §8: "the financial side is a free core
capability and must be fed automatically by the operational farm model").
The finance engine has almost no unique inputs of its own; it aggregates
`FinanceLine`s produced by the other engines and by direct
revenue/transaction capture.

## Whole-farm financial model (spec §8)

| Area | Fed by |
|---|---|
| Revenue | Livestock value change (feed engine), crop/silage sales, subsidies/other income (direct capture), actual transactions (Phase 6+). |
| Feed | Silage production cost (silage engine), concentrates/straights/minerals/purchased forage (feed engine), grazing cost assumption. |
| Fertiliser & lime | Nutrient-plan product quantities × active price source (agronomy engine `× PriceSource`); slurry nutrient value shown as a **separate line**, never netted invisibly into the fertiliser spend figure. |
| Livestock | Estimated/current value, feed cost/head/day, cost-to-target, sale-scenario margin (feed engine). |
| Field/enterprise | Cost/ha, feed production cost/t DM, gross margin, direct cost by field/enterprise — a rollup view, not a new calculation. |
| Cashflow | Timing of the same underlying lines (input purchase windows from Input Planner, expected sale/income dates) plotted over the season. |
| Opportunity layer | Potential savings identified by other engines (bulk-buy deltas, feed-mix deltas, deficit-avoidance) surfaced as `OpportunityCard`s. |

**Implementation implication:** the finance engine should be built as a
pure aggregation/rollup layer over `FinanceLine[]` (see
`docs/data-model.md`) that other engines append to, plus a small set of its
own derived views (cashflow timing, cost/ha, gross margin) — not as an
engine that re-derives feed/fertiliser/livestock numbers independently.
Keeping this a one-way dependency (agronomy/feed/silage engines → finance
rollup, never the reverse) avoids circular recalculation.

## Price provenance (spec §8, non-negotiable)

Every `FinanceLine.priceSource` is one of: `public_benchmark`,
`farmer_price`, `invoice_contract`, `supplier_quote`, `bulk_buy_price`,
each carrying a date. **Calculations must automatically refresh when the
active price source changes** — i.e. changing which price source is
"active" for an input is a single farm-level setting change (mirrors the
feed engine's price-override rule in `docs/feed-engine.md`), and every
downstream figure that used that price recomputes, not just the screen the
farmer happened to change it on.

## Cashflow

Plots the *timing* of major input purchases (from `InputRequirement`'s
`requiredByWindow`) against expected sales/income timing — this is a
scheduling view over data the other engines already produce, not a new
forecast model. Matches the Dashboard "Upcoming Timeline" component and the
Finance page's cashflow chart (`design/screen-specification.md`).

## Opportunity layer

Each `OpportunityCard` traces back to a concrete, explainable delta:

- **Bulk-buy saving** — `BuyingOpportunity.currentPrice − targetPrice`
  applied to the farmer's `userRequirementQty` (Input Planner engine,
  Phase 6).
- **Feed-mix saving** — difference between the farm's current ration cost
  and a cheaper feed-optimiser strategy at equal-or-better margin (feed
  engine, Phase 7 for the full optimiser; Phase 4's simpler cost layer can
  still flag an obvious benchmark-price delta).
- **Deficit-risk actions** — cost comparison of the silage engine's
  mitigation options (spec §7).

No opportunity card presents a number without the calculation that
produced it being inspectable via the standard "Why?" explanation panel
(spec §15) — this is the same metadata contract (value/status/source/
source date/calculation version/confidence) as every other engine output.

## Testing requirement

Same as the other engines (`docs/agronomy-engine.md`,
`docs/feed-engine.md`): deterministic unit tests on known example farms
before values reach production screens, plus an explicit test that
confirms a price-source change propagates to every `FinanceLine` that
depended on it (this is the one finance-specific behaviour worth its own
regression test, since it's easy to accidentally cache/stale it).
