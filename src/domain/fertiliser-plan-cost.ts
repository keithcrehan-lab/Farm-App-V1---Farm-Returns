/**
 * Economic Opportunity Engine, Phase 4 — Auditable Fertiliser Costing
 * Engine V1.
 *
 * Answers exactly one question: "what is the indicative cost of THIS
 * existing Farm Return fertiliser plan, using THIS specific audited
 * price evidence?" It does NOT answer what the cheapest programme would
 * be, what a farmer would save, what slurry is worth, or which
 * opportunity Today should rank first — none of that is built here.
 *
 * Pure domain, no Supabase/network IO (mirrors `market-price-resolution.ts`'s
 * own separation): a caller resolves one `AuditableMarketPriceResolution`
 * per product (Phase 3's `resolveMarketReferencePrice`/
 * `loadMarketReferencePrice`) and hands the result in here — this module
 * never calls the resolver itself, so database IO and cost-calculation
 * methodology stay separately testable.
 *
 * Reuses, never duplicates: `MoneyAmount`/`multiplyMoney`/`addMoney`/
 * `zeroMoney` (Phase 1, `./money`), `EngineOutcome<T>`/`EvidenceState`/
 * `EVIDENCE_STATE_PRIORITY` (`./evidence`), `AuditableMarketPriceResolution`
 * (Phase 3, `./market-price-resolution`), and `exactKgToTonnes`/
 * `exactQuantityFromRoundedNumber` (`./units`, extended minimally this
 * phase — see that file's own header).
 *
 * Quantity precision boundary (brief §5 — the phase's own gating
 * requirement, mirroring Phase 1's identical rule for money): the
 * canonical recommended quantity this module consumes is
 * `FertiliserProduct.totalKg` (`types.ts`), which `nutrients.ts`'s
 * `productLine` already publishes pre-rounded to exactly 1 decimal place
 * (`Math.round(totalKg * 10) / 10`, `nutrients.ts:1537`) — a real,
 * defined, deterministic boundary, not an arbitrary unrounded
 * floating-point result. `exactQuantityFromRoundedNumber` (`./units`)
 * documents and enforces that exact boundary: it promotes the already-
 * rounded number into an exact canonical decimal string and REJECTS
 * anything needing more than 1 decimal place to represent exactly — the
 * shape an unexpected, un-rounded value would take. This module never
 * calls `Number()`/`parseFloat()`/native `*`/`/` on a monetary or
 * quantity value; every arithmetic step is exact-decimal via `money.ts`/
 * `units.ts`.
 *
 * Legacy `nutrients.ts` `PRODUCTS.costEur`/`pricePerTonneEur` (market.ts's
 * embedded CSO snapshot) is NOT read anywhere in this module — the new
 * auditable answer costs the canonical recommended PRODUCT + QUANTITY
 * only, against Phase 3's independently-audited price evidence. The
 * legacy field is untouched and keeps working exactly as before for its
 * existing production consumers (Purchased Fertiliser, Dashboard,
 * Finance, Input Planner).
 *
 * No counterfactual, no savings, no avoided-purchase effect: this is a
 * standalone cost assessment, not an `EconomicOpportunityAssessment`
 * (Phase 1) — there is nothing to compare yet. Phase 5 will build the
 * counterfactual (with vs. without an intervention) on top of this
 * phase's cost primitive; this phase computes gross plan cost only.
 */

import Decimal from "decimal.js";
import { addMoney, multiplyMoney, zeroMoney, type MoneyAmount } from "./money";
import { exactKgToTonnes, exactQuantityFromRoundedNumber } from "./units";
import type { AuditableMarketPriceResolution } from "./market-price-resolution";
import {
  ambiguous,
  blockedInsufficientEvidence,
  legalProhibition,
  notApplicable,
  ok,
  unknown,
  EVIDENCE_STATE_PRIORITY,
  type EngineOutcome,
  type EvidenceState,
} from "./evidence";

export const FERTILISER_PLAN_COST_ENGINE_VERSION = "fertiliser_plan_cost_engine_v1.0.0";

/** `nutrients.ts:1537`'s own documented rounding boundary — see this
 * file's header. */
const FERTILISER_TOTAL_KG_MAX_DECIMAL_PLACES = 1;

/** Every Phase 4 output carries this — brief §6's own required wording,
 * verbatim. Never describe a result as minimum/optimised/cheapest/best
 * buying strategy. */
export const FERTILISER_PLAN_COST_METHODOLOGY_LIMITATION =
  "This is the cost of Farm Return's current deterministic fertiliser plan. It does not claim to be the globally least-cost fertiliser programme.";

/** V1 only reconciles a per-tonne price against a kg product quantity —
 * see `evidence.ts`'s `ECONOMIC_FERTILISER_COST_UNSUPPORTED_PRICE_BASIS`. */
const SUPPORTED_PRICE_BASIS = "per_tonne";

// ---------------------------------------------------------------------------
// Line — one canonical FertiliserProduct occurrence (one product,
// recommended for one field's plan, or already exact-summed to farm
// level by the caller — see `sumExactFertiliserQuantitiesKg` below),
// costed against one already-resolved market-reference price.
// ---------------------------------------------------------------------------

/** One canonical recommended-quantity occurrence to cost — mirrors
 * `types.ts`'s `FertiliserProduct` (`name`/`npkAnalysis`/`totalKg`).
 * `fieldId` is optional so the same shape covers a single field's own
 * line (`totalKg`, a plain number — already rounded to 1 decimal place
 * by `nutrients.ts`'s `productLine`, promoted via
 * `exactQuantityFromRoundedNumber`, see this file's header) or an
 * already-exact-summed farm-level total (`exactTotalKg`, a pre-computed
 * decimal string from `sumExactFertiliserQuantitiesKg` below — never
 * re-validated against the single-field rounding boundary, since a
 * multi-field exact sum can legitimately need more than 1 decimal
 * place). */
export type FertiliserPlanCostLineInput =
  | { fieldId?: string; product: string; npkAnalysis: string; totalKg: number }
  | { fieldId?: string; product: string; npkAnalysis: string; exactTotalKg: string };

function resolveLineQuantityKg(input: FertiliserPlanCostLineInput): string {
  return "exactTotalKg" in input
    ? input.exactTotalKg
    : exactQuantityFromRoundedNumber(input.totalKg, FERTILISER_TOTAL_KG_MAX_DECIMAL_PLACES, `${input.product} totalKg`);
}

/** A compact, structured, independently-reproducible record of exactly
 * how this line's cost was computed (brief §16) — not human prose. Every
 * field is populated even when the line is blocked (quantity fields are
 * always real; price/cost fields are `null` only when no price could be
 * used). */
export interface FertiliserPlanCostLineTrace {
  product: string;
  fieldId?: string;
  recommendedQuantityKg: string;
  convertedQuantityTonnes: string;
  priceAmount: string | null;
  priceCurrency: string | null;
  /** e.g. `"0.5 × 645"` — the exact multiplicands, not a rounded display
   * approximation. */
  calculationExpression: string | null;
  lineCostAmount: string | null;
  observationDatabaseId: string | null;
  observationIdentity: string | null;
  referencePeriod: string | null;
  mappingKind: string | null;
  priceBasis: string | null;
  vatTreatment: string | null;
  priceResolutionStatus: string;
}

export interface FertiliserPlanCostLine {
  fieldId?: string;
  product: string;
  npkAnalysis: string;
  /** Exact canonical decimal kg string — see this file's header on the
   * quantity precision boundary. */
  quantity: string;
  quantityUnit: "kg";
  /** The full Phase 3 audited price result this line was costed
   * against, provenance never stripped (brief §7/§8). */
  priceResolution: EngineOutcome<AuditableMarketPriceResolution>;
  /** The line's own cost — a real, quantified `MoneyAmount` only when
   * every input (quantity, price, supported basis) was available; never
   * a fabricated €0 for a missing/unsupported price (brief §11). */
  lineCost: EngineOutcome<MoneyAmount>;
  calculationTrace: FertiliserPlanCostLineTrace;
  /** Methodology caveats specific to this line — e.g. the mandatory
   * CATEGORY_BENCHMARK proxy disclosure, carried through from
   * `priceResolution.value.limitations` unchanged. */
  limitations: string[];
}

function describeNonOkReason(outcome: Exclude<EngineOutcome<unknown>, { status: "OK" }>): string {
  switch (outcome.status) {
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return outcome.reasonCode;
    case "AMBIGUOUS":
      return `${outcome.reasonCode}: ${outcome.detail}`;
    case "NOT_APPLICABLE":
      return outcome.reasonCode;
    case "LEGAL_PROHIBITION":
      return `${outcome.reasonCode}: ${outcome.consequence}`;
    case "UNKNOWN":
      return outcome.reasonCode;
  }
}

/** Propagates a non-OK `EngineOutcome`'s exact status/reason across a
 * different value type — the non-OK branches of `EngineOutcome<T>` never
 * reference `T` at all, so this is a faithful re-statement of the same
 * failure, not a new one (e.g. a blocked price resolution produces an
 * identically-blocked line cost, same reasonCode, same missingInputs —
 * the true cause is the price gap, never a second, invented reason). */
function propagateNonOk<T>(outcome: Exclude<EngineOutcome<unknown>, { status: "OK" }>): EngineOutcome<T> {
  switch (outcome.status) {
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return blockedInsufficientEvidence(outcome.reasonCode, outcome.missingInputs);
    case "AMBIGUOUS":
      return ambiguous(outcome.reasonCode, outcome.detail);
    case "NOT_APPLICABLE":
      return notApplicable(outcome.reasonCode);
    case "LEGAL_PROHIBITION":
      return legalProhibition(outcome.reasonCode, outcome.consequence);
    case "UNKNOWN":
      return unknown(outcome.reasonCode);
  }
}

/**
 * Costs one canonical fertiliser-plan line against one already-resolved
 * market-reference price. Pure — no IO, no randomness, no wall-clock
 * dependence. `quantity`/`calculationTrace`'s quantity fields are always
 * populated (a real, reproducible fact about the plan); `lineCost` is a
 * genuine `MoneyAmount` only when the price was usable.
 */
export function costFertiliserProductLine(
  input: FertiliserPlanCostLineInput,
  priceResolution: EngineOutcome<AuditableMarketPriceResolution>,
): FertiliserPlanCostLine {
  const quantityKg = resolveLineQuantityKg(input);
  const quantityTonnes = exactKgToTonnes(quantityKg);

  if (priceResolution.status !== "OK") {
    return {
      fieldId: input.fieldId,
      product: input.product,
      npkAnalysis: input.npkAnalysis,
      quantity: quantityKg,
      quantityUnit: "kg",
      priceResolution,
      lineCost: propagateNonOk<MoneyAmount>(priceResolution),
      calculationTrace: {
        product: input.product,
        fieldId: input.fieldId,
        recommendedQuantityKg: quantityKg,
        convertedQuantityTonnes: quantityTonnes,
        priceAmount: null,
        priceCurrency: null,
        calculationExpression: null,
        lineCostAmount: null,
        observationDatabaseId: null,
        observationIdentity: null,
        referencePeriod: null,
        mappingKind: null,
        priceBasis: null,
        vatTreatment: null,
        priceResolutionStatus: priceResolution.status,
      },
      limitations: [],
    };
  }

  const resolvedPrice = priceResolution.value;

  if (resolvedPrice.priceBasis !== SUPPORTED_PRICE_BASIS) {
    const blocked = blockedInsufficientEvidence<MoneyAmount>("ECONOMIC_FERTILISER_COST_UNSUPPORTED_PRICE_BASIS", [
      `priceBasis "${resolvedPrice.priceBasis}" is not supported for fertiliser plan costing in V1 (only "${SUPPORTED_PRICE_BASIS}")`,
    ]);
    return {
      fieldId: input.fieldId,
      product: input.product,
      npkAnalysis: input.npkAnalysis,
      quantity: quantityKg,
      quantityUnit: "kg",
      priceResolution,
      lineCost: blocked,
      calculationTrace: {
        product: input.product,
        fieldId: input.fieldId,
        recommendedQuantityKg: quantityKg,
        convertedQuantityTonnes: quantityTonnes,
        priceAmount: resolvedPrice.amount.amount,
        priceCurrency: resolvedPrice.amount.currency,
        calculationExpression: null,
        lineCostAmount: null,
        observationDatabaseId: resolvedPrice.observationDatabaseId,
        observationIdentity: resolvedPrice.observationIdentity,
        referencePeriod: resolvedPrice.referencePeriod,
        mappingKind: resolvedPrice.mappingKind,
        priceBasis: resolvedPrice.priceBasis,
        vatTreatment: resolvedPrice.vatTreatment,
        priceResolutionStatus: "OK",
      },
      limitations: [...resolvedPrice.limitations],
    };
  }

  const lineCostAmount = multiplyMoney(resolvedPrice.amount, quantityTonnes);

  return {
    fieldId: input.fieldId,
    product: input.product,
    npkAnalysis: input.npkAnalysis,
    quantity: quantityKg,
    quantityUnit: "kg",
    priceResolution,
    lineCost: ok(lineCostAmount, priceResolution.evidenceState),
    calculationTrace: {
      product: input.product,
      fieldId: input.fieldId,
      recommendedQuantityKg: quantityKg,
      convertedQuantityTonnes: quantityTonnes,
      priceAmount: resolvedPrice.amount.amount,
      priceCurrency: resolvedPrice.amount.currency,
      calculationExpression: `${quantityTonnes} × ${resolvedPrice.amount.amount}`,
      lineCostAmount: lineCostAmount.amount,
      observationDatabaseId: resolvedPrice.observationDatabaseId,
      observationIdentity: resolvedPrice.observationIdentity,
      referencePeriod: resolvedPrice.referencePeriod,
      mappingKind: resolvedPrice.mappingKind,
      priceBasis: resolvedPrice.priceBasis,
      vatTreatment: resolvedPrice.vatTreatment,
      priceResolutionStatus: "OK",
    },
    limitations: [...resolvedPrice.limitations],
  };
}

// ---------------------------------------------------------------------------
// Assessment — combines already-costed lines into one plan cost result.
// One `aggregateOutcome`, never a numeric partial total silently
// presented as complete (brief §11).
// ---------------------------------------------------------------------------

export interface FertiliserPlanCostAssessment {
  /** Deterministic, caller-supplied — never randomly generated. */
  id: string;
  engineVersion: string;
  /** "YYYY-MM-DD" — the decision date every line's own price was
   * resolved against. */
  asOfDate: string;
  /** The knowledge cutoff actually applied to every line's own price
   * resolution (see `resolveMarketReferencePrice`'s identical
   * "never null, state what was actually used" rule). */
  knownAt: string;
  /** Deterministically ordered by (product, fieldId) — never database or
   * caller input-array order (brief §18). */
  lines: FertiliserPlanCostLine[];
  /** The complete plan's total cost — `OK` only when every line was
   * fully quantified; otherwise `BLOCKED_INSUFFICIENT_EVIDENCE` naming
   * exactly which line(s) are missing, never a silently partial sum. */
  aggregateOutcome: EngineOutcome<MoneyAmount>;
  /** Always includes `FERTILISER_PLAN_COST_METHODOLOGY_LIMITATION`, plus
   * every distinct line-level limitation (e.g. CATEGORY_BENCHMARK proxy
   * disclosures), deduplicated. */
  limitations: string[];
  /** ISO datetime — caller-supplied (never a `Date` instance internally
   * generated), the same "deterministic, not randomly/wall-clock
   * generated" discipline `EconomicOpportunityAssessment.createdAt`
   * already established in Phase 1. */
  createdAt: string;
}

export interface BuildFertiliserPlanCostAssessmentInput {
  id: string;
  asOfDate: string;
  knownAt: string;
  lines: readonly FertiliserPlanCostLine[];
  createdAt: string;
}

function lineSortKey(line: FertiliserPlanCostLine): string {
  return `${line.product}\u0000${line.fieldId ?? ""}`;
}

function weakestEvidenceState(states: readonly EvidenceState[]): EvidenceState {
  return states.reduce((weakest, state) => (EVIDENCE_STATE_PRIORITY[state] > EVIDENCE_STATE_PRIORITY[weakest] ? state : weakest), states[0]);
}

export function buildFertiliserPlanCostAssessment(input: BuildFertiliserPlanCostAssessmentInput): FertiliserPlanCostAssessment {
  const sortedLines = [...input.lines].sort((a, b) => lineSortKey(a).localeCompare(lineSortKey(b)));

  const blockedLines = sortedLines.filter((line) => line.lineCost.status !== "OK");
  const limitations = [
    FERTILISER_PLAN_COST_METHODOLOGY_LIMITATION,
    ...new Set(sortedLines.flatMap((line) => line.limitations)),
  ];

  let aggregateOutcome: EngineOutcome<MoneyAmount>;
  if (sortedLines.length === 0) {
    aggregateOutcome = blockedInsufficientEvidence("ECONOMIC_FERTILISER_PLAN_COST_INCOMPLETE", ["no fertiliser plan lines to cost"]);
  } else if (blockedLines.length > 0) {
    aggregateOutcome = blockedInsufficientEvidence(
      "ECONOMIC_FERTILISER_PLAN_COST_INCOMPLETE",
      blockedLines.map(
        (line) =>
          `${line.product}${line.fieldId ? ` (field ${line.fieldId})` : ""}: ${describeNonOkReason(line.lineCost as Exclude<EngineOutcome<unknown>, { status: "OK" }>)}`,
      ),
    );
  } else {
    const okLines = sortedLines as (FertiliserPlanCostLine & { lineCost: Extract<EngineOutcome<MoneyAmount>, { status: "OK" }> })[];
    const currency = okLines[0].lineCost.value.currency;
    const total = okLines.reduce((sum, line) => addMoney(sum, line.lineCost.value), zeroMoney(currency));
    aggregateOutcome = ok(total, weakestEvidenceState(okLines.map((line) => line.lineCost.evidenceState)));
  }

  return {
    id: input.id,
    engineVersion: FERTILISER_PLAN_COST_ENGINE_VERSION,
    asOfDate: input.asOfDate,
    knownAt: input.knownAt,
    lines: sortedLines,
    aggregateOutcome,
    limitations,
    createdAt: input.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Farm-level exact quantity aggregation (brief §20) — sums real per-field
// `FertiliserProduct.totalKg` occurrences of the SAME product into one
// exact farm total, via decimal.js, never via `fertiliser-plan.ts`'s own
// `aggregateFarmFertiliserRecommendation` (which sums with plain JS `+=`
// on already-rounded numbers — safe for its own existing display
// purposes, but not the exact-decimal discipline this module requires).
// A caller wanting a farm-level cost line builds one
// `FertiliserPlanCostLineInput` per product using this function's output
// as `totalKg`, rather than re-deriving a farm total any other way.
// ---------------------------------------------------------------------------

/**
 * Exact decimal sum of one product's `totalKg` across every field it was
 * recommended for — never a re-aggregation of the underlying N/P/K
 * requirement itself, only an exact re-statement of the same real
 * per-field kg figures `nutrients.ts` already computed. Returns an exact
 * decimal STRING, never a JS `number` — a farm-level total can
 * legitimately need more decimal places than any single field's own
 * 1-decimal-place rounding boundary (e.g. three fields each ending in
 * `.x` kg can sum to something needing more precision to state exactly),
 * and coercing back to `number` here would silently reintroduce the
 * exact float-imprecision risk this whole module exists to avoid. Feed
 * the result into `FertiliserPlanCostLineInput`'s `exactTotalKg` field.
 */
export function sumExactFertiliserQuantitiesKg(product: string, totalKgByField: readonly number[]): string {
  return totalKgByField
    .map((kg) => new Decimal(exactQuantityFromRoundedNumber(kg, FERTILISER_TOTAL_KG_MAX_DECIMAL_PLACES, `${product} totalKg`)))
    .reduce((sum, kg) => sum.plus(kg), new Decimal(0))
    .toString();
}
