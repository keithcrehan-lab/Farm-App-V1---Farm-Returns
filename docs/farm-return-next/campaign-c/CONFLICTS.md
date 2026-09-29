# Campaign C — evidence conflicts and open scientific questions

Rule set `slurry-agronomy-ie-2026-v1` (DRAFT). Claims are in
[SOURCES_AND_CLAIMS.md](SOURCES_AND_CLAIMS.md). No conflict below has been
resolved by choosing a source. A newer publication does not supersede an older one
unless Teagasc says it does. **CONF-** items are disagreements between
authoritative statements. **GAP-** items are questions the evidence does not answer.
Both need scientific review. Items marked *core* block the v1 RATE rule.

The CC-B1 evidence adjudication (2026-09-29, base `0a92745`) is in
[ADJUDICATION_CC-B1.md](ADJUDICATION_CC-B1.md). An adjudicated item is an evidence-level
outcome only: it stays open for rule-set purposes until SOURCES_AND_CLAIMS §4
re-verification and an identified reviewer's ratification. The reference-case JSON is
unchanged until then.

| ID | Core? | Blocks | Status | CC-B1 classification |
|---|---|---|---|---|
| CONF-01 | yes (6% DM row) | P supply for typical slurry | ADJUDICATED (0.5 kg P/m³), pending ratification | RESOLVED_WITH_SCOPE |
| CONF-02 | **yes** | every K-limited rate | EVIDENCE_CONFLICT, expert review — **STOP 1/2** | UNRESOLVED_CONFLICT |
| CONF-03 | **yes** (Index 1/2) | rates on P/K Index 1–2 | EVIDENCE_CONFLICT, expert review — **STOP 1/2** | INSUFFICIENT_EVIDENCE |
| CONF-04 | no (boundary) | January applications | ADJUDICATED (January OUT_OF_SCOPE for v1), pending ratification | RESOLVED_WITH_SCOPE |
| GAP-01 | **yes** | every rate | EXPERT_REVIEW_REQUIRED — **STOP 8** | INSUFFICIENT_EVIDENCE |
| GAP-02 | yes | DM other than 2/4/6/7% | OUT_OF_SCOPE until reviewed | INSUFFICIENT_EVIDENCE |
| GAP-03 | no | yields other than 5.0 t DM/ha | EXPERT_REVIEW_REQUIRED | INSUFFICIENT_EVIDENCE |
| GAP-04 | no | fields where P and K indices fall in different bands | EXPERT_REVIEW_REQUIRED (per-nutrient reading used provisionally) | INSUFFICIENT_EVIDENCE |
| GAP-05 | no | DM from hydrometer or farmer estimate | EXPERT_REVIEW_REQUIRED | INSUFFICIENT_EVIDENCE |
| GAP-06 | no | unknown DM / unknown yield defaults | UNKNOWN_REQUIRED_DATA until reviewed | INSUFFICIENT_EVIDENCE |
| GAP-07 | no | sward definition, reseeds < 4 years | OUT_OF_SCOPE until reviewed | INSUFFICIENT_EVIDENCE |
| GAP-08 | no | crediting window for prior inputs | EXPERT_REVIEW_REQUIRED | INSUFFICIENT_EVIDENCE |
| NOTE-01 | no | — | reconcilable rounding, confirm | not reviewed by CC-B1 |

### CONF-01

**Spring LESS available P in typical cattle slurry: 0.5 or 0.6 kg/m³?**

- Source A: `CLM-OM-T2` (6% "typical" row, P 0.5), `CLM-OMPDF-CATTLE6` (2023, P 0.5),
  `CLM-SP07-T2` (2023, P 0.5), `CLM-D26-T2` (2026, Table 2, P 0.5), `CLM-GB-9-4`
  (2020, Index 3/4 average, P 0.5).
- Source B: `CLM-D26-T1` (2026-03-23, Table 1, spring and summer P 0.6 kg/m³, printed
  as "(5)" units/1,000 gal).
- Units kg/m³ as applied. DM: A is 6% (built from the 6.3% average, GAP-02). B is
  "typical", no DM stated. Yield not relevant. Timing spring (and summer in B).
  Method LESS. Crop: any grassland.
- Age: B is the newest (2026). Its own Table 2 repeats 0.5 for the 6% typical row.
- Reconcilable? Not from the documents. Table 1's N and K match the 6% row, not the
  7% row (P 0.6), so it is not the thicker slurry. "(5) units" is consistent with
  both 0.5 and 0.6 after rounding. The article's text calls it "good quality slurry".
  No source says 0.6 supersedes 0.5.
- Material: yes. In CC-013 the P-limited rate is 40.0 m³/ha at 0.5 and 33.3 m³/ha at
  0.6 (reading A: 35.7 vs 33.3).
- Expert review: required (Teagasc Signpost author). Until then the 6% row's P is
  EVIDENCE_CONFLICT. The 2, 4 and 7% rows are unaffected.
- Previously recorded (unconfirmed) in `nutrients.ts:703–721` and audit §12 item 7.
  *Corrected by CC-B1:* an earlier line here said "now confirmed from a primary read".
  No Campaign C retrieval occurred (SOURCES_AND_CLAIMS §1), and `nutrients.ts` records
  that transcriptions of Source B were inconsistent. Source B is a repository
  quotation only.
- **CC-B1: RESOLVED_WITH_SCOPE** (pending ratification). Green Book Tables 9-1, 9-4 and
  9-8 (locally stored) give ≈ 0.5 kg/t or less for average/6% slurry and reach 0.6 only
  at 7–8% DM. Source B cannot override them. Candidate rule `SLC-V1-P-LESS-6`: 6% DM
  spring LESS P = 0.5 kg/m³ (Index 3/4 basis).

### CONF-02

**Does the 90 kg/ha spring/closing K limit apply to slurry K on first-cut silage?**

- Source A: `CLM-GB-14-TXT` and `CLM-GB-14-2` fn4. Where more than 90 kg/ha K is
  advised, apply only 90 kg in spring. Typically no more than 90 kg/ha K at closing;
  the rest at least 3 months in advance or after harvest. Reason: luxury uptake and
  the K:Mg:Na balance.
- Source B: `CLM-GB-14-3` (same book). Chemical K advice where 33 t/ha slurry is
  applied to first cut (79/49/10/0), which implies 105.6–115.5 kg/ha slurry K at
  closing. `CLM-SP07-PK`: organic manure can supply *all* the P and K of silage
  crops. `CLM-D26-33`: 33 m³/ha supplies most of the first-cut P and K.
- Units kg/ha available K. DM: B assumes average or typical slurry. Yield 5 t DM/ha.
  Timing: spring/closing. Method: any (A), LESS (SP07/D26). Crop: first-cut silage.
- Age: A and part of B share one 2020 book. SP07 is 2023, D26 2026.
- Reconcilable? Possibly, if the 90 kg guidance is meant for chemical K only, or if
  Table 14-3's chemical K is meant to be applied away from closing. Neither document
  says so. Choosing either would be an assumption (STOP 8).
- Material: yes. CC-001 rate is 31.2 (reading A) vs 22.5 m³/ha (reading B). CC-004 is
  33.3 vs 25.0. CC-018A is 51.3 vs 25.0.
- Expert review: required. **STOP condition 1 and 2.**
- This is audit §12 item 1.
- **CC-B1: UNRESOLVED_CONFLICT.** The conflict is internal to the Green Book. §14.2
  (`CLM-GB-14-INTRO`) says Table 14-2 covers K "applied both as chemical and organic
  fertilizers", and the 90 kg paragraph follows. Table 14-3 still credits 106–116 kg/ha
  slurry K to the first cut and does not say when the slurry is spread. Evidence
  required: an authoritative statement whether spring slurry K counts toward the
  90 kg/ha ceiling, and the slurry timing assumed in Table 14-3.

### CONF-03

**Organic P and K on Index 1/2 soils: an availability factor, a share-of-requirement cap, or both?**

- Source A: availability factors. `CLM-GB-9-8-FN3` (P 50%, K 90%), `CLM-GB-9-3`
  (P 0.3, K 3.2 = about 0.5/0.9 × 9-4), `CLM-OM-T2-NOTE` (reduce P 50%, K 10%),
  `CLM-OMPDF-CATTLE6` fn5 (P 50%, no K note).
- Source B: `CLM-OM-PROSE-PK`, on the same page as A's note. P "deemed to be 50%
  available, therefore… only supply 50% of P crop requirement with organic
  fertilisers". K: "only 75% of the crop requirement should be applied as organic
  fertiliser" on Index 1/2.
- Units: A is a fraction of the nutrient applied. B is a fraction of the crop
  requirement. It is also unclear whether B's cap counts total or available nutrient.
- Reconcilable? A (applied at 50%/90%) and B's P sentence may describe the same
  thing. The K treatments differ (90% availability vs a 75% share cap), and applying
  both would compound. Not resolvable from the text.
- Material: yes, on Index 1/2. In CC-018A (P1/K1) reading A gives 51.3 m³/ha and
  reading C (share caps) 38.5 m³/ha. Not binding in CC-002 or CC-004.
- Expert review: required. **STOP condition 1** for the P/K Index 1 reference cases.
- The availability factors themselves (reading A) agree across three sources and are
  frozen as the v1 supply rule. Only the extra cap is in conflict.
- **CC-B1: INSUFFICIENT_EVIDENCE.** No locally stored Tier-1 source states a
  share-of-requirement cap. Green Book §9.11 (`CLM-GB-9-11-TXT`) explains the NAP 50%
  P value as a distribution measure, but that is regulatory context, not a cap. The cap
  exists only as the non-retained `CLM-OM-PROSE-PK` quotation. Its exact wording, and
  whether it limits total or available nutrient, cannot be checked. Evidence required:
  an authorised retrieval of the page's exact wording, plus a reviewer ruling on whether
  the caps are cumulative, alternative or context-specific.

### CONF-04

**Where does "spring" start for LESS availability?**

- Source A: `CLM-CN-2016` (Jan–Apr), used today by `classifySlurryTiming`.
- Source B: `CLM-SP07-TIMING` (February to April).
- `CLM-GB-9-2` (Lalor et al.) does not give months.
- v1 treatment, taking both sources rather than choosing one: 1 Feb–30 Apr is
  supported. January is EVIDENCE_CONFLICT (CC-012B). Closed periods remain a Campaign
  B legal gate, applied separately.
- Current code classifies January as SPRING (RISK-03).
- **CC-B1: RESOLVED_WITH_SCOPE** (pending ratification). Source A is registered as
  non-authoritative for nutrient availability, so no two authoritative sources
  disagree. No authoritative source assigns spring availability to January. Candidate
  rule `SLC-V1-TIMING-SPRING`: 1 Feb–30 Apr only. January is OUT_OF_SCOPE for v1.

### GAP-01

**Rate objective.** Teagasc says the slurry rate should be based on crop P and K needs
without excess (`CLM-OM-RATE`). No source gives an algorithm. The candidate
(reading A: largest rate that exceeds neither remaining P nor remaining K) is
`SYSTEM_INFERRED`. Unresolved sub-questions:

- May a K Index 4 field in the year of sampling receive slurry for its P need
  (CC-005)?
- Should slurry be proposed for N alone once P and K are met (CC-016)?
- How much excess, if any, is tolerable (CC-017, 7 kg K/ha)?

Every rate therefore stays at most EXPERT_REVIEW_REQUIRED. **STOP condition 8.**

**CC-B1: INSUFFICIENT_EVIDENCE.** Green Book §14.2 and the Table 14-1 fn3 and Table 14-3
fn1 notes derive *chemical* K from a given slurry rate. None of them selects a slurry
rate. Table 14-3 uses a fixed "typical" 33 t/ha. The candidate stays `SYSTEM_INFERRED`.

### GAP-02

**DM points vs classes.** `CLM-OM-T2` prints four rows labelled with descriptions
("very dilute", "watery", "typical", "thicker"). Nothing says whether they are
points or classes, or how to treat a measured DM between them. The 6% row is built
from the 6.3% survey average (`CLM-OMPDF-CATTLE6` fn1). v1 accepts only a measured
DM exactly equal to 2, 4, 6 or 7%. Anything between is OUT_OF_SCOPE (CC-010), and so
is anything outside 2–7% (CC-010B). There is no interpolation and no snapping.
Question for review: may a measured 6.3% use the "typical" row?

### GAP-03

**Yield adjustment range.** Tables 13-4 fn2 (±4 kg P/t DM) and 14-2 fn1 (±25 kg K/t DM)
give linear adjustments around 5 t DM/ha with no stated range. v1 supports a
declared 5.0 t DM/ha only. Other yields are EXPERT_REVIEW_REQUIRED until a range is
confirmed.

### GAP-04

**Mixed indices.** Table 9-3 is titled "low P and K Index (1 or 2)". Footnote 3 and
the Table 2 note state the P and K reductions separately. v1 applies the P factor by
P Index and the K factor by K Index (as `slurryAvailableKgHa` already does). This
needs confirmation.

### GAP-05

**DM evidence class.** v1 accepts `MEASURED_LAB` DM from a sample taken after the
latest fill reading. The hydrometer route (`CLM-SP07-T1` "use a hydrometer… using
Table 1 as a guide") and farmer-estimated DM have no calibration in evidence and are
EXPERT_REVIEW_REQUIRED. The sample-after-latest-fill rule is `FARM_RETURN_POLICY`,
following the Campaign B temporal pattern. It is not science.

### GAP-06

**Defaults for unknowns.** No national-average (6.3%) or "typical" (6%) DM and no
5 t DM/ha yield baseline are substituted for missing evidence. Both give
UNKNOWN_REQUIRED_DATA (CC-009). Question for review: may a disclosed
`STANDARD_TEAGASC_ESTIMATE` be allowed for either?

### GAP-07

**Sward scope.** No source defines "perennial ryegrass-dominant". v1 uses a declared
grass sward with clover below the Green Book's 20% "productive grass-clover"
threshold (Table 12-6 note, PDF p.74), and sward age of at least 4 years. Table 12-7
fn3's optional +25 kg N makes younger swards ambiguous. Clover-rich, multispecies and
red-clover swards are OUT_OF_SCOPE.

### GAP-08

**Prior-input crediting window.** Table 14-2 fn4 allows K "at least 3 months in
advance", so K applied the previous autumn may belong to this first cut. Table 12-7
fn2 credits 20% of early-grazing N. Neither source defines the window. The v1
proposal is `FARM_RETURN_POLICY` and needs confirmation. Credit known applications
made to the field after the previous season's last harvest or grazing and declared
for this crop. Credit early-grazing N at 20%. Do not credit residual N from
previous-season slurry. Treat anything unattested as UNKNOWN (CC-008).

### NOTE-01

Table 9-3 prints P 0.3 kg/t where 0.5 × 0.5 = 0.25, and K 3.2 where 3.5 × 0.9 = 3.15.
This is consistent with rounding to one decimal. v1 does not use Table 9-3 values: it
applies the factors to `CLM-OM-T2` rows. Reviewer to confirm.
