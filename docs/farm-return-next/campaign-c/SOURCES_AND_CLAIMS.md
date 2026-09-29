# Campaign C — source register and evidence claims

Rule set: `slurry-agronomy-ie-2026-v1` (DRAFT).

Campaign C was executed with WebFetch and WebSearch disabled. The repository contains
structured Teagasc evidence extracts, source-register metadata, existing source quotations
and previously reviewed scientific material, but the original external source files were not
retained in the repository and no independently verifiable fresh retrieval occurred during
this Campaign C run.

Accordingly, Campaign C does not assert new retrieval timestamps, byte lengths or SHA-256
fingerprints for external sources. Any such provenance must remain UNKNOWN until the
original source bytes are retrieved through an authorised evidence-ingestion workflow and
their fingerprint is independently recorded.

Claims below distinguish evidence that is traceable to the local repository evidence pack
from sources that still require independent source-document verification before a rule set
may be approved.

Evidence classes for how a value is used: `MEASURED_LAB`, `MEASURED_DM_DERIVED`,
`STANDARD_TEAGASC_ESTIMATE`, `STATUTORY_DEEMED`, `FARMER_DECLARED`,
`SYSTEM_INFERRED`, `MISSING`. How the source derived a value: measured survey,
experimentally derived, advisory estimate, statutory, or policy.

## 1. Sources

| ID | Existing `SourceId` | Organisation | Title / version | Published | Type | Jurisdiction | URL | Fingerprint / source-byte status | Review status | Authority |
|---|---|---|---|---|---|---|---|---|---|---|
| `SRC-GB-2020` | `TEAGASC_GREENBOOK_2020` | Teagasc | Major & Micro Nutrient Advice for Productive Agricultural Crops, 5th Ed. ("Green Book") | June 2020 | Technical advisory publication | IE | https://teagasc.ie/wp-content/uploads/2025/05/Major-Micro-Nutrient-Advice-for-Productive-Agricultural-Crops-2020.pdf | UNKNOWN — fresh source bytes were not independently retrieved in Campaign C. Repository contains structured extraction in `docs/scientific-engine/v3/reference_greenbook_2020/`, including source metadata and page/table locators. | Strong local evidence-pack support; independent original-PDF re-verification required before APPROVED | Authoritative (agronomic) |
| `SRC-OM-PAGE` | `TEAGASC_ORGANIC_MANURES` | Teagasc | "Organic Manures" web page (Fertiliser Advice section) | Not dated in repository metadata | Advisory web guidance | IE | https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/organic-manures/ | UNKNOWN — fresh source bytes were not independently retrieved in Campaign C | Supported by existing repository source registration and quotations; independent live-page re-verification required before APPROVED | Authoritative (agronomic), undated |
| `SRC-OM-PDF-2023` | — | Teagasc / M. Plunkett, as represented in existing repository material | "Available Nutrient Content & Guide Value (€) of Organic Fertilisers 2023", stated as updated 1 April 2023 in Campaign C working evidence | 2023-04-01, subject to source-document re-verification | Advisory table | IE | https://teagasc.ie/wp-content/uploads/2025/05/Org-Manure-N-P-K-Values-1st-April-2023.pdf | UNKNOWN — fresh source bytes were not independently retrieved in Campaign C | Claim-level evidence retained, but original source document must be independently re-verified before APPROVED | Authoritative candidate (agronomic); approval pending source re-verification |
| `SRC-SP07` | — (cited in `nutrients.ts`) | Teagasc Signpost Programme | Signpost Fact Sheet 07 "Getting the most from your slurry" | 2023, as represented in existing repository material | Advisory fact sheet | IE | https://teagasc.ie/wp-content/uploads/2025/05/Getting-the-Most-From-Your-Slurry-1.pdf | UNKNOWN — fresh source bytes were not independently retrieved in Campaign C | Existing repository quotations/implementation references support the claims provisionally; independent PDF re-verification required before APPROVED | Authoritative candidate (agronomic); approval pending source re-verification |
| `SRC-D26` | — (cited in `nutrients.ts`) | Teagasc / Teagasc Daily / M. Plunkett, as represented in existing repository material | "Cattle slurry a valuable source of N, P & K" | 2026-03-23, subject to source-document re-verification | Advisory article | IE | https://teagasc.ie/news--events/daily/cattle-slurry-a-valuable-source-of-n-p-k/ | UNKNOWN — fresh source bytes were not independently retrieved in Campaign C | Existing repository quotations identify an apparent internal inconsistency (CONF-01); live article must be independently re-verified before APPROVED | Authoritative candidate but internally inconsistent; approval pending source re-verification |
| `SRC-CN-2016` | — (cited in `slurry-timing.ts`) | Teagasc | Farm Carbon Navigator User Manual, Jan 2016, §5.6 / §6.4 | Jan 2016 | GHG tool manual | IE | https://www.teagasc.ie/media/website/about/our-organisation/Instruction-Carbon-Navigator-V2.pdf | Not independently re-fetched in Campaign C | Relied on the existing module's recorded quotation only | Non-authoritative for nutrient availability; timing-label evidence only |
| `SRC-LALOR-2014` | — | Peer-reviewed Irish research, cited by Green Book Table 9-2 | Lalor et al., 2014, NFRV of cattle slurry by timing and method | 2014 | Peer-reviewed | IE | Not independently retrieved | UNKNOWN | Secondary citation only; underlying paper not independently read in Campaign C | Underpins `CLM-GB-9-2`; direct verification required for primary-paper approval |
| `SRC-BERRY-2013` | — | Peer-reviewed Irish survey, cited by Green Book Table 9-1 | Berry et al., 2013, cattle slurry composition survey | 2013 | Peer-reviewed survey | IE | Not independently retrieved | UNKNOWN | Secondary citation only; underlying paper not independently read in Campaign C | Underpins `CLM-GB-9-1`; direct verification required for primary-paper approval |
| `SRC-SI-588-2025`, `SRC-SI-119-2026` | `LAW_IE_SI_588_2025`, `LAW_IE_SI_119_2026` | Irish Statute Book | GAP Regulations 2025 and 2026 amendment | 2025-12-12, 2026-04-03 | Statutory | IE | See `docs/scientific-engine/v3/sources/source_register.csv` | Not independently re-fetched in Campaign C | Campaign B scope | Regulatory ledger only. Never agronomic evidence here. |

No international evidence was required for the current draft claim set because the local
repository evidence pack points to Irish sources for the values under review. This does not
mean every original source document has been independently re-verified in Campaign C.

Commercial material was not used.

## 2. Evidence claims

Locators give the source locator represented by the repository evidence pack. For Green Book
claims, the local structured extraction includes exact page/table references. For external
sources not archived locally, the quoted claims remain provisional until independent
source-document re-verification.

"Index 3/4 basis" means the value is at 100% P and K availability.

| Claim | Source · locator | Claim / represented values | Units / denominator | Applicability | Source derivation | Limitations |
|---|---|---|---|---|---|---|
| `CLM-GB-9-1` | `SRC-GB-2020` PDF p.40 (printed p.38), Table 9-1; locally traceable through `reference_greenbook_2020` | Cattle slurry average DM 6.3%, N 2.4, NH4-N 1.4, P 0.5, K 3.5 kg/t. Ranges: DM 0.4–11.9, N 0.2–5.2, NH4-N 0.2–3.4, P 0.1–1.1, K 0.5–7.7. Footnote 2: 1 t = 1000 l = 1 m³ | kg per t (= per m³) of slurry as applied | Irish dairy and beef farms | Measured survey, attributed by Green Book to Berry et al. 2013 | Up to tenfold variation. Farm Return use is `STANDARD_TEAGASC_ESTIMATE` and not in v1 (GAP-06) |
| `CLM-GB-9-2` | `SRC-GB-2020` PDF p.42 (printed p.40), Table 9-2; locally traceable | NFRV, % of total N in year of application: spring splashplate 30, spring trailing shoe 40, summer splashplate 15, summer trailing shoe 25 | % of total N | Cattle slurry, grassland | Experimental evidence attributed by Green Book to Lalor et al. 2014 | "Spring"/"summer" not defined by month |
| `CLM-GB-9-3` | `SRC-GB-2020` PDF p.44 (printed p.42), Table 9-3; locally traceable | Index 1/2: splashplate N spring 0.7, summer 0.4; trailing shoe/hose N spring 1.0, summer 0.6; P 0.3; K 3.2 | kg/t | Average Table 9-1 composition | Advisory derivation from Green Book tables | Average composition only; see NOTE-01 |
| `CLM-GB-9-4` | `SRC-GB-2020` PDF p.44 (printed p.42), Table 9-4 + fn2; locally traceable | Index 3/4: N as 9-3; P 0.5; K 3.5. fn2 states no slurry should be applied to P Index 4 soils where other land is available on a farm to receive slurry and in compliance with the NAP | kg/t | Average composition | Advisory | fn2 requires whole-farm context |
| `CLM-GB-9-8` | `SRC-GB-2020` PDF p.48 (printed p.46), Table 9-8; locally traceable | Available N/P/K (kg/ha) for DM 4/6/8/10% at 11/22/33/44/55 t/ha, spring splashplate, 30% NFRV | kg/ha | Splashplate, spring | Advisory | Splashplate only; not in v1 |
| `CLM-GB-9-8-FN3` | `SRC-GB-2020` PDF p.48, Table 9-8 fn3; locally traceable | P and K at 100% availability for Index 3 basis. At Index 1/2, P FRV 50% and K FRV 90% | fraction | Cattle slurry values represented by Table 9-8 | Advisory | Per-nutrient mapping when indices differ remains GAP-04 |
| `CLM-GB-12-7` | `SRC-GB-2020` PDF p.76 (printed p.74), Table 12-7; locally traceable | First-cut silage available N 125 kg/ha. fn2: 20% of N applied for early grazing remains for first cut. fn3: +25 kg/ha may be used for pasture < 4 years old. fn4: 100 kg/ha if grazed rather than cut the previous year | kg/ha available N | Cut swards | Advisory | fn3 is discretionary; GAP-07 |
| `CLM-GB-13-2` | `SRC-GB-2020` PDF p.82 (printed p.80), Table 13-2; locally traceable | P build-up on mineral soils: Index 1 = 20, 2 = 10, 3 = 0, 4 = 0. fn1 mineral ≤20% OM. fn2 peat >20% OM receives maintenance only | kg/ha available P | Mineral soils | Advisory | Peat out of v1 |
| `CLM-GB-13-4` | `SRC-GB-2020` PDF p.84 (printed p.82), Table 13-4 + text; locally traceable | First-cut P maintenance 20 kg/ha for Index 1–3 at 5 t DM/ha. Index 4: do not apply chemical P. fn1 add build-up. fn2 ±4 kg P per t DM from 5 t/ha. Text links slurry P contribution to slurry quantity × P content | kg/ha | First cut | Advisory | Yield range for fn2 unstated; GAP-03 |
| `CLM-GB-9-11-TXT` | `SRC-GB-2020` PDF p.49 (printed p.47), §9.11; locally traceable | NAP P replacement value 100% at P Index ≥3, 50% at P Index 1 & 2, "to facilitate better utilization and distribution of organic manure P (and K) resources across the farm" and to avoid over-estimating manure value on Index 1/2 | fraction (regulatory) | Organic manures | Statutory context reported by an advisory book | Regulatory ledger (Campaign B). Context for CONF-03 only; not an agronomic share cap. Added by CC-B1 |
| `CLM-GB-14-INTRO` | `SRC-GB-2020` PDF p.88 (printed p.86), §14.2 first paragraph; locally traceable | "Table 14-2 gives the available K required for silage and hay crops i.e. K applied both as chemical and organic fertilizers." Chemical K = Table 14-2 minus organic K (Table 9-1) | kg/ha available K | Silage | Advisory | Immediately precedes `CLM-GB-14-TXT`; does not itself state the scope of the 90 kg limit (CONF-02). Added by CC-B1 |
| `CLM-GB-14-TXT` | `SRC-GB-2020` PDF p.88 (printed p.86), §14.2; locally traceable | Luxury K uptake risk where >90 kg/ha K is applied. Where more than 90 kg/ha is advised, only 90 kg should be applied in spring and the remainder to aftermath or late autumn | kg/ha K | Silage | Advisory | Whether slurry K counts toward this limit is CONF-02 |
| `CLM-GB-14-2` | `SRC-GB-2020` PDF p.89 (printed p.87), Table 14-2; locally traceable | First-cut K: Index 1 185, Index 2 155, Index 3 125, Index 4 0 at 5 t DM/ha. fn1 ±25 kg K per t DM. fn4 typically no more than 90 kg/ha K at closing; remainder at least 3 months in advance or after harvest. fn5: Index 4 receives no K in year of sampling | kg/ha available K | First cut | Advisory | CONF-02; GAP-03; GAP-08 |
| `CLM-GB-14-3` | `SRC-GB-2020` PDF p.89 (printed p.87), Table 14-3; locally traceable | Chemical K for first cut where "a typical application of 33 t/ha of slurry is applied to the silage ground": Index 1 79, Index 2 49, Index 3 10, Index 4 0. fn4: lower K rates may be applied where slurry is more dilute | kg/ha | 5 t DM/ha | Advisory worked example | Implies 106 (Index 1/2) to 116 (Index 3) kg/ha slurry K credited to first cut (CC-B1 arithmetic); slurry timing relative to closing not stated; CONF-02 |
| `CLM-OM-T2` | `SRC-OM-PAGE`, represented in existing repository data including `docs/scientific-engine/v3/advisory_teagasc/cattle_slurry_available_npk_spring_LESS.csv` | DM 2: N 0.4, P 0.21, K 1.4. DM 4: N 0.7, P 0.35, K 2.1. DM 6: N 1.0, P 0.5, K 3.5. DM 7: N 1.1, P 0.6, K 4.0 | kg/m³ as applied | Cattle slurry, spring, LESS | Advisory | Four discrete represented points only; GAP-02. Original live page requires independent re-verification |
| `CLM-OM-T2-NOTE` | `SRC-OM-PAGE`, represented by existing repository quotations | On Index 1 & 2 soils, reduce slurry P availability by 50% and K availability by 10% | fraction | As `CLM-OM-T2` | Advisory | Agrees with Green Book Table 9-8 fn3. Applied to production LESS credit since `nutrient_engine_v1.1.0` (CC-B2 correction of RISK-01) |
| `CLM-OM-PROSE-PK` | `SRC-OM-PAGE`, existing repository quotation | Repository evidence records guidance that P on Index 1/2 is deemed 50% available and that only part of P/K crop requirement should be supplied with organic fertiliser | share of requirement | Organic fertilisers | Advisory | Exact live wording requires independent source-document re-verification; CONF-03 |
| `CLM-OM-RATE` | `SRC-OM-PAGE`, existing repository quotation | Slurry application rate should be based on crop requirements, particularly P and K, and nutrients should not be applied in excess of crop demand | principle | Organic fertilisers | Advisory principle | Does not define a deterministic rate algorithm; GAP-01 |
| `CLM-OM-METHOD` | `SRC-OM-PAGE`, existing repository quotation | Repository evidence states that application timing/method principally alters N availability while dilution affects nutrient concentration | principle | Cattle slurry | Advisory | Original source wording requires independent re-verification |
| `CLM-OMPDF-CATTLE6` | `SRC-OM-PDF-2023`, represented in existing repository quotations | 6% DM cattle slurry: N 1.0, P 0.5, K 3.5 kg/m³. Repository evidence attributes N to 2.4 kg total N/m³ × 40% availability by LESS, and records a P Index 1/2 reduction note | kg/m³ | Spring LESS, subject to source confirmation | Advisory | Original PDF must be independently re-verified; 6% treatment relative to 6.3% average remains GAP-02 |
| `CLM-SP07-T1` | `SRC-SP07`, represented in existing repository quotations | DM 2/4/6/7%: N 4/6/9/10, P 2/3/5/6, K 13/21/32/36 units per 1,000 gal | units per 1,000 gal | Cattle slurry | Advisory | Rounded values; original PDF requires independent re-verification |
| `CLM-SP07-T2` | `SRC-SP07`, represented in existing repository quotations | LESS spring N 1.0, P 0.5, K 3.5; summer N 0.6, P 0.5, K 3.5 kg/m³ | kg/m³ | LESS, typical slurry | Advisory | Original PDF requires independent re-verification |
| `CLM-SP07-TIMING` | `SRC-SP07`, existing repository quotation | Repository evidence records guidance favouring February–April where N-loss risk is low and crop uptake high | months | Slurry N | Advisory | Original PDF wording requires independent re-verification; CONF-04 |
| `CLM-SP07-PK` | `SRC-SP07`, existing repository quotation | Repository evidence records guidance that organic manure can supply silage P/K requirements and that ~3,000 gal/ac can supply the majority of P/K plus some N | principle | Silage | Advisory | Original PDF requires independent re-verification; relevant to CONF-02 |
| `CLM-D26-T1` | `SRC-D26`, represented in existing repository quotations | Repository evidence records Table 1 as spring N 1.0, P 0.6, K 3.5 and summer N 0.6, P 0.6, K 3.5 kg/m³ for typical LESS slurry | kg/m³ | LESS, typical slurry | Advisory | Original live article requires independent re-verification. `nutrients.ts` records that its transcriptions were inconsistent and not a clean verbatim read. Apparent disagreement with Table 2 is CONF-01; CC-B1 adjudication does not adopt the P 0.6 value ([ADJUDICATION_CC-B1.md](ADJUDICATION_CC-B1.md)) |
| `CLM-D26-T2` | `SRC-D26`, represented in existing repository quotations | Repository evidence records Table 2 as matching the 2/4/6/7% DM spring LESS rows, with typical 6% slurry at N 1.0, P 0.5, K 3.5 | kg/m³ | Spring LESS | Advisory | Original live article requires independent re-verification; conflicts with represented Table 1 P value |
| `CLM-D26-33` | `SRC-D26`, represented in existing repository quotations | Repository evidence records an example that 33 m³/ha of good-quality slurry can supply about 30% of first-cut N and most P/K requirements | example | First cut silage | Advisory example | Example, not a deterministic rule; original article requires independent re-verification |
| `CLM-CN-2016` | `SRC-CN-2016` §5.6/§6.4, quotation already recorded in `src/domain/slurry-timing.ts` | "Spring Jan – April, Summer May – June, Late Summer July – October" | months | GHG accounting-tool timing convention | Tool convention | Not nutrient-availability evidence; CONF-04 |

## 3. Denominator

Every v1 slurry value is kg of available nutrient per m³ (= per t where supported by
Green Book Table 9-1 footnote 2) of physical slurry as applied, at the stated DM.

It is not a Campaign B regulatory neat-slurry quantity and not a statutory quantity.

Dilution is represented through slurry dry matter / composition evidence rather than by
substituting a regulatory neat-slurry denominator.

A Campaign B neat-slurry quantity must never be used as an input to these agronomic
available-nutrient values, and these agronomic values must never feed the statutory ledger.

## 4. Evidence-status rule for Campaign C

A claim may be used in the DRAFT scientific freeze where it is traceable to the repository's
existing evidence pack, but that does not make the claim `APPROVED`.

Before `slurry-agronomy-ie-2026-v1` may move from DRAFT to APPROVED:

1. every externally hosted source relied upon for a production rule must be independently
   retrieved through an authorised evidence-ingestion process;
2. the exact source version/date must be recorded where available;
3. the relevant page, table, row, paragraph or section must be checked against the local claim;
4. the source bytes, where retention is permitted, must be fingerprinted;
5. where retention is not permitted, the fingerprint and exact locator must still be recorded
   from the authorised retrieval;
6. conflicts must remain unresolved until an identified scientific reviewer records the
   interpretation;
7. unsupported algorithmic choices must remain `SYSTEM_INFERRED` or
   `EXPERT_REVIEW_REQUIRED`, never be presented as Teagasc rules.

Campaign C therefore preserves the existing scientific conflicts rather than resolving them
through undocumented assumptions.
## 5. Authorised AI external review (2026-09-29)

Record: [AI_ADJUDICATION_2026-09-29.md](AI_ADJUDICATION_2026-09-29.md).

| ID | Organisation | Title | Retrieval | Fingerprint / local copy | Authority |
|---|---|---|---|---|---|
| `SRC-AI-REVIEW-2026-09-29` | Teagasc (sources reviewed); review performed by an authorised AI external research pass | AIR-S1..S9 (Organic Manures; Fertilising for First Cut Grass Silage; Correct fertiliser application rates and cutting dates for first-cut silage; Fertilising 1st Cut Grass Silage; Nutrient management of white clover swards; Using white clover to reduce nitrogen fertilisation; soil fertility / soil index guidance; slurry DM measurement and nutrient composition; crop-management guidance on prior P/K) | EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW, DATE: 2026-09-29. Not retrieved by the build agent | UNKNOWN. No fingerprint supplied; none invented. No local copy retained | AI review of authoritative sources. Discovery and classification only; not sufficient provenance for a production calculation (AI_REVIEW_ONLY) |

AI-review claims. Each row gives the scientific evidence class, the implementation
evidence class, and the source that must be ingested before production use. Claims that
are already locally traceable (`CLM-GB-*`, `CLM-OM-T2`) keep their §2 entries. The AI
review corroborates them but does not replace them.

| Claim | Statement | Scientific class | Implementation evidence | Ingest before production |
|---|---|---|---|---|
| `CLM-AIR-CONF01` | 6% DM spring LESS N 1.0 / P 0.5 / K 3.5 kg/m³; 0.6 P is the 7% row; DM-specific table beats a generic "typical" value | SOURCE_DIRECT | REPOSITORY_VERIFIED via `CLM-OM-T2`, `CLM-GB-9-4`, `CLM-GB-9-8-FN3` | — |
| `CLM-AIR-CONF02-RECON` | 90 kg K/ha is an application/timing constraint, not a nutrient-content truncation; slurry K credit preserved; spring recommendation must not intentionally exceed 90 kg; remainder stays identifiable | AI_PROVISIONAL (90 kg text itself SOURCE_DIRECT, `CLM-GB-14-TXT`) | AI_REVIEW_ONLY | AIR-S2/S3/S4 |
| `CLM-AIR-CONF03-SHARE` | P/K Index 1/2: organic fertiliser supplies at most 50% of crop P and 75% of crop K requirement; cumulative with the 50%/90% availability factors; applied at the requirement layer | SOURCE_DIRECT (per AI review) | AI_REVIEW_ONLY | AIR-S1 exact wording |
| `CLM-AIR-CONF04-SPRING` | v1 spring nutrient-value class 1 Feb – 30 Apr; January outside the v1 evidence class (scope, not agronomic prohibition) | SOURCE_DIRECT plus product scope | AI_REVIEW_ONLY (February start; local sources say only "spring") | `SRC-SP07`, AIR-S1 |
| `CLM-AIR-GAP01-SELECTOR` | `AI_PROVISIONAL_RATE_SELECTOR_V1`: min(P-limited rate, K-limited rate) after index, share and prior-input rules, then timing/regulatory/actionability/operational constraints | AI_PROVISIONAL (principle SOURCE_DIRECT, `CLM-OM-RATE`) | AI_REVIEW_ONLY | Expert validation; AIR-S1 |
| `CLM-AIR-GAP02-DM` | No continuous DM interpolation; exact published row or lab N/P/K under its own provenance; otherwise fail closed | AI_PROVISIONAL on SOURCE_DIRECT tables | REPOSITORY_VERIFIED rows (`CLM-OM-T2`) | — |
| `CLM-AIR-GAP03-YIELD` | First cut ±25 N / ±4 P / ±25 K kg/ha per t DM/ha from reference, within supported bounds only | SOURCE_DIRECT | P/K REPOSITORY_VERIFIED (`CLM-GB-13-4`, `CLM-GB-14-2`); N AI_REVIEW_ONLY; bounds unknown | AIR-S2/S3/S4 |
| `CLM-AIR-GAP04-INDEX` | P Index governs P; K Index governs K | SOURCE_DIRECT | REPOSITORY_VERIFIED (`CLM-GB-9-8-FN3`) | — |
| `CLM-AIR-GAP05-HIERARCHY` | Slurry evidence Levels A lab / B measured DM mapped to tables / C farmer-declared / D unknown; no silent promotion | SOURCE_DIRECT plus provenance policy | AI_REVIEW_ONLY (Level B mapping/calibration) | AIR-S8 |
| `CLM-AIR-GAP06-DEFAULT` | No silent DM default presented as measured; explicit declaration recorded as FARMER_DECLARED; unknown stays unknown | AI_PROVISIONAL | Policy (no scientific value) | — |
| `CLM-AIR-GAP07-SWARD` | Reseeds use the < 4-year category; reduced-N clover strategy needs ≈ ≥ 20% average annual clover; early-season contribution lower; visible clover alone never permits reduced N | SOURCE_DIRECT | < 4-year and 20% REPOSITORY_VERIFIED (`CLM-GB-12-7`, GB Table 12-6 note); first-cut clover strategy AI_REVIEW_ONLY | AIR-S5/S6 |
| `CLM-AIR-GAP08-CYCLE` | Prior inputs attributable to the current crop cycle are credited; boundary `CURRENT_CROP_CYCLE`; no arbitrary 30/90-day window | SOURCE_DIRECT principle; AI_PROVISIONAL boundary | Principle REPOSITORY_VERIFIED (`CLM-GB-12-7` fn2, `CLM-GB-14-2` fn4); boundary AI_REVIEW_ONLY | AIR-S9 |

§4 still governs approval. The AI review satisfies neither item 1 (authorised source
ingestion with a fingerprint) nor the requirement for an identified reviewer. The rule set
stays DRAFT, with EXPERT_VALIDATION_PENDING.
