/**
 * Economic Opportunity Engine, Phase 6 — Finite-Resource Whole-Farm Slurry
 * Allocation V1.
 *
 * Phase 5 (`slurry-direct-economic-assessment.ts`) answers "what is the
 * audited economic effect of ONE defined slurry action on ONE field?".
 * Phase 6 answers "given a finite volume of slurry available on the farm,
 * which of several candidate actions should be selected to maximise total
 * scientifically-supported audited economic return, without allocating
 * more slurry than actually exists?" — a resource-allocation problem over
 * ALREADY-COMPUTED Phase 5 results, never a new economic calculation.
 *
 * Core architectural rule (the brief's own words): Phase 6 must CONSUME
 * Phase 5 assessments. It never recreates slurry nutrient science,
 * fertiliser requirements, product allocation, fertiliser costing, price
 * resolution, or economic benefit calculation — a caller has already run
 * the real `buildSlurryDirectEconomicAssessment` once per candidate action
 * (exactly as that module's own header describes) and hands the finished
 * `SlurryDirectEconomicAssessment` objects in here. This module performs
 * pure selection/optimisation arithmetic only.
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's six named conditions) — resolved, not
 * triggered; see DOMAIN_CONTRACTS.md's Phase 6 section for the full
 * write-up this comment summarises.
 * ---------------------------------------------------------------------
 *
 * STOP A (additive economics invalid) — NOT triggered. Two allocations on
 * the SAME field can genuinely interact (product-mix/discrete-plan
 * non-linearity — the brief's own "€300 + €250 might only be €400
 * together" example) and Phase 5 has no multi-action joint counterfactual
 * to value that combination correctly. Two allocations on DIFFERENT
 * fields cannot interact economically: each field's `NutrientPlan`/
 * `FertiliserPlanCostAssessment` is a self-contained calculation over that
 * field's own soil/livestock/area inputs, with no shared discrete
 * resource across fields other than the finite slurry pool itself (which
 * IS this module's own volume constraint). Therefore this module resolves
 * §13's choice as: **at most one selected candidate action per field**
 * within a single Phase 6 result (§13's option A) — this is provably safe
 * under the current architecture, so no multi-action counterfactual needs
 * inventing. The consequence — this module cannot yet value two
 * genuinely-separate, non-overlapping applications on the same field
 * together (e.g. a spring application plus a later top-up) — is real and
 * is surfaced as an explicit output limitation, not silently dropped.
 *
 * STOP B (no trustworthy finite-availability representation) — NOT
 * triggered. `AvailableSlurryVolumeInput` requires the caller to state
 * explicitly whether the available volume is known or unknown; "unknown"
 * blocks the whole result rather than defaulting to zero or unlimited.
 * Nothing here infers or invents a farm's available slurry.
 *
 * STOP C (identity cannot prevent double-use) — NOT triggered.
 * `evaluatedActionId` is the same stable identity Phase 5 already
 * established (the real `SlurryAllocation` database row id); this module
 * rejects a candidate set containing a duplicate `evaluatedActionId`
 * outright (an input-integrity error, not a per-candidate exclusion —
 * silently deduplicating would require guessing which duplicate the
 * caller "meant"), and the one-action-per-field rule plus the real Phase 1
 * `validateNoDuplicateCreditClaims` check (run over every SELECTED
 * effect, not merely trusted) together give defence in depth against the
 * same physical action being credited twice.
 *
 * STOP D (Phase 5 API insufficient) — NOT triggered. Every candidate's
 * economic value is read directly off its own already-built
 * `SlurryDirectEconomicAssessment.netEconomicResult`/`.directCostDifference`
 * — this module never estimates, interpolates, or recomputes a value
 * Phase 5 could produce (see `assertNeverEstimatesValue` note on
 * `SlurryAllocationCandidateInput` below).
 *
 * STOP E (quantity arithmetic unsafe) — NOT triggered.
 * `src/domain/types.ts`'s `SlurryAllocation.volumeM3`/
 * `SlurryDirectEconomicAssessmentInput` carry raw `number` volumes with no
 * existing documented rounding boundary (unlike `nutrients.ts`'s
 * `totalKg`, which Phase 4 could cite a specific `Math.round(x*10)/10`
 * boundary for). Rather than treating this as unsafe, this module reuses
 * `units.ts`'s already-established `exactQuantityFromRoundedNumber` — the
 * exact same tool Phase 4 used for `totalKg` — with its OWN, newly
 * documented Phase 6 policy boundary (`SLURRY_VOLUME_MAX_DECIMAL_PLACES`,
 * 2 decimal places: comfortably covers any realistic farmer-reported m³
 * figure while still rejecting genuine float contamination). A volume
 * needing more precision than that to represent exactly is rejected as an
 * invalid candidate (fail closed), never silently truncated. This does
 * not "materially alter an earlier domain contract" — it is the same
 * general-purpose Phase 4 utility applied to a new, structurally
 * identical quantity-safety need, with its own explicit, narrow policy
 * choice.
 *
 * STOP F (currency aggregation unsafe) — NOT triggered.
 * `CurrencyCode` (`money.ts`) is currently a single-value union (`"EUR"`
 * only) and every Phase 5 assessment's `MoneyAmount`s already pass
 * through `addMoney`/`subtractMoney`, which themselves throw on a real
 * currency mismatch (defence already built into Phase 1, reused here
 * rather than re-implemented). This module wraps its own total-folding in
 * a try/catch specifically to convert that (currently unreachable, but
 * structurally still-guarded-against) throw into a blocked
 * `EngineOutcome` rather than an uncaught exception — no FX conversion is
 * invented anywhere.
 *
 * ---------------------------------------------------------------------
 * Optimisation method (brief §14/§25): exact recursive enumeration over
 * per-field "choice groups" (each group's options are: select none from
 * this field, or select exactly one of its comparable candidates),
 * comparing every FEASIBLE (volume ≤ available) complete assignment by
 * total audited net economic value, with a documented deterministic
 * tie-break. This is exact by construction (never an approximation, never
 * a greedy €/m³ heuristic — see the explicit greedy-failure test this
 * module's test file proves against). Complexity is
 * O(∏ᵢ(optionsInGroupᵢ + 1)) — exponential in the number of distinct
 * fields with a candidate, appropriate for the "small/medium pilot scale"
 * this brief explicitly targets, NOT a large-scale (dozens of
 * concurrently-evaluated fields with many variants each) optimiser.
 * `MAX_ENUMERATED_COMBINATIONS` bounds this explicitly; exceeding it
 * produces a clearly-labelled blocked result
 * (`ECONOMIC_SLURRY_ALLOCATION_EXACT_OPTIMISATION_INFEASIBLE_AT_SCALE`)
 * rather than silently hanging or swapping in an approximate algorithm —
 * see DOMAIN_CONTRACTS.md for the scaling note this deliberately does not
 * solve in V1 (a future phase would need a genuine DP/ILP formulation).
 */

import Decimal from "decimal.js";
import { addMoney, compareMoney, isZeroMoney, negateMoney, zeroMoney, type MoneyAmount } from "./money";
import { exactQuantityFromRoundedNumber } from "./units";
import { ambiguous, blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";
import { validateNoDuplicateCreditClaims, type DoubleCountingValidationResult, type EconomicEffect } from "./economic-opportunity";
import {
  SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION,
  type SlurryDirectEconomicAssessment,
} from "./slurry-direct-economic-assessment";

export const SLURRY_WHOLE_FARM_ALLOCATION_ENGINE_VERSION = "slurry_whole_farm_allocation_engine_v1.0.0";

/** Phase 6 policy boundary (brief §18/STOP E) — see this module's header
 * for why this is a NEW, explicitly-documented boundary rather than one
 * inherited from an existing rounding rule. Not a scientific or
 * regulatory fact; a deliberately generous precision cap chosen so any
 * realistic farmer-reported m³ figure passes, while genuine
 * floating-point contamination (needing many more decimal places to
 * represent exactly) is still rejected. */
export const SLURRY_VOLUME_MAX_DECIMAL_PLACES = 2;

/** Deliberately conservative bound on brief §14's exact enumeration —
 * comfortably covers realistic pilot-scale candidate sets (e.g. up to
 * ~10 fields with a handful of volume variants each: 4^10 ≈ 1,048,576)
 * while refusing to silently run an exponential search to an
 * impractical size. See this module's header and DOMAIN_CONTRACTS.md. */
export const MAX_ENUMERATED_COMBINATIONS = 2_000_000;

/** Phase 6's own scope limitation, replacing (not forwarding unchanged)
 * each selected candidate's own
 * `SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION` — that Phase 5
 * text specifically says the opportunity cost of allocating slurry
 * elsewhere is "not yet accounted for," which becomes actively
 * misleading once forwarded unchanged inside a result that IS resolving
 * exactly that trade-off across the fields it was given. The narrower,
 * still-true residual limitation is stated instead: Phase 6 only
 * resolves the trade-off across the candidates it was actually supplied
 * with. */
export const SLURRY_WHOLE_FARM_ALLOCATION_SCOPE_LIMITATION =
  "This result allocates finite slurry only across the candidate actions supplied to it; a real eligible field with no supplied candidate is not considered, and its opportunity cost is not accounted for.";

/** See this module's header, STOP A. */
export const SLURRY_WHOLE_FARM_ALLOCATION_SAME_FIELD_LIMITATION =
  "At most one candidate action is selected per field. This result cannot yet jointly value two or more separate slurry applications on the same field — Phase 5 has no multi-action joint counterfactual to represent that combination correctly.";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Brief §2 — "unknown available slurry must block allocation," never
 * default to zero or unlimited. */
export type AvailableSlurryVolumeInput = { status: "known"; volumeM3: number } | { status: "unknown" };

export interface SlurryAllocationCandidateInput {
  /** Must equal `assessment.evaluatedActionId` — checked, not assumed. */
  evaluatedActionId: string;
  /** Must equal `assessment.fieldId` — checked, not assumed. */
  fieldId: string;
  /** The proposed volume (m³) THIS candidate action would use. */
  volumeM3: number;
  /** The real, already-computed Phase 5 result for this exact candidate
   * action. This module reads its `netEconomicResult`/
   * `directCostDifference`/`effect`/`limitations` — it never computes,
   * estimates, or interpolates an economic value of its own (STOP D). */
  assessment: SlurryDirectEconomicAssessment;
}

export interface SlurryWholeFarmAllocationInput {
  /** Deterministic, caller-supplied — never randomly generated. */
  id: string;
  asOfDate: string;
  knownAt: string;
  availableVolume: AvailableSlurryVolumeInput;
  candidates: SlurryAllocationCandidateInput[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type SlurryAllocationExclusionReason =
  | { kind: "invalid_input"; detail: string }
  | { kind: "not_economically_comparable"; phase5Status: string; reasonCode?: string; missingInputs?: string[] }
  | { kind: "not_selected_by_optimiser" };

export interface SelectedSlurryAllocation {
  evaluatedActionId: string;
  fieldId: string;
  volumeM3: string;
  netEconomicContribution: { direction: "benefit" | "cost" | "zero"; amount: MoneyAmount };
  grossEconomicContribution: { direction: "benefit" | "cost" | "zero"; amount: MoneyAmount };
  /** Full Phase 5 provenance retained unstripped (brief §19) — never
   * shrunk down to just the euro figure. */
  assessment: SlurryDirectEconomicAssessment;
}

export interface ExcludedSlurryAllocationCandidate {
  evaluatedActionId: string;
  fieldId: string;
  reason: SlurryAllocationExclusionReason;
}

export interface SlurryWholeFarmAllocationResult {
  id: string;
  engineVersion: string;
  asOfDate: string;
  knownAt: string;
  availableVolumeM3: string;
  selected: SelectedSlurryAllocation[];
  excluded: ExcludedSlurryAllocationCandidate[];
  selectedVolumeM3: string;
  remainingVolumeM3: string;
  /** Safely additive because every selected candidate is independent (at
   * most one per field — STOP A) and net requires gross OK, so every
   * selected candidate contributes a real gross figure too. */
  totalGrossEconomicEffect: { direction: "benefit" | "cost" | "zero" | null; amount: EngineOutcome<MoneyAmount> };
  totalNetEconomicResult: { direction: "benefit" | "cost" | "zero" | null; amount: EngineOutcome<MoneyAmount> };
  /** The real Phase 1 validator, run over every selected effect — defence
   * in depth alongside the one-per-field rule and duplicate-identity
   * rejection. */
  creditValidation: DoubleCountingValidationResult;
  limitations: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Directed-amount arithmetic — composed entirely from Phase 1's existing
// exact Money primitives (never a parallel signed-decimal system).
// ---------------------------------------------------------------------------

type DirectedAmount = { direction: "benefit" | "cost" | "zero"; amount: MoneyAmount };

function toSigned(a: DirectedAmount): MoneyAmount {
  return a.direction === "cost" ? negateMoney(a.amount) : a.amount;
}

function fromSigned(signed: MoneyAmount): DirectedAmount {
  if (isZeroMoney(signed)) return { direction: "zero", amount: zeroMoney(signed.currency) };
  if (signed.amount.startsWith("-")) return { direction: "cost", amount: negateMoney(signed) };
  return { direction: "benefit", amount: signed };
}

function combineDirectedAmounts(a: DirectedAmount, b: DirectedAmount): DirectedAmount {
  return fromSigned(addMoney(toSigned(a), toSigned(b)));
}

/** Total order: cost < zero < benefit; within the same non-zero
 * direction, compare by magnitude. Reuses `compareMoney` directly on the
 * signed representation. */
function compareDirectedValue(a: DirectedAmount, b: DirectedAmount): -1 | 0 | 1 {
  return compareMoney(toSigned(a), toSigned(b));
}

// ---------------------------------------------------------------------------
// Internal candidate representation after validation/exclusion.
// ---------------------------------------------------------------------------

interface ComparableCandidate {
  evaluatedActionId: string;
  fieldId: string;
  volumeDecimal: Decimal;
  volumeM3Exact: string;
  net: DirectedAmount;
  gross: DirectedAmount;
}

function exactVolumeOrThrow(volumeM3: number, label: string): string {
  return exactQuantityFromRoundedNumber(volumeM3, SLURRY_VOLUME_MAX_DECIMAL_PLACES, label);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildSlurryWholeFarmAllocation(
  input: SlurryWholeFarmAllocationInput,
): EngineOutcome<SlurryWholeFarmAllocationResult> {
  // --- Global blocking checks (brief §24: unknown available quantity,
  // invalid resource quantity, malformed candidate SET identity) ---------

  if (input.availableVolume.status === "unknown") {
    return blockedInsufficientEvidence("ECONOMIC_SLURRY_ALLOCATION_UNKNOWN_AVAILABLE_VOLUME", [
      "the available slurry volume for this farm/period is unknown — allocation cannot proceed without a real, known resource budget; absence of evidence is never treated as zero or unlimited",
    ]);
  }
  const rawAvailable = input.availableVolume.volumeM3;
  if (!Number.isFinite(rawAvailable) || rawAvailable < 0) {
    return blockedInsufficientEvidence("ECONOMIC_SLURRY_ALLOCATION_INVALID_AVAILABLE_VOLUME", [
      `available volume must be a finite, non-negative number of m³; got ${rawAvailable}`,
    ]);
  }
  let availableVolumeM3: string;
  try {
    availableVolumeM3 = exactVolumeOrThrow(rawAvailable, "available slurry volume (m³)");
  } catch (error) {
    return blockedInsufficientEvidence("ECONOMIC_SLURRY_ALLOCATION_IMPRECISE_AVAILABLE_VOLUME", [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  const availableDecimal = new Decimal(availableVolumeM3);

  const seenActionIds = new Set<string>();
  const duplicateActionIds = new Set<string>();
  for (const candidate of input.candidates) {
    if (seenActionIds.has(candidate.evaluatedActionId)) duplicateActionIds.add(candidate.evaluatedActionId);
    seenActionIds.add(candidate.evaluatedActionId);
  }
  if (duplicateActionIds.size > 0) {
    return blockedInsufficientEvidence("ECONOMIC_SLURRY_ALLOCATION_DUPLICATE_CANDIDATE_IDENTITY", [
      `the candidate set contains the same evaluatedActionId more than once (${[...duplicateActionIds].sort().join(", ")}) — a caller-input-integrity problem, not a per-candidate economic question; silently deduplicating would require guessing which duplicate was intended`,
    ]);
  }

  // --- Per-candidate validation / exclusion ------------------------------

  const excluded: ExcludedSlurryAllocationCandidate[] = [];
  const comparable: ComparableCandidate[] = [];

  for (const candidate of input.candidates) {
    const { evaluatedActionId, fieldId, volumeM3, assessment } = candidate;

    if (assessment.evaluatedActionId !== evaluatedActionId || assessment.fieldId !== fieldId) {
      excluded.push({
        evaluatedActionId,
        fieldId,
        reason: {
          kind: "invalid_input",
          detail: `candidate identity (evaluatedActionId="${evaluatedActionId}", fieldId="${fieldId}") does not match the identity actually recorded on its own Phase 5 assessment (evaluatedActionId="${assessment.evaluatedActionId}", fieldId="${assessment.fieldId}")`,
        },
      });
      continue;
    }
    if (!Number.isFinite(volumeM3) || volumeM3 < 0) {
      excluded.push({
        evaluatedActionId,
        fieldId,
        reason: { kind: "invalid_input", detail: `candidate volume must be a finite, non-negative number of m³; got ${volumeM3}` },
      });
      continue;
    }
    let volumeM3Exact: string;
    try {
      volumeM3Exact = exactVolumeOrThrow(volumeM3, `candidate ${evaluatedActionId} volume (m³)`);
    } catch (error) {
      excluded.push({ evaluatedActionId, fieldId, reason: { kind: "invalid_input", detail: error instanceof Error ? error.message : String(error) } });
      continue;
    }

    const netOutcome = assessment.netEconomicResult;
    if (netOutcome.amount.status !== "OK" || netOutcome.direction === null) {
      const reason: SlurryAllocationExclusionReason =
        netOutcome.amount.status === "BLOCKED_INSUFFICIENT_EVIDENCE"
          ? { kind: "not_economically_comparable", phase5Status: netOutcome.amount.status, reasonCode: netOutcome.amount.reasonCode, missingInputs: netOutcome.amount.missingInputs }
          : { kind: "not_economically_comparable", phase5Status: netOutcome.amount.status };
      excluded.push({ evaluatedActionId, fieldId, reason });
      continue;
    }
    // Net OK structurally guarantees gross OK too (Phase 5's own
    // contract: net only proceeds past the "gross must be OK" gate) —
    // asserted, not silently assumed.
    if (assessment.directCostDifference.status !== "OK" || assessment.directCostDifferenceDirection === null || assessment.effect === null) {
      excluded.push({
        evaluatedActionId,
        fieldId,
        reason: {
          kind: "invalid_input",
          detail: "internal consistency violation: netEconomicResult reported OK but the underlying directCostDifference/effect did not — Phase 5's own contract guarantees this cannot happen for a genuine assessment",
        },
      });
      continue;
    }

    comparable.push({
      evaluatedActionId,
      fieldId,
      volumeDecimal: new Decimal(volumeM3Exact),
      volumeM3Exact,
      net: { direction: netOutcome.direction, amount: netOutcome.amount.value },
      gross: { direction: assessment.directCostDifferenceDirection, amount: assessment.directCostDifference.value },
    });
  }

  // --- Group by field (STOP A resolution: at most one per field) --------

  const groupsByField = new Map<string, ComparableCandidate[]>();
  for (const c of comparable) {
    const group = groupsByField.get(c.fieldId) ?? [];
    group.push(c);
    groupsByField.set(c.fieldId, group);
  }
  // Deterministic group order (fieldId ascending) — enumeration order
  // itself does not affect the final chosen solution (solutions are
  // compared fully materialised, not accumulated path-dependently), but
  // a stable order keeps this function's own iteration reproducible.
  const groups = [...groupsByField.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([fieldId, options]) => ({
    fieldId,
    // Deterministic option order within a group too.
    options: [...options].sort((a, b) => (a.evaluatedActionId < b.evaluatedActionId ? -1 : a.evaluatedActionId > b.evaluatedActionId ? 1 : 0)),
  }));

  const combinationCount = groups.reduce((product, g) => product * (g.options.length + 1), 1);
  if (combinationCount > MAX_ENUMERATED_COMBINATIONS) {
    return blockedInsufficientEvidence("ECONOMIC_SLURRY_ALLOCATION_EXACT_OPTIMISATION_INFEASIBLE_AT_SCALE", [
      `exact enumeration would require evaluating ${combinationCount} combinations (${groups.length} fields with a candidate), more than this module's documented pilot-scale bound of ${MAX_ENUMERATED_COMBINATIONS} — this is a correctness boundary, not silently swapped for an approximate algorithm; a future phase would need a genuine DP/ILP formulation to scale further`,
    ]);
  }

  // --- Exact combinatorial search (brief §14/§22) ------------------------

  const ZERO: DirectedAmount = { direction: "zero", amount: zeroMoney("EUR") };

  interface Solution {
    chosen: ComparableCandidate[];
    volume: Decimal;
    value: DirectedAmount;
  }

  let best: Solution | null = null;

  function isBetter(candidateSolution: Solution, currentBest: Solution): boolean {
    const valueCmp = compareDirectedValue(candidateSolution.value, currentBest.value);
    if (valueCmp !== 0) return valueCmp > 0;
    // Tie-break 1: fewer selected actions (implements brief §9 — a
    // genuine zero-value candidate must never be preferred over selecting
    // nothing, since both are worth exactly zero).
    if (candidateSolution.chosen.length !== currentBest.chosen.length) return candidateSolution.chosen.length < currentBest.chosen.length;
    // Tie-break 2: lower total volume used (brief §15 item 1 — adopted as
    // this module's explicit policy).
    const volumeCmp = candidateSolution.volume.comparedTo(currentBest.volume);
    if (volumeCmp !== 0) return volumeCmp < 0;
    // Tie-break 3: stable canonical ordering by sorted selected action ids.
    const idsA = candidateSolution.chosen.map((c) => c.evaluatedActionId).sort().join("|");
    const idsB = currentBest.chosen.map((c) => c.evaluatedActionId).sort().join("|");
    return idsA < idsB;
  }

  function search(groupIndex: number, chosen: ComparableCandidate[], volume: Decimal, value: DirectedAmount): void {
    if (groupIndex === groups.length) {
      if (volume.lte(availableDecimal)) {
        const solution: Solution = { chosen, volume, value };
        if (best === null || isBetter(solution, best)) best = solution;
      }
      return;
    }
    const group = groups[groupIndex];
    // Option: select none from this field.
    search(groupIndex + 1, chosen, volume, value);
    // Option: select each candidate in this field, one at a time.
    for (const option of group.options) {
      const newVolume = volume.plus(option.volumeDecimal);
      if (newVolume.gt(availableDecimal)) continue; // prune infeasible branch
      search(groupIndex + 1, [...chosen, option], newVolume, combineDirectedAmounts(value, option.net));
    }
  }

  search(0, [], new Decimal(0), ZERO);

  // "Select nothing" is always feasible (volume 0 ≤ any non-negative
  // available volume), so `best` is guaranteed non-null here.
  if (best === null) {
    throw new Error("buildSlurryWholeFarmAllocation: internal invariant violated — the empty selection is always a feasible solution, so a best solution must always be found.");
  }
  const winning: Solution = best;

  const selectedIds = new Set(winning.chosen.map((c) => c.evaluatedActionId));
  for (const c of comparable) {
    if (!selectedIds.has(c.evaluatedActionId)) excluded.push({ evaluatedActionId: c.evaluatedActionId, fieldId: c.fieldId, reason: { kind: "not_selected_by_optimiser" } });
  }

  const selected: SelectedSlurryAllocation[] = winning.chosen
    .slice()
    .sort((a, b) => (a.evaluatedActionId < b.evaluatedActionId ? -1 : a.evaluatedActionId > b.evaluatedActionId ? 1 : 0))
    .map((c) => {
      const original = input.candidates.find((cand) => cand.evaluatedActionId === c.evaluatedActionId);
      // Guaranteed to exist — `c` was built from `input.candidates` above.
      const assessment = original!.assessment;
      return {
        evaluatedActionId: c.evaluatedActionId,
        fieldId: c.fieldId,
        volumeM3: c.volumeM3Exact,
        netEconomicContribution: c.net,
        grossEconomicContribution: c.gross,
        assessment,
      };
    });

  const selectedVolumeM3 = winning.volume.toFixed(SLURRY_VOLUME_MAX_DECIMAL_PLACES);
  const remainingVolumeM3 = availableDecimal.minus(winning.volume).toFixed(SLURRY_VOLUME_MAX_DECIMAL_PLACES);

  // --- Totals (brief §17/STOP F) ------------------------------------------

  let totalNetDirected: DirectedAmount = ZERO;
  let totalGrossDirected: DirectedAmount = ZERO;
  let totalsOutcome: { net: EngineOutcome<MoneyAmount>; gross: EngineOutcome<MoneyAmount> };
  try {
    for (const s of selected) {
      totalNetDirected = combineDirectedAmounts(totalNetDirected, s.netEconomicContribution);
      totalGrossDirected = combineDirectedAmounts(totalGrossDirected, s.grossEconomicContribution);
    }
    totalsOutcome = { net: ok(totalNetDirected.amount, "IRISH_MODEL"), gross: ok(totalGrossDirected.amount, "IRISH_MODEL") };
  } catch (error) {
    const blocked = ambiguous<MoneyAmount>(
      "ECONOMIC_SLURRY_ALLOCATION_CURRENCY_MISMATCH",
      `could not safely aggregate selected candidates' economic totals: ${error instanceof Error ? error.message : String(error)}`,
    );
    totalsOutcome = { net: blocked, gross: blocked };
  }

  // --- Credit-claim double-counting guard (real Phase 1 validator, not
  // merely trusted from the field-exclusivity design) ---------------------

  const selectedEffects: EconomicEffect[] = selected
    .map((s) => s.assessment.effect)
    .filter((e): e is EconomicEffect => e !== null);
  const creditValidation = validateNoDuplicateCreditClaims(selectedEffects);

  // --- Limitations ---------------------------------------------------------

  const limitations = new Set<string>([SLURRY_WHOLE_FARM_ALLOCATION_SCOPE_LIMITATION, SLURRY_WHOLE_FARM_ALLOCATION_SAME_FIELD_LIMITATION]);
  for (const s of selected) {
    for (const l of s.assessment.limitations) {
      // Superseded by SLURRY_WHOLE_FARM_ALLOCATION_SCOPE_LIMITATION above
      // (see this module's header) — every other limitation (cash/stock,
      // proxy/CATEGORY_BENCHMARK, unknown VAT, not-least-cost, ...) is
      // still fully true and forwarded unchanged.
      if (l === SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION) continue;
      limitations.add(l);
    }
  }

  return ok(
    {
      id: input.id,
      engineVersion: SLURRY_WHOLE_FARM_ALLOCATION_ENGINE_VERSION,
      asOfDate: input.asOfDate,
      knownAt: input.knownAt,
      availableVolumeM3,
      selected,
      excluded,
      selectedVolumeM3,
      remainingVolumeM3,
      totalGrossEconomicEffect: { direction: selected.length === 0 ? "zero" : totalGrossDirected.direction, amount: totalsOutcome.gross },
      totalNetEconomicResult: { direction: selected.length === 0 ? "zero" : totalNetDirected.direction, amount: totalsOutcome.net },
      creditValidation,
      limitations: [...limitations],
      createdAt: input.createdAt,
    },
    "IRISH_MODEL",
  );
}
