# Fertiliser Vertical Completion — Increment 2 design: slurry recommendation / allocation

Task `fertiliser-vertical-completion-increment-2a-slurry-recommendation-design-20261002`,
base `af3036d`. Design and trace only: **no production code, test, migration or contract
changed**. Engine stays `nutrient_engine_v1.4.0`. No external research; evidence is the
repository and the stored Campaign C register.

Target workflow: field nutrient requirement (`NutrientPlan.fieldRequirement`, Increment 1)
→ slurry recommendation / allocation → remaining chemical requirement → product
recommendation → whole-farm aggregation → quote request. This document covers the first
three steps and names the hand-off to the rest.

**Status:** 2a (this design) done; **2b done** 2026-10-02 —
`NutrientPlan.fieldRemainingRequirement` (`field_nutrient_remaining_v1`) implemented per §2.1,
additive, no consumer, engine `nutrient_engine_v1.4.0` unchanged (D8). **2c done**
2026-10-02 — `buildSlurryRateAllocation` is `slurry_rate_allocation_v0.3.0-draft`: reads
`fieldRequirement` / `fieldRemainingRequirement` per §2.2, exact requirement comparisons,
`plannedApplication` and `organicExcessOverRequirement` added; still unwired, no production
output change. `finalAllowedRate` keeps its name (§2.2's `recommendedRate`) and its DEFERRED
record unchanged. §7's `RATE_ALLOCATION_ARCHITECTURE.md` §2 discrepancy is fixed. **2d
done** 2026-10-02 (D1 authorised for the read-only diagnostic; D2(a): planned rate evaluated
only) — `SlurryDiagnosticCard` on the Nutrients page renders
`lib/slurry-diagnostic-presentation.ts` over `buildSlurryRateAllocation({ plan, plannedUse })`
for the page's own `plan`: planned rate / field total / DM% basis, and per nutrient the slurry
contribution, `fieldRequirement`, `fieldRemainingRequirement` and organic excess (unclamped),
each known / unknown (with its own reason) / not evaluated independently. No slurry planned →
"No slurry planned for this field."; all requirement arms `NOT_APPLICABLE` (tillage) → one
"Not evaluated" line, also shown beside the existing no-recommendation disclosure. Share caps,
90 kg K, external constraints and `finalAllowedRate` are not displayed. No layer logic,
version or `affectsProductionOutput` changed: the layer keeps `v0.3.0-draft` (the "leaves
`-draft`" in §3 is deferred until a release decision; no evaluation figure changed) and no
`NutrientPlan`, statutory or purchasing output changed. **2e products part implemented**
2026-10-03 (Session 2b; product owner: D3 (a), legacy purchase paths retired, D2 not
authorised, D4 / CC-B5 unchanged) — `calculateNutrientPlan` sizes the products from
`fieldRemainingRequirement` (the full `fieldRequirement` when the slurry credit cannot be
assessed, `RECOMMENDED_CREDIT_NOT_COUNTED`) and publishes `NutrientPlan.purchaseStatus`; mixed
fields stay withheld (`WITHHELD_MIXED_EVIDENCE`), tillage is `NOT_APPLICABLE`, no-livestock /
no-grassland-area grazing is `UNKNOWN`. Prompt, farm demand, finance, CSV, Evidence Report,
cards and the Phase 5 assessment read the status. The paired blend remains only for the CC-B5
buffer material and the NAP delivered total. Engine `nutrient_engine_v1.5.0`. **Farm aggregation
and quote basket implemented** 2026-10-03 (Session 3b): `aggregateFarmFertiliserPurchasing`
(`fertiliser-plan.ts`) aggregates field `purchaseStatus` + `purchasedProducts` (no requirement,
credit, product selection or price recomputed) and `buildFarmFertiliserQuoteBasket` builds the
review-only basket (READY / READY_WITH_PROVISIONAL_ITEMS / INCOMPLETE); see `DOMAIN_CONTRACTS.md`
(Session 3b). Not started: mixed-field purchasing (D3 b/c); basket persistence and supplier
submission are not authorised.

Line references are to the base commit.

## 1. Trace — what exists today

### 1.1 Modules and how they connect

| Module | Role | Status | Production callers |
|---|---|---|---|
| `slurry-allocation-plan.ts` | Validates a farmer-entered plan: field, store, volume, method, date (`validateNewSlurryAllocationPlan`, L121–157). Volume must not exceed the store's unallocated m³ (L139). Flags a second store for the same field (`createsMultiSourcePlan`, L151). `buildSlurryPlanningEntry` (L174–189) drives Today's "slurry spreading is open" entry | Production. Adds no science (header L6–14) | `store/farm-store.tsx:1131`, `app/actions/farm.ts:249`, `components/farm/SlurryPlanForm.tsx:54`, `app/(app)/today/page.tsx:455` |
| `slurry-storage.ts` | Physical tank view: reconciled volume (L61, via lifecycle), allocated sum (L62), `unallocatedM3 = max(0, volume − allocated)` (L73) with `allocationExceedsVolume` disclosing the floor (L74). Never reads `Housing.slurryEstimate` (header L11–19) | Production | `today/page.tsx:448`, `app/actions/fertiliser-plan-overview.ts:233`, `slurry-allocation-plan.ts:139` |
| `slurry-allocation-lifecycle.ts` | `planned` / `completed` / `cancelled` (L23), terminal transitions (L33–37), `isActiveReservation` = `planned` (L70–72), store reconciliation. Database triggers are the authority (header L5–9) | Production | `slurry-storage.ts`, `slurry-regulatory-context.ts:284`, `slurry-plan-lifecycle-view.ts`, `farm-store.tsx` |
| `slurry-timing.ts` | `classifySlurryTiming` (L41–49): Jan–Apr SPRING, May–Jun SUMMER, Jul–Oct LATE_SUMMER, else UNSUPPORTED. A label, not an availability rule (L15–23) | Production, via `nutrients.ts:897` | `nutrients.ts` only |
| `slurry-evidence-context.ts` | Campaign A read-only evidence boundary (`buildSlurryEvidenceContext`, L359): fields, store physical volume vs content, recorded DM%, planned vs completed applications; facts are `known` / `missing` / `conflicting` (L8–14) | Production, `slurry_evidence_context_v1.0.0` | `app/actions/what-matters-pilot.ts:339`; inside `slurry-regulatory-context.ts:731` |
| `slurry-regulatory-context.ts` | Campaign B: physical vs regulatory neat slurry vs composition (L10–15), farm regulatory context, spreadable area (a TOTAL_VOLUME blocker, never a RATE blocker, L20–24), origin, evidence checks. `fieldPlannedRegulatoryNeatSlurry` (L279–313) and `plannedRegulatoryNeatSlurryForNutrientPlan` (L810–825) feed the statutory ledger only. Never calculates a rate, volume or ranking (L7–8) | Production; Campaign B frozen at `b24c266` | `NutrientsPageClient.tsx:215,231`, `farm-store.tsx:1426`, `lib/farm-data/regulatory-evidence.ts:155`, `orchestration/scientific-evidence-report/index.ts:332` |
| `slurry-actionability-policy.ts` | What Matters pilot: regulatory gate → Rainfall Window Score ≥ 70 (Farm Return model policy, L63–66) → farmer confirmations (precedence L30–41) | Production, `slurry_actionability_policy_ie_v1.0.0` | `what-matters-pilot.ts:525` |
| `slurry-direct-economic-assessment.ts` | Phase 5: cost difference between a baseline plan (no slurry) and an intervention plan (with the allocation). Gate on the **paired** `availableNutrientAssessment` (L374, `…_UNSUPPORTED_SCIENCE` L402); counterfactual invariance on the **paired** `requirement` (L279) | Production; frozen inventory (`DOMAIN_CONTRACTS.md` L91) | `what-matters-pilot.ts:268` (plans built at L238–239) |
| `slurry-whole-farm-allocation.ts` | Phase 6: exact enumeration selecting at most one candidate per field (L427–441) to maximise audited net € within a known volume (unknown volume blocks, L301–305). Candidate volume must equal the Phase 5 volume (L372–382); non-comparable candidates excluded with reason (L391–399); scale bound (L443–448); tie-breaks (L462–477) | Frozen inventory; **no production caller** | tests only |
| `slurry-rate-allocation.ts` | Campaign C draft layer `slurry_rate_allocation_v0.2.0-draft`. Reads `requirementByNutrient`, `availableNutrientByNutrient`, `netRequirementByNutrient`, `fertilityEvidenceByNutrient` (L474–479). Records constraints; `finalAllowedRate` always DEFERRED (L525–531); every record `affectsProductionOutput: false` (L20–23) | Proposed, not frozen, **unwired** (`DOMAIN_CONTRACTS.md` "Campaign C — remaining programme") | none |
| `nutrients.ts` `calculateNutrientPlan` | Consumes one `slurryAllocation` (input L2036) and produces requirement, slurry credit, net requirement, products, statutory and buffer outputs | Production; frozen | every plan caller (§1.2) |

How the plan receives slurry: each caller resolves the field's allocations with
`resolveFieldSlurryAllocation` (`nutrients.ts` L180–216), which sums every allocation except
`priority: "not_suitable"`, keeps a method only when all sources agree and flags a conflict.
Callers: `finance.ts:165,320`, `real-alerts.ts:103`, `lib/reports.ts:70`,
`NutrientsPageClient.tsx:199`, `scientific-evidence-report/index.ts:300`,
`orchestration/fertiliser-plan/index.ts:471,506`, `orchestration/prompt/build-all.ts:113`,
`orchestration/prompt/recompute.ts:93`, `what-matters-pilot.ts:179`,
`what-matters-no-recommendation.ts:125`, `silage/page.tsx:36`,
`RecommendationAuditTrailCard.tsx:150`. The allocations come from
`listSlurryAllocationsForFarm`, which returns **planned rows only**
(`lib/farm-data/slurry.ts:30`, `.eq("status", "planned")`).

### 1.2 Volumes, prioritisation and rate

- **Volume source.** A store's available slurry is the farmer's fill observation less
  completed withdrawals (`slurry-storage.ts:61`), less planned reservations (L62, L73).
  The projected-production `slurryEstimate` is never used. Regulatory neat slurry is a
  separate fact and is `missing` unless declared (`slurry-regulatory-context.ts` L10–15).
- **Prioritisation.** No engine ranks fields. `SlurryAllocation.priority` / `score`
  (`types.ts` L480–485) are absent on farmer-planned rows. They only exist in mock data
  (`data/mock-farm.ts:366–368`), and the real-mode Housing screen passes `[]` to
  `SuggestedAllocationCard` (`housing/page.tsx:303`). The only selection logic is
  Phase 6's economic optimiser, which has no production caller.
- **Rate.** The rate is an input: `rateM3ha = volumeM3 / field.areaHa`, or 0 with no
  allocation or `not_suitable` (`nutrients.ts:2262`). Nothing chooses it
  (`RATE_ALLOCATION_ARCHITECTURE.md` §1 row 4). The draft layer compares available P/K at
  that planned rate with the requirement and never inverts kg to m³.
- **Table selection.** `selectSlurryAvailabilityTable` (`nutrients.ts:959`) uses method,
  rate, DM% and DM% status, and the timing from the allocation date (L890–898). With no
  date, SPRING is assumed and flagged (`timingAssumed`). LATE_SUMMER / UNSUPPORTED have no
  evidenced rule (L814–829). If several stores each have a recorded composition, the
  credit blocks with `SLURRY_COMPOSITION_SOURCES_UNRESOLVED` (L2280–2287).

Classification of outputs:

| Output | Class |
|---|---|
| Paired `requirement`, `organicApplication.offset*`, `availableNutrientAssessment`, `netRequirement`, `purchasedProducts`, NAP, statutory, buffer | Production, frozen |
| `requirementByNutrient`, `availableNutrientByNutrient`, `availableNutrientBasis`, `netRequirementByNutrient` | Production (frozen additive); read by the mixed-field report (`mixedRequirementReport`) and the draft layer |
| `fieldRequirement` | Production (frozen additive), no consumer yet |
| Phase 5 assessment | Production (What Matters pilot) |
| Phase 6 whole-farm result | Frozen, unwired |
| `SlurryRateAllocation` | Draft, unwired |

### 1.3 Which inputs each step reads, and where unknown becomes 0

| Step | Reads | Unknown → 0 (or substitute) |
|---|---|---|
| Gross requirement | Unrounded `grossN/P/K` (L2242–2260) from the real index or the **Index-1 placeholder** (L2225–2226) | Placeholder is a substitute, not a 0. Paired `requirement` publishes `{n, 0, 0}` `unavailable` when an index is missing, and `n: 0` when silage evidence is missing (L2680–2692) |
| Paired slurry credit | `availableNutrientAssessment` (paired, L2303–2306) | Non-OK assessment → offset `{0,0,0}`, or `{n, 0, 0}` when only fertility blocks (L2318–2323). `offsetP/K` published as 0 when fertility is not OK (L2753–2754). Disclosed by `requirementProvisional` (L2892–2902) |
| Paired remaining | `remainingX = max(0, grossX − offset.x)` (L2325–2327) | `max(0, …)` hides an organic excess. Blocked credit is counted as 0 credit. `netRequirement` is `{0,0,0}` `unavailable` when not `netEvidenceOk` (L2698, L2814–2825) |
| Products | `allocatePurchasedProducts(remainingN, remainingP, remainingK)` (L2361–2366) | Sized from placeholder figures when an index is missing, then withheld (L2699–2701) |
| Buffer material | Whether that provisional blend is non-empty (L2380) | **CC-B5**: the placeholder decides `chemical_fertiliser` vs `organic_fertiliser_or_soiled_water` |
| Per-nutrient gross / net | `requirementByNutrient` (L2836–2846), `netArm` over `availableNutrientByNutrient` (L2852–2862) | None. Unknown stays blocked; `NOT_APPLICABLE` credit (no slurry) is a real known zero (L2854) |
| Canonical requirement | `buildFieldNutrientRequirement` (L1947–2022) | None. `UNKNOWN` carries no number; tillage `NOT_APPLICABLE`; no livestock / grassland area ≤ 0 `UNKNOWN` (L1970–1996) |
| Draft layer | Per-nutrient arms (`slurry-rate-allocation.ts` L474–476) | Only a real zero: `NOT_APPLICABLE` with `rateM3ha ≤ 0` → known 0 (L227). A known P beside an unknown K is never a known production offset (L498–505) |
| Phase 5 | Paired assessment and paired requirement (L279, L374) | A mixed field is `UNSUPPORTED_SCIENCE`, never € 0 |
| Farm aggregation | `finance.ts:195` skips fields whose paired `requirement` is not `estimated` and counts them | Not a 0 in the total; counted as `fieldsWithBlockedEvidence` |
| Store view | `unallocatedM3` floored at 0 (`slurry-storage.ts:73`) | Disclosed by `allocationExceedsVolume` |

Note that the per-nutrient `netRequirementByNutrient` still differs from `fieldRequirement`
in three ways: it is rounded, it is not `NOT_APPLICABLE` for tillage, and it carries a grazing
figure with no livestock or no grassland area. There is no canonical (unrounded, `fieldRequirement`-based)
remaining chemical requirement today.

### 1.4 Rule evidence status

From `campaign-c/SOURCES_AND_CLAIMS.md` §6.2, §6.3, §7, §8, `AI_ADJUDICATION_2026-09-29.md`,
`RATE_ALLOCATION_ARCHITECTURE.md` §3 and `BLOCKERS.md`.

| Rule | Evidence | Status in code |
|---|---|---|
| Deduct organic nutrient before chemical (`CLM-TGC-OM-BALANCE`, `CLM-TGC-RATE-DEDUCT`) | REPOSITORY_VERIFIED | Production (`remainingX`, per-nutrient `netArm`) |
| Slurry P × 0.50 / K × 0.90 on Index 1/2 (`CLM-TGC-OM-AVAIL`) | REPOSITORY_VERIFIED | Production (CC-B2, CC-B4A) |
| Rate based on crop P/K; no excess (`CLM-TGC-OM-RATE`, `-EXCESS`) | REPOSITORY_VERIFIED (principle, not an algorithm) | Draft `P_/K_REQUIREMENT_LIMIT` records (L247–294), unwired |
| Share caps P 50 % / K 75 % on Index 1/2 (`CLM-TGC-OM-SHARE-P/-K`) | Caps REPOSITORY_VERIFIED; comparison basis (available vs total) `CLM-AIR-CONF03-SHARE` AI_PROVISIONAL | Draft: limit recorded, binding UNDETERMINED on Index 1/2; Index 3 evaluated; Index 4 not addressed (L296–388) |
| Rate selector `AI_PROVISIONAL_RATE_SELECTOR_V1` (`CLM-AIR-GAP01-SELECTOR`) | AI_PROVISIONAL / AI_REVIEW_ONLY | Not implemented; `finalAllowedRate` DEFERRED (L525–531). `CLM-TGC-RATE-P` is P-led, cereal only |
| 90 kg K spring (`CLM-TGC-K90-SPRING`, `-SPLIT`) | Text REPOSITORY_VERIFIED; slurry-K reconciliation `CLM-AIR-CONF02-RECON` AI_PROVISIONAL | Draft `NOT_ENFORCED`, first-cut only (L390–433); slurry K never truncated |
| Timing boundaries | Carbon Navigator periods in production; "February to April" month wording REPOSITORY_VERIFIED; exact 1 Feb – 30 Apr `CLM-AIR-CONF04-SPRING` AI_PROVISIONAL | Production months 1–4 SPRING unchanged (CC-FU-C open) |
| Statutory closed periods | Campaign B (`closed-period-calendar.ts`, frozen) | Production gates via `checkClosedPeriodCalendar` (`spreading-window-gate.ts`, used by `spreading-actionability-foundation.ts:201`; `spreading-legal-gate.ts`; `real-alerts.ts`; the spreading page; `app/actions/fertiliser-plan.ts`; `app/actions/job-sessions.ts`). Not a nutrient-credit input; the draft layer only takes them as caller-supplied `TIMING_LIMIT` / `REGULATORY_LIMIT` records (L435–468) |
| National buffer material with an index missing | **CC-B5 OPEN**, needs Campaign B decision | Placeholder-driven (L2380) |
| First-cut N yield scaling | REPOSITORY_VERIFIED, range unclear | Not applied (`N_YIELD_SCALING_NOT_APPLIED`) |

## 2. Target shapes

Principles: consume `fieldRequirement` and the per-nutrient credit arms unmodified; never
re-derive table selection, availability factors or gross requirement outside
`nutrients.ts`; UNKNOWN is never 0; P and K are independent; no non-REPOSITORY_VERIFIED
rule changes a production number.

### 2.1 Canonical remaining chemical requirement (in `nutrients.ts`)

The subtraction belongs to the engine that owns both operands, so it is computed once in
`calculateNutrientPlan` and never in a second layer:

```ts
// types.ts — additive
type FieldNutrientRemainingArm =
  | { status: "KNOWN"; kgHa: number;            // unrounded max(0, requirement − credit)
      totalKg: EngineOutcome<number>;           // × areaHa; MISSING_FIELD_AREA as fieldRequirement
      requirementKgHa: number; creditKgHa: number;
      creditBasis: "NO_SLURRY_PLANNED" | "SLURRY_CREDIT";
      evidenceState: EvidenceState }            // weakest of requirement and credit
  | { status: "UNKNOWN"; reasonCode: string; missingInputs: string[];
      cause: "REQUIREMENT_UNKNOWN" | "SLURRY_CREDIT_UNKNOWN" }
  | { status: "NOT_APPLICABLE"; reasonCode: string };   // requirement NOT_APPLICABLE

interface FieldNutrientRemainingRequirement {
  contractVersion: "field_nutrient_remaining_v1";
  requirementContractVersion: "field_nutrient_requirement_v1";
  engineVersion: string; fieldId: string; areaHa: number;
  n: FieldNutrientRemainingArm; p: FieldNutrientRemainingArm; k: FieldNutrientRemainingArm;
}
// NutrientPlan.fieldRemainingRequirement: FieldNutrientRemainingRequirement
```

Rules per nutrient:
- requirement `NOT_APPLICABLE` → `NOT_APPLICABLE`; requirement `UNKNOWN` → `UNKNOWN`
  (`REQUIREMENT_UNKNOWN`, its reason and inputs).
- credit arm `NOT_APPLICABLE` (no slurry planned) → known zero credit
  (`NO_SLURRY_PLANNED`), the same rule as `netArm` (L2854).
- credit arm OK → `max(0, kgHa − credit)`; any other credit outcome (blocked, ambiguous,
  unsupported timing/method, unresolved composition, missing own index) → `UNKNOWN`
  (`SLURRY_CREDIT_UNKNOWN`). Never 0.
- Invariant (test): where the requirement arm is KNOWN, `Math.round(kgHa)` equals the
  OK `netRequirementByNutrient` arm (same operands, same `max(0, …)`).
- The organic excess (`credit − requirement` when positive) is **not** encoded here; the
  allocation layer reports it (§2.2), so `max(0, …)` never hides it from the recommendation.

### 2.2 Slurry recommendation per field (the draft layer, evolved)

`buildSlurryRateAllocation` stays the single home (no new parallel module). v0.3.0-draft:

```ts
interface FieldSlurryRecommendation {           // SlurryRateAllocation, extended
  fieldId; calculationVersion: "slurry_rate_allocation_v0.3.0-draft"; upstreamCalculationVersion;
  requirement: { contractVersion; n; p; k }     // fieldRequirement arms, unmodified
  plannedApplication:
    | { status: "NONE_PLANNED" }
    | { status: "PLANNED"; rateM3ha; totalM3; basis: availableNutrientBasis outcome };
  availableSlurryNutrient: PerNutrient<AllocationQuantity>;   // availableNutrientByNutrient, unrounded
  organicExcessOverRequirement: PerNutrient<AllocationQuantity>; // from P_/K_REQUIREMENT_LIMIT; N recorded, not a rule
  remainingChemicalRequirement: { n; p; k }     // fieldRemainingRequirement arms, unmodified
  rateConstraints: RateConstraintRecord[];      // unchanged record shape
  recommendedRate: { status: "DEFERRED"; deferral: "RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL"; … };
  affectsProductionOutput: false;               // per record and per result, until D1
}
```

- With unrounded `fieldRequirement` and credit, the requirement-limit comparison is exact;
  the ±0.5 kg/ha rounding interval (L193–199) applies only while the layer still reads
  rounded arms.
- Tillage → every requirement constraint `NOT_EVALUATED` with the requirement's reason; a
  grazing field with no livestock or grassland area → `UNDETERMINED`, never a limit of 0.
- Mixed P/K: the known nutrient's limit, excess and remaining are evaluated; the other
  stays unknown with its own reason. No min(P, K).
- Share caps, 90 kg K and external constraints keep today's records and deferrals.

### 2.3 Hand-off interfaces (named only)

- **Product recommendation** consumes `fieldRemainingRequirement` (per nutrient, unrounded,
  with totals) in place of the paired `remainingX` passed to `allocatePurchasedProducts`.
- **Whole-farm aggregation** (`finance.ts` `calculateFarmFertiliserRequirement`,
  `orchestration/fertiliser-plan` `getFarmFertiliserDemand`) sums known `totalKg` and counts
  unknown / not-applicable fields separately, never as 0.
- **Quote request** reads the aggregation; it never reads slurry figures directly.
- **Finite farm slurry distribution** (Phase 6) stays economic. Any requirement-led
  distribution across fields needs the selector (D1/D2).

## 3. Staged plan

Each increment is independently shippable and audited. "Protocol" = DOMAIN_CONTRACTS
contract-change protocol.

| Inc. | Scope | Modules | Contract change | Tests | Version | Production output change |
|---|---|---|---|---|---|---|
| 2b | Canonical remaining chemical requirement (§2.1) | `types.ts`, `nutrients.ts`; hand-built `NutrientPlan` fixtures gain the field | Additive frozen change, non-breaking carve-out (steps 1–3), like Increment 1 | Equality with `netRequirementByNutrient` after rounding for every Index 1–4 / grazing / silage case; P/K independence; unknown credit → UNKNOWN (missing index, LATE_SUMMER, unsupported method, unresolved composition, method conflict); no slurry → known zero credit; tillage NA; no livestock / area UNKNOWN; totals and `MISSING_FIELD_AREA`; digest baseline unchanged with the new field excluded; CC-B5 regression cases unchanged | Engine unchanged (Increment 1 precedent: additive, no consumer) — confirm under D8 | None |
| 2c | Draft layer reads `fieldRequirement` / `fieldRemainingRequirement` (§2.2) | `slurry-rate-allocation.ts` (not frozen) | Campaign C draft contract table updated; no frozen change | Existing layer tests remapped; exact comparisons without the rounding interval; tillage / no-livestock / mixed cases; `affectsProductionOutput: false` everywhere; no-selector regression kept | `v0.2.0-draft` → `v0.3.0-draft` | None (unwired) |
| 2d | Read-only per-field slurry diagnostic on the Nutrients page: planned rate, available nutrient, REPOSITORY_VERIFIED requirement-limit excess, remaining chemical requirement; provisional rules shown as "not evaluated" | New orchestration read path + presentation helper; card | None frozen | Orchestration and component tests; honest empty states; visual check | Layer leaves `-draft` | **Yes** (new farmer-visible figures). Gated on D1 (Campaign C production authorisation) |
| 2e | Migrate remaining-chemical consumers to `fieldRemainingRequirement` (products, farm demand, quote basket, CSV, Evidence Report, prompt) | `nutrients.ts`, `finance.ts`, orchestration, reports | Breaking for tillage / no-livestock outputs → full protocol | Per consumer; legacy-path tests flipped deliberately | Engine bump | **Yes** (tillage and no-livestock fields lose fabricated figures; mixed fields gain known-nutrient products under D3). Belongs to Increment 3; gated on D3, D4 |
| 2f | Requirement-led slurry rate / farm distribution | Layer + Phase 6 hand-off | — | — | — | **Blocked** on D1/D2 (selector AI_PROVISIONAL) |

2b and 2c need no decision. 2d–2f do not start until the decisions they cite are recorded.

## 4. Decisions that are not engineering

| # | Owner | Question | Options and consequences |
|---|---|---|---|
| D1 | Product owner + Campaign C expert validation | May provisional Campaign C rules (share-cap basis `CONF03`, slurry-K 90 kg `CONF02`, selector `GAP01`, 1 Feb boundary `CONF04`) affect recommendations? | (a) **Recorded only** until expert validation (current state; recommended). Nothing provisional changes a number. (b) Shown as labelled advisory text, no number change. Needs copy review; risk of being read as advice. (c) Adopted in production. Not permitted by the evidence gate (`BLOCKERS.md` current phase) without validation; this design does not assume it. Separately: is a read-only diagnostic built only from REPOSITORY_VERIFIED records (2d) authorised production work? `BLOCKERS.md` says Campaign C production implementation "is not generally authorised" |
| D2 | Product owner + science | Should Farm Return recommend a slurry rate before a selector is validated? | (a) Evaluate the farmer's planned rate only (verified principles; no recommended m³/ha). (b) P-led rate per `CLM-TGC-RATE-P`. Cereal-only source, outside v1 grassland scope. (c) min(P, K) selector. AI_PROVISIONAL. (a) is the only option within the evidence gate |
| D3 | Product owner + science (Campaign C) | Mixed P/K fields: products for the known nutrient | Every catalogue blend carries both P and K (`RATE_ALLOCATION_ARCHITECTURE.md` §5 item 5). (a) Withhold products until both indices exist (today). (b) Single-nutrient products only, if the catalogue holds them. (c) Blend anyway, disclosing the other nutrient as delivered against an unknown requirement. Slurry recommendation itself is unaffected: the known nutrient's credit and remaining are already per nutrient |
| D4 | Campaign B (separately authorised task) | CC-B5: buffer material when the purchase requirement is unknown | (a) Keep the placeholder (status quo; placeholder-derived statutory output). (b) Block `nationalBufferDistanceStatus` when either index is missing (fails closed; some `LEGAL_PROHIBITION` / `OK` results become blocked). (c) Evaluate both materials and report the stricter. Placeholder removal (CP3) and Increment 2e for mixed fields stay blocked until decided |
| D5 | Product owner | Completed spreading and the season's credit | Only `planned` rows feed `calculateNutrientPlan` (`lib/farm-data/slurry.ts:30`); after completion the credit leaves the plan and the remaining chemical requirement returns to gross. (a) Keep (plan-only view). (b) Count completed actual volume for the current crop cycle. Needs crop-cycle persistence (GAP-08 / CC-B3, migration not authorised) |
| D6 | Product owner | Missing application date | SPRING is assumed and flagged (`timingAssumed`). (a) Keep. (b) Require a date before any slurry recommendation figure is shown. January stays SPRING until CC-FU-C is resolved |
| D7 | Product owner | Fields supplied by several stores | Composition across stores blocks the credit; Phase 6 values one action per field. Options: keep blocking, or capture one blended DM% per field (a new input, not a derived figure) |
| D8 | Engineering governance (record only) | Engine-version policy for additive canonical fields with no consumer | Increment 1 kept `v1.4.0`; 2b follows it unless the owner prefers a bump. A bump is required when a consumer changes a published figure (2e) |

## 5. What must stay unchanged

- Campaign B statutory behaviour: closed periods, LESS, NAP, statutory manure value,
  regulatory neat slurry, origin, spreadable area, commonage and buffer gates, including
  the CC-B5 placeholder path until D4.
- Frozen contracts: paired `requirement`, `netRequirement`, `offset*`,
  `availableNutrientAssessment`, `purchasedProducts`, `requirementByNutrient`,
  `netRequirementByNutrient`, `availableNutrientByNutrient`, `availableNutrientBasis`,
  `fieldRequirement`; Phase 5 and Phase 6 signatures and results; `classifySlurryTiming`.
- Slurry science: table selection, DM% hierarchy, availability factors, timing rules.
- Existing production outputs in 2b and 2c (digest equality and CC-B5 regression cases).
- The farmer-entered allocation workflow and lifecycle (validation, reservations,
  reconciliation, database triggers). No migration.
- Unwired status of Phase 6 and the draft layer until a decision authorises wiring.

## 6. LEGACY_COMPATIBILITY_PATHs

| Path | This design |
|---|---|
| Tillage (paired requirement from grassland tables, gated by callers) | Kept in 2b–2d. Purchase figures retired in 2e (Session 2b, `NOT_APPLICABLE`); paired `requirement` kept |
| Grazing with no grassland area / no livestock (paired fabricated or clamped figure) | Kept in 2b–2d; purchase figures retired in 2e (Session 2b, `UNKNOWN`); paired `requirement` kept |
| Mixed P/K paired outputs (requirement, net, purchasing, NAP, statutory) | Slurry recommendation and remaining requirement become per nutrient (2b, 2c). Paired outputs kept; purchasing waits for D3, statutory for Campaign B |
| CC-B5 buffer placeholder | Kept (D4). From Session 2b the paired blend decides only the buffer material and the NAP delivered total |
| Silage N yield scaling not applied | Kept (`N_YIELD_SCALING_NOT_APPLIED` passes through) |
| Phase 5 reads the paired assessment and requirement | Kept. Mixed fields stay `UNSUPPORTED_SCIENCE` in What Matters; moving it to per-nutrient arms is a separate frozen-contract task |

## 7. Documentation discrepancies found (not fixed here)

- `RATE_ALLOCATION_ARCHITECTURE.md` §2 still names `plan.requirement` / `plan.netRequirement`
  as the layer's sources; since v0.2.0-draft the code reads the per-nutrient arms
  (`slurry-rate-allocation.ts` L474–476).
- `types.ts` L502–507 (`SlurryAllocation.applicationDate`) says the date does not drive the
  availability table; since Slurry Timing Evidence Patch V1 it does (`nutrients.ts` L814–829,
  L890–898). Code comments are outside this task's scope.

## 8. STOP-condition review

The design needs no non-REPOSITORY_VERIFIED rule as production: provisional rules stay
recorded-only (D1(a)), the recommended rate stays DEFERRED (D2(a)), and every increment that
would change a production output is gated on an explicit decision. No non-documentation
change was needed.
