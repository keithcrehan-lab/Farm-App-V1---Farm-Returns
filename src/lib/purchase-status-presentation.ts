import type { FieldPurchaseStatus, NutrientPlan } from "@/domain/types";

/**
 * Fertiliser Vertical Completion, Session 2b — which state a purchased-
 * fertiliser surface renders, selected only from the engine's
 * `NutrientPlan.purchaseStatus` (never inferred from an empty product list).
 * Pure presentation selection: no number is derived here.
 *
 * - `products`: the engine sized a blend (`RECOMMENDED`, or
 *   `RECOMMENDED_CREDIT_NOT_COUNTED` with `provisional` set).
 * - `nothing_to_buy`: a decided answer — the requirement is known and no
 *   product is needed (`NONE_NEEDED`) or chemical fertiliser is legally
 *   prohibited on the field (`PROHIBITED`).
 * - `unavailable`: no recommendation can be made (`UNKNOWN`,
 *   `WITHHELD_MIXED_EVIDENCE`, `NOT_APPLICABLE`) — never "nothing needed".
 */
export type PurchaseStatusPresentation =
  | { kind: "products"; provisional?: { headline: string; detail: string } }
  | { kind: "nothing_to_buy"; reason: "NONE_NEEDED" | "PROHIBITED" }
  | { kind: "unavailable"; label: "Not applicable" | "Insufficient evidence" | "Withheld"; message: string };

const UNKNOWN_MESSAGES: Record<string, string> = {
  MISSING_LIVESTOCK_DATA: "Add a livestock group on the Livestock screen to get a real fertiliser recommendation for this field.",
  STOCKING_RATE_BEYOND_PUBLISHED_TABLE:
    "This farm's grazing stocking rate is above 3.0 livestock units per hectare, beyond what the Teagasc Green Book table covers, so a grazing P and K requirement can't be worked out — no fertiliser products can be recommended yet.",
  MISSING_GRASSLAND_AREA:
    "This farm has no usable grassland area recorded, so the grazing stocking rate this field's requirement depends on can't be worked out — no fertiliser products can be recommended yet.",
  MISSING_SOIL_FERTILITY_INDEX: "This field's P/K Soil Index has not been recorded — add a soil test or a farmer estimate to unlock a fertiliser plan.",
  MISSING_SILAGE_PLAN_DATA: "This field is recorded as a silage cut but has no real cut/yield plan to calculate its silage-specific N/P/K requirement from.",
  SLURRY_COMPOSITION_SOURCES_UNRESOLVED:
    "This field's planned slurry comes from more than one store with recorded composition, so its nutrient credit can't be worked out — no fertiliser products can be recommended until it can.",
  MISSING_FIELD_PRODUCTION_CYCLE: "Choose how this field will be used this season before Farm Return can calculate its fertiliser.",
  P3_MISSING_PRODUCTION_CYCLE: "Choose how this field will be used this season before Farm Return can calculate its fertiliser.",
  MISSING_FARM_PRODUCTION_CYCLES_FOR_GRASSLAND_AREA:
    "This grazing field's stocking rate depends on the farm's total grassland area. Choose a field use for every field, or record cattle movements on this field, to calculate it.",
  P3_UNSUPPORTED_PATHWAY:
    "Farm Return has no validated Teagasc table for this field's production system yet, so it will not guess a fertiliser requirement.",
  P3_SOURCE_CONFLICT: "The evidence for this field conflicts. Review the field's production details before a requirement can be calculated.",
  MISSING_NATIONAL_BUFFER_ASSESSMENT:
    "The distance from this field to the nearest watercourse is not known yet, so the statutory buffer cannot be checked.",
  CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED:
    "A watercourse is within 3 m of this field, but its mapped line is not on file, so the 3 m strip where chemical fertiliser is not allowed (S.I. 588/2025 Art. 18(1)) cannot be measured yet. Open the field's legal checks to re-run the public water check.",
  CHEMICAL_WATER_STRIP_GEOMETRY_CONFLICT:
    "The recorded watercourse distance and the mapped water line disagree, so the 3 m chemical-fertiliser strip cannot be measured. Review the watercourse distance for this field.",
  P3_INCOMPLETE_SLURRY_EVIDENCE:
    "Slurry is planned for this field but its spreading method, date, store or soil index is missing, so its nutrient credit can't be counted yet.",
  P3_PLANNED_SLURRY_IN_CLOSED_PERIOD:
    "The slurry planned for this field falls in the statutory closed period. Move the application date or remove it — it cannot count towards the fertiliser requirement.",
  P3_PLANNED_SLURRY_WITHIN_WATER_BUFFER:
    "This field is closer to a watercourse than the statutory slurry buffer allows, so the planned slurry cannot count towards the fertiliser requirement.",
  P3_PLANNED_SLURRY_BUFFER_UNRESOLVED:
    "This field meets the baseline slurry buffer but not the wider buffer that applies around the closed period or on steep ground. Review the planned slurry before it can count.",
  P3_PLANNED_SLURRY_DATE_UNRESOLVED:
    "The planned slurry date or farm county could not be checked against the statutory spreading calendar.",
  P3_PLANNED_SLURRY_WITHIN_LOCAL_BUFFER:
    "A local-authority buffer recorded for this field is wider than its distance to the water, so the planned slurry cannot count towards the fertiliser requirement.",
  P3_PLANNED_SLURRY_LOCAL_BUFFER_UNRESOLVED:
    "Whether a local-authority buffer applies to this field has not been confirmed, so the planned slurry cannot count towards the fertiliser requirement yet. Confirm it in the field's legal checks.",
  P3_PLANNED_SLURRY_LESS_REQUIRED:
    "This farm's stocking rate requires low-emission slurry spreading (S.I. 588/2025 Art. 19), but the planned method is not LESS. Change the method before the slurry can count.",
  P3_PLANNED_SLURRY_METHOD_UNRESOLVED:
    "Low-emission slurry spreading depends on last year's grassland stocking rate (S.I. 588/2025 Art. 19), which is not recorded for this farm. Record it in Settings, or plan the slurry with LESS, before it can count.",
  P3_SPREADABLE_AREA_ZERO:
    "This field is recorded as having no area where slurry can be spread, so the planned slurry cannot count towards the fertiliser requirement.",
  P3_SPREADABLE_AREA_STALE:
    "The field boundary or area changed after its no-spread areas were recorded. Confirm the spreadable area again before the planned slurry can count.",
  P3_SPREADABLE_AREA_CONFLICT:
    "The recorded spreadable area for this field conflicts (more than one current answer, or more than the field). Review it before the planned slurry can count.",
  P3_SPREADABLE_AREA_INVALID:
    "The recorded spreadable area for this field is not a valid figure. Record it again before the planned slurry can count.",
  BLOCK_NO_INTERPOLATION:
    "The slurry's dry matter is not one of the values the low-emission (LESS) spring table publishes (2, 4, 6 or 7%), and Farm Return will not interpolate between them. Record a slurry test for this store to calculate its nutrient value.",
  SLURRY_MINIMUM_RATE_EXCEEDS_REQUIREMENT:
    "Even the lowest slurry rate the Teagasc table covers would supply more of a nutrient than this field needs, so no slurry rate is recommended here.",
  P3_FIELD_AREA_UNKNOWN:
    "This field has no valid mapped area, so a slurry application rate cannot be worked out.",
  P3_PRODUCT_P_EXCEEDS_NAP_CEILING:
    "No product mix Farm Return can propose, including phosphorus-free potash, keeps this field within its legal phosphorus maximum (S.I. 588/2025 Table 15a), so no product is proposed for it.",
  P3_PRIOR_CHEMICAL_P_EXCEEDS_NAP_CEILING:
    "Chemical phosphorus already recorded on this field this season is above its legal phosphorus maximum (S.I. 588/2025 Table 15a), so Farm Return proposes no further fertiliser for it. Check the applications recorded for this field.",
  P3_NAP_P_CEILING_UNRESOLVED:
    "Farm Return cannot yet confirm that the phosphorus planned for this field — from products and slurry — is within its legal maximum (S.I. 588/2025 Table 15a). Record where the planned slurry comes from (home-produced or imported), or its soil P Index, to check it.",
};

const DEFAULT_UNKNOWN_MESSAGE = "Farm Return can't work out this field's fertiliser products from the evidence on file.";

/** The farmer-facing reason a field's fertiliser cannot be calculated —
 * one wording for every surface that shows a blocked reason code. */
export function unknownReasonMessage(reasonCode: string): string {
  return UNKNOWN_MESSAGES[reasonCode] ?? DEFAULT_UNKNOWN_MESSAGE;
}

/** Fallback when the engine's `requirementProvisional` carries no text. */
const CREDIT_NOT_COUNTED_FALLBACK = {
  headline: "Slurry nutrient credit not included",
  detail: "Fertiliser requirement is provisional until the slurry nutrient contribution can be assessed.",
};

/** The decided "nothing to buy" reason for `NONE_NEEDED` / `PROHIBITED`
 * (`null` otherwise) — one wording for the field card and the farm summary. */
export function nothingToBuyMessage(status: FieldPurchaseStatus): string | null {
  switch (status.status) {
    case "NONE_NEEDED":
      return status.basis === "REMAINING_ZERO" ? "Requirement already met — nothing to buy." : "Remaining need is below the smallest product rate — nothing to buy.";
    case "PROHIBITED":
      return status.reasonCode === "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED"
        ? "Chemical fertiliser is prohibited on commonage."
        : "Chemical fertiliser is prohibited: the whole field lies within 3 m of surface water.";
    default:
      return null;
  }
}

export function purchaseStatusPresentation(
  status: FieldPurchaseStatus,
  requirementProvisional?: NutrientPlan["requirementProvisional"],
): PurchaseStatusPresentation {
  switch (status.status) {
    case "RECOMMENDED":
      return { kind: "products" };
    case "RECOMMENDED_CREDIT_NOT_COUNTED":
      return {
        kind: "products",
        provisional: {
          headline: requirementProvisional?.headline ?? CREDIT_NOT_COUNTED_FALLBACK.headline,
          detail: requirementProvisional?.detail ?? CREDIT_NOT_COUNTED_FALLBACK.detail,
        },
      };
    case "NONE_NEEDED":
    case "PROHIBITED":
      return { kind: "nothing_to_buy", reason: status.status };
    case "WITHHELD_MIXED_EVIDENCE":
      return {
        kind: "unavailable",
        label: "Withheld",
        message:
          "Only one of this field's P and K Soil Indexes is recorded. Farm Return's P and K products are blends that supply both nutrients, so no fertiliser products are recommended for this field until both indexes are recorded.",
      };
    case "NOT_APPLICABLE":
      return {
        kind: "unavailable",
        label: "Not applicable",
        message:
          status.reasonCode === "TILLAGE_FIELD_NOT_SUPPORTED"
            ? "This field is tillage — Farm Return has no fertiliser recommendation table for tillage ground."
            : "No fertiliser recommendation applies to this field.",
      };
    case "UNKNOWN":
      return { kind: "unavailable", label: "Insufficient evidence", message: unknownReasonMessage(status.reasonCode) };
  }
}
