/**
 * Pure display-only interpretation of the Grass engine's independent values:
 * today's current cover and the cover projected for a selected future date.
 * Do not re-calculate growth or animal demand here. The actual field bar
 * always ends at the engine's projected cover.
 */
export interface WedgeForecastParts {
  /** Part of the projected cover that is already present today. */
  retainedKgDmHa: number;
  /** Positive net change above today's cover. */
  addedKgDmHa: number;
  /** Positive amount projected to be lost below today's cover. */
  lostKgDmHa: number;
}

export function wedgeForecastParts(
  currentCover: number | undefined,
  projectedCover: number | undefined,
  days: number,
): WedgeForecastParts | undefined {
  if (
    days <= 0 ||
    currentCover === undefined ||
    projectedCover === undefined ||
    !Number.isFinite(currentCover) ||
    !Number.isFinite(projectedCover) ||
    currentCover < 0 ||
    projectedCover < 0
  ) return undefined;

  return {
    retainedKgDmHa: Math.min(currentCover, projectedCover),
    addedKgDmHa: Math.max(0, projectedCover - currentCover),
    lostKgDmHa: Math.max(0, currentCover - projectedCover),
  };
}
