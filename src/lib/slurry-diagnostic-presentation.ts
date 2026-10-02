import type { AllocationQuantity, SlurryRateAllocation } from "@/domain/slurry-rate-allocation";
import type { FieldNutrientRemainingArm, FieldNutrientRequirementArm } from "@/domain/types";

/**
 * Fertiliser Vertical Completion, Increment 2d
 * (`docs/farm-return-next/FERTILISER_VERTICAL_SLURRY_DESIGN.md` §3, D1
 * authorised 2026-10-02) — which state the read-only per-field slurry
 * diagnostic renders. Pure presentation selection over a
 * `buildSlurryRateAllocation` result: it reads the canonical requirement,
 * available slurry nutrient, organic excess and remaining chemical
 * requirement exactly as the layer reports them and never derives a
 * number. It evaluates the farmer's planned slurry only; it never
 * produces or implies a slurry rate (D2). Each nutrient is independent and
 * an unknown value is `unknown` (shown "Unknown"), never 0.
 */

export type DiagnosticNutrient = "N" | "P" | "K";

export type DiagnosticValue =
  /** kg/ha, unrounded — the card rounds for display. */
  | { kind: "known"; kgHa: number }
  | { kind: "unknown"; reason: string }
  | { kind: "not_evaluated"; reason: string };

export interface SlurryDiagnosticRow {
  nutrient: DiagnosticNutrient;
  contribution: DiagnosticValue;
  requirement: DiagnosticValue;
  remaining: DiagnosticValue;
  /** Available slurry nutrient above the requirement; a known 0 is "no
   * excess". Never clamped away by the remaining requirement. */
  excess: DiagnosticValue;
}

export type PlannedSlurryPresentation =
  | { kind: "none"; line: string }
  | {
      kind: "planned";
      rateM3ha: number;
      totalM3: number;
      /** The basis of the slurry contribution figures, when assessed. */
      basis?: { dmPct: number; source: string; assumptions: string[] };
    };

export type SlurryDiagnosticPresentation = {
  planned: PlannedSlurryPresentation;
  evaluation:
    | { kind: "none_planned" }
    | { kind: "not_evaluated"; line: string }
    | { kind: "evaluated"; rows: SlurryDiagnosticRow[]; excessNutrients: DiagnosticNutrient[] };
  calculationVersion: string;
  upstreamCalculationVersion: string;
};

export const SLURRY_DIAGNOSTIC_SCOPE_LINE =
  "Evaluates the slurry you have planned for this field against its nutrient requirement. It does not set a slurry rate.";

const NOT_ASSESSED = "Slurry contribution not assessed for this application";

const REASON_LABEL: Record<string, string> = {
  TILLAGE_FIELD_NOT_SUPPORTED: "Farm Return has no nutrient requirement table for tillage ground",
  MISSING_LIVESTOCK_DATA: "No livestock recorded",
  MISSING_GRASSLAND_AREA: "No grassland area recorded",
  MISSING_SILAGE_PLAN_DATA: "Silage plan not recorded",
};

function requirementReason(nutrient: DiagnosticNutrient, reasonCode: string): string {
  if (reasonCode === "MISSING_SOIL_FERTILITY_INDEX") return `Soil ${nutrient} Index missing`;
  return REASON_LABEL[reasonCode] ?? "Not enough evidence";
}

function requirementValue(nutrient: DiagnosticNutrient, arm: FieldNutrientRequirementArm): DiagnosticValue {
  if (arm.status === "KNOWN") return { kind: "known", kgHa: arm.kgHa };
  const reason = requirementReason(nutrient, arm.reasonCode);
  return arm.status === "NOT_APPLICABLE" ? { kind: "not_evaluated", reason } : { kind: "unknown", reason };
}

function remainingValue(nutrient: DiagnosticNutrient, arm: FieldNutrientRemainingArm): DiagnosticValue {
  if (arm.status === "KNOWN") return { kind: "known", kgHa: arm.kgHa };
  if (arm.status === "NOT_APPLICABLE") return { kind: "not_evaluated", reason: requirementReason(nutrient, arm.reasonCode) };
  return { kind: "unknown", reason: arm.cause === "SLURRY_CREDIT_UNKNOWN" ? NOT_ASSESSED : requirementReason(nutrient, arm.reasonCode) };
}

function contributionValue(quantity: AllocationQuantity): DiagnosticValue {
  return quantity.status === "known" ? { kind: "known", kgHa: quantity.value } : { kind: "unknown", reason: NOT_ASSESSED };
}

/** The layer's excess is unknown whenever the requirement or the
 * contribution is; the farmer-facing reason is whichever of those two
 * cells is not known (the requirement first). */
function excessValue(quantity: AllocationQuantity, requirement: DiagnosticValue, contribution: DiagnosticValue): DiagnosticValue {
  if (quantity.status === "known") return { kind: "known", kgHa: quantity.value };
  if (requirement.kind !== "known") return requirement;
  if (contribution.kind !== "known") return contribution;
  return { kind: "unknown", reason: "Not enough evidence" };
}

function plannedPresentation(allocation: SlurryRateAllocation): PlannedSlurryPresentation {
  const planned = allocation.plannedApplication;
  if (planned.status === "NONE_PLANNED") return { kind: "none", line: "No slurry planned for this field." };
  if (planned.basis.status !== "OK") return { kind: "planned", rateM3ha: planned.rateM3ha, totalM3: planned.totalM3 };
  const { value } = planned.basis;
  const assumptions: string[] = [];
  if (value.assumedDefault) assumptions.push("Application method assumed (not recorded)");
  if (value.timingAssumed) assumptions.push("Spring timing assumed (no date recorded)");
  return { kind: "planned", rateM3ha: planned.rateM3ha, totalM3: planned.totalM3, basis: { dmPct: value.dmPct, source: value.source, assumptions } };
}

export function slurryDiagnosticPresentation(allocation: SlurryRateAllocation): SlurryDiagnosticPresentation {
  const planned = plannedPresentation(allocation);
  const versions = { calculationVersion: allocation.calculationVersion, upstreamCalculationVersion: allocation.upstreamCalculationVersion };
  if (planned.kind === "none") return { planned, evaluation: { kind: "none_planned" }, ...versions };

  const { requirement, remainingChemicalRequirement: remaining } = allocation;
  // Every requirement arm not applicable (tillage): the layer evaluates
  // nothing, so neither does the diagnostic — one line, no figures.
  if (requirement.n.status === "NOT_APPLICABLE" && requirement.p.status === "NOT_APPLICABLE" && requirement.k.status === "NOT_APPLICABLE") {
    return {
      planned,
      evaluation: { kind: "not_evaluated", line: `Not evaluated: ${requirementReason("N", requirement.n.reasonCode)}.` },
      ...versions,
    };
  }

  const rows = (["N", "P", "K"] as const).map((nutrient): SlurryDiagnosticRow => {
    const key = nutrient.toLowerCase() as "n" | "p" | "k";
    const req = requirementValue(nutrient, requirement[key]);
    const contribution = contributionValue(allocation.availableSlurryNutrient[nutrient]);
    return {
      nutrient,
      contribution,
      requirement: req,
      remaining: remainingValue(nutrient, remaining[key]),
      excess: excessValue(allocation.organicExcessOverRequirement[nutrient], req, contribution),
    };
  });
  const excessNutrients = rows.filter((row) => row.excess.kind === "known" && row.excess.kgHa > 0).map((row) => row.nutrient);
  return { planned, evaluation: { kind: "evaluated", rows, excessNutrients }, ...versions };
}
