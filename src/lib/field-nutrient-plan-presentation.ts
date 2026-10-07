import type { EvidenceState } from "@/domain/evidence";
import type { Field, FieldNutrientRemainingArm, FieldNutrientRequirementArm, NutrientPlan } from "@/domain/types";
import { roundKgUpToDisplayTonnes } from "@/domain/fertiliser-plan";
import { sanitiseRecommendedProduct } from "@/orchestration/prompt/fertiliser-recommendation";
import type { FieldNutrientPlanResult } from "@/orchestration/fertiliser-plan/field-nutrient-plan";
import { requirementCardPresentation } from "@/lib/nutrient-card-presentation";
import { nothingToBuyMessage, purchaseStatusPresentation } from "@/lib/purchase-status-presentation";
import { formatNumber } from "@/lib/format";

/**
 * Farm Spatial V2 Phase 4 — the field drawer's and the field nutrient
 * plan's view of one field's canonical `NutrientPlan`
 * (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §6.2/§6.3), in the approved
 * order: requirement → organic contribution → remaining requirement →
 * product solution → evidence.
 *
 * Presentation selection only. Every figure is copied from the engine:
 * requirement `fieldRequirement`, organic contribution
 * `organicApplication.availableNutrientByNutrient`, remaining
 * `fieldRemainingRequirement`, products `purchasedProducts` gated by
 * `purchaseStatus` (tonnes via `roundKgUpToDisplayTonnes`). Nothing is
 * subtracted, summed or re-derived, and the plan is never mutated. An
 * unknown value carries its reason and no number — never 0.
 */

export type NutrientKey = "n" | "p" | "k";
export const NUTRIENT_KEYS: readonly NutrientKey[] = ["n", "p", "k"];

export type NutrientCell =
  /** The engine's unrounded kg/ha; round only when displaying. */
  | { state: "value"; kgHa: number }
  | { state: "unknown"; reasonCode: string }
  /** No slurry planned: no organic contribution (a known zero credit in
   * the engine's remaining figure), shown as "None". */
  | { state: "none" }
  | { state: "not_applicable"; reasonCode: string };

/** Display text for a cell: a known value is rounded for display only. */
export function nutrientCellText(cell: NutrientCell): string {
  switch (cell.state) {
    case "value":
      return formatNumber(cell.kgHa, 0);
    case "unknown":
      return "Unknown";
    case "none":
      return "None";
    case "not_applicable":
      return "N/A";
  }
}

export interface NutrientRow {
  id: "requirement" | "organic" | "remaining";
  label: string;
  cells: Record<NutrientKey, NutrientCell>;
}

export type OrganicApplicationView =
  | { state: "none" }
  | {
      state: "planned";
      totalM3: number;
      rateM3ha: number;
      /** Application method label, when the credit's basis is known. */
      method?: string;
      methodAssumed: boolean;
      timingAssumed: boolean;
      /** False when the slurry credit's table basis couldn't be assessed. */
      creditAssessed: boolean;
    };

export interface ProductView {
  name: string;
  npkAnalysis: string;
  rateKgHa: number;
  totalKg: number;
  displayTonnes: number;
}

export type ProductSolutionView =
  | { kind: "products"; products: ProductView[]; provisional?: { headline: string; detail: string } }
  | { kind: "nothing_to_buy"; message: string }
  | { kind: "unavailable"; label: string; message: string };

export interface PlanEvidenceView {
  calculationVersion: string;
  engineVersion: string;
  cropBasis: "grazing" | "silage" | "tillage";
  plannedUseAssumed: boolean;
  /** Lab soil test sample date (ISO), absent when there is no lab test. */
  soilTestDate?: string;
  requirementSource?: string;
  requirementRuleRefs: string[];
  limitations: string[];
  /** Per-nutrient evidence state of each known remaining figure. */
  remainingEvidence: Partial<Record<NutrientKey, EvidenceState>>;
  slurryDm?: { dmPct: number; status: string; source: string };
  organicSource?: string;
}

export type FieldNutrientPlanView =
  | { status: "unavailable"; message: string }
  | {
      status: "available";
      rows: [NutrientRow, NutrientRow, NutrientRow];
      /** Plain-language reasons for every unknown cell, de-duplicated. */
      unknownReasons: string[];
      /** One soil index known, the other missing (the D3 line). */
      mixedIndexLine?: string;
      /** The frozen `requirementProvisional` notice, only under the
       * existing helpers' conditional rules (CC-FU-A). */
      provisional?: { headline: string; detail: string };
      organic: OrganicApplicationView;
      solution: ProductSolutionView;
      evidence: PlanEvidenceView;
    };

function requirementCell(arm: FieldNutrientRequirementArm): NutrientCell {
  if (arm.status === "KNOWN") return { state: "value", kgHa: arm.kgHa };
  if (arm.status === "UNKNOWN") return { state: "unknown", reasonCode: arm.reasonCode };
  return { state: "not_applicable", reasonCode: arm.reasonCode };
}

function remainingCell(arm: FieldNutrientRemainingArm): NutrientCell {
  if (arm.status === "KNOWN") return { state: "value", kgHa: arm.kgHa };
  if (arm.status === "UNKNOWN") return { state: "unknown", reasonCode: arm.reasonCode };
  return { state: "not_applicable", reasonCode: arm.reasonCode };
}

type CreditArm = NutrientPlan["organicApplication"]["availableNutrientByNutrient"]["n"];

function organicCell(arm: CreditArm): NutrientCell {
  if (arm.status === "OK") return { state: "value", kgHa: arm.value.kgHa };
  if (arm.status === "NOT_APPLICABLE") return { state: "none" };
  return { state: "unknown", reasonCode: arm.reasonCode };
}

const REASON_TEXT: Record<string, string> = {
  MISSING_SOIL_FERTILITY_INDEX: "A soil P or K Index isn't recorded — add a soil test to complete the plan.",
  MISSING_LIVESTOCK_DATA: "No livestock is recorded, so the grazing requirement can't be worked out.",
  MISSING_GRASSLAND_AREA: "No usable grassland area is recorded for the farm.",
  MISSING_SILAGE_PLAN_DATA: "This silage field has no cut or yield plan to work its requirement from.",
  MISSING_FIELD_AREA: "This field has no usable area.",
  SLURRY_COMPOSITION_SOURCES_UNRESOLVED: "The planned slurry comes from more than one store with recorded composition, so its credit can't be worked out.",
};

function reasonText(row: NutrientRow["id"], reasonCode: string): string {
  return (
    REASON_TEXT[reasonCode] ??
    (row === "organic"
      ? "The slurry nutrient credit can't be assessed for this planned application yet."
      : "Farm Return can't work this out from the evidence on file.")
  );
}

const METHOD_LABEL: Record<string, string> = {
  LESS: "LESS",
  splashplate: "Splash plate",
  incorporate_24h: "Incorporated within 24 h",
  other: "Other method",
};

const DATA_STATUS_LABEL: Record<string, string> = {
  verified: "measured",
  farmer_adjusted: "farmer entered",
  estimated: "estimated",
  mapped: "mapped",
  unavailable: "unavailable",
};

export const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
  MEASURED: "Measured",
  DERIVED: "Derived",
  IRISH_MODEL: "Irish model",
  IRISH_DEFAULT: "Irish default",
  GENERIC_FALLBACK: "Generic fallback",
  INSUFFICIENT: "Insufficient",
};

function organicView(plan: NutrientPlan, planned: boolean): OrganicApplicationView {
  if (!planned) return { state: "none" };
  const organic = plan.organicApplication;
  const basis = organic.availableNutrientBasis;
  if (basis.status !== "OK") {
    return { state: "planned", totalM3: organic.totalM3, rateM3ha: organic.rateM3ha, methodAssumed: false, timingAssumed: false, creditAssessed: false };
  }
  return {
    state: "planned",
    totalM3: organic.totalM3,
    rateM3ha: organic.rateM3ha,
    method: basis.value.applicationMethod ? METHOD_LABEL[basis.value.applicationMethod] : undefined,
    methodAssumed: basis.value.assumedDefault,
    timingAssumed: basis.value.timingAssumed,
    creditAssessed: true,
  };
}

function solutionView(plan: NutrientPlan): ProductSolutionView {
  const presentation = purchaseStatusPresentation(plan.purchaseStatus, plan.requirementProvisional);
  if (presentation.kind === "products") {
    return {
      kind: "products",
      products: plan.purchasedProducts.map((product) => {
        const clean = sanitiseRecommendedProduct(product);
        return {
          name: clean.name,
          npkAnalysis: clean.npkAnalysis,
          rateKgHa: clean.rateKgHa,
          totalKg: clean.totalKg,
          displayTonnes: roundKgUpToDisplayTonnes(clean.totalKg),
        };
      }),
      ...(presentation.provisional ? { provisional: presentation.provisional } : {}),
    };
  }
  if (presentation.kind === "nothing_to_buy") {
    return { kind: "nothing_to_buy", message: nothingToBuyMessage(plan.purchaseStatus) ?? "Nothing to buy." };
  }
  return { kind: "unavailable", label: presentation.label, message: presentation.message };
}

function evidenceView(plan: NutrientPlan, field: Field, planned: boolean): PlanEvidenceView {
  const requirement = plan.fieldRequirement;
  const knownArms = NUTRIENT_KEYS.map((key) => requirement[key]).filter((arm) => arm.status === "KNOWN");
  const remainingEvidence: Partial<Record<NutrientKey, EvidenceState>> = {};
  for (const key of NUTRIENT_KEYS) {
    const arm = plan.fieldRemainingRequirement[key];
    if (arm.status === "KNOWN") remainingEvidence[key] = arm.evidenceState;
  }
  const organic = plan.organicApplication;
  return {
    calculationVersion: plan.calculationVersion,
    engineVersion: requirement.engineVersion,
    cropBasis: requirement.cropContext.basis,
    plannedUseAssumed: requirement.cropContext.plannedUseAssumed,
    soilTestDate: field.fertility.verifiedTest?.sampleDate,
    requirementSource: knownArms[0]?.source,
    requirementRuleRefs: [...new Set(knownArms.flatMap((arm) => arm.ruleRefs))],
    limitations: [...new Set(knownArms.flatMap((arm) => arm.limitations))],
    remainingEvidence,
    ...(planned
      ? {
          slurryDm: { dmPct: organic.dmPct, status: DATA_STATUS_LABEL[organic.dmPctEvidence.status] ?? organic.dmPctEvidence.status, source: organic.dmPctEvidence.source },
          ...(organic.availableNutrientBasis.status === "OK" ? { organicSource: organic.availableNutrientBasis.value.source } : {}),
        }
      : {}),
  };
}

export function fieldNutrientPlanView(result: FieldNutrientPlanResult, field: Field): FieldNutrientPlanView {
  if (!result.showFertiliserRecommendation) {
    return {
      status: "unavailable",
      message: result.tillage
        ? "This field is tillage — Farm Return has no fertiliser recommendation table for tillage ground."
        : "Add a livestock group on the Livestock screen to get a real fertiliser recommendation for this field.",
    };
  }
  const { plan } = result;
  const credit = plan.organicApplication.availableNutrientByNutrient;
  const cells = (pick: (key: NutrientKey) => NutrientCell): Record<NutrientKey, NutrientCell> => ({ n: pick("n"), p: pick("p"), k: pick("k") });
  const rows: [NutrientRow, NutrientRow, NutrientRow] = [
    { id: "requirement", label: "Requirement", cells: cells((key) => requirementCell(plan.fieldRequirement[key])) },
    { id: "organic", label: "Organic contribution", cells: cells((key) => organicCell(credit[key])) },
    { id: "remaining", label: "Remaining", cells: cells((key) => remainingCell(plan.fieldRemainingRequirement[key])) },
  ];

  const unknownReasons = [
    ...new Set(
      rows.flatMap((row) =>
        NUTRIENT_KEYS.map((key) => row.cells[key]).flatMap((cell) => (cell.state === "unknown" ? [reasonText(row.id, cell.reasonCode)] : [])),
      ),
    ),
  ];

  const card = requirementCardPresentation(plan);
  const solution = solutionView(plan);
  const cardProvisional =
    card.kind === "mixed" && card.showProvisional && plan.requirementProvisional.headline && plan.requirementProvisional.detail
      ? { headline: plan.requirementProvisional.headline, detail: plan.requirementProvisional.detail }
      : undefined;
  const provisional = (solution.kind === "products" ? solution.provisional : undefined) ?? cardProvisional;
  const planned = result.slurryAllocation !== undefined;

  return {
    status: "available",
    rows,
    unknownReasons,
    ...(card.kind === "mixed" ? { mixedIndexLine: card.line } : {}),
    ...(provisional ? { provisional } : {}),
    organic: organicView(plan, planned),
    solution,
    evidence: evidenceView(plan, field, planned),
  };
}
