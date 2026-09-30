/**
 * Campaign C — slurry rate / allocation layer (architecture home, DRAFT).
 *
 * `docs/farm-return-next/campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` is the
 * design contract. This module answers "which scientific constraints bear
 * on this field's planned slurry rate, and which of them bind?" over an
 * ALREADY-COMPUTED `NutrientPlan` (`calculateNutrientPlan`,
 * `src/domain/nutrients.ts`). It never recomputes a crop requirement, a
 * slurry availability figure or a net chemical requirement — those stay
 * owned by `nutrients.ts` and are consumed here unmodified.
 *
 * It is separate from, and must not be confused with:
 *   - slurry nutrient concentration / availability (`resolveAvailableSlurryNutrients`;
 *     the Index 1/2 P × 0.50 / K × 0.90 factors are never touched here);
 *   - regulatory eligibility (Campaign B) and weather/actionability, which
 *     reach this layer only as caller-supplied constraint records;
 *   - finite whole-farm volume selection (`slurry-whole-farm-allocation.ts`);
 *   - What Matters ranking.
 *
 * NOT WIRED INTO PRODUCTION. No output of this module feeds
 * `calculateNutrientPlan`, fertiliser planning, economics, reports or What
 * Matters; every record carries `affectsProductionOutput: false`. Campaign C
 * stays AI_SCIENTIFIC_ADJUDICATION / EXPERT_VALIDATION_PENDING / DRAFT.
 *
 * Evidence gate (SOURCES_AND_CLAIMS §6–§8): only REPOSITORY_VERIFIED rules
 * are evaluated. Where evaluating a verified rule would need an
 * AI_PROVISIONAL reading, the record keeps the verified limit but its
 * binding state stays UNDETERMINED with an explicit deferral code:
 *   - organic share caps (P 50% / K 75% on Index 1/2): whether the cap is
 *     measured against available (factor-reduced) or total slurry nutrient
 *     is `CLM-AIR-CONF03-SHARE`, AI_PROVISIONAL →
 *     IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL;
 *   - 90 kg K spring guidance: whether slurry K counts toward the 90 kg is
 *     `CLM-AIR-CONF02-RECON`, AI_PROVISIONAL →
 *     RULE_RECORDED_IMPLEMENTATION_DEFERRED_PROVISIONAL;
 *   - the final rate selector over several constraints is
 *     `AI_PROVISIONAL_RATE_SELECTOR_V1` →
 *     RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL. No min(P, K) rule.
 * Unknown inputs stay unknown (never zero).
 */

import type { FieldUse, NutrientPlan } from "./types";

export const SLURRY_RATE_ALLOCATION_VERSION = "slurry_rate_allocation_v0.1.0-draft";

// `CLM-TGC-OM-SHARE-P` / `CLM-TGC-OM-SHARE-K` (TGC-OM-2026): on Index 1/2
// organic fertiliser should supply only 50% of crop P and 75% of crop K;
// at Index 3 it can supply 100%. Index 4 is not addressed by the source.
// Requirement shares — NOT availability factors.
const ORGANIC_SHARE_OF_REQUIREMENT: Record<"P" | "K", Record<1 | 2 | 3, number>> = {
  P: { 1: 0.5, 2: 0.5, 3: 1 },
  K: { 1: 0.75, 2: 0.75, 3: 1 },
};

// `CLM-TGC-K90-SPRING` (TGC-K90): where more than 90 kg K/ha is advised,
// only 90 kg in spring and the remainder to aftermath / late autumn.
const K_SPRING_GUIDANCE_KG_HA = 90;

export type AllocationNutrient = "N" | "P" | "K";

export type RateConstraintKind =
  | "P_REQUIREMENT_LIMIT"
  | "K_REQUIREMENT_LIMIT"
  | "ORGANIC_SHARE_LIMIT"
  | "K_SPRING_GUIDANCE_LIMIT"
  | "REGULATORY_LIMIT"
  | "TIMING_LIMIT"
  | "WEATHER_LIMIT"
  | "OPERATIONAL_LIMIT";

export const EXTERNAL_RATE_CONSTRAINT_KINDS = ["REGULATORY_LIMIT", "TIMING_LIMIT", "WEATHER_LIMIT", "OPERATIONAL_LIMIT"] as const;
export type ExternalRateConstraintKind = (typeof EXTERNAL_RATE_CONSTRAINT_KINDS)[number];

export type RuleEvidenceClass = "REPOSITORY_VERIFIED" | "AI_PROVISIONAL" | "AI_REVIEW_ONLY" | "EXTERNAL_MODULE";

export type AllocationDeferral =
  | "IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL"
  | "RULE_RECORDED_IMPLEMENTATION_DEFERRED_PROVISIONAL"
  | "RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL"
  | "SOURCE_DOES_NOT_ADDRESS_INDEX_4";

/** A quantity that is either known or honestly unknown — never a zero
 * standing in for "unknown". */
export type AllocationQuantity =
  | { status: "known"; value: number; unit: "kg/ha" | "m3/ha" | "fraction" }
  | { status: "unknown"; reason: string };

export type ConstraintBinding = "BINDING" | "NOT_BINDING" | "UNDETERMINED" | "NOT_ENFORCED" | "NOT_EVALUATED";

export interface RateConstraintRecord {
  constraintId: string;
  kind: RateConstraintKind;
  nutrient?: AllocationNutrient;
  ruleId: string;
  evidenceClass: RuleEvidenceClass;
  sourceClaimIds: readonly string[];
  calculationVersion: string;
  /** Engine version of the `NutrientPlan` whose figures were consumed. */
  upstreamCalculationVersion: string;
  input: Readonly<Record<string, AllocationQuantity | string>>;
  limit: AllocationQuantity;
  output: AllocationQuantity;
  binding: ConstraintBinding;
  deferral?: AllocationDeferral;
  reason: string;
  affectsProductionOutput: false;
}

/** A constraint evaluated by another module (Campaign B regulation,
 * spreading-window timing, weather, operational capacity). This layer
 * records it with its own provenance; it never re-derives it. */
export interface ExternalRateConstraintInput {
  kind: ExternalRateConstraintKind;
  ruleId: string;
  sourceClaimIds: readonly string[];
  calculationVersion: string;
  /** The inputs the upstream module evaluated, preserved verbatim so the
   * decision can be reconstructed independently. */
  input: Readonly<Record<string, AllocationQuantity | string>>;
  limit: AllocationQuantity;
  /** The upstream module's evaluated result, preserved verbatim. */
  output: AllocationQuantity;
  binding: "BINDING" | "NOT_BINDING" | "UNDETERMINED";
  reason: string;
}

export interface PerNutrient<T> {
  N: T;
  P: T;
  K: T;
}

export interface SlurryRateAllocation {
  fieldId: string;
  calculationVersion: string;
  upstreamCalculationVersion: string;
  plannedRateM3ha: number;
  /** CROP_REQUIREMENT — `NutrientPlan.requirement`, unmodified. */
  cropRequirement: PerNutrient<AllocationQuantity>;
  /** AVAILABLE_SLURRY_NUTRIENT — `organicApplication.availableNutrientAssessment`
   * at the planned rate, availability factors already applied upstream. */
  availableSlurryNutrient: PerNutrient<AllocationQuantity>;
  /** ORGANIC_SHARE_LIMIT — share × crop requirement (P, K only). */
  organicShareLimit: { P: AllocationQuantity; K: AllocationQuantity };
  /** ORGANIC_ALLOCATED_NUTRIENT — the organic credit the current production
   * plan counts (`organicApplication.offset*`). No share cap is applied to
   * it: `shareCapApplied` is always `false` while the interaction is
   * AI_PROVISIONAL. */
  organicAllocatedNutrient: PerNutrient<AllocationQuantity> & { basis: "PRODUCTION_PLAN_OFFSET"; shareCapApplied: false };
  /** REMAINING_CHEMICAL_REQUIREMENT — `NutrientPlan.netRequirement`, unmodified. */
  remainingChemicalRequirement: PerNutrient<AllocationQuantity>;
  /** RATE_CONSTRAINT — every constraint considered, one record each. */
  rateConstraints: readonly RateConstraintRecord[];
  bindingConstraintIds: readonly string[];
  /** FINAL_ALLOWED_RATE — never selected here. */
  finalAllowedRate: {
    status: "DEFERRED";
    deferral: "RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL";
    rate: AllocationQuantity;
    reason: string;
  };
  affectsProductionOutput: false;
}

export interface SlurryRateAllocationInput {
  plan: Pick<NutrientPlan, "fieldId" | "fertilityEvidence" | "requirement" | "organicApplication" | "netRequirement" | "calculationVersion">;
  /** The field's recorded planned use. TGC-K90 is first-cut silage
   * guidance: it is evaluated only for `silage_1st_cut`; any other or
   * unrecorded use leaves it NOT_EVALUATED. */
  plannedUse?: FieldUse;
  externalConstraints?: readonly ExternalRateConstraintInput[];
}

// `NutrientPlan.requirement` is published rounded to whole kg/ha
// (`Math.round`, `calculateNutrientPlan`), so the true requirement lies in
// [value - 0.5, value + 0.5). A comparison against it is only decided when
// the result holds for every value in that interval.
const REQUIREMENT_ROUNDING_HALF_WIDTH_KG_HA = 0.5;

function compareWithRoundedLimit(available: number, roundedLimit: number, halfWidth: number): "BINDING" | "NOT_BINDING" | "UNDETERMINED" {
  if (available >= roundedLimit + halfWidth) return "BINDING";
  if (available <= roundedLimit - halfWidth) return "NOT_BINDING";
  return "UNDETERMINED";
}

function known(value: number, unit: "kg/ha" | "m3/ha" | "fraction" = "kg/ha"): AllocationQuantity {
  return { status: "known", value, unit };
}

function unknown(reason: string): AllocationQuantity {
  return { status: "unknown", reason };
}

function trackedPerNutrient(
  value: NutrientPlan["requirement"],
  unavailableReason: string,
): PerNutrient<AllocationQuantity> {
  if (value.status === "unavailable") {
    const reason = `${unavailableReason}: ${value.source}`;
    return { N: unknown(reason), P: unknown(reason), K: unknown(reason) };
  }
  return { N: known(value.value.n), P: known(value.value.p), K: known(value.value.k) };
}

function availableSlurryNutrient(plan: SlurryRateAllocationInput["plan"]): PerNutrient<AllocationQuantity> {
  const assessment = plan.organicApplication.availableNutrientAssessment;
  if (assessment.status === "OK") {
    return { N: known(assessment.value.n), P: known(assessment.value.p), K: known(assessment.value.k) };
  }
  if (assessment.status === "NOT_APPLICABLE" && plan.organicApplication.rateM3ha <= 0) {
    // No slurry planned for this field: a real zero, not an unknown.
    return { N: known(0), P: known(0), K: known(0) };
  }
  const reason = `slurry nutrient assessment ${assessment.status}${"reasonCode" in assessment ? ` (${assessment.reasonCode})` : ""}`;
  // CC-B2 F003 / CC-B4A: a missing P/K index withholds P and K together and
  // keeps the evidenced slurry N (`offsetN`).
  if (assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && assessment.reasonCode === "MISSING_SOIL_FERTILITY_INDEX") {
    return { N: known(plan.organicApplication.offsetN), P: unknown(reason), K: unknown(reason) };
  }
  return { N: unknown(reason), P: unknown(reason), K: unknown(reason) };
}

function soilIndexFor(plan: SlurryRateAllocationInput["plan"], nutrient: "P" | "K"): 1 | 2 | 3 | 4 | undefined {
  if (plan.fertilityEvidence.status !== "OK") return undefined;
  return nutrient === "P" ? plan.fertilityEvidence.value.pIndex : plan.fertilityEvidence.value.kIndex;
}

function requirementLimitRecord(
  nutrient: "P" | "K",
  requirement: AllocationQuantity,
  available: AllocationQuantity,
  plannedRateM3ha: number,
  upstreamCalculationVersion: string,
): RateConstraintRecord {
  const base = {
    constraintId: `${nutrient}_REQUIREMENT_LIMIT`,
    kind: nutrient === "P" ? ("P_REQUIREMENT_LIMIT" as const) : ("K_REQUIREMENT_LIMIT" as const),
    nutrient,
    ruleId: "CC_RATE_NO_EXCESS_OF_CROP_REQUIREMENT",
    evidenceClass: "REPOSITORY_VERIFIED" as const,
    sourceClaimIds: ["CLM-TGC-OM-RATE", "CLM-TGC-OM-EXCESS", "CLM-TGC-OM-BALANCE"],
    calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
    upstreamCalculationVersion,
    input: { plannedRateM3ha: known(plannedRateM3ha, "m3/ha"), availableSlurryNutrient: available, cropRequirement: requirement },
    limit: requirement,
    affectsProductionOutput: false as const,
  };
  if (requirement.status !== "known" || available.status !== "known") {
    return {
      ...base,
      output: unknown("crop requirement or available slurry nutrient unknown"),
      binding: "UNDETERMINED",
      reason: `${nutrient} requirement limit cannot be evaluated: an input is unknown.`,
    };
  }
  const binding = compareWithRoundedLimit(available.value, requirement.value, REQUIREMENT_ROUNDING_HALF_WIDTH_KG_HA);
  if (binding === "UNDETERMINED") {
    return {
      ...base,
      output: unknown("available slurry nutrient is within the rounding precision of the published crop requirement"),
      binding,
      reason: `Available slurry ${nutrient} (${available.value} kg/ha) is within ±0.5 kg/ha of the rounded crop ${nutrient} requirement (${requirement.value} kg/ha); whether it exceeds the requirement cannot be decided at that precision.`,
    };
  }
  const excess = Math.max(0, available.value - requirement.value);
  return {
    ...base,
    output: known(excess),
    binding,
    reason:
      excess > 0
        ? `Available slurry ${nutrient} at the planned rate exceeds the crop ${nutrient} requirement by ${excess} kg/ha.`
        : `Available slurry ${nutrient} at the planned rate does not exceed the crop ${nutrient} requirement.`,
  };
}

function organicShareRecord(
  nutrient: "P" | "K",
  index: 1 | 2 | 3 | 4 | undefined,
  requirement: AllocationQuantity,
  available: AllocationQuantity,
  availabilityFactorApplied: boolean | undefined,
  upstreamCalculationVersion: string,
): { record: RateConstraintRecord; limit: AllocationQuantity } {
  const share = index === undefined || index === 4 ? undefined : ORGANIC_SHARE_OF_REQUIREMENT[nutrient][index];
  const base = {
    constraintId: `ORGANIC_SHARE_LIMIT_${nutrient}`,
    kind: "ORGANIC_SHARE_LIMIT" as const,
    nutrient,
    ruleId: nutrient === "P" ? "CC_ORGANIC_SHARE_P_INDEX_1_2" : "CC_ORGANIC_SHARE_K_INDEX_1_2",
    evidenceClass: "REPOSITORY_VERIFIED" as const,
    sourceClaimIds: [nutrient === "P" ? "CLM-TGC-OM-SHARE-P" : "CLM-TGC-OM-SHARE-K", "CLM-AIR-CONF03-SHARE"],
    calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
    upstreamCalculationVersion,
    input: {
      soilIndex: index === undefined ? "unknown" : String(index),
      share: share === undefined ? unknown("no share stated for this index") : known(share, "fraction"),
      cropRequirement: requirement,
      availableSlurryNutrient: available,
    },
    affectsProductionOutput: false as const,
  };
  if (index === undefined) {
    const limit = unknown(`soil ${nutrient} Index unknown`);
    return {
      limit,
      record: { ...base, limit, output: unknown("soil index unknown"), binding: "UNDETERMINED", reason: `Soil ${nutrient} Index is unknown; no share limit applies or is assumed.` },
    };
  }
  if (share === undefined) {
    const limit = unknown("TGC-OM-2026 does not address Index 4");
    return {
      limit,
      record: {
        ...base,
        limit,
        output: unknown("share at Index 4 not stated by the source"),
        binding: "UNDETERMINED",
        deferral: "SOURCE_DOES_NOT_ADDRESS_INDEX_4",
        reason: `The stored source gives no organic share for ${nutrient} Index 4.`,
      },
    };
  }
  if (requirement.status !== "known") {
    const limit = unknown("crop requirement unknown");
    return { limit, record: { ...base, limit, output: unknown("crop requirement unknown"), binding: "UNDETERMINED", reason: `Crop ${nutrient} requirement is unknown.` } };
  }
  const limitKgHa = requirement.value * share;
  const limit = known(limitKgHa);
  // Index 3: share 100%, and no availability factor is applied upstream, so
  // available and total slurry nutrient coincide — no interaction question.
  if (index === 3 && availabilityFactorApplied === false && available.status === "known") {
    const binding = compareWithRoundedLimit(available.value, limitKgHa, REQUIREMENT_ROUNDING_HALF_WIDTH_KG_HA * share);
    if (binding === "UNDETERMINED") {
      return {
        limit,
        record: {
          ...base,
          limit,
          output: unknown("available slurry nutrient is within the rounding precision of the published crop requirement"),
          binding,
          reason: `Index 3: available slurry ${nutrient} (${available.value} kg/ha) is within the rounding precision of the 100% share limit (${limitKgHa} kg/ha); whether it exceeds the limit cannot be decided.`,
        },
      };
    }
    const excess = Math.max(0, available.value - limitKgHa);
    return {
      limit,
      record: {
        ...base,
        limit,
        output: known(excess),
        binding,
        reason: `Index 3: organic fertiliser may supply 100% of the crop ${nutrient} requirement.`,
      },
    };
  }
  return {
    limit,
    record: {
      ...base,
      limit,
      output: unknown("organic share comparison basis (available vs total slurry nutrient) is AI_PROVISIONAL"),
      binding: "UNDETERMINED",
      deferral: "IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL",
      reason: `Index ${index}: organic ${nutrient} limited to ${share * 100}% of crop requirement (${limitKgHa} kg/ha). Whether that cap is compared with the factor-reduced available ${nutrient} or total slurry ${nutrient} is not stated by the source, so it is not enforced.`,
    },
  };
}

function kSpringGuidanceRecord(requirement: AllocationQuantity, plannedUse: FieldUse | undefined, upstreamCalculationVersion: string): RateConstraintRecord {
  if (plannedUse !== "silage_1st_cut") {
    return {
      constraintId: "K_SPRING_GUIDANCE_90",
      kind: "K_SPRING_GUIDANCE_LIMIT",
      nutrient: "K",
      ruleId: "CC_K_SPRING_90_FIRST_CUT",
      evidenceClass: "REPOSITORY_VERIFIED",
      sourceClaimIds: ["CLM-TGC-K90-SPRING", "CLM-TGC-K90-SPLIT", "CLM-AIR-CONF02-RECON"],
      calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
      upstreamCalculationVersion,
      input: { cropRequirement: requirement, plannedUse: plannedUse ?? "unknown" },
      limit: known(K_SPRING_GUIDANCE_KG_HA),
      output: unknown("guidance not applicable or applicability unknown for this planned use"),
      binding: "NOT_EVALUATED",
      reason:
        plannedUse === undefined
          ? "Planned use is not recorded; the 90 kg K spring guidance (first-cut silage) is not evaluated."
          : `The 90 kg K spring guidance is stated for first-cut silage; it is not evaluated for planned use "${plannedUse}".`,
      affectsProductionOutput: false,
    };
  }
  return {
    constraintId: "K_SPRING_GUIDANCE_90",
    kind: "K_SPRING_GUIDANCE_LIMIT",
    nutrient: "K",
    ruleId: "CC_K_SPRING_90_FIRST_CUT",
    evidenceClass: "REPOSITORY_VERIFIED",
    sourceClaimIds: ["CLM-TGC-K90-SPRING", "CLM-TGC-K90-SPLIT", "CLM-AIR-CONF02-RECON"],
    calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
    upstreamCalculationVersion,
    input: { cropRequirement: requirement, scope: "first-cut silage context (TGC-K90)" },
    limit: known(K_SPRING_GUIDANCE_KG_HA),
    output:
      requirement.status === "known"
        ? known(Math.max(0, requirement.value - K_SPRING_GUIDANCE_KG_HA))
        : unknown("crop K requirement unknown"),
    binding: "NOT_ENFORCED",
    deferral: "RULE_RECORDED_IMPLEMENTATION_DEFERRED_PROVISIONAL",
    reason:
      "Recorded only. Advised K above 90 kg/ha moves to aftermath / late autumn; it is not removed. Whether slurry K counts toward the 90 kg is AI_PROVISIONAL, so no rate gate is applied and slurry K credit is never truncated.",
    affectsProductionOutput: false,
  };
}

function externalRecord(kind: ExternalRateConstraintKind, supplied: ExternalRateConstraintInput | undefined, upstreamCalculationVersion: string): RateConstraintRecord {
  if (supplied === undefined) {
    return {
      constraintId: kind,
      kind,
      ruleId: "NOT_SUPPLIED",
      evidenceClass: "EXTERNAL_MODULE",
      sourceClaimIds: [],
      calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
      upstreamCalculationVersion,
      input: {},
      limit: unknown("not evaluated by this layer"),
      output: unknown("not evaluated by this layer"),
      binding: "NOT_EVALUATED",
      reason: `${kind} was not supplied; it is unknown, not absent.`,
      affectsProductionOutput: false,
    };
  }
  return {
    constraintId: kind,
    kind,
    ruleId: supplied.ruleId,
    evidenceClass: "EXTERNAL_MODULE",
    sourceClaimIds: [...supplied.sourceClaimIds],
    calculationVersion: supplied.calculationVersion,
    upstreamCalculationVersion,
    input: { ...supplied.input },
    limit: supplied.limit,
    output: supplied.output,
    binding: supplied.binding,
    reason: supplied.reason,
    affectsProductionOutput: false,
  };
}

export function buildSlurryRateAllocation(input: SlurryRateAllocationInput): SlurryRateAllocation {
  const { plan } = input;
  const upstream = plan.calculationVersion;
  const plannedRateM3ha = plan.organicApplication.rateM3ha;
  const cropRequirement = trackedPerNutrient(plan.requirement, "crop requirement unavailable");
  const available = availableSlurryNutrient(plan);
  const remainingChemicalRequirement = trackedPerNutrient(plan.netRequirement, "net requirement unavailable");
  const assessment = plan.organicApplication.availableNutrientAssessment;
  const adjustment = assessment.status === "OK" ? assessment.value.soilIndexAdjustmentApplied : undefined;

  const shareP = organicShareRecord("P", soilIndexFor(plan, "P"), cropRequirement.P, available.P, adjustment?.p, upstream);
  const shareK = organicShareRecord("K", soilIndexFor(plan, "K"), cropRequirement.K, available.K, adjustment?.k, upstream);

  const suppliedByKind = new Map<ExternalRateConstraintKind, ExternalRateConstraintInput>();
  for (const constraint of input.externalConstraints ?? []) {
    if (suppliedByKind.has(constraint.kind)) {
      throw new Error(`Duplicate external rate constraint: ${constraint.kind}`);
    }
    suppliedByKind.set(constraint.kind, constraint);
  }

  const rateConstraints: RateConstraintRecord[] = [
    requirementLimitRecord("P", cropRequirement.P, available.P, plannedRateM3ha, upstream),
    requirementLimitRecord("K", cropRequirement.K, available.K, plannedRateM3ha, upstream),
    shareP.record,
    shareK.record,
    kSpringGuidanceRecord(cropRequirement.K, input.plannedUse, upstream),
    ...EXTERNAL_RATE_CONSTRAINT_KINDS.map((kind) => externalRecord(kind, suppliedByKind.get(kind), upstream)),
  ];

  const offsetKnown = (nutrient: AllocationNutrient, value: number): AllocationQuantity =>
    available[nutrient].status === "known" ? known(value) : unknown(`available slurry ${nutrient} unknown; production counts no ${nutrient} credit`);

  return {
    fieldId: plan.fieldId,
    calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
    upstreamCalculationVersion: upstream,
    plannedRateM3ha,
    cropRequirement,
    availableSlurryNutrient: available,
    organicShareLimit: { P: shareP.limit, K: shareK.limit },
    organicAllocatedNutrient: {
      N: offsetKnown("N", plan.organicApplication.offsetN),
      P: offsetKnown("P", plan.organicApplication.offsetP),
      K: offsetKnown("K", plan.organicApplication.offsetK),
      basis: "PRODUCTION_PLAN_OFFSET",
      shareCapApplied: false,
    },
    remainingChemicalRequirement,
    rateConstraints,
    bindingConstraintIds: rateConstraints.filter((c) => c.binding === "BINDING").map((c) => c.constraintId),
    finalAllowedRate: {
      status: "DEFERRED",
      deferral: "RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL",
      rate: unknown("no repository-verified selector combines the constraints into one rate"),
      reason:
        "Repository evidence gives rate principles (base the rate on crop P/K requirement; no excess) but no deterministic selector over several constraints. AI_PROVISIONAL_RATE_SELECTOR_V1 is not implemented.",
    },
    affectsProductionOutput: false,
  };
}
