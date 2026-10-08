/**
 * Farm Home visual refresh v1 — presentation summary for the compact
 * conditions control over the Farm map. It formats the farm-wide
 * spreading-calendar openness the Farm screen already counts from its real
 * `spreading_window` Prompts; it never decides a closed period itself
 * (`checkClosedPeriodCalendar` does, upstream) and adds no suitability
 * verdict.
 *
 * A "restriction" is a material for which at least one assessed field is
 * not open — a fully closed period or a partly open calendar. A material
 * with no assessed field is absent, never counted as open or as zero.
 */
export type SpreadingMaterialId = "chemical" | "slurry";

export interface SpreadingCalendarCounts {
  id: SpreadingMaterialId;
  label: string;
  /** Fields whose spreading-window Prompt for this material is OK. */
  openCount: number;
  /** Fields with a spreading-window Prompt for this material. */
  assessedCount: number;
}

export interface SpreadingCalendarEntry {
  id: SpreadingMaterialId;
  label: string;
  /** "Closed period" or "Open n/m" — the wording the Farm screen has always used. */
  statusText: string;
  restricted: boolean;
}

export interface FarmConditionsSummary {
  entries: SpreadingCalendarEntry[];
  restrictedCount: number;
  /** Compact control text: a real count, or an honest alternative. */
  restrictionLabel: string;
}

export function spreadingCalendarEntry(counts: SpreadingCalendarCounts): SpreadingCalendarEntry | undefined {
  if (counts.assessedCount <= 0) return undefined;
  return {
    id: counts.id,
    label: counts.label,
    statusText: counts.openCount === 0 ? "Closed period" : `Open ${counts.openCount}/${counts.assessedCount}`,
    restricted: counts.openCount < counts.assessedCount,
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
      : restrictedCount === 0
        ? "Calendar open"
        : `${restrictedCount} ${restrictedCount === 1 ? "restriction" : "restrictions"}`;
  return { entries: present, restrictedCount, restrictionLabel };
}
