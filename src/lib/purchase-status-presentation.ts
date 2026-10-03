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
  MISSING_GRASSLAND_AREA:
    "This farm has no usable grassland area recorded, so the grazing stocking rate this field's requirement depends on can't be worked out — no fertiliser products can be recommended yet.",
  MISSING_SOIL_FERTILITY_INDEX: "This field's P/K Soil Index has not been recorded — add a soil test or a farmer estimate to unlock a fertiliser plan.",
  MISSING_SILAGE_PLAN_DATA: "This field is recorded as a silage cut but has no real cut/yield plan to calculate its silage-specific N/P/K requirement from.",
  SLURRY_COMPOSITION_SOURCES_UNRESOLVED:
    "This field's planned slurry comes from more than one store with recorded composition, so its nutrient credit can't be worked out — no fertiliser products can be recommended until it can.",
};

const DEFAULT_UNKNOWN_MESSAGE = "Farm Return can't work out this field's fertiliser products from the evidence on file.";

/** Fallback when the engine's `requirementProvisional` carries no text. */
const CREDIT_NOT_COUNTED_FALLBACK = {
  headline: "Slurry nutrient credit not included",
  detail: "Fertiliser requirement is provisional until the slurry nutrient contribution can be assessed.",
};

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
      return { kind: "unavailable", label: "Insufficient evidence", message: UNKNOWN_MESSAGES[status.reasonCode] ?? DEFAULT_UNKNOWN_MESSAGE };
  }
}
