import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";
import type { SlurryAllocation } from "@/domain/types";

/**
 * The single season-resolution contract for fertiliser planning. The
 * per-field status path, the farm-demand (purchase) engine and quote
 * readiness all resolve planning-season inputs through this module so the
 * three can never disagree about which cycles or slurry allocations belong
 * to the season being quoted.
 */

/** Slurry counts toward a season only when it is planned to be spread in
 * that season. Slurry spread (or planned) in another season never credits,
 * reduces or blocks the planning-season requirement. */
export function slurryAllocationsForPlanningSeason<T extends SlurryAllocation>(
  allocations: readonly T[],
  planningSeason: string,
): T[] {
  return allocations.filter(
    (allocation) =>
      allocation.applicationDate?.value?.slice(0, 4) === planningSeason,
  );
}

/** For a future season, chemical N/P/K applied before that season is never
 * deducted: the baseline is an explicit, provenance-carrying zero. */
export function withFuturePlanningChemicalBaseline<
  T extends FieldProductionCycle,
>(cycle: T, planningSeason: string): T {
  const zero = (nutrient: string) => ({
    value: 0,
    method: "ASSUMED" as const,
    source: `Farm Return ${planningSeason} quote planning`,
    note: `${nutrient} applied before the ${planningSeason} season is not deducted from the ${planningSeason} fertiliser requirement.`,
  });
  return {
    ...cycle,
    evidence: {
      ...cycle.evidence,
      chemicalNAppliedKgHa: zero("Chemical N"),
      chemicalPAppliedKgHa: zero("Chemical P"),
      chemicalKAppliedKgHa: zero("Chemical K"),
    },
  };
}

/** A current-season cycle carried forward as the planned use for a future
 * season. The id records the carry-forward so it is never mistaken for a
 * cycle the farmer saved for that season. */
export function carryCycleForwardForPlanningSeason<
  T extends FieldProductionCycle,
>(cycle: T, planningSeason: string): T {
  return withFuturePlanningChemicalBaseline(
    {
      ...cycle,
      id: `${cycle.id}:quote:${planningSeason}`,
      season: planningSeason,
      status: "planned" as const,
    },
    planningSeason,
  );
}

export function isCarriedForwardPlanningCycle(
  cycle: Pick<FieldProductionCycle, "id" | "season">,
): boolean {
  return cycle.id.endsWith(`:quote:${cycle.season}`);
}

/**
 * Resolve the production cycles used for a planning season. A current or
 * past season uses its own saved cycles. A future season uses any saved
 * target-season cycle first, otherwise the current-season cycle carried
 * forward; both get the future chemical baseline.
 */
export function resolvePlanningSeasonCycles<T extends FieldProductionCycle>(
  input: {
    targetCycles: readonly T[];
    currentCycles: readonly T[];
    planningSeason: string;
    currentSeason: string;
  },
): T[] {
  const { targetCycles, currentCycles, planningSeason, currentSeason } = input;
  if (planningSeason <= currentSeason) return [...targetCycles];

  const futureTargetCycles = targetCycles.map((cycle) =>
    withFuturePlanningChemicalBaseline(cycle, planningSeason),
  );
  const targetByField = new Map(
    futureTargetCycles.map((cycle) => [cycle.fieldId, cycle]),
  );
  const resolved = currentCycles.map(
    (cycle) =>
      targetByField.get(cycle.fieldId) ??
      carryCycleForwardForPlanningSeason(cycle, planningSeason),
  );
  const resolvedFieldIds = new Set(resolved.map((cycle) => cycle.fieldId));
  for (const cycle of futureTargetCycles)
    if (!resolvedFieldIds.has(cycle.fieldId)) resolved.push(cycle);
  return resolved;
}
