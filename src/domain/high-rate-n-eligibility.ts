/**
 * Scientific engine V3 — Phase K: a NEWLY-DISCOVERED gap, found while
 * reconciling `nutrients.ts` against `validation/golden_farm_tests.csv`
 * (`GFT023`/`GFT024`), not previously flagged in
 * `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` as its own numbered
 * conflict.
 *
 * `napMaxAvailableNGrazingKgHa` (`nutrients.ts`) looks up
 * `rules_statutory/grassland_available_n_max_2026.csv`'s bands
 * unconditionally — for a GSR of 171-210 kg N/ha it always returns 241,
 * and for >210 it always returns 214. `ADVERSARIAL_AUDIT_REPORT.md` §1's
 * AF011 (HIGH) names exactly this failure mode: "GSR>170 alone does not
 * entitle holding to higher N/P rates... Over-application... High-rate
 * eligibility gate."
 *
 * `GFT023`/`GFT024` are the only source-of-truth evidence this pack
 * supplies for the ELIGIBILITY CRITERION itself (no `rules_statutory`
 * CSV states a numeric non-grass-area threshold in the extract this
 * session has) — `GFT023` (GSR 184, `non_grass_pct: 0` -> ceiling 185,
 * the ORDINARY 131-170 band's own rate, not 241) and `GFT024` (same GSR,
 * `non_grass_pct: 5` -> ceiling 241, the elevated rate). Per this pack's
 * own required reading list, `validation/golden_farm_tests.csv` is
 * authoritative V3 evidence, and these two tests together are read here
 * as specifying: the elevated 171-210/>210 rates require >=5% non-grass
 * eligible area; absent that, the holding falls back to the highest rate
 * available WITHOUT elevated eligibility (185 kg/ha — there is no
 * separate "standard" row published for the 171-210/>210 bands the way
 * the P table publishes a "standard" vs "increased_build_up_CONDITIONAL"
 * pair, so the next-lower band's rate is the defensible fallback, not an
 * invented number).
 *
 * Spec Section E3 is explicit that `derogation` status must NOT be
 * treated as a simple eligibility toggle ("Do not create a simple
 * 'derogation = on' toggle... the engine remains fail-closed to the
 * ordinary ceiling" until a full derogation module is verified) — so
 * this gate deliberately does not accept a `derogation` flag as an
 * alternative path to eligibility at all, only the non-grass-area
 * criterion `GFT023`/`GFT024` evidence.
 *
 * Built as a new, standalone, tested module this phase — NOT yet wired
 * into `checkNapCompliance`/`calculateNutrientPlan` (that would need a
 * new `nonGrassPct` input threaded through `CalculateNutrientPlanInput`,
 * the same kind of change Phase E3 made for `saleEvidence`) — logged as
 * a real follow-up integration task, not silently left unbuilt.
 */

import { napMaxAvailableNGrazingKgHa } from "./nutrients";

export const HIGH_RATE_N_ELIGIBILITY_VERSION = "high_rate_n_eligibility_v1.0.0";

/** `GFT024`'s own evidence: 5% non-grass eligible area is the threshold
 * that unlocks the elevated 171-210/>210 kg N/ha rates. */
export const HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT = 5;

/** The GSR band above which elevated-rate eligibility even becomes
 * relevant — below this, `napMaxAvailableNGrazingKgHa`'s own bands
 * already give the correct ceiling with no eligibility question. */
const ELEVATED_RATE_GSR_THRESHOLD_KG_HA = 170;

/**
 * `GFT023`/`GFT024`. Never grants the elevated rate from GSR alone —
 * `nonGrassPct` must be explicitly ≥5% (evidence the caller must supply;
 * this function does not default it to 0 or assume ineligibility means
 * "definitely wrong", only "not entitled to the elevated rate").
 */
export function isEligibleForElevatedNRate(orgNStockingRateKgHa: number, nonGrassPct: number): boolean {
  if (orgNStockingRateKgHa <= ELEVATED_RATE_GSR_THRESHOLD_KG_HA) return true;
  return nonGrassPct >= HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT;
}

/**
 * The real, eligibility-gated ceiling — falls back to the 131-170 band's
 * own rate (185 kg/ha) for any GSR >170 that hasn't proven ≥5% non-grass
 * eligible area, rather than silently returning the table's raw 241/214
 * figures (which `napMaxAvailableNGrazingKgHa` alone still does, by
 * design — see that function's own unchanged behaviour, since this is an
 * ADDITIVE new function, not a modification of it).
 */
export function napMaxAvailableNGrazingKgHaEligibilityGated(orgNStockingRateKgHa: number, nonGrassPct: number): number {
  if (isEligibleForElevatedNRate(orgNStockingRateKgHa, nonGrassPct)) {
    return napMaxAvailableNGrazingKgHa(orgNStockingRateKgHa);
  }
  return napMaxAvailableNGrazingKgHa(ELEVATED_RATE_GSR_THRESHOLD_KG_HA);
}
