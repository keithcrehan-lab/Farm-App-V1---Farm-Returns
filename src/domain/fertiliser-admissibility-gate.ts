/**
 * Scientific engine V3 — Phase F5: `FERTILISER_PRODUCT_ADMISSIBILITY`.
 *
 * `ADVERSARIAL_AUDIT_REPORT.md` §1.7 (AF009, HIGH): "N-P-K analysis alone
 * is insufficient for every current legal product route. Formulation,
 * physical form, ureic-N and inhibitor status may matter." Closes
 * `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflict #7:
 * `nutrients.ts`'s `PRODUCTS.protectedUrea` is implicitly assumed
 * inhibited because of its NAME ("Protected Urea") — exactly the
 * inference `rules_statutory/fertiliser_product_restrictions_2026.csv`'s
 * own notes prohibit ("Do not infer inhibitor status from product
 * name."). This gate is what a real product catalogue should consult
 * instead, once one exists with real per-product formulation metadata
 * (Phase C's `FertiliserProduct.formulation` field) — `nutrients.ts`'s
 * static `PRODUCTS` constant has no such metadata today, so wiring this
 * in is real follow-up work, not done in this phase.
 */

import { legalProhibition, ok, unknown, type EngineOutcome } from "./evidence";

export const FERTILISER_ADMISSIBILITY_GATE_VERSION = "fertiliser_admissibility_gate_v1.0.0";

/** `rules_statutory/fertiliser_product_restrictions_2026.csv`, row
 * `UNINHIBITED_SOLID_UREA_EXCLUSION`: the ureic-N threshold above which
 * an uninhibited solid product is excluded. */
export const UNINHIBITED_UREA_EXCLUSION_UREIC_N_THRESHOLD_PCT = 1;

export interface FertiliserFormulation {
  physicalForm: "solid" | "liquid" | "unknown";
  ureicNPercent?: number;
  inhibitorStatus: "inhibited" | "uninhibited" | "unknown";
}

/**
 * `UNINHIBITED_SOLID_UREA_EXCLUSION`'s own stated exception: liquid
 * products are excluded from the exclusion outright — only a SOLID
 * product with ureic N >=1% that is UNINHIBITED is prohibited. Every
 * "unknown" along that chain (form, ureic N%, inhibitor status) fails to
 * `UNKNOWN`, never assumed admissible — "Do not recommend unknown
 * product" (`calculation_contracts.csv`).
 */
export function checkFertiliserProductAdmissibility(
  formulationOutcome: EngineOutcome<FertiliserFormulation>,
): EngineOutcome<"ADMISSIBLE"> {
  if (formulationOutcome.status !== "OK") return formulationOutcome;
  const { physicalForm, ureicNPercent, inhibitorStatus } = formulationOutcome.value;

  if (physicalForm === "unknown") return unknown("FERTILISER_FORM_UNKNOWN");
  if (physicalForm === "liquid") return ok("ADMISSIBLE", "DERIVED");

  // Solid from here on.
  if (ureicNPercent === undefined) return unknown("FERTILISER_UREIC_N_UNKNOWN");
  if (ureicNPercent < UNINHIBITED_UREA_EXCLUSION_UREIC_N_THRESHOLD_PCT) return ok("ADMISSIBLE", "DERIVED");

  // Solid, ureic N >= 1%: inhibitor status is now decisive.
  if (inhibitorStatus === "unknown") return unknown("FERTILISER_INHIBITOR_STATUS_UNKNOWN");
  if (inhibitorStatus === "uninhibited") {
    return legalProhibition(
      "FERTILISER_UNINHIBITED_SOLID_UREA_EXCLUDED",
      `Solid product with ${ureicNPercent}% ureic N is uninhibited — excluded from the applicable maximum-rate route under current table footnotes (S.I. 588/2025; S.I. 119/2026).`,
    );
  }
  return ok("ADMISSIBLE", "DERIVED");
}
