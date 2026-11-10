"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CALENDAR_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, KIND_LABEL,
  addDays, addMonths, closedPeriodEntries, compareEntries, daysBetween, isOpen, milestoneEntries, monthGrid, monthStart, overlaps, weekStart,
  type CalendarCategory, type CalendarEntry, type CalendarKind, type CalendarStatus,
} from "@/domain/farm-calendar";
import { listCalendarEntriesAction, saveCalendarEntryAction, setCalendarEntryStatusAction } from "@/app/actions/calendar";

type View = "week" | "season" | "year" | "calendar";
const VIEWS: Array<[View, string]> = [["week", "This week"], ["season", "Season"], ["year", "Year"], ["calendar", "Calendar"]];

const localToday = () => new Date().toLocaleDateString("en-CA");
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { timeZone: "UTC", ...opts });
const dayMonth = (d: string) => fmt(d, { day: "numeric", month: "short" });

function whenLabel(e: CalendarEntry): string {
  if (e.kind === "appointment") return `${fmt(e.startDate, { weekday: "short", day: "numeric", month: "short" })} · ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`;
  if (e.startDate === e.endDate) return fmt(e.startDate, { weekday: "short", day: "numeric", month: "short" });
  return `${dayMonth(e.startDate)} – ${dayMonth(e.endDate)}`;
}

interface Props {
  county: string | null | undefined;
  fields: ReadonlyArray<{ id: string; name: string }>;
  milestones: ReadonlyArray<{ groupId: string; groupLabel: string; targetDate: string; targetWeightKg?: number }> | null;
  signedIn: boolean;
}

export function FarmCalendar({ county, fields, milestones, signedIn }: Props) {
  const [today] = useState(localToday);
  const [view, setView] = useState<View>("week");
  const [weekOf, setWeekOf] = useState(() => weekStart(localToday()));
  const [monthOf, setMonthOf] = useState(() => monthStart(localToday()));
  const [selectedDay, setSelectedDay] = useState(localToday);
  const [own, setOwn] = useState<CalendarEntry[] | null>(signedIn ? null : []);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<CalendarEntry | "new" | null>(null);

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
    return () => { live = false; };
  }, [signedIn, rangeFrom, rangeTo]);

  const all = useMemo(() => [
    ...(own ?? []),
    ...closedPeriodEntries(county, rangeFrom, rangeTo),
    ...milestoneEntries(milestones ?? []),
  ].sort(compareEntries), [own, county, milestones, rangeFrom, rangeTo]);

  const assignees = useMemo(() => [...new Set((own ?? []).map((e) => e.assignee).filter((a): a is string => Boolean(a)))], [own]);

  async function toggleDone(e: CalendarEntry) {
    if (e.source !== "farmer") return;
    const next: CalendarStatus = e.status === "done" ? "planned" : "done";
    setOwn((list) => (list ?? []).map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    const r = await setCalendarEntryStatusAction(e.id, next);
    if (!r.ok) { setLoadError(r.error); void load(); }
  }

  const rowProps = { onOpen: (e: CalendarEntry) => (e.source === "farmer" ? setEditing(e) : undefined), onToggle: toggleDone, today };

  return (
    <section aria-label="Farm calendar" className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 rounded-[12px] bg-fr-surface-alt p-1 text-[13px] font-semibold" role="tablist">
          {VIEWS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
              className={cn("min-h-10 rounded-[9px] px-1", view === value ? "bg-white text-fr-ink-900 shadow-sm" : "text-fr-ink-600")}>{label}</button>
          ))}
        </div>
        {signedIn ? (
          <button type="button" onClick={() => setEditing("new")} aria-label="Add to calendar"
            className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-fr-green-700 text-white"><Plus className="size-5" /></button>
        ) : null}
      </div>
      {loadError ? <p role="alert" className="text-sm text-fr-red-700">{loadError}</p> : null}
      {!signedIn ? <p className="text-xs text-fr-ink-600">Sign in to add your own jobs and appointments. Statutory dates are shown below.</p> : null}

      {view === "week" ? <WeekView all={all} weekOf={weekOf} setWeekOf={setWeekOf} loading={own === null} {...rowProps} /> : null}
      {view === "season" ? <SeasonView all={all} {...rowProps} /> : null}
      {view === "year" ? <YearView all={all} today={today} /> : null}
      {view === "calendar" ? (
        <MonthView all={all} monthOf={monthOf} setMonthOf={setMonthOf} selectedDay={selectedDay} setSelectedDay={setSelectedDay} {...rowProps} />
      ) : null}

      {editing ? (
        <EntrySheet
          entry={editing === "new" ? null : editing}
          defaultDate={view === "calendar" ? selectedDay : today}
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

function EntryRow({ entry, onOpen, onToggle, compact }: { entry: CalendarEntry; onOpen: (e: CalendarEntry) => void; onToggle: (e: CalendarEntry) => void; today: string; compact?: boolean }) {
  const done = entry.status === "done";
  const tickable = entry.source === "farmer" && entry.kind !== "season";
  const body = (
    <>
      <span className="block truncate text-sm font-semibold text-fr-ink-900">{entry.title}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fr-ink-600">
        <span>{whenLabel(entry)}</span>
        {!compact ? <span style={{ color: CATEGORY_COLOR[entry.category] }}>{CATEGORY_LABEL[entry.category]}</span> : null}
        {entry.status === "booked" ? <span className="font-semibold text-fr-green-700">Booked</span> : null}
        {entry.assignee ? <span className="inline-flex items-center gap-0.5"><User className="size-3" aria-hidden />{entry.assignee}</span> : null}
        {entry.source === "app" && entry.sourceNote ? <span className="text-fr-ink-400">{entry.sourceNote}</span> : null}
      </span>
    </>
  );
  return (
    <li className={cn("flex items-center gap-3 rounded-[12px] border border-fr-v2-cream-rule bg-white px-3 py-2.5", done && "opacity-60")} style={{ borderLeft: `4px solid ${CATEGORY_COLOR[entry.category]}` }}>
      {tickable ? (
        <button type="button" onClick={() => onToggle(entry)} aria-label={done ? `Mark ${entry.title} not done` : `Mark ${entry.title} done`} aria-pressed={done}
          className={cn("grid size-7 shrink-0 place-items-center rounded-[8px] border-2", done ? "border-fr-green-700 bg-fr-green-700 text-white" : "border-fr-ink-400 text-transparent")}>
          <Check className="size-4" />
        </button>
      ) : <CalendarDays className="size-5 shrink-0 text-fr-ink-400" aria-hidden />}
      {entry.href ? (
        <Link href={entry.href} className={cn("min-w-0 flex-1", done && "line-through")}>{body}</Link>
      ) : entry.source === "farmer" ? (
        <button type="button" onClick={() => onOpen(entry)} className={cn("min-w-0 flex-1 text-left", done && "line-through")}>{body}</button>
      ) : <div className="min-w-0 flex-1">{body}</div>}
    </li>
  );
}

type RowProps = { onOpen: (e: CalendarEntry) => void; onToggle: (e: CalendarEntry) => void; today: string };

function SeasonBanner({ seasons }: { seasons: CalendarEntry[] }) {
  if (!seasons.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {seasons.map((s) => (
        <span key={s.id} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${CATEGORY_COLOR[s.category]}1f`, color: CATEGORY_COLOR[s.category] }}>
          {s.title} · to {dayMonth(s.endDate)}
        </span>
      ))}
    </div>
  );
}

function WeekView({ all, weekOf, setWeekOf, loading, ...row }: RowProps & { all: CalendarEntry[]; weekOf: string; setWeekOf: (d: string) => void; loading: boolean }) {
  const end = addDays(weekOf, 6);
  const inWeek = all.filter((e) => overlaps(e, weekOf, end));
  const seasons = inWeek.filter((e) => e.kind === "season");
  const items = inWeek.filter((e) => e.kind !== "season" && e.status !== "cancelled");
  const open = items.filter(isOpen);
  const done = items.filter((e) => e.status === "done");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setWeekOf(addDays(weekOf, -7))} aria-label="Previous week" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronLeft className="size-5" /></button>
        <p className="text-sm font-semibold text-fr-ink-900">{dayMonth(weekOf)} – {dayMonth(end)}</p>
        <button type="button" onClick={() => setWeekOf(addDays(weekOf, 7))} aria-label="Next week" className="grid size-10 place-items-center rounded-full text-fr-ink-600"><ChevronRight className="size-5" /></button>
      </div>
      <SeasonBanner seasons={seasons} />
      {loading ? <p className="text-sm text-fr-ink-600" role="status">Loading…</p> : open.length === 0 && done.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-fr-v2-cream-rule p-6 text-center text-sm text-fr-ink-600">No jobs are scheduled yet this week. Tap + to add one.</p>
      ) : (
        <ul className="space-y-2">{[...open, ...done].map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul>
      )}
    </div>
  );
}

function SeasonView({ all, ...row }: RowProps & { all: CalendarEntry[] }) {
  const start = weekStart(row.today);
  const end = addDays(start, 8 * 7 - 1);
  const seasons = all.filter((e) => e.kind === "season" && overlaps(e, start, end));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(start, i * 7));
  return (
    <div className="space-y-4">
      <p className="text-xs text-fr-ink-600">The next 8 weeks. Jobs that run across weeks show in the week they start.</p>
      <SeasonBanner seasons={seasons} />
      {weeks.map((w, i) => {
        const items = all.filter((e) => e.kind !== "season" && isOpen(e) && (i === 0 ? overlaps(e, w, addDays(w, 6)) : e.startDate >= w && e.startDate <= addDays(w, 6)));
        return (
          <div key={w}>
            <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">{i === 0 ? "This week" : `Week of ${dayMonth(w)}`}</p>
            {items.length ? <ul className="space-y-2">{items.map((e) => <EntryRow key={e.id} entry={e} {...row} />)}</ul> : <p className="text-xs text-fr-ink-400">Nothing planned.</p>}
          </div>
        );
      })}
    </div>
  );
}

function YearView({ all, today }: { all: CalendarEntry[]; today: string }) {
  const start = monthStart(today);
  const end = addDays(addMonths(start, 12), -1);
  const span = daysBetween(start, end) + 1;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  const bars = all.filter((e) => (e.kind === "season" || daysBetween(e.startDate, e.endDate) >= 14) && e.status !== "cancelled" && overlaps(e, start, end));
  const pct = (d: string) => Math.max(0, Math.min(100, (daysBetween(start, d < start ? start : d > end ? end : d) / span) * 100));
  const nowPct = pct(today);
  return (
    <div className="space-y-5">
      <div className="rounded-[14px] border border-fr-v2-cream-rule bg-white p-3">
        <div className="grid grid-cols-12 text-center text-[10px] text-fr-ink-600">{months.map((m) => <span key={m}>{fmt(m, { month: "narrow" })}</span>)}</div>
        <div className="relative mt-2 space-y-1.5">
          <div aria-hidden className="absolute inset-y-0 w-px bg-[#D85A30]" style={{ left: `${nowPct}%` }} />
          {bars.length ? bars.map((b) => (
            <div key={b.id} className="relative h-6">
              <div className="absolute inset-y-0 flex items-center overflow-hidden rounded-[6px] px-1.5 text-[10.5px] font-semibold"
                style={{ left: `${pct(b.startDate)}%`, width: `${Math.max(3, pct(b.endDate) - pct(b.startDate))}%`, backgroundColor: `${CATEGORY_COLOR[b.category]}26`, color: CATEGORY_COLOR[b.category] }}
                title={`${b.title}: ${dayMonth(b.startDate)} – ${dayMonth(b.endDate)}`}>
                <span className="truncate">{b.title}</span>
              </div>
            </div>
          )) : <p className="py-3 text-center text-xs text-fr-ink-400">No seasons or long jobs yet. Add a season, such as calving or housing.</p>}
        </div>
      </div>
      {months.map((m) => {
        const mEnd = addDays(addMonths(m, 1), -1);
        const items = all.filter((e) => e.kind !== "season" && e.status !== "cancelled" && e.startDate >= m && e.startDate <= mEnd);
        if (!items.length) return null;
        return (
          <div key={m}>
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">{fmt(m, { month: "long", year: "numeric" })}</p>
            <ul className="space-y-1">
              {items.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} aria-hidden />
                  <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-fr-ink-600">{dayMonth(e.startDate)}</span>
                  <span className={cn("truncate", e.status === "done" && "line-through opacity-60")}>{e.title}</span>
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
  const dayItems = all.filter((e) => e.status !== "cancelled" && overlaps(e, selectedDay, selectedDay));
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
          const inSeason = all.some((e) => e.kind === "season" && overlaps(e, d, d));
          const inMonth = d.slice(0, 7) === monthOf.slice(0, 7);
          return (
            <button key={d} type="button" onClick={() => setSelectedDay(d)} aria-pressed={d === selectedDay} aria-label={`${fmt(d, { day: "numeric", month: "long" })}, ${items.length} entries`}
              className={cn("flex min-h-12 flex-col items-center rounded-[8px] pt-1 text-xs", inMonth ? "text-fr-ink-900" : "text-fr-ink-400",
                inSeason && "bg-fr-surface-alt", d === selectedDay && "ring-2 ring-fr-green-700", d === row.today && "font-bold")}>
              <span>{Number(d.slice(8))}</span>
              <span className="mt-1 flex gap-0.5">{items.slice(0, 3).map((e) => <span key={e.id} className="size-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[e.category] }} />)}</span>
            </button>
          );
        })}
      </div>
      <p className="pt-1 text-sm font-semibold text-fr-ink-900">{fmt(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</p>
      {dayItems.length ? <ul className="space-y-2">{dayItems.map((e) => <EntryRow key={e.id} entry={e} compact {...row} />)}</ul> : <p className="text-xs text-fr-ink-400">Nothing on this day.</p>}
    </div>
  );
}

const inputClass = "mt-1 block min-h-11 w-full rounded-[10px] border border-fr-v2-cream-rule bg-white px-3 text-base text-fr-ink-900";

function EntrySheet({ entry, defaultDate, fields, assignees, onClose, onSaved }: {
  entry: CalendarEntry | null; defaultDate: string; fields: Props["fields"]; assignees: string[];
  onClose: () => void; onSaved: (e: CalendarEntry) => void;
}) {
  const [kind, setKind] = useState<CalendarKind>(entry?.kind ?? "job");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [category, setCategory] = useState<CalendarCategory>(entry?.category ?? "cattle");
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
          {kind === "job" ? "Something to get done within a window of days." : kind === "appointment" ? "A set time, such as a vet visit or contractor." : kind === "deadline" ? "A date something must be done by." : "A period of the farm year, such as calving or housing."}
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
