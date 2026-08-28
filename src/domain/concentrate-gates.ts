/**
 * Scientific engine V3 — Phase F4: `FEED_CP_LEGAL_GATE` and
 * `CONCENTRATE_P_COMPLIANCE`.
 *
 * `ADVERSARIAL_AUDIT_REPORT.md` §1.4-§1.5 (AF007/AF006, HIGH): "Concentrate
 * feed can contribute statutory available phosphorus above the defined
 * threshold... Feed optimisation therefore cannot be a stand-alone
 * livestock module; it must feed the farm P compliance ledger" and "The
 * current seasonal crude-protein limit for relevant cattle at grass must
 * be checked before a feed option can be described as compliant."
 * Grounded exactly in `GFT026`/`GFT027`/`GFT143`-`GFT150`.
 */

import { legalProhibition, notApplicable, ok, blockedInsufficientEvidence, type EngineOutcome } from "./evidence";

export const CONCENTRATE_GATES_VERSION = "concentrate_gates_v1.0.0";

// ---------------------------------------------------------------------------
// FEED_CP_LEGAL_GATE — rules_statutory/concentrate_feed_compliance_2026.csv,
// row CONC_CP_GRASS_SEASON.
// ---------------------------------------------------------------------------

/** 15 Apr - 30 Sep (mm-dd, statutory calendar window, non-year-wrapping). */
export const CONCENTRATE_CP_SEASON_START_MM_DD = "04-15";
export const CONCENTRATE_CP_SEASON_END_MM_DD = "09-30";
/** Maximum crude protein in concentrate feed for the animals/period this
 * rule covers. */
export const CONCENTRATE_CP_MAX_PCT = 14;

export type CpGatedAnimal = "dairy_cow" | "cattle_2plus";

export interface FeedCpLegalGateInput {
  animal: string;
  atGrass: boolean;
  concentrateCpPct: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
}

function isWithinCpSeason(isoDate: string): boolean {
  const mmDd = isoDate.slice(5, 10);
  return mmDd >= CONCENTRATE_CP_SEASON_START_MM_DD && mmDd <= CONCENTRATE_CP_SEASON_END_MM_DD;
}

const CP_GATED_ANIMALS: readonly string[] = ["dairy_cow", "cattle_2plus"];

/**
 * `GFT026`/`GFT027`/`GFT143`-`GFT145`. Only dairy cows and cattle aged 2
 * years and over at grass, 15 Apr-30 Sep, are covered — every other
 * animal/grazing-status/date combination is `NOT_APPLICABLE`, with two
 * distinct reason codes matching the golden tests' own vocabulary: wrong
 * animal class (`NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE`, `GFT145`) vs.
 * outside the seasonal window (`NOT_APPLICABLE_TO_SEASONAL_RULE`,
 * `GFT027`).
 */
export function checkFeedCpLegalGate(input: FeedCpLegalGateInput): EngineOutcome<"COMPLIANT"> {
  if (!CP_GATED_ANIMALS.includes(input.animal)) {
    return notApplicable("NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE");
  }
  if (!input.atGrass || !isWithinCpSeason(input.date)) {
    return notApplicable("NOT_APPLICABLE_TO_SEASONAL_RULE");
  }
  if (input.concentrateCpPct > CONCENTRATE_CP_MAX_PCT) {
    return legalProhibition(
      "CONCENTRATE_CP_SEASONAL_CAP_EXCEEDED",
      `Concentrate crude protein ${input.concentrateCpPct}% exceeds the statutory ${CONCENTRATE_CP_MAX_PCT}% seasonal maximum for ${input.animal} at grass (15 Apr-30 Sep).`,
    );
  }
  return ok("COMPLIANT", "DERIVED");
}

// ---------------------------------------------------------------------------
// CONCENTRATE_P_COMPLIANCE — rules_statutory/concentrate_feed_compliance_2026.csv,
// rows CONC_P_THRESHOLD / CONC_P_DEFAULT_CONTENT.
// ---------------------------------------------------------------------------

/** The golden tests' own worked ratio: 300 kg concentrate is P-threshold-free
 * per 92 kg livestock-manure N produced; the threshold scales linearly
 * with manure N (`GFT146`-`GFT148`: 92 kgN -> 300kg threshold, 184 kgN ->
 * 600kg threshold — exactly double). */
export const CONCENTRATE_P_THRESHOLD_KG_PER_92KG_MANURE_N = 300;
export const CONCENTRATE_P_THRESHOLD_MANURE_N_REFERENCE_KG = 92;

export interface ConcentrateNPComplianceInput {
  /** Previous-year livestock-manure N, kg — `null`/`undefined` blocks
   * (`GFT150`), never assumed to be zero (that would understate the
   * threshold and could either over- or under-count available P). */
  livestockManureNKg: number | null | undefined;
  concentrateKg: number;
  /** kg P per 100kg concentrate — known/supplier content always
   * outranks the statutory default (`GFT149`); pass the result of
   * `input-gates.ts`'s `resolveConcentratePContentKgPer100kg` here. */
  pContentKgPer100kg: number;
}

export interface ConcentrateNPComplianceOk {
  thresholdConcentrateKg: number;
  excessConcentrateKg: number;
  availablePKg: number;
}

/**
 * `GFT146`-`GFT150`. Available P is counted only on concentrate ABOVE the
 * scaled threshold — this is a compliance-ledger contribution to a farm's
 * remaining statutory P allowance, not an agronomic feed-value figure;
 * never mixed with `nutrients.ts`'s agronomic P ledger.
 */
export function checkConcentratePCompliance(input: ConcentrateNPComplianceInput): EngineOutcome<ConcentrateNPComplianceOk> {
  if (input.livestockManureNKg === null || input.livestockManureNKg === undefined) {
    return blockedInsufficientEvidence("BLOCK_MISSING_MANURE_N", ["livestockManureNKg"]);
  }

  const thresholdConcentrateKg =
    (CONCENTRATE_P_THRESHOLD_KG_PER_92KG_MANURE_N * input.livestockManureNKg) / CONCENTRATE_P_THRESHOLD_MANURE_N_REFERENCE_KG;
  const excessConcentrateKg = Math.max(0, input.concentrateKg - thresholdConcentrateKg);
  const availablePKg = excessConcentrateKg * (input.pContentKgPer100kg / 100);

  return ok({ thresholdConcentrateKg, excessConcentrateKg, availablePKg }, "DERIVED");
}
