# Farm Return Scientific Engine V3 — Implementation Coverage Matrix

**Status date:** 2026-08-26 (single unattended build session, Phases 1
through L, commits `8c8183f`..`7264ca3` on `claude/scientific-engine-v3`).
Not pushed, not merged.

This is the Final Completion Gate document
`CLAUDE_CODE_IMPLEMENTATION_PROMPT.md`-style instructions require:
reconciliation against every calculation contract, every adversarial
finding, every audit conflict, and the report-acceptance test set — with
no item hidden behind a general "PASS".

---

## 1. `implementation/calculation_contracts.csv` — all 25 rows

| calculation_id | status | evidence | files |
|---|---|---|---|
| `AGRONOMIC_SLURRY_NPK` | **PARTIAL** | Existing Green Book Table 9-8 implementation unchanged; a newer, more current V3 source (`cattle_slurry_available_npk_spring_LESS.csv`) is not reconciled — logged as a source conflict in the original audit, not resolved this build | `nutrients.ts` |
| `COMPLIANCE_MANURE_NP` | **NOT IMPLEMENTED** | The single largest remaining gap (audit conflict #4). No module reads `organic_manure_total_np_2026.csv`/`nutrient_availability_2026.csv`'s statutory values at all | — |
| `SPREADING_AGRONOMIC_OPPORTUNITY` | **NOT APPLICABLE (correctly)** | This app already, correctly, does not compute an unvalidated 0-100 probability — matches the contract's own "No arbitrary 0-100... until externally validated" | `spreading.ts`, `docs/data-model.md`'s "Tenth audit pass" |
| `FODDER_SUPPLY_DM` | **NOT IMPLEMENTED** | Only the demand side (`BASIC_FODDER_DEMAND_FRESH_WEIGHT`) was built; measuring/estimating stored feed supply is untouched | — |
| `DMD_CONCENTRATE_GUIDANCE` | **IMPLEMENTED** | Exact-lookup fix, Phase E2 | `livestock.ts`, `livestock.test.ts` |
| `SELL_HOLD_ECONOMICS` | **PARTIAL** | Real underlying calculation exists (pre-dates this build) but the gaps the original audit found (missing housing/carrying cost, no staleness flag, directive-not-scenario framing) are unfixed — GF18 golden tests uncovered | `livestock.ts` |
| `SOIL_P_INDEX` | **IMPLEMENTED** | Ambiguous-boundary fix + `other_crop` support, Phase E1 | `nutrients.ts` |
| `SOIL_TEST_VALIDITY` | **IMPLEMENTED** | Phase K | `soil-test-validity.ts` |
| `LIME_REQUIREMENT` | **NOT IMPLEMENTED (correctly fail-closed by omission)** | No lab lime-requirement field exists to compute from — matches the contract's own "No exact t/ha from pH alone" | — |
| `GRASSLAND_STOCKING_RATE` | **IMPLEMENTED and WIRED LIVE** | Phase D built, Phase E4 wired into `checkNapCompliance` | `statutory-excretion.ts`, `nutrients.ts` |
| `DAIRY_COW_EXCRETION_N` | **BLOCKED (correctly fail-closed)** | `dairy_cow` always blocks in `resolveStatutoryExcretionCategory` — no milk-yield-band/Table7a-election field exists in this data model | `statutory-excretion.ts` |
| `P_BUILD_UP_ELIGIBILITY` | **NOT IMPLEMENTED** | GF04 gap; `napEnhancedPBuildUpKgHa` exists but has no eligibility gate and is correctly never called | `nutrients.ts` (inert function only) |
| `MILKING_PLATFORM_N_DISTRIBUTION` | **IMPLEMENTED** | Phase K | `milking-platform.ts` |
| `SPREADING_LEGAL_GATE` | **PARTIAL** | Calendar + ground/weather stops real (Phase G); buffer/commonage/LESS gates are real but built as separate composable functions, not fused into one call | `spreading-legal-gate.ts`, `closed-period-calendar.ts`, `buffer-gate.ts`, `commonage-gate.ts`, `less-method-gate.ts` |
| `BASIC_FODDER_DEMAND_FRESH_WEIGHT` | **IMPLEMENTED** | Phase H1 | `fodder-budget.ts` |
| `FODDER_DEMAND_DM` | **NOT IMPLEMENTED (correctly deferred)** | Contract's own text: "Use `BASIC_FODDER_DEMAND_FRESH_WEIGHT`... otherwise block exact DM/nutrition result" — matches this build's scope | — |
| `WINTER_FEED_POSITION` | **NOT IMPLEMENTED** | `FEED_BASIS` gate exists (Phase C) but isn't composed into an actual fresh/DM balance calculation | `input-gates.ts` (gate only) |
| `COMMONAGE_FERTILISER_GATE` | **IMPLEMENTED, not wired to a live recommendation flow** | Phase F1 | `commonage-gate.ts` |
| `LESS_METHOD_GATE` | **IMPLEMENTED, not wired** | Phase F2 | `less-method-gate.ts` |
| `SOILED_WATER_APPLICATION_GATE` | **IMPLEMENTED, not wired** | Phase F3; always `UNKNOWN` in practice — no application-history ledger exists | `soiled-water-gate.ts` |
| `CONCENTRATE_P_COMPLIANCE` | **IMPLEMENTED, not wired** | Phase F4 | `concentrate-gates.ts` |
| `FEED_CP_LEGAL_GATE` | **IMPLEMENTED, not wired** | Phase F4 | `concentrate-gates.ts` |
| `SILAGE_DESTINATION_REGULATORY_ROUTE` | **PARTIAL, WIRED LIVE** | Written-evidence gate real and live (Phase E3); `intendedUse` enum still doesn't match V3's `own_feed/sale/mixed/unknown` vocabulary (cosmetic, logged, not behaviour-affecting per Phase E3's own reasoning) | `nutrients.ts` |
| `FERTILISER_PRODUCT_ADMISSIBILITY` | **IMPLEMENTED, not wired** | Phase F5; `nutrients.ts`'s static `PRODUCTS` catalogue has no formulation metadata to check yet | `fertiliser-admissibility-gate.ts` |
| `RECOMMENDATION_AUDIT_TRACE` | **PARTIAL, WIRED LIVE for one decision** | Phases 1/B/I/J: real for the NAP compliance decision only, not the full nutrient-plan pipeline | `audit-trace.ts`, `nutrient-plan-trace.ts`, `audit-trace-local-storage.ts`, `RecommendationAuditTrailCard.tsx` |

**Tally:** 9 fully implemented (2 of those wired live), 8 partial, 6 not
implemented (3 of those correctly/intentionally fail-closed-by-design,
matching the contract's own text), 1 not applicable (correctly).

---

## 2. `validation/adversarial_findings.csv` — all 18 findings

| ID | Severity | V3 status | This build's status |
|---|---|---|---|
| AF001 | CRITICAL | GUARDED | **RESOLVED, wired live** — Phase E1 |
| AF002 | CRITICAL | RESOLVED | **RESOLVED** — Phase K (`soil-test-validity.ts`, not wired to any screen) |
| AF003 | CRITICAL | RESOLVED | **RESOLVED, module built** — Phase F1, not wired to a live fertiliser-recommendation flow |
| AF004 | HIGH | RESOLVED | **RESOLVED, module built** — Phase F2, not wired (closes audit conflict #6's gate, but `nutrients.ts`'s own `slurryMethod` param is still dead/unread) |
| AF005 | HIGH | RESOLVED | **RESOLVED, module built** — Phase F3; always `UNKNOWN` in practice (no history ledger) |
| AF006 | HIGH | RESOLVED | **RESOLVED, module built** — Phase F4, not wired |
| AF007 | HIGH | RESOLVED | **RESOLVED, module built** — Phase F4, not wired |
| AF008 | HIGH | RESOLVED | **RESOLVED, wired live** — Phase E3 |
| AF009 | HIGH | RESOLVED | **RESOLVED, module built** — Phase F5, not wired (no product formulation metadata in the live catalogue) |
| AF010 | HIGH | GUARDED_EXTERNAL_DATA | **RESOLVED, module built** — Phase F6, not wired |
| AF011 | HIGH | RESOLVED | **PARTIALLY RESOLVED** — Phase K found this defect ACTIVE in the live path (not just theoretically present) and built a real fix; the fix itself is not yet wired into `checkNapCompliance`, so the live app still has the over-application risk today |
| AF012 | HIGH | RESOLVED | **NOT RESOLVED** — Table7a CP-election logic was never built; `dairy_cow` correctly fails closed instead, which is the safe default but not the same as "resolved" |
| AF013 | MEDIUM | RESOLVED | **RESOLVED** — Phase H2 |
| AF014 | HIGH | RESOLVED | **PARTIALLY RESOLVED** — the `FEED_BASIS` gate exists (Phase C) but no fodder-balance calculation exists yet to apply it to |
| AF015 | MEDIUM | RESOLVED_BY_DESIGN | **Unchanged / not applicable** — this app has no reserve-guidance feature at all yet, so there is nothing to double-count; consistent with V3's own `RESOLVED_BY_DESIGN` status |
| AF016 | CRITICAL | RESOLVED_BY_ARCHITECTURE | **Demonstrated in real code** — Phases 1/I: the trace is built at calculation time from the calculation's own real output |
| AF017 | HIGH | RESOLVED_BY_ARCHITECTURE | **Demonstrated in real code** — Phase I: the blocked case is recorded with equal fidelity to the compliant case |
| AF018 | MEDIUM | RESOLVED_BY_ARCHITECTURE | **Confirmed true by omission** — no LLM narrative field is ever populated anywhere in this codebase |

**Tally:** 12 fully/architecturally resolved (5 of those wired live or
demonstrated in a real live-relevant path), 5 module-built-but-not-wired,
1 not resolved (AF012).

---

## 3. `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` — all 9 conflicts

| # | Conflict | Status |
|---|---|---|
| 1 | Statutory GSR replaced by agronomic LU curve | **RESOLVED, wired live** — Phase D/E4 |
| 2 | DMD interpolation | **RESOLVED, wired live** — Phase E2 |
| 3 | P-Index ambiguous boundary | **RESOLVED, wired live** — Phase E1 |
| 4 | Statutory slurry compliance ledger missing | **NOT RESOLVED** — still entirely unbuilt |
| 5 | Silage-sale-evidence gating | **RESOLVED, wired live** — Phase E3 |
| 6 | `slurryMethod` dead parameter | **PARTIALLY RESOLVED** — the real gate the parameter should feed now exists (`less-method-gate.ts`), but the parameter itself in `nutrients.ts` is still unread |
| 7 | Fertiliser inhibitor inferred from name | **PARTIALLY RESOLVED** — the real gate exists (`fertiliser-admissibility-gate.ts`), but `nutrients.ts`'s live `PRODUCTS` catalogue still has no formulation field, so the underlying risk (a future change trusting the "Protected Urea" name) remains structurally possible until that catalogue is extended |
| 8 | Reports live-reconstruction | **PARTIALLY RESOLVED** — a real, persisted, immutable trace now exists for ONE decision type (NAP compliance); `lib/reports.ts`'s three original CSV builders are unchanged and still reconstruct live on every export |
| 9 | Livestock economics directive framing | **NOT RESOLVED** — GF18 gap, unbuilt |

**Tally:** 4 fully resolved and wired live, 3 partially resolved (real
module exists, live integration incomplete), 2 not resolved.

---

## 4. Golden-farm scenario/test harness

See `docs/scientific-engine/v3/GOLDEN_FARM_TEST_COVERAGE.md` for the full
scenario-by-scenario (GF01-GF20) breakdown. Summary:
**~122 of 180 golden tests directly asserted by exact `GFTxxx` ID** across
694 total Vitest tests in this codebase (see §6). The remaining ~58 are
each individually itemised with a specific blocking reason (data-model
limitation, unbuilt calculation, or a deliberately deferred narrower
check) — none are silently unaccounted for.

---

## 5. `reports/report_acceptance_tests.csv` — all 24 rows

| ID | Requirement | Status |
|---|---|---|
| RPT001 | All decision classes included | **PARTIAL** — the trace architecture supports all 8 `DecisionType` values; only `ACTION_RECOMMENDATION`/`WARNING`/`BLOCKED_INSUFFICIENT_EVIDENCE` are ever actually emitted (by the one traced decision, NAP compliance) |
| RPT002 | Persisted trace, not reconstructed | **PASS** |
| RPT003 | Raw and normalised inputs + units | **PASS** for the inputs that are captured |
| RPT004 | Evidence states on every input | **PASS** |
| RPT005 | Defaults never labelled measured | **PASS** |
| RPT006 | Ordered formula trace | **PASS** |
| RPT007 | Rounding rules visible | **NOT POPULATED** — the field exists on `CalculationStep` but `nutrient-plan-trace.ts` doesn't fill it in |
| RPT008 | Complete legal checks incl. passing | **PASS** |
| RPT009 | Hard fail suppresses contradictory action | **PARTIAL** — an exceeded ceiling is recorded as `WARNING`, not a suppressed/blocked fertiliser recommendation; true suppression of the purchased-product blend isn't wired |
| RPT010 | Source register integrity | **PASS** |
| RPT011 | Source table/page/section captured | **PARTIAL** — `SourceCitation.section` is optional and not always populated |
| RPT012 | Historical immutability | **PASS** |
| RPT013 | Ruleset versioning | **PASS** |
| RPT014 | Peer review separate from calculation | **PASS** |
| RPT015 | Blocked inputs visible | **PASS** |
| RPT016 | Alternative rejection reasons | **NOT IMPLEMENTED** — `alternatives` field exists, never populated |
| RPT017 | LLM non-authoritative | **PASS by omission** — no narrative is ever written |
| RPT018 | Narrative-contradiction invalidates report | **NOT APPLICABLE YET** — nothing to contradict, since no narrative is ever written |
| RPT019 | Trace SHA-256 present | **PASS** |
| RPT020 | Hash sensitivity to input changes | **PASS, tested** |
| RPT021 | CSV audit-pack referential integrity | **NOT BUILT** — no `.zip`/CSV audit-pack export exists |
| RPT022 | JSON machine trace schema-valid | **NOT VALIDATED** — no JSON export or schema-validation step built |
| RPT023 | Report UI filters | **NOT IMPLEMENTED** |
| RPT024 | Run comparison UI | **NOT IMPLEMENTED** |

**Tally:** 12 pass, 4 partial, 7 not implemented, 1 not yet applicable.

---

## 6. Regression / build status (this session's final run)

- `npm run typecheck` — **clean**
- `npm run lint` — **clean**
- `npx vitest run` — **694/694 passing**, 51 test files, zero skipped
- `npm run build` (`next build`) — **clean**, all 25 routes generated
- Playwright visual regression — **BLOCKED**, documented at Phases E4/J:
  this sandboxed environment has no Chromium binary and cannot fetch one
  (`npx playwright install chromium` produced nothing, no network egress
  to the Playwright CDN). Two screens (`/nutrients`, `/reports`) have
  real behaviour changes this session that make their approved visual
  baselines stale; regenerating them needs an environment with a working
  browser.

---

## 7. Structural verifications

- **No LLM in the calculation path.** `grep -rn "anthropic\|openai\|claude\|llm"` across `src/domain`, `src/app`, `src/components`, `src/lib`, `src/server` returns exactly one match, a doc comment in `audit-trace.ts` describing the LLM-boundary principle — no actual model call exists anywhere.
- **Statutory/agronomic ledger separation.** `calculateGrasslandStockingRateKgHa` (Green Book agronomic curve, feeds `grossN`/`grossP`/`grossK`) and `calculateStatutoryGrasslandStockingRateKgHa` (S.I. 119/2026 Table 7, feeds `checkNapCompliance`'s ceiling selection) are two distinct, separately-tested functions as of Phase E4 — the conflation the original audit found is fixed for the GSR figure specifically. The statutory slurry-value ledger (`COMPLIANCE_MANURE_NP`) remains genuinely unbuilt (§1/§3 above) — that specific ledger separation is not yet achievable because one side of it doesn't exist.
- **Calculation trace coverage.** One production decision path (NAP N/P compliance) emits a real, structured trace end to end. Every other real calculation in this codebase (fertiliser product blend, fodder demand, clover-N, every Phase F gate) produces a correct `EngineOutcome` but does not yet construct a `DecisionRecord` from it — the trace *architecture* covers all of them (any could be wrapped the same way `nutrient-plan-trace.ts` wraps `calculateNutrientPlan`), but only one has been.
- **Immutable historical trace.** Verified by test: `recordDecision` throws on a sealed run; `sealCalculationRun` is idempotent; `createLocalStorageAuditTraceStore`/`createLocalStoragePeerReviewStore` never mutate a stored run, confirmed by dedicated tests including cross-namespace isolation from `farm-store.tsx`'s own state.
- **Peer review.** Real, working, persisted separately from the calculation it reviews — structurally incapable of mutating a `CalculationRun` (no code path exists that could), not just documented as such.
- **Git status/history.** Working tree clean at every commit boundary (verified after each phase in the build log). 16 commits this session, `8c8183f` through `7264ca3`, each independently reviewable and revertable. Nothing pushed, nothing merged, no branch other than `claude/scientific-engine-v3` touched.

---

## 8. What remains, explicitly, and why

| Remaining work | Why it remains | What would close it |
|---|---|---|
| Statutory slurry compliance ledger (`COMPLIANCE_MANURE_NP`) | Not reached this session — largest single gap | A new module reading `organic_manure_total_np_2026.csv`/`nutrient_availability_2026.csv`, mirroring `statutory-excretion.ts`'s pattern, then wiring it to replace the agronomic offset currently used as `checkNapCompliance`'s applied-N/P figure |
| P build-up eligibility (`P_BUILD_UP_ELIGIBILITY`) | Not reached | A gate module for the 6 Article 17(6) conditions, same shape as `commonage-gate.ts`; `napEnhancedPBuildUpKgHa` already exists to consume its output once gated |
| High-rate N eligibility wiring | Built (Phase K) but not connected to the live path | Thread a `nonGrassPct` field through `CalculateNutrientPlanInput`/`checkNapCompliance`, the same pattern Phase E3 used for `saleEvidence` |
| Every Phase F gate (commonage/LESS/soiled-water/concentrate/CP/admissibility/buffer) wiring | Built and tested, but no farmer-facing screen captures their required inputs yet (commonage status, slurry method, concentrate CP%, product formulation, water-buffer context) | A capture-UI phase per gate, then wiring each gate's output into the relevant recommendation flow |
| Dairy Table 7a CP-election path | No milk-yield-band/CP-election/records fields exist in this data model; dairy isn't a modelled enterprise in this app's mock data at all | A data-model extension (dairy-specific `LivestockGroup` fields) before the calculation itself is worth building |
| Sheep enterprise (twin-ewe DMD, red-clover ewe-mating warning) | No sheep category exists in `LivestockCategory` | A data-model extension, same as dairy above |
| Livestock economics fixes (`SELL_HOLD_ECONOMICS`, GF18) | Not reached — needs both calculation additions (housing/carrying cost) and a UI-reframing (scenario comparison, not directive) | A dedicated phase combining both |
| Full nutrient-plan trace (beyond NAP compliance) | Deliberately scoped narrower in Phase I — the compliance decision is where legal risk concentrates | Extend `nutrient-plan-trace.ts` (or build siblings) to trace the P/K build-up, slurry offset and purchased-product blend the same way |
| Wiring every Phase F/K gate's trace emission | Only the NAP compliance decision has a `DecisionRecord` builder | One builder per gate, following `nutrient-plan-trace.ts`'s pattern, once each gate itself is wired into a live flow |
| Report acceptance gaps (RPT007/009/011/016/018/021-024) | Reports UI (Phase J) is a first real surface, not the full spec — audit-pack export, JSON schema validation, filters and run comparison are all real, separate UI/export features | Incremental UI work on `RecommendationAuditTrailCard`/`/reports`, plus new export builders |
| Playwright visual regression | Environment has no Chromium binary and no network egress to fetch one | Run in an environment with a working browser; regenerate the `/nutrients` and `/reports` baselines |

---

## 9. Production release gate

Per `implementation/production_release_gate.csv`'s own vocabulary, this
session moves several calculations from their pre-session state toward
(but not yet fully to) `READY`:

- `soil test age/status`: was unimplemented → now **READY** (real,
  tested, not wired to a screen).
- `P index current compliance`: was `READY_WITH_MICROGAP_GUARD` on paper
  but not actually guarded in code → now genuinely **READY_WITH_MICROGAP_GUARD**.
- `statutory GSR`: was using the wrong figure → now **READY, wired live**.
- `milking platform redistribution`: was unimplemented → now **READY**
  (not wired to a screen — no platform-declaration capture UI exists, so
  `READY_CONDITIONAL` in practice).
- `commonage fertiliser gate` / `LESS method compliance` / `soiled-water
  application compliance` / `concentrate-feed P compliance` / `seasonal
  concentrate CP gate` / `silage-for-sale regulatory route` / `fertiliser
  product admissibility` / `local water-buffer compliance`: each moves
  from unimplemented to **READY_CONDITIONAL** (real calculation exists;
  the "condition" — capturing the required input on a real screen — is
  not yet met for any of them, so none should be presented to a farmer
  as definitive yet).
- `nitrates derogation higher manure limit`: unchanged,
  **BLOCKED_UNTIL_AUTHORISED_MODULE**, correctly untouched.
- `recommendation audit trace`: was entirely absent → now real for one
  decision type, **PARTIAL** against the gate's own "mandatory for all
  production decisions" bar.

**No calculation in this codebase should be presented to a farmer as a
definitive, unqualified compliance answer as a result of this session's
work** — every new gate fails closed by construction, and every existing
fix this session made either fails closed (Phase E4's NAP compliance for
this farm's real herd) or narrows an existing gap without claiming
completeness it doesn't have.
