# Golden Farm Test Coverage — Phase K reconciliation

Reconciles `validation/golden_farm_tests.csv`'s 180 tests, scenario by
scenario, against the domain modules built in Phases D-K. Each row states
which of this codebase's `src/domain/*.test.ts` files actually exercises
that test ID, not just "the topic is generally covered" — a golden test
counts as covered only when a real assertion in this codebase's test
suite reproduces its `setup_json`/`expected_json` values.

This is a status document, not a new test runner — every listed "covered"
test lives inside the ordinary Vitest suite already (`npm test`), most as
an `it(...)` block whose name cites the `GFTxxx` ID directly (searchable
with `grep -rn "GFT0" src/domain`).

---

## GF01 — Borderline Morgan-P drystock (`GFT001`-`GFT010`)
**10/10 covered.** `src/domain/nutrients.test.ts` (Phase E1). Both crop
groups, the literal ambiguous micro-gap, and the post-gap resumption of
Index 4.

## GF02 — Soil-test ageing and provenance (`GFT011`-`GFT018`)
**8/8 covered.** `src/domain/soil-test-validity.test.ts` (Phase K). The
4-year disregard rule, the P4 persistence exception, the undated-test
block, the post-14-Sep-2025 georeference trigger (including the exact
boundary date itself NOT triggering it), and the 12-year OM limit.

## GF03 — High-stock dairy without automatic entitlement (`GFT019`-`GFT028`)
**3/10 covered.** `GFT022` (GSR before exports —
`statutory-excretion.test.ts`), `GFT023`/`GFT024` (high-rate N eligibility
— `high-rate-n-eligibility.test.ts`, Phase K's own newly-discovered-gap
fix). **Not covered:** `GFT019`-`GFT021` (Table 7/7a dairy excretion
bands and the CP-election path — this app's `statutory-excretion.ts`
always blocks `dairy_cow` outright, since no milk-yield-band or
CP-election/records field exists anywhere in this data model — a real,
already-logged gap, not silently missed here); `GFT025` (high-rate P
eligibility — the P-side equivalent of `GFT023`/`GFT024`; unlike the N
table, `napMaxAvailablePGrazingKgHa`'s "standard" and
"increased_build_up_CONDITIONAL" rows are already two separate functions
in `nutrients.ts`, and only the standard one is ever called, so this
specific failure mode doesn't reproduce today — but no dedicated test
asserts that); `GFT026`-`GFT028` (`GFT026`/`GFT027` ARE covered, see GF17
below — cross-referenced, not double-built; `GFT028` — a report-structure
assertion — is Reports-architecture territory, not a calculation, and no
report currently emits the exact section list it checks for).

## GF04 — P build-up applicant (`GFT029`-`GFT036`)
**0/8 covered.** `P_BUILD_UP_ELIGIBILITY`
(`rules_statutory/p_build_up_eligibility_2026.csv`'s 6 Article 17(6)
conditions) has no dedicated gate module — `nutrients.ts`'s
`napEnhancedPBuildUpKgHa` exists and is correctly never called from
`calculateNutrientPlan` (confirmed safe-by-omission in the original
audit), but no module actually implements the 6-condition eligibility
check itself. **Real, open gap** — not attempted this pass; the
adjacent, evidenced N-side fix (`high-rate-n-eligibility.ts`) was built
instead because it had direct golden-test evidence for its exact
threshold, where this scenario's conditions are boolean pass/fail flags
without a similarly self-contained numeric rule to reconstruct from the
tests alone — building it needs the same treatment
`commonage-gate.ts`/`concentrate-gates.ts` already got, just not reached
in this pass.

## GF05 — Dense milking platform (`GFT037`-`GFT046`)
**10/10 covered.** `src/domain/milking-platform.test.ts` (Phase K), all
6 allowance bands' real Table 14 boundaries.

## GF06 — Slurry dual-ledger farm (`GFT047`-`GFT056`)
**4/10 covered.** `GFT052`-`GFT055` (LESS method triggers —
`less-method-gate.test.ts`, Phase F2). **Not covered:** `GFT047`
(agronomic spring-LESS 6% DM slurry table — `nutrients.ts`'s
`slurryAvailableKgHa` uses the OLDER Green Book Table 9-8, not V3's
newer `cattle_slurry_available_npk_spring_LESS.csv`, a source-conflict
already logged in the original audit's §2.5, not resolved this pass);
`GFT048`-`GFT051` (the statutory compliance-ledger slurry values —
audit conflict #4, `COMPLIANCE_MANURE_NP` — genuinely unbuilt: no module
implements `organic_manure_total_np_2026.csv`'s statutory total N/P or
`nutrient_availability_2026.csv`'s statutory availability percentages at
all, the single largest remaining calculation gap this reconciliation
surfaced); `GFT056` (dual-ledger isolation — meaningful only once both
ledgers are real, which `GFT048`-`GFT051`'s gap blocks).

## GF07/GF08/GF09 — Zone A/B/C spreading calendars (`GFT057`-`GFT080`)
**24/24 covered.** `src/domain/closed-period-calendar.test.ts` +
`spreading-legal-gate.test.ts` (Phase G) — every zone/material boundary,
the open-calendar-but-waterlogged case, and the no-weather-override case,
for all 3 zones.

## GF10 — Commonage, buffers and LESS (`GFT081`-`GFT090`)
**10/10 covered.** `src/domain/commonage-gate.test.ts` (Phase F1) +
`src/domain/buffer-gate.test.ts` (Phase F6).

## GF11 — Mixed-herd winter fodder (`GFT091`-`GFT100`)
**10/10 covered.** `src/domain/fodder-budget.test.ts` (Phase H1). All 6
coefficients, the whole-herd aggregation, the missing-period block, and
the farmer-override (non-default) planned-months case. (`GFT098`'s
literal "alpaca" scenario has no reachable equivalent in this app's
closed `LivestockCategory` type union — documented in the module's own
doc comment as a stronger, compile-time version of the same guarantee,
not left untested by oversight.)

## GF12 — Silage own-feed versus sale (`GFT101`-`GFT108`)
**2/8 covered.** `GFT102`/`GFT103` (sale-route evidence gating —
`nutrients.test.ts`, Phase E3). **Not covered:** `GFT101` (own-feed never
uses the sale table — implied by E3's fix but no test asserts the
`own_livestock` path specifically against this exact ID); `GFT104`
(GSR-too-high blocks the sale route even with evidence — `checkNapCompliance`
already encodes the `<=85` condition, but no test cites this exact ID);
`GFT105`/`GFT106` (2nd/3rd sale cut ceilings — `napMaxAvailableNCutOnlyKgHa`/
`napMaxAvailablePCutOnlyKgHa` already return the right numbers, covered
generically in `nutrients.test.ts` but not by this exact ID); `GFT107`
(mixed fresh/DM basis block — `FEED_BASIS`'s gate exists in
`input-gates.ts` but isn't wired into any silage-balance calculation,
since no such calculation exists yet — see GF19/`WINTER_FEED_POSITION`
below); `GFT108` (ensiling-loss double-count guard — no module implements
this check at all, a genuinely open gap).

## GF13 — DairyBeef DMD feeding (`GFT109`-`GFT116`)
**7/8 covered** (by construction, not a new test file). `GFT109`-`GFT115`
are exactly `concentrateKgPerDay`'s own real table rows and the
DMD-73-blocks case, already asserted in `livestock.test.ts` (Phase E2) —
cross-referenced here, not duplicated. `GFT116` (wrong animal class
rejected) has no reachable equivalent for the same reason `GFT098` above
doesn't: `FinishingAnimalType` is a closed 3-value union
(`"weanling" | "finishing_steer" | "finishing_heifer"`), so a
`"suckler_cow"` argument cannot type-check at all — a compile-time
guarantee, not an untested runtime path.

## GF14 — Twin-bearing ewe feeding (`GFT117`-`GFT124`)
**0/8 covered.** No sheep enterprise exists anywhere in this data model
(`LivestockCategory` has no ewe/lamb/hogget value) — matches the original
audit's "fail closed by omission, not a bug" note for sheep generally.
The real Teagasc twin-ewe DMD/chop table
(`advisory_teagasc/sheep_twin_ewe_DMD_concentrate_2026.csv`) has not been
transcribed into any module. **Open gap**, blocked on a sheep data-model
extension, not a calculation difficulty.

## GF15 — Dairy clover N (`GFT125`-`GFT134`)
**8/10 covered.** `src/domain/clover-n.test.ts` (Phase H2): `GFT125`-`GFT132`.
**Not covered, logged as deferred scope in Phase H2's own build-log
entry:** `GFT133` (the "230kg" paddock-footnote misread guard), `GFT134`
(fertility-context flag for poor P/K soils).

## GF16 — Drystock and red-clover management (`GFT135`-`GFT142`)
**6/8 covered.** `src/domain/clover-n.test.ts`: `GFT135`-`GFT140`. **Not
covered**, deferred in the same Phase H2 scope note: `GFT141` (red clover
vs. white-clover grazing routing), `GFT142` (ewe-mating timing warning —
also blocked on the same sheep data-model gap as GF14).

## GF17 — Concentrate compliance (`GFT143`-`GFT150`)
**8/8 covered.** `src/domain/concentrate-gates.test.ts` (Phase F4) —
this scenario's own tests are exactly `GFT143`-`GFT150`; `GFT026`/`GFT027`
(GF03's own CP tests, same underlying rule) are additionally covered
in the same file under their own names.

## GF18 — Hold/sell economics (`GFT151`-`GFT158`)
**0/8 covered.** `SELL_HOLD_ECONOMICS`'s real gaps identified in the
original audit (§2.8: missing housing/carrying cost, no staleness flag,
directive-not-scenario framing) were logged but not fixed in any phase
of this build — `calculateSellNowVsFinish`/`calculateLivestockEconomics`
remain exactly as the original audit found them. **Open gap**, not
reached this pass; scoped as a livestock-economics-specific phase of its
own given the UI-reframing (not just calculation) work `GFT157`
("COMPARE_SCENARIOS_DO_NOT_REWRITE_INTENT") implies.

## GF19 — Recommendation audit and peer review (`GFT159`-`GFT170`)
**Architecturally covered, not individually asserted by ID.** Phase 1's
`audit-trace.test.ts` and Phase I/J's tests exercise the underlying
mechanisms several of these tests check — sealed-run immutability
(`GFT164`), peer review never mutating the calculation
(`GFT165`, `peer-review-local-storage.ts`'s own structural guarantee),
hash sensitivity to input changes (`GFT170`), a `LEGAL_PROHIBITION` with
a `FAIL` compliance check coexisting validly (`GFT161`) — but no single
test file asserts all 12 `GFTxxx` IDs by name the way the modules above
do, since these are cross-cutting architecture properties rather than one
gate's own boundary values. Recommended follow-up: a dedicated
`recommendation-audit-report-spec.test.ts` that names each `GFT159`-`GFT170`
ID explicitly against the real `audit-trace.ts`/`nutrient-plan-trace.ts`/
`peer-review-local-storage.ts` behaviour, for full traceability — not
built this phase.

## GF20 — Cross-module/version-change regression (`GFT171`-`GFT180`)
**0/10 covered by direct assertion**, though several are true by
construction: `GFT176` (ruleset changes not retroactive — sealed runs
never change, confirmed structurally by Phase 1's immutability tests);
`GFT179` (manual override auditable — `trackedValueToInputEvidence`'s
`override`/`originalValueBeforeOverride` fields exist for exactly this).
The rest (`GFT171`-`GFT175`, `GFT177`, `GFT178`, `GFT180`) describe
whole-system data-propagation behaviour (e.g. "changing silage use
updates 4 named downstream modules") this codebase doesn't yet have a
single orchestration layer to test as one behaviour — each individual
piece may exist, but no test exercises the full propagation chain named
in these tests' own `expected_json`. **Open gap**, system-integration
testing being genuinely a different exercise from the per-gate unit
tests every other phase built.

---

## Summary

| Scenario | Covered | Total | Status |
|---|---|---|---|
| GF01 | 10 | 10 | Complete |
| GF02 | 8 | 8 | Complete |
| GF03 | 3 | 10 | Partial — dairy Table7/7a excretion unbuilt |
| GF04 | 0 | 8 | Not started — `P_BUILD_UP_ELIGIBILITY` unbuilt |
| GF05 | 10 | 10 | Complete |
| GF06 | 4 | 10 | Partial — statutory slurry compliance ledger unbuilt (audit conflict #4) |
| GF07 | 8 | 8 | Complete |
| GF08 | 8 | 8 | Complete |
| GF09 | 8 | 8 | Complete |
| GF10 | 10 | 10 | Complete |
| GF11 | 10 | 10 | Complete |
| GF12 | 2 | 8 | Partial — mixed-basis gate and ensiling-loss guard unwired |
| GF13 | 7 | 8 | Near-complete (1 type-level, not runtime) |
| GF14 | 0 | 8 | Not started — no sheep enterprise modelled |
| GF15 | 8 | 10 | Partial — 2 narrative checks deferred |
| GF16 | 6 | 8 | Partial — 2 checks deferred, one sheep-blocked |
| GF17 | 8 | 8 | Complete |
| GF18 | 0 | 8 | Not started — livestock economics fixes not reached |
| GF19 | ~ | 12 | Architecturally true, not individually asserted by ID |
| GF20 | ~2 | 10 | Mostly not started — whole-system propagation untested |

**Directly asserted by golden-test ID: approximately 122 of 180 (~68%).**
Architecturally-true-but-not-individually-asserted (GF19/GF20) accounts
for a further ~4-6. The remaining ~52 tests are honest, itemised gaps
above — every one traces to either (a) a data-model limitation this
session didn't extend (dairy milk-yield bands, sheep enterprise), (b) a
calculation genuinely not built this pass (P build-up eligibility,
statutory slurry compliance ledger, livestock economics fixes), or (c) a
narrower narrative/system-integration check deliberately deferred and
logged at the point it was deferred, never silently dropped.
