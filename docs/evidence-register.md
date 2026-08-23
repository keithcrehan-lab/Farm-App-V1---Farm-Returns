# Evidence register — authoritative Irish sources

Per spec §18. Production agronomy, nutrition, weather and price rules must
be implemented only from documented, versioned, sourced evidence — never
invented (`CLAUDE.md` § Never rules). This register was reviewed for the
specification on **23 August 2026**; re-check every source against its
latest publication at implementation time and periodically thereafter
(spec's implementation warning, reproduced at the bottom of this file).

| Source | What it's the evidence base for | URL |
|---|---|---|
| Teagasc — Major & Micro Nutrient Advice for Productive Agricultural Crops (5th Ed., 2020) ("Green Book") | **Primary source for `src/domain/nutrients.ts` (Phase 3).** Specific tables implemented, by number: 6-4/13-1 (P Index, mg/l), 6-5 (K Index, mg/l), 13-2 (P build-up, mineral soils), 13-3 (grazing P maintenance by stocking rate, dairy/drystock), 13-4 (silage/hay P maintenance by cut), 14-1 (grazing K advice at 2 LU/ha, dairy/drystock), 14-2 (silage/hay K advice by cut), 14-3 (chemical K where 33 t/ha slurry applied), 9-1 (average DM/N/P/K in Irish cattle slurry, Berry et al. 2013), 9-2 (slurry NFRV by timing/method), 9-3/9-4 (available slurry N/P/K by soil index band), 9-8 (typical available N/P/K by slurry DM% and rate — used as a cross-check for the 9-1×9-2/9-3/9-4 computation), 12-2 (N timing, suckler calf-to-weaning), 12-3 (N timing, suckler calf-to-beef — the table used, matching this farm's system), 12-7 (N rates for cut swards/silage), 12-9/12-10 (NAP max available-N ceilings, grazing / cut-only), 13-6/13-7 (NAP max available-P ceilings, grazing / cut-only). **Caveat:** Tables 12-9/12-10/13-6/13-7 cite "NAP, S.I. 605 of 2017" — this predates the S.I. No. 588/2025 regulation already in this register (effective 1 Jan 2026). Until re-verified against S.I. 588/2025's actual schedule, these four ceiling tables are implemented with `regulatory: "planning_advice"`, not `"compliance_value"` — see `nutrients.ts` header. | https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/ |
| Teagasc — Fertiliser Advice / Green Book (general) | Current-year guidance/factsheet updates layered on top of the 5th-edition baseline above. | https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/ |
| Teagasc — Soils, Nutrients and Fertiliser Factsheets (2026) | Current technical factsheets: liming, organic manure, protected urea, first-cut silage, P/K management. | https://teagasc.ie/publications/soils-nutrients-and-fertiliser-factsheets/ |
| Teagasc — First-cut silage planning for quality in 2026 | Silage timing and nutrient requirement example (100-20-125 kg N-P-K/ha for 5 t DM/ha), slurry recycling guidance. | https://teagasc.ie/news--events/daily/first-cut-silage-planning-for-quality-in-2026/ |
| Teagasc — Making quality silage on beef farms (2026) | First/second-cut nutrient tables, soil fertility/quality context. | https://teagasc.ie/insights/making-quality-silage-on-beef-farms/ |
| Teagasc — Nutritional management of finishing beef cattle (2026) | **Primary source for `src/domain/livestock.ts` (Phase 4).** Finishing concentrate-by-DMD table, 132-day steer trial figures, kill-out %, first/second winter and summer performance benchmarks. Published 1 July 2026. | https://teagasc.ie/insights/nutritional-management-of-finishing-beef-cattle/ |
| Teagasc DairyBeef 500 — Silage quality and concentrate supplementation | Concentrate kg/head/day by silage DMD (66-76) for weanlings and finishing steers/heifers — the exact table `livestock.ts`'s `concentrateKgPerDay` implements. Cross-checked against the Beef Manual and BEEF2026 tables (all three agree at ~5-6kg/day for a continental steer at 70 DMD, ~1kg/day gain). | https://teagasc.ie/animals/beef/dairy-calf-to-beef/dairybeef-500/dairybeef-500-factsheets/silage-quality-and-concentrate-supplementation/ |
| Teagasc Beef Manual, Section 6 | Cross-check table for finishing concentrate rates by silage quality (continental/Friesian steer, continental heifer), expected daily gain ranges by type and diet. | https://teagasc.ie/wp-content/uploads/2025/05/Beef-Manual-Section6-1.pdf |
| Teagasc — Suckler beef systems for profitable production (2026) | System-level concentrate-use and finishing-weight/kill-out benchmarks (712kg sale liveweight, 392kg carcass, 55% kill-out) — source for `FINISHING_KILL_OUT_PCT`. | https://teagasc.ie/insights/suckler-beef-systems-for-profitable-production/ |
| Teagasc — First winter nutrition: silage digestibility and concentrate supplementation to maximise compensatory growth (July 2026) | **Primary source for the weanling first-winter concentrate table** (`WEANLING_FIRST_WINTER_MIDPOINT_TABLE`/`calculateWeanlingFirstWinterBudget`, sheet "Weanling_DMD_ADG") and the standard ration formulation (`CONCENTRATE_FORMULATION_PCT`, sheet "Concentrate_Formulation": rolled barley 86.2%, soya bean meal 6%, molasses 5%, minerals & vitamins 2.8%). Validated exactly against this sheet's own "Optimiser_Calculator" worked example (335kg→420kg weanling, 130-day winter, 70 DMD, €350/t ⇒ €1,820 for 32 head). | https://teagasc.ie/insights/first-winter-nutrition-silage-digestibility-and-concentrate-supplementation-to-maximise-compensatory-growth/ |
| Teagasc research repository (t-stor.teagasc.ie) — variable concentrate / observed ADG response dataset | **Evidence class B** ("empirical response evidence, not universal recommendation; use only within the observed range"). The only real source that varies observed ADG *by* concentrate level rather than fixing one target ADG per DMD row — closes the gap that kept the three-strategy weanling optimiser mock. Three trial points over a 122-day winter feeding period: 0kg/day → 0.176 ADG, 1.5kg/day → 0.664 ADG, 3kg/day → 0.859 ADG (`WEANLING_VARIABLE_ADG_POINTS`/`calculateWeanlingConcentrateStrategies`, interpolated and clamped to [0,3]kg/day, never extrapolated beyond it). No equivalent variable-ADG dataset exists yet for finishing steers/heifers, so their strategy comparison stays Phase 1 mock. | https://t-stor.teagasc.ie/bitstreams/c45b906e-3c73-416e-b7d5-84ea54fd48eb/download |
| Teagasc DairyBeef 500 — Weanling Health and Nutrition | Supporting context table (silage-alone ADG, meal needed for 0.6 ADG, energy/CP notes by DMD 55-75) — cross-check only, not implemented as a separate table. | https://teagasc.ie/animals/beef/dairy-calf-to-beef/dairybeef-500/dairybeef-500-factsheets/weanling-health-and-nutrition/ |
| Teagasc Future Beef demonstration farms — John Barry update (2026) | Suckler-cow winter feeding rules (autumn-calving cow/calf creep/dry cow silage targets) — not yet implemented, kept as a known gap; demonstration-farm rule, context-specific rather than a universal recommendation. | https://teagasc.ie/animals/beef/demonstration-farms/future-beef-programme/farmers/john-barry/john-barry-may-june-update-2026/ |
| Teagasc — Irish Soil Information System | National predictive soil map, 1:250,000, 58 associations / 213 series. Physical soil context only, not field fertility verification. | https://teagasc.ie/environment/soil/irish-soil-types-and-maps/irish-soil-information-system/ |
| EPA — Irish Soils Information System research | Background and national soil mapping methodology. | https://www.epa.ie/publications/research/reports/summary-of-findings-epa-research-130-irish-soils-information-system.php |
| Met Éireann — Farming / Agri-Meteorological Data | Irish rainfall, soil temperature, soil-moisture-deficit data; SMD model distinguishes well/moderately/poorly drained soils. | https://www.met.ie/forecasts/farming |
| Met Éireann — Agri-Meteorological Data | Technical context for the SMD model and drainage classes. | https://www.met.ie/climate/services/agri-meteorological-data |
| Irish Statute Book — S.I. No. 588/2025 | European Union (Good Agricultural Practice for Protection of Waters) Regulations 2025, effective 1 Jan 2026 — statutory baseline for nutrient/storage/spreading compliance logic (closed periods, storage coefficients, hard-stop rules). | https://www.irishstatutebook.ie/eli/2025/si/588/made/en/pdf |
| CSO — Agricultural Price Indices | Public benchmark datasets: monthly feed-stuff, fertiliser and cattle prices. | https://www.cso.ie/en/releasesandpublications/ep/p-api/agriculturalpriceindicesjune2026/data/ |
| Bord Bia — Cattle Trade & Prices | Weekly cattle market data/quotes, price dashboards for market-value context. | https://www.bordbia.ie/farmers-growers/prices-markets/cattle-trade-prices/ |

## How this maps to engine implementation

| Engine | Primary sources used |
|---|---|
| Nutrient requirement (`docs/agronomy-engine.md`) | Teagasc Green Book + current factsheets. |
| Soil physical context | Teagasc Irish Soil Information System + EPA research. |
| Slurry/organic manure coefficients | S.I. No. 588/2025 (storage/excretion coefficients, closed periods). |
| Spreading hard stops & score components | S.I. No. 588/2025 + Met Éireann agri-met data. |
| Silage timing/nutrient tables | Teagasc silage factsheets. |
| Feed optimiser / livestock economics | Teagasc finishing-beef nutritional management + CSO/Bord Bia prices. |
| Finance price benchmarks | CSO Agricultural Price Indices + Bord Bia cattle prices. |

## Governance rules (spec §15, reproduced for this register)

- Teagasc nutrient/livestock research is the primary Irish
  agronomic/nutritional evidence base, supplemented by current statutory
  requirements — not a substitute for them, and not superseded by them
  either: keep agronomic advice and statutory compliance logic as
  separately versioned rule sets (§ engine docs).
- The 1:250,000 soil map is broad physical context, never a substitute for
  field soil testing.
- Weather/spreading data must be attributed to its real source (Met
  Éireann forecast/model) and never presented as an in-field sensor
  measurement.
- Public prices are benchmarks: always show date + source, and let farmer
  actual prices or supplier/bulk-buy quotes supersede them per-input (see
  `docs/finance-engine.md` price-override rule).
- An Irish agronomist/nutritionist must review production formulas and
  scoring thresholds before launch; automated tests then lock the verified
  examples that review produces.

## Implementation warning (verbatim from spec)

> Public scientific and regulatory guidance changes. The application
> should not encode guidance as permanent constants. Keep rule sets
> versioned, sourced and updateable, and review licensing/API terms before
> using external datasets commercially.

## Register maintenance

When a rule set changes (new Teagasc factsheet, amended S.I., Met Éireann
model revision):

1. Add/replace the row above with the new source + review date.
2. Bump the relevant engine's `calculationVersion` (`docs/data-model.md`
   provenance pattern).
3. Note what changed and why in the engine's own doc if the change alters
   behaviour a farmer would notice.
