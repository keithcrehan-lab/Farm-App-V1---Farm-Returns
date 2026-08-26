/**
 * Scientific engine V3 — second closure pass, Priority 7:
 * `SELL_HOLD_ECONOMICS` (GF18, `GFT151`-`GFT158`).
 *
 * `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` §2.8 / audit conflict #9:
 * `calculateSellNowVsFinish`/`calculateLivestockEconomics` (`livestock.ts`)
 * compute a real number from real inputs, but never gate on missing
 * evidence, never flag a stale liveweight, and never protect a farmer's
 * own target-sale date from being silently overridden by a model-
 * preferred date — exactly what `GFT151`-`GFT157` require.
 *
 * This is a NEW, ADDITIVE evidence-gating layer — it does not modify
 * `calculateSellNowVsFinish`/`calculateLivestockEconomics` (both remain
 * exactly as they are, still called by every existing live screen
 * unchanged) and is not yet wired into them. `SCIENTIFIC_ENGINE_V3_
 * EXISTING_CODE_AUDIT.md` and the coverage matrix both flag the FULL fix
 * as needing "both calculation additions (housing/carrying cost) and a
 * UI-reframing (scenario comparison, not directive)... a dedicated phase
 * combining both" — not attempted here. Two genuinely different things
 * are true at once: the EVIDENCE-GATING logic below is real, tested, and
 * needs no new sourced constant (`BLOCK`/`FLAG_STALE_INPUT`/
 * `COMPARE_SCENARIOS_DO_NOT_REWRITE_INTENT` are pure logic over evidence
 * already captured or already absent); housing/carrying cost NUMBERS
 * remain genuinely EVIDENCE_BLOCKED — no sourced per-head housing/
 * carrying-cost rate exists anywhere in the V3 pack or this app's data
 * model, and none is invented here. The input contract retains explicit,
 * optional slots for both so a caller with real evidence can supply it.
 */

import { blockedInsufficientEvidence, notApplicable, ok, type EngineOutcome } from "./evidence";

export const SELL_HOLD_ECONOMICS_GATE_VERSION = "sell_hold_economics_gate_v1.0.0";

/**
 * `GFT156`'s own worked example (weigh_date 2025-12-01, current_date
 * 2026-08-26 -> ~268 days -> `FLAG_STALE_INPUT`) is the only evidence
 * this pack publishes for staleness, and it does not state an exact
 * day-count threshold. This golden-test group's own `source_id` column
 * cites `ENGINE_AUDIT_RULE` (alongside `CSO_AG_PRICES`) — the pack's own
 * vocabulary for "this is the engine's own reasonable operating policy,
 * not a scientific/statutory constant" (`source-register.ts`). 60 days
 * is that policy: livestock market values move materially within a
 * season, so a sell/hold financial comparison built on a weight over two
 * months old is treated as stale evidence, not current. This threshold
 * is deliberately NOT sourced to a Teagasc/statutory citation — doing so
 * would overstate what the evidence actually says — and is documented
 * here specifically so a future session can revise it with better
 * evidence rather than silently inherit an unexplained number.
 */
export const LIVEWEIGHT_STALENESS_THRESHOLD_DAYS = 60;

export interface SellHoldEconomicsEvidence {
  /** `undefined` -> `GFT152`/`GFT155`: no current weight, block outright
   * (never infer a sell recommendation from a price signal alone). */
  currentWeightKg: number | undefined;
  /** ISO date the current weight was actually recorded — `undefined`
   * means staleness cannot be assessed at all, which is itself treated
   * as stale (never assumed fresh). */
  weighDate: string | undefined;
  /** ISO date this evaluation runs as of — explicit, never read
   * internally via `Date.now()` (same convention as
   * `nutrients.ts`'s `asOfDate`). */
  asOfDate: string;
  /** `undefined` -> `GFT153`: no sale route, block. */
  saleRoute: string | undefined;
  /** Whether a validated performance/ADG model resolved for this animal
   * (e.g. `concentrateKgPerDay`'s own exact-DMD-lookup success) —
   * `false` -> `GFT154`: no performance model, block. */
  performanceModelValidated: boolean;
  /** The FARMER's own chosen target-sale date — never silently
   * overwritten by a model-preferred date (`GFT157`). `undefined` when
   * no explicit intent has been captured yet. */
  farmerTargetSaleDate: string | undefined;
  /** A model/market-preferred alternative date, if any — surfaced
   * alongside the farmer's own date as a labelled ALTERNATIVE, never a
   * replacement. */
  modelPreferredSaleDate?: string;
}

export interface SellHoldEconomicsGateResult {
  /** `true` when the current weight's `weighDate` is more than
   * `LIVEWEIGHT_STALENESS_THRESHOLD_DAYS` old as of `asOfDate` (or
   * missing entirely) — `GFT156`. The scenario is still allowed; this is
   * a flag on the evidence quality, not a block. */
  staleLiveweight: boolean;
  /** `GFT157`: the farmer's own intent, verbatim — always present when
   * captured, never replaced by `alternativeSaleDate`. */
  farmerTargetSaleDate: string | undefined;
  /** A model-preferred date, if one was supplied — an ALTERNATIVE
   * scenario to compare against, never used in place of
   * `farmerTargetSaleDate` above. */
  alternativeSaleDate: string | undefined;
}

function daysBetweenIsoDates(fromIso: string, toIso: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / msPerDay;
}

/**
 * `GFT151`-`GFT157`. `OK` means `SCENARIO_COMPARISON_ALLOWED` — this
 * gate never produces an autonomous "sell now" or "hold" instruction
 * itself (spec's own "NEVER infer 'sell now' from market price alone" —
 * `calculation_contracts.csv` row 7's `never_do` clause), only whether
 * enough evidence exists to show a scenario comparison at all, and what
 * quality flags that comparison should carry.
 */
export function evaluateSellHoldEconomicsGate(evidence: SellHoldEconomicsEvidence): EngineOutcome<SellHoldEconomicsGateResult> {
  if (evidence.currentWeightKg === undefined) {
    // GFT152/GFT155: no current weight — whether or not a price signal
    // exists, this is never enough evidence for even a scenario
    // comparison, let alone an autonomous recommendation.
    return blockedInsufficientEvidence("NO_AUTONOMOUS_SELL_RECOMMENDATION", ["currentWeightKg"]);
  }
  if (evidence.saleRoute === undefined) {
    return blockedInsufficientEvidence("BLOCK_MISSING_SALE_ROUTE", ["saleRoute"]);
  }
  if (!evidence.performanceModelValidated) {
    return blockedInsufficientEvidence("BLOCK_MISSING_PERFORMANCE_MODEL", ["performanceModelValidated"]);
  }

  const staleLiveweight =
    evidence.weighDate === undefined || daysBetweenIsoDates(evidence.weighDate, evidence.asOfDate) > LIVEWEIGHT_STALENESS_THRESHOLD_DAYS;

  return ok(
    {
      staleLiveweight,
      farmerTargetSaleDate: evidence.farmerTargetSaleDate,
      alternativeSaleDate: evidence.modelPreferredSaleDate,
    },
    "DERIVED",
  );
}

/**
 * A bare market-price signal with no real animal data at all —
 * `GFT155`'s own scenario (`animal_data: null, price_signal: "high"`).
 * Distinct from `evaluateSellHoldEconomicsGate` above (which needs a
 * `currentWeightKg` to even ask the question): this is the narrower
 * "should a price alert alone ever suggest selling" case, and always
 * answers no, unconditionally — matching the contract's own
 * `NO_AUTONOMOUS_SELL_RECOMMENDATION` never_do clause.
 */
export function priceSignalAloneNeverRecommendsSelling(): EngineOutcome<never> {
  return notApplicable("NO_AUTONOMOUS_SELL_RECOMMENDATION");
}
