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

§6 below supersedes the "Implementation evidence" column above for `CLM-AIR-CONF02-RECON`,
`CLM-AIR-CONF03-SHARE`, `CLM-AIR-CONF04-SPRING`, `CLM-AIR-GAP01-SELECTOR` and
`CLM-AIR-GAP03-YIELD`.

## 6. Stored Teagasc evidence ingestion (2026-09-29)

Task `campaign-c-teagasc-evidence-ingestion-20260929`, base `0c58a8c`. Source package:
`docs/scientific-engine/v3/external_teagasc_2026-09-29/` (`SOURCE_MANIFEST.md` plus frozen
HTML snapshots). The build agent read each stored snapshot directly. It used no WebFetch or
WebSearch, and it did not rely on the AI review's reading of these pages. The SHA-256 values
are the manifest's values. `src/domain/campaign-c-reference-cases.test.ts` recomputes them from
the stored bytes and checks that every quoted locator below appears in the visible page text.

This is evidence ingestion only. It is not expert validation. No production calculation
changed, and the rule set stays DRAFT with EXPERT_VALIDATION_PENDING.

Implementation status vocabulary adds `READY_FOR_IMPLEMENTATION_REVIEW`: the rule is
REPOSITORY_VERIFIED and may be proposed in a separately authorised implementation task. It is
not implemented, and it does not authorise a production change.
`IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION`: the stored source was inspected, but it does not
state the Farm Return rule, so more ingestion cannot promote it. Only expert validation can.

### 6.1 Stored sources

Page dates are the snapshots' own `datePublished` / `dateModified` metadata.

| Source ID | Organisation | Title | Page dates | URL | Local path | Retrieved | SHA-256 |
|---|---|---|---|---|---|---|---|
| `TGC-OM-2026` | Teagasc | Organic Manures | published 2025-05-13; modified 2026-03-25 | https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/organic-manures/ | `raw/organic-manures.html` | 2026-09-29T20:40:17Z | `4235cee5f44321e763bae91b99ab38e4148d409f7b3beb5eb5e8393cb266522f` |
| `TGC-K90` | Teagasc | Correct fertiliser application rates and cutting dates for first-cut silage (Teagasc Daily, 03 April 2023; J. Dunne, reporting M. Plunkett's advice) | published 2023-04-02; modified 2025-06-26 | https://teagasc.ie/news--events/daily/correct-fertiliser-application-rates-and-cutting-dates-for-first-cut-silage/ | `raw/first-cut-max-k.html` | 2026-09-29T20:40:17Z | `d35c60ae2133cdb99b2dac88f9e6d44bc26ac877b8a1e7dfab647ada6e2e8c40` |
| `TGC-SLURRY-TIMING` | Teagasc (Signpost Programme) | Getting the Most from your Slurry (web page) | published 2025-05-13; modified 2025-07-02 | https://teagasc.ie/environment/climate-change--air-quality/signpost-programme/current-technologies/getting-the-most-from-your-slurry/ | `raw/slurry-timing.html` | 2026-09-29T20:40:17Z | `3322ff9cd5c29c85f2812c3ef61f848648ccd7626be57534630c340c2c2dcc98` |
| `TGC-YIELD-SCALE` | Teagasc | Don't delay! Fertilise silage swards today (Teagasc Daily, 14 April 2023; M. Plunkett and D. Wall) | published 2023-04-13; modified 2025-06-26 | https://teagasc.ie/news--events/daily/dont-delay-fertilise-silage-swards-today/ | `raw/silage-yield-scaling.html` | 2026-09-29T20:40:17Z | `83a6382adac86640299add586a52c6da99ddf3e9d961b204d6c0d35c265be27f` |
| `TGC-RATE-PRINCIPLE` | Teagasc | In-crop slurry application to cereal crops – timely tips (Teagasc Daily, 14 March 2024) | published 2024-03-14; modified 2025-06-26 | https://teagasc.ie/news--events/daily/in-crop-slurry-application-to-cereal-crops---timely-tips/ | `raw/rate-selection-principle.html` | 2026-09-29T20:40:17Z | `81bee9331df020b5db2acf26e2abebc0d28db686aeec10898dcb0b4a9b7457aa` |

Local paths are relative to the source package. The retrieval timestamp is the manifest's.
`TGC-SLURRY-TIMING` is the Signpost web page. It is not the `SRC-SP07` fact-sheet PDF, which
remains unretrieved.

### 6.2 Repository-verified claims

Quoted locators are exact search phrases in the page text (tags removed, entities decoded).

| Claim | Source | Locator (search phrase) | Source-supported proposition | Evidence class | Evidence state | Implementation status | Limitations |
|---|---|---|---|---|---|---|---|
| `CLM-TGC-OM-SHARE-P` | `TGC-OM-2026` | Section "Phosphorus (P) and potassium (K) availability": "it is recommended to only supply 50% of P crop requirement with organic fertilisers and the remaining 50% with artificial fertiliser P" | On P Index 1/2, organic fertiliser should supply only 50% of the crop P requirement, and the remaining 50% should come from chemical P. At P Index 3, organic fertiliser can supply 100% | SOURCE_DIRECT | REPOSITORY_VERIFIED | READY_FOR_IMPLEMENTATION_REVIEW | A requirement/allocation share, not a slurry-concentration factor. The page gives it as a consequence ("therefore") of P being "deemed to be 50% available". It does not say whether the cap stacks with the × 0.50 availability factor (see `CLM-AIR-CONF03-SHARE`). No allocation layer exists in production. Index 4 is not addressed here |
| `CLM-TGC-OM-SHARE-K` | `TGC-OM-2026` | Same section: "only 75% of the crop requirement should be applied as organic fertiliser on soils with low K status (Index 1 & 2)" | On K Index 1/2, organic fertiliser should supply only 75% of the crop K requirement. At K Index 3, organic fertiliser can supply 100% | SOURCE_DIRECT | REPOSITORY_VERIFIED | READY_FOR_IMPLEMENTATION_REVIEW | As `CLM-TGC-OM-SHARE-P`. 75% differs from the 90% K availability factor, so the two K figures are distinct statements. Their interaction is not stated |
| `CLM-TGC-OM-AVAIL` | `TGC-OM-2026` | Table 2 note: "On index 1 & 2 soils reduce slurry P availability by 50% & reduce K availability by 10%" | Cattle-slurry available P × 0.50 and available K × 0.90 on Index 1/2 soils | SOURCE_DIRECT | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED (`applyLowSoilIndexAvailability`, CC-B2, `nutrient_engine_v1.1.0`) | Corroborates `CLM-OM-T2-NOTE` and `CLM-GB-9-8-FN3`. It is a slurry-availability factor, never a crop-requirement factor |
| `CLM-TGC-OM-RATE` | `TGC-OM-2026` | Section "Decision making": "the rate of slurry application should be based on crop requirements, particularly of P and K" | Slurry rate is based on crop requirements, particularly P and K. Distribution around the farm follows P and K requirements | SOURCE_DIRECT | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_ARCHITECTURE (no slurry-rate engine) | Corroborates `CLM-OM-RATE`. A principle, not a deterministic algorithm |
| `CLM-TGC-OM-EXCESS` | `TGC-OM-2026` | Section "Maximising potential for fertiliser savings": "nutrients are not being applied in excess of crop demands" | Plan all fertiliser applications so that nutrients are not applied in excess of crop demands | SOURCE_DIRECT | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_ARCHITECTURE (no slurry-rate engine) | A principle. It does not say how P and K limits combine into one rate |
| `CLM-TGC-OM-BALANCE` | `TGC-OM-2026` | Section "Value of Organic Fertilisers": "make adjustments to crop nutrient requirements for the nutrients supplied in the organic fertiliser" | Deduct organic-fertiliser nutrients from crop requirements, then choose chemical fertiliser for the balance | SOURCE_DIRECT | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED (`calculateNutrientPlan` organic offset against requirement) | A principle. Available nutrients, not total nutrients, are the basis (same page, "Available nutrients vs. total nutrients") |
| `CLM-TGC-K90-LUXURY` | `TGC-K90` | Section "Maximum K application": "Luxury amounts of K may be taken up by grass where more than 90kg/ha of K are applied" | Luxury K uptake can occur where more than 90 kg K/ha is applied. This can reduce fertiliser K efficiency and upset the K:Mg:Na balance in herbage | SOURCE_DIRECT | REPOSITORY_VERIFIED | NOT_APPLICABLE (rationale, not a rule) | Corroborates `CLM-GB-14-TXT`. The page does not say whether slurry K counts toward the 90 kg |
| `CLM-TGC-K90-SPRING` | `TGC-K90` | Same section: "Where more than 90kg/ha is advised, only 90kg should be applied in spring and the remainder to the aftermath or in late autumn" | Where more than 90 kg K/ha is advised, only 90 kg should be applied in spring. The remainder goes to the aftermath or late autumn | SOURCE_DIRECT | REPOSITORY_VERIFIED | READY_FOR_IMPLEMENTATION_REVIEW (text). Application to slurry K is deferred (`CLM-AIR-CONF02-RECON`) | First-cut silage context. It does not say whether K from slurry applied in spring is inside the 90 kg. The same page says 3,000 gal/ac of 6% DM cattle slurry supplies sufficient P and K for a silage crop at optimum fertility. `TGC-YIELD-SCALE` separately advises "a maximum of 70 units K/ac at silage closing time" on milk fever / grass tetany grounds (not adopted here) |
| `CLM-TGC-K90-SPLIT` | `TGC-K90` | Same sentence: "only 90kg should be applied in spring and the remainder to the aftermath or in late autumn" | The 90 kg figure splits the timing of the advised K. The advised K above 90 kg is still applied later, not removed from the advice | SOURCE_DERIVED | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED (no production code reduces the K requirement or slurry K content to 90; regression test "CONF-02") | A logical consequence of "the remainder". It says nothing about nutrient-credit accounting. Treating 90 kg as a Farm Return recommendation constraint that includes slurry K stays AI_PROVISIONAL |
| `CLM-TGC-SLURRY-TIMING` | `TGC-SLURRY-TIMING` | "Step 3: Apply slurry at the right time": "Spread when potential N losses are low and uptake by a growing crop is high, for example, February to April" | February to April is given as an example of when slurry N losses are low and crop uptake is high. Spring cattle-slurry applications typically recover up to 50% more N than summer applications | SOURCE_DIRECT | REPOSITORY_VERIFIED | READY_FOR_IMPLEMENTATION_REVIEW (month-level wording only) | "for example": illustrative, month-level wording for N efficiency. It states no day or time boundary (no "1 February" or "30 April"). It says nothing about January, and nothing about P/K. Step 2 of the same page treats spreading between the end of the closed period and 15 February as an indicator of storage shortage. That is context, not a timing class. Statutory periods remain Campaign B |
| `CLM-TGC-YIELD-SCALE` | `TGC-YIELD-SCALE` | Table 1 footnote 2: "Apply 25kg N, 4kg P & 25kg K per tonne of grass dry matter (DM)"; P and K section: "remove approximately 4kg P and 25kg K /tonne of grass DM" | First-cut silage: 25 kg N, 4 kg P and 25 kg K per t DM/ha. Table 1 rows: 5 t DM/ha, N 125 / P 20 / K 125; 6 t DM/ha, N 150 / P 24 / K 150. A 1 t DM/ha change therefore moves N by 25, P by 4 and K by 25 | SOURCE_DIRECT | REPOSITORY_VERIFIED | P/K ALREADY_IMPLEMENTED (`pMaintenanceSilageKgHa`, `kSilageKgHa`). N READY_FOR_IMPLEMENTATION_REVIEW (`nSilageKgHa` has no yield term) | Scope: 1st-cut silage. The table gives only 5 and 6 t DM/ha, and no range is stated for the per-tonne rule, so yields outside 5–6 t DM/ha are not directly supported. Footnote 3: advice is for crop offtake by DM yield at harvest. Footnote 4: Index 1/2 build-up is additional (Green Book). The footnote-2 marker is not attached to a visible table cell. The `TGC-K90` page gives the same 4 kg P / 25 kg K offtake, and N 125 at 5 t DM/ha |
| `CLM-TGC-RATE-NMP` | `TGC-RATE-PRINCIPLE` | "Forward planning": "you must firstly determine if you have an allowance to apply" | Before applying organic manure, determine the field-by-field N, P and K allowance from a nutrient management plan (soil results, crop type, Nitrates Directive allowances) | SOURCE_DIRECT | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_ARCHITECTURE (no slurry-rate engine) | Winter cereals, in-crop spring slurry. Outside the v1 first-cut silage scope. The allowance part is regulatory (Campaign B) |
| `CLM-TGC-RATE-TEST` | `TGC-RATE-PRINCIPLE` | "Prior to application": "Take a representative slurry sample from the agitation point or slurry tap on the tanker for laboratory analysis"; "do a hydrometer test to determine the Dry Matter % of the slurry" | Assess slurry nutrient content by laboratory analysis. If time does not allow, use a hydrometer DM reading with the Teagasc table to read N, P and K | SOURCE_DIRECT | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_MISSING_INPUT (no hydrometer DM input; GAP-05 Level B) | Cereal context. Supports the GAP-05 Level A/B ordering in principle. It gives no hydrometer calibration, so `CLM-AIR-GAP05-HIERARCHY` is unchanged |
| `CLM-TGC-RATE-P` | `TGC-RATE-PRINCIPLE` | "Prior to application": "Decide final application rate based on laboratory analysis or Teagasc Table 1 results and the crop P allowance from your NMP – aim to match the P requirement of the crop" | For in-crop cereal slurry, set the final rate from slurry analysis (or the table) and the crop P allowance, aiming to match the crop P requirement. A K shortfall can be topped up with the next chemical application | SOURCE_DIRECT | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_ARCHITECTURE (no slurry-rate engine) | Cereal context only. This is P-led, not a min(P-limited, K-limited) rule. It does not establish `AI_PROVISIONAL_RATE_SELECTOR_V1` |
| `CLM-TGC-RATE-DEDUCT` | `TGC-RATE-PRINCIPLE` | "Post application": "reduce your chemical N, P & K crop application by the amount applied" | Account for slurry N, P and K before chemical fertiliser | SOURCE_DIRECT | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED (`calculateNutrientPlan` organic offset) | Corroborates `CLM-TGC-OM-BALANCE` |

### 6.3 AI claims reviewed against the stored sources

| Claim | Sources inspected | Search result | Previous state | Previous class | New state | New class | Implementation status | Limitations |
|---|---|---|---|---|---|---|---|---|
| `CLM-AIR-CONF03-SHARE` | `TGC-OM-2026` | The 50% P and 75% K share wording is present (`CLM-TGC-OM-SHARE-P`, `-K`), separately from the Table 2 availability note (`CLM-TGC-OM-AVAIL`). No wording says that the caps and the availability factors are cumulative. The P cap is stated as a consequence ("therefore") of 50% P availability | AI_REVIEW_ONLY | SOURCE_DIRECT (per AI review), including the cumulative reading | Share caps REPOSITORY_VERIFIED. Cumulative interaction with the availability factors AI_REVIEW_ONLY | SOURCE_DIRECT (caps); AI_PROVISIONAL (cumulative interaction) | Caps READY_FOR_IMPLEMENTATION_REVIEW. Interaction IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION. No allocation layer (IMPLEMENTATION_DEFERRED_ARCHITECTURE) | The earlier record's SOURCE_DIRECT label for the cumulative reading is not supported by the stored source and is downgraded here. The stored source does not contradict the cumulative reading either. Double-counting P is a live risk for expert validation (reference-case reading C) |
| `CLM-AIR-CONF02-RECON` | `TGC-K90`, `TGC-YIELD-SCALE` | The 90 kg text is present (`CLM-TGC-K90-LUXURY`, `-SPRING`). Neither page says whether slurry K counts toward the 90 kg or how nutrient credit is accounted | AI_REVIEW_ONLY | AI_PROVISIONAL (90 kg text SOURCE_DIRECT) | 90 kg text REPOSITORY_VERIFIED; the timing split REPOSITORY_VERIFIED (`CLM-TGC-K90-SPLIT`); the Farm Return slurry-K reconciliation AI_REVIEW_ONLY | SOURCE_DIRECT (text); SOURCE_DERIVED (split, not reduction); AI_PROVISIONAL (reconciliation) | Non-truncation ALREADY_IMPLEMENTED. Spring recommendation cap IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION and IMPLEMENTATION_DEFERRED_ARCHITECTURE | Green Book Table 14-3 still credits 106–116 kg/ha slurry K to first cut. `TGC-YIELD-SCALE`'s 70 units K/ac at closing has a different (animal-health) rationale and is not reconciled here |
| `CLM-AIR-CONF04-SPRING` | `TGC-SLURRY-TIMING` | "for example, February to April" is present. There is no day or time boundary and no statement about January | AI_REVIEW_ONLY (February start) | SOURCE_DIRECT plus product scope | Month wording REPOSITORY_VERIFIED (`CLM-TGC-SLURRY-TIMING`). The exact 1 February – 30 April inclusive boundary AI_REVIEW_ONLY | SOURCE_DIRECT (month wording); AI_PROVISIONAL (exact calendar boundary as a Farm Return class) | Exact boundary IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION. Production timing (`classifySlurryTiming`) unchanged | CONF-04 stays RESOLVED_WITH_SCOPE. The source's example window is not proof of a 1 Feb 00:00 – 30 Apr 23:59 boundary |
| `CLM-AIR-GAP01-SELECTOR` | `TGC-OM-2026`, `TGC-RATE-PRINCIPLE` | Rate principles are present (`CLM-TGC-OM-RATE`, `-EXCESS`, `-BALANCE`, `CLM-TGC-RATE-*`). No lower-of / min(P-limited, K-limited) selector is stated. The cereal source is P-led, with K topped up by chemical fertiliser | AI_REVIEW_ONLY | AI_PROVISIONAL (principle SOURCE_DIRECT) | Principles REPOSITORY_VERIFIED. `AI_PROVISIONAL_RATE_SELECTOR_V1` AI_REVIEW_ONLY | SOURCE_DIRECT (principles); AI_PROVISIONAL (selector) | IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION and IMPLEMENTATION_DEFERRED_ARCHITECTURE | The selector is a Farm Return rule, never a Teagasc formula. The cereal P-led wording is outside v1 scope and does not contradict it for first-cut silage, where "not in excess of crop demands" applies to P and K. Expert validation must confirm |
| `CLM-AIR-GAP03-YIELD` | `TGC-YIELD-SCALE`, `TGC-K90` | The per-tonne statement and the 5/6 t DM/ha rows are present | P/K REPOSITORY_VERIFIED; N AI_REVIEW_ONLY | SOURCE_DIRECT | N 25, P 4 and K 25 REPOSITORY_VERIFIED (`CLM-TGC-YIELD-SCALE`) | SOURCE_DIRECT | P/K ALREADY_IMPLEMENTED. N READY_FOR_IMPLEMENTATION_REVIEW. Yields outside 5–6 t DM/ha IMPLEMENTATION_DEFERRED_MISSING_INPUT | The existing P/K functions are unbounded linear. That pre-existing behaviour is recorded, not changed |

## 7. Implementation status of repository-verified rules (2026-09-29)

Task `campaign-c-verified-rules-existing-architecture-20260929`, base `942cc81`. Existing
architecture only; **no production output changed**; engine stays `nutrient_engine_v1.2.0`.
This supersedes the READY_FOR_IMPLEMENTATION_REVIEW entries in §6.2 for the rules below.
Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT.

| Rule / claim | Evidence state | Implementation status | Why |
|---|---|---|---|
| Low-index organic share caps, P 50% / K 75% of crop requirement (`CLM-TGC-OM-SHARE-P`, `-K`) | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_ARCHITECTURE | The source limits how much organic fertiliser to *plan*. `calculateNutrientPlan` takes the planned slurry volume as an input and has no slurry-rate/allocation layer to limit. Capping the credited organic nutrient instead would silently apply the AI_PROVISIONAL reading that the caps stack with the 50%/90% availability factors. Missing capability: a slurry-rate/allocation layer that chooses organic supply against crop requirement |
| Slurry availability P × 0.50 / K × 0.90 on Index 1/2 (`CLM-TGC-OM-AVAIL`) | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED | `applyLowSoilIndexAvailability` (CC-B2); unchanged |
| 90 kg K/ha spring guidance text (`CLM-TGC-K90-LUXURY`, `-SPRING`, `-SPLIT`) | REPOSITORY_VERIFIED (text) | DEFERRED_EXACT_RULE_PROVISIONAL | No existing production code implements a 90 kg K rule. Whether slurry K counts toward the 90 kg (`CLM-AIR-CONF02-RECON`) is AI_PROVISIONAL, so no gate is introduced. Slurry K credit is not truncated to 90 (existing regression test) |
| First-cut P ±4 / K ±25 kg per t DM (`CLM-TGC-YIELD-SCALE`) | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED | `pMaintenanceSilageKgHa`, `kSilageKgHa`; the stored 5 t and 6 t rows (Index 3: P 20/24, K 125/150) are reproduced by regression tests. Pre-existing unbounded linear scaling is recorded, not changed |
| First-cut N ±25 kg per t DM (`CLM-TGC-YIELD-SCALE`) | REPOSITORY_VERIFIED | IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR | The source gives only the 5 and 6 t DM/ha rows and no range for the per-tonne rule, and says nothing about the lower "grazed in the previous year" rate (`nSilageKgHa` 100). Implementing only 5–6 t would create a discontinuity at the range edge; no bounds are invented. Silage plans are mock-only in real mode, so the path is not currently user-facing |
| Organic nutrients deducted from crop requirement before chemical fertiliser (`CLM-TGC-OM-BALANCE`) | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED | `calculateNutrientPlan`: requirement − organic offset → `netRequirement` → purchased products |
| Determine slurry nutrient content (`CLM-TGC-RATE-*`) | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED | `resolveEffectiveSlurryComposition` + `resolveAvailableSlurryNutrients` (DM/method/timing-specific tables, fail-closed) |
| Slurry rate based on crop requirement; no excess (`CLM-TGC-OM-RATE`, `-EXCESS`) | REPOSITORY_VERIFIED (principle) | IMPLEMENTATION_DEFERRED_ARCHITECTURE | No slurry-rate engine exists; the planned volume is an input |
| `AI_PROVISIONAL_RATE_SELECTOR_V1` | AI_PROVISIONAL | NOT_APPLICABLE (not repository-verified; not implemented) | Regression test asserts no rate selector exists |
