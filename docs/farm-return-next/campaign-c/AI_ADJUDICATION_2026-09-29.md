# Campaign C — AI scientific adjudication with repository evidence gate

Task `campaign-c-ai-adjudication-v2-evidence-gated-20260929`, base `2b6da92`, 2026-09-29.

**Status: AI_SCIENTIFIC_ADJUDICATION — EXPERT_VALIDATION_PENDING.**

- This is **not** expert validation. No rule below is agronomist-approved, peer-reviewed
  by Farm Return, or externally expert-approved.
- Rule set `slurry-agronomy-ie-2026-v1` stays **DRAFT**. The reference-case JSON is
  unchanged (its expectations change only under REFERENCE_CASES "Versioning" after
  expert validation).
- Active nutrient engine: `nutrient_engine_v1.2.0` (unchanged — no production calculation
  semantics changed in this task).
- CC-B1 moves from BLOCKED_HUMAN to **AI_ADJUDICATED_EXPERT_VALIDATION_PENDING**.
- CC-B2 and CC-B4A are closed implementation corrections; this task does not reopen them.
- No database migration. No production deployment. Nothing pushed.

This record supersedes the CC-B1 statement that a named agronomist must rule before AI work
can continue. [ADJUDICATION_CC-B1.md](ADJUDICATION_CC-B1.md) is retained unedited as the
repository-only history.

## 1. Classification schemes

**Scientific evidence class** (exactly one per rule component):

| Class | Meaning |
|---|---|
| `SOURCE_DIRECT` | Explicitly stated by an authoritative source |
| `SOURCE_DERIVED` | Arithmetic or logical consequence of authoritative source statements |
| `AI_PROVISIONAL` | Farm Return implementation rule selected by AI where authoritative evidence defines the principle but not the exact algorithm. Never relabelled `SOURCE_DIRECT` |

**Implementation evidence** (production evidence gate):

| Class | Meaning |
|---|---|
| `REPOSITORY_VERIFIED` | Authoritative evidence stored locally, or traceably represented, with source/page/table/section metadata. Local locators: `docs/scientific-engine/v3/reference_greenbook_2020/Page_Text.csv` (Green Book, by PDF page) and `docs/scientific-engine/v3/advisory_teagasc/` |
| `AI_REVIEW_ONLY` | Supported by the authorised AI external review; underlying source not yet stored/verified in the repository. May not change production outputs. Implementation status `IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION` |

**Implementation status:** `IMPLEMENTED`, `ALREADY_IMPLEMENTED`,
`IMPLEMENTATION_DEFERRED_ARCHITECTURE`, `IMPLEMENTATION_DEFERRED_MISSING_INPUT`,
`IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION`, `NOT_APPLICABLE`.

## 2. External scientific source record

`SRC-AI-REVIEW-2026-09-29` —
**EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW, DATE: 2026-09-29.**

- The retrieval was performed by an authorised AI external research pass, not by the build
  agent. The build agent retrieved nothing (no WebFetch/WebSearch in this task).
- No SHA-256 fingerprint, byte length or retrieval timestamp is recorded. None was supplied,
  and none is invented. Fingerprint status: UNKNOWN.
- No local copy of any source below was added. Where a claim is also locally traceable, both
  links are recorded in §3.

Primary organisation: Teagasc — Agriculture and Food Development Authority, Ireland.
Source titles reviewed by the AI pass (as supplied to this task):

| Ref | Title | Local copy / trace |
|---|---|---|
| AIR-S1 | Organic Manures | None retained. Represented by `SRC-OM-PAGE` claims and `advisory_teagasc/cattle_slurry_available_npk_spring_LESS.csv` |
| AIR-S2 | Fertilising for First Cut Grass Silage | None retained |
| AIR-S3 | Correct fertiliser application rates and cutting dates for first-cut silage | None retained |
| AIR-S4 | Fertilising 1st Cut Grass Silage | None retained |
| AIR-S5 | Nutrient management of white clover swards | None retained. Related local clover N tables: `advisory_teagasc/clover_n_*_2026.csv` (grazing, not first-cut) |
| AIR-S6 | Using white clover to reduce nitrogen fertilisation | None retained |
| AIR-S7 | Teagasc soil fertility / soil index guidance | Green Book Tables 13-2, 14-2 locally (`SRC-GB-2020`) |
| AIR-S8 | Teagasc material on slurry dry-matter measurement and nutrient composition | None retained. Related: `SRC-SP07` repository quotations; Green Book Table 9-1 locally |
| AIR-S9 | Teagasc crop-management guidance covering prior P/K applications | None retained. Related: Green Book Table 14-2 fn4, Table 12-7 fn2 locally |

Exact URLs, publication dates and page locators for AIR-S1..S9 were not supplied and are
recorded as UNKNOWN. Each AI_REVIEW_ONLY rule in §3 names the source(s) that must be
ingested before it can enter production.

## 3. Adjudication and implementation decisions

### Summary

| Item | Scientific classification | Evidence class | Implementation evidence | Implementation status |
|---|---|---|---|---|
| CONF-01 | RESOLVED | SOURCE_DIRECT | REPOSITORY_VERIFIED | ALREADY_IMPLEMENTED |
| CONF-02 | RESOLVED_WITH_SCOPE | SOURCE_DIRECT (90 kg guidance); AI_PROVISIONAL (reconciliation) | REPOSITORY_VERIFIED (90 kg text); AI_REVIEW_ONLY (reconciliation) | Non-truncation ALREADY_IMPLEMENTED; spring cap IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION |
| CONF-03 | RESOLVED | SOURCE_DIRECT | REPOSITORY_VERIFIED (availability factors); AI_REVIEW_ONLY (share caps) | Factors ALREADY_IMPLEMENTED; share caps IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION |
| CONF-04 | RESOLVED_WITH_SCOPE | SOURCE_DIRECT plus Farm Return product scope | AI_REVIEW_ONLY (February start) | IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION |
| GAP-01 | PROVISIONALLY_RESOLVED | SOURCE_DIRECT (principle); AI_PROVISIONAL (selector) | AI_REVIEW_ONLY (selector) | IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION |
| GAP-02 | PROVISIONALLY_RESOLVED | AI_PROVISIONAL (on SOURCE_DIRECT discrete tables) | REPOSITORY_VERIFIED (discrete rows) | ALREADY_IMPLEMENTED (spring/summer LESS) |
| GAP-03 | RESOLVED_WITH_SCOPE | SOURCE_DIRECT | REPOSITORY_VERIFIED (P 4, K 25); AI_REVIEW_ONLY (N 25) | P/K ALREADY_IMPLEMENTED; N IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION; range IMPLEMENTATION_DEFERRED_MISSING_INPUT |
| GAP-04 | RESOLVED | SOURCE_DIRECT | REPOSITORY_VERIFIED | Availability factor ALREADY_IMPLEMENTED; paired plan IMPLEMENTATION_DEFERRED_ARCHITECTURE |
| GAP-05 | RESOLVED_WITH_SCOPE | SOURCE_DIRECT plus provenance policy | AI_REVIEW_ONLY (Level B mapping) | Levels A/C/D partly ALREADY_IMPLEMENTED; Level B IMPLEMENTATION_DEFERRED_MISSING_INPUT |
| GAP-06 | PROVISIONALLY_RESOLVED | AI_PROVISIONAL (safety policy) | Policy only | ALREADY_IMPLEMENTED for spring/summer LESS; splashplate default IMPLEMENTATION_DEFERRED_ARCHITECTURE |
| GAP-07 | RESOLVED_WITH_SCOPE | SOURCE_DIRECT | REPOSITORY_VERIFIED (< 4 years, 20%); AI_REVIEW_ONLY (first-cut clover strategy) | IMPLEMENTATION_DEFERRED_MISSING_INPUT |
| GAP-08 | RESOLVED_WITH_SCOPE | SOURCE_DIRECT (principle); AI_PROVISIONAL (bookkeeping boundary) | REPOSITORY_VERIFIED (fn2/fn4); AI_REVIEW_ONLY (CURRENT_CROP_CYCLE boundary) | IMPLEMENTATION_DEFERRED_MISSING_INPUT |

AI-review claims are registered in SOURCES_AND_CLAIMS §5:

| Item | Claim |
|---|---|
| CONF-01 | `CLM-AIR-CONF01` |
| CONF-02 | `CLM-AIR-CONF02-RECON` |
| CONF-03 | `CLM-AIR-CONF03-SHARE` |
| CONF-04 | `CLM-AIR-CONF04-SPRING` |
| GAP-01 | `CLM-AIR-GAP01-SELECTOR` |
| GAP-02 | `CLM-AIR-GAP02-DM` |
| GAP-03 | `CLM-AIR-GAP03-YIELD` |
| GAP-04 | `CLM-AIR-GAP04-INDEX` |
| GAP-05 | `CLM-AIR-GAP05-HIERARCHY` |
| GAP-06 | `CLM-AIR-GAP06-DEFAULT` |
| GAP-07 | `CLM-AIR-GAP07-SWARD` |
| GAP-08 | `CLM-AIR-GAP08-CYCLE` |

No AI adjudication contradicts a stronger locally traceable source (STOP 1 not met). The
residual tension for CONF-02 is recorded below.

### CONF-01 — spring LESS P, 6% DM

- **Rule (`SLC-V1-P-LESS-6`, SOURCE_DIRECT):** 6% DM cattle slurry, spring LESS: N 1.0,
  P 0.5, K 3.5 kg/m³ (Index 3/4 basis). 0.6 kg P/m³ is the 7% DM row. A DM-specific table
  takes precedence over a generic "typical slurry" summary value.
- **Repository evidence:** `CLM-OM-T2` (local CSV row `6,typical,spring,LESS,1.0,0.5,3.5`);
  `CLM-GB-9-1`, `CLM-GB-9-4`, `CLM-GB-9-8-FN3` (Green Book, local). AI review AIR-S1.
- **Implementation:** ALREADY_IMPLEMENTED — `SPRING_LESS_SLURRY_TABLE` 6% P 0.5, 7% P 0.6.
  Frozen by regression test.
- **Uncertainty:** `CLM-D26-T1`'s 0.6 remains a recorded, non-adopted quotation.

### CONF-02 — 90 kg K/ha

- **Source-direct part (SOURCE_DIRECT, REPOSITORY_VERIFIED):** where more than 90 kg K/ha
  is advised, only 90 kg should be applied in spring, the remainder to aftermath or late
  autumn, because of luxury uptake (`CLM-GB-14-TXT`, `CLM-GB-14-2` fn4; Green Book PDF
  pp.88–89, local).
- **Farm Return reconciliation (`SLC-V1-K-SPRING-90`, AI_PROVISIONAL, AI_REVIEW_ONLY):**
  the 90 kg figure is an application/timing constraint, not a nutrient-content truncation.
  Calculated available slurry K (e.g. 33 m³/ha × 3.5 = 115.5 kg/ha) is never reduced to 90.
  A future Farm Return spring recommendation must not intentionally deliver more than
  90 kg K/ha, and any remainder must stay identifiable for later application. This is not
  Teagasc wording.
- **Implementation:**
  - Non-truncation: ALREADY_IMPLEMENTED. No production code caps slurry K; regression
    test added.
  - Spring allocation cap: IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION (AI_REVIEW_ONLY
    reconciliation). It is also architecturally inapplicable today: no production code
    produces a slurry rate recommendation (SCIENCE_FREEZE §13).
- **Ingestion required:** AIR-S2/S3/S4 wording on whether spring slurry K counts toward
  90 kg.
- **Uncertainty:** Green Book Table 14-3 (local) still credits 106–116 kg/ha slurry K to
  first cut with the slurry timing unstated. The AI reconciliation does not contradict that
  table: it preserves the credit and constrains only a recommendation. Expert validation
  must confirm.

### CONF-03 — low-index organic P/K

- **Availability layer (SOURCE_DIRECT, REPOSITORY_VERIFIED):** on P Index 1/2 available
  slurry P = base × 0.50; on K Index 1/2 available slurry K = base × 0.90
  (`CLM-GB-9-8-FN3`, local; `CLM-OM-T2-NOTE`).
- **Organic-share layer (SOURCE_DIRECT per AI review, AI_REVIEW_ONLY):** on P Index 1/2,
  organic fertiliser supplies at most 50% of the crop P requirement; on K Index 1/2, at most
  75% of the crop K requirement (`CLM-OM-PROSE-PK`, `CLM-AIR-CONF03-SHARE`). The two layers
  are cumulative. The share cap applies to the requirement/allocation layer, never to slurry
  concentration. The availability factor never multiplies the crop requirement.
- **Implementation:**
  - Availability factors: ALREADY_IMPLEMENTED (`applyLowSoilIndexAvailability`, CC-B2).
    Regression tests confirm the crop requirement is untouched.
  - Share caps: IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION. The 50%/75% wording is not
    stored in the repository; the Green Book text contains no share cap. It is also
    architecturally inapplicable: no allocation/rate layer exists.
- **Ingestion required:** AIR-S1 exact P/K share wording, with page locator and fingerprint.

### CONF-04 — spring nutrient-value class

- **Rule (`SLC-V1-TIMING-SPRING`, SOURCE_DIRECT plus product scope):** the Campaign C v1
  spring slurry nutrient-value class is 1 February – 30 April inclusive. January is outside
  the v1 spring evidence class unless another supported rule covers it. This is a
  scope/evidence-class boundary, not a claim that January application is agronomically
  invalid. Statutory closed periods remain a separate Campaign B gate.
- **Repository evidence:** the February–April window is `CLM-SP07-TIMING` (repository
  quotation, source not retained). The local Green Book (`CLM-GB-9-2`) and local LESS CSV say
  only "spring". The start date is therefore AI_REVIEW_ONLY.
- **Scientific status:** RESOLVED_WITH_SCOPE (same meaning as ADJUDICATION_CC-B1.md
  CONF-04). Expert validation pending.
- **Implementation:** IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION (the February start is not
  repository-verified). `classifySlurryTiming`
  (Carbon Navigator label, January = SPRING, RISK-03) is unchanged. Production outputs do
  not change.
- **Ingestion required:** `SRC-SP07` / AIR-S1 month wording.

### GAP-01 — deterministic slurry-rate selection

- **Principle (SOURCE_DIRECT):** base slurry rate on crop P and K requirement and do not
  intentionally exceed crop demand (`CLM-OM-RATE`).
- **Selector (`AI_PROVISIONAL_RATE_SELECTOR_V1`, AI_PROVISIONAL, AI_REVIEW_ONLY):**
  1. Determine the crop P requirement and the crop K requirement.
  2. Apply soil-index rules.
  3. Apply organic-share constraints.
  4. Account for evidenced prior inputs.
  5. Calculate the P-limited maximum rate and the K-limited maximum rate.
  6. Take the lower rate.
  7. Then apply timing, regulatory, weather/actionability and operational constraints.

  This selector is never a Teagasc formula.
- **Implementation:** IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION. The selector is
  AI_REVIEW_ONLY, and there is no rate engine to host it (IMPLEMENTATION_DEFERRED_ARCHITECTURE
  as well). It depends on deferred CONF-03 share caps and GAP-08 crop-cycle inputs.

### GAP-02 — DM classes

- **Rule (AI_PROVISIONAL on SOURCE_DIRECT tables):**
  - No continuous interpolation between published DM rows.
  - Use reliable laboratory N/P/K under its own provenance.
  - Use a published row only on an exact DM match.
  - Otherwise fail closed.
- **Implementation:** ALREADY_IMPLEMENTED for spring/summer LESS
  (`slurryAvailableSpringLessKgHa` returns `BLOCK_NO_INTERPOLATION`, e.g. for 6.3%).
  Measured N/P/K conversion remains unimplemented (no sourced conversion rule). The
  splashplate Table 9-8 path's nearest-DM snapping (RISK-02) is outside v1 and unchanged
  (IMPLEMENTATION_DEFERRED_ARCHITECTURE).

### GAP-03 — target-yield scaling

- **Rule (SOURCE_DIRECT):** first cut ±25 kg N, ±4 kg P, ±25 kg K per t DM/ha from the
  reference yield, only within supported yield bounds.
- **Repository evidence:** P ±4 (Green Book Table 13-4 fn2, PDF p.84, local) and K ±25
  (Table 14-2 fn1, PDF p.89, local) are REPOSITORY_VERIFIED. N ±25 is not in local
  Table 12-7 (PDF p.76), so it is AI_REVIEW_ONLY.
- **Implementation:**
  - P/K: ALREADY_IMPLEMENTED (`pMaintenanceSilageKgHa`, `kSilageKgHa`). They are not
    user-facing: real silage fields block `MISSING_SILAGE_PLAN_DATA` (RISK-04).
  - N: IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION (AIR-S2/S3/S4).
  - Supported yield bounds: no range is established in repository evidence, so production
    is not broadened (IMPLEMENTATION_DEFERRED_MISSING_INPUT). The existing functions are
    unbounded linear; this pre-existing behaviour is recorded, not changed.

### GAP-04 — mixed P/K indices

- **Rule (SOURCE_DIRECT, REPOSITORY_VERIFIED):** P Index governs P rules; K Index governs
  K rules (`CLM-GB-9-8-FN3`).
- **Implementation:** the per-nutrient availability factor is ALREADY_IMPLEMENTED
  (`applyLowSoilIndexAvailability`). The paired P/K plan evidence model (CC-B4A) is
  retained: IMPLEMENTATION_ARCHITECTURE_DEFERRED. CC-B4A is not reopened.

### GAP-05 — slurry evidence hierarchy

- **Rule (SOURCE_DIRECT plus provenance policy):**

  | Level | Evidence |
  |---|---|
  | A | Laboratory N/P/K/DM |
  | B | Measured DM (e.g. hydrometer) mapped to authoritative tables |
  | C | Farmer-declared assumption |
  | D | Unknown |

  B and C are never represented as laboratory-measured evidence, and nothing is silently
  promoted to a higher level.
- **Implementation:** partly ALREADY_IMPLEMENTED. `resolveEffectiveSlurryComposition`
  carries `verified` / `farmer_adjusted` / `estimated` status, and the plan returns
  `effectiveSlurryComposition` alongside the credit. Level B has no distinct input or
  calibration evidence (IMPLEMENTATION_DEFERRED_MISSING_INPUT; AIR-S8 ingestion required).
- **Open provenance note:** the LESS table outcome's `evidenceState` is `MEASURED`, which
  describes the table lookup, not the DM provenance. Re-labelling it would change
  engine-output semantics across callers. It is deferred to a versioned engine change
  (IMPLEMENTATION_DEFERRED_ARCHITECTURE).

### GAP-06 — default assumptions

- **Rule (AI_PROVISIONAL safety policy):**
  - No silent DM assumption is presented as measured evidence.
  - An explicit farmer declaration is recorded as FARMER_DECLARED.
  - Unknown stays unknown.
- **Implementation:** ALREADY_IMPLEMENTED for spring/summer LESS. With no composition record,
  the 6.3% fallback is disclosed as `estimated` and fails the exact-row LESS lookup (never
  converted to a 6% observation). The splashplate path still uses the 6.3% default with
  nearest-DM snapping (RISK-08, RISK-02). It is outside v1 and unchanged
  (IMPLEMENTATION_DEFERRED_ARCHITECTURE).

### GAP-07 — sward classification

- **Rule (SOURCE_DIRECT):**
  - Reseeded swards use the < 4-year category (`CLM-GB-12-7` fn3, local).
  - The reduced-N white-clover strategy needs about ≥ 20% average annual clover (Green
    Book Table 12-6 note, local). Early-season clover contribution is lower.
  - Visible clover alone never permits reduced N.
- **Implementation:** IMPLEMENTATION_DEFERRED_MISSING_INPUT. There is no sward-age or
  annual-clover-content input for first-cut fields. First-cut clover N strategy wording
  (AIR-S5/S6) is AI_REVIEW_ONLY.

### GAP-08 — prior nutrient inputs

- **Rule:**
  - Prior inputs attributable to the current crop cycle are accounted for (SOURCE_DIRECT
    principle).
  - First-cut inputs applied before closing that contribute to the crop are included.
  - 20% of early-grazing N remains for first cut (`CLM-GB-12-7` fn2, local).
  - The bookkeeping boundary is `CURRENT_CROP_CYCLE` (AI_PROVISIONAL). No 30/90-day window
    is used.
- **Implementation:** IMPLEMENTATION_DEFERRED_MISSING_INPUT. The domain cannot identify a
  crop cycle, and slurry actuals have no DM. No time window was added and no migration was
  made.

## 4. Priority implementation targets (task §5)

| Target | Outcome |
|---|---|
| A. 6% LESS P = 0.5 | ALREADY_IMPLEMENTED, frozen by test |
| B. Low-index share caps separate from availability factors | Factors ALREADY_IMPLEMENTED and tested; caps DEFERRED (AI_REVIEW_ONLY, no allocation layer) |
| C. 90 kg K constraint separate from credit | Credit non-truncation tested; constraint DEFERRED (AI_REVIEW_ONLY, no rate engine) |
| D. Feb–Apr spring class | DEFERRED (AI_REVIEW_ONLY February start); production timing unchanged |
| E. `AI_PROVISIONAL_RATE_SELECTOR_V1` | DEFERRED (AI_REVIEW_ONLY, no rate engine) |
| F. Discrete DM fail-closed | ALREADY_IMPLEMENTED, tested (6.3% blocks) |
| G. Yield scaling within bounds | P/K ALREADY_IMPLEMENTED; no bounds evidence, so not broadened; N DEFERRED |
| H. Provenance | Existing composition status retained; `evidenceState` relabel DEFERRED |

Production code changed: **no**. Engine version: `nutrient_engine_v1.2.0` (unchanged).
Statutory and Campaign B outputs: unchanged.

## 5. Prospective expert-validation strategy (not yet performed)

1. Freeze a representative set of Farm Return cases (the reference-case suite plus any
   additions, versioned under REFERENCE_CASES).
2. Farm Return generates its decisions without access to expert answers, and those
   decisions are frozen.
3. An identified expert independently evaluates the same cases without seeing Farm Return
   outputs, and those answers are frozen.
4. Compare decisions only after both sides are frozen.
5. Measure decision agreement, numerical deviation, safety disagreement, false blocking and
   evidence agreement.

No part of this validation has occurred.
