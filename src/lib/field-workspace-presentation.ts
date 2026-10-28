import type { DataStatus, Field, FieldUse, SoilTest, TrackedValue } from "@/domain/types";
import { formatNumber } from "@/lib/format";
import { landUseLabel } from "@/lib/status";

/**
 * Farm + Fields redesign — the field workspace's History chapter and the
 * Overview's use lines (`docs/design/farm-fields-high-fidelity-reference.md`
 * "History", "Current vs planned use").
 *
 * Presentation only, over what the persisted `Field` genuinely records:
 * - the planned-use `TrackedValue` chain (`farmerAdjust` keeps every earlier
 *   value as `previous` with its own `sourceDate`, so a use change is a
 *   dated event, never a silent overwrite);
 * - the boundary capture (`polygonCapturedAt`);
 * - the chained laboratory soil tests (`SoilTest.previous`);
 * - season records (`field.history`) and an archive date.
 *
 * Nothing is inferred: an entry with no recorded date says "Date not
 * recorded" and sorts last, and a current use distinct from the planned use
 * is not modelled, so it is never presented as one. Jobs and decisions are
 * fetched server-side for the whole farm (Records) and are not merged here.
 */

export type FieldHistoryKind = "use" | "boundary" | "soil_test" | "season" | "archive";

export interface FieldHistoryEvent {
  id: string;
  kind: FieldHistoryKind;
  /** ISO date/datetime when recorded; absent when the record has none. */
  date?: string;
  dateLabel: string;
  title: string;
  detail?: string;
}

const STATUS_WORD: Record<DataStatus, string> = {
  verified: "Verified",
  farmer_adjusted: "Farmer entered",
  estimated: "Estimated",
  mapped: "Mapped",
  unavailable: "Unavailable",
};

export function formatFieldDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function plannedUseChain(tracked: TrackedValue<FieldUse> | undefined): TrackedValue<FieldUse>[] {
  const chain: TrackedValue<FieldUse>[] = [];
  for (let node = tracked; node; node = node.previous) chain.push(node);
  return chain;
}

function soilTestChain(test: SoilTest | undefined): SoilTest[] {
  const chain: SoilTest[] = [];
  for (let node = test; node; node = node.previous) chain.push(node);
  return chain;
}

/** The recorded planned use, its provenance and when it was set — or
 * undefined when no use is recorded. */
export function plannedUseLine(field: Field): { value: string; detail: string } | undefined {
  const tracked = field.plannedUse;
  if (!tracked || tracked.status === "unavailable") return undefined;
  const date = formatFieldDate(tracked.sourceDate);
  return { value: landUseLabel(tracked.value), detail: [STATUS_WORD[tracked.status], date ? `set ${date}` : "date not recorded"].join(" · ") };
}

export function fieldHistoryEvents(field: Field): FieldHistoryEvent[] {
  const events: FieldHistoryEvent[] = [];

  const uses = plannedUseChain(field.plannedUse);
  uses.forEach((entry, index) => {
    if (entry.status === "unavailable") return;
    const earlier = uses[index + 1];
    events.push({
      id: `use-${index}`,
      kind: "use",
      ...(entry.sourceDate ? { date: entry.sourceDate } : {}),
      dateLabel: formatFieldDate(entry.sourceDate) ?? "Date not recorded",
      title: earlier && earlier.status !== "unavailable" ? `Planned use changed to ${landUseLabel(entry.value)}` : `Planned use set to ${landUseLabel(entry.value)}`,
      detail: [earlier && earlier.status !== "unavailable" ? `Was ${landUseLabel(earlier.value)}` : undefined, STATUS_WORD[entry.status], entry.source].filter(Boolean).join(" · "),
    });
  });

  if (field.polygon) {
    events.push({
      id: "boundary",
      kind: "boundary",
      ...(field.polygonCapturedAt ? { date: field.polygonCapturedAt } : {}),
      dateLabel: formatFieldDate(field.polygonCapturedAt) ?? "Date not recorded",
      title: "Boundary drawn on the satellite map",
      detail: `Area from the boundary: ${formatNumber(field.areaHa, 2)} ha`,
    });
  }

  soilTestChain(field.fertility.verifiedTest).forEach((test, index) => {
    events.push({
      id: `soil-${index}`,
      kind: "soil_test",
      date: test.sampleDate,
      dateLabel: formatFieldDate(test.sampleDate) ?? "Date not recorded",
      title: "Laboratory soil test sampled",
      detail: [test.laboratory, `pH ${formatNumber(test.pH, 1)}`].filter(Boolean).join(" · "),
    });
  });

  field.history.forEach((season, index) => {
    const parts = [
      season.yieldTDMha !== undefined ? `${formatNumber(season.yieldTDMha, 1)} t DM/ha` : undefined,
      season.fieldCost !== undefined ? `€${formatNumber(season.fieldCost, 0)} field cost` : undefined,
    ].filter(Boolean);
    events.push({
      id: `season-${index}`,
      kind: "season",
      dateLabel: `Season ${season.season}`,
      title: `Season ${season.season} record`,
      ...(parts.length > 0 ? { detail: parts.join(" · ") } : {}),
    });
  });

  if (field.archivedAt) {
    events.push({ id: "archive", kind: "archive", date: field.archivedAt, dateLabel: formatFieldDate(field.archivedAt) ?? "Date not recorded", title: "Field archived" });
  }

  // Newest first; anything without a recorded date keeps its order, last.
  const dated = events.filter((e) => e.date && !Number.isNaN(new Date(e.date).getTime()));
  const undated = events.filter((e) => !dated.includes(e));
  dated.sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
  return [...dated, ...undated];
}
