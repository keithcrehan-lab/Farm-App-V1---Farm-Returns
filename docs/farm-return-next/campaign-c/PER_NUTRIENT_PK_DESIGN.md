# Campaign C — independent per-nutrient P/K architecture design

Task `per-nutrient-p-k-architecture-design-20261001`, base `6535b84`. **Design only.** No
production code, test, migration, frozen contract or engine version changes here. The
engine stays `nutrient_engine_v1.2.0`. There were no WebFetch/WebSearch calls.

This document builds on [RATE_ALLOCATION_ARCHITECTURE.md](RATE_ALLOCATION_ARCHITECTURE.md)
§5 and does not repeat it. §5 numbers seven items. The task brief calls them "six change
points"; item 7 (What Matters economics) is covered too, as CP7.

## 0. Scientific basis (settled, not reinterpreted)

GAP-04 is RESOLVED (SOURCE_DIRECT, REPOSITORY_VERIFIED): the P Index governs P and the K
Index governs K (`CLM-GB-9-8-FN3`;
[AI_ADJUDICATION_2026-09-29.md](AI_ADJUDICATION_2026-09-29.md) GAP-04). Nothing here needs
a new rule. The repository already computes each nutrient from its own index only:

| Quantity | P depends on | K depends on | Reference (`src/domain/nutrients.ts`) |
|---|---|---|---|
| Gross requirement, silage | `pBuildUpKgHa(pIndex)` + `pMaintenanceSilageKgHa(cut, pIndex, yield)` | `kSilageKgHa(cut, kIndex, yield)` | 1979–1983 |
| Gross requirement, grazing | `pBuildUpKgHa(pIndex)` + `pMaintenanceGrazingKgHa(...)` | `kGrazingKgHa(kIndex, ...)` | 1990–1992 |
| Slurry availability factor | `pIndex <= 2` → × 0.5 | `kIndex <= 2` → × 0.9 | `applyLowSoilIndexAvailability`, 552–572 |
| Statutory manure value, NAP ceiling | P Index (laboratory) | — (K has no NAP ceiling, 1631) | 2203–2222, 2263–2284 |

Per-nutrient handling therefore only changes **which outputs are released**. It never
changes a coefficient. A fully-indexed field must produce byte-identical outputs.

## 1. Verified corrections to §5 (consumer lists only; scientific basis unaffected)

These were checked against the code at `6535b84`. None changes the scientific basis, so
the STOP condition is not met.

- **§5.1's `fertilityEvidence` consumer list overstates direct code readers.** `finance.ts`
  (178–195, 350–356), `app/actions/farm.ts` (69), `nutrient-plan-trace.ts` (43) and
  `PurchasedFertiliserCard.tsx` (17–20) mention it **only in comments**. They gate on
  `requirement.status` or `napCompliance` instead. Code readers are `real-alerts.ts` 159,
  `lib/reports.ts` 131, `orchestration/prompt/fertiliser-recommendation.ts` 274–275,
  `NutrientsPageClient.tsx` 362, `NutrientRequirementCard.tsx` 46–48 and
  `slurry-rate-allocation.ts` 223–226. §5 omits the last one.
- **§5's closing claim that the allocation layer "needs no change"** is true of its
  *output* shape (per-nutrient `AllocationQuantity`). Its *input mapping* reads the paired
  shapes: `soilIndexFor` (223–226), `trackedPerNutrient` (194–203, all three unknown when
  `requirement` is `unavailable`) and the `MISSING_SOIL_FERTILITY_INDEX` special case
  (215–219). Until it is remapped it fails closed (P and K unknown). This is safe. The
  layer has no production caller.
- **The `missingInputs` on the paired blocks are imprecise today.** `napComplianceFinal`
  always lists both indices (2429). `statutoryManureValue` always lists only
  `fertility.pIndex` (2472), even when only K is missing. This is a pre-existing
  labelling issue, not a value defect. It is listed for Increment 1 (§4), not fixed here.

## 2. Change points

Line numbers are at `6535b84`. "Additive" means the contract-change protocol's
non-breaking carve-out ([DOMAIN_CONTRACTS.md](../DOMAIN_CONTRACTS.md) "Contract-change
protocol"): steps 1–3 apply, `contracts_frozen` stays `true`. "Breaking" means all four
steps apply.

### CP1 — fertility evidence (`NutrientPlan.fertilityEvidence`)

**Current frozen shape.** `types.ts` 644: `EngineOutcome<{ pIndex; kIndex }>`. Computed at
`nutrients.ts` 1946–1957. It is OK only if both indices exist. `evidenceState` is
`MEASURED` only if both are `verified`, otherwise `IRISH_DEFAULT`. When it is blocked:
`MISSING_SOIL_FERTILITY_INDEX`, with `missingInputs` naming whichever index is absent.
**Precedent for a per-nutrient shape already exists**: `soilIndexProvenance: { p; k }`
(`types.ts` 652, `soil-index-provenance.ts` 83). The soil-test age rule
`soilTestAgeValidityForFertility` is already P-only (`nutrients.ts` 1869–1882).

**Target A (additive).** A new field
`fertilityEvidenceByNutrient: { p: EngineOutcome<{ index: SoilIndex }>; k: EngineOutcome<{ index: SoilIndex }> }`.
Each arm is OK if its own index exists, with `MEASURED` only if that index is `verified`
(the existing rule applied per nutrient). If its index is missing, the arm is
`BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` with only its own input
listed. The paired `fertilityEvidence` is kept unchanged and documented as the
conjunction of the two arms.

**Target B (breaking).** Replace `fertilityEvidence` with the per-nutrient shape and update
every reader in one commit.

**Consumers (code reads).** `real-alerts.ts` 159, `lib/reports.ts` 131,
`fertiliser-recommendation.ts` 274–275, `NutrientsPageClient.tsx` 362,
`NutrientRequirementCard.tsx` 46–48, `slurry-rate-allocation.ts` 224–225, and internal
uses in `nutrients.ts` 2032–2033, 2374, 2428, 2470, 2478–2479.

**Fail-closed.** The unknown nutrient's arm has no `value`. The paired outcome stays
blocked whenever either arm is blocked, so every existing consumer behaves exactly as
today.

**Recommendation: Target A.** It is the only shape that ships without touching any current
consumer. Under Target B, the six readers above would each need a fresh decision about
the mixed case in the same commit.

### CP2 — requirement status (`requirement`, `netRequirement`)

**Current frozen shape.** `types.ts` 653 and 753: `TrackedValue<{ n; p; k }>` with one
`status`. `nutrients.ts` 2398–2417: when evidence is missing the value is
`{ n, p: 0, k: 0 }` with `status: "unavailable"`, so a numeric 0 sits on the unknown arm
and every consumer must check `status`. `netRequirement` (2532–2543) is `{0,0,0}` /
`unavailable` unless `netEvidenceOk` (2423), which also requires a resolved slurry
composition.

**Target A (additive).**
`requirementByNutrient: { n: EngineOutcome<number>; p: EngineOutcome<number>; k: EngineOutcome<number> }`
and `netRequirementByNutrient` with the same shape. The unknown arm carries no number.
Each gross arm keeps the paired field's source, version and rounding (`Math.round` of the
same `grossX` locals, never a second derivation).

The net arms must **not** reuse `remainingP` / `remainingK` (2054–2055). Those subtract the
paired `offset` (2046–2051), which sets P and K to 0 whenever either index is missing, so
in a mixed case they equal the gross requirement even when the known nutrient's CP4
credit is positive. Instead, one shared per-nutrient remaining calculation,
`remainingByNutrient.x = max(0, grossX − creditByNutrient.x.kgHa)`, consumes CP4's
`availableNutrientByNutrient` arm. It is computed once in `calculateNutrientPlan` and is
the only source of each net arm. For a fully-indexed field the per-nutrient credit equals
`offset.x`, so it equals `remainingX` exactly. The legacy `offset`, `remainingX`,
`offsetP` / `offsetK` and paired `netRequirement` stay as they are: they still feed the
paired outputs and `allocatePurchasedProducts`, and stay `unavailable` / 0 in any mixed
case. `netRequirementByNutrient` therefore depends on CP4 and ships with it (Increment 3,
§4), not before.

**Target B (breaking).** Give `requirement` per-nutrient statuses inside the existing
object.

**Consumers.** `finance.ts` 195 and 356 (counts fields as blocked unless
`status === "estimated"`), `slurry-direct-economic-assessment.ts` 267–279
(`requirementsEqual`, counterfactual invariance), `slurry-rate-allocation.ts` 455 and
457, `scientific-evidence-report/index.ts` 325, 328 and 376,
`fertiliser-recommendation.ts` 289 and 304, `NutrientRequirementCard.tsx` 35–88,
`PurchasedFertiliserCard.tsx` (props 35–51, `reconcileDeliveredSupply` 136),
`NutrientsPageClient.tsx` 410–411 and 516, `EvidenceReportPageClient.tsx` 285 and 287,
`lib/reports.ts` 185–187. `orchestration/fertiliser-plan` receives `requirementKgHa` from
its callers (`index.ts` 186–201).

**Hazard Target B creates.** At least five consumers read `requirement.status ===
"estimated"` as "the whole plan is available". Under Target B, flipping the paired status
for a mixed field would export the unknown nutrient's 0 as a real value. That is
UNKNOWN→zero.

**Fail-closed.** The unknown arm is `BLOCKED_INSUFFICIENT_EVIDENCE` with its own
`missingInputs`. N keeps today's rule: kept unless silage evidence is missing (2411). The
net arm of the known nutrient is blocked if its slurry credit is unknown (CP4) or the
composition is unresolved.

**Recommendation: Target A, using `EngineOutcome<number>` arms,** so an unknown value is
structurally unrepresentable as a number.

### CP3 — the Index-1 placeholder

**Current.** `nutrients.ts` 1958–1959: `pIndex = pIndexTracked?.value ?? 1`, and the same
for K. The placeholder feeds gross P/K (1982–1992), the slurry resolver (2023–2024), the
statutory manure value (2215, 2222), `checkNapCompliance` (2277) and the Index-4 home-manure
branch (2452). It is harmless today only because every output is gated on the pair
(2374–2479; comment 1932–1945).

**Target A.** Per-nutrient `SoilIndex | undefined`. Each index-dependent function is
called only when its own index exists, and the unknown arm is never computed.

**Target B.** Keep the placeholder and add a per-nutrient gate on every output.

**Consumers.** None outside `nutrients.ts`, which keeps it private. The exported
`slurryAvailableKgHa(rate, dm, pIndex, kIndex)` (574–581) and
`resolveAvailableSlurryNutrients` (919–926) take required `SoilIndex` values for both
nutrients. Under Target A they are called only when both indices exist (the paired path),
or through CP4's per-nutrient entry point.

**Fail-closed.** No placeholder-derived number exists for the unknown nutrient.

**Recommendation: Target A.** Once gating is per nutrient, a placeholder-derived K would
sit next to a real P in the same object, and one missed gate would leak it. The
placeholder must go before any known-nutrient output is released.

### CP4 — slurry credit (`resolveAvailableSlurryNutrients` / `availableNutrientAssessment`)

**Current frozen shape.** The resolver (`nutrients.ts` 919–926) requires both indices and
returns one `EngineOutcome` with `n`, `p`, `k` and `soilIndexAdjustmentApplied: { p; k }`
(`types.ts` 693–719). `calculateNutrientPlan` overrides an OK result with the paired
fertility block (2031–2034, the CC-B2 / CC-B4A guard). It keeps N through the F003 branch
(2046–2051) and zeroes `offsetP` / `offsetK` (2478–2479). `requirementProvisional`
(2561–2571) then reports "Slurry nutrient credit not included" for the missing-index case.

**Target A (additive).** A new exported per-nutrient view,
`organicApplication.availableNutrientByNutrient: { n; p; k: EngineOutcome<{ kgHa; soilIndexAdjustmentApplied?: boolean }> }`.
It is produced from the **same** table selection as the existing resolver. Refactor the
resolver body so the table/method/timing choice runs once and the paired outcome is
derived from it, never duplicated. The existing `availableNutrientAssessment`,
`offsetP` / `offsetK` and the guard stay byte-identical.

**Target B (breaking).** Make `availableNutrientAssessment` per nutrient.

**Consumers.** `slurry-rate-allocation.ts` 206–220 and 458–459,
`slurry-direct-economic-assessment.ts` 182, 374 and 400, `OrganicNutrientsCard.tsx` 55,
62, 80, 205 and 230, `fertiliser-recommendation.ts` 293–295, `lib/reports.ts` 189–190,
`EvidenceReportPageClient.tsx` 286. Also `requirementProvisional`, which is frozen; any
wording change is a CC-FU-A-style UI task.

**Fail-closed.** The unknown nutrient's arm is `BLOCKED_INSUFFICIENT_EVIDENCE` /
`MISSING_SOIL_FERTILITY_INDEX`. The known nutrient's arm applies **only its own** Index 1/2
factor, which is the existing `applyLowSoilIndexAvailability` logic split per argument
(not a new rule). A table-level block (unsupported method, timing or DM%, unresolved
composition) still blocks every arm, as today. N is unchanged (CC-B2 F003).

**Recommendation: Target A.** Under Target B, `slurry-direct-economic-assessment` would
start treating a mixed OK as supported science (CP7) before CP5 is decided.

### CP5 — purchased products (`purchasedProducts`, `deliveredKgHa`)

**Current.** `allocatePurchasedProducts` (`nutrients.ts` 1680–1730, private) is a fixed
waterfall over three blends (`PRODUCTS`, 1497): 0-7-30 sized to K, 18-6-12 sized to the P
still needed, then Protected Urea. Every P or K product brings the other nutrient.
`purchasedProducts`, `deliveredKgHa` and `estimatedFieldCostEur` are emptied unless
`netEvidenceOk` (2423–2426). N purchasing is therefore withheld too when either index is
missing, even though `requirement.n` is disclosed. `deliveredKgHa.p` feeds the NAP total
(2236–2253).

**Consumers.** `finance.ts` 195–199, `fertiliser-plan.ts` 206–209,
`slurry-direct-economic-assessment.ts` 309–310, `fertiliser-recommendation.ts` 296 and
305, `scientific-evidence-report/index.ts` 328, `NutrientsPageClient.tsx` 362, 408 and
524, `PurchasedFertiliserCard.tsx`, `EvidenceReportPageClient.tsx` 310–314,
`lib/reports.ts` 160–164, `orchestration/fertiliser-plan/index.ts` 337.

**Target shapes.** These depend on decision D1 (§5). The engineering is straightforward
once the rule is chosen. The rule itself is not engineering.

**Fail-closed (any option).** No product is sized against an unknown requirement. The
unknown nutrient a blend delivers is disclosed as "applied against an unknown
requirement", never reconciled against 0 (`reconcileDeliveredSupply`, 1636–1652, would
otherwise report a false "excess").

**Recommendation.** Keep today's behaviour (no products when either index is missing)
through Increments 1–5. Implement only after D1.

### CP6 — statutory P outputs (`napCompliance`, `statutoryManureValue`)

**Current.** `types.ts` 778 and 786. Both are computed from the P Index only:
`statutoryManureNutrientValuePerHa(..., pIndex, ...)` (2213–2222, which also requires a
laboratory P Index) and `checkNapCompliance(..., pIndex, ...)` (2263–2284). Both are forced
blocked when the pair is incomplete (2427–2430, 2470–2472). `napCompliance`'s P total adds
`deliveredKgHa.p` (2236–2240), so it is coupled to CP5.

**Consumers.** `real-alerts.ts` 159 and 174–176, 230–241; `nutrient-plan-trace.ts` 63–95,
151, 182–187, 721 and 826; `lib/reports.ts` 215–242; `fertiliser-recommendation.ts` 98,
126, 135 and 307; `NutrientsPageClient.tsx` 317–318 and 532;
`EvidenceReportPageClient.tsx` 296; `NapComplianceCard.tsx` 52.

**Target shapes.** These depend on decision D2 (§5).

**Fail-closed.** If K is known and P is unknown, both outputs stay blocked under every
option, because they are keyed on P. Only the P-known / K-unknown direction is open.

**Recommendation.** Unchanged until Campaign B review. Statutory outputs are out of
Campaign C's scope.

### CP7 — What Matters / slurry economics

**Current.** `app/actions/what-matters-pilot.ts` 268 →
`buildSlurryDirectEconomicAssessment`. It blocks unless the intervention plan's
`availableNutrientAssessment` is OK (`slurry-direct-economic-assessment.ts` 374 and 400).
It requires identical paired `requirement` values across baseline and intervention
(267–279). It prices `purchasedProducts` (309–310).
`slurry-whole-farm-allocation.ts` consumes those assessments.

**Target.** None until CP5 is decided. The economic benefit is a purchase-cost
difference, and with products withheld there is nothing to price. Keeping the paired
`availableNutrientAssessment` (CP4 Target A) keeps the economics blocking as "unsupported
science" for mixed fields, which is the CC-B4A outcome.

**Recommendation.** No change until after D1. Then a separate task decides whether a
partial (single-nutrient) credit is priced.

## 3. What stays unchanged

- **CC-B2:** LESS Index 1/2 factors (P × 0.50, K × 0.90). No placeholder-derived OK
  assessment (F001). Slurry N kept when an index is missing (F003).
- **CC-B4A:** the splashplate missing-index guard, for both captured and assumed method.
  The paired `availableNutrientAssessment` stays blocked whenever either index is missing,
  in every increment before a breaking change is separately authorised.
- **Engine values for fully-indexed fields:** every existing `NutrientPlan` field is
  byte-identical when both indices exist. Each increment proves this with a fixture-matrix
  equality test against the pre-change engine.
- **Campaign B statutory outputs:** `napCompliance`, `statutoryManureValue`, the NAP card,
  trace, report columns and alerts stay unchanged until D2 is decided.
- UNKNOWN is never 0. "No slurry planned" remains the only real zero credit
  (`slurry-rate-allocation.ts` 210–212).

## 4. Staged delivery plan

Each increment is a separately authorised task, shippable and reversible on its own, in
this order.

| # | Increment | Frozen-contract change | Tests | Engine bump |
|---|---|---|---|---|
| 1 | CP1 + CP3: add `fertilityEvidenceByNutrient`; remove the Index-1 placeholder internally. Optional: correct the paired `missingInputs` (§1); this needs the product owner's agreement because it changes blocked-outcome content | Additive `types.ts` `NutrientPlan` field (steps 1–3). Correcting `missingInputs` changes fail-closed content (treat as breaking, step 4) | Four-case matrix × each method (splashplate, spring/summer LESS, assumed) × Index 1–4. Every existing field equals the pre-change engine. Per-nutrient `evidenceState` | No — no existing value changes (recorded in `IMPLEMENTATION_LOG.md`) |
| 2 | CP2 (gross only): `requirementByNutrient` | Additive `NutrientPlan` field | Known arm equals the fully-indexed value for every value of the other index (invariance). Unknown arm has no number. Paired fields unchanged | Yes (minor): the engine emits a new production figure for mixed fields. Lineage must distinguish it |
| 3 | CP4: per-nutrient slurry credit view; shared table selection inside the resolver. Then CP2 net: `netRequirementByNutrient` from the shared per-nutrient remaining calculation (CP2), never from the paired `remainingX` | Additive `organicApplication` and `NutrientPlan` fields. Resolver refactor keeps its export signature | Per-nutrient factor applied only from its own index. Table-level blocks block all arms. Mixed case: known net arm equals `round(max(0, gross − per-nutrient credit))` with a positive credit, so net < gross. Fully indexed: net arms equal paired `netRequirement`. Legacy `offsetP` / `offsetK` / `netRequirement` unchanged. CC-B2 / CC-B4A regression tests unchanged and passing | Yes (minor) |
| 4 | Allocation layer remap (`slurry-rate-allocation.ts`), unwired | None (the layer is not in the frozen table) | Mixed cases give known P (or K) quantities; others stay unknown | `slurry_rate_allocation` version only |
| 5 | UI and reports: known nutrient shown, unknown nutrient explained (`NutrientRequirementCard`, `OrganicNutrientsCard`, CSV, Evidence Report, prompt) | Consumer updates only (step 2 obligations). [PRODUCT_RULES.md](../../../.agent/PRODUCT_RULES.md) and a visual check | Component tests for mixed states. Blocked arms never render a number | No |
| 6 | CP5 purchasing, after D1 | Breaking: `purchasedProducts` / `deliveredKgHa` semantics (step 4, `contracts_frozen` false) | Per D1 option. Unknown-requirement byproduct disclosed, never reconciled against 0 | Yes |
| 7 | CP6 statutory, after D2 (Campaign B) | Breaking: `napCompliance` / `statutoryManureValue` fail-closed behaviour | Campaign B statutory cases. P-unknown direction stays blocked | Yes |
| 8 | CP7 economics, after Increment 6 | `slurry-direct-economic-assessment.ts` gate (frozen) | Partial-credit counterfactual cases | Economic module version. Engine only if Increment 6 requires it |

Increments 1–5 never change an existing output. Only Increments 6–8 can, and each waits on
a named decision.

## 5. Decisions that are not engineering

**D1 — purchased multi-nutrient blends against an unknown requirement (CP5; product owner
plus Campaign C science review).**

| Option | Behaviour | Consequence |
|---|---|---|
| a | No products while either index is missing (today) | Safest. The farmer sees a P (or K) requirement with no purchase plan. N purchasing also stays withheld |
| b | N-only purchasing (Protected Urea) when P or K is unknown | Releases a real N plan. 18-6-12 is not used, so no P/K is applied against an unknown requirement. Changes N advice for these fields |
| c | P known / K unknown: size 18-6-12 to P and disclose its K (and N) | Delivers K against an unknown K requirement. No K NAP ceiling applies, but the agronomic excess or shortfall is unknowable |
| d | K known / P unknown: size 0-7-30 to K | Delivers P against an unknown P requirement. P is statutory, and the NAP P check is blocked without a P Index, so applied P could not be checked against the ceiling. **Not recommended** |
| e | Change the product catalogue (straight P or K products) | Needs sourced product compositions and prices. Product scope change |

**D2 — statutory P outputs with K unknown (CP6; Campaign B review).**

| Option | Behaviour | Consequence |
|---|---|---|
| a | Unchanged: blocked when either index is missing | No statutory change. A P-known field shows no compliance figure |
| b | Release `statutoryManureValue` alone (organic ledger, laboratory P Index) | Organic P ledger becomes visible. NAP check still blocked. Needs Campaign B confirmation that the ledger is valid without the full plan |
| c | Release `napCompliance` with a P Index and K unknown | Its P total includes chemical P from D1. Under D1 (a) or (b) that chemical P is 0 by construction, which must not read as "no P will be applied". Needs Campaign B interpretation |

**D3 — farmer-facing wording for mixed states (product owner).** For example, "P
requirement shown; K needs a soil test". The paired headline
`requirementProvisional.headline` is frozen (CC-FU-A precedent).

**D4 — retiring the paired fields (product owner, contract policy).** The paired shapes can
stay as derived conjunctions indefinitely, or be removed later through a breaking change
once every consumer reads the per-nutrient fields.

## 6. Status

IMPLEMENTATION_DEFERRED_ARCHITECTURE remains the status of RATE_ALLOCATION_ARCHITECTURE §3
Phase 7. This document is the design input for Increments 1–8. No BLOCKERS status changes.
