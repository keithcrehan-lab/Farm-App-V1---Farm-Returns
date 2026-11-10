/**
 * Farm calendar: the single store every Plan view reads (Year, Season,
 * This week, Calendar). Pure date helpers and the entries the app can add
 * from sourced data (statutory closed periods, cattle production targets).
 * Dates are plain YYYY-MM-DD strings in farm-local time; nothing here
 * depends on the device clock except via the `today` argument.
 */
import { CLOSED_PERIOD_BY_ZONE_MATERIAL, COUNTY_ZONE, normaliseCountyForZoneLookup, type SpreadingMaterial } from "./closed-period-calendar";

export const CALENDAR_KINDS = ["appointment", "job", "deadline", "season"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const CALENDAR_CATEGORIES = ["cattle", "grass", "fields", "nutrients", "vet", "contractor", "schemes", "other"] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export const CALENDAR_STATUSES = ["planned", "booked", "done", "cancelled"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  cattle: "Cattle", grass: "Grass", fields: "Fields", nutrients: "Fertiliser and slurry",
  vet: "Vet", contractor: "Contractor", schemes: "Schemes", other: "Other",
};
export const CATEGORY_COLOR: Record<CalendarCategory, string> = {
  cattle: "#993C1D", grass: "#3B6D11", fields: "#0F6E56", nutrients: "#854F0B",
  vet: "#A32D2D", contractor: "#534AB7", schemes: "#185FA5", other: "#5F5E5A",
};
export const KIND_LABEL: Record<CalendarKind, string> = { appointment: "Appointment", job: "Job", deadline: "Deadline", season: "Season" };

export interface CalendarEntry {
  id: string;
  kind: CalendarKind;
  category: CalendarCategory;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  status: CalendarStatus;
  assignee: string | null;
  notes: string | null;
  fieldIds: string[];
  /** `farmer` entries are editable; `app` entries come from sourced data. */
  source: "farmer" | "app";
  sourceNote?: string;
  href?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && ISO.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** Monday-first 6x7 grid of dates covering the month of `date`. */
export function monthGrid(date: string): string[] {
  const first = weekStart(monthStart(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function overlaps(entry: Pick<CalendarEntry, "startDate" | "endDate">, from: string, to: string): boolean {
  return entry.startDate <= to && entry.endDate >= from;
}

export function isOpen(entry: CalendarEntry): boolean {
  return entry.status === "planned" || entry.status === "booked";
}

/** Ordering within a day or list: appointments by time, then deadlines, jobs, seasons. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  const rank: Record<CalendarKind, number> = { appointment: 0, deadline: 1, job: 2, season: 3 };
  return a.startDate.localeCompare(b.startDate)
    || rank[a.kind] - rank[b.kind]
    || (a.startTime ?? "").localeCompare(b.startTime ?? "")
    || a.title.localeCompare(b.title);
}

const MATERIAL_TITLE: Record<SpreadingMaterial, string> = {
  chemical_fertiliser: "Closed period: chemical fertiliser",
  organic_fertiliser_other_than_FYM: "Closed period: slurry and soiled water",
  farmyard_manure: "Closed period: farmyard manure",
};

/**
 * Statutory closed periods for the farm's county as season entries that
 * overlap [from, to]. From the app's sourced 2026 closed-period table.
 * Unknown county → none (never guessed).
 */
export function closedPeriodEntries(county: string | null | undefined, from: string, to: string): CalendarEntry[] {
  if (!county) return [];
  const zone = COUNTY_ZONE[normaliseCountyForZoneLookup(county)];
  if (!zone) return [];
  const out: CalendarEntry[] = [];
  const firstYear = Number(from.slice(0, 4)) - 1;
  const lastYear = Number(to.slice(0, 4));
  for (const material of Object.keys(MATERIAL_TITLE) as SpreadingMaterial[]) {
    const p = CLOSED_PERIOD_BY_ZONE_MATERIAL[zone][material];
    for (let y = firstYear; y <= lastYear; y++) {
      const wraps = p.closedFromMmDd > p.closedThroughMmDd;
      const start = `${y}-${p.closedFromMmDd}`;
      const end = `${wraps ? y + 1 : y}-${p.closedThroughMmDd}`;
      if (!overlaps({ startDate: start, endDate: end }, from, to)) continue;
      out.push({
        id: `closed-${material}-${y}`,
        kind: "season",
        category: "nutrients",
        title: MATERIAL_TITLE[material],
        startDate: start,
        endDate: end,
        startTime: null,
        endTime: null,
        status: "planned",
        assignee: null,
        notes: null,
        fieldIds: [],
        source: "app",
        sourceNote: `Nitrates Regulations closed period, zone ${zone}`,
      });
    }
  }
  return out;
}

export function milestoneEntries(milestones: ReadonlyArray<{ groupId: string; groupLabel: string; targetDate: string; targetWeightKg?: number }>): CalendarEntry[] {
  return milestones.filter((m) => isIsoDate(m.targetDate)).map((m) => ({
    id: `milestone-${m.groupId}`,
    kind: "deadline",
    category: "cattle",
    title: `${m.groupLabel}: production target${m.targetWeightKg !== undefined ? ` (${m.targetWeightKg} kg)` : ""}`,
    startDate: m.targetDate,
    endDate: m.targetDate,
    startTime: null,
    endTime: null,
    status: "planned",
    assignee: null,
    notes: null,
    fieldIds: [],
    source: "app",
    sourceNote: "Cattle group production plan",
    href: `/cattle/groups/${m.groupId}`,
  }));
}

export interface CalendarEntryInput {
  id: string;
  kind: CalendarKind;
  category: CalendarCategory;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  status: CalendarStatus;
  assignee: string | null;
  notes: string | null;
  fieldIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a farmer-readable problem, or null when the entry can be saved. */
export function validateCalendarEntry(e: CalendarEntryInput): string | null {
  if (!e || typeof e !== "object" || !UUID.test(String(e.id))) return "Something went wrong. Try again.";
  if (!(CALENDAR_KINDS as readonly string[]).includes(e.kind)) return "Choose what kind of entry this is.";
  if (!(CALENDAR_CATEGORIES as readonly string[]).includes(e.category)) return "Choose a category.";
  if (!(CALENDAR_STATUSES as readonly string[]).includes(e.status)) return "Unknown status.";
  if (typeof e.title !== "string" || !e.title.trim()) return "Give it a name.";
  if (e.title.trim().length > 140) return "Keep the name under 140 characters.";
  if (!isIsoDate(e.startDate) || !isIsoDate(e.endDate)) return "Check the dates.";
  if (e.endDate < e.startDate) return "The end date is before the start date.";
  if (daysBetween(e.startDate, e.endDate) > 400) return "That's longer than a year. Shorten the dates.";
  if (e.kind === "appointment") {
    if (!isTime(e.startTime)) return "Add a start time for the appointment.";
    if (e.endTime !== null && !isTime(e.endTime)) return "Check the end time.";
    if (e.endTime !== null && e.startDate === e.endDate && e.endTime <= e.startTime) return "The end time is before the start time.";
  } else if (e.startTime !== null || e.endTime !== null) return "Only appointments have times.";
  if (e.kind === "deadline" && e.startDate !== e.endDate) return "A deadline is a single day.";
  if (e.assignee !== null && (typeof e.assignee !== "string" || e.assignee.trim().length > 80)) return "Keep the person's name under 80 characters.";
  if (e.notes !== null && (typeof e.notes !== "string" || e.notes.length > 2000)) return "Notes are too long.";
  if (!Array.isArray(e.fieldIds) || e.fieldIds.length > 100 || e.fieldIds.some((f) => !UUID.test(String(f)))) return "Check the fields.";
  return null;
}
