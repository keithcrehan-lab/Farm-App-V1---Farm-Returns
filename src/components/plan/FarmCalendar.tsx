"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { Beef, Check, ChevronLeft, ChevronRight, Circle, Clock, FlaskConical, Flag, Plus, ShieldCheck, Sprout, Tractor, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CALENDAR_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, KIND_LABEL,
  addDays, addMonths, closedPeriodEntries, compareEntries, daysBetween, isOpen, milestoneEntries, monthGrid, monthStart, overlaps, weekStart,
  type CalendarCategory, type CalendarEntry, type CalendarKind, type CalendarStatus,
} from "@/domain/farm-calendar";
import {
  ACTIVITY_LANE_COLOR, ACTIVITY_LANE_LABEL, activeSeasons, activityLanes, bookingState, isOverdue, nowNextLater, upNext,
  type ActivityLane, type ActivityLaneRow, type Horizon,
} from "@/domain/plan-views";
import { listCalendarEntriesAction, saveCalendarEntryAction, setCalendarEntryStatusAction } from "@/app/actions/calendar";
import { listGrassSurveysAction } from "@/app/actions/grass-surveys";

type View = "today" | "week" | "season" | "year";
const VIEWS: Array<[View, string]> = [["today", "Today"], ["week", "Week"], ["season", "Season"], ["year", "Year"]];
/** Season view spans twelve weeks from the start of this week. */
const SEASON_WEEKS = 12;

const LANE_ICON: Record<ActivityLane, ComponentType<{ className?: string }>> = {
  cattle: Beef, grass: Sprout, fertiliser: FlaskConical, contractors: Tractor, compliance: ShieldCheck, other: Circle,
};

const localToday = () => new Date().toLocaleDateString("en-CA");
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", ...opts });
const dayMonth = (d: string) => fmt(d, { day: "numeric", month: "short" });
const tint = (c: CalendarCategory, alpha: string) => `${CATEGORY_COLOR[c]}${alpha}`;
const bookable = (c: CalendarCategory) => c === "vet" || c === "contractor";

function whenLabel(e: CalendarEntry, today: string): string {
  if (isOverdue(e, today)) return `Overdue since ${dayMonth(e.endDate)}`;
  if (e.kind === "appointment") return `${e.startDate === today ? "" : `${fmt(e.startDate, { weekday: "short", day: "numeric" })} · `}${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`;
  if (e.kind === "deadline") return `By ${fmt(e.startDate, { weekday: "short", day: "numeric", month: "short" })}`;
  if (e.startDate === e.endDate) return fmt(e.startDate, { weekday: "short", day: "numeric", month: "short" });
  return `${dayMonth(e.startDate)} – ${dayMonth(e.endDate)}`;
}

/** What a new entry starts with: from the + button (nothing) or from a recommendation. */
export interface Preset {
  title: string;
  category: CalendarCategory;
  kind: CalendarKind;
  startDate?: string;
  endDate?: string;
  fieldIds?: string[];
  notes?: string;
  /** The recommendation the entry is made from, so it can be tracked. */
  sourceKey?: string;
}

/** What the Plan assistant (recommendations, overview, rules) is given to work with. */
export interface PlanAssistantContext {
  entries: CalendarEntry[];
  today: string;
  /** undefined while loading or unknown; null when no walk is on record. */
  lastWalk: string | null | undefined;
  signedIn: boolean;
  loading: boolean;
  addToPlan: (preset: Preset) => void;
  setEntryStatus: (entryId: string, status: CalendarStatus) => void;
}

interface Props {
  county: string | null | undefined;
  fields: ReadonlyArray<{ id: string; name: string }>;
  milestones: ReadonlyArray<{ groupId: string; groupLabel: string; targetDate: string; targetWeightKg?: number }> | null;
  signedIn: boolean;
  /** Renders the recommendations, weekly overview and rules on the Today view. */
  assistant?: (ctx: PlanAssistantContext) => ReactNode;
}

export function FarmCalendar({ county, fields, milestones, signedIn, assistant }: Props) {
  const [today] = useState(localToday);
  const [view, setView] = useState<View>("today");
  const [weekMode, setWeekMode] = useState<"week" | "month">("week");
  const [weekOf, setWeekOf] = useState(() => weekStart(localToday()));
  const [monthOf, setMonthOf] = useState(() => monthStart(localToday()));
  const [selectedDay, setSelectedDay] = useState(localToday);
  const [own, setOwn] = useState<CalendarEntry[] | null>(signedIn ? null : []);
  const [lastWalk, setLastWalk] = useState<string | null | undefined>(signedIn ? undefined : null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<{ entry: CalendarEntry | null; preset?: Preset } | null>(null);

  const rangeFrom = useMemo(() => addDays(today, -90), [today]);
  const rangeTo = useMemo(() => addDays(today, 400), [today]);

  const load = useCallback(async () => {
    const r = await listCalendarEntriesAction(rangeFrom, rangeTo);
    if (r.status === "ok") { setOwn(r.entries); setLoadError(""); }
    else { setOwn([]); setLoadError(r.status === "not_signed_in" ? "" : "Your calendar couldn't be loaded just now."); }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void listCalendarEntriesAction(rangeFrom, rangeTo).then((r) => {
      if (!live) return;
      if (r.status === "ok") setOwn(r.entries);
      else { setOwn([]); if (r.status === "unavailable") setLoadError("Your calendar couldn't be loaded just now."); }
    });
    void listGrassSurveysAction().then((r) => {
      if (!live) return;
      const finished = r.ok ? r.surveys.map((s) => s.finishedAt).filter((d): d is string => Boolean(d)).sort() : [];
      setLastWalk(r.ok ? (finished.length ? new Date(finished[finished.length - 1]).toLocaleDateString("en-CA") : null) : undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [signedIn, rangeFrom, rangeTo]);

  const all = useMemo(() => [
    ...(own ?? []),
    ...closedPeriodEntries(county, rangeFrom, rangeTo),
    ...milestoneEntries(milestones ?? []),
  ].sort(compareEntries), [own, county, milestones, rangeFrom, rangeTo]);

  const assignees = useMemo(() => [...new Set((own ?? []).map((e) => e.assignee).filter((a): a is string => Boolean(a)))], [own]);
  const ribbon = activeSeasons(all, today);

  async function setStatus(e: CalendarEntry, next: CalendarStatus) {
    if (e.source !== "farmer") return;
    setOwn((list) => (list ?? []).map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    const r = await setCalendarEntryStatusAction(e.id, next);
    if (!r.ok) { setLoadError(r.error); void load(); }
  }

  const row: RowProps = {
    today,
    onOpen: (e: CalendarEntry) => (e.source === "farmer" ? setEditing({ entry: e }) : undefined),
    onToggle: (e: CalendarEntry) => void setStatus(e, e.status === "done" ? "planned" : "done"),
    onBook: (e: CalendarEntry) => void setStatus(e, "booked"),
  };
  const assistantCtx: PlanAssistantContext = {
    entries: all,
    today,
    lastWalk,
    signedIn,
    loading: own === null,
    addToPlan: (preset) => setEditing({ entry: null, preset }),
    setEntryStatus: (entryId, next) => {
      const e = (own ?? []).find((x) => x.id === entryId);
      if (e) void setStatus(e, next);
    },
  };

  return (
    <section aria-label="Farm calendar" className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
      <aside aria-label="Up next" className="mb-4 lg:sticky lg:top-6 lg:order-2 lg:mb-0">
        <UpNext all={all} loading={own === null} signedIn={signedIn} onMore={() => setView("season")} {...row} />
      </aside>

      <div className="min-w-0 space-y-4 lg:order-1">
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-4 rounded-[12px] border border-fr-v2-cream-rule bg-fr-v2-cream p-1 text-[13px] font-semibold" role="tablist" aria-label="Plan view">
            {VIEWS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
                className={cn("min-h-10 rounded-[9px] px-1 transition-colors", view === value ? "bg-white text-fr-v2-forest shadow-sm" : "text-fr-ink-600")}>{label}</button>
            ))}
          </div>
          {signedIn ? (
            <button type="button" onClick={() => setEditing({ entry: null })} aria-label="Add to calendar"
              className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-fr-green-700 text-white"><Plus className="size-5" /></button>
          ) : null}
        </div>
        {loadError ? <p role="alert" className="text-sm text-fr-risk">{loadError}</p> : null}
        {!signedIn ? <p className="text-xs text-fr-ink-600">Sign in to add your own jobs and appointments. Statutory dates are shown already.</p> : null}

        {view === "today" ? (
          <TodayView all={all} ribbon={ribbon} loading={own === null} {...row}
            signedIn={signedIn} assistant={assistant?.(assistantCtx)} />
        ) : null}
        {view === "week" ? (
          <>
            <div className="flex gap-1" role="radiogroup" aria-label="Calendar range">
              {(["week", "month"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={weekMode === m} onClick={() => setWeekMode(m)}
                  className={cn("min-h-9 rounded-full border px-3.5 text-xs font-semibold", weekMode === m ? "border-fr-v2-forest bg-fr-v2-forest text-white" : "border-fr-v2-cream-rule bg-white text-fr-ink-600")}>
                  {m === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
            {weekMode === "week" ? (
              <WeekView all={all} weekOf={weekOf} selectedDay={selectedDay} loading={own === null} ribbon={ribbon} signedIn={signedIn} {...row}
                setWeek={(w) => { setWeekOf(w); setSelectedDay(w <= today && today <= addDays(w, 6) ? today : w); }}
                setSelectedDay={setSelectedDay} />
            ) : (
              <MonthView all={all} monthOf={monthOf} setMonthOf={setMonthOf} selectedDay={selectedDay} setSelectedDay={setSelectedDay} {...row} />
            )}
          </>
        ) : null}
        {view === "season" ? <SeasonView all={all} {...row} /> : null}
        {view === "year" ? <YearView all={all} {...row} /> : null}
      </div>

      {editing ? (
        <EntrySheet
          entry={editing.entry}
          preset={editing.preset}
          defaultDate={view === "week" ? (selectedDay < today ? today : selectedDay) : today}
          fields={fields}
          assignees={assignees}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setOwn((list) => [...(list ?? []).filter((x) => x.id !== saved.id), ...(saved.status === "cancelled" ? [] : [saved])]);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

type RowProps = { onOpen: (e: CalendarEntry) => void; onToggle: (e: CalendarEntry) => void; onBook: (e: CalendarEntry) => void; today: string };

/** Tapping an entry: its own screen when it has one, the edit sheet for the farmer's own entries, otherwise nothing. */
function EntryTarget({ entry, onOpen, className, children }: { entry: CalendarEntry; onOpen: (e: CalendarEntry) => void; className?: string; children: ReactNode }) {
  if (entry.href) return <Link href={entry.href} className={className}>{children}</Link>;
  if (entry.source === "farmer") return <button type="button" onClick={() => onOpen(entry)} className={cn(className, "text-left")}>{children}</button>;
  return <div className={className}>{children}</div>;
}

/** Booking status for vet and contractor work; "Booked" for anything else the farmer marked booked. */
function BookingChip({ entry, onBook }: { entry: CalendarEntry; onBook?: (e: CalendarEntry) => void }) {
  const state = bookingState(entry) ?? (entry.status === "booked" ? "booked" : null);
  if (state === "booked") {
    return <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full bg-fr-green-100 px-2.5 text-[11.5px] font-semibold text-fr-green-700"><Check className="size-3.5" aria-hidden />Booked</span>;
  }
  if (state !== "not_booked") return null;
  if (entry.source === "farmer" && onBook) {
    return (
      <button type="button" onClick={() => onBook(entry)} aria-label={`Mark ${entry.title} booked`}
        className="min-h-9 shrink-0 rounded-full border border-dashed border-fr-v2-harvest-ink bg-fr-v2-harvest-tint px-3 text-[11.5px] font-semibold text-fr-v2-harvest-ink">
        Not booked · Mark booked
      </button>
    );
  }
  return <span className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-dashed border-fr-v2-harvest-ink bg-fr-v2-harvest-tint px-2.5 text-[11.5px] font-semibold text-fr-v2-harvest-ink">Not booked</span>;
}

function UpNext({ all, loading, signedIn, onMore, ...row }: RowProps & { all: CalendarEntry[]; loading: boolean; signedIn: boolean; onMore: () => void }) {
  const { items, more, needsBooking } = upNext(all, row.today);
  return (
    <div className="rounded-[16px] border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-display text-[20px] leading-none text-fr-v2-forest">Up next</p>
        {needsBooking ? (
          <span className="rounded-full bg-fr-v2-harvest-tint px-2.5 py-1 text-[11.5px] font-semibold text-fr-v2-harvest-ink">{needsBooking} to book</span>
        ) : null}
      </div>
      {loading ? <p className="text-sm text-fr-ink-600" role="status">Loading…</p> : items.length ? (
        <ul className="space-y-2">
          {items.map((e) => {
            const overdue = isOverdue(e, row.today);
            const day = e.startDate < row.today && !overdue ? row.today : overdue ? e.endDate : e.startDate;
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-[12px] bg-white p-2.5 shadow-fr-card">
                <span className={cn("grid w-11 shrink-0 place-items-center rounded-[10px] py-1 leading-none", overdue ? "bg-fr-risk-bg text-fr-risk" : "bg-fr-v2-cream text-fr-v2-forest")}
                  style={overdue ? undefined : { boxShadow: `inset 0 -3px 0 ${CATEGORY_COLOR[e.category]}` }} aria-hidden>
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em]">{day === row.today ? "Today" : fmt(day, { weekday: "short" })}</span>
                  <span className="mt-0.5 font-display text-[19px]">{Number(day.slice(8))}</span>
                </span>
                <EntryTarget entry={e} onOpen={row.onOpen} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fr-ink-900">{e.title}</span>
                  <span className={cn("mt-0.5 block truncate text-xs", overdue ? "font-semibold text-fr-risk" : "text-fr-ink-600")}>
                    {whenLabel(e, row.today)}{e.assignee ? ` · ${e.assignee}` : ""}
                  </span>
                </EntryTarget>
                <BookingChip entry={e} onBook={row.onBook} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-fr-ink-600">Nothing coming up.{signedIn ? " Add a job, vet visit or contractor with +." : ""}</p>
      )}
      {more ? (
        <button type="button" onClick={onMore} className="mt-2 min-h-10 w-full text-sm font-semibold text-fr-green-700">See {more} more in Season</button>
      ) : null}
    </div>
  );
}

function EntryRow({ entry, onOpen, onToggle, onBook, today }: RowProps & { entry: CalendarEntry }) {
  const done = entry.status === "done";
  const overdue = isOverdue(entry, today);
  const tickable = entry.source === "farmer" && entry.kind !== "season" && entry.kind !== "appointment";
  return (
    <li className={cn("flex items-center gap-3 border border-fr-v2-cream-rule bg-white py-2.5 pl-3 pr-3", done && "opacity-60")}
      style={{ borderLeft: `3px solid ${CATEGORY_COLOR[entry.category]}`, borderRadius: "0 12px 12px 0" }}>
      {tickable ? (
        <button type="button" onClick={() => onToggle(entry)} aria-label={done ? `Mark ${entry.title} not done` : `Mark ${entry.title} done`} aria-pressed={done}
          className={cn("grid size-7 shrink-0 place-items-center rounded-[8px] border-2", done ? "border-fr-green-700 bg-fr-green-700 text-white" : "border-fr-ink-400 text-transparent")}>
          <Check className="size-4" />
        </button>
      ) : entry.kind === "appointment" ? <Clock className="size-5 shrink-0" style={{ color: CATEGORY_COLOR[entry.category] }} aria-hidden />
        : <Flag className="size-5 shrink-0" style={{ color: CATEGORY_COLOR[entry.category] }} aria-hidden />}
      <EntryTarget entry={entry} onOpen={onOpen} className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-semibold text-fr-ink-900", done && "line-through")}>{entry.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fr-ink-600">
          <span className={cn(overdue && "font-semibold text-fr-risk")}>{whenLabel(entry, today)}</span>
          {entry.assignee ? <span className="inline-flex items-center gap-0.5"><User className="size-3" aria-hidden />{entry.assignee}</span> : null}
          {entry.source === "app" && entry.sourceNote ? <span className="text-fr-ink-400">{entry.sourceNote}</span> : null}
        </span>
      </EntryTarget>
      <BookingChip entry={entry} onBook={onBook} />
    </li>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">{children}</p>;
}

function EntryList({ label, entries, ...row }: RowProps & { label: ReactNode; entries: CalendarEntry[] }) {
  return <div><Label>{label}</Label><ul className="space-y-1.5">{entries.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul></div>;
}

function SeasonRibbon({ seasons }: { seasons: CalendarEntry[] }) {
  if (!seasons.length) return null;
  return (
    <div>
      <Label>Running now</Label>
      <div className="space-y-1">
        {seasons.map((s) => (
          <p key={s.id} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold" style={{ backgroundColor: tint(s.category, "1a"), color: CATEGORY_COLOR[s.category] }}>
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[s.category] }} aria-hidden />
            <span className="min-w-0 truncate">{s.title}</span>
            <span className="ml-auto shrink-0 font-normal">until {dayMonth(s.endDate)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function TodayView({ all, ribbon, loading, signedIn, assistant, ...row }: RowProps & {
  all: CalendarEntry[]; ribbon: CalendarEntry[]; loading: boolean; signedIn: boolean; assistant?: ReactNode;
}) {
  const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled");
  const overdue = items.filter((e) => isOverdue(e, row.today));
  const todays = items.filter((e) => overlaps(e, row.today, row.today));
  return (
    <div className="space-y-4">
      <p className="font-display text-[22px] leading-tight text-fr-ink-900">{fmt(row.today, { weekday: "long", day: "numeric", month: "long" })}</p>
      <SeasonRibbon seasons={ribbon} />
      {loading ? <p className="text-sm text-fr-ink-600" role="status">Loading…</p> : (
        <>
          {overdue.length ? <EntryList label="Overdue" entries={overdue} {...row} /> : null}
          {todays.length ? <EntryList label="Today" entries={todays} {...row} /> : null}
          {!overdue.length && !todays.length ? (
            <p className="rounded-[12px] border border-dashed border-fr-v2-cream-rule p-4 text-center text-sm text-fr-ink-600">No jobs are scheduled yet today.{signedIn ? " Tap + to add one." : ""}</p>
          ) : null}
        </>
      )}
      {assistant}
    </div>
  );
}

function WeekView({ all, weekOf, selectedDay, setWeek, setSelectedDay, loading, ribbon, signedIn, ...row }: RowProps & {
  all: CalendarEntry[]; weekOf: string; selectedDay: string; setWeek: (d: string) => void; setSelectedDay: (d: string) => void; loading: boolean;
  ribbon: CalendarEntry[]; signedIn: boolean;
}) {
  const end = addDays(weekOf, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
  const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled");
  const onDay = (d: string) => items.filter((e) => overlaps(e, d, d));
  const dayItems = onDay(selectedDay);
  const inThisWeek = weekOf <= row.today && row.today <= end;
  const overdue = inThisWeek ? items.filter((e) => isOverdue(e, row.today)) : [];
  const rest = items.filter((e) => isOpen(e) && overlaps(e, weekOf, end) && !overlaps(e, selectedDay, selectedDay) && !overdue.includes(e));
  const nothing = dayItems.length === 0 && rest.length === 0 && overdue.length === 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setWeek(addDays(weekOf, -7))} aria-label="Previous week" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronLeft className="size-5" /></button>
        <p className="text-sm font-semibold text-fr-ink-900">{inThisWeek ? "This week" : `${dayMonth(weekOf)} – ${dayMonth(end)}`}</p>
        <button type="button" onClick={() => setWeek(addDays(weekOf, 7))} aria-label="Next week" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronRight className="size-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 rounded-[14px] border border-fr-v2-cream-rule bg-white p-1" role="group" aria-label="Days">
        {days.map((d) => {
          const list = onDay(d);
          const selected = d === selectedDay;
          return (
            <button key={d} type="button" onClick={() => setSelectedDay(d)} aria-pressed={selected} aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}, ${list.length} entries`}
              className={cn("flex min-h-[64px] flex-col items-center rounded-[10px] pt-1.5", selected ? "bg-fr-v2-forest text-white" : d === row.today ? "bg-fr-v2-cream" : "")}>
              <span className={cn("text-[11px]", selected ? "text-white/80" : "text-fr-ink-600")}>{fmt(d, { weekday: "narrow" })}</span>
              <span className={cn("text-base", selected ? "text-white" : "text-fr-ink-900", d === row.today ? "font-bold" : "font-medium")}>{Number(d.slice(8))}</span>
              <span className="mt-1 flex h-1.5 gap-0.5">
                {list.slice(0, 3).map((e) => <span key={e.id} className={cn("size-1.5 rounded-full", selected && "ring-1 ring-white")} style={{ backgroundColor: CATEGORY_COLOR[e.category] }} />)}
              </span>
            </button>
          );
        })}
      </div>
      {inThisWeek ? <SeasonRibbon seasons={ribbon} /> : null}

      {loading ? <p className="text-sm text-fr-ink-600" role="status">Loading…</p> : (
        <>
          {overdue.length ? <EntryList label="Overdue" entries={overdue} {...row} /> : null}
          <div>
            <Label>{selectedDay === row.today ? "Today" : fmt(selectedDay, { weekday: "long", day: "numeric", month: "short" })}</Label>
            {dayItems.length ? <ul className="space-y-1.5">{dayItems.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul>
              : <p className="text-xs text-fr-ink-400">Nothing on this day.</p>}
          </div>
          {rest.length ? <EntryList label="Also this week" entries={rest} {...row} /> : null}
          {nothing ? <p className="rounded-[12px] border border-dashed border-fr-v2-cream-rule p-4 text-center text-sm text-fr-ink-600">No jobs are scheduled yet this week.{signedIn ? " Tap + to add one." : ""}</p> : null}
        </>
      )}
    </div>
  );
}

function HorizonBlock({ title, hint, horizon, ...row }: RowProps & { title: string; hint: string; horizon: Horizon }) {
  const empty = !horizon.entries.length && !horizon.transitions.length;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-fr-ink-900">{title}</p>
        <p className="text-xs text-fr-ink-600">{hint}</p>
      </div>
      {empty ? <p className="text-xs text-fr-ink-400">Nothing planned.</p> : (
        <ul className="space-y-1.5">
          {horizon.transitions.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-[12px] px-3 py-2" style={{ backgroundColor: tint(t.category, "14") }}>
              <Flag className="size-4 shrink-0" style={{ color: CATEGORY_COLOR[t.category] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: CATEGORY_COLOR[t.category] }}>{t.title}</span>
              <span className="shrink-0 text-xs text-fr-ink-600">{dayMonth(t.date)}</span>
            </li>
          ))}
          {horizon.entries.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}
        </ul>
      )}
    </div>
  );
}

interface Tick { date: string; label: ReactNode }

/**
 * Activity swim lanes over [from, to]. On phones each lane's name sits above
 * its track so the track gets the full width; from `sm` it sits alongside.
 */
function SwimLanes({ lanes, from, to, ticks, gridlines, all, title, ...row }: RowProps & {
  lanes: ActivityLaneRow[]; from: string; to: string; ticks: Tick[]; gridlines: string[]; all: CalendarEntry[]; title: string;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = pickedId ? all.find((e) => e.id === pickedId) ?? null : null;
  const span = daysBetween(from, to) + 1;
  const pctOf = (d: string) => (daysBetween(from, d) / span) * 100;
  const nowPct = row.today >= from && row.today <= to ? pctOf(row.today) : null;
  const nowLine = nowPct === null ? null : <span aria-hidden className="pointer-events-none absolute inset-y-0 w-[2px] bg-fr-v2-clay" style={{ left: `${nowPct}%` }} />;
  return (
    <div className="space-y-3">
      <div className="rounded-[16px] border border-fr-v2-cream-rule bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="font-display text-[18px] leading-none text-fr-ink-900">{title}</p>
          <p className="text-[11px] text-fr-ink-600">{dayMonth(from)} – {dayMonth(to)}</p>
        </div>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[104px_minmax(0,1fr)]">
          <span className="hidden sm:block" />
          <div className="relative h-4 text-[10.5px] text-fr-ink-600" aria-hidden>
            {ticks.map((t) => <span key={t.date} className="absolute top-0 whitespace-nowrap" style={{ left: `${pctOf(t.date)}%` }}>{t.label}</span>)}
          </div>
        </div>
        <div className="mt-1 space-y-2.5">
          {lanes.map((lane) => {
            const Icon = LANE_ICON[lane.lane];
            const color = ACTIVITY_LANE_COLOR[lane.lane];
            return (
              <div key={lane.lane} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[104px_minmax(0,1fr)]" role="group" aria-label={`${ACTIVITY_LANE_LABEL[lane.lane]} lane`}>
                <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold" style={{ color }}>
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{ACTIVITY_LANE_LABEL[lane.lane]}</span>
                </span>
                <div className="relative overflow-hidden rounded-[8px] bg-fr-v2-cream/70" style={{ height: `${lane.rows * 24 + 4}px` }}>
                  {gridlines.map((g) => <span key={g} aria-hidden className="absolute inset-y-0 w-px bg-fr-v2-cream-rule/70" style={{ left: `${pctOf(g)}%` }} />)}
                  {nowLine}
                  {!lane.bars.length ? <span className="absolute inset-0 flex items-center px-2 text-[10.5px] text-fr-ink-400">Nothing planned</span> : null}
                  {lane.bars.map((b) => {
                    const state = bookingState(b.entry);
                    const label = `${b.entry.title}, ${b.marker ? dayMonth(b.entry.startDate) : `${dayMonth(b.entry.startDate)} to ${dayMonth(b.entry.endDate)}`}${state === "not_booked" ? ", not booked" : state === "booked" ? ", booked" : ""}`;
                    return b.marker ? (
                      <button key={b.entry.id} type="button" onClick={() => setPickedId(b.entry.id)} aria-label={label}
                        className={cn("absolute top-[7px] size-3 rotate-45 rounded-[2px]", state === "not_booked" && "border border-dashed border-white")}
                        style={{ left: `calc(${b.startPct}% - 6px)`, backgroundColor: CATEGORY_COLOR[b.entry.category] }} />
                    ) : (
                      <button key={b.entry.id} type="button" onClick={() => setPickedId(b.entry.id)} aria-label={label}
                        className={cn("absolute flex h-5 items-center overflow-hidden rounded-[5px] px-1.5 text-left text-[10.5px] font-semibold", state === "not_booked" && "border border-dashed")}
                        style={{
                          top: `${b.row * 24 + 2}px`, left: `${b.startPct}%`, width: `${Math.max(2.5, b.endPct - b.startPct)}%`,
                          backgroundColor: tint(b.entry.category, b.entry.source === "app" ? "1f" : "33"), color: CATEGORY_COLOR[b.entry.category], borderColor: CATEGORY_COLOR[b.entry.category],
                          opacity: b.entry.status === "done" ? 0.55 : 1,
                        }}>
                        <span className="truncate">{b.entry.title.replace(/^Closed period: /, "Closed: ")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-fr-v2-cream-rule pt-2 text-[10.5px] text-fr-ink-600" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-fr-v2-clay" />Today</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rotate-45 bg-fr-ink-600" />Deadline or single day</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[3px] border border-dashed border-fr-ink-600" />Not booked yet</span>
        </div>
      </div>
      {picked ? (
        <div className="flex items-start gap-3 rounded-[12px] border border-fr-v2-cream-rule bg-white p-3">
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[picked.category] }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fr-ink-900">{picked.title}</p>
            <p className="text-xs text-fr-ink-600">{picked.startDate === picked.endDate ? dayMonth(picked.startDate) : `${dayMonth(picked.startDate)} – ${dayMonth(picked.endDate)}`}{picked.sourceNote ? ` · ${picked.sourceNote}` : ""}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <BookingChip entry={picked} onBook={row.onBook} />
              {picked.href ? <Link href={picked.href} className="text-xs font-semibold text-fr-green-700">Open</Link> : null}
              {picked.source === "farmer" ? <button type="button" onClick={() => row.onOpen(picked)} className="min-h-8 text-xs font-semibold text-fr-green-700">Edit</button> : null}
            </div>
          </div>
          <button type="button" onClick={() => setPickedId(null)} aria-label="Close" className="grid size-8 place-items-center text-fr-ink-600"><X className="size-4" /></button>
        </div>
      ) : null}
    </div>
  );
}

function monthStartsIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = monthStart(from) < from ? addMonths(from, 1) : from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

function SeasonView({ all, ...row }: RowProps & { all: CalendarEntry[] }) {
  const h = nowNextLater(all, row.today);
  const from = weekStart(row.today);
  const to = addDays(from, SEASON_WEEKS * 7 - 1);
  const lanes = activityLanes(all, from, to);
  const weeks = Array.from({ length: SEASON_WEEKS }, (_, i) => addDays(from, i * 7));
  // A label at every month start, plus one at the left edge unless a month starts within the first week;
  // none in the last week, where the label would run off the track.
  const starts = monthStartsIn(from, addDays(to, -7));
  const ticks = (starts[0] && starts[0] <= addDays(from, 6) ? starts : [from, ...starts]).map((d) => ({ date: d, label: fmt(d, { month: "short" }) }));
  return (
    <div className="space-y-5">
      <SwimLanes title="Next 12 weeks" lanes={lanes} from={from} to={to} ticks={ticks} gridlines={weeks.slice(1)} all={all} {...row} />
      <HorizonBlock title="Now" hint="This week" horizon={h.now} {...row} />
      <HorizonBlock title="Next" hint="Next 4 weeks" horizon={h.next} {...row} />
      <HorizonBlock title="Later" hint="Next 6 months" horizon={h.later} {...row} />
    </div>
  );
}

function YearView({ all, ...row }: RowProps & { all: CalendarEntry[] }) {
  const start = monthStart(row.today);
  const end = addDays(addMonths(start, 12), -1);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  const lanes = activityLanes(all, start, end, { minDays: 7 });
  const ticks = months.map((m) => ({
    date: m,
    label: <><span className="sm:hidden">{fmt(m, { month: "narrow" })}</span><span className="hidden sm:inline">{fmt(m, { month: "short" })}</span></>,
  }));
  return (
    <div className="space-y-4">
      <SwimLanes title="The farm year" lanes={lanes} from={start} to={end} ticks={ticks} gridlines={months.slice(1)} all={all} {...row} />
      {!all.some((e) => e.kind === "season" && e.source === "farmer") ? (
        <p className="text-xs text-fr-ink-600">Add a season with +, such as calving or housing, and it shows in its lane.</p>
      ) : null}
      {months.map((m) => {
        const mEnd = addDays(addMonths(m, 1), -1);
        const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled" && e.startDate >= m && e.startDate <= mEnd);
        if (!items.length) return null;
        return (
          <div key={m}>
            <Label>{fmt(m, { month: "long", year: "numeric" })}</Label>
            <ul className="space-y-1">
              {items.map((e) => {
                const state = bookingState(e);
                return (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} aria-hidden />
                    <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-fr-ink-600">{dayMonth(e.startDate)}</span>
                    <span className={cn("min-w-0 truncate text-fr-ink-900", e.status === "done" && "line-through opacity-60")}>{e.title}</span>
                    {state === "not_booked" ? <span className="shrink-0 text-[11px] font-semibold text-fr-v2-harvest-ink">Not booked</span>
                      : state === "booked" ? <span className="shrink-0 text-[11px] font-semibold text-fr-green-700">Booked</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ all, monthOf, setMonthOf, selectedDay, setSelectedDay, ...row }: RowProps & {
  all: CalendarEntry[]; monthOf: string; setMonthOf: (d: string) => void; selectedDay: string; setSelectedDay: (d: string) => void;
}) {
  const grid = monthGrid(monthOf);
  const dayItems = all.filter((e) => e.kind !== "season" && e.status !== "cancelled" && overlaps(e, selectedDay, selectedDay));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonthOf(addMonths(monthOf, -1))} aria-label="Previous month" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronLeft className="size-5" /></button>
        <p className="text-sm font-semibold text-fr-ink-900">{fmt(monthOf, { month: "long", year: "numeric" })}</p>
        <button type="button" onClick={() => setMonthOf(addMonths(monthOf, 1))} aria-label="Next month" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronRight className="size-5" /></button>
      </div>
      <div className="rounded-[14px] border border-fr-v2-cream-rule bg-white p-1.5">
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] font-semibold text-fr-ink-600">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled" && overlaps(e, d, d));
            const inMonth = d.slice(0, 7) === monthOf.slice(0, 7);
            return (
              <button key={d} type="button" onClick={() => setSelectedDay(d)} aria-pressed={d === selectedDay} aria-label={`${fmt(d, { day: "numeric", month: "long" })}, ${items.length} entries`}
                className={cn("flex min-h-12 flex-col items-center rounded-[8px] pt-1 text-xs", inMonth ? "text-fr-ink-900" : "text-fr-ink-400",
                  d === row.today && "bg-fr-v2-cream font-bold", d === selectedDay && "ring-2 ring-fr-v2-forest")}>
                <span>{Number(d.slice(8))}</span>
                <span className="mt-1 flex gap-0.5">{items.slice(0, 3).map((e) => <span key={e.id} className="size-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} />)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Label>{fmt(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</Label>
      {dayItems.length ? <ul className="space-y-1.5">{dayItems.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul> : <p className="text-xs text-fr-ink-400">Nothing on this day.</p>}
    </div>
  );
}

const inputClass = "mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-cream-rule bg-white px-3 text-base text-fr-ink-900";

function EntrySheet({ entry, preset, defaultDate, fields, assignees, onClose, onSaved }: {
  entry: CalendarEntry | null; preset?: Preset; defaultDate: string; fields: Props["fields"]; assignees: string[];
  onClose: () => void; onSaved: (e: CalendarEntry) => void;
}) {
  const [kind, setKind] = useState<CalendarKind>(entry?.kind ?? preset?.kind ?? "job");
  const [title, setTitle] = useState(entry?.title ?? preset?.title ?? "");
  const [category, setCategory] = useState<CalendarCategory>(entry?.category ?? preset?.category ?? "cattle");
  const [startDate, setStartDate] = useState(entry?.startDate ?? preset?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(entry?.endDate ?? preset?.endDate ?? addDays(preset?.startDate ?? defaultDate, 6));
  const [startTime, setStartTime] = useState(entry?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(entry?.endTime ?? "");
  const [status, setStatus] = useState<CalendarStatus>(entry?.status ?? "planned");
  const [assignee, setAssignee] = useState(entry?.assignee ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? preset?.notes ?? "");
  const [fieldIds, setFieldIds] = useState<string[]>(entry?.fieldIds ?? preset?.fieldIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [id] = useState(() => entry?.id ?? crypto.randomUUID());

  const single = kind === "appointment" || kind === "deadline";
  const booking = bookable(category);
  // New entries only offer a status when it's a booking; existing ones can also be marked done.
  const statuses: CalendarStatus[] = kind === "season" ? [] : entry ? ["planned", "booked", "done"] : booking ? ["planned", "booked"] : [];
  const statusLabel = (s: CalendarStatus) => (s === "planned" ? (booking ? "Not booked yet" : "Planned") : s === "booked" ? "Booked" : "Done");

  async function save(nextStatus = status) {
    setSaving(true);
    setError("");
    const r = await saveCalendarEntryAction({
      id, kind, category, title, startDate,
      endDate: single ? startDate : endDate,
      startTime: kind === "appointment" ? startTime : null,
      endTime: kind === "appointment" && endTime ? endTime : null,
      // A new entry switched away from vet/contractor keeps no hidden booking status.
      status: !entry && nextStatus !== "cancelled" && !statuses.includes(nextStatus) ? "planned" : nextStatus,
      assignee: assignee.trim() || null,
      notes: notes.trim() || null,
      fieldIds,
      // Editing keeps the existing link; a new entry carries its recommendation.
      sourceKey: entry ? undefined : preset?.sourceKey ?? null,
    });
    setSaving(false);
    if (r.ok) onSaved(r.entry);
    else setError(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={entry ? "Edit calendar entry" : "Add to calendar"}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[20px] bg-fr-v2-cream p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-[20px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[24px] leading-none">{entry ? "Edit" : "Add to calendar"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><X className="size-5" /></button>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-[12px] border border-fr-v2-cream-rule bg-white/60 p-1 text-[12.5px] font-semibold" role="radiogroup" aria-label="Kind">
          {(["job", "appointment", "deadline", "season"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn("min-h-10 rounded-[9px]", kind === k ? "bg-white text-fr-ink-900 shadow-sm" : "text-fr-ink-600")}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fr-ink-600">
          {kind === "job" ? "Something to get done within a window of days." : kind === "appointment" ? "A set time, such as a vet visit or contractor." : kind === "deadline" ? "A date something must be done by." : "A period of the farm year, such as calving or housing. It shows in its lane on the Season and Year views."}
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-fr-ink-900">Name
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={inputClass}
              placeholder={kind === "appointment" ? "Vet: TB test" : kind === "season" ? "Calving" : kind === "deadline" ? "Submit BISS application" : "Dose weanlings"} />
          </label>
          <label className="block text-xs font-semibold text-fr-ink-900">Category
            <select value={category} onChange={(e) => setCategory(e.target.value as CalendarCategory)} className={inputClass}>
              {CALENDAR_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-fr-ink-900">{single ? "Date" : "From"}
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} className={inputClass} />
            </label>
            {single ? null : (
              <label className="block text-xs font-semibold text-fr-ink-900">To
                <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </label>
            )}
            {kind === "appointment" ? (
              <>
                <label className="block text-xs font-semibold text-fr-ink-900">Starts
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-xs font-semibold text-fr-ink-900">Ends (optional)
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
                </label>
              </>
            ) : null}
          </div>
          {kind !== "season" ? (
            <label className="block text-xs font-semibold text-fr-ink-900">{category === "vet" ? "Vet (optional)" : category === "contractor" ? "Contractor (optional)" : "Who's doing it (optional)"}
              <input value={assignee} onChange={(e) => setAssignee(e.target.value)} maxLength={80} list="fr-calendar-assignees" className={inputClass} placeholder="You, family, worker or contractor" />
              <datalist id="fr-calendar-assignees">{assignees.map((a) => <option key={a} value={a} />)}</datalist>
            </label>
          ) : null}
          {fields.length && kind !== "season" ? (
            <div>
              <p className="text-xs font-semibold text-fr-ink-900">Fields (optional)</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {fields.map((f) => {
                  const on = fieldIds.includes(f.id);
                  return (
                    <button key={f.id} type="button" aria-pressed={on} onClick={() => setFieldIds((ids) => (on ? ids.filter((x) => x !== f.id) : [...ids, f.id]))}
                      className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold", on ? "border-fr-green-700 bg-fr-green-700 text-white" : "border-fr-v2-cream-rule bg-white text-fr-ink-600")}>{f.name}</button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {statuses.length ? (
            <div>
              <p className="text-xs font-semibold text-fr-ink-900">{booking ? "Booking" : "Status"}</p>
              <div className={cn("mt-1 grid gap-1 rounded-[12px] border border-fr-v2-cream-rule bg-white/60 p-1 text-[12.5px] font-semibold", statuses.length === 3 ? "grid-cols-3" : "grid-cols-2")}
                role="radiogroup" aria-label={booking ? "Booking" : "Status"}>
                {statuses.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)}
                    className={cn("min-h-10 rounded-[9px] px-1", status === s ? (s === "booked" ? "bg-fr-green-700 text-white" : "bg-white text-fr-ink-900 shadow-sm") : "text-fr-ink-600")}>{statusLabel(s)}</button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="block text-xs font-semibold text-fr-ink-900">Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className={cn(inputClass, "py-2")} />
          </label>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-fr-risk">{error}</p> : null}
        <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
        {entry ? (
          <button type="button" onClick={() => void save("cancelled")} disabled={saving} className="mt-2 min-h-11 w-full rounded-[12px] text-sm font-semibold text-fr-risk">Remove from calendar</button>
        ) : null}
      </div>
    </div>
  );
}
