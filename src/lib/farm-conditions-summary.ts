/**
 * Farm Home visual refresh v1 — presentation summary for the compact
 * conditions control over the Farm map. It formats the farm-wide
 * spreading-calendar openness the Farm screen already counts from its real
 * `spreading_window` Prompts; it never decides a closed period itself
 * (`checkClosedPeriodCalendar` does, upstream) and adds no suitability
 * verdict.
 *
 * A "restriction" is a material for which at least one assessed field's
 * Prompt is an evidenced `LEGAL_PROHIBITION` — a fully closed period or a
 * partly open calendar. A field whose Prompt is neither OK nor a legal
 * prohibition (e.g. `BLOCKED_INSUFFICIENT_EVIDENCE` for a missing county)
 * is unknown: never counted as a restriction, as open, or as zero. A
 * material with no assessed field is absent.
 */
export type SpreadingMaterialId = "chemical" | "slurry";

export interface SpreadingCalendarCounts {
  id: SpreadingMaterialId;
  label: string;
  /** Fields whose spreading-window Prompt for this material is OK. */
  openCount: number;
  /** Fields whose spreading-window Prompt for this material is LEGAL_PROHIBITION. */
  prohibitedCount: number;
  /** Fields with a spreading-window Prompt for this material. */
  assessedCount: number;
}

export interface SpreadingCalendarEntry {
  id: SpreadingMaterialId;
  label: string;
  /** "Closed period" or "Open n/m" — the wording the Farm screen has always used. */
  statusText: string;
  restricted: boolean;
  /** Some assessed field has neither an open nor a prohibited status. */
  unevidenced: boolean;
}

export interface FarmConditionsSummary {
  entries: SpreadingCalendarEntry[];
  restrictedCount: number;
  /** Compact control text: a real count, or an honest alternative. */
  restrictionLabel: string;
}

export function spreadingCalendarEntry(counts: SpreadingCalendarCounts): SpreadingCalendarEntry | undefined {
  const { openCount, prohibitedCount, assessedCount } = counts;
  if (assessedCount <= 0) return undefined;
  const unknownCount = Math.max(0, assessedCount - openCount - prohibitedCount);
  const statusText =
    prohibitedCount === assessedCount
      ? "Closed period"
      : openCount + prohibitedCount === 0
        ? "Not enough evidence"
        : `${openCount === 0 ? `Closed ${prohibitedCount}` : `Open ${openCount}`}/${assessedCount}${unknownCount > 0 ? ` · ${unknownCount} not enough evidence` : ""}`;
  return {
    id: counts.id,
    label: counts.label,
    statusText,
    restricted: prohibitedCount > 0,
    unevidenced: unknownCount > 0,
  };
}

/** The ambient one-line form ("Chemical fertiliser · Closed period") other
 * Farm consumers (Conditions lens, farm-topic opportunities) already read. */
export function spreadingCalendarStatusLine(entry: SpreadingCalendarEntry | undefined): string | undefined {
  return entry ? `${entry.label} · ${entry.statusText}` : undefined;
}

export function farmConditionsSummary(entries: readonly (SpreadingCalendarEntry | undefined)[]): FarmConditionsSummary {
  const present = entries.filter((e): e is SpreadingCalendarEntry => Boolean(e));
  const restrictedCount = present.filter((e) => e.restricted).length;
  const restrictionLabel =
    present.length === 0
      ? "Calendar not assessed"
      : restrictedCount > 0
        ? `${restrictedCount} ${restrictedCount === 1 ? "restriction" : "restrictions"}`
        : present.some((e) => e.unevidenced)
          ? "Calendar evidence missing"
          : "Calendar open";
  return { entries: present, restrictedCount, restrictionLabel };
}
