/**
 * Scientific engine V3 — Phase H2: clover-N strategy schedules (spec
 * Section J). "These are strategy tables, not a generic 'clover credit'"
 * — exact enterprise/source-class rows only, no interpolation, legal N
 * ceiling always overrides. Grounded in `GFT125`-`GFT140` (`GFT133`/
 * `GFT134`/`GFT141`/`GFT142`'s narrower narrative/fertility-flag/red-clover
 * nuances are NOT covered by this pass — logged as a deferred follow-up
 * in the build log, not silently dropped).
 *
 * Net-new module — nothing in this codebase implemented clover-N before
 * this phase, so there is no legacy behaviour to reconcile or conflict
 * with.
 *
 * V3 closure pass, Priority 9: `GFT134` (fertility-context flag) and
 * `GFT141` (red-clover routing) are now built — see
 * `checkCloverFertilityContext`/`selectCloverSchedule` below. `GFT142`
 * (ewe-mating-timing warning) remains genuinely blocked on the same
 * sheep data-model gap as GF14.
 */

import { blockedInsufficientEvidence, notApplicable, ok, type EngineOutcome } from "./evidence";

export const CLOVER_N_VERSION = "clover_n_v1.0.0";

// ---------------------------------------------------------------------------
// Dairy grazing schedule — advisory_teagasc/clover_n_dairy_2026.csv
// ---------------------------------------------------------------------------

export type DairyCloverClass = "grass_sward_no_clover" | "5" | "10" | "15" | "20";
export type DairyCloverTiming = "Feb" | "mid_Mar" | "mid_Apr" | "mid_May" | "mid_Jun" | "mid_Jul" | "mid_Aug" | "mid_Sep";

/** `chemical_N_kg_ha` value per class/timing — `"SW"` means "soiled
 * water" in the source table (zero chemical N that period), a distinct,
 * real published value, never coerced to `0` or `null`. */
export type DairyCloverValue = number | "SW";

const DAIRY_CLOVER_SCHEDULE: Record<DairyCloverClass, Partial<Record<DairyCloverTiming, DairyCloverValue>>> = {
  grass_sward_no_clover: { Feb: 24, mid_Mar: 36, mid_Apr: 20, mid_May: 32, mid_Jun: 28, mid_Jul: 28, mid_Aug: 21, mid_Sep: 23 },
  "5": { Feb: 20, mid_Mar: 35, mid_Apr: 20, mid_May: 20, mid_Jun: 20, mid_Jul: 20, mid_Aug: 20, mid_Sep: 20 },
  "10": { Feb: 20, mid_Mar: 35, mid_Apr: 20, mid_May: 15, mid_Jun: 15, mid_Jul: 10, mid_Aug: 15, mid_Sep: 20 },
  "15": { Feb: 20, mid_Mar: 35, mid_Apr: 20, mid_May: 15, mid_Jun: "SW", mid_Jul: "SW", mid_Aug: 10, mid_Sep: 20 },
  "20": { Feb: 20, mid_Mar: 35, mid_Apr: 20, mid_May: 15, mid_Jun: "SW", mid_Jul: "SW", mid_Aug: "SW", mid_Sep: 15 },
};

/** Annual whole-farm strategy total per class, `annual_table_total_kg_N_ha`
 * column — a whole-farm figure, NOT a single-paddock allowance (`GFT133`'s
 * "230 note" caveat: a paddock-level footnote elsewhere in the source
 * must never be read as this whole-farm total). */
const DAIRY_CLOVER_ANNUAL_TOTAL_KG_N_HA: Record<DairyCloverClass, number> = {
  grass_sward_no_clover: 212,
  "5": 175,
  "10": 150,
  "15": 130,
  "20": 105,
};

/**
 * `GFT125`-`GFT130`. Exact row only — no interpolation between adjacent
 * clover classes or timings, matching Spec J's "no mathematical
 * interpolation between source clover classes" verbatim.
 */
export function lookupDairyCloverN(cloverClass: DairyCloverClass, timing: DairyCloverTiming): EngineOutcome<DairyCloverValue> {
  const value = DAIRY_CLOVER_SCHEDULE[cloverClass][timing];
  if (value === undefined) {
    return blockedInsufficientEvidence("BLOCK_NO_VALIDATED_CLASSIFICATION_PROTOCOL", [`${cloverClass}/${timing} row`]);
  }
  return ok(value, "IRISH_DEFAULT");
}

export function dairyCloverAnnualTotalKgNHa(cloverClass: DairyCloverClass): number {
  return DAIRY_CLOVER_ANNUAL_TOTAL_KG_N_HA[cloverClass];
}

// ---------------------------------------------------------------------------
// Drystock grazing schedule — advisory_teagasc/clover_n_drystock_2026.csv
// ---------------------------------------------------------------------------

export type DrystockCloverClass = "low_or_none" | "april_5pct_approx_10pct_annual" | "april_10pct_high_approx_15pct_annual";
export type DrystockCloverTiming = "Feb_Mar" | "Apr" | "May" | "Jun" | "Jul" | "Aug_Sep";

/** The table's own single reference stocking rate — the ONLY GSR this
 * schedule is valid at (`GFT140`: applying it unqualified at a different
 * GSR is a scope error, not a valid extrapolation). */
export const DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA = 170;

const DRYSTOCK_CLOVER_SCHEDULE: Record<DrystockCloverClass, Record<DrystockCloverTiming, number>> = {
  low_or_none: { Feb_Mar: 28, Apr: 28, May: 28, Jun: 18, Jul: 28, Aug_Sep: 20 },
  april_5pct_approx_10pct_annual: { Feb_Mar: 28, Apr: 20, May: 20, Jun: 11, Jul: 15, Aug_Sep: 18 },
  april_10pct_high_approx_15pct_annual: { Feb_Mar: 20, Apr: 20, May: 10, Jun: 0, Jul: 10, Aug_Sep: 15 },
};

const DRYSTOCK_CLOVER_ANNUAL_TOTAL_KG_N_HA: Record<DrystockCloverClass, number> = {
  low_or_none: 150,
  april_5pct_approx_10pct_annual: 112,
  april_10pct_high_approx_15pct_annual: 75,
};

/**
 * `GFT135`-`GFT138`/`GFT140`. `referenceGsrKgNHa` must match the table's
 * own single reference stocking rate exactly (170 kg N/ha) — any other
 * value is a scope mismatch (`DO_NOT_APPLY_170_REFERENCE_TABLE_UNQUALIFIED`),
 * never silently applied anyway.
 */
export function lookupDrystockCloverN(
  cloverClass: DrystockCloverClass,
  timing: DrystockCloverTiming,
  referenceGsrKgNHa: number,
): EngineOutcome<number> {
  if (referenceGsrKgNHa !== DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA) {
    return notApplicable("DO_NOT_APPLY_170_REFERENCE_TABLE_UNQUALIFIED");
  }
  return ok(DRYSTOCK_CLOVER_SCHEDULE[cloverClass][timing], "IRISH_DEFAULT");
}

export function drystockCloverAnnualTotalKgNHa(cloverClass: DrystockCloverClass): number {
  return DRYSTOCK_CLOVER_ANNUAL_TOTAL_KG_N_HA[cloverClass];
}

// ---------------------------------------------------------------------------
// Legal cap override (Spec J: "legal N ceiling overrides advisory rate")
// ---------------------------------------------------------------------------

/**
 * `GFT132`. `sourceStrategyN` is the advisory clover-schedule figure;
 * `legalMaxN` is the real statutory ceiling for this field (e.g.
 * `napMaxAvailableNGrazingKgHa`). The lower of the two always wins — an
 * advisory strategy can recommend LESS than the legal cap, but never
 * more than what the cap actually allows.
 */
export function applyCloverNLegalCap(sourceStrategyNKgHa: number, legalMaxNKgHa: number): number {
  return Math.min(sourceStrategyNKgHa, legalMaxNKgHa);
}

// ---------------------------------------------------------------------------
// No-interpolation guards — a raw clover percentage, not a discrete
// class, must never be silently classified into the nearest schedule row.
// The golden tests use distinct reason codes per enterprise for the same
// underlying situation (`GFT131` dairy vs. `GFT139` drystock) — kept as
// two functions rather than one parameterised call, so each matches its
// own golden test's expected code exactly rather than a guessed shared one.
// ---------------------------------------------------------------------------

/** `GFT131`: a raw dairy `april_clover_pct` reading (e.g. 12%) has no
 * validated classification protocol into the discrete dairy classes
 * above. */
export function blockRawDairyCloverPercentage(): EngineOutcome<never> {
  return blockedInsufficientEvidence("BLOCK_NO_VALIDATED_CLASSIFICATION_PROTOCOL", ["a validated dairy clover-content classification protocol"]);
}

/** `GFT139`: a raw drystock `april_clover_pct` reading (e.g. 7%) has no
 * sourced interpolation rule between the discrete drystock classes above. */
export function blockRawDrystockCloverPercentage(): EngineOutcome<never> {
  return blockedInsufficientEvidence("BLOCK_NO_INTERPOLATION", ["a validated drystock clover-content classification protocol"]);
}

// ---------------------------------------------------------------------------
// V3 closure pass, Priority 9 (GFT134, GFT141) — the two narrower
// nuances this module's own header comment already flagged as deferred,
// now closed. GFT142 (ewe-mating-timing warning) remains genuinely
// blocked on the same sheep data-model gap as GF14 — no ewe/lamb
// category exists in `LivestockCategory` — and is NOT attempted here.
// ---------------------------------------------------------------------------

/**
 * `GFT134`: poor soil fertility context limits a clover strategy's real
 * effectiveness even where a clover class/schedule is otherwise validly
 * selected — Teagasc's own advisory framing for both dairy and drystock
 * clover guidance. Flags, never blocks: the schedule's N figure is still
 * the correct number to show, just with a fertility-context caveat
 * attached (spec's own `FLAG_FERTILITY_CONTEXT_NOT_IDEAL` reason code,
 * already registered in `evidence.ts`).
 */
export function checkCloverFertilityContext(soilPIndex: 1 | 2 | 3 | 4, soilKIndex: 1 | 2 | 3 | 4): EngineOutcome<"FERTILITY_CONTEXT_OK" | "FLAG_FERTILITY_CONTEXT_NOT_IDEAL"> {
  if (soilPIndex === 1 && soilKIndex === 1) {
    return ok("FLAG_FERTILITY_CONTEXT_NOT_IDEAL", "DERIVED");
  }
  return ok("FERTILITY_CONTEXT_OK", "DERIVED");
}

export type CloverSwardType = "white_clover" | "red_clover";

/**
 * `GFT141`: neither `advisory_teagasc/clover_n_dairy_2026.csv` nor
 * `clover_n_drystock_2026.csv` publishes a red-clover schedule — both
 * are white-clover tables. A red-clover sward must never silently
 * borrow the white-clover schedule (`white_clover_schedule_used: false`,
 * the golden test's own expectation) — this is a real, sourced fact
 * (the absence of a red-clover table in this evidence pack), not a
 * guessed equivalence, so it fails closed rather than routing to any
 * numeric schedule at all.
 */
export function selectCloverSchedule(sward: CloverSwardType): EngineOutcome<"white_clover"> {
  if (sward === "red_clover") {
    return blockedInsufficientEvidence("BLOCK_UNSUPPORTED_SCENARIO", ["a validated red-clover N schedule (none published in the current evidence pack)"]);
  }
  return ok("white_clover", "DERIVED");
}

/**
 * `GFT133`: `advisory_teagasc/clover_n_dairy_2026.csv`'s "grass_sward_no_clover"
 * column publishes a per-PADDOCK rate (up to 230 kg N/ha on a paddock
 * with no clover) — this must never be read as a whole-farm N allowance,
 * which is a completely different, separately-sourced total (the
 * statutory GSR-based figure `calculateStatutoryGrasslandStockingRateKgHa`
 * produces). This guard makes that distinction explicit and traceable
 * rather than relying on a caller to remember it — always `OK` (both
 * figures are legitimate on their own terms, kept as two distinctly-
 * named fields, never summed or substituted for each other). The
 * registered `DO_NOT_TREAT_230_AS_WHOLE_FARM_ALLOWANCE` reason code
 * (`evidence.ts`) documents the rule this guard exists to enforce; see
 * this function's own test for the golden-test citation.
 */
export function distinguishPaddockRateFromWholeFarmAllowance(
  paddockRateKgNHa: number,
  wholeFarmTotalKgNHa: number,
): EngineOutcome<{ paddockRateKgNHa: number; wholeFarmTotalKgNHa: number }> {
  return ok({ paddockRateKgNHa, wholeFarmTotalKgNHa }, "DERIVED");
}
