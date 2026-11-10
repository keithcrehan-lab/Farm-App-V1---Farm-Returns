/**
 * Plan views over the farm calendar: the season ribbon, now / next / later
 * horizons, year lanes per category, and suggestions inferred from data
 * the farmer has already entered elsewhere in the app. Pure functions;
 * `today` is always passed in.
 */
import { addDays, daysBetween, isOpen, overlaps, weekStart, type CalendarCategory, type CalendarEntry, type CalendarKind } from "./farm-calendar";

export interface CalendarSuggestion {
  id: string;
  title: string;
  detail: string;
  category: CalendarCategory;
  kind: CalendarKind;
  /** Where tapping the suggestion goes, when it has its own screen. */
  href?: string;
  /** The orchestration Prompt this suggestion came from, if any. */
  promptId?: string;
}

export const LANE_ORDER: CalendarCategory[] = ["cattle", "grass", "nutrients", "fields", "schemes", "vet", "contractor", "other"];

export function activeSeasons(entries: CalendarEntry[], day: string): CalendarEntry[] {
  return entries.filter((e) => e.kind === "season" && e.status !== "cancelled" && overlaps(e, day, day));
}

export function isOverdue(e: CalendarEntry, today: string): boolean {
  return e.kind !== "season" && isOpen(e) && e.endDate < today;
}

export interface SeasonTransition {
  id: string;
  title: string;
  date: string;
  category: CalendarCategory;
}

function transitionTitle(e: CalendarEntry, starts: boolean): string {
  const closed = /^Closed period: (.+)$/.exec(e.title);
  if (closed) return starts ? `Closed period starts: ${closed[1]}` : `Spreading reopens: ${closed[1]}`;
  return starts ? `${e.title} starts` : `${e.title} ends`;
}

/** Season starts and ends that fall inside [from, to]; an end is shown on the day after. */
export function seasonTransitions(entries: CalendarEntry[], from: string, to: string): SeasonTransition[] {
  const out: SeasonTransition[] = [];
  for (const e of entries) {
    if (e.kind !== "season" || e.status === "cancelled") continue;
    if (e.startDate >= from && e.startDate <= to) out.push({ id: `${e.id}-start`, title: transitionTitle(e, true), date: e.startDate, category: e.category });
    const after = addDays(e.endDate, 1);
    if (after >= from && after <= to) out.push({ id: `${e.id}-end`, title: transitionTitle(e, false), date: after, category: e.category });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export interface Horizon {
  entries: CalendarEntry[];
  transitions: SeasonTransition[];
}

/**
 * Now = this week plus anything overdue; Next = starts in the following
 * 4 weeks; Later = starts within the following 6 months.
 */
export function nowNextLater(entries: CalendarEntry[], today: string): { now: Horizon; next: Horizon; later: Horizon } {
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const nextEnd = addDays(we, 28);
  const laterEnd = addDays(we, 26 * 7);
  const open = entries.filter((e) => e.kind !== "season" && isOpen(e));
  return {
    now: {
      entries: open.filter((e) => overlaps(e, ws, we) || isOverdue(e, today)),
      transitions: seasonTransitions(entries, ws, we),
    },
    next: {
      entries: open.filter((e) => e.startDate > we && e.startDate <= nextEnd),
      transitions: seasonTransitions(entries, addDays(we, 1), nextEnd),
    },
    later: {
      entries: open.filter((e) => e.startDate > nextEnd && e.startDate <= laterEnd),
      transitions: seasonTransitions(entries, addDays(nextEnd, 1), laterEnd),
    },
  };
}

export interface LaneBar {
  entry: CalendarEntry;
  startPct: number;
  endPct: number;
  row: number;
  /** Single-day items (deadlines) draw as a marker, not a bar. */
  marker: boolean;
}

export interface Lane {
  category: CalendarCategory;
  rows: number;
  bars: LaneBar[];
}

/**
 * One lane per category over [from, to]. Seasons and jobs of a week or
 * more draw as bars, packed into rows so they never overlap; deadlines
 * draw as markers on the first row. Lanes with nothing in them are left out.
 */
export function yearLanes(entries: CalendarEntry[], from: string, to: string): Lane[] {
  const span = daysBetween(from, to) + 1;
  const clamp = (d: string) => (d < from ? from : d > to ? to : d);
  const pct = (days: number) => Math.max(0, Math.min(100, (days / span) * 100));
  const lanes: Lane[] = [];
  for (const category of LANE_ORDER) {
    const items = entries
      .filter((e) => e.category === category && e.status !== "cancelled" && overlaps(e, from, to))
      .filter((e) => e.kind === "season" || e.kind === "deadline" || daysBetween(e.startDate, e.endDate) >= 6)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));
    if (!items.length) continue;
    const rowEnds: string[] = [];
    const bars: LaneBar[] = [];
    for (const e of items) {
      const marker = e.kind === "deadline" || e.startDate === e.endDate;
      const startPct = pct(daysBetween(from, clamp(e.startDate)));
      const endPct = pct(daysBetween(from, clamp(e.endDate)) + 1);
      if (marker) { bars.push({ entry: e, startPct, endPct, row: 0, marker }); continue; }
      let row = rowEnds.findIndex((end) => end < e.startDate);
      if (row === -1) { row = rowEnds.length; rowEnds.push(e.endDate); } else rowEnds[row] = e.endDate;
      bars.push({ entry: e, startPct, endPct, row, marker });
    }
    lanes.push({ category, rows: Math.max(1, rowEnds.length), bars });
  }
  return lanes;
}

/**
 * Farmers walk the grazing platform weekly in season. Suggest a walk when
 * the last finished walk is a week old or more, outside December and January.
 */
export function grassWalkSuggestion(lastWalkDate: string | null, today: string): CalendarSuggestion | null {
  const month = Number(today.slice(5, 7));
  if (month === 12 || month === 1) return null;
  const days = lastWalkDate ? daysBetween(lastWalkDate, today) : null;
  if (days !== null && days < 7) return null;
  return {
    id: "suggest-grass-walk",
    title: "Walk the farm",
    detail: days === null ? "No grass walk recorded yet" : `Last walked ${days} days ago`,
    category: "grass",
    kind: "job",
    href: "/grass/walk",
  };
}

/** Best-fit calendar category for an app Prompt, from its kind and title. */
export function promptCategory(kind: string, title: string): CalendarCategory {
  const t = `${kind} ${title}`.toLowerCase();
  if (/slurry|spread|fertili|nitrogen|manure|nutrient/.test(t)) return "nutrients";
  if (/soil|lime|reseed|field/.test(t)) return "fields";
  if (/grass|cover|graz|paddock/.test(t)) return "grass";
  if (/cattle|herd|weigh|calv|wean|animal/.test(t)) return "cattle";
  if (/scheme|biss|acres|deadline|application/.test(t)) return "schemes";
  return "other";
}
