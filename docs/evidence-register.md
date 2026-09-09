# Evidence register — authoritative Irish sources

Per spec §18. Production agronomy, nutrition, weather and price rules must
be implemented only from documented, versioned, sourced evidence — never
invented (`CLAUDE.md` § Never rules). This register was reviewed for the
specification on **23 August 2026**; re-check every source against its
latest publication at implementation time and periodically thereafter
(spec's implementation warning, reproduced at the bottom of this file).

| Source | What it's the evidence base for | URL |
|---|---|---|
| Teagasc — Major & Micro Nutrient Advice for Productive Agricultural Crops (5th Ed., 2020) ("Green Book") | **Primary source for `src/domain/nutrients.ts` (Phase 3).** Specific tables implemented, by number: 6-4/13-1 (P Index, mg/l), 6-5 (K Index, mg/l), 13-2 (P build-up, mineral soils), 13-3 (grazing P maintenance by stocking rate, dairy/drystock), 13-4 (silage/hay P maintenance by cut), 14-1 (grazing K advice at 2 LU/ha, dairy/drystock), 14-2 (silage/hay K advice by cut), 14-3 (chemical K where 33 t/ha slurry applied), 9-1 (average DM/N/P/K in Irish cattle slurry, Berry et al. 2013), 9-2 (slurry NFRV by timing/method), 9-3/9-4 (available slurry N/P/K by soil index band), 9-8 (typical available N/P/K by slurry DM% and rate — used as a cross-check for the 9-1×9-2/9-3/9-4 computation), 12-2 (N timing, suckler calf-to-weaning), 12-3 (N timing, suckler calf-to-beef — the table used, matching this farm's system), 12-7 (N rates for cut swards/silage). **NAP ceiling tables 12-9/12-10 (N) and 13-6/13-7 (P) are superseded** — see the S.I. 588/2025 row below, which replaced the N ceiling with confirmed statutory figures and cross-validated the P ceiling as unchanged. Only the cut-only N/P ceiling functions (`napMaxAvailableNCutOnlyKgHa`/`napMaxAvailablePCutOnlyKgHa`) still cite this Green Book table directly, since the current statutory extract in hand doesn't cover cut-only grassland — those two stay `regulatory: "planning_advice"`. | https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/ |
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
| Teagasc Future Beef demonstration farms — John Barry update (2026) | **Primary source for `SUCKLER_COW_WINTER_RULES`/`sucklerCowConcentrateKgPerDay`** (sheet "Suckler_Cow_Rules"): winter feeding rules by calving system/stock class — autumn-calving cows (1.5kg/day, 14% CP), autumn-calving calves (0.5-1.0kg/day creep, 15% CP), dry spring-calving cows (no concentrate specified, moderate-quality silage only). This farm's suckler herd is a spring-calving calf-to-beef system (the same system `nutrients.ts` already assumes for its N-timing table), so the dry spring-calving row is what `src/domain/finance.ts`'s whole-farm feed cost total uses — a real, sourced zero, not a missing table. Evidence class A, but a demonstration-farm rule, context-specific rather than a universal recommendation. | https://teagasc.ie/animals/beef/demonstration-farms/future-beef-programme/farmers/john-barry/john-barry-may-june-update-2026/ |
| Teagasc — Irish Soil Information System | National predictive soil map, 1:250,000, 58 associations / 213 series. Physical soil context only, not field fertility verification. | https://teagasc.ie/environment/soil/irish-soil-types-and-maps/irish-soil-information-system/ |
| EPA — Irish Soils Information System research | Background and national soil mapping methodology. | https://www.epa.ie/publications/research/reports/summary-of-findings-epa-research-130-irish-soils-information-system.php |
| Met Éireann — Farming / Agri-Meteorological Data | Irish rainfall, soil temperature, soil-moisture-deficit data; SMD model distinguishes well/moderately/poorly drained soils. | https://www.met.ie/forecasts/farming |
| Met Éireann — Agri-Meteorological Data | Technical context for the SMD model and drainage classes. | https://www.met.ie/climate/services/agri-meteorological-data |
| Irish Statute Book — S.I. No. 588/2025 | European Union (Good Agricultural Practice for Protection of Waters) Regulations 2025, effective 1 Jan 2026 — statutory baseline for nutrient/storage/spreading compliance logic (closed periods, storage coefficients, hard-stop rules). **CONFIRMED, `regulatory: "compliance_value"`, from a real extract of Tables 12/13/15a/15b** the user supplied (`farm_return_core_data_v4.xlsx`, sheets NAP_N_Ceilings/NAP_P_Ceilings/NAP_P_Index): Table 12 (statutory P Index mg/l boundaries, `pIndexFromMgL`) — confirmed the Green Book's rounder boundaries, refined to the statutory 3.04/5.04 precision; Table 13 (max available N, grazing, `napMaxAvailableNGrazingKgHa`) — **replaces** the Green Book's unconfirmed 206/282/250 estimate with the real 5-band statutory schedule (90/114/185/241/214 kg/ha); Table 15a (max available P, grazing, `napMaxAvailablePGrazingKgHa`) — confirmed unchanged from the Green Book's own figures, a genuine independent cross-check; Table 15b (enhanced P build-up, conditional on Article 17(6), `napEnhancedPBuildUpKgHa`) — new capability, not previously implemented. **Cut-only N/P ceilings (Tables 16/17) confirmed in a follow-up extract** — see the `farm_return_gap_closure_data_v5.xlsx` row below; every NAP ceiling this app implements is now `regulatory: "compliance_value"`. **Wired into the UI**: `checkNapCompliance` (called from `calculateNutrientPlan`, exposed as `NutrientPlan.napCompliance`) compares each field's total planned N/P against the correct ceiling for its situation, rendered by `NapComplianceCard` on the Nutrients screen. | https://www.irishstatutebook.ie/eli/2025/si/588/made/en/print |
| Irish Statute Book — S.I. No. 588/2025, Tables 16 & 17 (via `farm_return_gap_closure_data_v5.xlsx`) | **Primary source for the cut-only grassland NAP ceilings** (`napMaxAvailableNCutOnlyKgHa`/`napMaxAvailablePCutOnlyKgHa`), CONFIRMED. Table 16 (N) **replaces** the Green Book's unconfirmed 125/100 kg/ha (cuts 1/2, no cut-3 or hay row) with the real 3-cut schedule 85/70/30 — hay isn't a separate category in the current regulation (Table 16's own row 2 is labelled "Second cut silage OR hay"). Table 17 (P) confirmed **unchanged** from the Green Book's own 40/30/20/0 (first cut) and 10/10/10/0 (subsequent cuts) — another genuine independent cross-check. Critically, this extract also supplied the tables' own **eligibility text**, which `checkNapCompliance` now enforces rather than applying blindly: Table 16/17 only govern silage/hay sold with written evidence of sale, on a holding with no grazing livestock or a previous-year organic-N stocking rate ≤85 kg/ha. A cut field that doesn't meet both conditions — this farm's own Back Field, whose silage is `intendedUse: "own_livestock"` — falls back to the general Table 13/15a "grassland" ceiling, the same one grazing land uses. This resolves an ambiguity an earlier pass had flagged (whether Table 15a's "...on Grassland" title implied one unified table): it's a genuinely separate, narrower table with its own eligibility gate, not a blanket replacement. | https://www.irishstatutebook.ie/eli/2025/si/588/made/en/print |
| Irish Statute Book — S.I. No. 119/2026 | Amendment Regulations 2026 — reduced chemical-N allowances (229/203 kg N/ha) effective **1 January 2028** for specified derogation holdings in named hydrological catchments only. Exposed as `NAP_N_CATCHMENT_AMENDMENT_2028` (dated, sourced, evidence class A-STAT) but deliberately **not applied** by `napMaxAvailableNGrazingKgHa` — this app has no per-farm "derogation status" or "named catchment" attribute yet to gate it correctly, and the effective date is still future. | https://www.irishstatutebook.ie/eli/2026/si/119/made/en/print |
| CSO — Agricultural Price Indices | Public benchmark datasets: monthly feed-stuff, fertiliser and cattle prices. Dataset catalogue (IDs AHM05/AJM01/AJM08/AJM09/AJM10) confirmed via `farm_return_core_data_v4.xlsx`'s `CSO_Price_Series` sheet — but it's an *ingestion catalogue*, not numeric observations: the sheet's own implementation note says to pull the actual time series from CSO PxStat/the API, not hard-code them. Not yet implemented — no live network access to CSO in this environment; the cashflow/revenue forecasting gap stays open until either that API access exists or the user supplies actual observation data. | https://www.cso.ie/en/releasesandpublications/ep/p-api/agriculturalpriceindicesjune2026/data/ |
| Bord Bia — Cattle Trade & Prices | Weekly cattle market data/quotes, price dashboards for market-value context. | https://www.bordbia.ie/farmers-growers/prices-markets/cattle-trade-prices/ |
| Teagasc — "Response in Beef Cattle to Concentrate Feeding in Winter" (Mar 2001) | **Primary source for continental steers' real three-strategy optimiser** (`STEER_VARIABLE_ADG_POINTS`/`calculateSteerConcentrateStrategies`, `farm_return_core_data_v4.xlsx` sheets `Steer_Trial_Evidence`/`Steer_3_Strategy`) — evidence class B-RESEARCH. Three real trial arms from two different experiments in the same paper: 0kg/day → 0.655 ADG ("Duration trial", silage-only, 0-147 days), 5kg/day → 0.968 ADG ("Pattern trial", flat 5kg/day arm, 0-126 days), 6kg/day → 1.101 ADG ("Duration trial", silage + 6kg/day, 0-147 days). Closes the gap README previously flagged ("still no variable-ADG evidence exists for finishing cattle") — the workbook's own caveat is carried verbatim into the UI: "genuine Teagasc experimental response points... not directly comparable treatments from one single modern trial... modelled scenarios, not Teagasc recommendations." Validated against the workbook's own `Steer_3_Strategy` worked calculator (590kg→712kg, 20 head → 187/127/111 days to target, reproduced exactly). Also the source for a rounding-convention fix applied across `calculateFinishingBudget` and `calculateWeanlingConcentrateStrategies`: days-to-target rounds UP (`Math.ceil`), not to nearest — the sheet's own three day-counts only reproduce exactly with ceiling. | https://teagasc.ie/media/website/publications/2001/ResponseBeefCattleConcentrateFeeding.pdf |
| Teagasc — Producing beef from grass-forage-based systems (1 Jul 2026, Spring 2026 Grange Feed Costings Model) | **Primary source for `src/domain/feed-cost.ts` (Phase 4).** `farm_return_core_data_v4.xlsx`'s `Feed_Cost_2026` sheet: €/t DM grown/utilised with and without a land charge, energy values, DM yields. Implements the "Grazed grass" row (13 t DM/ha, €140/€69 per t DM utilised incl/excl land) and the "1st + 2nd cut bale silage" row (€341/€286 per t DM utilised) — the latter used as a €/tonne-DM *proxy* for this farm's actual single-cut bale system, not an exact match (flagged in code and in the Finance screen's own UI). The source sheet's own README instructs "Use economic vs cash-cost toggle in Finance" — implemented literally as a two-way toggle on `FeedCostOverviewCard`, never blended into one number. Closed the Grass/Silage lines that stage previously showed as static mock. | https://teagasc.ie/insights/producing-beef-from-grass-forage-based-systems/ |
| Teagasc — Future Beef demonstration farms (Shane Keaveney/Cathal Irwin updates, 2024-2025) | **Primary source for `SUCKLER_DRY_COW_MINERAL_BENCHMARK`/`calculateSucklerCowMineralCostEur`** (`farm_return_gap_closure_data_v5.xlsx`, sheet `Minerals_Bedding`, row MB-002: "Mineral in straw-based diet", dry suckler cow, €0.15/head/day). Applied to this farm's real suckler cow headcount over its real housing-period length (`Housing.housingPeriod`, 1 Nov-15 Mar = 135 days) rather than a guessed annual figure. Deliberately partial — no mineral benchmark for weanlings/steers/heifers, and no real bedding-cost figure applies to this farm's actual groups (the sheet's straw-bedding rows, MB-003/004/005, are for a "Finishing bulls" system this farm doesn't run) — so Minerals stays a floor on real spend, not the whole farm's mineral bill. Evidence class A-OFFICIAL, but the sheet's own "App treatment" column is explicit: "Use as sourced example/benchmark, not universal current retail price." | https://teagasc.ie/animals/beef/demonstration-farms/future-beef-programme/farmers/shane-keaveney/novemberdecember-update-2024/ |
| Met Éireann — Climate Services (SMD model) | **Primary source for `src/domain/spreading.ts` (Phase 5).** `MetEireann_SMD` sheet (`farm_return_core_data_v4.xlsx`) gives the real drainage-class SMD model constants: each class's own modelled saturation floor (well-drained 0mm, moderately/poorly-drained -10mm) and theoretical maximum (110mm, all classes) — implemented as `DRAINAGE_CLASS_SMD_MODEL`, driving `soilDrynessIndex` (a real unit-rescale of SMD onto its own class range, not a fabricated formula) and `isGroundSaturated` (the model's own saturation floor as a hard stop). `isGroundFrozen` uses 0°C, water's real physical freezing point, checked against 10cm soil temperature. **Deliberately not built**: the full six-component weighted 0-100 "spreading score" docs/agronomy-engine.md itself flags as "validate weights before production — spec explicitly flags these as indicative" (no source supplies real weights for rainfall/SMD/soil-temp/crop-demand/drainage-risk/wind), and the statutory closed-period hard stop (no real S.I. 588/2025 date-range extract is in hand). `/spreading`'s field-by-field scores stay Phase 1 mock pending both. Validated against `farm_return_gap_closure_data_v5.xlsx`'s `Met_Dunsany_MayJul26` sheet — 92 real daily observations (rainfall, PE, evaporation, SMD by drainage class, soil/air temperature) from the Dunsany synoptic station, including two real saturation events (7 & 11 June 2026) the tests reproduce exactly. Explicitly a validation dataset, not this farm's own weather — "representative station only... production should select the nearest appropriate Met Éireann station/grid source to each mapped farm/field" — so it is never wired into the live Spreading screen as if it were this farm's current conditions (CLAUDE.md: never present modelled/station weather as an in-field sensor measurement). See README.md's "Is this connectable to live data?" note for what a real per-field live connection would need. | https://www.met.ie/climate/services |
| Met Éireann — Weather Observing Stations (25-station geographic registry) | **Primary source for `src/domain/weather-stations.ts` (Phase 5).** User-supplied station registry — name, latitude, longitude, elevation for all 25 synoptic stations Met Éireann publishes daily data for — explicitly confirmed by the user as A-OFFICIAL, `verificationStatus: "confirmed"`, cross-checked against Met Éireann's own published station page and Technical Note No. 68 (2023). Implements a real haversine great-circle distance calculation. Wired into `FieldDrawer` ("Nearest weather station" row) — confirms this farm's real Co. Cork fields are ~5-6km from Cork Airport. | https://www.met.ie/climate/weather-observing-stations |
| Met Éireann Open Observations Archive (`opendata2.met.ie/obs/`) — 21-directory reconciliation + EDR station ids | **Second audit pass on `src/domain/weather-stations.ts`/`weather-station-capability.ts`, adding real evidence from a different, externally-inspected Met Éireann source than the registry above.** 21 named station directories were externally inspected in the real Open Observations Archive and reconciled against the 25-station geographic registry by name/alias: 9 identical names, 11 aliased (e.g. "Carlow Oak Park" ↔ archive directory "OakPark"; full list in `weather-stations.ts`'s module doc comment), 5 of the original 25 (Dunsany, Casement, Cork Airport, Dublin Airport, Shannon Airport) confirmed absent under any reconciled name — kept in the registry, flagged `presentInOpenObservationsArchive: false`, never deleted (absence from one archive listing is not evidence of invalidity). One archive directory, Grange, has no match in the original 25 — added as a new record with confirmed name/existence but **`latitude`/`longitude`/`elevationM: null`** (never approximated). The archive's "Unknown" directory is explicitly excluded, never treated as a station. **Five (of 26) stations now have a real, officially-confirmed EDR API station id** (`edrStationId`, needed to actually query observations): Athenry `0018` (Met Éireann EDR documentation example), Valentia `0102` (a second EDR documentation example, `observations-swob-nrt-10min` collection), Claremorris `0103` (a real Claremorris Wind archive filename encoding the id), Newport `0011` (a real Newport Rain archive filename), Malin Head `0017` (a real Malin Head Present_Weather archive filename, whose "PW-S" component is not interpreted beyond its category). No other id is guessed or inferred sequentially — ids are identifiers, not a predictable sequence. Real archive category evidence (folder names actually seen) is recorded for these 5 stations only: Athenry (Rain, Pressure, and the uninterpreted "SHM"/"Suit_A"); Claremorris (Wind); Newport (Rain); Malin Head (Present_Weather); Valentia (all 8 real categories: Rain, Pressure, Solar_Radiation, Wind, Present_Weather, Ceilometer, Suit_A, Suit_B). This is used to derive `"ARCHIVE_PRESENT"` capability entries (never `"VERIFIED"` — the exact EDR parameter key/unit remains unconfirmed) for the categories with an unambiguous `WeatherParameter` correspondence (Rain→rainfall, Wind→speed+direction, Pressure, Solar_Radiation); `Present_Weather`/`Ceilometer`/`Suit_A`/`Suit_B`/`SHM` are recorded as raw evidence only, deliberately never interpreted (none carry a known meaning). `nearestGeographicStation`/`nearestQueryableStation`/`nearestSuitableStation` are now three distinct, separately-tested selection concepts (`weather-stations.ts` + `weather-station-capability.ts`), with a `selectStationForParameter`/`ForField` that explicitly reports `fallbackUsed` whenever the real answer isn't the geographically nearest station. `weather-service.ts`'s live pipeline now uses this fallback logic for real — verified end-to-end against the live (blocked) API: a request for this farm's real fields correctly identified Cork Airport as nearest-geographic but fell back to Valentia (the nearest confirmed-queryable station, ~121km away) rather than giving up. | https://opendata2.met.ie/obs/ |
| Met Éireann Open Data EDR API (`opendata2.met.ie`) — observation ingestion | **Primary source for `src/server/weather/` (Phase 5): `edr-client.ts`, `edr-parser.ts`, `weather-service.ts`, `forecast-provider.ts`.** Built exactly to the user's specified architecture (station registry → nearest-station → EDR request → normalised `WeatherObservation[]` → agronomic rules, each stage a separate module). Collection targeted: `observations-swob-nrt-60min`, per explicit user instruction — not independently verified as the correct/only collection beyond that instruction. **A real request was attempted from this exact code path** (not just curl) against the one fully confirmed example URL (`.../locations/0018?datetime=...`, Athenry). Result: HTTP 403, body `"Host not in allowlist: opendata2.met.ie..."` — this sandboxed session's own network-egress proxy, not a Met Éireann response (confirmed identically via a bare Node `fetch()` script and via `curl`, independent of the app). `edr-client.ts`'s `blockedByRuntime` flag detects this exact signature so results report `status: "UNVERIFIED"` rather than a generic `"UNAVAILABLE"` — **LIVE API CONNECTION: UNVERIFIED IN CURRENT RUNTIME**, not to be reported as working until a real request succeeds and parses from a runtime that can reach the host. The CoverageJSON/OGC-EDR envelope parser is built against the real, public, documented CoverageJSON standard (https://covjson.org); the Met-Éireann-specific parameter key names inside it (`EDR_PARAMETER_ALIASES`) are explicitly best-guess/unverified, tested only against a hand-built fixture, never a real captured response. `WeatherObservation` never substitutes 0 for a missing reading (`null` throughout); `calculateRollingRainfallTotals` never reports a partial sum as if it were a complete rolling total. Forecast ingestion (`opendata2.met.ie/nwp/`) is a real interface with one implementation, `notImplementedForecastProvider`, which always and correctly reports unavailable — no forecast schema has been inspected, so none is guessed. | https://opendata2.met.ie/edr/docs |
| Met Éireann EDR station id — six-candidate verification attempt (Mullingar/Phoenix Park/Mount Dillon/Gurteen/Finner/Belmullet) | **Third audit pass on `src/domain/weather-stations.ts` — negative-evidence record, no registry change.** User supplied six candidate name→id pairings (`0001`/`0003`/`0010`/`0015`/`0104`/`0105`) as search targets, explicitly not as pre-verified facts. Independent verification was attempted via `WebSearch` and `WebFetch` against every official/primary source class the task specified: `opendata2.met.ie` (EDR collections/locations), `data.gov.ie`'s "Station Details" dataset, and its underlying resource host `cli.fusio.net`. All three hosts returned `EGRESS_BLOCKED` from this sandboxed session's own network proxy (confirmed via `$HTTPS_PROXY/__agentproxy/status` — none of `met.ie`, `opendata2.met.ie`, or `data.gov.ie` appear in the proxy's allowlist) — the same runtime restriction already recorded in the EDR-observation-ingestion row below, not a Met Éireann outage. `WebSearch` alone returned only third-party snippets (Wikipedia, Garda station directory, a third-party "Irish Weather API" docs page) — explicitly insufficient under the task's own evidence rule ("search-engine snippets alone are not evidence"). Result: all six candidates **NOT VERIFIED — insufficient primary-source evidence**, none contradicted (no evidence was reachable either way). No `edrStationId`/`stationIdVerification` field was changed for any station; registry stays at 5 of 26 verified. Recorded here so a future pass with real network access to these hosts doesn't have to re-discover that this environment cannot reach them — it can go straight to fetching the actual EDR/`StationDetails.csv` content. | https://opendata2.met.ie/edr/docs |
| Met Éireann EDR station id — four of six candidates re-submitted with individual evidence (Mullingar/Phoenix Park/Mount Dillon/Gurteen) | **Fourth audit pass on `src/domain/weather-stations.ts` — 4 stations promoted to VERIFIED, 2 withheld.** Following the third pass's negative result (this sandboxed session cannot reach any Met Éireann host itself), the user supplied primary-source evidence obtained externally: for each of Mullingar, Phoenix Park, Mount Dillon and Gurteen, a specific Open Observations Archive directory URL under `opendata2.met.ie/obs(_public)/{StationName}/...` plus an example filename encoding the station id in its `..._A_{id}_K.CR3` component, each independently cross-confirmed by a second directory/category for the same station (Mullingar: a second Suit_A directory; Phoenix Park: Pressure + SHM; Mount Dillon: SHM + Pressure/Wind/Suit_B; Gurteen: SHM + Present_Weather + Suit_B). Recorded as `edrStationId`/`stationIdVerification: "VERIFIED"`/`confirmedVia` for exactly these 4 stations — Mullingar `0001`, Phoenix Park `0003`, Mount Dillon `0010`, Gurteen `0015` — following the identical implementation pattern as the 5 stations already verified. **As with every `confirmedVia` citation in this registry, this evidence was supplied from outside this sandboxed session and has not been independently re-fetched or re-verified by it** — the same evidentiary basis already used for Athenry/Valentia/Claremorris/Newport/Malin Head, made explicit here rather than assumed. Finner (`0104`) and Belmullet (`0105`) were explicitly excluded from this batch — no equivalent individual evidence was supplied for either — and are deliberately left `UNVERIFIED`, not inferred from the fact that 9 of these 11 originally-disputed ids are now confirmed. Registry moves from 5/26 to **9/26** verified EDR ids (26 canonical unchanged, 21 archive-present unchanged, canonical-unresolved 21→17, archive-present-unresolved 16→12). No capability-matrix (`weather-station-capability.ts`), parser, forecast, or agronomic-engine change made — out of scope for this pass. | https://opendata2.met.ie/obs/ |
| Copernicus Data Space Ecosystem (CDSE) — Sentinel-2 L2A STAC catalogue | **Farm Return Next Checkpoint 2, Vertical H (satellite field intelligence) — primary source for `src/server/satellite/cdse-stac-client.ts`/`src/domain/satellite-field-coverage.ts`.** Provider decided (product-owner decision, 2026-09-01, `BLOCKERS.md`): the official CDSE, initial source Sentinel-2 Level-2A surface-reflectance imagery. **A real request was made and confirmed live from this exact runtime, 2026-09-01** — unlike Met Éireann's `opendata2.met.ie` (blocked by this sandboxed session's own network-egress allowlist, see the two rows above), `catalogue.dataspace.copernicus.eu`/`identity.dataspace.copernicus.eu` ARE reachable: an unauthenticated `GET .../stac/collections/sentinel-2-l2a/items?bbox=...&datetime=...` over a real Irish bounding box (Co. Clare/Co. Limerick) returned HTTP 200 with real Sentinel-2 L2A scenes, real `eo:cloud_cover` percentages (55-83% for the initial June 2026 window — genuine Irish summer cloud cover; 0.08% found in a wider search, kept as this build's own real low-cloud fixture), and CDSE's own real, provider-computed scene-wide pixel-classification `statistics`. **STAC catalogue search/metadata requires no authentication** — only downloading a scene's raw spectral bands does (CDSE's own `oidc`/`s3` credentials, which this build session does not have and cannot create — account creation is a hard policy prohibition regardless of network access). Consequently: real, working scene *discovery* (best available real scene for a field, by real cloud cover, within a real lookback window, footprint-intersection-checked against the field's actual polygon) ships this checkpoint; real NDVI/vegetation-index computation from raw bands does not, and per `MASTER_SPEC.md`'s own explicit instruction is never presented as direct grass biomass regardless. A real live response was captured as this build's own test fixture (`cdse-stac-client.real-fixtures.ts`), the same "capture a real response as evidence" discipline the Met Éireann forecast-parser fixture above already established — not a hand-written or invented one. | https://documentation.dataspace.copernicus.eu/APIs/STAC.html |
| Met Éireann EDR station id — remaining 12 archive-present stations, completing the registry (Ballyhaise/Belmullet/Carlow Oak Park/Fermoy Moore Park/Finner/Johnstown Castle/Mace Head/Markree/Knock Airport/Roches Point/Sherkin Island/Grange) | **Fifth audit pass on `src/domain/weather-stations.ts` — all 21 archive-present stations now VERIFIED.** OFFICIAL MET ÉIREANN SOURCE — CAPTURED/VERIFIED EXTERNALLY: the user supplied, for each of the 12 remaining archive-present stations, a specific `opendata2.met.ie/obs(_public)/{ArchiveName}/{month}/{day}/{hour}/{Category}/` directory URL plus a representative filename encoding the station id in its `..._{Category}_A_{id}_K.CR3` component — canonical name → archive name → id → URL → filename, individually per station: Ballyhaise (Ballyhaise) `0007` — `.../Ballyhaise/05/11/13/Suit_B/`, `..._Suit_B_0007_K.CR3`, cross-confirmed via SHM + Pressure directories; Belmullet (Belmullet) `0105` — `.../Belmullet/06/29/00/Ceilometer/`, `..._Ceil_A_0105_K.CR3`, cross-confirmed via Suit_B + Wind; Carlow Oak Park (OakPark) `0005` — `.../OakPark/05/14/03/Pressure/`, `..._Pres_A_0005_K.CR3`, cross-confirmed via Suit_B; Fermoy Moore Park (Moorepark) `0006` — `.../Moorepark/08/23/12/Pressure/`, `..._Pres_A_0006_K.CR3`; Finner (Finner) `0104` — `.../Finner/08/23/12/Pressure/`, `..._Pres_A_0104_K.CR3`; Johnstown Castle (JohnstownCastleII) `0016` — `.../JohnstownCastleII/08/23/12/Pressure/`, `..._Pres_A_0016_K.CR3`; Mace Head (MaceHead) `0002` — `.../MaceHead/08/23/12/Pressure/`, `..._Pres_A_0002_K.CR3`; Markree (MarkreeCastle) `0012` — `.../MarkreeCastle/08/23/12/Pressure/`, `..._Pres_A_0012_K.CR3`; Knock Airport (Knock) `0217` — `.../Knock/08/23/12/Ceilometer/`, `..._Ceil_A_0217_K.CR3`; Roches Point (RochesPoint) `0008` — `.../RochesPoint/08/23/12/Pressure/`, `..._Pres_A_0008_K.CR3`; Sherkin Island (SherkinIsland) `0009` — `.../SherkinIsland/08/23/12/Pressure/`, `..._Pres_A_0009_K.CR3`; Grange (Grange) `0014` — `.../Grange/08/23/12/Pressure/`, `..._Pres_A_0014_K.CR3`. Evidence type: official Open Observations Archive (station-specific directory + filename), the same evidence class already used for the 9 previously-verified stations. **Provenance is explicit: OFFICIAL MET ÉIREANN SOURCE — CAPTURED/VERIFIED EXTERNALLY, not live-runtime connectivity** — this sandboxed session still cannot reach `opendata2.met.ie` (confirmed repeatedly via the proxy allowlist check), so none of these 12 citations, nor the 9 already recorded, were independently re-fetched by this session. Two transparency notes recorded in `weather-stations.ts`'s module doc comment rather than left unstated: (1) 9 of these 12 citations (Fermoy Moore Park, Finner, Johnstown Castle, Mace Head, Markree, Knock Airport, Roches Point, Sherkin Island, Grange) share the identical `2026-08-23 ~12:30` capture timestamp — consistent with one external browsing session covering several station directories in short order, not itself evidence for or against any individual citation; (2) the resulting 21 confirmed ids nearly fill the ascending range `0001`-`0018` (two gaps: `0004`, `0013`, presumably belonging to stations outside this archive) plus `0102`-`0105` and one outlier, Knock Airport's `0217` — each id still rests on its own individual station-specific citation, not on the aggregate pattern, and no id was adjusted toward or away from that pattern. Registry moves from 9/26 to **21/26** verified EDR ids — every archive-present station (26 canonical unchanged, 21 archive-present unchanged, canonical-unresolved 17→5, archive-present-unresolved 12→**0**). The 5 remaining unresolved canonical stations (Dunsany, Casement, Cork Airport, Dublin Airport, Shannon Airport) are exactly the 5 confirmed absent from this archive — left untouched, no id invented for them. No capability-matrix (`weather-station-capability.ts`), parser, forecast, or agronomic-engine change made — the Pressure/Suit_A/Suit_B/SHM/Wind/Ceilometer/Present_Weather/Solar_Radiation category names in this evidence were used solely to locate the station id in the filename, not to promote any weather-parameter capability. | https://opendata2.met.ie/obs/ |
| Met Éireann EDR — real captured CoverageJSON response (Valentia Observatory, `observations-swob-nrt-10min`) — parser verification | **Sixth audit pass — `src/server/weather/edr-parser.ts` parser verified against a real response; station registry NOT altered.** Official source: Met Éireann EDR API. Collection: `observations-swob-nrt-10min`. Station: Valentia Observatory. API station ID returned: `102` (JSON number, in `custom.station_id`). Canonical registry ID: `"0102"` (unchanged — zero-padded string, per `MET_EIREANN_STATIONS`). Response type: `Coverage`. Domain type: `PointSeries`. Returned count: `0` (`custom.count_total`/`numberReturned`/`numberMatched` all `0`, `domain.axes.t.values: []`) — a genuine empty result for the requested window, not a fixture limitation. Provenance: **OFFICIAL MET ÉIREANN SOURCE — CAPTURED/VERIFIED EXTERNALLY**, not live-runtime connectivity — this sandboxed session still cannot reach `opendata2.met.ie` (reconfirmed), so this response was supplied to the project already captured, never fetched by this runtime. Stored as `VALENTIA_EMPTY_REAL_RESPONSE` in the new `src/server/weather/edr-parser.real-fixtures.ts`, labelled `REAL MET ÉIREANN EDR RESPONSE — CAPTURED EXTERNALLY` in its own doc comment, distinct from the pre-existing hand-built `ATHENRY_HOURLY_FIXTURE`. Two real, evidence-driven parser fixes resulted: (1) `parameters[key].unit` is read via `.label.en` first (real Met Éireann responses use this — e.g. `air_pressure_max` → `{"label":{"en":"hPa"}}`), falling back to the previously-only-supported `.symbol` (still used by the hand-built fixture; both forms are valid per the CoverageJSON spec) — the parser previously only read `.symbol`, which this real response never populates, so it would have silently reported every real unit as `null`; (2) a new `extractCoverageMetadata()` function reads `domain.axes.x/y` coordinates, `custom.collection_id`/`station_name`/`station_id`/result-counts — none of this existed in the parser before, since no real response had ever been available to know the shape. **This particular response contains NO rainfall parameter** — its 21 real parameters (`air_pressure_max/min`, `air_temperature_max/min`, `grass_temperature_max/min`, `relative_humidity_max/min`, 8 soil-temperature depth variants × max/min, `visibility`) are all 10-minute max/min aggregates, none named `rainfall`/`rain`/`precipitation`/similar — so `Exact rainfall parameter verified` and `Rainfall unit verified` both remain **NO**; no rainfall parameter name was guessed from this evidence. The response also reveals Met Éireann's real key-naming CONVENTION is `{quantity}_{max|min}`, not the plain instantaneous names `EDR_PARAMETER_ALIASES` guesses (e.g. `"pressure"`) — deliberately NOT added as a new alias, since a 10-minute max/min aggregate is not obviously the same quantity this app's `pressureHPa` field assumes (an instantaneous reading); recorded as an open question, not resolved by assumption. Station-ID finding: the live API serialises the station id as a bare JSON number (`102`), not this registry's zero-padded string (`"0102"`) — documented, and reconciled only via a new, narrowly-scoped `normalizeEdrStationId()` helper in `weather-stations.ts` (constrained to the exact 4-digit zero-padded shape every current registry id already has); the registry itself was NOT migrated to numeric ids. `Live API connection verified` stays **NO** — this remains a captured-response test, not a live request. No change to rainfall/spreading/forecast/agronomic logic or farmer-facing UI. | https://opendata2.met.ie/edr/collections/observations-swob-nrt-10min/locations/102 |
| Met Éireann EDR API — LIVE CONNECTION VERIFIED (Athenry `0018` & Valentia `0102`/Roches Point `0008`, `observations-swob-nrt-60min`) | **Seventh audit pass — closes the live-verification gap the sixth pass (captured-response-only) left open.** Run from a session with normal network egress (unlike every prior sandboxed session recorded above, all confirmed egress-blocked to `opendata2.met.ie`). Real requests succeeded end-to-end through the actual application code path — both directly (`fetchEdrObservations`/`parseEdrObservationsResponse`, via `npx tsx` blocked by `server-only`'s bundler-only guard, so verified instead through a running `next dev` server) and via the app's own `GET /api/weather/observations` route: `?lat=53.289167&lng=-8.785556` (Athenry, HTTP 200, `status: "LIVE"`, 135 real hourly observations) and `?fieldId=field-back` (this farm's real Back Field, Co. Cork — correctly fell back from Cork Airport, nearest geographically at 5.99km but no confirmed EDR id, to Roches Point, 20.31km, `fallbackUsed: true`, `status: "LIVE"`, real current conditions e.g. 18.79°C, 63.7%RH, 1010.95hPa as of 2026-08-24T16:00Z). Also fetched directly via `curl` against Athenry and Valentia for exploratory diagnosis (see below), independent of the app. **Real findings that changed the code, not just confirmed it:** (1) the API's DEFAULT output format (no `f=` param) is a flat `{items: [...]}` shape, not CoverageJSON — `edr-client.ts` now always requests `f=CoverageJSON` explicitly (confirmed valid via the collection's own `output_formats` list and its response's own `custom.links` "self" entry); (2) an unfiltered CoverageJSON request pads its `t` axis to the union of every parameter's timestamps, and one real parameter, `present_weather_code_hour`, reports at ~1-minute resolution even on this "hourly" collection — bloating the response and, over a 7-day lookback, exceeding the API's 2000-item single-page limit — so `edr-client.ts`/`weather-service.ts` now filter to `DEFAULT_EDR_PARAMETER_NAMES` (`edr-parser.ts`), confirmed real names only (see next point), via the OGC EDR `parameter-name` filter (confirmed 1080 items for a 7-day Athenry request, 135 real hourly Athenry observations, 328/1080-ish for other windows — all comfortably under the 2000-item limit; this client still does NOT follow pagination `links`, a real, documented, un-silenced limitation for any future longer-lookback or denser-station request); (3) confirmed real parameter names for `observations-swob-nrt-60min` — `precipitation_amount` (mm, real hourly total — **resolves the rainfall-parameter-name gap the sixth pass left open**, since Valentia's `-10min` capture had no rainfall parameter at all), `air_temperature` (°C), `relative_humidity` (%RH), `wind_direction` (Deg), `air_pressure` (hPa), `grass_temperature` (°C), `soil_temperature_10cm` (°C) — each now the first candidate in `EDR_PARAMETER_ALIASES`, old pre-verification guesses kept only as fallback candidates for other collections; (4) `wind_speed` is real and confirmed but published in **knots**, not m/s — `edr-parser.ts` converts using the real, documented nautical-mile definition (1 knot = 1852m/3600s exactly, not a guessed factor) and refuses to populate the field at all if a response's unit isn't recognised as "kts" or "m/s"; (5) Met Éireann's own parameter `description.en` text documents `-99` as its missing-reading sentinel across many parameters ("-99 if no sensor") — real evidence read directly from the live response, not an assumption — so the parser now nulls any raw value exactly equal to `-99` for every field (no `-99` actually occurred in either live capture, so this is exercised by a hand-built unit test, not the real fixture, and recorded here as the honest distinction); (6) solar radiation stays DELIBERATELY UNMAPPED — the real parameters (`global_solar_radiation_energy`/`diffuse_solar_radiation_energy`) are hourly-total ENERGY in J/cm², not instantaneous POWER in W/m² the way `solarRadiationWM2` assumes — a genuine quantity mismatch, not just a unit mismatch, so no alias/conversion is guessed. A full real 24-hour Athenry response (25 hourly readings × 8 confirmed parameters, live-fetched by this session, not externally supplied) is stored as `ATHENRY_LIVE_HOURLY_REAL_RESPONSE` in `edr-parser.real-fixtures.ts`, distinct in provenance from `VALENTIA_EMPTY_REAL_RESPONSE` (externally captured, supplied to a prior blocked session) — both kept, since they demonstrate different real evidence (a genuinely empty `-10min` response vs. a genuinely populated `-60min` one). **Wired into the UI**: the Spreading screen's new `CurrentConditionsCard` calls `GET /api/weather/observations?fieldId=...` client-side and renders `LIVE`/`STALE`/`UNAVAILABLE`/`UNVERIFIED` states exactly as `WeatherForFieldResult` reports them — never fabricating a reading the API didn't return, and never presenting this station data as an in-field sensor measurement (station name + real distance are always shown alongside every reading). | https://opendata2.met.ie/edr/docs |
| Met Éireann point-forecast API (`openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast`) — LIVE, VERIFIED | **Eighth audit pass — real forecast ingestion, replacing the `notImplementedForecastProvider` stub.** `forecast-provider.ts`'s prior doc comment named a raw NWP GRIB2 archive (`opendata2.met.ie/nwp/`) as the only known forecast source; that was checked first and found to have **zero forecast-cycle directories currently listed** (`GET /nwp/` returns a real Apache autoindex whose own text says "Select a forecast cycle (fcYYYYMMDDHHMM)..." with none present) — a real, recorded finding, not a parsing bug, and not pursued further since this app has no GRIB2 reader regardless. A search then found Met Éireann's SEPARATE, documented point-forecast product instead (data.gov.ie "Met Éireann forecast API" dataset + its "API Changes" note): the OLD host `metwdb-openaccess.ichec.ie` is being retired 2026-09-15 in favour of `openaccess.pf.api.met.ie` — this app uses the new host only. A real request against this farm's own coordinates (`?lat=51.9&long=-8.4863`, this session, direct `curl` and independently via the app's own new `GET /api/weather/forecast` route through a running `next dev` server) returned HTTP 200 with a genuine `weatherapi-0.4.xsd` XML document (the well-known met.no-derived point-forecast schema): real `<model>` metadata for 4 real model runs (`harmonie` — short-range, `termin`/`runended`/`nextrun` all real timestamps; `ec_n1280_1hr`/`_3hr`/`_6hr` — progressively longer-range/coarser EC tiers), and 214 real `<time>` entries spanning now → +9 days for the full response (105 in the app's own `fieldId=field-back` live call, since the app requests exactly this farm's coordinates rather than the exploratory 51.9/-8.4863 point). **Two real, load-bearing findings, not documentation-only assumptions:** (1) HTTPS to this exact host times out (`curl -v`, 10s, port 443, confirmed independent of this app) — only `http://` answers, so `forecast-client.ts` deliberately uses HTTP for this one host, a documented exception, not an oversight; (2) the response's `Content-Type` is `text/plain`, not `application/xml`, so the client always reads `.text()` rather than branching on content-type. **Real schema structure, discovered from the live response itself**: each forecast timestamp is split across TWO `<time>` elements that must be paired — an INSTANT entry (`from === to`: temperature °C, wind speed m/s + direction deg + gust m/s, humidity %, pressure hPa, cloudiness %, dewpoint °C, global solar radiation W/m²) and a WINDOW entry (`from < to`, whose `to` equals the paired instant's own timestamp: total rainfall mm over that preceding interval — real values from 0 to 9.5mm observed in the captured window — plus a real Met Éireann/met.no weather-symbol id, e.g. `"Sun"`, `"LightRainSun"`, `"Rain"`, `"Drizzle"`). Window width itself is real evidence of forecast resolution at that lead time: 1-hour to ~90h, 3-hour to ~144h, 6-hour beyond — never presented as uniformly precise. `forecast-parser.ts`'s `extractForecastModelRuns` reads the real `<model>` metadata; `forecast-provider.ts` uses the primary `harmonie` run's own real `nextrun` timestamp (Met Éireann's own stated re-run schedule) to classify LIVE vs STALE — real, sourced evidence, not a guessed staleness threshold. `symbolId` is kept as Met Éireann's own raw string, never mapped to an icon/score inside the parser — CLAUDE.md: that mapping, if built, needs its own explicit, reviewed vocabulary, not an invented one. A 44-entry real excerpt of the live captured response (this farm's coordinates, HTTP 200, unmodified aside from trimming) is stored as `LOCATION_FORECAST_LIVE_REAL_RESPONSE` in `forecast-parser.real-fixtures.ts`. **⚠️ Licensing note, NOT resolved in this pass**: met.ie's Open Data documentation states it has "a custom licence for certain datasets, principally 'live' forecast data" — distinct from the CC-BY-4.0 licence covering most other Met Éireann open datasets (including the EDR observations row above). The licence document itself was not fetched/reviewed here; flagged per CLAUDE.md's "review licensing/API terms before using external datasets commercially" for product/legal review before this forecast is used commercially, not resolved by assumption. **Ninth audit pass — now wired into the Spreading screen, deliberately without touching the score.** `NineDayForecastCard` (`src/components/farm/NineDayForecastCard.tsx`) renders this same `GET /api/weather/forecast` response — real per-day temperature range, rainfall total, wind speed/direction and Met Éireann's own symbol id, plus a deterministic weather-only summary strip (rolling 24h/3-day rainfall, strongest wind, temperature range) — computed by a new pure aggregation module, `src/domain/weather-forecast.ts` (`calculateForecastRainfallTotals`, `groupForecastPointsByLocalDay`, `forecastTemperatureRange`, `strongestForecastWind`), unit-tested (18 tests) including the never-substitute-a-partial-sum rule already established for observations, plus a specific fix for a day-boundary edge case (a rainfall window ending exactly at local midnight is attributed to the day whose rain it actually covers, not the day its end-timestamp nominally reads as — see the module's doc comment). Symbol→icon/label display is a separate, explicit table (`src/lib/forecast-symbols.ts`) per `forecast-parser.ts`'s own instruction that this mapping doesn't belong in the parser. **At the time of this pass, `SpreadingHeroCard`/`SpreadingForecastStrip`'s 0-100 mock score was untouched and NOT fed by this forecast** — since retired entirely, see the Tenth audit pass row below. Licensing remains exactly as flagged above: NOT resolved by this pass either. | http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast |
| — Mock 0-100 spreading score, presentation clean-up (product/visual safety, no new agronomic logic) | **Tenth audit pass — neutralised on every screen that showed it, not just Spreading.** Inspection found the same unsourced mock score (`mockSpreadingScores`/`mockSpreadingForecast`) presented with full visual authority — ring, "Very good"/"Marginal" banding, and (for one mock entry) a "Hard stop — do not spread" safety-sounding verdict — on **five surfaces**, two of which aren't even about spreading: `SpreadingHeroCard`/`SpreadingForecastStrip`/`SpreadingFieldRow` (`/spreading`), `BestSpreadingCard`/`FarmMapCard` (Dashboard), `FieldDrawer` (Fields), and `FieldIdentityRow` (Nutrient Planner + Silage Planning screen headers). All five now show a neutral "Under validation" state instead — no score, no band label, no hard-stop wording — per `SpreadingSuitabilityValidationCard`'s doc comment. `FarmMapCard`'s map tint switched from the mock score to `landUseTone` (real field data, already used for this exact purpose elsewhere) instead of being left without a tone source. `SpreadingHeroCard.tsx`/`SpreadingForecastStrip.tsx` deleted (zero remaining consumers). `mockSpreadingScores`/`mockSpreadingForecast` themselves still exist in `mock-farm.ts` (per-field soil-temp/rainfall/drainage *readings* in `SpreadingFieldRow` still read from `mockSpreadingScores`, kept as plain facts, not a verdict) — no new threshold, weight, or scoring logic was added anywhere. 11 new tests assert the old score/band-label/hard-stop text is absent and the neutral state is present. Playwright visual baselines regenerated for the 5 touched screens (dashboard/fields/nutrients/silage/spreading) only. | (internal UI change, no external source) |

## Weather/spreading capability status (Phase 5, current as of this pass)

| Capability | Status |
|---|---|
| Live observations (Met Éireann EDR) | **VERIFIED AND UI-WIRED** — `CurrentConditionsCard` on `/spreading` |
| Live forecast (Met Éireann locationforecast) | **VERIFIED AND UI-WIRED** — `NineDayForecastCard` on `/spreading` |
| Spreading 0-100 score | **UNVERIFIED / UNSOURCED WEIGHTING — NOT ACTIVE AS FARMER GUIDANCE.** Mock data still exists internally (`mockSpreadingScores`/`mockSpreadingForecast`) but is no longer presented as a score, band label, or verdict on any screen — every surface that showed it now shows a neutral "Under validation" state instead (see the Tenth audit pass row above) |
| Forecast commercial licence | **BLOCKED — COMMERCIAL LICENCE REVIEW** — met.ie's stated custom licence for "live" forecast data has not been reviewed; do not treat as resolved |
| CSO — AJM01 Cattle Price, AHM05 Input/Output Indices, AJM09 Fertiliser Price | **Primary source for `src/domain/market.ts` (Phase 4/7).** Real 24-month numeric time series (`farm_return_gap_closure_data_v5.xlsx`, sheets `CSO_Cattle_24m`/`CSO_Indices_24m`/`CSO_Fertiliser_24m`, Jul 2024-Jun 2026) — only the weight-band/product categories this farm's own groups and Market Prices rows actually match are embedded: Bullocks/Heifers 300-349kg (blended for the Weanlings group, which has no recorded `sex`), Bullocks 400-449kg (store bullock reference), Compound 18-6-12, Urea 46% N (near match for "Protected Urea" — same nutrient content, not specifically stabilised urea), Compound 0-7-30, and the full output/input price index pair. Real latest price, real month-over-month `changePct`, and a real trailing-12-month low/high range (the sheet's own "low/base/high scenarios" framing) now drive the `mp-weanling`/`mp-store`/`mp-1861-12`/`mp-urea`/`mp-0-7-30` rows on `/market-prices` and `MarketWatchCard`, plus a new real "price-cost squeeze" indicator (output ÷ input index) on `/market-prices`. **New consumer, same two series, no new evidence**: `/livestock/lg-weanlings` (previously 404 — this group had no Livestock Economics entry at all) now uses `weanlingPriceSeries()`/`CSO_BULLOCKS_400_449KG` directly as real whole-head sell-now/target-weight prices (`LivestockEconomicsPricing`'s `mart_price_per_head` kind, `src/domain/livestock.ts`) — legitimate because these two real prices sit at two genuinely different real weights (335kg vs 420kg), unlike the Feed Optimiser's 3-strategy comparison, which keeps one fixed target weight across all three strategies and so was deliberately *not* given a margin figure (see `calculateSteerConcentrateStrategies`'s own doc comment). **Deliberately not built**: a real monthly farm cashflow curve or a real whole-farm total-revenue figure — this data model has no real sales/cost *timing* calendar (which animal group sells in which month, at what weight), and the sheet's own limitation note says these are historical observations, not forecasts. `mockCashflow` and `mockFinanceSummary.totalRevenueEur` are untouched; closing them needs a real sales-plan/log data source, not more price history. | https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM01/CSV/1.0/en |
| — Bulk-buy supplier quote schema | **Confirmed to still require a live commercial source** — both `farm_return_core_data_v4.xlsx`'s `Bulk_Buy_Schema` (three rows explicitly marked "Example only") and the follow-up `farm_return_gap_closure_data_v5.xlsx`'s `Bulk_Buy_Status` sheet ("Live Supplier Data Still Required... Do not populate from invented examples") agree: no amount of further spreadsheet extraction closes this one. Defines the shape a real Input Planner bulk-buying feature would need (supplier, product, quantity, all-in price, delivery, validity date) — a live merchant/supplier quote is the only thing that can fill it. **This blocks only the regional-demand/pricing/savings half of Phase 6** — the demand-forecast half (how much fertiliser/concentrate this farm itself needs) needed no new evidence and is now real: `withRealInputRequirements`/`withRealBuyingOpportunityRequirement` (`src/domain/finance.ts`) wire the already-registered nutrient-engine (Green Book/NAP, above) and feed-cost-engine (Teagasc Animal Nutrition Database, below) totals into the Input Planner's Fertiliser/Feed rows and the "Your requirement" figure on the Fertiliser bulk-buy card — real tonnage and cost, live-recomputed from this farm's own fields/herd. Lime, Bale Wrap, "Other", and every other field on every bulk-buy row (regional demand, current/target price, potential saving) are unaffected and stay Phase 1 mock. | (workbook only, no public URL) |

## Farm Return Next — Supports Intelligence + Farm Strategy phase (2026-09-04)

`src/domain/scheme-registry.ts`'s five seeded Irish scheme records. Every
individual `SchemeRule` cites its own `SchemeSource` inline in that
module (tier, publisher, URL, `retrievedVia`, `retrievedAt`) — not
repeated row-by-row here; this entry records the phase-level sourcing
posture and its one real, disclosed tooling limitation.

| Source | What it's the evidence base for | URL |
|---|---|---|
| Teagasc — Young Farmer Capital Investment Scheme (YFCIS) (TAMS 3) | **Primary source for `tams3-yfcis`/`tams3-general`'s shared structure.** Fetched directly (`WebFetch`, 2026-09-04): 60%/€90,000 (€160,000 partnership) young-farmer rate, age 18-40, Annex J qualification (36-month grace period), set up within 5 years, minimum 5ha BISS-declared, minimum €2,000 eligible investment. | https://teagasc.ie/rural-economy/rural-development/equine/grants-and-schemes/young-farmer-capital-investment-scheme/ |
| IFAC — TAMS III deadlines are approaching: should you apply? | **Corroborates `tams3-general`'s standard 40%/€90,000 rate** — an authoritative secondary (farm accountancy/advisory) source, used because DAFM's own `gov.ie` TAMS pages returned HTTP 403 to this session's own `WebFetch` tool (see below). | https://www.ifac.ie/news-insights/news/tams-iii-deadlines-are-approaching-should-you-apply- |
| Teagasc — Areas of Natural Constraint (ANC) | **Confirms `anc`'s one real eligibility criterion** (minimum 0.10 LU/forage ha for 28 consecutive weeks/7 months). Explicitly does NOT supply a per-hectare payment rate or the designated-area boundary — `anc`'s own `verificationStatus` is `RULES_UNVERIFIED` for exactly that reason; no rate is guessed. | https://teagasc.ie/rural-economy/rural-development/equine/grants-and-schemes/areas-of-natural-constraint/ |
| gov.ie (DAFM) — National Reserve (Young Farmer Category) | **Primary source for `national-reserve-young-farmer`'s eligibility gate** (age ≤40, first-time/within-5-years set-up, NFQ Level 6 by 15 May 2026, 2026 BISS participation, 15 May 2026 deadline). This session's own `WebFetch` received HTTP 403 from this exact URL — the quoted eligibility text was instead returned intact inside a `WebSearch` result summary citing this page as its origin (`retrievedVia: "search_result_summary"`, disclosed in `scheme-registry.ts` itself, not asserted as a direct live fetch). | https://www.gov.ie/en/department-of-agriculture-food-and-the-marine/services/national-reserve-young-farmer-category/ |
| Citizens Information — Basic Income Support for Sustainability Scheme for farmers | **Structural source for `biss`** (one entitlement per eligible hectare, convergence to ≥85% of national average by 2026, €700/ha payment cap). The actual 2026 national-average entitlement euro value — which every BISS/National-Reserve-top-up monetary figure would depend on — was NOT confirmed by any source this session could reach; `biss`'s own `verificationStatus` is `RULES_UNVERIFIED` for that reason, and no such figure is shown anywhere in the app. | https://www.citizensinformation.ie/en/environment/land/basic-income-support-for-sustainability-scheme-for-farmers/ |

**Real, disclosed tooling limitation (2026-09-04)**: this session's own
`WebFetch` tool received HTTP 403 Forbidden from every `gov.ie` DAFM
scheme page it tried directly (ANC, YFCIS, National Reserve, BISS
entitlements/payment-rates) — confirmed repeatedly, not a one-off. This
is the same class of gap this register's own Met Éireann rows already
document for a different host (`opendata2.met.ie`, blocked by a
sandboxed session's own network-egress proxy) — a real runtime
limitation, not evidence those DAFM pages say something different. Every
number in `scheme-registry.ts` is sourced to a page this session's tools
*could* actually read (directly or via a search-result summary quoting
the origin URL); no number is filled in from general knowledge or
inferred from a page this session couldn't read.

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

## Modules with no external source (mathematical/geometric facts only)

Final whole-session Codex audit (Strict Visual Reproduction phase,
`docs/farm-return-next/audit-logs/20260903T161401Z.md`, HIGH):
`DOMAIN_CONTRACTS.md`'s "new contracts" process requires "a
`docs/evidence-register.md` entry before any production screen consumes
[a new `src/domain/` module] for a real figure" — this register's own
table above is scoped to external authoritative sources (Teagasc, S.I.,
Met Éireann) for agronomy/nutrition/weather/price *rules*, which these
two modules are not: they compute no agronomic, regulatory or advisory
value. Recorded here instead, following the exact precedent
`units.ts`'s own P2O5/P and acre/hectare conversions already set (cited
inline in code comments, never added to the sourced table above):

- **`src/domain/wind-speed.ts`** (`metresPerSecondToKmPerHour`) — the
  exact SI definition 1 km/h = 1000m/3600s, so 1 m/s = 3.6 km/h. Not a
  Met Éireann figure or model output; a fixed mathematical conversion of
  whatever real wind-speed reading the Met Éireann pipeline already
  supplies.
- **`src/domain/near-field.ts`** (`distanceToPolygonKm`, `findNearbyField`)
  — standard ray-casting point-in-polygon and point-to-segment geometry
  (real, published algorithms, not a Farm Return invention) plus one
  proximity heuristic constant (`NEAR_FIELD_THRESHOLD_KM`, 300m — a
  product/UX judgement call, documented and centralised in the module
  itself, not a Teagasc/S.I./Met Éireann-sourced number this register's
  own table format would fit).
- **`src/domain/gps-activity-detection.ts`** (`advanceStartDetection`,
  `advanceFinishDetection`) — Codex audit HIGH (GPS Job Mode campaign
  round 12, `docs/farm-return-next/audit-logs/20260904T231926Z.md`): the
  module's own header comment had disclosed this precedent inline since
  Phase 1 but an actual entry here was never filed — recorded now,
  belatedly, not a new exception. Computes no agronomic, regulatory, or
  advisory value: real, published point-in-polygon/point-to-boundary
  geometry (`near-field.ts`'s own `distanceToPolygonKm`/
  `distanceToPolygonBoundaryKm`, reused not reimplemented) and real
  inter-sample speed/time arithmetic (`weather-stations.ts`'s
  `haversineDistanceKm`), gated by a set of named, centralised GPS
  Activity Candidate detection heuristics (`GpsActivityDetectionConfig`
  — dwell/sample-count/inside-ratio/speed/expiry/departure-duration/
  continuity-gap thresholds). Every one is a product/UX judgement call
  about "is this farmer probably working this field", disclosed as such
  in the module's own header comment, never presented as scientific or
  regulatory fact, and never itself the source of a persisted
  job/actual figure — a detected candidate becomes a real `job_sessions`
  row only once the farmer explicitly confirms it
  (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`),
  at which point the existing, already-evidenced Confirm Actual flow —
  not this module — is the source of every figure that reaches a
  production record.

- **`src/domain/field-awareness.ts`** (`FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS`,
  `FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS`, `classifyFieldAwarenessFreshness`,
  `classifyFieldAwarenessAttention`, `classifyFieldAwarenessConfidence`) — Farm
  Awareness / Satellite Field Intelligence campaign (2026-09-08). Computes no
  agronomic, regulatory, or crop-condition value — see
  `docs/farm-return-next/FIELD_AWARENESS_ARCHITECTURE.md` for the full Phase 0
  finding this module is built around: real, field-specific vegetation/NDVI
  computation is blocked (`docs/farm-return-next/BLOCKERS.md`, CDSE account
  policy prohibition), so there is no real crop-health signal for this module
  to classify. What it does classify — disclosed here as pure product
  judgement, never agricultural or remote-sensing science:
  - **`FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS`** (`currentMaxDays: 3`,
    `recentMaxDays: 7`, `ageingMaxDays: 14`) — how many days since a field's
    last usable satellite pass before that field's monitoring is described as
    "current"/"recent"/"ageing"/"stale". Chosen relative to Sentinel-2's own
    real ~2-3 day revisit cadence over Ireland
    (`src/domain/satellite-field-coverage.ts`'s own `DEFAULT_LOOKBACK_DAYS`
    comment) and to Irish weather's own real tendency toward multi-day cloud
    runs — a UX/product calibration, not a Teagasc/S.I./Met Éireann figure. A
    future tuning pass changes only these three numbers. Codex audit MEDIUM
    (round 8, clarified as intentional, not a bug): these are whole, floored
    elapsed days (the same "N days ago" convention used everywhere in this
    app), so an observation 3 days 23 hours old floors to `3` and stays
    "current" — `currentMaxDays: 3` means "up to just under 4 real elapsed
    days", not an exact 72-hour cutoff.
  - **`FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS`** (30) — how far back this
    module searches for a usable scene, wider than
    `satellite-field-coverage.ts`'s own conservative default (10) so a
    genuinely old observation can be classified "ageing"/"stale" rather than
    collapsing straight to "no coverage at all". A caller-supplied
    `selectMostRecentUsableSatelliteCoverage` option (round 1 switched the
    orchestration layer to that function — see the same module's own row
    below), not a change to that module's own default lookback for any
    other caller.
  - **`classifyFieldAwarenessAttention`** (`normal`/`worth_watching`/
    `worth_checking`) — based entirely on the freshness classification above
    (i.e. on monitoring currency), never on a fabricated crop-condition
    judgement, and never a claim that the field was seen "clearly" — no
    scene-wide cloud-cover metadata can confirm that (see
    `classifyFieldAwarenessConfidence` below). "Worth checking" means "we
    haven't had a usable satellite pass over this field in a while", never
    "something is wrong with the crop". A field with no mapped boundary is
    always "normal" — nothing to monitor yet, a separate "map this field"
    concern this module does not invent. Also takes a real, disclosed
    `isProviderOutage` flag (Codex audit MEDIUM, round 2): a genuine
    provider outage is not evidence about the field and stays "normal",
    unlike a confirmed absence of coverage.
  - **`classifyFieldAwarenessConfidence`** (`high`/`medium`/`low`, though it
    never actually returns `"high"` — see below) — derived directly from
    the same freshness classification, reusing `ConfidenceBadge`'s existing
    high/medium/low UI vocabulary rather than introducing a second one. Not
    `EvidenceState` (`evidence.ts`): that
    classifies the kind of evidence a value rests on; this classifies how
    much a farmer should trust one specific snapshot given how recently it
    was actually observed.
  - **`FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT`** (40) — Codex audit
    HIGH (round 1, 2026-09-08): the module's first version had no cloud-cover
    usability ceiling at all, so a fully cloud-obscured (100%) scene could
    reach the UI as a "current"/"high confidence" observation. A candidate
    scene whose real `cloudCoverPercent` exceeds this ceiling is never
    treated as usable evidence, however recent
    (`src/domain/satellite-field-coverage.ts`'s
    `selectMostRecentUsableSatelliteCoverage`, which this module's
    orchestration layer now calls instead of `selectBestSatelliteCoverage`).
    A real, disclosed engineering judgement — a scene materially more than a
    third cloud-obscured is unlikely to give a genuinely representative look
    at a single field — not a Teagasc/S.I./Met Éireann figure.
  - **Why `classifyFieldAwarenessConfidence` never returns `"high"`** — Codex
    audit HIGH (round 2, sharpened further in round 3): a real,
    cloud-cover-based confidence cap was tried between these two rounds
    (a lower, second threshold degrading "current" to `"medium"` above 15%
    real cloud cover), but round 3 correctly rejected that as still
    insufficient. `cloudCoverPercent` is real STAC `eo:cloud_cover` — a
    *scene-wide* statistic over the whole ~100km Sentinel-2 tile — and no
    threshold on it, however strict, can establish that one small field
    within the scene was genuinely visible: this is an inferential gap
    (scene-wide evidence cannot speak to field-level visibility at all), not
    a calibration problem a better number could fix. Genuinely confirming
    field-level visibility needs the same per-pixel band access NDVI
    computation requires, which stays blocked for the same disclosed reason
    (`docs/farm-return-next/BLOCKERS.md`). `"medium"` is therefore the
    honest ceiling for any confidence built on scene-wide satellite metadata
    alone; the real cloud-cover percentage is disclosed directly in the UI
    instead of being folded into a confidence tier that cannot actually
    speak to it. Rounds 6, 7, and 8 each raised the identical argument
    again with no materially new angle and were rejected for this same
    reason — a permanent, settled position for this module, not
    re-litigated per round.
  - **"Latest satellite pass (within the cloud limit)"** (`FieldAwarenessCard.tsx`,
    Codex audit MEDIUM, round 7) — `selectMostRecentUsableSatelliteCoverage`
    deliberately excludes any candidate above
    `FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT` before picking the
    most recent survivor, so the scene shown can genuinely be older than
    the single most recent real Sentinel-2 pass, if that pass was too
    cloudy. The UI label discloses this rather than implying "the single
    most recent pass, full stop" — a real, disclosed wording precision,
    not a scientific figure.
  - **`FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING`** (`field-awareness.ts`,
    Codex audit MEDIUM, round 7) — a real confirmed-activity database read
    failure is now handled independently of the satellite fetch (they were
    previously coupled through one `Promise.all`, so an activity-read
    failure discarded otherwise-valid satellite coverage entirely). This
    warning discloses a genuine activity-read failure, distinct from
    `FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING`'s own real, different
    cause (a farm genuinely exceeding `MAX_CONFIRMED_JOB_SESSIONS`).
  - **Tile-edge partial field coverage — resolved for this campaign's own
    selector (Codex audit HIGH, round 4).** Round 3 initially rejected a
    finding about this as out of scope (reusing
    `satellite-field-coverage.ts`'s own already-frozen, 8-round-audited
    `filterEligibleCandidates`, which uses `booleanIntersects`, not full
    containment). Round 4 correctly reframed the ask: rather than changing
    that shared, frozen helper (which would reopen Vertical H's closed
    audit for every caller, including `selectBestSatelliteCoverage`),
    `selectMostRecentUsableSatelliteCoverage` — this campaign's own new,
    still-unfrozen function — gained an *additional*, function-local
    requirement: a candidate scene must genuinely `booleanContains` the
    whole field polygon, not merely intersect it. `selectBestSatelliteCoverage`
    itself, and `filterEligibleCandidates`'s own shared intersects check,
    are completely unchanged — this stricter rule applies only to the new
    function this campaign added.
  - **`FIELD_AWARENESS_SATELLITE_SEARCH_LIMIT`** (100,
    `src/orchestration/field-awareness/index.ts`) — Codex audit MEDIUM
    (round 5): `cdse-stac-client.ts`'s own real `DEFAULT_LIMIT` (20) was
    never overridden here, but `FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS`
    (30) deliberately searches a far wider window than that default was
    sized for, and the STAC endpoint's own result ordering for an
    unpaginated request is not specified — a genuinely more recent or
    usable scene could silently fall outside an unpaginated 20-result
    page. 100 is a real, disclosed, generous engineering safety margin
    (Sentinel-2's own ~2-3 day revisit cadence over Ireland implies
    roughly 10-15 real passes in 30 days; even doubling that for
    tile-overlap duplication stays well under 100) — not a scientific
    figure.

- **`src/domain/satellite-field-coverage.ts`** (`selectMostRecentUsableSatelliteCoverage`,
  added 2026-09-08, Codex audit round 1 of the Farm Awareness / Satellite
  Field Intelligence campaign, strengthened round 4) — a purely additive
  export alongside the existing, unmodified `selectBestSatelliteCoverage`
  (same precedent as `near-field.ts`'s `distanceToPolygonBoundaryKm`: a new
  capability added to an already-frozen contract without changing its
  existing behaviour or tests). Selects the most recently *usable* real
  Sentinel-2 L2A scene — the most recent candidate within the lookback
  window whose real footprint **fully contains** the field (round 4;
  `selectBestSatelliteCoverage`'s own weaker mere-intersection check is
  unchanged for that function) and whose real cloud cover is at or below a
  caller-supplied `maxCloudCoverPercent` ceiling (required, never defaulted
  by this shared primitive — the calling feature owns and discloses its own
  usability threshold). Computes no agronomic, regulatory, or crop-condition
  value — same real, published selection/geometry logic as
  `selectBestSatelliteCoverage`, just ranked by recency-among-usable rather
  than least-cloud-globally, because "how recently have we had a usable,
  whole-field look" (monitoring currency) and "what is the single clearest
  image overlapping this field at all" (any age) are genuinely different
  questions.

- **Fertiliser Vertical — End-to-End Real Workflow campaign (2026-09-08)**
  — `docs/farm-return-next/FERTILISER_VERTICAL_ARCHITECTURE.md` has the
  full account; every real N/P/K rate, product composition and NAP
  ceiling this vertical uses is `nutrients.ts`'s own already-registered
  Teagasc/S.I. 588/2025 evidence above, unmodified. What follows is
  disclosed here as pure product/engineering judgement, never science:
  - **"No new Plan table"** (`src/orchestration/prompt/
    fertiliser-recommendation.ts`, `src/app/actions/fertiliser-plan.ts`)
    — a canonical planned fertiliser application is a real, accepted/
    edited `fertiliser_recommendation` Decision row, not a new persisted
    entity. Lifecycle (Suggested → Planned → Active → Completed-
    estimated → Completed-actual → Dismissed) is derived, never stored,
    from existing `decisions`/`job_sessions`/`job_actuals` state. A
    product/architecture decision, not a scientific one — see the
    Phase 0 doc's own "no new Plan table" section for the full lifecycle
    mapping this rests on.
  - **`FertiliserPlanEdits` allowlist** (`plannedProduct`,
    `plannedQuantityKg`, `plannedDate` — `fertiliser-recommendation.ts`'s
    `validateFertiliserPlanEdits`) — exactly which planning inputs a
    farmer may set on top of a live recommendation. No partial-area
    override, no farmer-entered nutrient rate: the underlying N/P/K
    requirement and product composition are never editable, only the
    farmer's own choice of how much of the recommended product they
    intend to apply and when. `plannedProduct` must exactly match one of
    the live recommendation's own real products — never an arbitrary
    farmer-typed string.
  - **GPS-to-plan matching** (`getMatchablePlanForFieldAction`,
    `src/app/actions/fertiliser-plan.ts`) — "matchable" means: this
    field, `fertiliser_recommendation`, outcome `accepted`/`edited`, and
    not already linked to any job session. No time-window narrowing is
    applied — the only real "planned date" this app has is the optional
    `edits.plannedDate`, and a hard window would silently exclude a
    genuine undated plan rather than make matching safer. More than one
    real candidate resolves to `"ambiguous"`, never an auto-selected
    guess ("a false link is worse than no link" — campaign brief item
    11).
  - **Origin `"plan"` on `job_sessions`** (`src/orchestration/
    job-session/index.ts`) — this column/value already existed at the
    schema level (defined alongside `"prompt"` before either had a real
    caller) but had never been given real, distinct semantics until this
    campaign: `"plan"` now means "this session's authorising Decision
    already existed before Start" (`startJobSessionFromPlan`, no new
    Decision inserted), distinct from `"prompt"`'s "a fresh Decision was
    constructed and inserted at Start time" (`startJobSessionFromPrompt`).
    A real, deliberate narrowing of an ambiguous existing schema value,
    not a new migration.
  - **Planned/confirmed farm-wide demand totals**
    (`src/domain/fertiliser-plan.ts`'s `aggregateFarmFertiliserDemand`,
    `src/orchestration/fertiliser-plan/index.ts`'s
    `getFarmFertiliserDemand`) — a plain `accepted` Decision with no
    explicit `edits.plannedProduct`/`plannedQuantityKg` is excluded from
    the farm-wide **planned** total (though it still counts toward
    **recommended**): when more than one product is recommended for a
    field, a bare acceptance does not by itself say which product/
    quantity the farmer means to plan, and guessing one would be exactly
    the kind of fabricated interpretation this campaign's "no product
    judgement call standing in for a scientific gap" rule forbids. The
    **confirmed** total matches real `job_actuals` by exact product name
    only (`totalProductQuantityKgByProduct`) — the same "no fuzzy match,
    no `bags`-unit total, no verified bag weight exists" discipline
    `nutrientContributionFromFertiliserActual` already established for
    nutrient contribution, reused here for a product-kg demand total
    instead.
  - **Product-composition matching for a confirmed Actual**
    (`nutrientContributionFromFertiliserActual`, `src/domain/
    fertiliser-plan.ts`) — a confirmed Actual's real nutrient
    contribution is only ever computed when its free-text `product`
    field exactly matches one of the three real, verified catalogue
    products `calculateNutrientPlan` can recommend (0-7-30, 18-6-12,
    Protected Urea) — never a fuzzy/case-insensitive match, and never for
    a `"bags"`-unit quantity (no verified bag weight exists anywhere in
    this app). Any other product/unit fails closed to
    `BLOCKED_INSUFFICIENT_EVIDENCE`, disclosed as an honest count of
    "applications that could not be included", never silently dropped
    from the total.
  - **Calendar-year season boundary** (`startOfCalendarYearIso`,
    `src/orchestration/fertiliser-plan/index.ts`, added Codex audit HIGH
    round 1, extended to the farm-wide aggregator round 2) — "confirmed
    applied" (both per-field and farm-wide) only ever counts a confirmed
    Actual from the current calendar year onward. This app has no
    dedicated "growing season"/"NAP year" concept of its own; reusing the
    calendar-year cadence S.I. 588/2025's own NAP ceilings and closed-
    period calendar already use is a real, disclosed product judgement,
    not a new scientific rule — without it, a confirmed application from
    a prior year would permanently suppress a freshly recomputed
    current-year requirement.
  - **`did_not_happen` exclusion** (Codex audit HIGH, round 2) — a
    confirmed `completionType: "did_not_happen"` fertiliser Actual is
    excluded from every count/total before any product/quantity
    processing, in both the field-level and farm-wide functions. Its own
    real product/quantity are genuinely absent by design
    (`FertiliserSpreadingActual`'s own doc comment), not merely
    unrecognised — counting it as an "unknown composition" application
    would wrongly imply a real application occurred.
  - **"Planned" excludes an already-linked Decision** (Codex audit HIGH,
    round 2, `getFarmFertiliserDemand`; refined round 3) — the farm-wide
    *planned* total excludes any accepted/edited `fertiliser_recommendation`
    Decision already linked to a genuinely in-flight
    (`listActiveJobSessionsForFarm`) or confirmed job session. A product/
    architecture consistency fix, not a new scientific rule: this
    campaign's own documented lifecycle already defines "Planned" as an
    accepted Decision with no `job_sessions` row *yet* — once linked and
    in progress or completed, it must not also still count as "planned"
    indefinitely once it separately becomes "confirmed". **Round 3
    correction**: the round-2 version instead used
    `listJobSessionDecisionIdsForFarm`, which also matches a
    **cancelled** session — a cancelled job produced no real Actual, so
    excluding it made the plan behind it vanish from both planned and
    confirmed permanently. A cancelled link is now deliberately *not*
    excluded from planned. This surfaced a real, pre-existing,
    disclosed `job_sessions` schema limitation (not introduced by this
    campaign): the database's own `unique(decision_id)` constraint means
    that exact plan can never be linked to a second job session either,
    cancelled or not — documented in
    `FERTILISER_VERTICAL_ARCHITECTURE.md`'s own "Known limitations", not
    fixed here (changing that constraint is outside this campaign's
    authority over the frozen, independently-audited GPS Job Mode
    contract).
  - **GPS matching requires an unambiguous single-product plan**
    (`isUnambiguouslySingleProductPlan`, `src/app/actions/fertiliser-plan.ts`,
    Codex audit HIGH round 4) — a bare `"accepted"` Decision whose real
    recommendation named more than one product is never GPS-matchable;
    only the farmer's own explicit `edits.plannedProduct` (always
    single) or a bare acceptance of a genuinely single-product
    recommendation counts. PRODUCT JUDGEMENT CALL, not a scientific
    rule: one GPS-detected job can never safely stand in for a whole
    multi-product blend, and the database's own `unique(decision_id)`
    constraint means linking it wrongly would permanently exhaust that
    plan's only allowed job-session link before its other products were
    ever addressed.
  - **"Already planned" disclosure, not a hard block**
    (`NutrientsPageClient.tsx`, Codex audit HIGH round 4) — before
    offering "Plan this application" again, the Nutrients screen
    discloses when a real, unexecuted plan already exists for the
    selected field (reusing `getMatchablePlanForFieldAction`). A
    deliberate UX mitigation for accidental duplicate planning, not a
    technical fix for `submitPromptDecisionAction`'s own general lack of
    retry-idempotency (see `FERTILISER_VERTICAL_ARCHITECTURE.md`'s own
    "Known limitations") — and deliberately never blocks a genuine
    second plan outright, since campaign item 15 requires supporting
    real split/multiple applications.
  - **No tillage fertiliser recommendation** (`promptForFertiliserRecommendation`,
    Codex audit CRITICAL round 6) — a field whose `plannedUse` is
    `"tillage"` never gets a `fertiliser_recommendation` Prompt at all;
    it resolves to `NOT_APPLICABLE("TILLAGE_FIELD_NOT_SUPPORTED")`
    before `calculateNutrientPlan` is even called. Not a product
    judgement call so much as a real scope boundary this app's own data
    genuinely has: no tillage N/P/K recommendation table exists anywhere
    in this codebase (only the grassland Table 12-3 curve and the silage
    tables), so presenting either for a tillage field would be a
    fabricated number for a land use this engine was never sourced for.
  - **Empty `livestockGroups` fails closed, never clamps to a concrete
    number** (`promptForFertiliserRecommendation`, Codex audit CRITICAL
    round 6) — a farm with no recorded livestock group resolves to
    `BLOCKED_INSUFFICIENT_EVIDENCE("MISSING_LIVESTOCK_DATA")` rather than
    an `OK` recommendation, whenever that recommendation would otherwise
    be actionable. PRODUCT JUDGEMENT CALL: this app's data model cannot
    distinguish "this farm has confirmed zero livestock" from "livestock
    has simply never been entered", and `nGrazingSucklerToBeefKgHa`
    clamps any stocking rate at or below its lowest defined row (1.0
    LU/ha — there is no real "0 LU/ha" row in Table 12-3) to that row's
    own 35 kg N/ha. Presenting that clamped figure as a real
    recommendation for the ambiguous case would be exactly the
    extrapolation-presented-as-fact this campaign's own fail-closed rule
    forbids. Deliberately scoped to only the branch that would otherwise
    become `OK` — a field already `NOT_APPLICABLE` for an unrelated real
    reason (Index 4 soil, a commonage/buffer legal prohibition) is
    unaffected, since no amount of livestock evidence changes that
    outcome.
  - **Per-product mock cost stripped, not just the field total**
    (`sanitiseRecommendedProduct`, `fertiliser-recommendation.ts`, Codex
    audit CRITICAL round 6) — round 5 removed
    `FertiliserRecommendationSummary`'s field-total `estimatedFieldCostEur`
    but missed that every entry in `plan.purchasedProducts` already
    carries its own real `costEur`, built from the identical disclosed
    mock `PRODUCTS` prices; that per-product figure was still reaching
    every persisted Decision's `estimateSnapshot` and
    `getLinkedFertiliserPlanForJobSessionAction`'s own client response.
    `sanitiseRecommendedProduct` is now the one real place this is
    stripped, reused (not duplicated) by `NutrientsPageClient.tsx`'s own
    separate client-side recommendation prop, which builds its product
    list directly from `calculateNutrientPlan` rather than through the
    Prompt producer.
  - **Grassland area excludes tillage ground** (`computeFarmGrasslandAggregates`,
    `src/orchestration/prompt/build-all.ts`, Codex audit HIGH round 5) —
    the farm-wide LU/ha stocking-rate denominator (Teagasc Table 12-3)
    is the farm's total area *minus* the real area of every field whose
    `plannedUse` is `"tillage"`, never the farm's whole area. A
    correctness fix, not a new rule: Table 12-3's own row definitions
    assume a grassland-only denominator, and a pre-existing bug (dated
    to before this campaign) had silently included tillage ground,
    understating the real N requirement on any mixed grassland/tillage
    farm. This campaign's own new server-side recompute path widened
    that bug's reach before the fix (see `FERTILISER_VERTICAL_ARCHITECTURE.md`'s
    "Codex audit round 5").
  - **No mock cost figure in this vertical's own new surfaces** (Codex
    audit CRITICAL round 5) — `nutrients.ts`'s own `PRODUCTS` prices are
    disclosed mock market data; `estimatedFieldCostEur` (built from
    them) is deliberately absent from `FertiliserRecommendationSummary`,
    the Prompt description, and the persisted Decision snapshot this
    campaign introduced. PRODUCT JUDGEMENT CALL: a real Prompt/Decision
    must never carry a monetary figure with the same evidentiary weight
    as the genuine N/P/K requirement beside it when that figure is known
    mock data — even though the pre-existing, frozen
    `PurchasedFertiliserCard` display elsewhere on the Nutrients screen
    already shows the same mock figure and is out of scope to
    retroactively fix.
  - **Farm-wide demand applies the identical field/livestock gates as
    the per-field Prompt** (`getFarmFertiliserDemand`, Codex audit
    CRITICAL round 7) — a tillage field, and every field when the farm
    has no recorded livestock, are excluded from the farm-wide
    "recommended" total, mirroring `promptForFertiliserRecommendation`'s
    own round-6 gates exactly. Not a new rule — a correctness fix to a
    second, independent aggregation over the same real fields that had
    silently diverged from the per-field rule.
  - **A plan must still be currently recommendable to be matchable/
    startable** (`isPlanStillCurrentlyRecommendable`, `src/app/actions/
    fertiliser-plan.ts`, Codex audit CRITICAL round 7) — before treating
    a persisted plan Decision as GPS-matchable or startable, its field's
    *current* live recommendation is recomputed and must still be `OK`.
    A plan accepted before round 6's tillage/missing-livestock gates
    existed can carry a real, frozen `"OK"` snapshot built from a
    since-recognised-invalid basis; its own historical record is never
    rewritten (provenance is permanent), but it is no longer treated as
    an *active*, executable plan once the field's current state no
    longer supports it. PRODUCT JUDGEMENT CALL, not a rewrite of
    history: "safely executable today" and "was once historically
    recommended" are different questions, and only the former gates
    GPS matching/starting.
  - **Sanitisation applies defensively at every read boundary, not just
    at write time** (`sanitiseDecisionRecordForClient`,
    `getLinkedFertiliserPlanForJobSessionAction`'s own use of
    `sanitiseRecommendedProduct`, Codex audit CRITICAL round 7) — a
    Decision persisted before round 6's mock-cost fix existed can still
    carry a real per-product `costEur` inside its own frozen
    `estimateSnapshot`; both of this vertical's client-facing read
    actions strip it regardless of whether the specific stored snapshot
    predates or postdates that fix. Never a rewrite of the underlying
    database row — only what these two actions' own returned copies
    carry.
  - **A bare acceptance of a single-product recommendation counts
    toward "Planned"** (`getFarmFertiliserDemand`, Codex audit HIGH
    round 7) — reconciles round 2's own product judgement call (a bare
    `accepted` Decision with no explicit edits is excluded from
    Planned, since an ambiguous multi-product recommendation gives no
    way to say which product the farmer means) with round 4's later
    `isUnambiguouslySingleProductPlan` refinement (a bare acceptance of
    a *single*-product recommendation is fully unambiguous, safe enough
    to GPS-match/start a job from). The identical single-product
    reasoning now also counts such a plan's own recommended
    product/quantity toward the farm-wide Planned total — a genuinely
    ambiguous multi-product bare acceptance remains excluded, unchanged.
  - **"Planned" respects the same current field-eligibility as
    "Recommended"** (`getFarmFertiliserDemand`, Codex audit CRITICAL
    round 8) — a legacy accepted/edited fertiliser Decision whose own
    field is currently tillage, or whose farm currently has no recorded
    livestock, no longer contributes to the farm-wide Planned total —
    the same real, current eligibility set (`isTillageField`/
    `hasNoRecordedLivestock`, `fertiliser-recommendation.ts`) the
    Recommended total, and `getMatchablePlanForFieldAction`/
    `startJobSessionFromPlanAction`, already apply. Not a new rule — a
    correctness fix closing a third active/executable interpretation
    path round 7 had not yet reached.
  - **A live Prompt's activityType must match its promptKind, at least
    for the one kind this campaign added** (`startJobSessionFromPromptAction`,
    `src/app/actions/job-sessions.ts`, Codex audit HIGH round 8) — a
    direct caller submitting `promptKind: "fertiliser_recommendation"`
    must also submit `activityType: "fertiliser_spreading"`, mirroring
    `startJobSessionFromPlanAction`'s own round-1 fix for the plan-
    specific start path. Deliberately scoped to only this one Prompt
    kind — this action's other four kinds predate this campaign and
    their own activityType semantics are out of its authority to
    redesign.
  - **Field eligibility lives in exactly one place, referenced by
    multiple callers** (`isTillageField`/`hasNoRecordedLivestock`,
    `fertiliser-recommendation.ts`, Codex audit HIGH round 8) — round
    7's own farm-wide demand fix re-derived the tillage/missing-
    livestock rule inline rather than calling the Prompt producer's
    authoritative version, recreating the exact drift mechanism
    responsible for rounds 6 and 7's own findings. Both predicates are
    now exported and reused by `getFarmFertiliserDemand` and
    `NutrientsPageClient.tsx`'s own client-side gating — kept as two
    separate, narrow predicates rather than one fused check, since
    `promptForFertiliserRecommendation` itself reacts to them with
    different Prompt outcomes.
  - **Nutrient Plan CSV export applies the identical fail-closed gates
    and never exports mock prices** (`buildNutrientPlanReportCsv`,
    `src/lib/reports.ts`, Codex audit CRITICAL round 9) — a pre-existing
    V1/V3 report builder this campaign had never touched, found only by
    a deliberate hunt for a fourth instance of the "independent code
    path missing the gate" pattern rounds 6-8 each found once. A tillage
    field now exports `"Tillage"`/`"NOT_APPLICABLE"` rather than
    `"Grazing"` plus a grassland recommendation; an un-evidenced empty
    herd exports `"INSUFFICIENT_EVIDENCE"` rather than the clamped
    35 kg N/ha; the "Estimated cost (EUR)" column and per-product
    `€${costEur}` text are removed entirely. Not a new rule — this
    report's own header comment already states the identical principle
    for why "Financial Summary" has no builder at all ("a real export
    of [mock figures] would just be exporting invented numbers with a
    CSV wrapper"); simply never applied to this report's own cost
    columns until now.
  - **Farm-wide demand eligibility is the real Prompt's own basis, not a
    re-derived approximation of it** (`getFarmFertiliserDemand`, Codex
    audit HIGH round 9) — round 8's own fix checked only the two named
    tillage/missing-livestock cases; a field newly missing soil
    evidence, at Index 4, or under a new commonage/buffer prohibition
    still counted toward both Recommended and Planned. Fixed by calling
    `promptForFertiliserRecommendation` itself, per field, and using its
    real `basis.status === "OK"` — this farm-wide aggregation can now
    never again drift from whatever gate that Prompt producer enforces,
    present or future, without a human forgetting to duplicate a change
    (the exact mechanism responsible for rounds 6, 7, and 8's own
    findings).
  - **WITHDRAWN (Codex audit HIGH, round 9 rejection; revised round
    10)**: round 9 rejected re-validating a stored plan's own specific
    product/quantity against the live recommendation, reasoning that
    `validateFertiliserPlanEdits`'s own "a planned quantity may
    legitimately differ from the recommendation" design decision (item
    4) protected it. Round 10's own independent re-assessment correctly
    separated two different questions that rejection had conflated:
    *quantity* matching (still correctly rejected — a farmer's Plan
    stays a frozen value, deliberately independent of later drift) from
    *product* membership (a stored plan's own selected product must
    still be among the field's current live recommendation's real
    products at all) — the second is a real, narrower, valid check that
    does not collapse Planned into Recommended, since nothing about
    quantity is compared. Fixed: a new, pure `isPlanProductStillRecommended`
    (`src/app/actions/fertiliser-plan.ts`), applied in both
    `getMatchablePlanForFieldAction` and `startJobSessionFromPlanAction`
    — a stored plan whose product the live blend no longer names is no
    longer matchable/startable, even though the field's basis is still
    genuinely `OK`. See `FERTILISER_VERTICAL_ARCHITECTURE.md`'s own
    "Codex audit round 10" section for the full account.
  - **Nutrients screen's own display, not just its planning action, must
    respect the tillage/missing-livestock gates** (`NutrientsPageClient.tsx`,
    Codex audit CRITICAL round 10) — round 6's own fix only ever gated
    the "Plan this application" button; the requirement/NAP/organic-
    offset/purchased-product cards kept rendering a real grassland
    recommendation for a tillage field, and the clamped 35 kg N/ha for a
    farm with no recorded livestock, for four Codex-audit rounds. Not a
    new rule — the same real predicates the button already used, now
    also gating what is actually displayed, with an honest disclosure
    naming the real reason instead.
  - **Finance/Input Planner/Dashboard's whole-farm fertiliser aggregate
    respects the same tillage/missing-livestock gates as the rest of
    this vertical, but keeps its own pre-existing mock-cost disclosure
    unchanged** (`calculateFarmFertiliserRequirement`/
    `calculateFarmSlurryNutrientValueEur`, `src/domain/finance.ts`, Codex
    audit CRITICAL round 10) — a fifth independent path computing a real
    fertiliser recommendation without this vertical's own fail-closed
    gates, reaching Dashboard/Finance/Input Planner. Fixed for the
    scientific-correctness dimension (tillage exclusion, missing-
    livestock exclusion, the shared `farmGrasslandAggregates` denominator
    — a silage field is never excluded for missing livestock, since
    silage N/P/K doesn't depend on it) — but the same functions' own
    disclosed mock `costEur`/`estimatedFieldCostEur` figures are left
    untouched, REJECTED as out of scope: a real, pre-existing,
    already-disclosed limitation of this whole-farm surface, the
    identical class this campaign has consistently left alone since
    round 5 (`PurchasedFertiliserCard.tsx`'s own pre-existing display of
    the same mock figure) — not a new surface this campaign built.
  - **Nutrient Plan CSV's products cell distinguishes "genuinely nothing
    to purchase" from "blocked/missing evidence"** (`buildNutrientPlanReportCsv`,
    Codex audit HIGH round 10) — round 9's own fix left an ambiguous
    empty string for a field with complete real evidence whose live
    recommendation is nonetheless `NOT_APPLICABLE` (Index 4, or a
    commonage/buffer legal prohibition — the real N/P/K requirement
    still stands in that case, only the purchase itself is suppressed).
    Fixed with an explicit `"NOT_APPLICABLE"` sentinel, distinct from
    `"INSUFFICIENT_EVIDENCE"`; the numeric N/P/K/organic-offset columns
    are unchanged, since those figures remain genuinely real.

  - **"Generate audit trace" applies the same tillage/missing-livestock
    gates before persisting a run** (`RecommendationAuditTrailCard.tsx`,
    Codex audit CRITICAL round 11) — a sixth independent path, and the
    first one that *persists* its output (a real, exportable
    `CalculationRun` in localStorage) rather than just displaying it
    transiently. A tillage field, or a grazing field with no recorded
    livestock, is now skipped entirely before a run is generated — a
    silage field is never skipped for missing livestock, since silage
    N/P/K never depends on `livestockGroups` at all (the same real
    distinction round 10 established for `finance.ts`).
  - **Only the NAP-ceiling dashboard alert needs the tillage/missing-
    livestock gate — the other three real alert types do not**
    (`deriveRealAlerts`, `src/domain/real-alerts.ts`, Codex audit HIGH
    round 11) — a seventh independent path with the same denominator
    bug and no gate at all, but a genuine distinction survives scrutiny:
    the commonage and soil-test-age alerts are real properties of the
    field itself, never derived from the grazing/agronomic ledger —
    gating them on land use or livestock would wrongly suppress a real,
    valid compliance alert for a tillage field or an un-evidenced farm.
    **Correction (round 12)**: this entry originally also named the
    water-buffer-distance alert as field-intrinsic — that was only
    half right. `checkLocalBufferOverride` genuinely is field-intrinsic
    (reads only `field.waterBufferContext`), but
    `nationalBufferDistanceStatus` is not: `nutrients.ts`'s own
    `bufferMaterial` selects `"chemical_fertiliser"` whenever the
    ledger's `allocatedProducts` is non-empty, so a tillage/un-evidenced
    field can fabricate that blend and trigger a real alert against the
    wrong regulatory material. Both the NAP-ceiling alert and the
    national-buffer half of the water-buffer alert are now gated on one
    shared `ledgerDependentAlertsEligible` check; the commonage,
    soil-test-age, and local-override halves remain fully intact for
    every field, tillage included.
  - **The Nutrient Plan CSV's own NAP compliance columns apply the same
    `nRecommendable` gate as its other columns** (`buildNutrientPlanReportCsv`,
    Codex audit HIGH round 13) — the last unclosed instance of the
    tillage/missing-livestock pattern this campaign found across 8
    consecutive rounds (6 through 13). `checkNapCompliance` has no
    knowledge of tillage or missing livestock at all; a tillage row
    could still export a real-looking NAP "Yes"/"No" and regulatory
    classification derived from the identical fabricated ledger the
    surrounding columns already reject. Not a new rule — the same gate
    already applied elsewhere in this exact function, simply not yet
    extended to these four columns.
  - **Farm-wide "Planned" demand checks a stored plan's own product
    against the field's current live recommendation, not just field
    eligibility** (`getFarmFertiliserDemand`, Codex audit HIGH round
    13) — round 10's `isPlanProductStillRecommended` check
    (`getMatchablePlanForFieldAction`/`startJobSessionFromPlanAction`)
    was never extended to this farm-wide aggregation, so a historical
    plan's product could remain counted in `plannedTotalKg` after the
    live recommendation shifted to a different product entirely, even
    though the campaign now refuses to match/start that exact plan.
    Fixed by capturing each recommendable field's own real
    `FertiliserRecommendationSummary` and checking every planned
    quantity's product against it before counting.
  - **GPS confirmation waits for its own real plan lookup to settle
    before offering to proceed** (`GpsActivityCandidateCard.tsx`, Codex
    audit HIGH round 13) — the Confirm button was previously disabled
    only while the farmer's own submission was pending, never while the
    async `getMatchablePlanForFieldAction` lookup was still in flight,
    so a quick tap could fall straight through to the unlinked manual-
    start branch even when a real, unambiguous plan existed — silently
    abandoning the exact GPS-to-plan link campaign item 10 exists to
    make. Fixed with a `matchablePlanLoading` state tracked separately
    from the lookup's own result value; a genuine lookup failure still
    resolves to the same, unchanged manual-start fallback.
  - **"Already planned" disclosure never overclaims a specific count it
    cannot actually confirm** (`NutrientsPageClient.tsx`, Codex audit
    MEDIUM round 13) — `getMatchablePlanForFieldAction` returns
    `"ambiguous"` both for two or more genuine candidates and whenever
    either underlying capped read truncates (round 1); the latter can
    carry a `candidateCount` of 0 or 1, for which "You already have
    more than one planned application" is a real, unsupported factual
    claim. Fixed: the copy now checks `candidateCount >= 2` before
    making that specific claim, disclosing "couldn't safely check"
    otherwise.
  - **A recommendation's own real statutory NAP-ceiling status is
    disclosed on the Prompt/Decision, not silently discarded**
    (`FertiliserRecommendationSummary.napCompliance`,
    `fertiliser-recommendation.ts`, Codex audit HIGH round 14) —
    `promptForFertiliserRecommendation` classified a recommendation from
    `fertilityEvidence`/`purchasedProducts.length`/livestock alone,
    discarding `plan.napCompliance` even though `calculateNutrientPlan`
    had already computed it. Per spec Section A2 the agronomic and
    statutory ledgers must never *gate* each other (a ceiling breach
    correctly does not suppress `purchasedProducts`), so this is
    disclosure, not suppression: the summary now carries the real
    `napCompliance` outcome verbatim, and the Prompt's description warns
    when the recommended blend exceeds it. The finding's other two named
    gates (commonage/buffer evidence) were deliberately left un-warned,
    verified against `calculateNutrientPlan`'s own control flow: a
    genuine `LEGAL_PROHIBITION` on either already empties
    `purchasedProducts` (this Prompt can never reach `OK` while one is
    active), and the residual `BLOCKED_INSUFFICIENT_EVIDENCE` case is,
    by this app's real data model, the state of every field today (no
    field has ever captured `commonageStatus`/`waterBufferContext`) — a
    warning there would be 100% noise, not real disclosure.
  - **Real farm-level Article 17(6) evidence reaches every real call
    site of this vertical's recommendation, not just `nutrients.ts`
    itself** (`Farm.pBuildUpCompliance` → `PBuildUpComplianceInput`,
    `fertiliser-recommendation.ts`, Codex audit HIGH round 14) —
    `promptForFertiliserRecommendation` had no parameter for it at all,
    forcing every farmer down the "not proven" Table 15a P route
    regardless of their actual recorded adviser/NMP/training compliance.
    Fixed as a trailing optional parameter, threaded from the real
    `Farm` record at all five real call sites: `build-all.ts`
    (`buildAllRealPrompts`, whose `farm` parameter type widened from
    `Pick<Farm, "id" | "location">`), `recompute.ts`, `getFarmFertiliserDemand`'s
    two `calculateNutrientPlan`-adjacent calls and its two callers, and
    `NutrientsPageClient.tsx`'s own separate client-side calls (the
    identical gap this screen's own display had, alongside the
    orchestration layer). Verified with an empirically-derived fixture:
    supplying it moves the real P ceiling from Table 15a's 39 kg/ha to
    Table 15b's enhanced 69 kg/ha.
  - **Confirm Actual prefills the real product/quantity behind a
    bare "accept as recommended" plan, not just an explicit farmer
    edit** (`getLinkedFertiliserPlanForJobSessionAction`,
    `src/app/actions/fertiliser-plan.ts`, Codex audit HIGH round 14) —
    a single-product recommendation accepted as-is is already treated
    elsewhere (Planned demand, GPS matching/starting —
    `selectedProductName`'s own established fallback) as authoritative
    enough to execute, but this action only ever read explicit `edits`,
    leaving `ConfirmActualSheet`'s prefill empty and letting a farmer
    confirm an unresolved-composition Actual. Fixed by reusing
    `selectedProductName` for `plannedProduct`, and falling back to that
    product's own real `totalKg` for `plannedQuantityKg` whenever no
    explicit override exists — covering both the bare-acceptance case
    and a farmer who named a product but never overrode its quantity.
    The test that previously asserted both fields stay `undefined` for
    this exact case was rewritten to assert the real prefilled values.
  - **GPS confirmation re-resolves its own plan match at confirmation
    time, not from a cached lookup result** (`GpsActivityCandidateCard.tsx`,
    Codex audit MEDIUM round 14) — round 13 disabled Confirm only while
    the *initial* lookup was in flight; once settled to `"none"`/
    `"ambiguous"`, that result was kept for the whole candidate cycle
    with no revalidation, so a plan that became available afterward
    (saved from elsewhere) could still be silently bypassed. Fixed by
    re-running the lookup inside `confirm()` itself, right before
    deciding whether to link or start manually — a narrower client/
    server race remains inherent to any client-driven two-step flow, not
    fully eliminated (a genuinely atomic fix would need one server
    action that itself chooses between linked/manual start).
  - **Fertiliser recomputation and farm-wide demand use their own real
    supplied calculation date for soil-test-age validity, not the
    process clock** (`recompute.ts`, `getFarmFertiliserDemand`, Codex
    audit MEDIUM round 14) — three call sites received a real,
    injectable date (`input.now`/`input.asOfDate`) but passed `undefined`
    as `calculateNutrientPlan`'s own `asOfDate`, silently falling back
    to `new Date()` while the same operation's season boundary (or the
    Prompt's own `createdAt`) used the real supplied date — a
    historical/deterministic recompute could combine one date's Actuals
    with another date's evidence validity. Fixed by threading the real
    date through as `asOfDate` at all three sites. Disclosed honestly:
    `getFarmFertiliserDemand`'s own two call sites have no test
    asserting an observable behaviour difference from this specific
    fix, because neither `asOfDate` nor `pBuildUpCompliance` currently
    affects that function's own return shape (kg totals only) — both
    only ever change `napCompliance`, computed internally there but
    never exposed. The fix is still correct for internal consistency and
    any future consumer, just not independently provable at that exact
    call site today.
  - **A field switch always resets its own real, per-field render state
    before either an early-return or a new fetch — never leaves a
    PREVIOUS field's real figures rendered under a NEW field's heading**
    (`RemainingFertiliserRequirementCard.tsx`/`NutrientsPageClient.tsx`,
    Codex audit HIGH + MEDIUM round 15) — both components' own reset
    effects fired only on a coarser external trigger (`canRecord`
    turning off / `!isRealMode || !field`), never on a plain field-to-
    field switch, so the previous field's real requirement/applied/
    remaining figures (or "already planned" disclosure) stayed rendered
    under the new field's identity until its own lookup resolved, or
    forever on a rejection. Fixed identically in both: the relevant
    state now resets unconditionally at the very top of the effect,
    before either the early-return or the new async call — nothing is
    claimed about a field until its own real lookup actually resolves
    for it.
  - **Farm-wide "Planned" demand counts a real, legitimately partial
    plan edit correctly, not only a fully-specified one**
    (`selectedProductName`, moved to `fertiliser-plan/index.ts` and
    exported, Codex audit MEDIUM round 15) — `getFarmFertiliserDemand`'s
    own candidate derivation required BOTH `edits.plannedProduct` and
    `edits.plannedQuantityKg` to trust any explicit edit, even though
    `validateFertiliserPlanEdits` explicitly allows editing either
    independently and round 14's own Confirm Actual prefill fix already
    treats a product-only edit as fully resolvable (deriving that
    product's own real recommended quantity). A product-only edit was
    silently excluded from Planned entirely; a quantity-only edit
    counted the original recommended quantity instead of the farmer's
    own explicit override. Fixed by extracting the one real, shared
    `selectedProductName` fallback (previously living only in
    `src/app/actions/fertiliser-plan.ts`) into the lower orchestration
    layer, reused by both files — the identical "one authoritative rule,
    not independently re-derived" discipline this campaign has applied
    to `isTillageField`/`hasNoRecordedLivestock` (round 8) and
    `isPlanProductStillRecommended` (round 10) — with quantity resolved
    independently of product (the farmer's own override first, that
    specific resolved product's own real recommended `totalKg`
    otherwise).
  - **The downloadable Nutrient Plan CSV report propagates the same real
    farm-level Article 17(6) evidence every other real call site does**
    (`buildNutrientPlanReportCsv`, `src/lib/reports.ts`, Codex audit HIGH
    round 16) — round 14's own `pBuildUpCompliance` propagation covered
    five real call sites but missed this sixth one; the Reports screen
    (`ReportsPageClient.tsx`) did not even read the current `Farm`
    record to have the evidence available to pass. Since rounds 9/13
    specifically made this report's own NAP columns authoritative-
    looking and fail-closed, this was a real, signed-in compliance-
    record export silently defaulting every farm to "not proven" and
    Table 15a's lower P ceiling, regardless of a farm's actual recorded
    adviser/NMP/training evidence. Fixed with the identical trailing
    optional parameter every other call site already has, verified with
    an empirically-derived fixture (a silage cut not intended for sale,
    real P requirement 50 kg/ha) where the exported cell genuinely flips
    from `No` to `Yes` once the evidence is supplied.
  - **CORRECTION — Article 17(6) propagation was not actually complete
    after round 14 or round 16, each of which separately claimed it
    was** (Codex audit CRITICAL + HIGH, round 17) — round 14 named "all
    five real call sites"; round 16 called its own CSV fix the "sixth
    and final" site round 14 missed. Round 17's own fresh, dedicated
    re-verification of this exact claim found two more real,
    independent omissions: `RecommendationAuditTrailCard.tsx`'s
    "Generate audit trace" (which also omitted the field's own real
    slurry allocation entirely — a second, unrelated evidence gap in
    the same call) and `deriveRealAlerts`'s own dashboard NAP-ceiling
    alert. Both fixed identically to every other real call site. Eight
    real call sites are now confirmed propagating this evidence
    consistently; `finance.ts`'s two calls remain the one deliberately-
    verified exception, since that module never reads `plan.napCompliance`
    at all (the omission there is genuinely inert, not merely
    undisclosed). The `deriveRealAlerts` fix is itself disclosed as
    currently unobservable through that specific alert's own trigger
    condition: `deriveRealAlerts` has no `silage` input at all, and for
    real grazing (never silage) this data model's own P requirement is
    structurally capped at 36 kg/ha — below every real Table 15a grazing
    ceiling band regardless of index or stocking rate — so
    `pBuildUpCompliance` (which only ever affects the P ceiling, never
    N) cannot flip this alert's own trigger condition for any real
    fixture today. The fix is still correct and necessary for
    consistency with every other call site, just not independently
    provable through this one today — the same honest disclosure round
    14 made for a `getFarmFertiliserDemand` call site. **A genuinely
    complete propagation claim should not be made again without an
    explicit, dedicated grep/enumeration of every real
    `calculateNutrientPlan`/`calculateNutrientPlanWithTrace`/
    `promptForFertiliserRecommendation` call site in `src/`, cross-
    checked one by one — the two claims that turned out wrong were both
    reached by reasoning from memory of "every call site I fixed this
    round," not by re-deriving the complete list from the codebase
    itself.**
  - **RESOLVED — round 18's dedicated, exhaustive grep-based enumeration
    of every real `calculateNutrientPlan`/`calculateNutrientPlanWithTrace`/
    `promptForFertiliserRecommendation` call site (the exact re-
    verification the round-17 correction above called for) confirms
    Article 17(6) propagation is now genuinely complete across all eight
    real call sites, `finance.ts`'s two calls remaining the one
    deliberately-verified inert exception.** This is the first time the
    "complete" claim has actually been verified by enumeration rather
    than reasoning from memory. The same dedicated review found one
    further, genuinely distinct issue in the same round-17-touched
    function: `deriveRealAlerts` (`src/domain/real-alerts.ts`, Codex
    audit HIGH round 18) separately discarded the farm's own real
    non-grass-eligible-area evidence (`nonGrassPct`) — an independent
    `CalculateNutrientPlanInput` field from `pBuildUpCompliance`, with
    an independent statutory effect (the elevated N ceiling, GFT023/
    GFT024, vs. the enhanced P ceiling Article 17(6) unlocks). It
    computed `farmGrasslandAggregates(input.fields)` (the same call
    already used for `farmGrasslandAreaHa`) but only ever destructured
    that one field. A farm with real evidence proving ≥5% non-grass
    eligible area could see a real, compliant recommendation (statutory
    GSR 230 kg N/ha, N requirement 193 kg N/ha, genuinely within the
    real 214 kg N/ha elevated ceiling) misclassified as exceeding the
    lower, ineligible-farm 185 kg N/ha ceiling — a false Dashboard
    warning from the farm's own recorded evidence. Fixed by threading
    `nonGrassPct` through alongside `pBuildUpCompliance`. This round's
    own dedicated per-field audit of every optional `CalculateNutrientPlanInput`
    value (not just the two named above) across every real call site
    found no further instance of this drift pattern.
  - **CONFIRMED — round 19's own re-verification of round 18's dedicated
    enumeration found Article 17(6)/`nonGrassPct` propagation genuinely
    complete, and no other campaign-added/modified function with the
    same "some real callers supply a required input, others silently
    omit it" drift pattern.** The claim first made in round 18 (itself
    a correction of rounds 14/16's own two wrong "complete" claims) now
    stands independently re-checked by a second, separate audit round.
  - **"Plan this application" now honestly distinguishes not-yet-
    queried, still-checking, and failed existing-plan-lookup states from
    "no plan exists"** (`NutrientsPageClient.tsx`, Codex audit HIGH
    round 19) — a new instance of the round-13 `GpsActivityCandidateCard`
    bug shape (an action stays enabled through its own prerequisite
    identifier-scoped lookup's pending/failed states), found here for
    the first time despite three separate prior rounds (15, 17, 18)
    each reviewing this exact component for other issues. Previously,
    `existingPlan === undefined` — true while the lookup was still in
    flight AND after a genuine failure, identical to the real "no plan"
    case — let a farmer tap the always-enabled button and persist a
    real, nuisance-duplicate Decision before (or despite) the lookup
    ever resolving, the exact class of problem the round-4/5 disclosure
    exists to prevent. Fixed with the same established
    `matchablePlanLoading`-style pattern: a new `existingPlanLoading`
    state disables the button during the check; a new
    `existingPlanCheckFailed` state shows the same honest "couldn't
    safely check" copy the truncated/ambiguous case already uses, but
    deliberately does NOT keep the button disabled afterward — a real
    lookup failure isn't itself evidence the action is unsafe, only that
    it couldn't be verified, and an indefinite block would trap a farmer
    who has never actually planned this field at all (the same
    fail-open reasoning `GpsActivityCandidateCard`'s own lookup-failure
    handling already established).
  - **A genuine remaining-requirement fetch failure now renders its own
    honest, distinct disclosure, never silent absence indistinguishable
    from a real NOT_APPLICABLE field** (`RemainingFertiliserRequirementCard.tsx`,
    Codex audit LOW round 19) — round 15's own fix correctly stopped a
    failure from showing the PREVIOUS field's stale figures, but left
    the replacement state (`result` staying `undefined`) rendering
    nothing at all, the identical path a genuinely not-applicable or
    not-yet-fetched field already takes. Fixed with a new `checkFailed`
    state rendering "Farm Return couldn't check this field's remaining
    requirement right now — try again shortly" instead of `null`.
  - **Confirm Actual discloses, honestly, when its own linked-plan
    prefill is still loading or has genuinely failed — never silently
    identical to "nothing to prefill from"** (`ActiveJobSessionView.tsx`/
    `ConfirmActualSheet.tsx`, Codex audit HIGH round 20) — a second real
    instance of the round-19 "action stays enabled/silent through a
    pending or failed prerequisite lookup" bug shape, in a component
    round 19's own review did not check for it. `linkedPlan === undefined`
    conflated three states (loading/failed/genuinely nothing) and the
    sheet opened immediately, fully interactive, in every one — a farmer
    could submit before round 14's own bare-acceptance prefill fix ever
    arrived, quietly undermining that fix's stated purpose. Fixed with
    new `linkedPlanLoading`/`linkedPlanCheckFailed` props, disclosed
    honestly near the affected fields — deliberately never blocking
    submission, since the farmer has already finished a real job and
    must always be able to record it.
  - **CORRECTION — round 14's own judgement that a GPS confirm-time
    plan-match lookup failure is safely equivalent to a genuine "no
    plan exists" result was wrong, and is withdrawn** (Codex audit
    MEDIUM round 20, `GpsActivityCandidateCard.tsx`) — round 14
    reasoned this was symmetric with the initial (display-only)
    lookup's own fail-open handling, but the confirm-time lookup gates
    a real, consequential, one-time fork (link vs. permanently unlinked)
    that the initial lookup never does. A genuine `"none"` establishes
    real absence; a rejected lookup establishes nothing, and silently
    treating it as absence could leave a real, unambiguous planned
    application uncounted while an orphaned manual session is created
    in its place. Fixed by letting a confirm-time lookup failure
    propagate to this function's own existing outer error handler
    instead of being swallowed into a synthesised `{status: "none"}` —
    nothing has been committed at that point (no session/Decision
    created yet), so failing the whole confirm attempt and letting the
    farmer retry is the safe behaviour, not an indefinite block.
  - **`getFieldFertiliserStatusAction` uses one real, internally
    consistent calculation date throughout, not two independently-read
    ones** (Codex audit LOW round 20) — it already captured `now` for
    its recommendation recompute but never threaded it into
    `getFieldRemainingFertiliserRequirement`'s own `asOfDate`, which
    independently read the process clock for its confirmed-session
    season boundary; a request straddling a calendar-year rollover
    could combine one date's recommendation state with the other date's
    confirmed-Actuals boundary. Fixed by threading the same captured
    `now` through — the identical discipline round 14 already required
    for every other deterministic recompute path in this vertical.
  - **RESOLVED — round 20's own systematic per-component sweep of every
    campaign component with an async data-fetching effect found no
    further instance of the round-19/20 "pending/failed prerequisite
    lookup" bug shape** beyond the two fixed above and the two round 19
    already fixed.
  - **CONFIRMED — round 21 independently re-verified both round 20's
    async-prerequisite UI sweep and rounds 17-19's Article 17(6)/
    `nonGrassPct` propagation enumeration, and both hold.** No further
    instance of either pattern remains.
  - **Farm-wide fertiliser demand discloses when a real confirmed
    Actual's quantity couldn't be resolved to a real kg figure, rather
    than silently presenting an understated total as complete**
    (`countUnresolvedFertiliserQuantities`, `src/domain/fertiliser-plan.ts`,
    Codex audit MEDIUM round 21) — a genuinely new class of gap, not
    another instance of the propagation or async-prerequisite patterns
    the prior seven rounds had each closed. `totalProductQuantityKgByProduct`
    correctly excludes a quantity it cannot convert (most commonly
    `quantityUnit: "bags"`), but `getFarmFertiliserDemand` had no way to
    disclose that exclusion at all — `confirmedAppliedTotalKg`/
    `remainingTotalKg`/`truncated: false` could all look complete for a
    farm whose real bag-recorded application genuinely happened but
    silently isn't counted. Field-level remaining requirement already
    discloses the identical situation one field at a time
    (`applicationsWithUnknownComposition`); the farm-wide aggregator had
    no equivalent. Fixed with a new, additive `applicationsWithUnknownComposition`
    field threaded through `FarmFertiliserDemandResult` → the demand
    action's own result → `FarmContext` (the identical pattern
    `fertiliserDemandTruncated` already establishes) — deliberately
    farm-wide, not per-product, the same reason `truncated` itself is a
    whole-result flag rather than a per-row one (an unresolved quantity
    with no real product name at all cannot be attributed to one row).
  - **The round-21 disclosure discipline (a real exclusion must never
    collapse into a complete-looking zero/empty result) is now applied
    to blocked-evidence field exclusions too, not only unconvertible
    confirmed quantities** (`fieldsWithBlockedEvidence`,
    `src/domain/finance.ts`/`src/orchestration/fertiliser-plan/index.ts`,
    Codex audit HIGH round 22) — round 21 fixed this exact disclosure
    class for `getFarmFertiliserDemand`'s confirmed-quantity exclusions
    but never checked whether the identical gap existed for the
    tillage/missing-livestock field exclusions this campaign has
    applied since round 10 — it did, in two aggregators: Finance's own
    `calculateFarmFertiliserRequirement` (a farm with real, blocked
    grazing fields saw "Estimated fertiliser spend €0", indistinguishable
    from a genuine zero-requirement farm) and `getFarmFertiliserDemand`'s
    own Recommended total (`demand: []`/`truncated: false` looking like
    a complete "nothing to buy" answer). Fixed with a new
    `fieldsWithBlockedEvidence` count on both — deliberately never
    counting a tillage field, which is genuinely `NOT_APPLICABLE` (this
    app has no tillage N/P/K table at all), not a "cannot calculate"
    case — threaded through `FertiliserSlurryCard.tsx` and
    `getFarmFertiliserDemandAction`/`FarmContext`, the identical
    `fertiliserDemandTruncated`-style pattern.
  - **The remaining-requirement exclusion disclosure now states an
    accurate reason, not a specific-but-often-wrong one**
    (`RemainingFertiliserRequirementCard.tsx`, Codex audit LOW round
    22) — `nutrientContributionFromFertiliserActual` excludes an
    application for four real, distinct reasons (missing product,
    missing/invalid quantity or unit, an unverified "bags" conversion,
    or a genuinely unrecognised product), but the card always claimed
    the reason was "product not in Farm Return's verified catalogue" —
    wrong for the other three, and pointing a farmer at the wrong field
    to correct. Fixed with an accurate umbrella phrase covering every
    real case, a proportionate LOW-severity fix rather than threading a
    new reason-code breakdown through the whole confirmed-application
    chain for a copy-accuracy issue.

## Register maintenance

When a rule set changes (new Teagasc factsheet, amended S.I., Met Éireann
model revision):

1. Add/replace the row above with the new source + review date.
2. Bump the relevant engine's `calculationVersion` (`docs/data-model.md`
   provenance pattern).
3. Note what changed and why in the engine's own doc if the change alters
   behaviour a farmer would notice.
