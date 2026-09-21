/**
 * Economic Opportunity Engine, Phase 5 — Slurry Direct Economic Assessment
 * V1.
 *
 * Answers exactly one question: "for this one explicit, already-scientific
 * slurry application action, what is the direct fertiliser-plan cost
 * difference between the canonical Farm Return plan WITHOUT it (baseline)
 * and WITH it (intervention), using consistent audited price evidence?"
 * It does NOT decide which field should get slurry, does not value grass/
 * feed/livestock output, does not compare with-slurry vs a hypothetical
 * "no slurry anywhere" world, and does not claim confirmed cash saving.
 *
 * Pure domain, no Supabase/network IO, no re-derivation of scientific
 * calculations (mirrors `fertiliser-plan-cost.ts`'s own separation): a
 * caller runs the REAL canonical `calculateNutrientPlan`
 * (`src/domain/nutrients.ts`) exactly twice — once with the evaluated
 * `SlurryAllocation` absent (baseline), once with it present (intervention),
 * everything else about the field/farm/livestock/soil snapshot held
 * identical — and hands both resulting `NutrientPlan` objects in here. This
 * module never calls `calculateNutrientPlan` itself, never recomputes N/P/K
 * requirement, never re-derives available slurry nutrients, and never
 * builds its own product allocator. It also never calls Phase 3's
 * `resolveMarketReferencePrice` itself — a caller resolves ONE price per
 * product (for the union of products appearing in either plan, under one
 * shared `asOfDate`/`knownAt`) and hands the resolved set in, exactly the
 * same "already-resolved price in, never re-resolved" contract
 * `fertiliser-plan-cost.ts` established.
 *
 * Both plans are costed exclusively through Phase 4's hardened
 * `buildFertiliserPlanCostAssessment`/`costFertiliserProductLine` — this
 * module performs no `quantity × price` arithmetic of its own. Phase 4
 * already owns product-price identity, plan-line completeness, duplicate
 * protection, exact kg→tonne conversion, exact money multiplication, and
 * price-resolution-context consistency (baseline and intervention are each
 * built with the identical `asOfDate`/`knownAt`, so Phase 4's own
 * `findResolutionContextViolations` check — reused unmodified — already
 * enforces "price evidence held constant across both scenarios" for free).
 *
 * THE CRITICAL GATE (brief §5): `calculateNutrientPlan` floors an
 * unsupported/blocked/ambiguous slurry-nutrient-resolution to a zero
 * arithmetic offset internally (`nutrients.ts:1911-1914`, its own doc
 * comment: "Never a fabricated non-zero credit... floors to the same safe
 * 'no organic contribution counted' state") — but it ALSO exposes the real
 * `EngineOutcome` this floor was built from, unstripped, as
 * `NutrientPlan.organicApplication.availableNutrientAssessment`, plus a
 * convenience `requirementProvisional.isProvisional` flag documented as
 * `true` exactly when that floor was silently applied. This module reads
 * `interventionPlan.organicApplication.availableNutrientAssessment.status`
 * BEFORE treating the two plans' costs as economically comparable: only a
 * genuine `"OK"` intervention science result may proceed to a direct cost
 * comparison. Anything else — unsupported method, unsupported timing,
 * ambiguous captured method, no slurry applied at all — fails the whole
 * assessment closed with `ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE`,
 * never silently comparing a baseline plan against an intervention plan
 * whose "with slurry" arithmetic was actually identical to "without
 * slurry." Confirmed real and preserved, not invented — see
 * `DOMAIN_CONTRACTS.md`'s Phase 5 section for the full trace of this
 * property through the real code.
 *
 * Counterfactual invariance (brief §9/§10) is validated structurally from
 * the two plan OUTPUTS themselves, not merely trusted by caller
 * convention: `baselinePlan.requirement` (the gross, pre-slurry-offset
 * N/P/K requirement — a pure function of soil/livestock/silage/field
 * inputs, wholly unrelated to slurry) must exactly equal
 * `interventionPlan.requirement`. If it does not, something besides the
 * evaluated slurry action differed between the two calculation runs (wrong
 * soil evidence, wrong field, wrong livestock snapshot, ...), and the
 * assessment is invalid — `ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION`.
 *
 * No new slurry science, no grass/feed/livestock value, no statutory-value
 * reuse, no farm-wide allocation, no persistence — see `DOMAIN_CONTRACTS.md`.
 */

import type { NutrientPlan } from "./types";
import { addMoney, compareMoney, isZeroMoney, subtractMoney, zeroMoney, type MoneyAmount } from "./money";
import type { AuditableMarketPriceResolution } from "./market-price-resolution";
import {
  buildFertiliserPlanCostAssessment,
  costFertiliserProductLine,
  type FertiliserPlanCostAssessment,
  type FertiliserPlanCostLineInput,
} from "./fertiliser-plan-cost";
import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";
import type { EconomicEffect, EconomicScenario } from "./economic-opportunity";

export const SLURRY_DIRECT_ECONOMIC_ENGINE_VERSION = "slurry_direct_economic_engine_v1.0.0";

/** Brief §8 — required verbatim on every V1 assessment: this is a single
 * explicit action's direct economics, never a whole-farm slurry value. The
 * same slurry could have an alternative use on another eligible field;
 * that opportunity cost is Phase 6's responsibility, not accounted for
 * here. */
export const SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION =
  "This assessment measures the direct fertiliser-plan cost difference for this evaluated slurry application. It does not yet account for the opportunity cost of allocating finite slurry away from alternative eligible fields.";

/** Brief §17/§18 — required verbatim whenever a quantified economic effect
 * exists: the Phase 4 price is an indicative national benchmark, not proof
 * of an avoidable cash purchase. */
export const SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION =
  "This is an indicative fertiliser-plan cost difference, not confirmed cash saving. Existing fertiliser stock, committed purchases and actual supplier pricing are not yet incorporated into this assessment.";

const SCENARIO_BASELINE_ID = "baseline";
const SCENARIO_INTERVENTION_ID = "intervention";

// ---------------------------------------------------------------------------
// Realisation cost (brief §20/§21) — a tri-state, never a numeric default.
// Absence of evidence must never become a known zero.
// ---------------------------------------------------------------------------

export type RealisationCostInput = { status: "quantified"; amount: MoneyAmount } | { status: "known_zero" } | { status: "unknown" };

// ---------------------------------------------------------------------------
// Input — the caller has already run the REAL canonical science engine
// twice and resolved a shared price set once; this module never does
// either itself.
// ---------------------------------------------------------------------------

export interface SlurryDirectEconomicAssessmentInput {
  /** Deterministic, caller-supplied — never randomly generated. */
  id: string;
  /** A stable identity for the evaluated slurry action — e.g. the real
   * database row id of the `SlurryAllocation` being assessed. The pure
   * `SlurryAllocation` domain type (`types.ts`) deliberately carries no
   * such id (it is dropped by `rowToSlurryAllocation`, matching this
   * repo's convention of keeping `types.ts` free of a database
   * dependency) — a caller with real IO access supplies it here, the same
   * "already-resolved identity in, never re-derived" pattern Phase 3/4
   * already use for `observationDatabaseId`. Used only to build the one
   * deterministic credit-claim identity this assessment's effect needs
   * (brief §19) — never displayed, never validated in shape here. */
  evaluatedActionId: string;
  fieldId: string;
  /** "YYYY-MM-DD" — the one decision date used for BOTH the fertiliser
   * plans (the plans themselves were already computed by the caller; this
   * is recorded for the assessment's own identity/audit trail) and every
   * price resolution behind `resolvedPricesByProduct`. */
  asOfDate: string;
  /** ISO datetime — the one knowledge cutoff every price in
   * `resolvedPricesByProduct` was actually resolved under. Required
   * (never defaulted here) so this module's own structural check can
   * compare it against what each Phase 4 assessment's lines actually
   * used. */
  knownAt: string;
  /** The real canonical plan for this field WITHOUT the evaluated slurry
   * action — produced by the caller via `calculateNutrientPlan` with
   * `slurryAllocation` absent (or set to any OTHER real allocations for
   * this field that must remain identical in both scenarios), everything
   * else about the farm/field/livestock/soil snapshot identical to
   * `interventionPlan`. */
  baselinePlan: NutrientPlan;
  /** The real canonical plan for the SAME field WITH the evaluated slurry
   * action included — produced by the caller via `calculateNutrientPlan`
   * with `slurryAllocation` set to (or including) the evaluated action. */
  interventionPlan: NutrientPlan;
  /** One already-resolved Phase 3 price per canonical product name (e.g.
   * `"18-6-12"`), covering the union of products either plan's
   * `purchasedProducts` requires. Resolved ONCE by the caller under the
   * shared `asOfDate`/`knownAt` above and reused for both scenarios —
   * this module never calls `resolveMarketReferencePrice` itself. */
  resolvedPricesByProduct: Readonly<Record<string, EngineOutcome<AuditableMarketPriceResolution>>>;
  realisationCost: RealisationCostInput;
  /** ISO datetime — caller-supplied, never internally generated (mirrors
   * `FertiliserPlanCostAssessment.createdAt`/`EconomicOpportunityAssessment.createdAt`). */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface CounterfactualInvarianceCheckResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

/** `NutrientPlan.organicApplication.availableNutrientAssessment`'s own
 * value type, referenced structurally (never imported from `nutrients.ts`,
 * matching `types.ts`'s own established precedent of staying free of a
 * dependency on the engine file that computes it). */
export type SlurryScienceSupportOutcome = NutrientPlan["organicApplication"]["availableNutrientAssessment"];

export interface SlurryDirectEconomicAssessment {
  id: string;
  engineVersion: string;
  evaluatedActionId: string;
  fieldId: string;
  asOfDate: string;
  knownAt: string;
  /** Reuses Phase 1's `EconomicScenario` shape exactly — two scenarios,
   * always exactly `["baseline", "intervention"]` by role, never a third. */
  scenarios: EconomicScenario[];
  /** The intervention's own real slurry-nutrient-resolution outcome,
   * unstripped — the exact fact this whole module's central gate is built
   * from. `"OK"` is the only status that permits a quantified economic
   * comparison; every other status means the comparison below is
   * deliberately blocked, never silently treated as a zero-benefit
   * result. */
  scienceSupport: SlurryScienceSupportOutcome;
  /** Brief §10 — proof, not assumption, that the two plans differ only in
   * the evaluated action (compares the two plans' own pre-slurry-offset
   * gross `requirement`, which is wholly unrelated to slurry). */
  counterfactualInvariance: CounterfactualInvarianceCheckResult;
  baselineFertiliserPlanCost: FertiliserPlanCostAssessment;
  interventionFertiliserPlanCost: FertiliserPlanCostAssessment;
  /** The direct fertiliser-plan cost difference's MAGNITUDE — always a
   * non-negative `MoneyAmount` when `OK` (sign lives in
   * `directCostDifferenceDirection` below, mirroring
   * `EconomicEffect.direction`'s own non-negative-amount convention).
   * `OK` only when the science gate passed, the counterfactual invariance
   * check passed, AND both plan costs are themselves fully quantified
   * (`FertiliserPlanCostAssessment.aggregateOutcome.status === "OK"`).
   * Never a fabricated €0 when any of those is missing. */
  directCostDifference: EngineOutcome<MoneyAmount>;
  /** `"benefit"` when baseline cost > intervention cost (the evaluated
   * action reduces the indicative plan cost); `"cost"` when intervention
   * cost > baseline cost; `"zero"` for a genuine, quantified tie. `null`
   * only when `directCostDifference.status !== "OK"`. */
  directCostDifferenceDirection: "benefit" | "cost" | "zero" | null;
  /** The one real `EconomicEffect` this assessment produces — reuses
   * Phase 1's framework exactly, `impactKind: "ECONOMIC"` (never `"CASH"`
   * without separate evidence — brief §17), a single deterministic
   * `creditClaim.creditKey` built from `evaluatedActionId` (brief §19: one
   * monetised direct effect, never a second independent one for the same
   * physical change). `null` only when `directCostDifference` is not
   * `OK` (nothing to monetise) or is a genuine `"zero"` (an
   * `EconomicEffect` with a real quantified €0 amount and `direction:
   * "benefit"` is still produced in the zero case — a valid, real, zero
   * result, never omitted or mistaken for "no effect exists"). */
  effect: EconomicEffect | null;
  realisationCost: RealisationCostInput;
  /** Brief §21 — `amount.status` is `"OK"` ONLY when `directCostDifference`
   * is itself `OK` AND `realisationCost.status` is `"quantified"` or
   * `"known_zero"`. An `"unknown"` realisation cost always yields
   * `BLOCKED_INSUFFICIENT_EVIDENCE` here, never silently equal to the
   * gross direct benefit. */
  netEconomicResult: { direction: "benefit" | "cost" | "zero" | null; amount: EngineOutcome<MoneyAmount> };
  /** Always includes the finite-resource limitation (brief §8) and, when
   * `effect` is non-null, the cash/stock limitation (brief §18) and every
   * distinct limitation carried by either Phase 4 cost assessment
   * (proxy/CATEGORY_BENCHMARK, unknown VAT, "not least-cost", ...),
   * deduplicated. */
  limitations: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requirementsEqual(a: NutrientPlan["requirement"], b: NutrientPlan["requirement"]): boolean {
  return a.status === b.status && a.value.n === b.value.n && a.value.p === b.value.p && a.value.k === b.value.k;
}

function checkCounterfactualInvariance(input: SlurryDirectEconomicAssessmentInput): CounterfactualInvarianceCheckResult {
  if (input.baselinePlan.fieldId !== input.fieldId || input.interventionPlan.fieldId !== input.fieldId) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION",
      detail: `Both plans must be for fieldId "${input.fieldId}"; got baseline="${input.baselinePlan.fieldId}", intervention="${input.interventionPlan.fieldId}".`,
    };
  }
  if (!requirementsEqual(input.baselinePlan.requirement, input.interventionPlan.requirement)) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION",
      detail:
        "Baseline and intervention plans have different gross (pre-slurry-offset) requirement values — this is only possible if some input besides the evaluated slurry action (soil evidence, field area, livestock, silage, ...) differed between the two calculation runs. A valid counterfactual pair must be identical apart from the evaluated action.",
    };
  }
  return { valid: true };
}

function productLineInputs(plan: NutrientPlan): FertiliserPlanCostLineInput[] {
  return plan.purchasedProducts.map((product) => ({
    fieldId: plan.fieldId,
    product: product.name,
    npkAnalysis: product.npkAnalysis,
    totalKg: product.totalKg,
  }));
}

function buildPlanCost(
  idSuffix: string,
  plan: NutrientPlan,
  asOfDate: string,
  knownAt: string,
  resolvedPricesByProduct: Readonly<Record<string, EngineOutcome<AuditableMarketPriceResolution>>>,
  createdAt: string,
): FertiliserPlanCostAssessment {
  const lineInputs = productLineInputs(plan);
  const lines = lineInputs.map((lineInput) => {
    const priceResolution =
      resolvedPricesByProduct[lineInput.product] ??
      blockedInsufficientEvidence<AuditableMarketPriceResolution>("ECONOMIC_SLURRY_ASSESSMENT_MISSING_PRICE_INPUT", [
        `no resolved price was supplied for product "${lineInput.product}"`,
      ]);
    return costFertiliserProductLine(lineInput, priceResolution);
  });
  return buildFertiliserPlanCostAssessment({
    id: `${idSuffix}`,
    asOfDate,
    knownAt,
    expectedLineKeys: lineInputs.map((l) => ({ product: l.product, fieldId: l.fieldId })),
    lines,
    createdAt,
  });
}

/**
 * Adversarial review finding (MEDIUM): the previous template-literal form
 * (`slurry-allocation:${evaluatedActionId}:field:${fieldId}:...`) was not
 * collision-resistant — `creditKeyFor("A:field:B", "C")` and
 * `creditKeyFor("A", "B:field:C")` produced the byte-identical string, so
 * two genuinely DIFFERENT evaluated actions could be wrongly flagged as
 * the same credit by `validateNoDuplicateCreditClaims` (a false-positive
 * rejection of two legitimate, separate assessments). `evaluatedActionId`/
 * `fieldId` are expected to be real database UUIDs in practice (which
 * never contain a colon), so this was not exploitable in production
 * today — but nothing in this module's types enforced that, so the
 * construction itself was fragile. `JSON.stringify` of the tuple is an
 * injective (collision-free) encoding for any pair of strings, regardless
 * of their content — the fix, not a defence-in-depth addition.
 */
function creditKeyFor(evaluatedActionId: string, fieldId: string): string {
  return `slurry-allocation:${JSON.stringify([evaluatedActionId, fieldId])}:fertiliser-plan-cost-difference`;
}

// ---------------------------------------------------------------------------
// Assessment builder
// ---------------------------------------------------------------------------

export function buildSlurryDirectEconomicAssessment(input: SlurryDirectEconomicAssessmentInput): SlurryDirectEconomicAssessment {
  const scenarios: EconomicScenario[] = [
    { id: SCENARIO_BASELINE_ID, role: "baseline", label: "Without the evaluated slurry application" },
    { id: SCENARIO_INTERVENTION_ID, role: "intervention", label: "With the evaluated slurry application" },
  ];

  const scienceSupport = input.interventionPlan.organicApplication.availableNutrientAssessment;
  const counterfactualInvariance = checkCounterfactualInvariance(input);

  const baselineFertiliserPlanCost = buildPlanCost(
    `${input.id}:baseline`,
    input.baselinePlan,
    input.asOfDate,
    input.knownAt,
    input.resolvedPricesByProduct,
    input.createdAt,
  );
  const interventionFertiliserPlanCost = buildPlanCost(
    `${input.id}:intervention`,
    input.interventionPlan,
    input.asOfDate,
    input.knownAt,
    input.resolvedPricesByProduct,
    input.createdAt,
  );

  const limitations = [SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION];

  let directCostDifference: EngineOutcome<MoneyAmount>;
  let directCostDifferenceDirection: "benefit" | "cost" | "zero" | null = null;
  let effect: EconomicEffect | null = null;

  if (scienceSupport.status !== "OK") {
    directCostDifference = blockedInsufficientEvidence(
      "ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE",
      [
        `the evaluated slurry action's available-nutrient assessment is "${scienceSupport.status}", not a scientifically supported "OK" result — an unsupported/blocked/ambiguous slurry science outcome must never be treated as a genuine zero economic benefit`,
      ],
    );
  } else if (!counterfactualInvariance.valid) {
    directCostDifference = blockedInsufficientEvidence(counterfactualInvariance.reasonCode ?? "ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION", [
      counterfactualInvariance.detail ?? "counterfactual invariance check failed",
    ]);
  } else if (baselineFertiliserPlanCost.aggregateOutcome.status !== "OK") {
    directCostDifference = blockedInsufficientEvidence("ECONOMIC_SLURRY_ASSESSMENT_INCOMPLETE_BASELINE_COST", [
      "baseline fertiliser-plan cost is not fully quantified",
    ]);
  } else if (interventionFertiliserPlanCost.aggregateOutcome.status !== "OK") {
    directCostDifference = blockedInsufficientEvidence("ECONOMIC_SLURRY_ASSESSMENT_INCOMPLETE_INTERVENTION_COST", [
      "intervention fertiliser-plan cost is not fully quantified",
    ]);
  } else {
    const baselineCost = baselineFertiliserPlanCost.aggregateOutcome.value;
    const interventionCost = interventionFertiliserPlanCost.aggregateOutcome.value;
    const comparison = compareMoney(baselineCost, interventionCost);
    const evidenceState =
      baselineFertiliserPlanCost.aggregateOutcome.evidenceState === "GENERIC_FALLBACK" ||
      interventionFertiliserPlanCost.aggregateOutcome.evidenceState === "GENERIC_FALLBACK"
        ? "GENERIC_FALLBACK"
        : "IRISH_MODEL";

    if (comparison === 0) {
      directCostDifferenceDirection = "zero";
      const zero = zeroMoney(baselineCost.currency);
      directCostDifference = ok(zero, evidenceState);
      effect = {
        id: `${input.id}:effect:direct-fertiliser-plan-cost-difference`,
        type: "AVOIDED_FERTILISER_PLAN_COST",
        direction: "benefit",
        impactKind: "ECONOMIC",
        amount: ok(zero, evidenceState),
        vatTreatment: "unknown",
        priceBasis: "per_tonne",
        creditClaim: {
          creditKey: creditKeyFor(input.evaluatedActionId, input.fieldId),
          resourceDescription: `Direct fertiliser-plan cost difference for evaluated slurry action ${input.evaluatedActionId} on field ${input.fieldId}`,
          scopeFieldId: input.fieldId,
        },
        scenarioId: SCENARIO_INTERVENTION_ID,
        limitations: [SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION],
      };
    } else if (comparison > 0) {
      // baseline > intervention: the evaluated action reduces plan cost.
      directCostDifferenceDirection = "benefit";
      const magnitude = subtractMoney(baselineCost, interventionCost);
      directCostDifference = ok(magnitude, evidenceState);
      effect = {
        id: `${input.id}:effect:direct-fertiliser-plan-cost-difference`,
        type: "AVOIDED_FERTILISER_PLAN_COST",
        direction: "benefit",
        impactKind: "ECONOMIC",
        amount: ok(magnitude, evidenceState),
        vatTreatment: "unknown",
        priceBasis: "per_tonne",
        creditClaim: {
          creditKey: creditKeyFor(input.evaluatedActionId, input.fieldId),
          resourceDescription: `Direct fertiliser-plan cost difference for evaluated slurry action ${input.evaluatedActionId} on field ${input.fieldId}`,
          scopeFieldId: input.fieldId,
        },
        scenarioId: SCENARIO_INTERVENTION_ID,
        limitations: [SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION],
      };
    } else {
      // intervention > baseline: the evaluated action increases plan cost.
      directCostDifferenceDirection = "cost";
      const magnitude = subtractMoney(interventionCost, baselineCost);
      directCostDifference = ok(magnitude, evidenceState);
      effect = {
        id: `${input.id}:effect:direct-fertiliser-plan-cost-difference`,
        type: "ADDITIONAL_INPUT_COST",
        direction: "cost",
        impactKind: "ECONOMIC",
        amount: ok(magnitude, evidenceState),
        vatTreatment: "unknown",
        priceBasis: "per_tonne",
        creditClaim: {
          creditKey: creditKeyFor(input.evaluatedActionId, input.fieldId),
          resourceDescription: `Direct fertiliser-plan cost difference for evaluated slurry action ${input.evaluatedActionId} on field ${input.fieldId}`,
          scopeFieldId: input.fieldId,
        },
        scenarioId: SCENARIO_INTERVENTION_ID,
        limitations: [SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION],
      };
    }
  }

  if (effect !== null) {
    limitations.push(SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION);
  }
  limitations.push(...new Set([...baselineFertiliserPlanCost.limitations, ...interventionFertiliserPlanCost.limitations]));

  // Net return (brief §21) — OK only when the direct comparison itself is
  // OK AND realisation cost is quantified or explicitly known-zero. An
  // "unknown" realisation cost always blocks net, regardless of how
  // confidently the gross/direct figure is known.
  let netDirection: "benefit" | "cost" | "zero" | null = null;
  let netAmount: EngineOutcome<MoneyAmount>;
  if (directCostDifference.status !== "OK") {
    netAmount = blockedInsufficientEvidence("ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNQUANTIFIED_GROSS", [
      "the direct fertiliser-plan cost difference itself is not quantified",
    ]);
  } else if (input.realisationCost.status === "unknown") {
    netAmount = blockedInsufficientEvidence("ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNKNOWN_REALISATION_COST", [
      "incremental realisation cost (contractor spreading, transport, ...) is not quantified or explicitly evidenced as zero — absence of evidence is never treated as a known zero",
    ]);
  } else if (input.realisationCost.status === "quantified" && input.realisationCost.amount.amount.startsWith("-")) {
    // Adversarial review finding (MEDIUM): a negative "cost" is not a
    // smaller cost, it is a benefit — and nothing upstream structurally
    // forbids a caller from supplying one. Left unchecked, subtracting a
    // negative realisation cost from the gross benefit silently INFLATES
    // net return beyond the audited gross figure (net = gross − (−x) =
    // gross + x), the same class of defect Phase 4's own review found and
    // fixed for a negative resolved *price*. Fail closed here rather than
    // silently manufacture extra value from a malformed cost input.
    netAmount = blockedInsufficientEvidence("ECONOMIC_SLURRY_ASSESSMENT_NEGATIVE_REALISATION_COST", [
      `realisation cost amount "${input.realisationCost.amount.amount}" is negative — an incremental realisation cost cannot itself be negative; a cost-reducing effect belongs in its own EconomicEffect, never represented as a negative cost here`,
    ]);
  } else {
    const grossMagnitude = directCostDifference.value;
    const realisationAmount = input.realisationCost.status === "quantified" ? input.realisationCost.amount : zeroMoney(grossMagnitude.currency);
    if (directCostDifferenceDirection === "benefit" || directCostDifferenceDirection === "zero") {
      const net = subtractMoney(grossMagnitude, realisationAmount);
      if (isZeroMoney(net)) {
        netDirection = "zero";
        netAmount = ok(net, "IRISH_MODEL");
      } else if (net.amount.startsWith("-")) {
        netDirection = "cost";
        netAmount = ok(subtractMoney(realisationAmount, grossMagnitude), "IRISH_MODEL");
      } else {
        netDirection = "benefit";
        netAmount = ok(net, "IRISH_MODEL");
      }
    } else {
      // direct effect is itself a cost — realisation cost only adds to it.
      netDirection = "cost";
      netAmount = ok(addMoney(grossMagnitude, realisationAmount), "IRISH_MODEL");
    }
  }

  return {
    id: input.id,
    engineVersion: SLURRY_DIRECT_ECONOMIC_ENGINE_VERSION,
    evaluatedActionId: input.evaluatedActionId,
    fieldId: input.fieldId,
    asOfDate: input.asOfDate,
    knownAt: input.knownAt,
    scenarios,
    scienceSupport,
    counterfactualInvariance,
    baselineFertiliserPlanCost,
    interventionFertiliserPlanCost,
    directCostDifference,
    directCostDifferenceDirection,
    effect,
    realisationCost: input.realisationCost,
    netEconomicResult: { direction: netDirection, amount: netAmount },
    limitations,
    createdAt: input.createdAt,
  };
}
