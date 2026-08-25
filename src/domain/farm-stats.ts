/**
 * Whole-farm summary counts — simple, not scientific/financial (no
 * versioned formula or evidence citation needed), but still a thin pure
 * wrapper rather than inline arithmetic in a component, same rationale
 * `calculateLivestockPortfolioValueEur` (finance.ts) already gives for its
 * "even though the sum itself is simple" case: Soil coverage and the
 * Dashboard share one definition rather than two components each counting
 * `fields` their own way.
 */

import type { Field } from "./types";

export interface FarmCoverageStats {
  /** Fields with a real drawn boundary (`Field.polygon` set via the Mapbox
   * field-boundary feature) — "mapped" means traced on real imagery, not
   * just "exists in the farm model". A field can be added (Phase 2) before
   * it's ever mapped. */
  totalFieldsMapped: number;
  /** Fields with a real lab-verified soil test (`SoilFertility.verifiedTest`,
   * set by `addSoilTest`) — distinct from a farmer-typed/estimated P/K
   * index, which every field starts with. */
  totalVerifiedTests: number;
}

export function calculateFarmCoverageStats(fields: Field[]): FarmCoverageStats {
  return {
    totalFieldsMapped: fields.filter((f) => f.polygon !== undefined).length,
    totalVerifiedTests: fields.filter((f) => f.fertility.verifiedTest !== undefined).length,
  };
}
