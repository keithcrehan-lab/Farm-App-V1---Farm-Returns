# Campaign C — CC-B1 evidence adjudication

Task `cc-b1-campaign-c-science-adjudication-20260929`, base `0a92745`, 2026-09-29.
> **Superseded status (2026-09-29):** the repository-only outcome below is kept as history.
> The later authorised AI scientific adjudication is in
> [AI_ADJUDICATION_2026-09-29.md](AI_ADJUDICATION_2026-09-29.md). CC-B1 is now
> AI_ADJUDICATED_EXPERT_VALIDATION_PENDING. Prospective expert validation replaces the
> requirement for a named agronomist before AI work continues.

Rule set `slurry-agronomy-ie-2026-v1` remains **DRAFT**. No production code was changed.
Active nutrient engine: `nutrient_engine_v1.2.0`. CC-B2 and CC-B4A are closed
implementation corrections and are not evidence for any item below.

## Method and limits

- Repository evidence only. No WebFetch/WebSearch. No fresh retrieval of any external
  document is claimed.
- Provenance classes used below:
  - **LOCAL_PRIMARY**: text or table locally stored in
    `docs/scientific-engine/v3/reference_greenbook_2020/` (`Page_Text.csv`, by PDF page)
    or `docs/scientific-engine/v3/advisory_teagasc/`.
  - **REPO_QUOTATION**: a quotation or note recorded in repository docs or code comments;
    the source bytes are not retained.
  - **SYSTEM_INFERENCE**: Farm Return reasoning, arithmetic or policy.
  - **UNVERIFIED_EXTERNAL**: needs authorised source retrieval (SOURCES_AND_CLAIMS §4).
- Classification is exactly one of RESOLVED, RESOLVED_WITH_SCOPE, UNRESOLVED_CONFLICT,
  INSUFFICIENT_EVIDENCE, OUT_OF_SCOPE.
- **An adjudication here is an evidence-level outcome, not rule-set approval.**
  SOURCES_AND_CLAIMS §4 (items 1–6) still requires authorised source re-verification and
  an identified scientific reviewer to record the interpretation (LIFECYCLE
  `approval.reviewers`) before any item is treated as closed for approval. Until then
  every item stays in the reference-case `openItems` list and the reference-case JSON is
  unchanged (REFERENCE_CASES.md, "CC-B1 pending differential").

## Summary

| Item | Core? | Classification | Register status after CC-B1 |
|---|---|---|---|
| CONF-01 | yes (6% DM row) | **RESOLVED_WITH_SCOPE** | ADJUDICATED — pending re-verification and reviewer ratification |
| CONF-02 | yes | **UNRESOLVED_CONFLICT** | open, STOP 1/2 |
| CONF-03 | yes | **INSUFFICIENT_EVIDENCE** | open, STOP 1/6 (availability factors remain frozen) |
| CONF-04 | no | **RESOLVED_WITH_SCOPE** | ADJUDICATED; AI scientific adjudication agrees (2026-09-29). February-start production use deferred pending evidence ingestion; expert validation pending |
| GAP-01 | yes | **INSUFFICIENT_EVIDENCE** | open, STOP 4/8 |
| GAP-02 | yes | INSUFFICIENT_EVIDENCE | open (not closed by repository evidence) |
| GAP-03 | no | INSUFFICIENT_EVIDENCE | open |
| GAP-04 | no | INSUFFICIENT_EVIDENCE | open |
| GAP-05 | no | INSUFFICIENT_EVIDENCE | open |
| GAP-06 | no | INSUFFICIENT_EVIDENCE | open |
| GAP-07 | no | INSUFFICIENT_EVIDENCE | open |
| GAP-08 | no | INSUFFICIENT_EVIDENCE | open |

Core items still unresolved: CONF-02, CONF-03, GAP-01 (and GAP-02 for any DM other than
the four evidenced points). Campaign C remains DRAFT; CC-B1 remains open.

---

## CONF-01 — spring LESS P for typical cattle slurry

**Proposition.** For cattle slurry spread by LESS in spring, at the standard "typical"
6% DM case, Index 3/4 basis, is available P 0.5 or 0.6 kg P/m³ as applied?

**Supporting 0.5**

| Evidence | Provenance | Strength |
|---|---|---|
| GB Table 9-1 (PDF p.40): average cattle slurry, DM 6.3%, total P 0.5 kg/t | LOCAL_PRIMARY | Tier 1 (Teagasc, Irish survey Berry et al. 2013 as cited) |
| GB Table 9-4 (PDF p.44): Index 3/4, trailing shoe/hose, P 0.5 kg/t, "values based on average cattle slurry" | LOCAL_PRIMARY | Tier 1 |
| GB Table 9-8 fn3 (PDF p.48): P at 100% availability on Index 3; the 6% DM column gives 5/10/15/21/26 kg P/ha at 11/22/33/44/55 t/ha, i.e. 0.45–0.48 kg/t | LOCAL_PRIMARY | Tier 1 |
| `CLM-OM-T2`: 6% "typical" row P 0.5; 7% "thicker" row P 0.6 | LOCAL (repository CSV `cattle_slurry_available_npk_spring_LESS.csv`); source page UNVERIFIED_EXTERNAL | Tier 1–4 (Teagasc advisory, locally stored table) |
| `CLM-SP07-T2`: spring LESS P 0.5 kg/m³ | REPO_QUOTATION (`nutrients.ts` records a direct read) | Tier 4 |
| `CLM-OMPDF-CATTLE6`, `CLM-D26-T2`: 6% row P 0.5 | REPO_QUOTATION | Tier 4 |

**Supporting 0.6**

| Evidence | Provenance | Strength |
|---|---|---|
| `CLM-D26-T1`: Table 1 "typical" LESS spring and summer P 0.6 kg/m³, printed "(5)" units/1,000 gal | REPO_QUOTATION only. `nutrients.ts` (Slurry Timing Evidence Patch note) records that repeated fetches of this article "returned inconsistent, AI-summarised transcriptions rather than a clean verbatim quote of its own table" | Tier 4, weak provenance |

**Analysis.**

- Source fact: every locally stored Tier-1 table gives available P ≈ 0.5 kg/t (or less)
  for average/6% cattle slurry. The Green Book reaches 0.6 kg/t only at 8% DM (Table 9-8:
  7/11 = 0.64, 13/22 = 0.59, 20/33 = 0.61), and `CLM-OM-T2` reaches it only at 7% DM.
- Source fact: the same article's Table 2 gives 0.5 for the 6% typical row.
- Arithmetic (SYSTEM_INFERENCE): 0.5 × 9.09 = 4.5 and 0.6 × 9.09 = 5.5 units/1,000 gal;
  the printed "(5)" does not discriminate.
- Interpretation: the only 0.6 value comes from a single lower-tier source whose
  transcription is recorded in the repository as unreliable, and which disagrees with its
  own Table 2 and with the Green Book. Under the task hierarchy it cannot override Tier-1
  evidence. The apparent conflict is explained as either a transcription artefact or an
  internal inconsistency in that article; which one cannot be determined locally.
- Correction to the record: CONFLICTS.md previously said CONF-01 was "confirmed from a
  primary read". That contradicted SOURCES_AND_CLAIMS §1 (no Campaign C retrieval) and
  the `nutrients.ts` note; it is corrected to REPO_QUOTATION.

**Classification: RESOLVED_WITH_SCOPE.**

**Rule text to freeze on ratification (`SLC-V1-P-LESS-6`):**
> For cattle slurry applied by LESS in spring at a lab DM of exactly 6% ("typical"),
> available P is 0.5 kg P/m³ as applied on the Index 3/4 basis (0.25 kg P/m³ at P Index
> 1/2 under `CLM-GB-9-8-FN3` / `CLM-OM-T2-NOTE`). 0.6 kg P/m³ is the 7% DM ("thicker")
> row value and is not used for the 6% row. `CLM-D26-T1`'s 0.6 for "typical" slurry is
> not adopted.

Scope: spring, LESS, cattle slurry, 6% row only. The 2/4/7% rows were never in conflict.
Reopen if an authorised retrieval shows Teagasc explicitly revising typical-slurry
available P to 0.6.

**Production effect (not implemented).** None required: `SPRING_LESS_SLURRY_TABLE`
(6% row) and `SUMMER_LESS_SLURRY_TABLE` already use 0.5. That agreement is not evidence
for the adjudication. Reference case CC-013 would drop CONF-01 from `blockingItems` and
the P0.6 alternative reading; it remains EVIDENCE_CONFLICT through CONF-02 and GAP-01.

---

## CONF-02 — 90 kg K/ha spring/closing limit and slurry K on first cut

**Proposition.** Does the Green Book's 90 kg/ha K spring/closing limit apply to
available K supplied by cattle slurry for first-cut silage?

**Evidence for "applies to all available K, including slurry"**

- GB §14.2 (PDF p.88), LOCAL_PRIMARY: "Table 14-2 gives the available K required for
  silage and hay crops i.e. K applied both as chemical and organic fertilizers." The next
  paragraph: "Luxury amounts of K may be taken up by grass where more than 90 kg/ha K are
  applied … Where more than 90 kg/ha is advised; only 90 kg should be applied in spring,
  and the remainder to the aftermath or in late autumn." (`CLM-GB-14-INTRO`,
  `CLM-GB-14-TXT`.)
- GB Table 14-2 fn4 (PDF p.89), LOCAL_PRIMARY: "Typically no more than 90 kg/ha K should
  be applied at closing for silage and the remainder … at least 3 months in advance or
  after silage harvest."
- The stated reason (luxury uptake, K:Mg:Na balance) is physiological and names no
  source type. Reading it as source-independent is SYSTEM_INFERENCE.

**Evidence against / in tension**

- GB Table 14-3 and text (PDF p.89), LOCAL_PRIMARY: chemical K for first cut "on the
  assumption that a typical application of 33 t/ha of slurry is applied to the silage
  ground": Index 1 79, 2 49, 3 10, 4 0. Locally verified arithmetic: Index 1/2
  185 − 79 = 155 − 49 = 106 ≈ 33 × 3.2 = 105.6; Index 3 125 − 10 = 115 ≈ 33 × 3.5 =
  115.5. The Green Book's own worked example therefore credits 106–116 kg/ha slurry K to
  the first cut. It does not state when the slurry is applied relative to closing.
- `CLM-SP07-PK`, `CLM-D26-33` (REPO_QUOTATION, Tier 4): slurry can supply most or all of
  first-cut P and K.

**Analysis.** The conflict is internal to one Tier-1 document. Three readings are
possible: (a) the limit covers all K applied at closing, so the 33 t/ha example assumes
slurry spread ≥ 3 months before closing or the example conflicts with fn4; (b) the limit
is meant for chemical K only; (c) the example deliberately exceeds 90 kg because slurry K
is treated differently. The documents state none of these. The §14.2 wording ("K applied
both as chemical and organic") leans towards (a) but does not say the 90 kg paragraph
inherits that scope, and Table 14-3 fn1/fn4 do not mention the limit. Choosing a reading
would invent an agronomic rule (STOP 4).

**Classification: UNRESOLVED_CONFLICT.** No rule text is frozen.

**Evidence still required.** An identified Teagasc/agronomist statement, or an
authoritative Teagasc source, stating (1) whether available K from cattle slurry applied
in spring before first cut counts toward the 90 kg/ha spring/closing ceiling, and (2)
the timing assumed for the 33 t/ha slurry in Table 14-3.

**Production effect (later).** Reading B of CC-001, CC-002, CC-004, CC-006, CC-007,
CC-007B, CC-013 and CC-018A/B, and any future K-limited rate. Current production has no
rate engine; nothing to change now.

---

## CONF-03 — organic P/K on Index 1/2: availability factor, share cap, or both

**Proposition.** On P or K Index 1/2, are (i) the P 50% / K 90% availability factors and
(ii) the organic-manure share-of-requirement limits (P 50%, K 75% of crop requirement)
cumulative, alternative, context-specific, or not reconcilable?

**Evidence for (i) availability factors**

- GB Table 9-8 fn3 (PDF p.48), LOCAL_PRIMARY: "where slurry is applied to low P and K
  fertility soils (Index 1 and 2) the P fertilizer replacement value can be assumed to
  be 50% and K … 90% and application rates should be adjusted accordingly."
- GB Table 9-3 (PDF p.44), LOCAL_PRIMARY: P 0.3, K 3.2 kg/t (≈ 0.5 / 0.9 × Table 9-4).
- GB §9.11 (PDF p.49), LOCAL_PRIMARY: the NAP 50% P replacement value on Index 1/2 exists
  "to facilitate better utilization and distribution of organic manure P (and K)
  resources across the farm" and to avoid over-estimating manure value (`CLM-GB-9-11-TXT`).
  This is regulatory context (Campaign B ledger), not an agronomic cap.
- `CLM-OM-T2-NOTE` (REPO_QUOTATION): reduce P by 50% and K by 10%.

**Evidence for (ii) share caps**

- `CLM-OM-PROSE-PK` only (REPO_QUOTATION of the undated Organic Manures web page; exact
  wording flagged in SOURCES_AND_CLAIMS as requiring re-verification). No locally stored
  Tier-1 source states a share-of-requirement cap. The Green Book text contains none.

**Analysis.** (i) is LOCAL_PRIMARY, consistent across three sources, and remains frozen
as the v1 supply rule. (ii) exists only as a non-retained quotation; its exact wording,
and whether it limits total or available nutrient, cannot be checked. The P sentence may
restate (i); the K 75% share would compound with the 90% factor if both applied. Whether
the rules are cumulative, alternative or context-specific cannot be determined, and the
lower-tier quotation must not be silently discarded or silently applied.

**Classification: INSUFFICIENT_EVIDENCE** (for the relationship). The availability-factor
component stays frozen as before; no share cap is frozen.

**Evidence still required.** Authorised retrieval of the Teagasc Organic Manures page
recording the exact P/K share wording, plus an identified reviewer statement on whether
the share limits apply in addition to, instead of, or independently from the 50%/90%
availability factors, and whether they are expressed in total or available nutrient.

**Production effect (later).** Reading C of CC-002, CC-004, CC-018A; any future
low-index rate. The CC-B2 LESS factors are unaffected.

---

## CONF-04 — where spring starts for LESS availability

**Proposition.** Does a January application receive the spring LESS availability values?

**Evidence**

- `CLM-CN-2016` (REPO_QUOTATION in `slurry-timing.ts`): "Spring Jan – April". Registered in
  SOURCES_AND_CLAIMS §1 as **non-authoritative for nutrient availability** (GHG-tool
  timing convention).
- `CLM-SP07-TIMING` (REPO_QUOTATION, UNVERIFIED_EXTERNAL): favours February–April.
- `CLM-GB-9-2` (LOCAL_PRIMARY): "spring" NFRV with no months.

**Analysis.** There is no conflict between two authoritative statements: the only source
placing January in "spring" is registered as non-authoritative for availability.
No authoritative source assigns spring availability to January. Excluding January asserts
nothing about January slurry's actual availability; it declines to assign one.

**Classification: RESOLVED_WITH_SCOPE.**

**Current status (2026-09-29, aligned with [AI_ADJUDICATION_2026-09-29.md](AI_ADJUDICATION_2026-09-29.md)):**
RESOLVED_WITH_SCOPE. Scientific conclusion: Campaign C v1 uses a February–April spring
nutrient-value class. Scope limitation: this does not mean January slurry application is
universally agronomically invalid. Production evidence status: the February-start boundary
remains IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION unless/until the supporting authoritative
source evidence (`CLM-SP07-TIMING`, `SRC-SP07`) is stored and traceable in the repository.
Expert validation: pending. The "on ratification" wording below is HISTORICAL.

**Rule text (`SLC-V1-TIMING-SPRING`; HISTORICAL heading: "to freeze on ratification"):**
> v1 spring LESS availability values apply only to planned applications dated
> 1 February to 30 April inclusive. A planned application in January is OUT_OF_SCOPE for
> v1 (no authoritative evidence assigns spring availability to January). Statutory closed
> periods remain a separate Campaign B legal gate.

**Production effect (not implemented).** Replacement of `classifySlurryTiming` for
Campaign C (RISK-03). Reference case CC-012B would move from EVIDENCE_CONFLICT (CONF-04)
to OUT_OF_SCOPE with no blocking item.

---

## GAP-01 — deterministic slurry rate rule

**Proposition.** Does evidence support a deterministic rule for selecting a slurry rate
from crop P/K requirement (e.g. "largest rate not exceeding remaining P or K")?

**Evidence**

- `CLM-OM-RATE` (REPO_QUOTATION): base the rate on crop P and K needs; do not exceed crop
  demand. A principle, not an algorithm.
- GB §14.2, Table 14-1 fn3, Table 14-3 fn1 (LOCAL_PRIMARY): chemical K is derived by
  deducting organic K *given* a slurry rate. The direction is slurry rate → chemical
  top-up, not requirement → slurry rate. Table 14-3 uses a fixed "typical" 33 t/ha.
- GB Table 9-4 fn2 (LOCAL_PRIMARY): P Index 4 exclusion depends on whole-farm context.

**Analysis.** No source selects a rate. "Largest rate not exceeding P or K" is
SYSTEM_INFERENCE. The sub-questions (K Index 4 in year of sampling, CC-005; slurry for N
alone, CC-016; tolerable excess, CC-017) have no evidence.

**Classification: INSUFFICIENT_EVIDENCE.** No rule text is frozen; every rate stays at
most EXPERT_REVIEW_REQUIRED.

**Evidence still required.** An identified agronomic reviewer's statement of the rate
objective (binding nutrient, permitted excess, treatment of zero-requirement nutrients),
recorded as a claim, or a Teagasc source stating one.

---

## GAP-02 to GAP-08 — does existing evidence already close them?

| Item | Repository evidence reviewed | Finding | Classification |
|---|---|---|---|
| GAP-02 DM points vs classes | `CLM-OM-T2` (4 labelled rows); GB Tables 9-3/9-4 fn1 (average; "testing … advised"); GB Table 9-8 (4/6/8/10% grid, no interpolation instruction) | No rule for DM between points or for mapping 6.3% to the 6% row | INSUFFICIENT_EVIDENCE |
| GAP-03 yield range | GB Table 13-4 fn2, Table 14-2 fn1 (linear per-t adjustment, no range) | No range stated | INSUFFICIENT_EVIDENCE |
| GAP-04 mixed indices | GB §9.7 text and Table 9-3 title are joint ("P and K Index (1 or 2)"); Table 9-8 fn3 and `CLM-OM-T2-NOTE` state P and K separately; NAP P FRV keyed to P Index only (regulatory) | Joint vs per-nutrient reading not settled | INSUFFICIENT_EVIDENCE |
| GAP-05 DM evidence class | `CLM-SP07-T1` hydrometer mention (REPO_QUOTATION); no calibration in repository | No calibration evidence | INSUFFICIENT_EVIDENCE |
| GAP-06 defaults for unknowns | GB Tables 9-3/9-4 publish average-composition values | The source value exists; using it as a default for missing data is FARM_RETURN_POLICY needing reviewer and product-owner decision | INSUFFICIENT_EVIDENCE |
| GAP-07 sward scope | GB Table 12-6 note (20% clover), Table 12-7 fn3 | "PRG-dominant" undefined; < 4-year swards ambiguous | INSUFFICIENT_EVIDENCE |
| GAP-08 crediting window | GB Table 14-2 fn4, Table 12-7 fn2 | No window defined | INSUFFICIENT_EVIDENCE |

None is closed. GAP-02 remains core for any DM other than exactly 2, 4, 6 or 7%.

## Approval gate

HISTORICAL (repository-only outcome; superseded by
[AI_ADJUDICATION_2026-09-29.md](AI_ADJUDICATION_2026-09-29.md), where CC-B1 is
AI_ADJUDICATED_EXPERT_VALIDATION_PENDING and production changes are evidence-gated).
At the time: Campaign C cannot move beyond DRAFT: CONF-02, CONF-03 and GAP-01 are unresolved core
items, CONF-01/CONF-04 adjudications await SOURCES_AND_CLAIMS §4 re-verification and
reviewer ratification, and GAP-02..08 remain open. CC-B1 stays open (BLOCKED_HUMAN),
narrowed to the evidence requests above.
