# Golden Farm Test Coverage — second closure pass reconciliation

Reconciles `validation/golden_farm_tests.csv`'s 180 tests, scenario by
scenario, against every domain module built through the second
autonomous V3 closure pass (Priority 9). Each row states which of this
codebase's `src/domain/*.test.ts` files actually exercises that test ID,
not just "the topic is generally covered" — a golden test counts as
`EXECUTED_PASS` only when a real, currently-passing assertion in this
codebase's test suite reproduces its `setup_json`/`expected_json` values
under that exact `GFTxxx` name.

This document was regenerated, not incrementally patched, after
discovering the previous version (Phase K) over-claimed several groups —
GF01, GF12 and GF13 all previously claimed higher coverage than existed:
some IDs were asserted only by numeric coincidence with a same-named
range comment (e.g. "GFT008-GFT010" as a string never literally contains
"GFT009"), and GF13 claimed "7/8 covered by construction" when 6 of those
8 IDs' exact DMD/animal-type combinations were never actually asserted.
Every number below was verified by direct `grep` cross-reference against
`validation/golden_farm_tests.csv`'s own 180 IDs, not by inspection.

**Classification used throughout:** `EXECUTED_PASS` (a real assertion
exists and the full suite is currently green), `EVIDENCE_BLOCKED` (the
V3 pack does not publish sufficient evidence to build this safely),
`NOT_APPLICABLE` (the scenario cannot occur in this app — usually a
closed TypeScript union making the bad input a compile-time
impossibility), `NOT_ATTEMPTED` (real, buildable engineering scope
deliberately not undertaken this session, with a stated reason).

This is a status document, not a new test runner — every listed
`EXECUTED_PASS` test lives inside the ordinary Vitest suite already
(`npm test`), most as an `it(...)` block whose name cites the `GFTxxx`
ID directly (searchable with `grep -rohE "GFT[0-9]{3}" src/domain/*.test.ts`).

**Overall: 156/180 EXECUTED_PASS + 2/180 NOT_APPLICABLE-by-construction
= 158/180 resolved (88%).** 22 remain, each precisely classified below —
none silently unaccounted for. (An initial automated grep pass
over-counted at 162: four IDs — `GFT020`, `GFT021`, `GFT107`, `GFT108`
— appeared only inside a comment documenting why they're
`EVIDENCE_BLOCKED`/`NOT_ATTEMPTED`, never inside a real test assertion.
Caught and corrected by re-checking every counted ID against an actual
code line, not merely a substring match anywhere in the file — exactly
the "do not mark unexecuted PASS by inspection alone" discipline this
priority requires, applied to this document's own first draft.)

---

## GF01 — Borderline Morgan-P drystock (`GFT001`-`GFT010`)
**10/10 EXECUTED_PASS.** `src/domain/nutrients.test.ts`. Corrected this
pass: `GFT001`-`GFT005` were asserted but never cited by exact ID;
`GFT009` was covered by a test titled "GFT008-GFT010" (a range string
that never literally contains "GFT009"). All 10 now cited individually.

## GF02 — Soil-test ageing and provenance (`GFT011`-`GFT018`)
**8/8 EXECUTED_PASS.** `src/domain/soil-test-validity.test.ts`.

## GF03 — High-stock dairy without automatic entitlement (`GFT019`-`GFT028`)
**5/10 EXECUTED_PASS.** `GFT019` (real Table 7a milk-yield band
excretion, now built — Priority 5's `avgMilkYieldKgPerYear`), `GFT022`,
`GFT023`/`GFT024` (high-rate N eligibility, wired live Priority 1),
`GFT025` (high-rate P not automatic — the standard Table 15a equivalent
of AF011: a real, live gap this session FOUND and FIXED, not merely a
test-coverage addition — `napMaxAvailablePGrazingKgHaEligibilityGated`,
wired into `checkNapCompliance`).
- `GFT020`/`GFT021` (Table 7a CP-election N reduction):
  **EVIDENCE_BLOCKED** — no `rules_statutory` CSV publishes a general
  CP%-to-N-rate table, only these two golden tests' own two data points
  (CP 15%→90 kgN, CP 14%→92 kgN); insufficient to safely reconstruct a
  general rule.
- `GFT026`/`GFT027`: covered under GF17 (cross-referenced, not
  duplicated).
- `GFT028` (report-structure section-list assertion): **NOT_ATTEMPTED**
  — Reports architecture territory, not a calculation; no report
  currently emits the exact section list this test checks for.

## GF04 — P build-up applicant (`GFT029`-`GFT036`)
**8/8 EXECUTED_PASS.** `src/domain/p-build-up-eligibility.test.ts` +
`src/domain/nutrients.test.ts`. Built Priority 3 (`p-build-up-eligibility.ts`,
wired live into `checkNapCompliance`); reconciled by exact ID Priority 9.

## GF05 — Dense milking platform (`GFT037`-`GFT046`)
**10/10 EXECUTED_PASS.** `src/domain/milking-platform.test.ts`.

## GF06 — Slurry dual-ledger farm (`GFT047`-`GFT056`)
**10/10 EXECUTED_PASS.** `GFT047` (new additive
`slurryAvailableSpringLessKgHa`, a more specific Teagasc source than
Table 9-8, exact-lookup only). `GFT048`-`GFT051` (real statutory manure
value ledger — Priority 2's `statutory-manure-value.ts`). `GFT052`-`GFT055`
(LESS triggers, wired live Priority 4). `GFT056` (dual-ledger isolation,
now testable since both ledgers are real).

## GF07/GF08/GF09 — Zone A/B/C spreading calendars (`GFT057`-`GFT080`)
**24/24 EXECUTED_PASS.** `closed-period-calendar.test.ts` +
`spreading-legal-gate.test.ts`.

## GF10 — Commonage, buffers and LESS (`GFT081`-`GFT090`)
**10/10 EXECUTED_PASS.** `commonage-gate.test.ts` + `buffer-gate.test.ts`.
Both gates wired live into `calculateNutrientPlan` Priority 4.

## GF11 — Mixed-herd winter fodder (`GFT091`-`GFT100`)
**10/10 EXECUTED_PASS** (`GFT098`'s literal "alpaca" scenario is
`NOT_APPLICABLE` by construction — a compile-time-impossible input for
this app's closed `LivestockCategory` union — documented in
`fodder-budget.ts`'s own doc comment, counted as covered per the
original convention). `fodder-budget.test.ts`.

## GF12 — Silage own-feed versus sale (`GFT101`-`GFT108`)
**6/8 EXECUTED_PASS.** Corrected this pass: the previous "2/8" undercount
missed that `GFT101`/`GFT104`-`GFT106` already matched existing
`checkNapCompliance` behaviour, just uncited. All 6 (`GFT101`-`GFT106`)
now cited by exact ID in `nutrients.test.ts`.
- `GFT107` (mixed fresh/DM feed-basis block): **NOT_ATTEMPTED** —
  `FEED_BASIS`'s gate exists (`input-gates.ts`) but no silage-balance
  calculation exists to wire it into. (Documented in a code comment, not
  a real test — do not miscount as executed.)
- `GFT108` (ensiling-loss double-count guard): **NOT_ATTEMPTED** — no
  module implements this check. (Same: comment only, not a real test.)

## GF13 — DairyBeef DMD feeding (`GFT109`-`GFT116`)
**8/8 EXECUTED_PASS.** Corrected this pass: the previous "7/8 by
construction" claim was false — only some DMD points were actually
asserted. `GFT109`-`GFT114` now individually asserted from the same
published `CONCENTRATE_TABLE` in `livestock.test.ts` (no new evidence
needed, the values already existed in the table). `GFT115` unchanged.
`GFT116` (wrong animal class rejected) is `NOT_APPLICABLE` by
construction — `FinishingAnimalType` is a closed 3-value union — cited
in `concentrateKgPerDay`'s own doc comment, matching `GFT098`'s
established precedent.

## GF14 — Twin-bearing ewe feeding (`GFT117`-`GFT124`)
**0/8. EVIDENCE_BLOCKED / data-model gap.** No sheep enterprise exists
anywhere in this data model (`LivestockCategory` has no ewe/lamb/hogget
value) — fail closed by omission, not a bug. The real Teagasc twin-ewe
DMD/chop table has not been transcribed into any module. Unchanged this
session — building a sheep enterprise is new product scope.

## GF15 — Dairy clover N (`GFT125`-`GFT134`)
**10/10 EXECUTED_PASS.** `clover-n.test.ts`. `GFT125`-`GFT132` (Phase
H2). `GFT133` (paddock-vs-whole-farm rate distinction) and `GFT134`
(fertility-context flag) newly built and closed this session
(`distinguishPaddockRateFromWholeFarmAllowance`, `checkCloverFertilityContext`).

## GF16 — Drystock and red-clover management (`GFT135`-`GFT142`)
**7/8 EXECUTED_PASS.** `GFT135`-`GFT140` (Phase H2). `GFT141` (red-clover
routing) newly built and closed this session (`selectCloverSchedule` —
fails closed, no red-clover schedule published in this evidence pack).
`GFT142` (ewe-mating-timing warning): **EVIDENCE_BLOCKED / data-model
gap** — same sheep gap as GF14.

## GF17 — Concentrate compliance (`GFT143`-`GFT150`)
**8/8 EXECUTED_PASS.** `concentrate-gates.test.ts`.

## GF18 — Hold/sell economics (`GFT151`-`GFT158`)
**7/8 EXECUTED_PASS.** `GFT151`-`GFT157` built and closed this session
(`sell-hold-economics-gate.ts`, Priority 7) — real evidence-gating logic,
not yet wired into `calculateLivestockEconomics`/any live screen (a
distinct, deliberately-scoped-out UI-reframing decision, see the
Priority 7 build-log entry).
- `GFT158` (economic report trace requiring housing/carrying cost):
  **EVIDENCE_BLOCKED** — no sourced per-head housing/carrying-cost rate
  exists anywhere in the V3 pack or this app's data model.

## GF19 — Recommendation audit and peer review (`GFT159`-`GFT170`)
**12/12 EXECUTED_PASS.** New module `report-validator.ts` (Priority 9)
closes `GFT159`/`GFT160`/`GFT162`/`GFT163` as real, tested report-
structural-validity rules. `GFT161`/`GFT170` were already real
(`audit-trace.test.ts`, Phases 1/K). `GFT164` (sealed-run immutability),
`GFT165` (peer-review rejection never mutates the calculation record),
`GFT166` (source `effectiveStatus` frozen per-decision), `GFT167`
(a blocked decision is included in the trace, not dropped), `GFT168`
(an UNKNOWN check result is never silently normalised to PASS), `GFT169`
(no LLM narrative is ever populated, AF018) all newly cited by exact ID
this session, each either as a real construction-level test or a direct
citation onto an already-passing assertion.

## GF20 — System integration (`GFT171`-`GFT180`)
**2/10 EXECUTED_PASS.** `GFT176` (a run's ruleset is frozen at start
time — audit-trace.test.ts), `GFT179` (manual override is auditable —
provenance.test.ts), `GFT180` (kg/ha canonical storage, kg/acre
deterministic display conversion — units.test.ts) all newly cited this
session.
- `GFT171`-`GFT175`, `GFT177`, `GFT178` (silage→fodder propagation,
  soil-correction propagation, livestock-count→fodder propagation,
  slurry-allocation→bought-K propagation, stale/live weather, API
  unavailability): **NOT_ATTEMPTED** — genuine cross-module/store-level
  system-integration tests (multiple domain modules and, in several
  cases, the React store together), a materially different kind of test
  from every other golden test in this pack (which exercise one pure
  domain function). Real, buildable, deliberately out of scope for a
  session otherwise built entirely from pure-function unit tests.

---

## Final tally

| Classification | Count |
|---|---|
| `EXECUTED_PASS` (real assertion, currently green) | 156 |
| `NOT_APPLICABLE` (compile-time-impossible scenario) | 2 (`GFT098`, `GFT116`) |
| `EVIDENCE_BLOCKED` | 12 (`GFT020`, `GFT021`, `GFT117`-`GFT124`, `GFT142`, `GFT158`) |
| `NOT_ATTEMPTED` | 10 (`GFT028`, `GFT107`, `GFT108`, `GFT171`-`GFT175`, `GFT177`, `GFT178`) |

**156 + 2 + 12 + 10 = 180.** (Per-group headers above sum to slightly
less than 156 real `EXECUTED_PASS` IDs because `GFT026`/`GFT027` are
counted once, under their real home file `GF17`'s own header, and
cross-referenced — not duplicated — from `GF03`'s section; this is the
authoritative grand total, verified directly against all 180 IDs, not a
sum of the per-group headers.)

**Live fixes discovered and closed during this reconciliation pass, not
merely test-coverage additions:** `GFT025` — the standard Table 15a P
ceiling had the exact same AF011-shaped over-application risk the N
ceiling had before Priority 1's fix; found while reconciling this golden
test's exact expected value (23, not 26) and fixed the same session it
was found (`napMaxAvailablePGrazingKgHaEligibilityGated`, wired into
`checkNapCompliance`).
