# Feed & livestock economics engine

Status: **Phase 4/7 concern.** Phase 4 delivers the free livestock cost
layer; Phase 7 delivers the advanced optimiser. Not implemented until the
Phase 1 UI shell and Phase 2 data model are approved (`CLAUDE.md` § Build
order).

## Scope

- Silage/winter-feed balance (spec §7)
- Free livestock feed-cost layer (spec §9)
- Advanced feed optimiser (spec §9, Phase 7)

## Silage → forage inventory pipeline (spec §7)

```
SilagePlan (per field: cut, system, window, expected yield/quality)
        ↓
Expected DM production (t DM) — evidence-backed estimate, farmer-adjustable
        ↓
Actual harvest (tonnes/bales, moisture/DM) replaces expected once recorded
        ↓
ForageInventory.totalDmTonnes  (aggregated across fields/cuts)
        ↓
Whole-farm feed balance = totalDmTonnes − requiredWinterForageDmTonnes
        ↓
Deficit → triggers scenario comparison (2nd cut / purchased forage / concentrate replacement)
```

### Cross-module effects to preserve in implementation

- Marking a field for silage feeds back into the nutrient engine (raises
  slurry P/K recycling priority for that field) — see
  `docs/agronomy-engine.md`.
- Actual silage analysis (DMD/energy/protein), once uploaded, replaces the
  planning-assumption quality value and recalculates concentrate
  requirement in the optimiser — this is a provenance transition
  (`estimated` → `verified`), not a separate code path.
- A forecast deficit surfaces as an alert (`HardStopAlert`-style but
  non-blocking — an advisory, not a regulatory hard stop) with the three
  standard mitigation options costed against each other.

## Free livestock feed-cost layer (spec §9)

Inputs: `LivestockGroup` (count, avg weight, housing period),
`ForageInventory` (quantity + quality), benchmark or farmer-set feed
prices.

Outputs: feed cost by group, by head/day, by season — broken down by cost
driver (`silage`, `concentrate`, `grass`, `minerals`, `bedding_housing`,
`other`), not just a total. This driver breakdown is a hard UI requirement
(spec §9: "should show the cost driver, not only total spend") — the
engine's output type must carry the breakdown, not just a sum.

**Price override rule:** once a farmer replaces a benchmark feed price with
their actual merchant/contract price, that price is reused everywhere feed
cost is calculated for that input — implement as a single farm-level price
override table the engine reads from, not a per-screen input.

## Advanced feed optimiser (spec §9, Phase 7)

Not a generic AI ration generator — a constrained optimisation over a
defined input/output contract:

| Input | Notes |
|---|---|
| Animal state | group, sex/type, age, current weight, body condition/fat score, breed category |
| Goal | target weight/carcass, target date, sell-as-store vs finish, target daily gain |
| Forage | inventory + DM/DMD/energy/protein analysis + cost basis |
| Purchased feeds | barley, maize, beet pulp, soya/protein, compounds, minerals — nutrient profile + current price |
| Constraints | expected DMI, minimum fibre/forage, protein/energy requirements, safe inclusion ranges, mineral needs |
| Market | current cattle price by grade/category, sensitivity range, price date |
| Objective | lowest feed cost \| balanced/highest forecast margin \| faster finish |

Output per strategy: ration (kg/head/day per ingredient), expected ADG,
days to finish, feed cost/head, expected sale value, margin, sensitivity
range. The UI always presents at minimum the three canonical strategies
(**Lowest cost**, **Balanced**, **Faster finish**) as a comparison, per the
approved reference screens — "Balanced" is the default-recommended
strategy unless the farmer's stated objective says otherwise.

**Optimisation principle (spec §9):** optimise forecast *margin*, not
lowest feed cost per tonne — a pricier ration that finishes sooner or uses
shed capacity more efficiently can win on margin. The objective function
must be margin-first even under the "Lowest cost" strategy label (that
label describes the ration's feed-cost-minimizing constraint set, not the
thing being optimised for at the portfolio level) — surface both figures
(feed cost AND forecast margin) on every strategy card so this isn't
ambiguous to the farmer.

## Sell-now vs finish scenario modelling

Both livestock-economics screens (mobile detail + dashboard rollups) show
a **sell-now vs finish** margin comparison. This is a straightforward
deterministic comparison (not requiring the full optimiser): current
market value now vs (forecast sale value at target date − remaining cost to
finish, using the selected feeding strategy). Implement it as a pure
function over `LivestockGroup` + the selected optimiser strategy output +
`Market prices`, callable independently of running a full optimisation
pass.

## Testing requirement

Nutrition model validated against known/published scenarios before its
values reach production screens (spec §16 Phase 7 exit gate); Phase 4's
simpler cost-layer arithmetic still gets deterministic unit tests locking
verified example values, same as the agronomy engine.
