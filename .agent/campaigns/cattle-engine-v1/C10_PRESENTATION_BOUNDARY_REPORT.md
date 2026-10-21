# C10 — presentation-boundary repair: pre-audit report (2026-10-21)

## Status

**`READY_FOR_FINAL_AUDIT — CODEX NOT RUN`**

- Candidate `2c23760` passes all deterministic verification, including the full quality gate run on that exact SHA (below).
- Codex was not used at any point in this task. The one independent strict audit is deferred until Codex quota is available.
- C10 is not frozen, closed or accepted. There is no receipt, nothing was pushed, and no phase or campaign was started.

## Repository

| | |
|---|---|
| Branch | `campaign-cattle-engine-v1` |
| Starting SHA | `733366c` (report only; the previous candidate `0e89336` failed audit 75774) |
| Audit-evidence commit | `9f6faf8` (docs only) |
| Implementation commit, the final candidate | **`2c23760`** |
| Final HEAD | the commit that adds this report (documentation only) |
| Working tree | clean |
| Pushed | no |

## Failed audit preservation

| | |
|---|---|
| Audit ID | `audit-20261021T160122Z-75774` |
| Kind | strict, run against candidate `0e89336` (range `6e81831..0e89336`) |
| Result | 0 Critical / **3 High** / 0 Medium / 0 Low — **FAILED · NOT ACCEPTED · NOT FROZEN** |
| Findings (verbatim) | `audits/audit-20261021T160122Z-75774.md` |
| Prompt (verbatim) | `audits/audit-20261021T160122Z-75774.prompt` |
| Status record | `audits/audit-20261021T160122Z-75774.status.md` — status, sha256 of all three files, raw-log location |
| Raw log | `.agent/history/audit-20261021T160122Z-75774.raw.log` (1.1 MB). Kept local only, because campaign convention gitignores raw logs. |

## Presentation architecture

**The rule.** Farmer-facing cattle components never interpret any of these distinctions:
- domain absence;
- failure;
- uncertainty;
- provenance;
- empty vs unavailable;
- measured vs estimated;
- observed vs assumed or projected.

Each is decided in `src/domain/cattle/presentation` and reaches the component as an explicit state with its own wording.

**Admitted state types** (`view-state.ts`):

| Type | Shape and meaning |
|---|---|
| `Listing<T>` | `ITEMS { items: NonEmpty<T> }`, `EMPTY { display }` or `UNAVAILABLE { display }`. A component never counts items or writes "no …". Known-empty wording lives only in `EMPTY_DISPLAY`; unavailable wording only in `UNAVAILABLE_DISPLAY`. |
| `Details<T>` | An explanatory list, such as evidence lines, sources or record ids. It is declared by the presentation layer as "empty means nothing further to show", never as a claim that none exist. |
| `SealedInput<T>` | Owner reads that the plan economics need. The plan component passes them to `planScreenView` without reading them. |
| `WeightChartVM` | See the F005 section. |
| `LatestWeightVM` with `basis` | See the F013 section. |
| `PlanScreenVM` | Every figure is a KNOWN cell or "Unknown — why". The assumption, fixture and estimate marks are already decided. |

**Mechanical enforcement.** `src/components/cattle/component-boundary.test.ts` runs the TypeScript checker over every exported component in `src/components/cattle`:

| Rule | What it forbids |
|---|---|
| R1 | Any plain, possibly empty array, or any nullable non-text value, anywhere in a prop type declared in `src/domain` or `src/server`. Index signatures are included; sealed inputs are not walked. |
| R2 | Importing the domain other than through `@/domain/cattle/presentation`. |
| R3 | Any read of a sealed input, and any `unseal` call. |
| R4 | Fallback text written by the component (`?? "…"`, `\|\| "…"`). |
| R5 | Any emptiness test on a domain collection. |
| R6 | Absence wording written by the component, outside a reviewed allowlist of 13 UI-copy strings, each with a recorded reason. |

Each rule is first proven on planted fixtures. They include the exact shipped F005 bypass: a naked point array, `points.length === 0`, then "No weights recorded yet — nothing to chart.". R1, R5 and R6 all fire on it.

## F005 result: the weight chart

| Case | Chart state | What the farmer sees |
|---|---|---|
| Real weight history | `CHART` | Points and line. "Weighed" appears in the key only when a measured point exists; estimates are drawn hollow. |
| Genuinely no weights (C4 has no observation in view and C5 has no point) | `EMPTY` | "No weights recorded yet." (1442) |
| Unsupported weight evidence (a pound-unit record) | `NOT_CHARTABLE` | "Weight history can't be charted yet", with "One or more records use a weight unit Farm Return can't currently convert to kilograms." The records are listed (date, method, "Unit not supported"). |
| Conflict, kilograms | `CHART` | Both candidates drawn with "Weights disagree" ("498 kg or 512 kg"); never averaged. |
| Conflict, all unsupported | `NOT_CHARTABLE` | Listed as "Weights disagree". |
| Plottable and unsupported mixed | `CHART` | Adds "1 record isn't charted — in a weight unit Farm Return can't currently convert to kilograms." |
| C4 or C5 evaluation failed, or C4 and C5 disagree | `UNAVAILABLE` | "Weight history couldn't be read". |

No state except `EMPTY` ever says "no weights". This is tested on the view model and on the rendered chart and profile.

The record-weight sheet's distinctions are kept:
- "Last recorded …";
- "No earlier weight recorded.";
- "Previous weight couldn't be determined — records disagree (…)";
- "Previous weight couldn't be used — it's in a unit…";
- "Previous weight couldn't be checked."

## Housing mapping

From the C1 location kind only (`LOCATION_KIND_HOUSING` and `housingObservationOf`):

| Location kind | Housing state |
|---|---|
| HOUSING | housed |
| FIELD | outdoors |
| HOLDING | unknown (`LOCATION_NOT_SPECIFIC`) |
| EXTERNAL | unknown (`LOCATION_NOT_SPECIFIC`) |
| OTHER | unknown (`LOCATION_NOT_SPECIFIC`) |
| missing, disputed, unreadable or unavailable | unknown, each with its own reason |
| an unlisted kind | unknown (`RECORD_INVALID`) |

Nothing is inferred from refs, labels or farming practice.

**Effect on plan economics.** Unknown, with no farmer assumption, blocks every housing-dependent figure: housed and outdoor days, housing cost, holding cost, total cost by sale, projected direct profit, return from holding and cost per kg at sale. Each shows "Unknown — the animal's current housing status isn't known". The housing note says why, for example "isn't shown by its recorded location — a holding, off-farm or other location doesn't say whether it's housed", and offers the assumption control.

**With an explicit assumption** ("Housed now" or "Outdoors now"):
- the figures compute and each one is marked "Assumed housing";
- the record and the sealed observed state stay unknown;
- removing the assumption blocks the figures again.

All of this is tested through a rebuilt C1 ledger and snapshot for each kind. It was also checked in the browser (1433: blocked, then an assumed scenario).

## F013: weight measurement basis

**Source.** The frozen C4 output already carries the basis, so no C0–C9 amendment is needed. A KNOWN `latest` weight is exactly one record (`latest.recordIds[0]`), and that record's `WeightSeriesEntry` has `measurementBasis` (MEASURED / ESTIMATED / DERIVED / UNKNOWN) and `observation.method` (SCALE, WEIGHBRIDGE, ESTIMATE_TAPE, ESTIMATE_VISUAL, DERIVED_EXTERNAL, UNKNOWN).

**Propagation.** C4 entry → `latestWeightOf` (`basis: WeightBasisVM`) → `weightCaption` / `previousWeightLine` / `weightRowOf` / `weightRecordTitle` / `chartPointOf` → components. If the record can't be found, a KNOWN weight is UNAVAILABLE; it is never shown without its provenance.

**Labels:**

| Basis | Caption | Sheet line, herd row, timeline |
|---|---|---|
| Measured | "Weighed 1 Oct" | — |
| Tape estimate | "Tape estimate · 1 Oct" | "Last recorded 500 kg on 1 Oct (tape estimate).", "1 Oct · tape estimate", "Tape estimate 500 kg" |
| Visual estimate | "Visual estimate · 1 Oct" | same pattern |
| External figure | "External figure · 1 Oct" | same pattern |
| Method not recorded | "Method not recorded · 1 Oct" | same pattern |

- Chart points are solid only when measured.
- The plan says "Current weight 500 kg is a tape estimate (1 Oct), not a weighing…", and the mart estimate says when it is derived from an estimated weight.
- The C4 `KNOWN` display label is now basis-neutral ("Weight recorded").

**Unsupported, conflict and no weight** carry no basis and never read "Weighed". This is tested for all six methods, including rendered profiles.

## Provenance-loss sweep (bounded, C10 only)

| Area | Finding |
|---|---|
| Weight: measured vs estimated | Repaired (F013). |
| Weight: recorded vs projected | Kept. The prediction is drawn dashed and labelled; "Projected (prediction)" in the key; the plan row is marked a prediction. |
| Housing: observed vs assumed | Kept and tested. |
| Costs: direct vs allocated | Kept. Totals are shown separately; per category, "allocated" or "incl. € … allocated"; the timeline says "Allocated — basis". |
| Mart: fixture vs live | Status comes from the provider's `isLive`; a fixture always reads "Development fixture — not live, not a real mart report", with the fixture footnote on the headline. |
| Mart: observed vs derived | The basis line says "derived, not observed for this animal". An estimate-derived valuation is now named. |
| Dates: hard deadline vs window | Kept. "Must be done by" only for a C9 hard deadline; tested on 1452. |
| Work: obligation vs recommendation | Kept (origins, titles). |
| Completion: records vs override | **Repaired.** The timeline turned a farmer override into a plain "Marked done". One shared `completionBasisLabel` now feeds both the panel and the timeline. |
| No open work | **Repaired.** It was shown with a green "good" tone and now uses a neutral one; the detail says it "isn't a health or performance check". |
| Other repairs made along the way | The herd and group summaries and the "None recorded" cost label moved into presentation; an empty herd still lists its known-empty groups on group pages. |

No item needed new domain policy or a frozen-contract change.

## Previous invariants

| Invariant | Status |
|---|---|
| Numeric precision | 548.24 + 5 = 553.24 and 548.24 − 5 = 543.24 (rendered sheet tests, kept). The sheet and goal field start from exact canonical text (`weightEntryStart`, `planTargetText`). Plan steppers are exact (browser: 0.55 + 0.05 = 0.6). |
| Canonical plan timeline | `planScreenView` passes `economics.intervals` to `planTimeline`. The static rule forbids `daysBetween` outside `plan-intervals.ts`. The interval matrix is kept. |
| Save feedback | Unchanged. A refused save is always reported; tests kept. |
| Housing assumptions | Kept, and extended to the new reason. |
| Staleness | No C10 rule. The default C8 registry is unchanged; the test is kept. |
| Market mock truthfulness | Kept and tested. |
| Currency | Non-EUR aggregation remains unavailable. |
| C0–C9 | No file changed. |

## Self-review (no Codex)

All 16 questions are answered **no**:

| # | Question | Answer and evidence |
|---|---|---|
| 1 | Can a component infer known-empty from ambiguous absence? | No (R1, R5, R6). |
| 2 | Can a component receive a naked array where empty and unavailable could be confused? | No (R1). |
| 3 | Can a component receive `T \| null` or `T \| undefined` where nullability carries semantic uncertainty? | No. R1 forbids nullable non-text values; the nullable text that remains is always paired with an explicit state. |
| 4 | Can unsupported weight evidence become "no weights"? | No (chart matrix). |
| 5 | Can conflicting weight evidence become "no weights"? | No (chart matrix). |
| 6–8 | Can HOLDING, EXTERNAL or OTHER be treated as outdoors? | No (housing matrix). |
| 9 | Can an estimated weight be labelled "Weighed"? | No (basis matrix). |
| 10 | Can a projection be labelled as observed? | No. |
| 11 | Can a farmer assumption become recorded fact? | No (tested). |
| 12 | Can a mock mart value appear live? | No. |
| 13 | Can direct and allocated costs become indistinguishable? | No. |
| 14 | Can a recommended window become a hard deadline? | No. |
| 15 | Can display formatting mutate canonical numeric values? | No. |
| 16 | Can timeline and economics derive plan intervals separately? | No. |

## Tests

**New tests:**

| File | Tests | Covers |
|---|---|---|
| `component-boundary.test.ts` | 7 | R1–R6, plus the planted-fixture proof |
| `c10-presentation-boundary.test.tsx` | 45 | Chart 8-state matrix plus records list and rendered profile; housing 6 kinds × (observation, economics) plus conflict / invalid / unavailable plus assumptions on/off plus rendered plan; weight-basis 6 methods plus rendered estimates, plan and mart notes, sheet start, unresolved states; provenance sweep |

Existing suites were updated to the new shapes; no assertion was weakened. Wording assertions follow the deliberate label changes.

**Results on candidate `2c23760`:**

| Check | Result |
|---|---|
| Targeted presentation-boundary tests | 52 / 52 |
| Complete C10 suite (`cattle animal-plan src/components/shell`) | 31 files, 1,239 tests, all pass |
| Typecheck | clean |
| Lint | 0 errors (the 2 warnings were already there, in C8) |
| Full quality gate (`quality-20261021T170145Z-81849`, run on `2c23760`, HEAD unchanged afterwards) | **pass**: 317 files, 6,116 tests, plus typecheck, lint and build |
| Browser, demo routes | all routes 200; plan interaction checked; no console errors; no horizontal overflow |

## Codex

> **Codex usage during this task: ZERO.**

- No strict audit, no targeted audit, no pre-review and no Codex call of any kind.
- The final independent audit is intentionally deferred.

## Remaining work

The only next step: **run one independent strict C10 audit against `2c23760` when Codex quota is available.** Adoption and freezing still need their separately authorised infrastructure task.
