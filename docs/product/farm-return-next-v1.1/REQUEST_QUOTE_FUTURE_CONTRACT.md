# Request Quote — future contract (not built this session)

Farm Return Next, Supports Intelligence + Farm Strategy phase, 2026-09-04.
This is a contract for a *future* pilot, written so a Support Opportunity
built today doesn't need reshaping later — no supplier marketplace code
exists yet, per this session's own explicit scope boundary
(`docs/product/farm-return-next-v1.1/SUPPORTS_STRATEGY_CONTRACT.md`'s
own "deliberately not built" section).

## Future flow

```
Support Opportunity (src/domain/support-opportunity.ts, real today)
  -> farmer explicitly chooses "Request Quotes" (an affirmative action,
     never automatic)
  -> explicit consent / data-sharing screen naming exactly what's shared
     with which supplier(s)
  -> a structured supplier requirement, derived from the same
     StrategyInvestmentAssumption shape farm-strategy.ts already defines
     (label, candidate gross cost range, category) — not a new,
     competing "investment" type
  -> structured supplier quotations come back
  -> Strategy reruns for real: the quoted StrategyInvestmentAssumption
     (costStatus: "quoted") replaces the farmer's own "estimated" figure,
     and compareStrategyToBaseline (farm-strategy.ts, unchanged) produces
     a new StrategyComparison from the real quote — no new calculation
     engine needed, this module's existing shape already supports it
  -> farmer chooses a supplier (or none)
  -> a direct farmer/supplier transaction, outside Farm Return
  -> a possible supplier success fee, charged to the supplier, never the
     farmer, and never visible to the eligibility/strategy calculation
```

## Non-negotiable boundary (repeated from the build prompt verbatim
because it governs any future implementation of this contract)

**Supplier payment must never alter:**
- scheme eligibility (`scheme-eligibility.ts` reads only `SupportProfile`
  + `SchemeVersion` — no supplier/commercial input of any kind reaches
  it, structurally, today)
- the investment recommendation (`support-opportunity.ts`'s
  `financiallySensible` reads only a real `StrategyComparison` — no
  supplier ranking or commercial signal is a valid input to that
  function's own type signature)
- the financial calculation (`farm-strategy.ts` has no supplier/commercial
  parameter anywhere in `StrategyScenarioInput`)
- supplier ranking (doesn't exist yet — when it does, it must be built as
  a separate, clearly-labelled sort/filter layer over quotes already
  returned, never blended into eligibility/strategy output)

## What already exists that a future pilot can build on without a
reshape

- `StrategyInvestmentAssumption.costStatus` already includes `"quoted"`
  as a distinct value from `"estimated"`/`"actual"` — added in this
  session specifically so a future real quote has somewhere honest to
  go without changing the type.
- `SchemeVersion`'s own `rules` (`scheme-registry.ts`) already separate
  "what the scheme requires" from "what it pays" — a future supplier
  requirement only needs to reference a `SchemeVersion.schemeId`, not
  duplicate its terms.
- `SupportOpportunity.strategyComparison` is already optional — "no quote
  yet" is already a real, distinct state from "quote received", not
  something a future pilot needs to invent.

## Explicitly not designed yet (a future pilot's own work, not assumed
here)

- The supplier data model itself (distinct from V1's pre-existing
  `supplier-quotes` table/feature, which is unrelated — see
  `docs/farm-return-next/DOMAIN_CONTRACTS.md`'s frozen inventory).
- Consent/data-sharing UI and its own audit trail.
- Success-fee commercial terms.
- Supplier-side tooling of any kind.
