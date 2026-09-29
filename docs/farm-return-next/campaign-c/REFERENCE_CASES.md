# Campaign C — frozen reference cases, `slurry-agronomy-ie-2026-v1` (DRAFT)

The machine-readable source of truth is
[`reference-cases.slurry-agronomy-ie-2026-v1.json`](reference-cases.slurry-agronomy-ie-2026-v1.json).
`src/domain/campaign-c-reference-cases.test.ts` checks it for internal consistency,
claim and conflict traceability, and agreement with values Farm Return already
ships. This table is a summary. Where the two disagree, the JSON wins.

**Baseline field.** Cattle slurry. First-cut silage. Declared ryegrass sward with
clover below 20%, at least 4 years old, cut (not grazed) last year. Declared yield
5.0 t DM/ha. Mineral soil, lab OM 6%. Lab P and K Index 3, valid, not sampled this
season. Planned 2027-03-15. LESS. DM 7.0% lab, sampled after the latest fill. Prior
inputs attested as none. Gross area 4.0 ha. Recorded spreadable area 3.6 ha.

**Readings** (because the core rate rule is unresolved; see CONFLICTS.md):

- **A**: no excess over the remaining P or K requirement.
- **B**: A plus the 90 kg K spring limit.
- **C**: A with the Index 1/2 share caps.
- **P**: P-limited only.
- **PROPOSED**: evaluate a farmer's rate.

**Rounding** (FARM_RETURN_POLICY):

- Rate: floor to 0.1 m³/ha.
- Total volume: floor to 0.1 m³ of rate × *recorded* spreadable area.
- kg/ha values are exact.
- Balance = remaining − supply. A negative balance is oversupply and is never floored.

Available nutrient values are kg/m³ as applied (DM 7%, spring LESS):

- Index 3/4: N 1.1, P 0.6, K 4.0.
- P Index 1/2: P 0.3.
- K Index 1/2: K 3.6.

Requirements at 5 t DM/ha:

- N 125.
- P by Index 1/2/3/4: 40/30/20/0.
- K by Index 1/2/3/4: 185/155/125/0 in the year of sampling. K Index 4 uses 125 in later years.

| Case | Situation | Intermediate values (kg/ha unless stated) | Candidate rates (m³/ha) | Status (DRAFT) | Blocking | Total volume |
|---|---|---|---|---|---|---|
| CC-001 | Supported field, P3/K3 | req N125 P20 K125. Limits: P 33.33, K 31.25, K-90 22.5 | A 31.2 (supplies N34.32 P18.72 K124.8). B 22.5 (N24.75 P13.5 K90) | EVIDENCE_CONFLICT | CONF-02, GAP-01 | blocked (A would be 112.3 m³, B 81.0 m³) |
| CC-002 | P Index 1 | P avail 0.3. req P40 | A 31.2 (P 9.36, chemical P still 30.64). B 22.5. C 31.2 | EVIDENCE_CONFLICT | CONF-02 | blocked |
| CC-003 | P Index 4 | P req 0 | — | NOT_RECOMMENDED_AGRONOMIC (GB 9-4 fn2) | — | — |
| CC-004 | K Index 1 | K avail 3.6. req K185 | A 33.3 (P-limited, K 119.88). B 25.0. C 33.3 | EVIDENCE_CONFLICT | CONF-02 | blocked |
| CC-005 | K Index 4, year of sampling | K req 0 | A 0.0. P 33.3 with K oversupply −133.2 | EXPERT_REVIEW_REQUIRED | GAP-01 | — |
| CC-006 | Prior 10 m³/ha LESS 7% this spring | credit N11 P6 K40. Remaining N114 P14 K85 | A 21.2. B 12.5 (90 − 40 K) | EVIDENCE_CONFLICT | CONF-02 | blocked |
| CC-007 | Prior 30 kg N/ha on the silage field | remaining N95 | A 31.2 (chemical N 60.68). B 22.5 | EVIDENCE_CONFLICT | CONF-02 | blocked |
| CC-007B | 30 kg N for early grazing | credit 6 (20%). Remaining N119 | A 31.2. B 22.5 | EVIDENCE_CONFLICT | CONF-02 | blocked |
| CC-008 | Prior inputs unknown | remaining unknown (never 0) | — | UNKNOWN_REQUIRED_DATA | — | — |
| CC-009 | DM unknown | no availability | — | UNKNOWN_REQUIRED_DATA | — | — |
| CC-010 | DM 6.3% lab | between points | — | OUT_OF_SCOPE | GAP-02 | — |
| CC-010B | DM 9.0% lab | outside 2–7% | — | OUT_OF_SCOPE | — | — |
| CC-011 | Splashplate, spring | evidence exists, not in v1 | — | OUT_OF_SCOPE | — | — |
| CC-011B | Incorporation or other | no grassland rule | — | OUT_OF_SCOPE | — | — |
| CC-012 | 2027-07-20 | late summer | — | OUT_OF_SCOPE | — | — |
| CC-012B | 2027-01-20 | spring boundary | — | EVIDENCE_CONFLICT | CONF-04 | — |
| CC-012C | 2027-05-20 | summer, first cut | — | OUT_OF_SCOPE | — | — |
| CC-013 | DM 6% lab | P 0.5 vs 0.6 | A 35.7 (P0.5) / 33.3 (P0.6). B 25.7 | EVIDENCE_CONFLICT | CONF-01, CONF-02 | blocked |
| CC-014 | Lab OM 25% | peat | — | OUT_OF_SCOPE | — | — |
| CC-015 | Prior 10 kg P/ha; spreadable area unknown | remaining P10 | A = B = 16.6 (N18.26 P9.96 K66.4) | EXPERT_REVIEW_REQUIRED → RECOMMENDED once GAP-01 closes | GAP-01 | UNKNOWN_REQUIRED_DATA (gross area not used) |
| CC-015B | Same, spreadable 3.6 ha | — | 16.6 | as CC-015 | GAP-01 | candidate 59.7 m³ |
| CC-016 | Prior P20 K125 known | remaining P0 K0 (explicit zero); N125 | 0.0 | EXPERT_REVIEW_REQUIRED → NOT_RECOMMENDED_AGRONOMIC | GAP-01 | candidate 0.0 |
| CC-017 | Farmer proposes 33 m³/ha | supplies N36.3 P19.8 K132. K balance −7.0 | PROPOSED 33.0 | EXPERT_REVIEW_REQUIRED → NOT_RECOMMENDED_AGRONOMIC | GAP-01 | — |
| CC-018 | Fields A, B, C | per-field, never averaged | see A/B/C | EVIDENCE_CONFLICT (list of field statuses) | CONF-02, CONF-03 | — |
| CC-018A | P1/K1 | avail P0.3 K3.6. req P40 K185 | A 51.3. B 25.0. C 38.5 | EVIDENCE_CONFLICT | CONF-02, CONF-03 | blocked |
| CC-018B | P3/K3 | = CC-001 | A 31.2. B 22.5 | EVIDENCE_CONFLICT | CONF-02 | blocked |
| CC-018C | P4/K2 | P req 0 | — | NOT_RECOMMENDED_AGRONOMIC | — | — |

## CC-B1 pending differential (not applied)

CC-B1 adjudicated CONF-01 and CONF-04 as RESOLVED_WITH_SCOPE
([ADJUDICATION_CC-B1.md](ADJUDICATION_CC-B1.md)). Neither is ratified yet
(SOURCES_AND_CLAIMS §4), so the JSON is **unchanged** and no candidate value has become
normative. On ratification, the next JSON revision would record:

| Case | Current | After ratification | Rule basis |
|---|---|---|---|
| CC-013 | EVIDENCE_CONFLICT. Blocking CONF-01, CONF-02, GAP-01. Readings at P 0.5 and P 0.6 | EVIDENCE_CONFLICT. Blocking CONF-02, GAP-01. P 0.6 alternative reading retired | `SLC-V1-P-LESS-6` (`CLM-GB-9-1`, `CLM-GB-9-4`, `CLM-GB-9-8`, `CLM-OM-T2`) |
| CC-012B | EVIDENCE_CONFLICT (CONF-04) | OUT_OF_SCOPE, no blocking item | `SLC-V1-TIMING-SPRING` (`CLM-SP07-TIMING`; `CLM-CN-2016` non-authoritative) |

Neither change gives a case a final rate. All other cases are unaffected. CONF-02,
CONF-03 and GAP-01 remain open.

## Versioning

- These expectations belong to `slurry-agronomy-ie-2026-v1` and are never edited
  once the rule set is APPROVED.
- A later version adds its own file (`reference-cases.<ruleSetId>.json`) that runs
  the same case IDs. It also records a differential per case: old value → new value,
  and the rule change responsible (LIFECYCLE.md §7).
- A case is never deleted. A case that no longer applies is marked `RETIRED` in the
  new version, with a reason.
- While the rule set is DRAFT, a reviewer's resolution of an open item may change
  these expectations. Each change is recorded in `CHANGELOG` form in the JSON's next
  revision, before approval.
