# Real Mode Completion Phase 34 — scientific reconciliation

This build did not alter Scientific Engine v3's calculation logic —
`docs/scientific-engine/v3/` (in particular `ADVERSARIAL_AUDIT_REPORT.md`
and `V3_IMPLEMENTATION_COVERAGE_MATRIX.md`) is the authoritative record
of that engine's own scientific reconciliation. This document traces two
representative real flows end to end, through this session's real
persistence layer, to confirm the engine's provenance/gates survive the
journey from a farmer's real input to a screen output — the specific
concern a persistence-and-UI build like this one could introduce, even
without touching the engine itself.

## Flow 1 — a real soil test into a NAP compliance determination

1. **Field**: farmer creates a real field on `/fields`
   (`createField`/`addFieldAction`) — `plannedUse` starts
   `"farmer_adjusted"`, `fertility.pIndex`/`kIndex` start `"estimated"`
   (Farm Return assumption, index 2).
2. **Soil test**: farmer adds a real lab result on `/soil`
   (`addSoilTestToField`, `src/lib/farm-data/soil.ts`) — calls the exact
   same `pIndexFromMgL`/`kIndexFromMgL`/`resolvePIndexConservatively`
   (`nutrients.ts`) the mock-mode store action always used (Phase 4,
   this session: one classification path, verified by code read, not
   duplicated). `fertility.pIndex`/`kIndex` become `"verified"`, chained
   via `verify()` (never overwriting the prior estimated value — Phase 2
   of the original Real Farm V1 brief's provenance rule).
3. **Statutory GSR**: `calculateStatutoryGrasslandStockingRateKgHa`
   resolves from the farm's real livestock groups (S.I. 119/2026 Table 7
   excretion rates by category/age/sex band) — `BLOCKED_INSUFFICIENT_EVIDENCE`
   if the herd's age/sex data is incomplete, never a guessed rate.
4. **NAP ceiling**: `checkNapCompliance` (`nutrients.ts`) resolves the
   real statutory N/P ceiling for this field's land use, checks the real
   soil-test-age validity (`checkSoilTestAgeValidity`,
   `soil-test-validity.ts`) — a test ≥4 years old and not Index-4
   downgrades `regulatory` from `compliance_value` to `planning_advice`
   (confirmed still wired, not weakened, by reading the current code).
5. **Screen**: `/nutrients`' `NapComplianceCard` renders the real
   `EngineOutcome<NapComplianceCheck>` — `BLOCKED_INSUFFICIENT_EVIDENCE`
   shows the real missing-inputs list, never a plausible-looking ceiling
   computed from absent data (re-verified Phase 8, this session).
6. **Field-detail drill-down** (new this session, Phase 9):
   `FieldDrawer`'s Soil tab shows the same real validity state inline,
   and links to the same real `/nutrients` plan for this exact field —
   one classification, two honest views of it.

**Provenance chain intact end to end**: `TrackedValue.previous` on
`fertility.pIndex` still points at the pre-test estimated value after a
real Postgres round-trip (confirmed via `mappers.test.ts`'s round-trip
assertions — the `jsonb` storage format preserves the full nested
`previous` chain, not just the current value).

## Flow 2 — real livestock into a fail-closed gate

1. **Livestock**: farmer adds a real group on `/livestock` or during
   onboarding (`createLivestockGroup`) — category/count real,
   `avgAgeMonths`/`sex` absent by default (Phase 2/3's deliberately narrow
   onboarding capture).
2. **Commonage/buffer/LESS-method evidence**: farmer captures real
   evidence via `FieldDrawer`'s compliance-evidence section
   (`updateFieldCommonageStatus`/`updateFieldWaterBufferContext`/
   `updateSlurryApplicationMethod`) — each persists through the exact
   same `farmerAdjust()` chain as the field-index case above.
3. **Gates**: `checkCommonageFertiliserGate`/`checkNationalBufferDistance`/
   `checkLessMethodGate` (`input-gates.ts` family) read this real,
   persisted evidence. Absent or `"unknown"` still resolves to
   `BLOCKED_INSUFFICIENT_EVIDENCE` — confirmed by reading the current
   code, not just cited from the prior session's audit.
4. **Screen**: `NutrientPlan.commonageFertiliserGate`/`lessMethodCompliance`
   surface the real `EngineOutcome` — a `LEGAL_PROHIBITION` genuinely
   suppresses the fertiliser recommendation rather than just being noted
   alongside one (the exact behaviour the original V3 closure passes
   fixed, re-verified here to still hold).

## What this build changed vs. did not touch

**Changed**: where the data behind these flows lives (Postgres instead of
`localStorage`/component state), and who can see it (RLS instead of one
shared browser). **Not changed**: any threshold, table value, gate logic,
or fail-closed default inside `src/domain/`. The one near-miss this
session found (`STEER_CONCENTRATE_PRICE_EUR_PER_TONNE`-class hardcoded
prices) was deliberately *not* rewired into the engines to avoid
destabilising already-tested calculation functions — see
`FINANCIAL_RECONCILIATION.md` and `BUILD_LOG.md` Phase 20 for why that's
a distinct, future, lower-risk follow-up rather than something forced
into this pass.

## Genuine engine-adjacent finding this session

The one real bug this build introduced *risk* of and then avoided:
Phase 10 (prior session) found `calculateWholeFarmFodderDemand`
(`fodder-budget.ts`) returns **fresh-weight** tonnes, while the UI field
it would have populated is labelled **"t DM"** (dry matter) — a real ~4x
unit mismatch with no sourced conversion factor anywhere in this app's
evidence base. Not wired in. This is the clearest example in this whole
build of the difference between "compiles and looks plausible" and
"scientifically correct" — caught by reading the source data's own units
before wiring, not by a test (no test existed for this because the wiring
was never done).
