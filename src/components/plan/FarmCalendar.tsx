"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Clock, Flag, Plus, Sparkles, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CALENDAR_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, KIND_LABEL,
  addDays, addMonths, closedPeriodEntries, compareEntries, daysBetween, isOpen, milestoneEntries, monthGrid, monthStart, overlaps, weekStart,
  type CalendarCategory, type CalendarEntry, type CalendarKind, type CalendarStatus,
} from "@/domain/farm-calendar";
import {
  activeSeasons, grassWalkSuggestion, isOverdue, nowNextLater, yearLanes,
  type CalendarSuggestion, type Horizon,
} from "@/domain/plan-views";
import { listCalendarEntriesAction, saveCalendarEntryAction, setCalendarEntryStatusAction } from "@/app/actions/calendar";
import { listGrassSurveysAction } from "@/app/actions/grass-surveys";

type View = "week" | "season" | "year" | "month";
const VIEWS: Array<[View, string]> = [["week", "Week"], ["season", "Season"], ["year", "Year"], ["month", "Month"]];

const localToday = () => new Date().toLocaleDateString("en-CA");
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", ...opts });
const dayMonth = (d: string) => fmt(d, { day: "numeric", month: "short" });
const tint = (c: CalendarCategory, alpha: string) => `${CATEGORY_COLOR[c]}${alpha}`;

function whenLabel(e: CalendarEntry, today: string): string {
  if (isOverdue(e, today)) return `Overdue since ${dayMonth(e.endDate)}`;
  if (e.kind === "appointment") return `${e.startDate === today ? "" : `${fmt(e.startDate, { weekday: "short", day: "numeric" })} · `}${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`;
  if (e.kind === "deadline") return `By ${fmt(e.startDate, { weekday: "short", day: "numeric", month: "short" })}`;
  if (e.startDate === e.endDate) return fmt(e.startDate, { weekday: "short", day: "numeric", month: "short" });
  return `${dayMonth(e.startDate)} – ${dayMonth(e.endDate)}`;
}

interface Preset { title: string; category: CalendarCategory; kind: CalendarKind }

interface Props {
  county: string | null | undefined;
  fields: ReadonlyArray<{ id: string; name: string }>;
  milestones: ReadonlyArray<{ groupId: string; groupLabel: string; targetDate: string; targetWeightKg?: number }> | null;
  signedIn: boolean;
  /** Suggestions the app has already worked out from the farm's own data. */
  suggestions?: CalendarSuggestion[];
  onOpenSuggestion?: (s: CalendarSuggestion) => void;
}

export function FarmCalendar({ county, fields, milestones, signedIn, suggestions = [], onOpenSuggestion }: Props) {
  const [today] = useState(localToday);
  const [view, setView] = useState<View>("week");
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

  const allSuggestions = useMemo(() => {
    const walk = lastWalk === undefined ? null : grassWalkSuggestion(lastWalk, today);
    return [...(walk ? [walk] : []), ...suggestions];
  }, [lastWalk, today, suggestions]);

  const assignees = useMemo(() => [...new Set((own ?? []).map((e) => e.assignee).filter((a): a is string => Boolean(a)))], [own]);
  const ribbon = activeSeasons(all, today);

  async function toggleDone(e: CalendarEntry) {
    if (e.source !== "farmer") return;
    const next: CalendarStatus = e.status === "done" ? "planned" : "done";
    setOwn((list) => (list ?? []).map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    const r = await setCalendarEntryStatusAction(e.id, next);
    if (!r.ok) { setLoadError(r.error); void load(); }
  }

  const row = {
    today,
    onOpen: (e: CalendarEntry) => (e.source === "farmer" ? setEditing({ entry: e }) : undefined),
    onToggle: toggleDone,
  };

  return (
    <section aria-label="Farm calendar" className="space-y-4">
      {ribbon.length ? (
        <div className="space-y-1">
          {ribbon.map((s) => (
            <p key={s.id} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold" style={{ backgroundColor: tint(s.category, "1a"), color: CATEGORY_COLOR[s.category] }}>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[s.category] }} aria-hidden />
              <span className="min-w-0 truncate">{s.title}</span>
              <span className="ml-auto shrink-0 font-normal">until {dayMonth(s.endDate)}</span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 rounded-[12px] bg-fr-surface-alt p-1 text-[13px] font-semibold" role="tablist" aria-label="Plan view">
          {VIEWS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
              className={cn("min-h-10 rounded-[9px] px-1", view === value ? "bg-white text-fr-ink-900 shadow-sm" : "text-fr-ink-600")}>{label}</button>
          ))}
        </div>
        {signedIn ? (
          <button type="button" onClick={() => setEditing({ entry: null })} aria-label="Add to calendar"
            className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-fr-green-700 text-white"><Plus className="size-5" /></button>
        ) : null}
      </div>
      {loadError ? <p role="alert" className="text-sm text-fr-red-700">{loadError}</p> : null}
      {!signedIn ? <p className="text-xs text-fr-ink-600">Sign in to add your own jobs and appointments. Statutory dates are shown already.</p> : null}

      {view === "week" ? (
        <WeekView all={all} weekOf={weekOf} selectedDay={selectedDay} loading={own === null} {...row}
          setWeek={(w) => { setWeekOf(w); setSelectedDay(w <= today && today <= addDays(w, 6) ? today : w); }}
          setSelectedDay={setSelectedDay}
          suggestions={allSuggestions} signedIn={signedIn} onOpenSuggestion={onOpenSuggestion}
          onAddSuggestion={(s) => setEditing({ entry: null, preset: { title: s.title, category: s.category, kind: s.kind } })} />
      ) : null}
      {view === "season" ? <SeasonView all={all} {...row} /> : null}
      {view === "year" ? <YearView all={all} today={today} /> : null}
      {view === "month" ? (
        <MonthView all={all} monthOf={monthOf} setMonthOf={setMonthOf} selectedDay={selectedDay} setSelectedDay={setSelectedDay} {...row} />
      ) : null}

      {editing ? (
        <EntrySheet
          entry={editing.entry}
          preset={editing.preset}
          defaultDate={view === "week" || view === "month" ? (selectedDay < today ? today : selectedDay) : today}
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

type RowProps = { onOpen: (e: CalendarEntry) => void; onToggle: (e: CalendarEntry) => void; today: string };

function EntryRow({ entry, onOpen, onToggle, today }: RowProps & { entry: CalendarEntry }) {
  const done = entry.status === "done";
  const overdue = isOverdue(entry, today);
  const tickable = entry.source === "farmer" && entry.kind !== "season" && entry.kind !== "appointment";
  const body = (
    <>
      <span className={cn("block truncate text-sm font-semibold text-fr-ink-900", done && "line-through")}>{entry.title}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fr-ink-600">
        <span className={cn(overdue && "font-semibold text-fr-red-700")}>{whenLabel(entry, today)}</span>
        {entry.status === "booked" ? <span className="font-semibold text-fr-green-700">Booked</span> : null}
        {entry.assignee ? <span className="inline-flex items-center gap-0.5"><User className="size-3" aria-hidden />{entry.assignee}</span> : null}
        {entry.source === "app" && entry.sourceNote ? <span className="text-fr-ink-400">{entry.sourceNote}</span> : null}
      </span>
    </>
  );
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
      {entry.href ? (
        <Link href={entry.href} className="min-w-0 flex-1">{body}</Link>
      ) : entry.source === "farmer" ? (
        <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 text-left">{body}</button>
      ) : <div className="min-w-0 flex-1">{body}</div>}
    </li>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">{children}</p>;
}

function SuggestionRow({ s, signedIn, onOpen, onAdd }: { s: CalendarSuggestion; signedIn: boolean; onOpen?: (s: CalendarSuggestion) => void; onAdd: (s: CalendarSuggestion) => void }) {
  const body = (
    <>
      <span className="block truncate text-sm font-semibold text-fr-ink-900">{s.title}</span>
      <span className="mt-0.5 line-clamp-1 text-xs text-fr-ink-600">{s.detail}</span>
    </>
  );
  return (
    <li className="flex items-center gap-3 rounded-[12px] border border-dashed border-fr-ink-400 px-3 py-2.5">
      <Sparkles className="size-5 shrink-0" style={{ color: CATEGORY_COLOR[s.category] }} aria-hidden />
      {s.href ? <Link href={s.href} className="min-w-0 flex-1">{body}</Link>
        : onOpen ? <button type="button" onClick={() => onOpen(s)} className="min-w-0 flex-1 text-left">{body}</button>
          : <div className="min-w-0 flex-1">{body}</div>}
      {signedIn ? (
        <button type="button" onClick={() => onAdd(s)} aria-label={`Add ${s.title} to calendar`}
          className="min-h-9 shrink-0 rounded-full bg-fr-surface-alt px-3 text-xs font-semibold text-fr-green-700">Add</button>
      ) : null}
    </li>
  );
}

function WeekView({ all, weekOf, selectedDay, setWeek, setSelectedDay, loading, suggestions, signedIn, onOpenSuggestion, onAddSuggestion, ...row }: RowProps & {
  all: CalendarEntry[]; weekOf: string; selectedDay: string; setWeek: (d: string) => void; setSelectedDay: (d: string) => void; loading: boolean;
  suggestions: CalendarSuggestion[]; signedIn: boolean; onOpenSuggestion?: (s: CalendarSuggestion) => void; onAddSuggestion: (s: CalendarSuggestion) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const end = addDays(weekOf, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
  const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled");
  const onDay = (d: string) => items.filter((e) => overlaps(e, d, d));
  const dayItems = onDay(selectedDay);
  const inThisWeek = weekOf <= row.today && row.today <= end;
  const overdue = inThisWeek ? items.filter((e) => isOverdue(e, row.today)) : [];
  const rest = items.filter((e) => isOpen(e) && overlaps(e, weekOf, end) && !overlaps(e, selectedDay, selectedDay) && !overdue.includes(e));
  const nothing = dayItems.length === 0 && rest.length === 0 && overdue.length === 0;
  const shown = showAll ? suggestions : suggestions.slice(0, 3);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setWeek(addDays(weekOf, -7))} aria-label="Previous week" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronLeft className="size-5" /></button>
        <p className="text-sm font-semibold text-fr-ink-900">{inThisWeek ? "This week" : `${dayMonth(weekOf)} – ${dayMonth(end)}`}</p>
        <button type="button" onClick={() => setWeek(addDays(weekOf, 7))} aria-label="Next week" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronRight className="size-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
        {days.map((d) => {
          const list = onDay(d);
          const selected = d === selectedDay;
          return (
            <button key={d} type="button" onClick={() => setSelectedDay(d)} aria-pressed={selected} aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}, ${list.length} entries`}
              className={cn("flex min-h-[64px] flex-col items-center rounded-[12px] pt-1.5", selected ? "border-2 border-fr-green-700 bg-white" : "border-2 border-transparent")}>
              <span className="text-[11px] text-fr-ink-600">{fmt(d, { weekday: "narrow" })}</span>
              <span className={cn("text-base text-fr-ink-900", d === row.today ? "font-bold" : "font-medium")}>{Number(d.slice(8))}</span>
              <span className="mt-1 flex h-1.5 gap-0.5">
                {list.slice(0, 3).map((e) => <span key={e.id} className="size-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} />)}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? <p className="text-sm text-fr-ink-600" role="status">Loading…</p> : (
        <>
          {overdue.length ? (
            <div><Label>Overdue</Label><ul className="space-y-1.5">{overdue.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul></div>
          ) : null}
          <div>
            <Label>{selectedDay === row.today ? "Today" : fmt(selectedDay, { weekday: "long", day: "numeric", month: "short" })}</Label>
            {dayItems.length ? <ul className="space-y-1.5">{dayItems.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul>
              : <p className="text-xs text-fr-ink-400">Nothing on this day.</p>}
          </div>
          {rest.length ? (
            <div><Label>Also this week</Label><ul className="space-y-1.5">{rest.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul></div>
          ) : null}
          {nothing ? <p className="rounded-[12px] border border-dashed border-fr-v2-cream-rule p-4 text-center text-sm text-fr-ink-600">No jobs are scheduled yet this week.{signedIn ? " Tap + to add one." : ""}</p> : null}
        </>
      )}

      {inThisWeek && suggestions.length ? (
        <div>
          <Label>Suggested</Label>
          <ul className="space-y-1.5">
            {shown.map((s) => <SuggestionRow key={s.id} s={s} signedIn={signedIn} onOpen={onOpenSuggestion} onAdd={onAddSuggestion} />)}
          </ul>
          {suggestions.length > 3 ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 min-h-10 w-full text-sm font-semibold text-fr-green-700">
              {showAll ? "Show fewer" : `Show ${suggestions.length - 3} more`}
            </button>
          ) : null}
        </div>
      ) : null}
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

function SeasonView({ all, ...row }: RowProps & { all: CalendarEntry[] }) {
  const h = nowNextLater(all, row.today);
  return (
    <div className="space-y-5">
      <HorizonBlock title="Now" hint="This week" horizon={h.now} {...row} />
      <HorizonBlock title="Next" hint="Next 4 weeks" horizon={h.next} {...row} />
      <HorizonBlock title="Later" hint="Next 6 months" horizon={h.later} {...row} />
    </div>
  );
}

function YearView({ all, today }: { all: CalendarEntry[]; today: string }) {
  const start = monthStart(today);
  const end = addDays(addMonths(start, 12), -1);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  const lanes = yearLanes(all, start, end);
  const [picked, setPicked] = useState<CalendarEntry | null>(null);
  const nowPct = (daysBetween(start, today) / (daysBetween(start, end) + 1)) * 100;
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-fr-v2-cream-rule bg-white p-3">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
          <span />
          <div className="grid grid-cols-12 text-center text-[10.5px] text-fr-ink-600">{months.map((m) => <span key={m}>{fmt(m, { month: "narrow" })}</span>)}</div>
        </div>
        {lanes.length ? (
          <div className="relative mt-2 space-y-2">
            {lanes.map((lane) => (
              <div key={lane.category} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
                <span className="truncate text-[11.5px] font-semibold" style={{ color: CATEGORY_COLOR[lane.category] }}>{CATEGORY_LABEL[lane.category].split(" ")[0]}</span>
                <div className="relative rounded-[6px] bg-fr-surface-alt" style={{ height: `${lane.rows * 22 + 4}px` }}>
                  {lane.bars.map((b) => b.marker ? (
                    <button key={b.entry.id} type="button" onClick={() => setPicked(b.entry)} aria-label={`${b.entry.title}, ${dayMonth(b.entry.startDate)}`}
                      className="absolute top-[5px] size-3 rotate-45" style={{ left: `calc(${b.startPct}% - 6px)`, backgroundColor: CATEGORY_COLOR[lane.category] }} />
                  ) : (
                    <button key={b.entry.id} type="button" onClick={() => setPicked(b.entry)}
                      className="absolute flex h-[18px] items-center overflow-hidden rounded-[4px] px-1.5 text-left text-[10.5px] font-semibold"
                      style={{ top: `${b.row * 22 + 2}px`, left: `${b.startPct}%`, width: `${Math.max(2.5, b.endPct - b.startPct)}%`, backgroundColor: tint(lane.category, b.entry.source === "app" ? "1f" : "33"), color: CATEGORY_COLOR[lane.category] }}
                      aria-label={`${b.entry.title}, ${dayMonth(b.entry.startDate)} to ${dayMonth(b.entry.endDate)}`}>
                      <span className="truncate">{b.entry.title.replace(/^Closed period: /, "Closed: ")}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[72px] right-0">
              <span className="absolute inset-y-0 w-[1.5px] bg-[#D85A30]" style={{ left: `${nowPct}%` }} />
            </div>
          </div>
        ) : <p className="py-4 text-center text-xs text-fr-ink-400">No seasons yet. Add one with +, such as calving or housing, and it shows here.</p>}
      </div>
      {picked ? (
        <div className="flex items-start gap-3 rounded-[12px] border border-fr-v2-cream-rule bg-white p-3">
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[picked.category] }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fr-ink-900">{picked.title}</p>
            <p className="text-xs text-fr-ink-600">{picked.startDate === picked.endDate ? dayMonth(picked.startDate) : `${dayMonth(picked.startDate)} – ${dayMonth(picked.endDate)}`}{picked.sourceNote ? ` · ${picked.sourceNote}` : ""}</p>
            {picked.href ? <Link href={picked.href} className="mt-1 inline-block text-xs font-semibold text-fr-green-700">Open</Link> : null}
          </div>
          <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="grid size-8 place-items-center text-fr-ink-600"><X className="size-4" /></button>
        </div>
      ) : null}
      {months.map((m) => {
        const mEnd = addDays(addMonths(m, 1), -1);
        const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled" && e.startDate >= m && e.startDate <= mEnd);
        if (!items.length) return null;
        return (
          <div key={m}>
            <Label>{fmt(m, { month: "long", year: "numeric" })}</Label>
            <ul className="space-y-1">
              {items.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} aria-hidden />
                  <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-fr-ink-600">{dayMonth(e.startDate)}</span>
                  <span className={cn("truncate text-fr-ink-900", e.status === "done" && "line-through opacity-60")}>{e.title}</span>
                </li>
              ))}
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
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-fr-ink-600">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled" && overlaps(e, d, d));
          const inMonth = d.slice(0, 7) === monthOf.slice(0, 7);
          return (
            <button key={d} type="button" onClick={() => setSelectedDay(d)} aria-pressed={d === selectedDay} aria-label={`${fmt(d, { day: "numeric", month: "long" })}, ${items.length} entries`}
              className={cn("flex min-h-12 flex-col items-center rounded-[8px] pt-1 text-xs", inMonth ? "text-fr-ink-900" : "text-fr-ink-400",
                d === selectedDay && "ring-2 ring-fr-green-700", d === row.today && "font-bold")}>
              <span>{Number(d.slice(8))}</span>
              <span className="mt-1 flex gap-0.5">{items.slice(0, 3).map((e) => <span key={e.id} className="size-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} />)}</span>
            </button>
          );
        })}
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
  const [startDate, setStartDate] = useState(entry?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(entry?.endDate ?? addDays(defaultDate, 6));
  const [startTime, setStartTime] = useState(entry?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(entry?.endTime ?? "");
  const [status, setStatus] = useState<CalendarStatus>(entry?.status ?? "planned");
  const [assignee, setAssignee] = useState(entry?.assignee ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [fieldIds, setFieldIds] = useState<string[]>(entry?.fieldIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [id] = useState(() => entry?.id ?? crypto.randomUUID());

  const single = kind === "appointment" || kind === "deadline";

  async function save(nextStatus = status) {
    setSaving(true);
    setError("");
    const r = await saveCalendarEntryAction({
      id, kind, category, title, startDate,
      endDate: single ? startDate : endDate,
      startTime: kind === "appointment" ? startTime : null,
      endTime: kind === "appointment" && endTime ? endTime : null,
      status: nextStatus,
      assignee: assignee.trim() || null,
      notes: notes.trim() || null,
      fieldIds,
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
        <div className="grid grid-cols-4 gap-1 rounded-[12px] bg-fr-surface-alt p-1 text-[12.5px] font-semibold" role="radiogroup" aria-label="Kind">
          {(["job", "appointment", "deadline", "season"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn("min-h-10 rounded-[9px]", kind === k ? "bg-white text-fr-ink-900 shadow-sm" : "text-fr-ink-600")}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fr-ink-600">
          {kind === "job" ? "Something to get done within a window of days." : kind === "appointment" ? "A set time, such as a vet visit or contractor." : kind === "deadline" ? "A date something must be done by." : "A period of the farm year, such as calving or housing. It shows as a lane on the Year view."}
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
            <label className="block text-xs font-semibold text-fr-ink-900">Who&apos;s doing it (optional)
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
          {entry && kind !== "season" ? (
            <label className="block text-xs font-semibold text-fr-ink-900">Status
              <select value={status} onChange={(e) => setStatus(e.target.value as CalendarStatus)} className={inputClass}>
                <option value="planned">Planned</option>
                <option value="booked">Booked</option>
                <option value="done">Done</option>
              </select>
            </label>
          ) : null}
          <label className="block text-xs font-semibold text-fr-ink-900">Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className={cn(inputClass, "py-2")} />
          </label>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-fr-red-700">{error}</p> : null}
        <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
        {entry ? (
          <button type="button" onClick={() => void save("cancelled")} disabled={saving} className="mt-2 min-h-11 w-full rounded-[12px] text-sm font-semibold text-fr-red-700">Remove from calendar</button>
        ) : null}
      </div>
    </div>
  );
}
