# Fertiliser Vertical V1 — End-to-End Scientific Completion — Final Report

**Campaign:** Fertiliser Vertical V1 — End-to-End Scientific Completion
**Branch:** `farm-return-next` (never `main`)
**Starting SHA:** `0cf2cf2` (the prior, separate "Fertiliser Vertical campaign" — see note below — closed clean at Codex audit round 52, `0/0/0/0/0`)
**Ending SHA:** `20bb403` (Checkpoint 4's audit-closure commit, pushed to `origin/farm-return-next`)
**Checkpoints:** 4 of 4 complete, each with its own independent Codex audit loop closed clean
**Overall status:** **MOSTLY** — the full scientific decision chain from soil sampling through to a printable, machine-reproducible evidence report is built, tested, and independently audited end to end; a small number of items were deliberately scoped out rather than rushed, disclosed explicitly below, not silently dropped.

---

## A note on this report's own provenance

This report is compiled from this repository's own real, checked-in
records — `docs/farm-return-next/BUILD_STATE.json`,
`docs/farm-return-next/IMPLEMENTATION_LOG.md`,
`docs/farm-return-next/DOMAIN_CONTRACTS.md`, `docs/evidence-register.md`,
and the git commit history itself — not from re-reading the original
campaign brief verbatim (a long conversation-history compaction occurred
partway through this campaign, and the brief's own literal "31 numbered
items" / "8 acceptance questions" text was not independently preserved
in this session's durable records). Rather than fabricate plausible-
sounding item numbers or question wording that might not match what was
actually specified, this report is organised around the one artefact
that *is* fully, verifiably real throughout — the frozen object model in
`docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md`,
which the campaign itself used to scope every checkpoint — and answers
the campaign's own explicit, repeatedly-stated non-negotiables (fail-
closed, never-fabricate, reuse-first, deterministic, versioned,
regulation-aware) as its acceptance criteria. Every fact below is
checkable against a specific commit, file, or test.

---

## 1. The chain, end to end

`SOIL_SAMPLING_ARCHITECTURE.md`'s own frozen model:

```
Field -> SamplingPlan -> SamplingZone -> SamplingSession -> CoreObservation
  -> CompositeSample -> LabResult -> SoilInterpretation
    -> NutrientRequirement -> ProductAllocation -> FertiliserPlan
      -> Actual -> ScientificEvidenceReport
```

| Stage | Status | Built/verified in |
|---|---|---|
| Field + LPIS | **Existing, reused** | `Field.lpisRef`/`centroid`/`areaHa` (pre-existing) |
| Guided Soil Sampling (SamplingPlan/Zone/Session/CoreObservation) | **Built, audited** | Checkpoint 1 |
| Composite Sample | **Built, audited** | Checkpoint 1 (derived read-only view, never a second mutable table) |
| Lab Result | **Built, audited** | Checkpoint 2 |
| Soil Interpretation | **Built, audited** | Checkpoint 2 |
| Nutrient Requirement (gross + net) | **Existing engine reused; net requirement newly exposed** | Checkpoint 3 (`NutrientPlan.netRequirement`) |
| Regulatory Constraints (NAP, commonage, buffers, LESS) | **Existing, reused verbatim** | Pre-existing `calculateNutrientPlan` output, surfaced in the Checkpoint 4 report |
| Fertiliser Product Allocation, kg/ha | **Existing engine, reused** | `allocatePurchasedProducts` (pre-existing, unmodified) |
| kg/field | **Newly exposed** | Checkpoint 3/4 (`productAllocationKgField`, per-ha × real `areaHa`) |
| tonnes/farm (Purchase Requirement) | **Built, audited** | Checkpoint 3 (`toFarmFertiliserPurchaseRequirementTonnes`, farm-wide UI) |
| Application Plan | **Existing, reused** | Pre-existing `decisions` row (`fertiliser_recommendation`, accepted) |
| Actual | **Existing, reused** | Pre-existing `job_actuals` (confirmed `fertiliser_spreading`) |
| Scientific Evidence Report | **Built, audited** | Checkpoint 4 |

No stage was rebuilt from scratch where a real, already-audited engine
already existed — the campaign's own "reuse existing verified engines"
rule held throughout; every checkpoint's own `DOMAIN_CONTRACTS.md` table
names exactly what was wrapped unmodified versus genuinely new.

---

## 2. Checkpoint-by-checkpoint account

### Checkpoint 1 — Soil Sampling Foundation
Freeze doc: `docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md`.
New: `soil-sampling-plan.ts` (Teagasc-sourced sampling strategy —
min 20 cores/composite, 2-4 ha ideal / 5 ha hard ceiling per sample,
10 cm depth, verified live against Teagasc's own page), the one
genuinely new table (`soil_core_observations`), the guided GPS sampling
screen, and the `CompositeSample` derived view. **Codex audit: 8
rounds** — rounds 1-4 the real implementation (4C/2H/1M, 1C/2M, 1H/2M,
0/0/0+1L, all fixed); round 6 a genuine "the quality gate was claimed
passing without actually being run" finding (1 High), root-caused and
fixed for real (a pre-existing flaky wall-clock test, and ESLint
walking an unrelated tool-internal directory); rounds 5/7/8 the same
doc-sync gap recurring three times, closed structurally per the
campaign's own "three iterations, same issue → structural fix" rule
rather than chased with a ninth patch. Closed at `3df57ec`,
**2190/2190 tests**.

### Checkpoint 2 — Laboratory Evidence
New: `LabResult`/`SoilInterpretation` tables and domain module
(`interpretLabResult`, reusing `nutrients.ts`'s existing P/K Index
classification verbatim — no new numeric rule). Bridges into the
existing, unmodified `calculateNutrientPlan` pipeline via the
pre-existing `addSoilTestToField` — zero engine changes. **Codex audit:
5 rounds**, with a genuine structural correction at round 4: rounds 2-3
both tried to make `soil_interpretations` a trustable "current value"
source and both were wrong (an authenticated client can forge any
column, including timestamps); round 4's real fix was to stop trusting
the table at all — the one real reader (`getLabStatusForCompositeSample`)
recomputes fresh from raw lab values every time. Closed at `160f1c8`,
**2213/2213 tests**.

### Checkpoint 3 — Complete Fertiliser Decision Chain
New: `NutrientPlan.netRequirement` (gross requirement less organic
offset, exposed for the first time as its own inspectable value); a
documented tonnes-rounding policy (`roundKgToTonnes`, nearest 0.01 t,
applied once at farm level, never per-field-then-summed); the farm-wide
Purchase Requirement screen. **Codex audit: 3 rounds** (2 High round 1 —
a rounding-order inconsistency between the exposed `netRequirement` and
the real allocation, and the Purchase Requirement card gating on the
rounded display figure instead of the exact kg; 1 High round 2 — a kept
sub-threshold remainder still displayed as a false "0.00 t"; clean round
3). Two items assessed and deliberately not built this checkpoint (§4).
Closed at `f0cd141`, **2237/2237 tests**.

### Checkpoint 4 — Scientific Evidence Report
The one genuinely new entity the frozen object model still reserved.
New: `buildScientificEvidenceReport` (assembles one CompositeSample's
full real evidence chain from sources every other screen already
independently reads — no new science, no new persisted table), the
report screen (printable, with a machine-reproducible raw-JSON
manifest). **Codex audit: 4 rounds**, all four concentrated on one
disclosure paragraph (whether a sample is still a field's active
fertility evidence), each round finding a genuinely distinct real
defect — never inferring "superseded" from an ID mismatch alone (round
1), keeping the "unknown" copy's stated reason true for every real
sub-case (round 2), never asserting evidence exists when it may not
(round 3) — closing clean at round 4. Closed at `20bb403`,
**2270/2270 tests**.

---

## 3. Test and audit totals

| Checkpoint | Codex audit rounds | Findings fixed (C/H/M/L) | Tests at close |
|---|---|---|---|
| 1 — Soil Sampling Foundation | 8 | 5C, 4H, 8M, 1L | 2190/2190 |
| 2 — Laboratory Evidence | 5 | 3C, 6H, 2M, 2L | 2213/2213 |
| 3 — Complete Decision Chain | 3 | 0C, 3H, 0M, 0L | 2237/2237 |
| 4 — Scientific Evidence Report | 4 | 0C, 4H, 0M, 0L | 2270/2270 |
| **Total** | **20** | **8C, 17H, 10M, 3L** | **+80 net tests over the campaign** |

Every fix in every round is a real, named defect in this repository's
own `IMPLEMENTATION_LOG.md` — never a cosmetic or speculative finding
ground down indefinitely (per the campaign's own "do not grind cosmetic
Low findings" rule, honoured by closing rounds with 0 Low left open at
every checkpoint but Checkpoint 1).

---

## 4. Deliberately scoped out — disclosed, not silently dropped

- **Over/under-supply variance reporting on the fixed product waterfall**
  (`allocatePurchasedProducts`) — the allocation computes an exact
  continuous kg/ha rate per product; there is no discrete bag/tonne
  rounding in this data model to create real over-supply. The one
  genuine gap (a future catalogue product failing admissibility after
  its rate was already assumed upstream) is real but provably inert
  with today's real 3-product catalogue, and untestable without
  fabricating catalogue data — documented in `nutrients.ts`'s own doc
  comment rather than wiring an untestable branch.
- **Extending the audit trace (`nutrient-plan-trace.ts`) beyond NAP
  compliance to the full requirement/allocation chain** — already
  disclosed as real, valuable follow-up work in that file's own header
  since before this campaign; building an equally source-cited
  `DecisionRecord` for the allocation chain is a same-order-of-effort
  undertaking as the existing NAP trace, not a single checkpoint's
  worth of work, and rushing it risked under-sourced compliance-check
  entries in a file that exists specifically to be a rigorous,
  peer-reviewable audit trail.
- **Real Dev-database validation of the 3 new migrations**
  (`soil_core_observations`, `lab_results`, `soil_interpretations`) —
  every migration in this campaign is forward-only and disclosed as
  `PENDING_DEV_VALIDATION`; no live Supabase credentials were available
  in this working environment to run them against `Farm Return V1 Dev`
  for real. This is the same disclosed gap every migration in this
  campaign carries, not unique to this report.
- **Real document/file upload for lab reports** —
  `LabResult.sourceDocumentRef` is a farmer-typed reference only; no
  Storage-backed upload infrastructure exists anywhere in this codebase,
  confirmed before building anything, disclosed honestly in the UI.

---

## 5. Never-fabricate / fail-closed / reuse-first — acceptance check

These are the campaign's own repeatedly-stated non-negotiable rules,
answered here against the real, checkable evidence above (see "A note
on this report's own provenance" above for why this report uses these
rather than reconstructing the original brief's own exact
acceptance-question wording).

| Rule | Verdict | Evidence |
|---|---|---|
| **Deterministic, reproducible** | **YES** | Every stage is a pure function of real, persisted evidence; the Scientific Evidence Report's own "machine-reproducible manifest" is the literal object the screen renders, re-derivable from the same source rows at any later time. |
| **Source-backed, versioned** | **YES** | Every new numeric rule (soil sampling core counts/zone limits, tonnes-rounding policy) carries a named source and version constant; no new science was invented — Checkpoints 2-4 reused existing, already-sourced engines without touching a single coefficient. |
| **Unit-safe (kg/ha → kg/field → tonnes/farm)** | **YES** | `productAllocationKgField` and `toFarmFertiliserPurchaseRequirementTonnes` are one-line, testable conversions of already-computed values, each with its own reconciliation tests proving the conversion never silently diverges from the kg figure shown elsewhere. |
| **Regulation-aware** | **YES** | NAP compliance, commonage, national/local water buffer, and LESS spreading-method gates are all surfaced verbatim in the Scientific Evidence Report from the existing, independently-audited `NutrientPlan` — never re-derived or approximated. |
| **Fail-closed on missing/ambiguous evidence** | **YES** | `buildScientificEvidenceReport` returns a real, typed error for a session that doesn't exist, isn't a soil sample, or isn't confirmed; `fertilityBasisStatus` returns `"unknown"` rather than guessing whenever real dated proof is unavailable; every farm-wide read's own truncation is disclosed, never silently absorbed. |
| **Never fabricate a scientific/regulatory/financial number** | **YES** | No new coefficient, threshold, price, or legal limit was introduced this campaign; every genuinely new figure is a disclosed conversion or exposure of an already-verified calculation. |
| **Reuse existing verified engines, don't rewrite working logic** | **YES** | `calculateNutrientPlan`, `allocatePurchasedProducts`, `addSoilTestToField`, `getFieldRemainingFertiliserRequirement` are all used unmodified throughout; the one deliberate exception (§4) was scoped out specifically to avoid rewriting working logic under time pressure. |
| **Never modify `main`, never touch production Supabase, never weaken RLS** | **YES** | Every commit is on `farm-return-next`; no migration was run against any live database in this environment; no RLS policy was touched this campaign. |

---

## 6. Final state

- **Branch:** `farm-return-next`, pushed to `origin/farm-return-next` at `20bb403`.
- **Working tree:** clean at time of writing.
- **`contracts_frozen`:** `true` (Checkpoint 4's own gate closed clean).
- **Quality gate:** `scripts/quality-gate.sh --json` — 2270/2270 tests (165/165 files), typecheck/lint/build all pass, last run at Checkpoint 4's own closure.
- **Migrations:** 3 new (Checkpoint 1/2), all forward-only, `PENDING_DEV_VALIDATION` (disclosed, not run against any live database).

## 7. Recommended next steps (not part of this campaign's own scope)

1. Dev-validate the 3 new migrations against a real `Farm Return V1 Dev` Supabase instance once credentials are available, following the same two-phase real-Dev-validation process this repository's other migrations already completed.
2. If the product ever needs discrete purchasable units (bags/pallets rather than continuous kg), revisit `allocatePurchasedProducts` as real, non-inert over/under-supply variance reporting.
3. Extend `nutrient-plan-trace.ts` to the full requirement/allocation chain as its own dedicated piece of work, sized and audited like the original NAP-compliance trace was.
